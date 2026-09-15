<?php
/** Seite nicht gefunden. In der .htaccess als ErrorDocument hinterlegt. */
require __DIR__ . '/inc/legal.php';
http_response_code(404);
legal_head('Seite nicht gefunden', '', '', true);
?>
<style>
  main.nf{width:var(--shell);margin-inline:auto;padding:clamp(4rem,14vh,9rem) 0;text-align:center}
  .nf h1{font-size:clamp(4rem,3rem + 8vw,9rem);line-height:.9;margin-bottom:1.25rem}
  .nf h1 em{font-style:italic;background:linear-gradient(140deg,#f4e4ae,#d4af37 38%,#a8801d 72%,#e8cf88);
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .nf p{max-width:42ch;margin-inline:auto}
  .nf__links{display:flex;flex-wrap:wrap;gap:.8rem;justify-content:center;margin-top:2.5rem}
  .nf__links a{font-family:var(--display);font-weight:700;font-size:.8rem;letter-spacing:.16em;
    text-transform:uppercase;text-decoration:none;padding:1rem 1.8rem;border-radius:2px}
  .nf__links a:first-child{color:#0a0a0a;
    background:linear-gradient(140deg,#f4e4ae,#d4af37 38%,#a8801d 72%,#e8cf88)}
  .nf__links a+a{color:var(--white);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
  .nf__links a+a:hover{box-shadow:inset 0 0 0 1px var(--gold);color:var(--gold-hi)}
</style>
<main class="nf">
  <h1><em>404</em></h1>
  <p>Diese Seite gibt es nicht — vielleicht ein alter Link oder ein Tippfehler
  in der Adresse.</p>
  <div class="nf__links">
    <a href="index.php">Zur Startseite</a>
    <a href="index.php#program">Zum 12 Week Program</a>
  </div>
</main>
<?php legal_foot();
