<?php
/** Termine: Datum, Zeit, Titel, Notiz. Vergangene fallen auf der Website weg. */
declare(strict_types=1);
require_once __DIR__ . '/_layout.php';
require_once __DIR__ . '/../inc/events.php';
auth_require();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    // Der Löschen-Knopf schickt die Zeilennummer mit. Gespeichert wird dabei
    // alles andere ganz normal mit — so geht keine nebenbei getippte Änderung
    // verloren.
    $weg  = isset($_POST['remove']) ? (string)$_POST['remove'] : null;
    $rows = [];
    foreach ((array)($_POST['ev'] ?? []) as $k => $r) {
        if ($weg !== null && (string)$k === $weg) continue;
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
    flash($saved ? ($weg !== null ? 'Termin gelöscht.' : 'Termine gespeichert.') : 'Speichern fehlgeschlagen.',
          $saved ? 'ok' : 'err');
    header('Location: termine.php'); exit;
}

$rows = events_all();
$today = date('Y-m-d');
admin_head('Termine');
admin_tabs('termine.php');
?>
<h1>Termine</h1>
<p class="sub">Erscheinen als Liste auf der Startseite — die nächsten sechs, chronologisch.
Vergangene Termine verschwinden dort von selbst; löschen musst du sie nur, wenn du
sie auch hier nicht mehr sehen willst. Änderungen werden erst mit
«Termine speichern» übernommen.</p>

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
        <span style="display:flex;gap:.7rem;align-items:center;white-space:nowrap">
          <span style="color:<?= $r['date'] < $today ? '#77777f' : 'var(--gold)' ?>;font-size:.78rem">
            <?php /* Ausgeschrieben, damit ein im Kalender verklickter Monat auffällt. */ ?>
            <?= h(event_weekday($r['date']) . ', ' . event_day($r['date']) . '. '
                  . event_month($r['date']) . ' ' . event_year($r['date'])) ?><br>
            <?= $r['date'] < $today ? 'vorbei' : 'kommt' ?></span>
          <button class="btn btn--danger" type="submit" name="remove" value="<?= $i ?>"
                  style="padding:.45rem .8rem;font-size:.82rem"
                  onclick="return confirm('Termin «<?= h(addslashes($r['title'])) ?>» löschen?')">Löschen</button>
        </span>
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
      <span style="display:flex;gap:.7rem;align-items:center;white-space:nowrap">
        <span style="color:var(--gold);font-size:.78rem">neu</span>
        <button class="btn btn--danger" type="button" style="padding:.45rem .8rem;font-size:.82rem"
                onclick="this.closest('.row').remove()">Entfernen</button>
      </span>`;
    document.getElementById("rows").appendChild(row);
    row.querySelector("input").focus();
    n++;
  });
})();
</script>
<?php admin_foot();
