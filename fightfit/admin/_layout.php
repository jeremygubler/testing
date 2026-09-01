<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/core.php';
require_once __DIR__ . '/../inc/schema.php';

function admin_head(string $title, bool $nav = true): void {
    $f = flash();
    ?><!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= h($title) ?> — FIGHTFIT Admin</title>
<style>
:root{--ink:#08080a;--ink-2:#111114;--ink-3:#191920;--line:#26262e;--white:#f2f2f0;
  --mute:#9a9aa2;--gold:#c9a227;--gold-hi:#f0d98a;color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--white);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--gold-hi)}
.wrap{max-width:940px;margin:0 auto;padding:0 1.25rem 5rem}
.bar{border-bottom:1px solid var(--line);background:var(--ink-2);margin-bottom:2rem}
.bar__in{max-width:940px;margin:0 auto;padding:0 1.25rem;height:62px;display:flex;
  align-items:center;justify-content:space-between;gap:1rem}
.logo{font-weight:800;font-style:italic;letter-spacing:.02em;text-transform:uppercase;
  font-size:1.05rem;text-decoration:none;color:var(--white)}
.logo span{color:var(--gold)}
.tabs{display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:2rem}
.tabs a{padding:.5rem .95rem;border-radius:6px;text-decoration:none;color:var(--mute);
  border:1px solid transparent;font-size:.9rem}
.tabs a:hover{color:var(--white);background:var(--ink-2)}
.tabs a[aria-current]{background:var(--ink-3);border-color:var(--line);color:var(--white)}
h1{font-size:1.5rem;margin:0 0 .35rem;letter-spacing:-.01em}
h2{font-size:1rem;text-transform:uppercase;letter-spacing:.12em;color:var(--gold);
  margin:2.25rem 0 .9rem;padding-bottom:.5rem;border-bottom:1px solid var(--line)}
.sub{color:var(--mute);margin:0 0 2rem}
fieldset{border:1px solid var(--line);border-radius:10px;padding:1.1rem 1.25rem;margin:0 0 1rem;background:var(--ink-2)}
legend{padding:0 .5rem;color:var(--gold);font-size:.72rem;letter-spacing:.16em;text-transform:uppercase}
label{display:block;margin-bottom:1rem}
label:last-child{margin-bottom:0}
.lbl{display:block;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;
  color:var(--mute);margin-bottom:.35rem}
input[type=text],input[type=password],input[type=date],input[type=time],textarea,select{
  width:100%;background:var(--ink-3);border:1px solid var(--line);border-radius:7px;
  color:var(--white);padding:.65rem .8rem;font:inherit;font-size:.95rem}
input:focus,textarea:focus,select:focus{outline:2px solid var(--gold);outline-offset:1px;border-color:transparent}
textarea{min-height:90px;resize:vertical;line-height:1.55}
.hint{color:#77777f;font-size:.8rem;margin-top:.3rem}
.btn{display:inline-flex;align-items:center;gap:.5rem;background:var(--gold);color:#0a0a0a;
  border:0;border-radius:7px;padding:.7rem 1.3rem;font:inherit;font-weight:700;cursor:pointer}
.btn:hover{background:var(--gold-hi)}
.btn--ghost{background:transparent;color:var(--white);border:1px solid var(--line)}
.btn--ghost:hover{background:var(--ink-2);color:var(--white)}
.btn--danger{background:transparent;color:#e88;border:1px solid #5a2b2b}
.btn--danger:hover{background:#2a1414;color:#faa}
.actions{position:sticky;bottom:0;background:linear-gradient(to top,var(--ink) 60%,transparent);
  padding:1.25rem 0;margin-top:1.5rem;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap}
.flash{border-radius:8px;padding:.85rem 1.1rem;margin-bottom:1.5rem;font-size:.93rem}
.flash.ok{background:#12240f;border:1px solid #2f5c28;color:#b9e6ae}
.flash.err{background:#2a1414;border:1px solid #5a2b2b;color:#f0b4b4}
.grid2{display:grid;gap:1rem}
@media (min-width:640px){.grid2{grid-template-columns:1fr 1fr}}
.card{border:1px solid var(--line);border-radius:10px;background:var(--ink-2);padding:1.1rem;margin-bottom:1rem}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:1rem}
.shots figure{margin:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--ink-2)}
.shots img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}
.shots .meta{padding:.7rem}
.rows{display:grid;gap:.75rem}
.row{border:1px solid var(--line);border-radius:10px;background:var(--ink-2);padding:1rem;
  display:grid;gap:.75rem;grid-template-columns:1fr;align-items:end}
@media (min-width:720px){.row{grid-template-columns:150px 110px 1fr 1fr auto}}
.empty{border:1px dashed var(--line);border-radius:10px;padding:2.5rem 1.5rem;text-align:center;color:var(--mute)}
</style>
</head>
<body>
<?php if ($nav): ?>
<div class="bar"><div class="bar__in">
  <a class="logo" href="index.php">FIGHT<span>FIT</span> Admin</a>
  <span style="display:flex;gap:.75rem;align-items:center">
    <a href="../index.php" target="_blank" rel="noopener" style="font-size:.88rem">Website ansehen ↗</a>
    <a href="logout.php" style="font-size:.88rem;color:var(--mute)">Abmelden</a>
  </span>
</div></div>
<?php endif ?>
<div class="wrap">
<?php if ($f): ?><div class="flash <?= h($f['type']) ?>"><?= h($f['msg']) ?></div><?php endif ?>
<?php
}

function admin_tabs(string $current): void {
    $tabs = ['index.php' => 'Übersicht', 'texte.php' => 'Texte', 'galerie.php' => 'Galerie',
             'termine.php' => 'Termine', 'passwort.php' => 'Passwort'];
    echo '<nav class="tabs">';
    foreach ($tabs as $file => $label) {
        $cur = $file === $current ? ' aria-current="page"' : '';
        echo '<a href="' . h($file) . '"' . $cur . '>' . h($label) . '</a>';
    }
    echo '</nav>';
}

function admin_foot(): void { echo "</div>\n</body>\n</html>"; }
