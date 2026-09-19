<?php
/** Bestätigungsseite nach der Anmeldung. In Tally als Redirect-URL hinterlegen. */
require __DIR__ . '/inc/legal.php';
legal_head('Anmeldung eingegangen', '', '', true);
$c = ff_content();
?>
<style>
  main.done{width:var(--shell);margin-inline:auto;padding:clamp(4rem,12vh,8rem) 0 clamp(3rem,7vw,5rem);text-align:center}
  .done h1{font-size:clamp(3rem,2rem + 6vw,6rem);margin-bottom:1.5rem}
  .done h1 em{font-style:italic;background:linear-gradient(140deg,#f4e4ae,#d4af37 38%,#a8801d 72%,#e8cf88);
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .done p{max-width:46ch;margin-inline:auto}
  .steps{list-style:none;margin:3rem auto 0;padding:0;max-width:34rem;text-align:left;
    display:grid;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden}
  .steps li{background:var(--ink-2);padding:1.15rem 1.35rem;display:flex;gap:1rem;align-items:flex-start}
  .steps b{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;
    background:rgba(201,162,39,.15);color:var(--gold);font-family:var(--display);font-size:.78rem;font-weight:800}
  .steps span{color:var(--mute);font-size:.95rem}
  .steps strong{display:block;color:var(--white);font-family:var(--display);font-weight:700;
    text-transform:uppercase;letter-spacing:.04em;font-size:.92rem;margin-bottom:.15rem}
  .home{display:inline-flex;margin-top:2.5rem;font-family:var(--display);font-weight:700;
    font-size:.8rem;letter-spacing:.18em;text-transform:uppercase;text-decoration:none;
    color:#0a0a0a;background:linear-gradient(140deg,#f4e4ae,#d4af37 38%,#a8801d 72%,#e8cf88);
    padding:1rem 2rem;border-radius:2px}
</style>

<main class="done">
  <h1><em>You're in.</em></h1>
  <p>Deine Anmeldung ist eingegangen. Wir melden uns innert zwei Arbeitstagen
  persönlich bei dir — mit allen Angaben und der Zahlungsinformation. Dein Platz
  ist nach Bestätigung und fristgerechter Zahlung definitiv reserviert.</p>

  <ol class="steps">
    <li><b>1</b><span><strong>Bestätigung</strong>Jocelyn schreibt dir persönlich — mit allen Angaben zu Start, Ort und Ablauf.</span></li>
    <li><b>2</b><span><strong>Zahlung</strong>Bezahle den Kursbeitrag über die von dir gewählte Zahlungsart innert der genannten Frist.</span></li>
    <li><b>3</b><span><strong>Platz definitiv</strong>Nach Zahlungseingang ist dein Platz fix reserviert. Dann sehen wir uns im Training.</span></li>
  </ol>

  <?php if ($c['contact']['email']): ?>
    <p style="margin-top:2rem;font-size:.92rem">Nach zwei Tagen noch nichts gehört? Schreib an
      <a href="mailto:<?= h($c['contact']['email']) ?>"><?= h($c['contact']['email']) ?></a>.</p>
  <?php endif ?>

  <a class="home" href="index.php">Zurück zur Startseite</a>
</main>
<?php legal_foot();
