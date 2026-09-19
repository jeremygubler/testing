<?php
/**
 * Wer ist angemeldet.
 *
 * Diese Liste ist der eigentliche Grund, das Formular selbst zu betreiben: Sie
 * bleibt vollständig, auch wenn einmal keine Benachrichtigung ankommt.
 */
declare(strict_types=1);
require_once __DIR__ . '/_layout.php';
require_once __DIR__ . '/../inc/signup.php';
auth_require();

$rows = signup_all();

/* ── CSV für Excel & Co. ────────────────────────────────────────────────── */
if (isset($_GET['csv'])) {
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="anmeldungen-' . date('Y-m-d') . '.csv"');
    header('X-Content-Type-Options: nosniff');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");                       // damit Excel Umlaute erkennt
    fputcsv($out, ['Datum', 'Vorname', 'Name', 'E-Mail', 'Telefon', 'Geburtsdatum', 'Alter',
                   'Erziehungsberechtigt', 'Gesundheit', 'Fotos', 'Nachricht', 'Status'], ';');
    foreach ($rows as $r) {
        fputcsv($out, [
            date('d.m.Y H:i', (int)($r['ts'] ?? 0)),
            $r['vorname'] ?? '', $r['name'] ?? '', $r['email'] ?? '', $r['telefon'] ?? '',
            $r['geburtsdatum'] ?? '', $r['alter'] ?? '',
            trim(($r['gv_name'] ?? '') . ' ' . ($r['gv_email'] ?? '')),
            ($r['gesundheit'] ?? '') === 'ja' ? $r['gesundheit_text'] : 'keine',
            !empty($r['fotos']) ? 'ja' : 'nein',
            $r['nachricht'] ?? '', $r['status'] ?? '',
        ], ';');
    }
    fclose($out);
    exit;
}

/* ── Status setzen und löschen ──────────────────────────────────────────── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $id  = (string)($_POST['id'] ?? '');
    $tat = (string)($_POST['action'] ?? '');

    if ($tat === 'delete') {
        $neu = array_values(array_filter($rows, fn($r) => ($r['id'] ?? '') !== $id));
        flash(count($neu) === count($rows) ? 'Eintrag nicht gefunden.' : 'Anmeldung gelöscht.',
              count($neu) === count($rows) ? 'err' : 'ok');
        signup_save($neu);
    } elseif ($tat === 'status') {
        $wert = in_array($_POST['status'] ?? '', ['neu', 'bestaetigt', 'bezahlt'], true)
            ? $_POST['status'] : 'neu';
        foreach ($rows as &$r) if (($r['id'] ?? '') === $id) $r['status'] = $wert;
        unset($r);
        signup_save($rows);
        flash('Status gespeichert.');
    }
    header('Location: anmeldungen.php'); exit;
}

$labels = ['neu' => 'Neu', 'bestaetigt' => 'Bestätigt', 'bezahlt' => 'Bezahlt'];
$zahl   = ['neu' => 0, 'bestaetigt' => 0, 'bezahlt' => 0];
foreach ($rows as $r) { $s = $r['status'] ?? 'neu'; if (isset($zahl[$s])) $zahl[$s]++; }

admin_head('Anmeldungen');
admin_tabs('anmeldungen.php');
?>
<style>
  .an{border:1px solid var(--line);border-radius:10px;background:var(--ink-2);padding:1.1rem 1.25rem;margin-bottom:.9rem}
  .an__top{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:baseline;justify-content:space-between}
  .an__name{font-size:1.05rem;color:var(--white);font-weight:600}
  .an__when{color:#77777f;font-size:.82rem}
  .an dl{display:grid;grid-template-columns:auto 1fr;gap:.3rem .9rem;margin:.9rem 0 0;font-size:.92rem}
  .an dt{color:#77777f}
  .an dd{margin:0;color:var(--mute);overflow-wrap:anywhere}
  .an dd a{color:var(--gold-hi)}
  .warn{color:#f0b4b4}
  .pill{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;padding:.25rem .6rem;
    border-radius:99px;border:1px solid var(--line);color:var(--mute)}
  .pill--neu{border-color:#5a4a1e;color:var(--gold-hi)}
  .pill--bezahlt{border-color:#2f5c28;color:#b9e6ae}
  .an__act{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-top:1rem}
  .an__act select{background:var(--ink-3);border:1px solid var(--line);color:var(--white);
    border-radius:7px;padding:.45rem .6rem;font:inherit;font-size:.88rem}
  .sum{display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:1.5rem;color:var(--mute)}
  .sum b{color:var(--white);font-size:1.3rem;display:block}
</style>
<h1>Anmeldungen</h1>
<p class="sub">Die Liste liegt auf eurem Server — unabhängig davon, ob eine E-Mail ankam.</p>

<?php if (!$rows): ?>
  <div class="empty">Noch keine Anmeldungen.</div>
<?php else: ?>
  <div class="sum">
    <span><b><?= count($rows) ?></b>gesamt</span>
    <span><b><?= $zahl['neu'] ?></b>neu</span>
    <span><b><?= $zahl['bestaetigt'] ?></b>bestätigt</span>
    <span><b><?= $zahl['bezahlt'] ?></b>bezahlt</span>
    <span style="margin-left:auto"><a class="btn btn--ghost" href="anmeldungen.php?csv=1">Als CSV laden</a></span>
  </div>

  <?php foreach ($rows as $r): $st = $r['status'] ?? 'neu'; ?>
    <div class="an">
      <div class="an__top">
        <span class="an__name"><?= h(signup_name($r)) ?></span>
        <span class="pill pill--<?= h($st) ?>"><?= h($labels[$st] ?? $st) ?></span>
        <span class="an__when"><?= h(date('d.m.Y H:i', (int)($r['ts'] ?? 0))) ?></span>
      </div>
      <dl>
        <dt>E-Mail</dt><dd><a href="mailto:<?= h($r['email'] ?? '') ?>"><?= h($r['email'] ?? '') ?></a></dd>
        <dt>Telefon</dt><dd><a href="tel:<?= h(phone_href((string)($r['telefon'] ?? ''))) ?>"><?= h($r['telefon'] ?? '') ?></a></dd>
        <dt>Alter</dt><dd><?= h((string)($r['alter'] ?? '?')) ?> Jahre<?= !empty($r['gv_name']) ? ' — minderjährig' : '' ?></dd>
        <?php if (!empty($r['gv_name'])): ?>
          <dt>Erziehungsberechtigt</dt>
          <dd><?= h($r['gv_name']) ?> — <a href="mailto:<?= h($r['gv_email'] ?? '') ?>"><?= h($r['gv_email'] ?? '') ?></a></dd>
        <?php endif ?>
        <dt>Gesundheit</dt>
        <dd<?= ($r['gesundheit'] ?? '') === 'ja' ? ' class="warn"' : '' ?>><?=
          ($r['gesundheit'] ?? '') === 'ja' ? h($r['gesundheit_text'] ?? '') : 'keine Einschränkungen' ?></dd>
        <dt>Fotos</dt><dd><?= !empty($r['fotos']) ? 'einverstanden' : 'nicht einverstanden' ?></dd>
        <?php if (!empty($r['nachricht'])): ?>
          <dt>Nachricht</dt><dd><?= nl2br(h($r['nachricht'])) ?></dd>
        <?php endif ?>
      </dl>
      <div class="an__act">
        <form method="post" style="display:flex;gap:.5rem">
          <?= csrf_field() ?>
          <input type="hidden" name="action" value="status">
          <input type="hidden" name="id" value="<?= h($r['id'] ?? '') ?>">
          <select name="status" onchange="this.form.submit()">
            <?php foreach ($labels as $k => $l): ?>
              <option value="<?= h($k) ?>" <?= $st === $k ? 'selected' : '' ?>><?= h($l) ?></option>
            <?php endforeach ?>
          </select>
          <noscript><button class="btn btn--ghost" type="submit">Setzen</button></noscript>
        </form>
        <form method="post" onsubmit="return confirm('Diese Anmeldung endgültig löschen?')">
          <?= csrf_field() ?>
          <input type="hidden" name="action" value="delete">
          <input type="hidden" name="id" value="<?= h($r['id'] ?? '') ?>">
          <button class="btn btn--danger" type="submit">Löschen</button>
        </form>
      </div>
    </div>
  <?php endforeach ?>
<?php endif ?>
<?php admin_foot();
