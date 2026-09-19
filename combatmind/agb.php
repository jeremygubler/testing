<?php
require __DIR__ . '/inc/legal.php';
$c = ff_content();
legal_head('AGB / Teilnahmebedingungen', 'Teilnahmebedingungen für das COMBAT MIND 12 Week Program in Basel.', 'agb.php');
?>
<header class="doc">
  <div class="shell">
    <h1>AGB &amp; Teilnahme&shy;bedingungen</h1>
    <p class="stand">Stand: <?= h($c['legal']['stand']) ?></p>
  </div>
</header>

<main class="shell">
  <section>
    <h2>Geltungsbereich</h2>
    <p>Diese Bedingungen regeln das Vertragsverhältnis zwischen COMBAT MIND und den
    Teilnehmerinnen und Teilnehmern des 12 WEEK PROGRAM sowie weiterer Angebote.</p>
    <p>Mit der Anmeldung werden diese Bedingungen akzeptiert.</p>
  </section>

  <section>
    <h2>Anbieterin</h2>
    <p><?= legal_address() ?></p>
  </section>

  <section>
    <h2>Anmeldung und Vertragsabschluss</h2>
    <p>Die Anmeldung erfolgt über das Anmeldeformular auf dieser Website. Der Vertrag kommt
    mit der Anmeldebestätigung per E-Mail zustande.</p>
    <p>Die Teilnehmerzahl ist auf <strong><?= h($c['program']['seats_total']) ?> Personen</strong>
    beschränkt. Anmeldungen
    werden in der Reihenfolge ihres Eingangs berücksichtigt.</p>
    <p>Die Anmeldung ist <strong>verbindlich</strong> und personengebunden. Eine Übertragung
    auf Dritte ist nur mit Zustimmung von COMBAT MIND möglich.</p>
    <p>Die Teilnahme setzt ein Mindestalter von <strong>16 Jahren</strong> voraus.
    Teilnehmende unter 18 Jahren benötigen die schriftliche Einwilligung der
    erziehungsberechtigten Person; diese ist vor der ersten Lektion vorzulegen.</p>
  </section>

  <section>
    <h2>Preis und Zahlung</h2>
    <p>Der Preis für das 12 WEEK PROGRAM beträgt <strong>CHF <?= h($c['program']['price']) ?>.–</strong>
    für 12 × 60 Minuten. Alle Beträge verstehen sich in Schweizer Franken.</p>
    <p>COMBAT MIND ist nicht mehrwertsteuerpflichtig. Es wird keine MWST erhoben oder
    ausgewiesen.</p>
    <p>Zur Auswahl stehen TWINT, Kredit- und Debitkarte (Stripe), Apple Pay und Google Pay
    soweit verfügbar, sowie Banküberweisung.</p>
    <p>Der Kursbeitrag ist <strong>innert 10 Tagen nach der Anmeldebestätigung</strong> zu
    bezahlen, spätestens jedoch vor der ersten Lektion.
    Der Platz gilt erst nach Bestätigung und fristgerechtem Zahlungseingang als definitiv
    reserviert. Bei ausbleibender Zahlung kann der Platz neu vergeben werden.</p>
  </section>

  <section>
    <h2>Rücktritt und Stornierung</h2>
    <p>Eine Stornierung ist in Textform an
    <?= $c['contact']['email'] ? '<a href="mailto:' . h($c['contact']['email']) . '">'
        . h($c['contact']['email']) . '</a>' : 'COMBAT MIND' ?> zu richten. Massgebend für
    die Berechnung der Fristen ist der Eingang bei COMBAT MIND.</p>
    <ul>
      <li><strong>Mehr als 14 Tage vor Kursstart:</strong> kostenfrei. Ein bereits bezahlter
      Betrag wird vollständig zurückerstattet.</li>
      <li><strong>14 bis 3 Tage vor Kursstart:</strong> 50 % des Kursbeitrags sind geschuldet.</li>
      <li><strong>Weniger als 3 Tage vor Kursstart oder nach Kursbeginn:</strong> der volle
      Kursbeitrag ist geschuldet, eine Rückerstattung erfolgt nicht.</li>
    </ul>
    <p>Wer eine Ersatzperson stellt, welche die Teilnahmebedingungen erfüllt und von
    COMBAT MIND bestätigt wird, wird unabhängig vom Zeitpunkt kostenfrei aus dem Vertrag
    entlassen.</p>
    <p>Verpasste Einheiten werden grundsätzlich <strong>nicht rückerstattet oder
    gutgeschrieben</strong> und können nicht nachgeholt werden.</p>
    <p>Bei längerer Verhinderung aus gesundheitlichen Gründen — nachgewiesen durch ein
    Arztzeugnis — wird gemeinsam nach einer Lösung gesucht, etwa der Übertragung auf einen
    späteren Durchgang.</p>
  </section>

  <section>
    <h2>Ausfall und Änderungen</h2>
    <p>COMBAT MIND kann einzelne Lektionen bei Krankheit der Kursleitung, höherer Gewalt
    oder behördlichen Anordnungen verschieben. Ausgefallene Lektionen werden nachgeholt
    oder anteilig zurückerstattet.</p>
    <p>Kommt ein Durchgang mangels Mindestteilnehmerzahl von
    <strong><?= h($c['legal']['min_gr']) ?> Personen</strong> nicht zustande, wird dies
    spätestens <strong>7 Tage vor Kursstart</strong> mitgeteilt und der bezahlte Betrag
    vollständig zurückerstattet. Weitergehende Ansprüche bestehen nicht.</p>
  </section>

  <section>
    <h2>Gesundheit und Eigenverantwortung</h2>
    <p>Die Teilnahme setzt eine für intensives körperliches Training ausreichende
    Gesundheit voraus. Mit der Anmeldung bestätigst du, dass dir keine gesundheitlichen
    Gründe bekannt sind, die dagegen sprechen.</p>
    <p>Verletzungen, Vorerkrankungen, Einschränkungen und eine Schwangerschaft sind vor
    Trainingsbeginn mitzuteilen. Im Zweifelsfall ist vorgängig ärztlicher Rat einzuholen.</p>
    <p>COMBAT MIND ist <strong>Combat Fitness und kein Fight Camp</strong>. Es besteht kein
    Sparring-Zwang. Partnerübungen im Bereich Grappling finden kontrolliert und ohne
    Widerstandskampf statt.</p>
  </section>

  <section>
    <h2>Haftung</h2>
    <p>Die Teilnahme erfolgt auf eigene Verantwortung und eigenes Risiko. COMBAT MIND haftet
    nur für Schäden aus vorsätzlichem oder grobfahrlässigem Verhalten. Eine weitergehende
    Haftung ist im gesetzlich zulässigen Rahmen ausgeschlossen.</p>
    <p>Für mitgebrachte Wertsachen und Garderobe wird keine Haftung übernommen.</p>
    <p>Der Abschluss einer Unfall- und Krankenversicherung ist Sache der Teilnehmenden.</p>
  </section>

  <section>
    <h2>Verhalten im Training</h2>
    <p>Den Anweisungen der Kursleitung ist Folge zu leisten, respektvoller Umgang wird
    vorausgesetzt.</p>
    <p>Personen, die andere gefährden, wiederholt stören oder unter Einfluss von Alkohol
    oder Drogen erscheinen, können vom Training ausgeschlossen werden. Ein Anspruch auf
    Rückerstattung besteht in diesem Fall nicht.</p>
  </section>

  <section>
    <h2>Bild- und Tonaufnahmen</h2>
    <p>Aufnahmen für die Kommunikation von COMBAT MIND werden nur mit ausdrücklicher,
    freiwilliger Einwilligung veröffentlicht. Die Einwilligung ist keine Bedingung für die
    Teilnahme und kann jederzeit widerrufen werden.</p>
  </section>

  <section>
    <h2>Datenschutz</h2>
    <p>Die Bearbeitung von Personendaten richtet sich nach der
    <a href="datenschutz.php">Datenschutzerklärung</a> und dem Schweizer
    Datenschutzgesetz (DSG).</p>
  </section>

  <section>
    <h2>Anwendbares Recht und Gerichtsstand</h2>
    <p>Es gilt Schweizer Recht. Gerichtsstand ist Basel, soweit nicht zwingende
    gesetzliche Bestimmungen einen anderen Gerichtsstand vorsehen.</p>
  </section>

</main>
<?php legal_foot();
