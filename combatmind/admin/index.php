<?php
/** Login, Ersteinrichtung und Übersicht. */
declare(strict_types=1);
require_once __DIR__ . '/_layout.php';
require_once __DIR__ . '/../inc/media.php';
require_once __DIR__ . '/../inc/events.php';
require_once __DIR__ . '/../inc/signup.php';

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
    <h1>COMBAT MIND Admin einrichten</h1>
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
        if ($wait === 0 && auth_login((string)($_POST['pw'] ?? ''))) { header('Location: index.php'); exit; }
        $wait = auth_locked_for();
        if ($wait === 0) $err = 'Falsches Passwort.';
    }
    // Auch ohne Absendeversuch erklären, warum das Feld gesperrt ist — sonst
    // steht man vor einem grauen Formular ohne Grund.
    if ($wait > 0) $err = 'Zu viele Fehlversuche.';
    admin_head('Anmelden', false);
    ?>
    <h1>Anmelden</h1>
    <p class="sub">COMBAT MIND Admin</p>
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

/* ── Plätze: ein Klick je Anmeldung ──────────────────────────────────── */
// Tally meldet jede Anmeldung per E-Mail, mehr gibt der freie Tarif nicht her.
// Von Hand in die Textmaske zu steigen war zu umständlich, also wird die Zahl
// hier direkt gesetzt — und bei null schaltet die Seite selbst auf ausgebucht.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['seats'])) {
    csrf_check();
    $prog    = ff_content()['program'];
    $gesamt  = max(0, (int)$prog['seats_total']);
    $frei    = $prog['seats_left'] === '' ? $gesamt : max(0, (int)$prog['seats_left']);
    $neu     = max(0, min($gesamt, $frei + ($_POST['seats'] === 'plus' ? 1 : -1)));

    // Nur die beiden Felder anfassen, alles andere bleibt, wie es gespeichert ist.
    $saved = json_read('content.json');
    $saved['program'] = ($saved['program'] ?? []) + [];
    $saved['program']['seats_left'] = (string)$neu;
    $saved['program']['sold_out']   = $neu === 0;

    if (json_write('content.json', $saved)) {
        flash($neu === 0
            ? 'Letzter Platz vergeben — die Website zeigt jetzt «ausgebucht».'
            : 'Noch ' . $neu . ' von ' . $gesamt . ' Plätzen frei.');
    } else {
        flash('Konnte nicht gespeichert werden.', 'err');
    }
    header('Location: index.php'); exit;
}

/* ── Übersicht ───────────────────────────────────────────────────────── */
$c = ff_content();
$gesamt  = max(0, (int)$c['program']['seats_total']);
$gesetzt = $c['program']['seats_left'] !== '';
$frei    = $gesetzt ? max(0, (int)$c['program']['seats_left']) : $gesamt;
$upcoming = events_upcoming(3);
// Fällige Einträge verschwinden, sobald jemand den Admin öffnet. Auf
// öffentlichen Seiten passiert das bewusst nicht.
$weg = signup_purge();
if ($weg['anmeldungen'] || $weg['warteliste']) {
    $teile = [];
    if ($weg['anmeldungen']) $teile[] = $weg['anmeldungen'] . ' Anmeldung' . ($weg['anmeldungen'] === 1 ? '' : 'en');
    if ($weg['warteliste'])  $teile[] = $weg['warteliste'] . ' Wartelisten-Eintrag' . ($weg['warteliste'] === 1 ? '' : 'e');
    flash('Aufbewahrungsfrist abgelaufen: ' . implode(' und ', $teile) . ' gelöscht.');
}

$anm      = signup_all();
$neu      = count(array_filter($anm, fn($r) => ($r['status'] ?? 'neu') === 'neu'));
$wl       = count(waitlist_all());
$faellig  = signup_due_soon();
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
  <?php if ($faellig): ?>
    <div class="card" style="border-color:#5a4a1e;background:#221c0c">
      <h3 style="margin:0 0 .5rem;font-size:1rem;color:var(--gold-hi)">Bald gelöscht</h3>
      <p style="color:var(--mute);margin:0 0 1rem;font-size:.92rem">
        <strong style="color:var(--white)"><?= $faellig ?></strong>
        <?= $faellig === 1 ? 'Eintrag wird' : 'Einträge werden' ?> in den nächsten
        <?= FF_KEEP_WARN ?> Tagen automatisch gelöscht — die Aufbewahrungsfrist von
        <?= signup_keep_days() ?> Tagen läuft ab. Wenn du die Angaben behalten willst,
        lade sie vorher als CSV.</p>
      <a class="btn btn--ghost" href="anmeldungen.php?csv=1">Jetzt als CSV sichern</a>
    </div>
  <?php endif ?>
  <div class="card">
    <h3 style="margin:0 0 .5rem;font-size:1rem">Backup</h3>
    <p style="color:var(--mute);margin:0 0 1rem;font-size:.92rem">
      Alle Texte, Termine und Bilder als ZIP sichern — und im Notfall zurückholen.</p>
    <a class="btn btn--ghost" href="backup.php">Backup verwalten</a>
  </div>
  <div class="card">
    <h3 style="margin:0 0 .5rem;font-size:1rem">Plätze</h3>
    <p style="margin:0 0 .35rem;font-size:1rem">
      <strong style="color:var(--gold-hi);font-size:1.45rem"><?= $frei ?></strong>
      <span style="color:var(--mute)">von <?= $gesamt ?> frei</span>
      <?php if (!empty($c['program']['sold_out'])): ?>
        <span style="color:#f0b4b4">— ausgebucht</span>
      <?php endif ?>
    </p>
    <p style="color:var(--mute);margin:0 0 1rem;font-size:.92rem">
      <?php if ($gesetzt): ?>Nach jeder Anmeldung einen Klick. Bei null schaltet die
      Website von selbst auf ausgebucht.<?php else: ?>Die Anzeige auf der Website
      erscheint, sobald du hier zum ersten Mal klickst.<?php endif ?></p>
    <form method="post" style="display:flex;gap:.5rem;flex-wrap:wrap">
      <?= csrf_field() ?>
      <button class="btn" name="seats" value="minus" <?= $frei === 0 ? 'disabled' : '' ?>>
        Ein Platz vergeben</button>
      <button class="btn btn--ghost" name="seats" value="plus" <?= $frei >= $gesamt ? 'disabled' : '' ?>>
        Rückgängig</button>
    </form>
  </div>
  <div class="card">
    <h3 style="margin:0 0 .5rem;font-size:1rem">Anmeldungen</h3>
    <?php if (!empty($c['signup']['own'])): ?>
      <p style="color:var(--mute);margin:0 0 1rem;font-size:.92rem">
        <?= $anm ? '<strong style="color:var(--white)">' . count($anm) . '</strong> eingegangen, davon '
                 . $neu . ' unbearbeitet.' : 'Noch keine eingegangen.' ?>
        <?= $wl ? $wl . ' auf der Warteliste.' : '' ?></p>
      <a class="btn btn--ghost" href="anmeldungen.php">Anmeldungen ansehen</a>
    <?php else: ?>
      <p style="color:var(--mute);margin:0 0 1rem;font-size:.92rem">
        Die laufen über Tally. Die Benachrichtigung kommt an <?= h($c['contact']['email']) ?>.</p>
      <a class="btn btn--ghost" href="<?= h($c['contact']['form_url']) ?>" target="_blank" rel="noopener">Formular öffnen ↗</a>
    <?php endif ?>
  </div>
</div>
<?php admin_foot();
