<?php
/** Erzeugt Testbilder für die Browser-Tests. Aufruf: php tests/fixtures.php <zielwurzel> */
declare(strict_types=1);
$root = $argv[1] ?? dirname(__DIR__);
$dir  = $root . '/tests/tmp';
@mkdir($dir, 0775, true);

foreach ([1, 2] as $n) {
    $im = imagecreatetruecolor(1600, 1200);
    imagefill($im, 0, 0, imagecolorallocate($im, 20 * $n, 18, 16));
    for ($i = 0; $i < 20; $i++) {
        imagefilledellipse($im, random_int(0, 1600), random_int(0, 1200),
            random_int(80, 300), random_int(80, 300), imagecolorallocate($im, 201, 162, 39));
    }
    imagejpeg($im, "$dir/foto$n.jpg", 90);
    imagedestroy($im);
}

// Als Bild getarnte PHP-Datei — muss abgelehnt werden.
file_put_contents("$dir/getarnt.jpg", "<?php echo 'PWNED'; ?>\n");

// Echtes JPEG mit angehängtem Code — das Neuzeichnen muss ihn entfernen.
copy("$dir/foto1.jpg", "$dir/polyglott.jpg");
file_put_contents("$dir/polyglott.jpg", "<?php echo 'PWNED'; ?>", FILE_APPEND);

echo "Testbilder in $dir\n";
