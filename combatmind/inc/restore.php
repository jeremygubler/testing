<?php
/**
 * Ein heruntergeladenes Backup wieder einspielen.
 *
 * Ein hochgeladenes ZIP ist nichts als eine Wunschliste: Dateinamen und Inhalte
 * sind frei wählbar. Deshalb wird das Archiv nie einfach entpackt. Jeder Eintrag
 * muss zu genau einem erlaubten Ziel passen, und der Inhalt wird neu geschrieben
 * statt übernommen — JSON geht durch den Decoder, ein Bild nur nach Prüfung des
 * Bildkopfs. Was nicht passt, wird übergangen und gezählt, nicht erraten.
 */
declare(strict_types=1);

require_once __DIR__ . '/core.php';
require_once __DIR__ . '/media.php';

const FF_RESTORE_MAX_ENTRIES = 600;
const FF_RESTORE_MAX_BYTES   = 200 * 1024 * 1024;  // entpackt, gegen ZIP-Bomben

/**
 * Wohin ein Archiv-Eintrag geschrieben werden darf — oder null, wenn gar nicht.
 * Die einzige Stelle, die über Zieldateien entscheidet.
 */
function restore_target(string $entry): ?array {
    if ($entry === '' || str_contains($entry, "\0") || str_contains($entry, '\\')) return null;
    if (str_starts_with($entry, '/') || str_contains($entry, '..')) return null;

    if (preg_match('#^data/([a-z0-9_-]{1,40})\.json\.php$#', $entry, $m)) {
        // Passwort, Sperrliste und die echten Anmeldungen kommen niemals aus
        // einer hochgeladenen Datei.
        if (in_array($m[1], ['auth', 'throttle', 'signups', 'signup_rate'], true)) return null;
        return ['kind' => 'json', 'name' => $m[1] . '.json'];
    }
    if (preg_match('#^assets/gallery/([A-Za-z0-9][A-Za-z0-9._-]{0,59}\.jpg)$#', $entry, $m)) {
        return ['kind' => 'image', 'path' => FF_GALLERY . '/' . $m[1]];
    }
    if (preg_match('#^assets/(coach|hero|og)\.jpg$#', $entry, $m)) {
        return ['kind' => 'image', 'path' => FF_ROOT . '/assets/' . $m[1] . '.jpg'];
    }
    return null;
}

/**
 * Den jetzigen Textstand beiseitelegen, bevor er überschrieben wird. Bilder
 * bleiben aussen vor: sie tragen eindeutige Namen und werden ergänzt, nicht
 * ersetzt — kopieren würde nur den Speicher verdoppeln.
 */
function restore_safety_copy(): int {
    $dir = FF_DATA . '/vorher';
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) return 0;
    $n = 0;
    foreach (glob(FF_DATA . '/*.json.php') ?: [] as $f) {
        $base = basename($f);
        if ($base === 'auth.json.php' || $base === 'throttle.json.php') continue;
        if (@copy($f, $dir . '/' . $base)) $n++;
    }
    return $n;
}

/** Ein geprüftes Bild an seinen Platz schreiben. */
function restore_image(string $bytes, string $path): bool {
    if ($bytes === '' || strlen($bytes) > FF_MAX_UPLOAD) return false;
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) return false;

    $tmp = $dir . '/.restore-' . bin2hex(random_bytes(6)) . '.tmp';
    if (@file_put_contents($tmp, $bytes, LOCK_EX) === false) return false;

    $info = @getimagesize($tmp);
    if ($info === false || $info[2] !== IMAGETYPE_JPEG) { @unlink($tmp); return false; }

    if (!@rename($tmp, $path)) { @unlink($tmp); return false; }
    @chmod($path, 0644);
    return true;
}

/**
 * Das Archiv einspielen. Liefert einen Bericht statt einer Ausnahme, damit die
 * Oberfläche zeigen kann, was durchkam und was nicht.
 */
function restore_apply(string $zipPath): array {
    $bericht = ['ok' => false, 'texte' => 0, 'bilder' => 0, 'uebergangen' => 0, 'fehler' => []];

    if (!class_exists('ZipArchive')) {
        $bericht['fehler'][] = 'Der Server kann keine ZIP-Dateien lesen.';
        return $bericht;
    }
    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) {
        $bericht['fehler'][] = 'Die Datei ist kein lesbares ZIP-Archiv.';
        return $bericht;
    }
    if ($zip->numFiles > FF_RESTORE_MAX_ENTRIES) {
        $zip->close();
        $bericht['fehler'][] = 'Das Archiv enthält zu viele Dateien (' . $zip->numFiles . ').';
        return $bericht;
    }

    // Entpackte Gesamtgrösse vorab prüfen, nicht erst beim Schreiben.
    $gesamt = 0;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $st = $zip->statIndex($i);
        $gesamt += (int)($st['size'] ?? 0);
    }
    if ($gesamt > FF_RESTORE_MAX_BYTES) {
        $zip->close();
        $bericht['fehler'][] = 'Das Archiv ist entpackt zu gross.';
        return $bericht;
    }

    $ziele = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = (string)($zip->statIndex($i)['name'] ?? '');
        if (str_ends_with($name, '/')) continue;                 // Ordnereintrag
        if ($name === 'LIESMICH.txt') continue;                  // unser eigener Zettel
        $ziel = restore_target($name);
        if ($ziel === null) { $bericht['uebergangen']++; continue; }
        $ziele[] = [$i, $name, $ziel];
    }
    if ($ziele === []) {
        $zip->close();
        $bericht['fehler'][] = 'Im Archiv steckt nichts, was zu dieser Website gehört.';
        return $bericht;
    }

    restore_safety_copy();

    foreach ($ziele as [$i, $name, $ziel]) {
        $bytes = $zip->getFromIndex($i);
        if ($bytes === false) { $bericht['fehler'][] = $name . ': nicht lesbar.'; continue; }

        if ($ziel['kind'] === 'json') {
            $roh = $bytes;
            if (str_starts_with($roh, '<?php')) {
                $nl  = strpos($roh, "\n");
                $roh = $nl === false ? '' : substr($roh, $nl + 1);
            }
            $daten = json_decode($roh, true);
            if (!is_array($daten)) { $bericht['fehler'][] = $name . ': kein gültiger Inhalt.'; continue; }
            if (json_write($ziel['name'], $daten)) $bericht['texte']++;
            else $bericht['fehler'][] = $name . ': konnte nicht geschrieben werden.';
        } else {
            if (restore_image($bytes, $ziel['path'])) $bericht['bilder']++;
            else $bericht['fehler'][] = $name . ': kein gültiges JPEG.';
        }
    }
    $zip->close();

    ff_content(true);                       // zwischengespeicherte Texte verwerfen
    $bericht['ok'] = $bericht['texte'] + $bericht['bilder'] > 0;
    return $bericht;
}
