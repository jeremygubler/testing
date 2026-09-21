<?php
/**
 * Anmeldeformular auf dem eigenen Server.
 *
 * Die Ein-/Ausblendlogik unten ist Javascript und damit reine Bequemlichkeit.
 * Ohne Javascript sind schlicht alle Felder sichtbar und das Formular
 * funktioniert weiter — geprüft wird ohnehin auf dem Server.
 */
declare(strict_types=1);
require __DIR__ . '/inc/legal.php';
require __DIR__ . '/inc/signup.php';
require __DIR__ . '/inc/mailer.php';

$c       = ff_content();

// Mit ?t=<Kennung> gilt die Seite einem einzelnen Training statt dem Kurs.
$termin  = event_by_id(trim((string)($_GET['t'] ?? $_POST['event'] ?? '')));
$istTermin = $termin !== null;
$soldOut = $istTermin ? !event_open($termin) : !empty($c['program']['sold_out']);
$fehler  = [];
$alt     = [];

// Ein Termin ohne Anmeldung oder ein unbekannter Schlüssel gehört nicht hierher.
if (!$istTermin && trim((string)($_GET['t'] ?? '')) !== '') {
    header('Location: index.php#termine'); exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $soldOut && !$istTermin) {
    $alt = $_POST;
    if (!signup_looks_human($_POST)) {
        $fehler['_'] = 'Das Formular wurde zu schnell abgeschickt. Versuch es bitte noch einmal.';
    } else {
        $p = waitlist_validate($_POST);
        if (!$p['ok']) {
            $fehler = $p['errors'];
        } else {
            $d = $p['data'];
            $stand = waitlist_store($d);
            if ($stand === 'doppelt') {
                $fehler['_'] = 'Mit dieser Adresse stehst du bereits auf der Warteliste.';
            } elseif ($stand !== 'ok') {
                $fehler['_'] = 'Speichern fehlgeschlagen. Melde dich bitte direkt per E-Mail.';
            } else {
                $an = trim((string)$c['contact']['email']);
                if ($an !== '') {
                    mail_send($an, 'Warteliste: ' . signup_name($d), implode("\n", [
                        'Neuer Eintrag auf der Warteliste', '',
                        'Name:    ' . signup_name($d),
                        'E-Mail:  ' . $d['email'],
                        'Telefon: ' . ($d['telefon'] !== '' ? $d['telefon'] : '—'),
                        $d['nachricht'] !== '' ? "\nNachricht: " . $d['nachricht'] : '',
                        '', 'Im Admin: ' . site_url('admin/anmeldungen.php'),
                    ]), $d['email']);
                }
                mail_send($d['email'], 'Du stehst auf der Warteliste',
                    str_replace('{vorname}', $d['vorname'], (string)$c['signup']['wl_reply']));
                header('Location: danke.php?w=1'); exit;
            }
        }
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST' && !$soldOut) {
    $alt = $_POST;
    if (!signup_looks_human($_POST)) {
        $fehler['_'] = 'Das Formular wurde zu schnell abgeschickt. Versuch es bitte noch einmal.';
    } elseif (!signup_rate_ok()) {
        $fehler['_'] = 'Es sind bereits mehrere Anmeldungen von diesem Anschluss eingegangen. Melde dich bitte direkt per E-Mail.';
    } else {
        $p = signup_validate($_POST);
        if (!$p['ok']) {
            $fehler = $p['errors'];
        } else {
            $d = $p['data'];
            // Erst ablegen, dann versenden: Eine Anmeldung darf nie an einer
            // klemmenden Mail scheitern.
            $stand = signup_store($d);
            if ($stand === 'doppelt') {
                $fehler['_'] = 'Mit diesen Angaben liegt bereits eine Anmeldung vor. '
                    . 'Hast du versehentlich zweimal gesendet, ist alles in Ordnung — '
                    . 'wir melden uns. Sonst schreib uns kurz.';
            } elseif ($stand === 'voll') {
                $fehler['_'] = 'Dieses Training ist inzwischen ausgebucht.';
            } elseif ($stand === 'zu_spaet') {
                $fehler['_'] = 'Die Anmeldefrist für dieses Training ist abgelaufen.';
            } elseif ($stand !== 'ok') {
                $fehler['_'] = 'Speichern fehlgeschlagen. Melde dich bitte direkt per E-Mail.';
            } else {
                signup_rate_hit();
                $an = trim((string)$c['contact']['email']);
                if ($an !== '') {
                    $zeilen = [
                        $istTermin
                            ? 'Neue Anmeldung — ' . $termin['title'] . ' am '
                              . date('d.m.Y', strtotime($termin['date']))
                            : 'Neue Anmeldung — COMBAT MIND 12 Week Program', '',
                        'Name:          ' . signup_name($d),
                        'E-Mail:        ' . $d['email'],
                        'Telefon:       ' . $d['telefon'],
                        'Geburtsdatum:  ' . $d['geburtsdatum'] . ' (' . $d['alter'] . ' Jahre)',
                    ];
                    if ($d['gv_name'] !== '') {
                        $zeilen[] = 'Erziehungsberechtigt: ' . $d['gv_name'] . ' <' . $d['gv_email'] . '>';
                    }
                    $zeilen[] = 'Gesundheit:    ' . ($d['gesundheit'] === 'ja' ? 'JA — ' . $d['gesundheit_text'] : 'keine Einschränkungen');
                    $zeilen[] = 'Fotos:         ' . ($d['fotos'] ? 'einverstanden' : 'nicht einverstanden');
                    if ($d['nachricht'] !== '') { $zeilen[] = ''; $zeilen[] = 'Nachricht: ' . $d['nachricht']; }
                    $zeilen[] = '';
                    $zeilen[] = 'Im Admin: ' . site_url('admin/anmeldungen.php');
                    mail_send($an, ($istTermin ? 'Training: ' : 'Neue Anmeldung: ') . signup_name($d),
                              implode("\n", $zeilen), $d['email']);
                }
                if ($istTermin) {
                    $wann = event_weekday($termin['date']) . ', ' . event_day($termin['date']) . '. '
                          . event_month($termin['date']) . ' ' . event_year($termin['date'])
                          . (!empty($termin['time']) ? ', ' . $termin['time'] : '');
                    $text = "Hallo " . $d['vorname'] . "\n\ndanke für deine Anmeldung zu:\n\n"
                          . $termin['title'] . "\n" . $wann . "\n"
                          . (!empty($termin['price']) ? "CHF " . $termin['price'] . " — bezahlt wird vor Ort per TWINT oder bar.\n" : '')
                          . "\nDein Platz ist reserviert. Solltest du nicht können, sag uns bitte "
                          . "spätestens 48 Stunden vorher Bescheid.\n\nBis bald\nJocelyn\nCOMBAT MIND";
                } else {
                    $text = str_replace('{vorname}', $d['vorname'], (string)$c['signup']['reply']);
                }
                mail_send($d['email'], $istTermin ? 'Deine Anmeldung: ' . $termin['title']
                                                  : 'Deine Anmeldung bei COMBAT MIND', $text);
                if ($d['gv_email'] !== '') {
                    mail_send($d['gv_email'], 'Anmeldung von ' . signup_name($d) . ' bei COMBAT MIND',
                        str_replace('{vorname}', $d['gv_name'], (string)$c['signup']['reply']));
                }
                header('Location: danke.php' . ($istTermin ? '?t=' . urlencode((string)$termin['id']) : '')); exit;
            }
        }
    }
}

$w = fn(string $k) => h((string)($alt[$k] ?? ''));
$e = fn(string $k) => isset($fehler[$k]) ? '<span class="err">' . h($fehler[$k]) . '</span>' : '';

legal_head($istTermin ? 'Anmeldung — ' . $termin['title'] : 'Anmeldung',
           $istTermin ? 'Anmeldung zum Training ' . $termin['title'] . ' bei COMBAT MIND in Basel.'
                      : 'Anmeldung zum COMBAT MIND 12 Week Program in Basel.',
           $istTermin ? '' : 'anmeldung.php', $istTermin);
?>
<style>
  main.form{width:var(--shell);margin-inline:auto;padding:clamp(2.5rem,6vw,4rem) 0 clamp(3rem,7vw,5rem)}
  .fld{margin-bottom:1.35rem}
  .fld > label,.grp > legend{display:block;font-family:var(--display);font-weight:700;font-stretch:108%;
    font-size:.74rem;letter-spacing:.16em;text-transform:uppercase;color:var(--mute);margin-bottom:.4rem;padding:0}
  input[type=text],input[type=email],input[type=tel],input[type=date],textarea{
    width:100%;background:var(--ink-2);border:1px solid var(--line);border-radius:8px;
    color:var(--white);padding:.8rem .95rem;font:inherit;font-size:1rem}
  input:focus,textarea:focus{outline:2px solid var(--gold);outline-offset:1px;border-color:transparent}
  textarea{min-height:110px;resize:vertical}
  .two{display:grid;gap:1.35rem}
  @media (min-width:600px){.two{grid-template-columns:1fr 1fr}}
  .grp{border:1px solid var(--line);border-radius:10px;padding:1.1rem 1.25rem;margin:0 0 1.35rem;background:var(--ink-2)}
  .grp .opt{display:flex;gap:.7rem;align-items:flex-start;margin-bottom:.7rem;color:var(--mute);font-size:.95rem}
  .grp .opt:last-child{margin-bottom:0}
  .grp .opt input{margin-top:.25rem;accent-color:var(--gold);width:18px;height:18px;flex:none}
  #geburtsdatum{max-width:12rem;letter-spacing:.06em}
  ::placeholder{color:#5c5c62}
  .err{display:block;color:#f0b4b4;font-size:.86rem;margin-top:.35rem}
  .banner{border:1px solid #5a2b2b;background:#2a1414;color:#f0b4b4;border-radius:10px;
    padding:1rem 1.2rem;margin-bottom:2rem}
  .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
  .send{display:inline-flex;font-family:var(--display);font-weight:700;font-size:.82rem;
    letter-spacing:.18em;text-transform:uppercase;border:0;cursor:pointer;color:#0a0a0a;
    background:linear-gradient(140deg,#f4e4ae,#d4af37 38%,#a8801d 72%,#e8cf88);
    padding:1.05rem 2.2rem;border-radius:2px;margin-top:.5rem}
  .fine{font-size:.86rem;margin-top:1.25rem}
  .wann{color:var(--gold-hi);font-family:var(--display);font-weight:700;font-stretch:108%;
    letter-spacing:.06em;text-transform:uppercase;font-size:.84rem;margin-bottom:1.25rem}
  .auswahl{border:1px solid var(--line);border-radius:12px;background:var(--ink-2);
    padding:1.1rem 1.25rem;margin:0 0 2rem}
  .auswahl__t{font-family:var(--display);font-weight:700;font-stretch:108%;font-size:.72rem;
    letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin:0 0 .85rem}
  .auswahl__i{display:flex;gap:1rem;align-items:baseline;flex-wrap:wrap;text-decoration:none;
    color:var(--white);padding:.7rem 0;border-top:1px solid var(--line)}
  .auswahl__i:hover{color:var(--gold-hi)}
  .auswahl__d{flex:none;width:5.5rem;font-family:var(--display);font-weight:800;font-stretch:108%;
    font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-hi)}
  .auswahl__n{flex:1 1 12rem;font-weight:600}
  .auswahl__n span{display:block;color:var(--mute);font-size:.86rem;font-weight:400}
  .auswahl__f{flex:none;color:var(--mute);font-size:.84rem}
</style>

<main class="form">
  <h1><?= $istTermin ? h($termin['title']) : 'Anmeldung' ?></h1>
<?php if ($istTermin): ?>
  <p class="wann">
    <?= h(event_weekday($termin['date']) . ', ' . event_day($termin['date']) . '. '
          . event_month($termin['date']) . ' ' . event_year($termin['date'])) ?><?php
      if (!empty($termin['time'])): ?> · <?= h($termin['time']) ?><?php endif ?><?php
      if (!empty($termin['price'])): ?> · CHF <?= h($termin['price']) ?><?php endif ?>
    <?php if (!$soldOut): ?>
      · noch <?= event_free($termin) ?> von <?= event_seats($termin) ?> Plätzen
    <?php endif ?>
  </p>
  <?php if (!empty($termin['note'])): ?><p><?= nl2br(h($termin['note'])) ?></p><?php endif ?>
<?php endif ?>

  <?php
    // Wer direkt hierher findet, soll sehen, dass es ausser dem Kurs noch
    // einzelne Trainings gibt — sonst ist der Weg dorthin nur der Knopf auf
    // der Startseite.
    $offen = array_values(array_filter(events_upcoming(20),
        fn($e) => event_open($e) && ($e['id'] ?? '') !== ($termin['id'] ?? '')));
  ?>
  <?php /* Auf einer Terminseite steht der Weg zurück zum Kurs auch dann, wenn
           es gerade kein weiteres offenes Training gibt. */ ?>
  <?php if ($offen || $istTermin): ?>
    <div class="auswahl">
      <p class="auswahl__t"><?= $istTermin
        ? ($offen ? 'Weitere Trainings' : 'Auch im Angebot')
        : 'Einzelne Trainings' ?></p>
      <?php /* Nicht $e als Laufvariable: so heisst weiter unten die Funktion,
               die Feldfehler ausgibt. */ ?>
      <?php foreach ($offen as $trm): ?>
        <a class="auswahl__i" href="anmeldung.php?t=<?= h(urlencode((string)$trm['id'])) ?>">
          <span class="auswahl__d"><?= h(event_day($trm['date'])) ?>. <?= h(event_month($trm['date'])) ?></span>
          <span class="auswahl__n"><?= h($trm['title']) ?><?php if (!empty($trm['time'])): ?>
            <span><?= h($trm['time']) ?></span><?php endif ?></span>
          <span class="auswahl__f">noch <?= event_free($trm) ?><?php
            if (!empty($trm['price'])): ?> · CHF <?= h($trm['price']) ?><?php endif ?></span>
        </a>
      <?php endforeach ?>
      <?php if ($istTermin): ?>
        <a class="auswahl__i" href="anmeldung.php">
          <span class="auswahl__d">Kurs</span>
          <span class="auswahl__n">12 Week Program</span>
          <span class="auswahl__f">ansehen</span>
        </a>
      <?php endif ?>
    </div>
  <?php endif ?>

  <?php if ($soldOut && $istTermin): ?>
    <div class="banner"><?= event_deadline($termin) < date('Y-m-d')
      ? 'Die Anmeldefrist für dieses Training ist abgelaufen.'
      : 'Dieses Training ist ausgebucht.' ?>
      Schreib an <a href="mailto:<?= h($c['contact']['email']) ?>"><?= h($c['contact']['email']) ?></a>,
      wenn du beim nächsten Mal dabei sein willst.</div>
    <p><a href="index.php#termine">← Alle Termine</a></p>
  <?php elseif ($soldOut): ?>
    <?php if (isset($fehler['_'])): ?><div class="banner"><?= h($fehler['_']) ?></div><?php endif ?>
    <?php if ($fehler && !isset($fehler['_'])): ?>
      <div class="banner">Bitte schau dir die markierten Felder noch einmal an.</div>
    <?php endif ?>
    <p><?= nl2br(h($c['signup']['wl_intro'])) ?></p>

    <form method="post" novalidate>
      <div class="hp" aria-hidden="true">
        <label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
      </div>
      <input type="hidden" name="ts" value="<?= time() ?>">
      <div class="two">
        <div class="fld"><label for="wv">Vorname</label>
          <input id="wv" type="text" name="vorname" value="<?= $w('vorname') ?>" required autocomplete="given-name"><?= $e('vorname') ?></div>
        <div class="fld"><label for="wn">Name</label>
          <input id="wn" type="text" name="name" value="<?= $w('name') ?>" required autocomplete="family-name"><?= $e('name') ?></div>
      </div>
      <div class="two">
        <div class="fld"><label for="we">E-Mail</label>
          <input id="we" type="email" name="email" value="<?= $w('email') ?>" required autocomplete="email"><?= $e('email') ?></div>
        <div class="fld"><label for="wt">Telefon (freiwillig)</label>
          <input id="wt" type="tel" name="telefon" value="<?= $w('telefon') ?>" autocomplete="tel"><?= $e('telefon') ?></div>
      </div>
      <div class="fld"><label for="wm">Nachricht (freiwillig)</label>
        <textarea id="wm" name="nachricht"><?= $w('nachricht') ?></textarea></div>
      <p class="fine" style="color:var(--mute)">Wir speichern deine Angaben nur, um dich zu
        benachrichtigen, und löschen sie, sobald sich der Eintrag erledigt hat. Näheres in der
        <a href="datenschutz.php">Datenschutzerklärung</a>.</p>
      <button class="send" type="submit">Auf die Warteliste</button>
    </form>
  <?php else: ?>
    <?php if (isset($fehler['_'])): ?><div class="banner"><?= h($fehler['_']) ?></div><?php endif ?>
    <?php if ($fehler && !isset($fehler['_'])): ?>
      <div class="banner">Bitte schau dir die markierten Felder noch einmal an.</div>
    <?php endif ?>
    <p><?= nl2br(h($c['signup']['intro'])) ?></p>

    <form method="post" novalidate>
      <div class="hp" aria-hidden="true">
        <label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
      </div>
      <input type="hidden" name="ts" value="<?= time() ?>">
      <?php if ($istTermin): ?>
        <input type="hidden" name="event" value="<?= h((string)$termin['id']) ?>">
      <?php endif ?>

      <div class="two">
        <div class="fld"><label for="vorname">Vorname</label>
          <input id="vorname" type="text" name="vorname" value="<?= $w('vorname') ?>" required autocomplete="given-name"><?= $e('vorname') ?></div>
        <div class="fld"><label for="name">Name</label>
          <input id="name" type="text" name="name" value="<?= $w('name') ?>" required autocomplete="family-name"><?= $e('name') ?></div>
      </div>
      <div class="two">
        <div class="fld"><label for="email">E-Mail</label>
          <input id="email" type="email" name="email" value="<?= $w('email') ?>" required autocomplete="email"><?= $e('email') ?></div>
        <div class="fld"><label for="telefon">Telefon</label>
          <input id="telefon" type="tel" name="telefon" value="<?= $w('telefon') ?>" required autocomplete="tel"><?= $e('telefon') ?></div>
      </div>

      <div class="fld"><label for="geburtsdatum">Geburtsdatum <span style="text-transform:none;letter-spacing:0">(TT.MM.JJJJ)</span></label>
        <input id="geburtsdatum" type="text" name="geburtsdatum" value="<?= $w('geburtsdatum') ?>"
               required inputmode="numeric" autocomplete="bday" placeholder="TT.MM.JJJJ" maxlength="10">
        <span class="fine" style="color:var(--mute);display:block" id="alter-echo">Teilnahme ab <?= FF_MIN_AGE ?> Jahren.</span><?= $e('geburtsdatum') ?></div>

      <!-- erscheint nur bei 16 oder 17 -->
      <div class="grp" id="gv">
        <legend>Einwilligung der erziehungsberechtigten Person</legend>
        <div class="fld"><label for="gv_name">Name</label>
          <input id="gv_name" type="text" name="gv_name" value="<?= $w('gv_name') ?>"><?= $e('gv_name') ?></div>
        <div class="fld" style="margin-bottom:0"><label for="gv_email">E-Mail</label>
          <input id="gv_email" type="email" name="gv_email" value="<?= $w('gv_email') ?>">
          <span class="fine" style="color:var(--mute);display:block">Diese Person erhält eine Kopie der Bestätigung.</span><?= $e('gv_email') ?></div>
      </div>

      <fieldset class="grp">
        <legend>Gesundheit</legend>
        <label class="opt"><input type="radio" name="gesundheit" value="nein" <?= ($alt['gesundheit'] ?? '') === 'nein' ? 'checked' : '' ?>>
          <span>Mir sind keine gesundheitlichen Gründe bekannt, die gegen intensives Training sprechen.</span></label>
        <label class="opt"><input type="radio" name="gesundheit" value="ja" <?= ($alt['gesundheit'] ?? '') === 'ja' ? 'checked' : '' ?>>
          <span>Ich habe Verletzungen, Vorerkrankungen, Einschränkungen oder bin schwanger.</span></label>
        <?= $e('gesundheit') ?>
        <div class="fld" id="ges" style="margin:1rem 0 0">
          <label for="gesundheit_text">Worum geht es?</label>
          <textarea id="gesundheit_text" name="gesundheit_text"><?= $w('gesundheit_text') ?></textarea>
          <span class="fine" style="color:var(--mute);display:block">Bleibt vertraulich und dient nur der Trainingsplanung.</span><?= $e('gesundheit_text') ?></div>
      </fieldset>

      <div class="fld"><label for="nachricht">Nachricht (freiwillig)</label>
        <textarea id="nachricht" name="nachricht"><?= $w('nachricht') ?></textarea></div>

      <fieldset class="grp">
        <legend>Zustimmung</legend>
        <label class="opt"><input type="checkbox" name="agb" value="1" <?= !empty($alt['agb']) ? 'checked' : '' ?>>
          <span>Ich akzeptiere die <a href="agb.php">AGB</a> und habe die
            <a href="datenschutz.php">Datenschutzerklärung</a> gelesen.</span></label>
        <?= $e('agb') ?>
        <label class="opt"><input type="checkbox" name="fotos" value="1" <?= !empty($alt['fotos']) ? 'checked' : '' ?>>
          <span>Fotos von mir dürfen für die Kommunikation von COMBAT MIND verwendet werden.
            Freiwillig und jederzeit widerrufbar.</span></label>
      </fieldset>

      <button class="send" type="submit">Anmeldung absenden</button>
    </form>
  <?php endif ?>
</main>

<script>
(() => {
  // Gilt für beide Formulare: Nach dem ersten Klick ist Schluss.
  document.querySelectorAll('form[method=post]').forEach((f) => {
    f.addEventListener('submit', () => {
      const knopf = f.querySelector('button[type=submit]');
      if (!knopf) return;
      setTimeout(() => { knopf.disabled = true; knopf.textContent = 'Wird gesendet …'; }, 0);
    });
  });

  const geb = document.getElementById('geburtsdatum'), gv = document.getElementById('gv');
  if (!geb) return;                       // Warteliste: die Felder unten gibt es nicht

  // Punkte beim Tippen selbst setzen, damit TT.MM.JJJJ von allein entsteht.
  geb.addEventListener('input', () => {
    const amEnde = geb.selectionStart === geb.value.length;
    const z = geb.value.replace(/\D/g, '').slice(0, 8);
    const teile = [z.slice(0, 2), z.slice(2, 4), z.slice(4, 8)].filter((t) => t !== '');
    const neu = teile.join('.');
    if (neu !== geb.value && amEnde) geb.value = neu;
  });

  const datum = (s) => {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
    if (!m) return null;
    const [, t, mo, j] = m.map(Number);
    const d = new Date(j, mo - 1, t);
    // Der 31. Februar würde sonst stillschweigend zum 3. März.
    return d.getFullYear() === j && d.getMonth() === mo - 1 && d.getDate() === t ? d : null;
  };
  const jahre = (s) => {
    const d = datum(s); if (!d) return null;
    const h = new Date(); let a = h.getFullYear() - d.getFullYear();
    const m = h.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && h.getDate() < d.getDate())) a--;
    return a;
  };
  // Das errechnete Alter sofort anzeigen: Wer Tag und Monat vertauscht — je nach
  // Spracheinstellung des Browsers steht der Monat vorn — sieht es hier sofort.
  const echo = document.getElementById('alter-echo');
  const standard = echo.textContent;
  const pruef = () => {
    const a = jahre(geb.value);
    gv.hidden = !(a !== null && a >= 16 && a < 18);
    if (a === null || a < 0 || a > 120) { echo.textContent = standard; return; }
    echo.textContent = 'Das ergibt ' + a + ' Jahre (geboren am '
      + datum(geb.value).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }) + ').';
  };
  geb.addEventListener('change', pruef); geb.addEventListener('input', pruef); pruef();

  document.querySelectorAll('.err').forEach((meldung) => {
    const feld = meldung.parentElement.querySelector('input, textarea');
    if (!feld) return;
    const weg = () => meldung.remove();
    feld.addEventListener('input', weg, { once: true });
    feld.addEventListener('change', weg, { once: true });
  });

  // Zweimal klicken erzeugte sonst zwei Anmeldungen — und zog zwei Plätze ab.
  // Der Server weist Dubletten ohnehin ab; hier geht es darum, dass niemand
  // erst gar nicht in die Verlegenheit kommt.
  const ges = document.getElementById('ges');
  const radios = document.querySelectorAll('input[name=gesundheit]');
  const pruef2 = () => { ges.hidden = !document.querySelector('input[name=gesundheit][value=ja]').checked; };
  radios.forEach((r) => r.addEventListener('change', pruef2)); pruef2();
})();
</script>
<?php legal_foot();
