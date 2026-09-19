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
$soldOut = !empty($c['program']['sold_out']);
$fehler  = [];
$alt     = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$soldOut) {
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
            if (!signup_store($d)) {
                $fehler['_'] = 'Speichern fehlgeschlagen. Melde dich bitte direkt per E-Mail.';
            } else {
                signup_rate_hit();
                $an = trim((string)$c['contact']['email']);
                if ($an !== '') {
                    $zeilen = [
                        'Neue Anmeldung — COMBAT MIND 12 Week Program', '',
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
                    mail_send($an, 'Neue Anmeldung: ' . signup_name($d), implode("\n", $zeilen), $d['email']);
                }
                $text = str_replace('{vorname}', $d['vorname'], (string)$c['signup']['reply']);
                mail_send($d['email'], 'Deine Anmeldung bei COMBAT MIND', $text);
                if ($d['gv_email'] !== '') {
                    mail_send($d['gv_email'], 'Anmeldung von ' . signup_name($d) . ' bei COMBAT MIND',
                        str_replace('{vorname}', $d['gv_name'], (string)$c['signup']['reply']));
                }
                header('Location: danke.php'); exit;
            }
        }
    }
}

$w = fn(string $k) => h((string)($alt[$k] ?? ''));
$e = fn(string $k) => isset($fehler[$k]) ? '<span class="err">' . h($fehler[$k]) . '</span>' : '';

legal_head('Anmeldung', 'Anmeldung zum COMBAT MIND 12 Week Program in Basel.', 'anmeldung.php');
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
</style>

<main class="form">
  <h1>Anmeldung</h1>

  <?php if ($soldOut): ?>
    <div class="banner">Der aktuelle Durchgang ist ausgebucht. Schreib an
      <a href="mailto:<?= h($c['contact']['email']) ?>"><?= h($c['contact']['email']) ?></a>,
      wir nehmen dich auf die Warteliste.</div>
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
  const geb = document.getElementById('geburtsdatum'), gv = document.getElementById('gv');

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

  const ges = document.getElementById('ges');
  const radios = document.querySelectorAll('input[name=gesundheit]');
  const pruef2 = () => { ges.hidden = !document.querySelector('input[name=gesundheit][value=ja]').checked; };
  radios.forEach((r) => r.addEventListener('change', pruef2)); pruef2();
})();
</script>
<?php legal_foot();
