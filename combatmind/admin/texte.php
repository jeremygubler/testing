<?php
/** Schema-getriebenes Formular für alle Texte. */
declare(strict_types=1);
require_once __DIR__ . '/_layout.php';
require_once __DIR__ . '/../inc/media.php';
auth_require();

$schema = ff_schema();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $in = (array)($_POST['c'] ?? []);
    // Vom gespeicherten Stand ausgehen und nur überschreiben, was wirklich
    // mitgeschickt wurde. Ein unvollständiges Formular darf nie Inhalte leeren.
    $out = ff_content();
    foreach ($schema as $sec => $def) {
        if (!array_key_exists($sec, $in)) continue;
        $posted = (array)$in[$sec];
        if (isset($def['repeater'])) {
            $rows = [];
            foreach ($posted as $row) {
                if (!is_array($row)) continue;
                $clean = [];
                foreach ($def['fields'] as $key => $_) {
                    $clean[$key] = mb_substr(trim((string)($row[$key] ?? '')), 0, 400);
                }
                if (implode('', $clean) !== '') $rows[] = $clean;
            }
            $out[$sec] = $rows;
            continue;
        }
        foreach ($def['fields'] as $key => [$type, , ]) {
            if (!array_key_exists($key, $posted)) continue;
            $val = (string)$posted[$key];
            $out[$sec][$key] = match ($type) {
                'list' => array_values(array_filter(array_map('trim', preg_split('/\r?\n/', $val)), 'strlen')),
                'bool' => (bool)(int)$val,
                default => mb_substr(trim($val), 0, 4000),
            };
        }
    }

    // Zwei feste Bildplätze: Coach-Portrait und Hero-Hintergrund.
    foreach (['coach_photo' => ['coach', 'coach.jpg'], 'hero_photo' => ['hero', 'hero.jpg']] as $field => [$sec, $name]) {
        if (empty($_FILES[$field]['name'])) continue;
        $r = media_store($_FILES[$field]);
        if (!$r['ok']) { flash($r['error'], 'err'); header('Location: texte.php'); exit; }
        @rename(FF_GALLERY . '/' . $r['file'], FF_ROOT . '/assets/' . $name);
        $out[$sec]['photo'] = $name;
    }

    $saved = json_write('content.json', $out);
    flash($saved ? 'Gespeichert. Die Website ist aktualisiert.'
                 : 'Speichern fehlgeschlagen — ist der Ordner data/ beschreibbar?',
          $saved ? 'ok' : 'err');
    header('Location: texte.php'); exit;
}

$c = ff_content();
admin_head('Texte');
admin_tabs('texte.php');
?>
<h1>Texte</h1>
<p class="sub">Alles, was auf der Startseite steht. Leer gelassene Felder verschwinden von der Seite.</p>

<form method="post" enctype="multipart/form-data">
  <?= csrf_field() ?>
  <?php foreach ($schema as $sec => $def): ?>
    <h2><?= h($def['label']) ?></h2>

    <?php if (isset($def['repeater'])): ?>
      <?php foreach (($c[$sec] ?? []) as $i => $row): ?>
        <fieldset>
          <legend><?= h($def['repeater']) ?> <?= $i + 1 ?></legend>
          <div class="grid2">
            <?php foreach ($def['fields'] as $key => [$type, $label, ]): ?>
              <label><span class="lbl"><?= h($label) ?></span>
                <?php if ($type === 'textarea'): ?>
                  <textarea name="c[<?= h($sec) ?>][<?= $i ?>][<?= h($key) ?>]"><?= h((string)($row[$key] ?? '')) ?></textarea>
                <?php else: ?>
                  <input type="text" name="c[<?= h($sec) ?>][<?= $i ?>][<?= h($key) ?>]" value="<?= h((string)($row[$key] ?? '')) ?>">
                <?php endif ?>
              </label>
            <?php endforeach ?>
          </div>
        </fieldset>
      <?php endforeach ?>

    <?php else: ?>
      <fieldset>
        <?php foreach ($def['fields'] as $key => [$type, $label, ]):
          $val = $c[$sec][$key] ?? '';
          if ($type === 'list') $val = implode("\n", (array)$val); ?>
          <label><span class="lbl"><?= h($label) ?></span>
            <?php if ($type === 'bool'): ?>
              <?php /* Verstecktes Feld davor: ein nicht angehaktes Kästchen wird sonst
                       gar nicht mitgeschickt und der Wert bliebe unverändert. */ ?>
              <input type="hidden" name="c[<?= h($sec) ?>][<?= h($key) ?>]" value="0">
              <label style="display:flex;gap:.6rem;align-items:center;margin:0">
                <input type="checkbox" name="c[<?= h($sec) ?>][<?= h($key) ?>]" value="1"
                       style="width:auto" <?= $val ? 'checked' : '' ?>>
                <span style="color:var(--mute);font-size:.92rem">Ja</span>
              </label>
            <?php elseif ($type === 'textarea' || $type === 'list'): ?>
              <textarea name="c[<?= h($sec) ?>][<?= h($key) ?>]"><?= h((string)$val) ?></textarea>
              <?php if ($type === 'list'): ?><span class="hint">Eine Zeile = ein Eintrag.</span><?php endif ?>
              <?php if ($type === 'textarea'): ?><span class="hint">Leerzeile lässt einen neuen Absatz beginnen.</span><?php endif ?>
            <?php else: ?>
              <input type="text" name="c[<?= h($sec) ?>][<?= h($key) ?>]" value="<?= h((string)$val) ?>">
            <?php endif ?>
          </label>
        <?php endforeach ?>

        <?php if ($sec === 'hero'): ?>
          <label><span class="lbl">Hintergrundbild ersetzen</span>
            <input type="file" name="hero_photo" accept="image/jpeg,image/png,image/webp">
            <span class="hint">Querformat, mind. 1600px breit. Wird abgedunkelt hinter die Schrift gelegt. Ohne Bild bleibt der Hero schwarz.</span>
          </label>
          <?php if (!empty($c['hero']['photo']) && is_file(FF_ROOT . '/assets/' . basename($c['hero']['photo']))): ?>
            <img src="../assets/<?= h(basename($c['hero']['photo'])) ?>?v=<?= @filemtime(FF_ROOT . '/assets/' . basename($c['hero']['photo'])) ?>"
                 alt="Aktuelles Hero-Bild" style="max-width:260px;border-radius:8px;border:1px solid var(--line)">
          <?php endif ?>
        <?php endif ?>

        <?php if ($sec === 'coach'): ?>
          <label><span class="lbl">Foto von Jocelyn ersetzen</span>
            <input type="file" name="coach_photo" accept="image/jpeg,image/png,image/webp">
            <span class="hint">Hochformat wirkt am besten. Wird automatisch verkleinert und als assets/coach.jpg gespeichert.</span>
          </label>
          <?php if (!empty($c['coach']['photo']) && is_file(FF_ROOT . '/assets/' . basename($c['coach']['photo']))): ?>
            <img src="../assets/<?= h(basename($c['coach']['photo'])) ?>?v=<?= @filemtime(FF_ROOT . '/assets/' . basename($c['coach']['photo'])) ?>"
                 alt="Aktuelles Coach-Foto" style="max-width:170px;border-radius:8px;border:1px solid var(--line)">
          <?php endif ?>
        <?php endif ?>
      </fieldset>
    <?php endif ?>
  <?php endforeach ?>

  <div class="actions">
    <button class="btn" type="submit">Alles speichern</button>
    <a class="btn btn--ghost" href="../index.php" target="_blank" rel="noopener">Vorschau ↗</a>
  </div>
</form>
<?php admin_foot();
