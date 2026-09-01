<?php
/**
 * Inhaltsschema: beschreibt jedes bearbeitbare Feld einmal.
 * Das Admin-Formular UND die Standardwerte entstehen hieraus — ein neues Feld
 * hier eintragen genügt, es taucht dann automatisch im Admin auf.
 *
 * Typen: text | textarea | list (eine Zeile = ein Eintrag) | repeater
 */
declare(strict_types=1);

function ff_schema(): array {
    return [
        'hero' => ['label' => 'Startbereich', 'fields' => [
            'eyebrow' => ['text', 'Kleine Zeile oben', 'Premium Combat Fitness · Basel'],
            'line1'   => ['text', 'Überschrift Zeile 1', 'Train like'],
            'line2'   => ['text', 'Überschrift Zeile 2 (weiss)', 'a'],
            'line2b'  => ['text', 'Überschrift Zeile 2 (gold)', 'fighter.'],
            'lead'    => ['text', 'Fettgedruckter Satz', "You don't have to fight to train like a fighter."],
            'sub'     => ['textarea', 'Text darunter', 'Striking, Grappling, Kraft und Konditionstraining — vereint in einem intensiven Ganzkörpertraining.'],
        ]],

        'facts' => ['label' => 'Faktenleiste', 'repeater' => 'Eintrag', 'fields' => [
            'label' => ['text', 'Bezeichnung', ''],
            'value' => ['text', 'Wert', ''],
            'note'  => ['text', 'Zusatz', ''],
        ], 'default' => [
            ['label' => 'Start',  'value' => '12. Okt 2026', 'note' => 'Montag, 12:00–13:00'],
            ['label' => 'Dauer',  'value' => '12 Wochen',    'note' => '12 Sessions'],
            ['label' => 'Ort',    'value' => 'Basel',        'note' => 'Blotzheimerstrasse'],
            ['label' => 'Gruppe', 'value' => 'Max. 16',      'note' => 'Teilnehmer pro Kurs'],
        ]],

        'about' => ['label' => 'Was ist FightFit', 'fields' => [
            'eyebrow' => ['text', 'Kleine Zeile', 'Was ist FightFit'],
            'h1'      => ['text', 'Überschrift Zeile 1', 'Kämpfen'],
            'h2'      => ['text', 'Überschrift Zeile 2', 'musst du'],
            'h3'      => ['text', 'Überschrift Zeile 3 (gold)', 'nicht.'],
            'body'    => ['textarea', 'Fliesstext (Leerzeile = neuer Absatz)',
                          "FightFit verbindet Elemente aus Striking, Grappling, Kraft- und Konditionstraining zu einem intensiven Ganzkörpertraining.\n\nDu trainierst wie ein Fighter — ohne kämpfen zu müssen. Keine Kampfsporterfahrung notwendig, kein Sparring. Im Mittelpunkt stehen Technik, Athletik, Kraft, Ausdauer und das Fighter Mindset.\n\nKein klassisches Kampfsport-Gym. Ein Training, das dich fordert, technisch sauber aufbaut und dich Woche für Woche stärker macht."],
            'tags'    => ['list', 'Badges (eine pro Zeile)', "Beginner friendly\nNo fighting\nNo sparring\nNo experience needed"],
        ]],

        'pillars' => ['label' => 'Die 5 Bereiche', 'repeater' => 'Bereich', 'fields' => [
            'title' => ['text', 'Titel', ''],
            'text'  => ['textarea', 'Beschreibung', ''],
        ], 'default' => [
            ['title' => 'Striking',     'text' => 'Boxing & Kickboxing Fundamentals — Technik, Distanz und saubere Schlagmechanik.'],
            ['title' => 'Grappling',    'text' => 'Kontrolle, Bewegung und Partnerwork — Körperbeherrschung statt Kraftakt.'],
            ['title' => 'Strength',     'text' => 'Functional Strength — Kraft, die im Training und im Alltag trägt.'],
            ['title' => 'Conditioning', 'text' => 'Fighter-style Conditioning — Intervalle, Rounds und echte Ausdauer.'],
            ['title' => 'Mindset',      'text' => 'Challenge yourself. Get stronger. Der Kopf entscheidet, wie weit du gehst.'],
        ]],

        'coach' => ['label' => 'Dein Coach', 'fields' => [
            'name'  => ['text', 'Name', ''],
            'role'  => ['text', 'Rolle', 'Head Coach · FIGHTFIT'],
            'bio'   => ['textarea', 'Bio (Leerzeile = neuer Absatz)', ''],
            'creds' => ['list', 'Qualifikationen (eine pro Zeile)', ''],
            'quote' => ['textarea', 'Zitat', ''],
            'photo' => ['text', 'Foto (Dateiname in assets/)', ''],
        ]],

        'program' => ['label' => '12 Week Program', 'fields' => [
            'badge'      => ['text', 'Badge', 'Hauptangebot'],
            'title'      => ['text', 'Titel', 'FightFit'],
            'title_gold' => ['text', 'Titel (gold)', '12 Week Program'],
            'lede'       => ['textarea', 'Einleitung', 'Zwölf Wochen, zwölf Sessions, eine feste Gruppe. Strukturierter Aufbau von Technik, Kraft und Kondition — vom ersten Tag an beginner friendly.'],
            'price'      => ['text', 'Preis (nur Zahl)', '299'],
            'price_note' => ['textarea', 'Hinweis beim Preis', "12 Wochen · 12 Sessions · alles inklusive.\nPlätze limitiert auf 16 Teilnehmer."],
            'checks'     => ['list', 'Häkchen-Liste (eine pro Zeile)',
                             "Beginner friendly — jedes Level startet hier.\nNo fighting. No sparring. No experience needed.\nFeste Gruppe, persönliches Coaching, klarer Aufbau."],
        ]],

        'specs' => ['label' => 'Program — Eckdaten', 'repeater' => 'Eckdatum', 'fields' => [
            'label' => ['text', 'Bezeichnung', ''],
            'value' => ['text', 'Wert', ''],
        ], 'default' => [
            ['label' => 'Start',  'value' => 'Montag, 12. Oktober 2026'],
            ['label' => 'Zeit',   'value' => 'Montag · 12:00–13:00 Uhr'],
            ['label' => 'Ort',    'value' => 'Basel, Blotzheimerstrasse'],
            ['label' => 'Gruppe', 'value' => 'Max. 16 Teilnehmer'],
        ]],

        'open' => ['label' => 'FightFit Open', 'fields' => [
            'eyebrow'   => ['text', 'Kleine Zeile', 'Zusätzliches Angebot'],
            'title'     => ['text', 'Titel', 'FightFit'],
            'title_gold'=> ['text', 'Titel (gold)', 'Open'],
            'lede'      => ['textarea', 'Text', 'Drop-in Combat Fitness — ohne Abo, ohne Kursbindung. Komm vorbei, trainier eine Runde wie ein Fighter.'],
            'tags'      => ['list', 'Schlagworte (eine pro Zeile)', "Striking\nGrappling\nStrength\nConditioning"],
            'day'       => ['text', 'Tag', 'Samstag'],
            'time'      => ['text', 'Zeit', '13:00–14:00'],
            'note'      => ['text', 'Zusatz', 'Drop-in · Basel, Blotzheimerstrasse'],
        ]],

        'events' => ['label' => 'Termine', 'fields' => [
            'eyebrow' => ['text', 'Kleine Zeile', 'Termine'],
            'title'   => ['text', 'Überschrift', 'Nächste'],
            'title_gold' => ['text', 'Überschrift (gold)', 'Termine.'],
            'lede'    => ['textarea', 'Einleitung', 'Alle kommenden Kursstarts, Open-Samstage und Pausen auf einen Blick.'],
        ]],

        'gallery' => ['label' => 'Galerie', 'fields' => [
            'eyebrow' => ['text', 'Kleine Zeile', 'Einblicke'],
            'title'   => ['text', 'Überschrift', 'Aus dem'],
            'title_gold' => ['text', 'Überschrift (gold)', 'Training.'],
        ]],

        'band' => ['label' => 'Abschluss-Banner', 'fields' => [
            'eyebrow' => ['text', 'Kleine Zeile', 'Bereit?'],
            'h1'      => ['text', 'Überschrift Zeile 1', 'Train like'],
            'h2'      => ['text', 'Überschrift Zeile 2 (weiss)', 'a'],
            'h2b'     => ['text', 'Überschrift Zeile 2 (gold)', 'fighter.'],
            'text'    => ['textarea', 'Text', 'Max. 16 Plätze im 12 Week Program. Sichere dir deinen Platz — oder stell uns vorher deine Fragen.'],
        ]],

        'contact' => ['label' => 'Kontakt & Footer', 'fields' => [
            'email'   => ['text', 'E-Mail', 'info@fightfit-bs.ch'],
            'street'  => ['text', 'Strasse', 'Blotzheimerstrasse'],
            'city'    => ['text', 'PLZ und Ort', '4055 Basel'],
            'about'   => ['textarea', 'Footer-Text', 'Premium Combat Fitness in Basel. Striking · Grappling · Strength · Conditioning · Mindset.'],
            'form_url'=> ['text', 'Anmeldeformular (Tally-Link)', 'https://tally.so/r/lbE7e5'],
            'form_id' => ['text', 'Tally Formular-ID', 'lbE7e5'],
        ]],
    ];
}

/** Standardinhalt aus dem Schema — greift, solange nichts gespeichert wurde. */
function ff_defaults(): array {
    $out = [];
    foreach (ff_schema() as $sec => $def) {
        if (isset($def['repeater'])) { $out[$sec] = $def['default'] ?? []; continue; }
        foreach ($def['fields'] as $key => [$type, , $default]) {
            $out[$sec][$key] = $type === 'list' ? array_values(array_filter(array_map('trim', explode("\n", $default)), 'strlen')) : $default;
        }
    }
    return $out;
}

/** Gespeicherten Inhalt über die Standardwerte legen. */
function ff_content(): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    $saved = json_read('content.json');
    $out = ff_defaults();
    foreach ($saved as $sec => $val) {
        if (!isset($out[$sec])) continue;
        $out[$sec] = is_array($val) && !isset($out[$sec][0]) && !array_is_list($val)
            ? array_merge($out[$sec], $val) : $val;
    }
    return $cache = $out;
}
