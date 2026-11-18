<?php
/** Sitemap für Suchmaschinen. Unter /sitemap.xml erreichbar (siehe .htaccess). */
declare(strict_types=1);
require __DIR__ . '/inc/core.php';
require __DIR__ . '/inc/schema.php';

header('Content-Type: application/xml; charset=utf-8');

$pages = [
    ''                 => ['1.0', 'weekly'],
    'agb.php'          => ['0.3', 'yearly'],
    'datenschutz.php'  => ['0.3', 'yearly'],
    'impressum.php'    => ['0.3', 'yearly'],
];

echo '<?xml version="1.0" encoding="UTF-8"?>', "\n";
?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<?php foreach ($pages as $path => [$prio, $freq]):
    $loc = site_url($path);
    if ($loc === '') continue; ?>
  <url>
    <loc><?= h($loc) ?></loc>
    <changefreq><?= $freq ?></changefreq>
    <priority><?= $prio ?></priority>
  </url>
<?php endforeach ?>
</urlset>
