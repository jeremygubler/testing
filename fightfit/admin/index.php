<?php
/** Login, Ersteinrichtung und Übersicht. */
declare(strict_types=1);
require_once __DIR__ . '/_layout.php';
require_once __DIR__ . '/../inc/media.php';
require_once __DIR__ . '/../inc/events.php';

/* ── Ersteinrichtung: Passwort setzen, solange keines existiert ───────── */
if (!auth_is_setup()) {
    $err = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        csrf_check();
        $pw = (string)($_POST['pw'] ?? '');
        $pw2 = (string)($_POST['pw2'] ?? '');
        if (mb_strlen($pw) < 10)      $err = 'Das Passwort muss mindestens 10 Zeichen haben.';
        elseif ($pw !== $pw2)         $err = 'Die beiden Passwörter stimmen nicht überein.';
        elseif (!auth_set_password($pw)) $err = 'Speichern fehlgeschlagen — ist der Ordner data/ beschreibbar?';
        else { auth_login($pw); flash('Passwort gesetzt. Willkommen im Admin.'); header('Location: index.php'); exit; }
    }
    admin_head('Einrichten', false);
    ?>
    <h1>FIGHTFIT Admin einrichten</h1>
    <p class="sub">Lege ein Passwort fest. Es wird nur als Hash gespeichert, nie im Klartext.</p>
    <?php if ($err): ?><div class="flash err"><?= h($err) ?></div><?php endif ?>
    <form method="post" class="card">
      <?= csrf_field() ?>
      <label><span class="lbl">Passwort</span>
        <input type="password" name="pw" required minlength="10" autocomplete="new-password" autofocus>
        <span class="hint">Mindestens 10 Zeichen. Nimm einen Satz, den nur du kennst.</span>
      </label>
      <label><span class="lbl">Passwort wiederholen</span>
        <input type="password" name="pw2" required minlength="10" autocomplete="new-password">
      </label>
      <button class="btn" type="submit">Passwort speichern</button>
    </form>
    <?php admin_foot(); exit;
}

/* ── Login ───────────────────────────────────────────────────────────── */
if (!auth_check()) {
    $err = '';
    $wait = auth_locked_for();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        csrf_check();
        if ($wait > 0)                      $err = 'Zu viele Fehlversuche.';
        elseif (auth_login((string)($_POST['pw'] ?? ''))) { header('Location: index.php'); exit; }
        else { $err = 'Falsches Passwort.'; $wait = auth_locked_for(); }
    }
    admin_head('Anmelden', false);
    ?>
    <h1>Anmelden</h1>
    <p class="sub">FIGHTFIT Admin</p>
    <?php if ($err): ?><div class="flash err"><?= h($err) ?><?= $wait > 0 ? ' Bitte in ' . ceil($wait / 60) . ' Minuten erneut versuchen.' : '' ?></div><?php endif ?>
    <form method="post" class="card">
      <?= csrf_field() ?>
      <label><span class="lbl">Passwort</span>
        <input type="password" name="pw" required autocomplete="current-password" autofocus <?= $wait > 0 ? 'disabled' : '' ?>>
      </label>
      <button class="btn" type="submit" <?= $wait > 0 ? 'disabled' : '' ?>>Anmelden</button>
    </form>
    <?php admin_foot(); exit;
}

/* ── Übersicht ───────────────────────────────────────────────────────── */
$c = ff_content();
$upcoming = events_upcoming(3);
$shots = gallery_items();
admin_head('Übersicht');
admin_tabs('index.php');
?>
<h1>Übersicht</h1>
<p class="sub">Alles, was du auf der Website ändern kannst.</p>

<div class="grid2">
  <div class="card">
    <h3 style="margin:0 0 .5rem;font-size:1rem">Texte</h3>
    <p style="color:var(--mute);margin:0 0 1rem;font-size:.92rem">
      Überschriften, Beschreibungen, Preise, Coach-Profil und Kontaktdaten.</p>
    <a class="btn btn--ghost" href="texte.php">Texte bearbeiten</a>
  </div>
  <div class="card">
    <h3 style="margin:0 0 .5rem;font-size:1rem">Galerie</h3>
    <p style="color:var(--mute);margin:0 0 1rem;font-size:.92rem">
      <?= count($shots) ?> <?= count($shots) === 1 ? 'Bild' : 'Bilder' ?> online.
      <?= $shots ? '' : 'Noch keine — die Galerie erscheint erst mit dem ersten Bild.' ?></p>
    <a class="btn btn--ghost" href="galerie.php">Fotos verwalten</a>
  </div>
  <div class="card">
    <h3 style="margin:0 0 .5rem;font-size:1rem">Termine</h3>
    <?php if ($upcoming): ?>
      <p style="color:var(--mute);margin:0 0 1rem;font-size:.92rem">Nächster:
        <strong style="color:var(--white)"><?= h($upcoming[0]['title']) ?></strong>
        am <?= h(date('d.m.Y', strtotime($upcoming[0]['date']))) ?></p>
    <?php else: ?>
      <p style="color:var(--mute);margin:0 0 1rem;font-size:.92rem">Keine kommenden Termine eingetragen.</p>
    <?php endif ?>
    <a class="btn btn--ghost" href="termine.php">Termine pflegen</a>
  </div>
  <div class="card">
    <h3 style="margin:0 0 .5rem;font-size:1rem">Anmeldungen</h3>
    <p style="color:var(--mute);margin:0 0 1rem;font-size:.92rem">
      Die laufen über Tally, nicht über diese Seite.</p>
    <a class="btn btn--ghost" href="<?= h($c['contact']['form_url']) ?>" target="_blank" rel="noopener">Formular öffnen ↗</a>
  </div>
</div>
<?php admin_foot();
