<?php
require __DIR__ . '/inc/legal.php';
legal_head('Datenschutzerklärung', 'Wie COMBAT MIND Personendaten bearbeitet — Anmeldung, Gesundheitsangaben, Zahlungen, Hosting.');
?>
<header class="doc">
  <div class="shell">
    <h1>Datenschutz&shy;erklärung</h1>
    <p class="stand">Stand: <span class="todo">[Datum einsetzen]</span></p>
  </div>
</header>

<main class="shell">
  <section>
    <h2>Verantwortliche Stelle</h2>
    <p><?= legal_address() ?></p>
    <p>Diese Erklärung beschreibt, welche Personendaten bei der Nutzung dieser Website
    und bei der Anmeldung zum 12 WEEK PROGRAM bearbeitet werden. Es gilt das Schweizer
    Datenschutzgesetz (DSG).</p>
  </section>

  <section>
    <h2>Hosting</h2>
    <p>Die Website wird bei der <strong>hosttech GmbH</strong> in der Schweiz gehostet.
    Beim Aufruf der Seite werden technisch notwendige Serverdaten verarbeitet — IP-Adresse,
    Datum und Uhrzeit, aufgerufene Seite, Browsertyp. Diese Daten dienen dem sicheren
    Betrieb und werden nicht zur Identifikation einzelner Personen verwendet.</p>
  </section>

  <section>
    <h2>Anmeldeformular</h2>
    <p>Die Anmeldung läuft über <strong>Tally</strong> (Tally BV, Belgien). Dabei werden
    die von dir eingegebenen Daten an Tally übermittelt und dort gespeichert:</p>
    <ul>
      <li>Vorname, Nachname, Geburtsdatum</li>
      <li>E-Mail-Adresse und Mobilnummer</li>
      <li>Notfallkontakt (Name und Telefonnummer)</li>
      <li>Angaben zur Trainingserfahrung</li>
      <li>gewählte Zahlungsart</li>
      <li>erteilte Einwilligungen</li>
    </ul>
    <p>Diese Daten werden ausschliesslich zur Abwicklung deiner Anmeldung und zur
    Durchführung des Trainings verwendet. Sie werden nicht verkauft und nicht für
    Werbung Dritter genutzt.</p>
  </section>

  <section>
    <h2>Gesundheitsangaben</h2>
    <p>Im Anmeldeformular kannst du Verletzungen, körperliche Einschränkungen oder andere
    gesundheitliche Umstände angeben. Das dient einzig einer sicheren Trainingsgestaltung.</p>
    <p>Gesundheitsdaten sind <strong>besonders schützenswerte Personendaten</strong>. Sie
    werden nur mit deiner ausdrücklichen, separaten Einwilligung bearbeitet, sind
    ausschliesslich der Kursleitung zugänglich und werden nicht an Dritte weitergegeben.
    Die Einwilligung kann jederzeit per E-Mail widerrufen werden.</p>
  </section>

  <section>
    <h2>Zahlungen</h2>
    <p>Für die Bezahlung stehen TWINT, Kredit- und Debitkarte über <strong>Stripe</strong>
    sowie Banküberweisung zur Verfügung. Zahlungsdaten wie Kartennummern werden
    ausschliesslich beim jeweiligen Zahlungsdienstleister eingegeben und verarbeitet —
    COMBAT MIND erhält und speichert keine Kartendaten.</p>
    <p>Bei einer Banküberweisung werden die üblichen Zahlungsangaben über die
    beteiligten Banken abgewickelt.</p>
  </section>

  <section>
    <h2>Foto- und Videoaufnahmen</h2>
    <p>Im Training entstehen gelegentlich Foto- und Videoaufnahmen für die Kommunikation
    von COMBAT MIND. Die Einwilligung dazu ist <strong>freiwillig und separat</strong> —
    sie ist keine Bedingung für die Teilnahme und kann jederzeit formlos per E-Mail
    widerrufen werden.</p>
  </section>

  <section>
    <h2>Analyse und Tracking</h2>
    <p>Diese Website verwendet <strong>keine Analyse-Tools, keine Werbe-Pixel und keine
    Tracking-Cookies</strong>. Es findet keine Auswertung des Nutzungsverhaltens statt.</p>
    <p>Externe Schriftarten werden von Google Fonts geladen; dabei wird die IP-Adresse an
    Google übermittelt. <span class="todo">[Falls das vermieden werden soll: Schriften
    lokal einbinden — sag Bescheid, das ist schnell gemacht.]</span></p>
  </section>

  <section>
    <h2>Aufbewahrung</h2>
    <p>Anmeldedaten werden so lange aufbewahrt, wie es für die Durchführung des Kurses und
    die gesetzlichen Aufbewahrungspflichten nötig ist. Gesundheitsangaben werden nach
    Kursende gelöscht.</p>
  </section>

  <section>
    <h2>Deine Rechte</h2>
    <p>Du hast das Recht auf Auskunft über die zu deiner Person bearbeiteten Daten sowie
    auf Berichtigung oder Löschung. Erteilte Einwilligungen kannst du jederzeit widerrufen.
    Eine formlose E-Mail genügt.</p>
  </section>

  <section>
    <h2>Änderungen</h2>
    <p>Diese Datenschutzerklärung kann angepasst werden. Massgebend ist die jeweils auf
    dieser Seite veröffentlichte Fassung.</p>
  </section>

  <div class="note">
    <b>Hinweis zu diesem Dokument</b>
    <p>Entwurf auf Basis des Briefings, keine Rechtsberatung. Falls bereits eine fertige
    Datenschutzerklärung vorliegt, ersetzt diese den Text hier. Wichtig: Werden später
    Google Analytics, Meta Pixel, ein Newsletter oder YouTube-/Instagram-Einbettungen
    ergänzt, muss dieser Text vorher angepasst werden. Diesen Hinweis vor dem Livegang
    entfernen.</p>
  </div>
</main>
<?php legal_foot();
