<?php
/**
 * Bild-Uploads. Zwei Regeln tragen die Sicherheit:
 *  1. Es wird nie die hochgeladene Datei gespeichert, sondern ein mit GD neu
 *     erzeugtes Bild. Alles, was kein Bild ist — eingebetteter PHP-Code,
 *     manipulierte Metadaten — überlebt das Neuzeichnen nicht.
 *  2. Der Dateiname wird selbst vergeben, der Name des Uploads nie übernommen.
 */
declare(strict_types=1);

require_once __DIR__ . '/core.php';

const FF_MAX_UPLOAD = 6 * 1024 * 1024;   // 6 MB
const FF_MAX_EDGE   = 2000;              // px, längere Kante des Originals
const FF_THUMB_EDGE = 800;               // px, längere Kante der Galerie-Kachel

/** Dateiname der kleinen Fassung zu einem Galeriebild. */
function thumb_name(string $file): string {
    return preg_replace('/\.jpg$/', '-s.jpg', basename($file));
}

/** Kleine Fassung, falls vorhanden — sonst das Original. */
function thumb_or_full(string $file): string {
    $t = thumb_name($file);
    return is_file(FF_GALLERY . '/' . $t) ? $t : basename($file);
}

function gallery_items(): array {
    $items = json_read('gallery.json');
    return array_values(array_filter($items, fn($i) => is_array($i) && !empty($i['file'])
        && is_file(FF_GALLERY . '/' . basename($i['file']))));
}

function gallery_save(array $items): bool { return json_write('gallery.json', array_values($items)); }

/**
 * Nimmt einen Eintrag aus $_FILES entgegen und legt ein neu kodiertes JPEG ab.
 * Rückgabe: ['ok'=>true,'file'=>...] oder ['ok'=>false,'error'=>...]
 */
function media_store(array $file): array {
    $err = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($err === UPLOAD_ERR_NO_FILE) return ['ok' => false, 'error' => 'Keine Datei ausgewählt.'];
    if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
        return ['ok' => false, 'error' => 'Die Datei ist zu gross.'];
    }
    if ($err !== UPLOAD_ERR_OK) return ['ok' => false, 'error' => 'Upload fehlgeschlagen (Code ' . $err . ').'];

    $tmp = (string)($file['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) return ['ok' => false, 'error' => 'Ungültiger Upload.'];
    if (filesize($tmp) > FF_MAX_UPLOAD) {
        return ['ok' => false, 'error' => 'Maximal ' . (int)(FF_MAX_UPLOAD / 1024 / 1024) . ' MB pro Bild.'];
    }

    // Muss ein echtes Bild in einem der erlaubten Formate sein.
    $info = @getimagesize($tmp);
    if ($info === false) return ['ok' => false, 'error' => 'Das ist keine gültige Bilddatei.'];
    [$w, $h, $type] = $info;
    $allowed = [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP];
    if (!in_array($type, $allowed, true)) {
        return ['ok' => false, 'error' => 'Erlaubt sind JPG, PNG und WebP.'];
    }
    if ($w < 200 || $h < 200) return ['ok' => false, 'error' => 'Das Bild ist zu klein (mind. 200×200 px).'];
    if ($w * $h > 50_000_000) return ['ok' => false, 'error' => 'Die Bildauflösung ist zu hoch.'];

    $src = match ($type) {
        IMAGETYPE_JPEG => @imagecreatefromjpeg($tmp),
        IMAGETYPE_PNG  => @imagecreatefrompng($tmp),
        IMAGETYPE_WEBP => @imagecreatefromwebp($tmp),
    };
    if (!$src) return ['ok' => false, 'error' => 'Das Bild konnte nicht gelesen werden.'];

    // Verkleinern, damit keine 8-MB-Handyfotos ausgeliefert werden.
    $scale = min(1, FF_MAX_EDGE / max($w, $h));
    $nw = max(1, (int)round($w * $scale));
    $nh = max(1, (int)round($h * $scale));
    $dst = imagecreatetruecolor($nw, $nh);
    imagefill($dst, 0, 0, imagecolorallocate($dst, 10, 10, 10)); // Transparenz auf Schwarz
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    imagedestroy($src);

    if (!is_dir(FF_GALLERY) && !@mkdir(FF_GALLERY, 0775, true)) {
        imagedestroy($dst);
        return ['ok' => false, 'error' => 'Der Ordner assets/gallery konnte nicht angelegt werden.'];
    }
    $name = date('Ymd') . '-' . bin2hex(random_bytes(8)) . '.jpg';
    $ok = imagejpeg($dst, FF_GALLERY . '/' . $name, 82);
    if (!$ok) { imagedestroy($dst); return ['ok' => false, 'error' => 'Das Bild konnte nicht gespeichert werden.']; }
    @chmod(FF_GALLERY . '/' . $name, 0644);

    // Zusätzlich eine kleine Fassung: die Galerie zeigt Kacheln von rund 300px,
    // dafür das volle Bild zu laden ist auf dem Handy pure Verschwendung.
    if (max($nw, $nh) > FF_THUMB_EDGE) {
        $ts = FF_THUMB_EDGE / max($nw, $nh);
        $tw = max(1, (int)round($nw * $ts));
        $th = max(1, (int)round($nh * $ts));
        $thumb = imagecreatetruecolor($tw, $th);
        imagecopyresampled($thumb, $dst, 0, 0, 0, 0, $tw, $th, $nw, $nh);
        if (imagejpeg($thumb, FF_GALLERY . '/' . thumb_name($name), 78)) {
            @chmod(FF_GALLERY . '/' . thumb_name($name), 0644);
        }
        imagedestroy($thumb);
    }
    imagedestroy($dst);

    return ['ok' => true, 'file' => $name, 'w' => $nw, 'h' => $nh];
}

function media_delete(string $file): bool {
    $name = basename($file);
    $path = FF_GALLERY . '/' . $name;
    // Nur Dateien aus dem Galerie-Ordner, nie ein Pfad von aussen.
    if ($name === '' || !is_file($path) || dirname(realpath($path)) !== realpath(FF_GALLERY)) return false;
    @unlink(FF_GALLERY . '/' . thumb_name($name));   // kleine Fassung mit entfernen
    return @unlink($path);
}
