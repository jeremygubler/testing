<?php
/** Termine: Datum, Zeit, Titel, Notiz. Vergangene fallen auf der Website weg. */
declare(strict_types=1);
require_once __DIR__ . '/_layout.php';
require_once __DIR__ . '/../inc/events.php';
auth_require();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $rows = [];
    foreach ((array)($_POST['ev'] ?? []) as $r) {
        if (!is_array($r)) continue;
        $date = trim((string)($r['date'] ?? ''));
        $title = mb_substr(trim((string)($r['title'] ?? '')), 0, 160);
        // Ohne gültiges Datum und Titel ist die Zeile leer und fliegt raus.
        $d = DateTime::createFromFormat('Y-m-d', $date);
        if (!$d || $d->format('Y-m-d') !== $date || $title === '') continue;
        $time = trim((string)($r['time'] ?? ''));
        if ($time !== '' && !preg_match('/^\d{1,2}:\d{2}(\s*[–-]\s*\d{1,2}:\d{2})?$/u', $time)) $time = '';
        $rows[] = [
            'date'  => $date,
            'time'  => mb_substr($time, 0, 20),
            'title' => $title,
            'note'  => mb_substr(trim((string)($r['note'] ?? '')), 0, 200),
        ];
    }
    $saved = events_save($rows);
    flash($saved ? 'Termine gespeichert.' : 'Speichern fehlgeschlagen.', $saved ? 'ok' : 'err');
    header('Location: termine.php'); exit;
}

$rows = events_all();
$today = date('Y-m-d');
admin_head('Termine');
admin_tabs('termine.php');
?>
<h1>Termine</h1>
<p class="sub">Erscheinen als Liste auf der Startseite — die nächsten sechs, chronologisch.
Vergangene Termine verschwinden automatisch, du musst nichts löschen.
Eine Zeile ohne Datum oder Titel wird beim Speichern verworfen.</p>

<form method="post">
  <?= csrf_field() ?>
  <div class="rows" id="rows">
    <?php $i = 0; foreach ($rows as $r): ?>
      <div class="row">
        <label><span class="lbl">Datum</span>
          <input type="date" name="ev[<?= $i ?>][date]" value="<?= h($r['date']) ?>"></label>
        <label><span class="lbl">Zeit</span>
          <input type="text" name="ev[<?= $i ?>][time]" value="<?= h((string)($r['time'] ?? '')) ?>" placeholder="12:00–13:00"></label>
        <label><span class="lbl">Titel</span>
          <input type="text" name="ev[<?= $i ?>][title]" value="<?= h($r['title']) ?>"></label>
        <label><span class="lbl">Notiz</span>
          <input type="text" name="ev[<?= $i ?>][note]" value="<?= h((string)($r['note'] ?? '')) ?>" placeholder="optional"></label>
        <span style="color:<?= $r['date'] < $today ? '#77777f' : 'var(--gold)' ?>;font-size:.78rem;white-space:nowrap">
          <?= $r['date'] < $today ? 'vorbei' : 'kommt' ?></span>
      </div>
    <?php $i++; endforeach ?>
  </div>

  <div class="actions">
    <button class="btn btn--ghost" type="button" id="add">+ Termin hinzufügen</button>
    <button class="btn" type="submit">Termine speichern</button>
  </div>
</form>

<script>
(() => {
  let n = <?= (int)count($rows) ?>;
  document.getElementById("add").addEventListener("click", () => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <label><span class="lbl">Datum</span><input type="date" name="ev[${n}][date]"></label>
      <label><span class="lbl">Zeit</span><input type="text" name="ev[${n}][time]" placeholder="12:00–13:00"></label>
      <label><span class="lbl">Titel</span><input type="text" name="ev[${n}][title]"></label>
      <label><span class="lbl">Notiz</span><input type="text" name="ev[${n}][note]" placeholder="optional"></label>
      <span style="color:var(--gold);font-size:.78rem">neu</span>`;
    document.getElementById("rows").appendChild(row);
    row.querySelector("input").focus();
    n++;
  });
})();
</script>
<?php admin_foot();
