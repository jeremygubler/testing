<?php
/** Gemeinsames Layout für Impressum, AGB und Datenschutzerklärung. */
declare(strict_types=1);
require_once __DIR__ . '/core.php';
require_once __DIR__ . '/schema.php';

function legal_head(string $title, string $desc = '', string $slug = '', bool $noindex = false): void {
    $c = ff_content();
    ?><!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($title) ?> — COMBAT MIND</title>
<?php if ($desc): ?><meta name="description" content="<?= h($desc) ?>"><?php endif ?>
<?php if ($noindex): ?><meta name="robots" content="noindex, follow"><?php endif ?>
<?php if ($slug && site_url()): ?><link rel="canonical" href="<?= h(site_url($slug)) ?>"><?php endif ?>
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%230a0a0a'/><text x='16' y='23' font-family='sans-serif' font-size='16' font-weight='700' fill='%23c9a227' text-anchor='middle'>CM</text></svg>">
<style>
/* ─────────────────────────  SCHRIFTEN  ─────────────────────────
   Lokal eingebunden statt über Google Fonts: keine Daten an Dritte beim
   Seitenaufruf, ein Verbindungsaufbau weniger. unicode-range sorgt dafür,
   dass der Browser nur lädt, was er wirklich braucht. */
@font-face {
  font-family: 'Archivo';
  font-style: italic;
  font-weight: 400 900;
  font-stretch: 100% 125%;
  font-display: swap;
  src: url(assets/fonts/Archivo-italic-latin-ext-526052.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Archivo';
  font-style: italic;
  font-weight: 400 900;
  font-stretch: 100% 125%;
  font-display: swap;
  src: url(assets/fonts/Archivo-italic-latin-33f250.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 400 900;
  font-stretch: 100% 125%;
  font-display: swap;
  src: url(assets/fonts/Archivo-latin-ext-c422bf.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 400 900;
  font-stretch: 100% 125%;
  font-display: swap;
  src: url(assets/fonts/Archivo-latin-b92029.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(assets/fonts/Inter-latin-ext-395290.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(assets/fonts/Inter-latin-567244.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url(assets/fonts/Inter-latin-ext-395290.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url(assets/fonts/Inter-latin-567244.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url(assets/fonts/Inter-latin-ext-395290.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url(assets/fonts/Inter-latin-567244.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
:root{
  --ink:#050505; --ink-2:#0d0d0e; --line:rgba(255,255,255,.10);
  --white:#f7f7f5; --mute:#a2a2a0; --gold:#c9a227; --gold-hi:#f0d98a;
  --shell:min(760px,100% - 2.5rem);
  --display:"Archivo","Arial Narrow",system-ui,sans-serif;
  --body:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
  color-scheme:dark;
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{margin:0;background:var(--ink);color:var(--white);font-family:var(--body);
  font-size:1rem;line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:var(--gold-hi)}
a:hover{color:var(--gold)}
:focus-visible{outline:2px solid var(--gold-hi);outline-offset:3px;border-radius:4px}
::selection{background:var(--gold);color:#0a0a0a}
.shell{width:var(--shell);margin-inline:auto}
.mark{font-family:var(--display);font-weight:900;font-stretch:120%;font-style:italic;
  font-size:1.32rem;letter-spacing:.01em;text-transform:uppercase;line-height:1;
  color:var(--white);text-decoration:none}
.mark span{color:var(--gold)}
.top{border-bottom:1px solid var(--line);background:rgba(5,5,5,.92);
  position:sticky;top:0;z-index:10;backdrop-filter:blur(12px)}
.top__in{width:var(--shell);margin-inline:auto;height:70px;
  display:flex;align-items:center;justify-content:space-between;gap:1rem}
.back{font-family:var(--display);font-weight:600;font-stretch:108%;font-size:.76rem;
  letter-spacing:.18em;text-transform:uppercase;color:var(--mute);text-decoration:none}
.back:hover{color:var(--gold-hi)}
header.doc{padding:clamp(3rem,7vw,5rem) 0 clamp(1.75rem,4vw,2.5rem)}
h1{font-family:var(--display);font-weight:900;font-stretch:115%;font-style:italic;
  text-transform:uppercase;line-height:1;letter-spacing:-.01em;
  font-size:clamp(2.2rem,1.6rem + 2.8vw,3.6rem);margin:0 0 1rem}
.stand{color:var(--mute);font-size:.9rem}
main{padding-bottom:clamp(3rem,7vw,5rem);counter-reset:sec}
section{padding-top:clamp(2rem,4vw,2.75rem)}
h2{font-family:var(--display);font-weight:800;font-stretch:112%;text-transform:uppercase;
  font-size:1.12rem;letter-spacing:.04em;line-height:1.25;margin:0 0 .9rem;
  display:flex;gap:.85rem;align-items:baseline}
h2::before{content:counter(sec,decimal-leading-zero);counter-increment:sec;
  font-size:.76rem;letter-spacing:.14em;color:var(--gold);flex:none}
h2.plain::before{content:none}
p{margin:0 0 1rem;color:var(--mute)}
p:last-child{margin-bottom:0}
ul{margin:0 0 1rem;padding-left:1.15rem;color:var(--mute)}
li{margin-bottom:.45rem}
li::marker{color:var(--gold)}
strong{color:var(--white);font-weight:600}
.todo{background:rgba(201,162,39,.16);color:var(--gold-hi);
  box-shadow:inset 0 0 0 1px rgba(201,162,39,.4);border-radius:3px;padding:.05em .4em}
.note{border:1px solid rgba(201,162,39,.35);background:rgba(201,162,39,.06);
  border-radius:10px;padding:1.25rem 1.4rem;margin-top:1.5rem}
.note b{display:block;font-family:var(--display);font-weight:700;font-stretch:108%;
  font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:.5rem}
.note p{margin:0;font-size:.94rem}
.ft{border-top:1px solid var(--line);padding:2.5rem 0;margin-top:clamp(3rem,6vw,4.5rem)}
.ft__in{width:var(--shell);margin-inline:auto;display:flex;flex-wrap:wrap;
  gap:.75rem 1.5rem;justify-content:space-between;color:#6d6d6b;font-size:.85rem}
.ft a{color:#6d6d6b;text-decoration:none}
.ft a:hover{color:var(--gold-hi)}
</style>
</head>
<body>
<div class="top">
  <div class="top__in">
    <a class="mark" href="index.php">COMBAT<span>MIND</span></a>
    <a class="back" href="index.php">&larr; Zur Startseite</a>
  </div>
</div>
<?php
}

function legal_foot(): void {
    $c = ff_content();
    ?>
<footer class="ft">
  <div class="ft__in">
    <span>&copy; <?= date('Y') ?> COMBAT MIND — <?= h($c['contact']['owner']) ?>, <?= h($c['contact']['city']) ?></span>
    <span>
      <a href="impressum.php">Impressum</a> ·
      <a href="agb.php">AGB</a> ·
      <a href="datenschutz.php">Datenschutz</a>
    </span>
  </div>
</footer>
</body>
</html>
<?php
}

/** Adressblock aus den Admin-Daten, mit sichtbaren Lücken wo noch nichts steht. */
function legal_address(): string {
    $c = ff_content();
    $todo = fn($s) => '<span class="todo">[' . $s . ']</span>';
    $out  = '<strong>COMBAT MIND</strong><br>' . h($c['contact']['owner']) . '<br>';
    $out .= ($c['contact']['address'] ? h($c['contact']['address']) : $todo('Strasse und Hausnummer')) . '<br>';
    $out .= h(zip_city()) . '<br>';
    $out .= 'E-Mail: ' . ($c['contact']['email']
        ? '<a href="mailto:' . h($c['contact']['email']) . '">' . h($c['contact']['email']) . '</a>'
        : $todo('E-Mail-Adresse'));
    if ($c['contact']['phone']) {
        $out .= '<br>Telefon: <a href="tel:' . h(phone_href()) . '">'
              . h($c['contact']['phone']) . '</a>';
    }
    if ($c['contact']['hours']) {
        $out .= '<br>Erreichbar: ' . h($c['contact']['hours']);
    }
    return $out;
}
