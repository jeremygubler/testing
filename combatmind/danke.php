<?php
/** Bestätigungsseite nach der Anmeldung. In Tally als Redirect-URL hinterlegen. */
require __DIR__ . '/inc/legal.php';
require __DIR__ . '/inc/events.php';
legal_head('Anmeldung eingegangen', '', '', true);
$c = ff_content();
$warte = isset($_GET['w']);
$kurs  = event_by_id(trim((string)($_GET['t'] ?? '')));
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
<?php if ($warte && $kurs): ?>
  <h1><em>Du stehst drauf.</em></h1>
  <p>Du bist auf der Warteliste für <strong><?= h($kurs['title']) ?></strong> am
  <?= h(event_weekday($kurs['date']) . ', ' . event_day($kurs['date']) . '. '
        . event_month($kurs['date']) . ' ' . event_year($kurs['date'])) ?>.
  Wird ein Platz frei, melden wir uns — in der Reihenfolge der Eintragungen.</p>

  <ol class="steps">
    <li><b>1</b><span><strong>Wir merken dich vor</strong>Dein Eintrag ist gespeichert, eine Bestätigung ist unterwegs.</span></li>
    <li><b>2</b><span><strong>Wir melden uns</strong>Sobald jemand absagt — bei Einzeltrainings passiert das oft kurzfristig.</span></li>
    <li><b>3</b><span><strong>Du entscheidest dann</strong>Der Eintrag verpflichtet zu nichts.</span></li>
  </ol>
<?php elseif ($kurs): ?>
  <h1><em>Platz reserviert.</em></h1>
  <p>Du bist angemeldet für <strong><?= h($kurs['title']) ?></strong> am
  <?= h(event_weekday($kurs['date']) . ', ' . event_day($kurs['date']) . '. '
        . event_month($kurs['date']) . ' ' . event_year($kurs['date'])) ?><?php
    if (!empty($kurs['time'])): ?> um <?= h($kurs['time']) ?><?php endif ?>.
  Eine Bestätigung ist unterwegs.</p>

  <ol class="steps">
    <li><b>1</b><span><strong>Komm einfach vorbei</strong>Bequeme Sportkleidung, Wasserflasche, sonst nichts.</span></li>
    <li><b>2</b><span><strong>Bezahlung vor Ort</strong><?= !empty($kurs['price'])
      ? 'CHF ' . h($kurs['price']) . ' per TWINT oder bar im Training.'
      : 'Die Angaben dazu bekommst du vor Ort.' ?></span></li>
    <li><b>3</b><span><strong>Falls du nicht kannst</strong>Sag uns bitte spätestens 48 Stunden vorher Bescheid, dann rückt jemand von der Liste nach.</span></li>
  </ol>
  <p style="margin-top:2rem"><a class="home" style="background:transparent;color:var(--gold-hi);
    border:1px solid var(--line);padding:.85rem 1.6rem"
    href="kalender.php?t=<?= h(urlencode((string)$kurs['id'])) ?>">In den Kalender übernehmen</a></p>
<?php elseif ($warte): ?>
  <h1><em>Du stehst drauf.</em></h1>
  <p>Dein Eintrag auf der Warteliste ist da. Wird ein Platz frei oder startet der
  nächste Durchgang, melden wir uns bei dir — in der Reihenfolge der Eintragungen.
  Du musst nichts weiter tun.</p>

  <ol class="steps">
    <li><b>1</b><span><strong>Wir merken dich vor</strong>Dein Eintrag ist gespeichert, eine Bestätigung ist unterwegs.</span></li>
    <li><b>2</b><span><strong>Wir melden uns</strong>Sobald ein Platz frei wird oder der nächste Kurs steht — vor allen anderen.</span></li>
    <li><b>3</b><span><strong>Dann erst die Anmeldung</strong>Du entscheidest in dem Moment, ob es dir passt. Der Eintrag verpflichtet zu nichts.</span></li>
  </ol>
<?php else: ?>
  <h1><em>You're in.</em></h1>
  <p>Deine Anmeldung ist eingegangen. Wir melden uns innert zwei Arbeitstagen
  persönlich bei dir — mit allen Angaben und der Zahlungsinformation. Dein Platz
  ist nach Bestätigung und fristgerechter Zahlung definitiv reserviert.</p>

  <ol class="steps">
    <li><b>1</b><span><strong>Bestätigung</strong>Jocelyn schreibt dir persönlich — mit allen Angaben zu Start, Ort und Ablauf.</span></li>
    <li><b>2</b><span><strong>Zahlung</strong>Mit der Bestätigung kommen die Angaben für TWINT oder Banküberweisung. Bezahle innert der genannten Frist.</span></li>
    <li><b>3</b><span><strong>Platz definitiv</strong>Nach Zahlungseingang ist dein Platz fix reserviert. Dann sehen wir uns im Training.</span></li>
  </ol>
<?php endif ?>

  <?php if ($c['contact']['email']): ?>
    <p style="margin-top:2rem;font-size:.92rem"><?= $warte
      ? 'Keine Bestätigung bekommen? Schreib an'
      : 'Nach zwei Tagen noch nichts gehört? Schreib an' ?>
      <a href="mailto:<?= h($c['contact']['email']) ?>"><?= h($c['contact']['email']) ?></a>.</p>
  <?php endif ?>

  <a class="home" href="index.php">Zurück zur Startseite</a>
</main>
<?php legal_foot();
