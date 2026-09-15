<?php
/**
 * Lädt alle Inhalte als ZIP herunter: die JSON-Dateien aus data/ und sämtliche
 * Bilder. Das ist alles, was bei einem Hoster-Ausfall verloren ginge — der Code
 * selbst liegt im Repository.
 */
declare(strict_types=1);
require_once __DIR__ . '/../inc/core.php';
require_once __DIR__ . '/../inc/media.php';
auth_require();

if (!class_exists('ZipArchive')) {
    flash('Der Server unterstützt keine ZIP-Dateien. Sichere data/ und assets/ stattdessen per FTP.', 'err');
    header('Location: index.php'); exit;
}

$tmp = tempnam(sys_get_temp_dir(), 'cmbk');
$zip = new ZipArchive();
if ($tmp === false || $zip->open($tmp, ZipArchive::OVERWRITE) !== true) {
    flash('Das Backup konnte nicht erstellt werden.', 'err');
    header('Location: index.php'); exit;
}

$count = 0;
foreach (glob(FF_DATA . '/*.json.php') ?: [] as $f) {
    // Passwort-Hash bleibt draussen: ein Backup wandert per Mail und Cloud herum.
    if (basename($f) === 'auth.json.php' || basename($f) === 'throttle.json.php') continue;
    $zip->addFile($f, 'data/' . basename($f));
    $count++;
}
foreach (glob(FF_GALLERY . '/*.jpg') ?: [] as $f) {
    $zip->addFile($f, 'assets/gallery/' . basename($f));
    $count++;
}
foreach (['coach.jpg', 'hero.jpg', 'og.jpg'] as $name) {
    $f = FF_ROOT . '/assets/' . $name;
    if (is_file($f)) { $zip->addFile($f, 'assets/' . $name); $count++; }
}
$zip->addFromString('LIESMICH.txt',
    "COMBAT MIND — Inhalts-Backup vom " . date('d.m.Y H:i') . "\r\n\r\n" .
    "Zum Zurückspielen die Ordner data/ und assets/ per FTP ins Web-Root hochladen\r\n" .
    "und bestehende Dateien überschreiben.\r\n\r\n" .
    "Nicht enthalten: das Admin-Passwort. Es bleibt beim Zurückspielen unverändert.\r\n");
$zip->close();

if ($count === 0) { @unlink($tmp); flash('Es gibt noch nichts zu sichern.', 'err'); header('Location: index.php'); exit; }

$name = 'combat-mind-backup-' . date('Y-m-d') . '.zip';
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $name . '"');
header('Content-Length: ' . filesize($tmp));
header('X-Content-Type-Options: nosniff');
readfile($tmp);
@unlink($tmp);
