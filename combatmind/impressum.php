<?php
require __DIR__ . '/inc/legal.php';
legal_head('Impressum', 'Impressum von COMBAT MIND, Combat Fitness in Basel.');
?>
<header class="doc">
  <div class="shell">
    <h1>Impressum</h1>
  </div>
</header>

<main class="shell">
  <section>
    <h2 class="plain">Verantwortlich für den Inhalt</h2>
    <p><?= legal_address() ?></p>
  </section>

  <section>
    <h2 class="plain">Unternehmen</h2>
    <p>
      Rechtsform: <span class="todo">[Einzelunternehmen / GmbH — nach Gründung eintragen]</span><br>
      UID/MWST-Nummer: <span class="todo">[falls vorhanden]</span>
    </p>
  </section>

  <section>
    <h2 class="plain">Haftungsausschluss</h2>
    <p>Die Inhalte dieser Website wurden mit Sorgfalt erstellt. Für Richtigkeit,
    Vollständigkeit und Aktualität wird keine Gewähr übernommen.</p>
    <p>Für Inhalte externer Websites, auf die verlinkt wird, ist ausschliesslich deren
    Betreiberin oder Betreiber verantwortlich.</p>
  </section>

  <section>
    <h2 class="plain">Urheberrecht</h2>
    <p>Alle Inhalte dieser Website — Texte, Bilder, Logo und Gestaltung — sind
    urheberrechtlich geschützt. Eine Verwendung ausserhalb der gesetzlichen Schranken
    bedarf der vorgängigen schriftlichen Zustimmung.</p>
  </section>

  <div class="note">
    <b>Vor dem Livegang</b>
    <p>Die vollständige Geschäftsadresse, die endgültige E-Mail-Adresse und die
    Rechtsform müssen eingesetzt werden. Alle gold markierten Stellen sind noch offen.</p>
  </div>
</main>
<?php legal_foot();
