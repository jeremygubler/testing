<?php
/** Fotos hochladen, beschriften, sortieren, löschen. */
declare(strict_types=1);
require_once __DIR__ . '/_layout.php';
require_once __DIR__ . '/../inc/media.php';
auth_require();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $items  = gallery_items();
    $action = (string)($_POST['action'] ?? '');

    if ($action === 'upload') {
        $files = $_FILES['photos'] ?? null;
        $added = 0; $errors = [];
        if ($files && is_array($files['name'])) {
            foreach (array_keys($files['name']) as $i) {
                if (($files['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) continue;
                $one = array_combine(array_keys($files), array_column($files, $i));
                $r = media_store($one);
                if ($r['ok']) { $items[] = ['file' => $r['file'], 'caption' => '']; $added++; }
                else { $errors[] = ($files['name'][$i] ?: 'Datei') . ': ' . $r['error']; }
            }
        }
        gallery_save($items);
        if ($added && !$errors)      flash($added . ' ' . ($added === 1 ? 'Bild' : 'Bilder') . ' hochgeladen.');
        elseif ($added && $errors)   flash($added . ' hochgeladen. ' . implode(' ', $errors), 'err');
        elseif ($errors)             flash(implode(' ', $errors), 'err');
        else                         flash('Keine Datei ausgewählt.', 'err');

    } elseif ($action === 'save') {
        $caps  = (array)($_POST['caption'] ?? []);
        $order = (array)($_POST['order'] ?? []);
        foreach ($items as $i => &$it) {
            $it['caption'] = mb_substr(trim((string)($caps[$i] ?? '')), 0, 200);
            $it['_o']      = (int)($order[$i] ?? $i);
        }
        unset($it);
        usort($items, fn($a, $b) => $a['_o'] <=> $b['_o']);
        foreach ($items as &$it) unset($it['_o']);
        unset($it);
        gallery_save($items);
        flash('Galerie gespeichert.');

    } elseif ($action === 'delete') {
        $file = basename((string)($_POST['file'] ?? ''));
        $items = array_values(array_filter($items, fn($i) => basename($i['file']) !== $file));
        gallery_save($items);
        $gone = media_delete($file);
        flash($gone ? 'Bild gelöscht.' : 'Bild konnte nicht gelöscht werden.', $gone ? 'ok' : 'err');
    }
    header('Location: galerie.php'); exit;
}

$items = gallery_items();
admin_head('Galerie');
admin_tabs('galerie.php');
?>
<h1>Galerie</h1>
<p class="sub">JPG, PNG oder WebP, bis 6 MB pro Bild. Grosse Bilder werden automatisch verkleinert.
Die Galerie erscheint auf der Website nur, wenn mindestens ein Bild da ist.</p>

<form method="post" enctype="multipart/form-data" class="card">
  <?= csrf_field() ?>
  <input type="hidden" name="action" value="upload">
  <label><span class="lbl">Fotos auswählen (mehrere möglich)</span>
    <input type="file" name="photos[]" accept="image/jpeg,image/png,image/webp" multiple required>
  </label>
  <button class="btn" type="submit">Hochladen</button>
</form>

<?php if (!$items): ?>
  <div class="empty">Noch keine Bilder. Lade das erste hoch — die Galerie erscheint dann automatisch auf der Startseite.</div>
<?php else: ?>
  <form method="post">
    <?= csrf_field() ?>
    <input type="hidden" name="action" value="save">
    <h2><?= count($items) ?> <?= count($items) === 1 ? 'Bild' : 'Bilder' ?></h2>
    <div class="shots">
      <?php foreach ($items as $i => $it): ?>
        <figure>
          <img src="../assets/gallery/<?= h(basename($it['file'])) ?>" alt="" loading="lazy">
          <div class="meta">
            <label><span class="lbl">Bildtext</span>
              <input type="text" name="caption[<?= $i ?>]" value="<?= h((string)($it['caption'] ?? '')) ?>" placeholder="optional">
            </label>
            <label><span class="lbl">Reihenfolge</span>
              <input type="text" inputmode="numeric" name="order[<?= $i ?>]" value="<?= $i ?>">
            </label>
          </div>
        </figure>
      <?php endforeach ?>
    </div>
    <div class="actions"><button class="btn" type="submit">Bildtexte &amp; Reihenfolge speichern</button></div>
  </form>

  <h2>Löschen</h2>
  <div class="rows">
    <?php foreach ($items as $it): ?>
      <form method="post" class="row" style="grid-template-columns:70px 1fr auto;align-items:center">
        <?= csrf_field() ?>
        <input type="hidden" name="action" value="delete">
        <input type="hidden" name="file" value="<?= h(basename($it['file'])) ?>">
        <img src="../assets/gallery/<?= h(basename($it['file'])) ?>" alt="" style="width:70px;aspect-ratio:1;object-fit:cover;border-radius:6px">
        <span style="color:var(--mute);font-size:.88rem;overflow:hidden;text-overflow:ellipsis">
          <?= h($it['caption'] ?: basename($it['file'])) ?></span>
        <button class="btn btn--danger" type="submit"
                onclick="return confirm('Dieses Bild endgültig löschen?')">Löschen</button>
      </form>
    <?php endforeach ?>
  </div>
<?php endif ?>
<?php admin_foot();
