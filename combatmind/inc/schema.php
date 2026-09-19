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
            'brand'   => ['text', 'Markenname (H1, weiss)', 'Combat'],
            'brand2'  => ['text', 'Markenname (H1, gold)', 'Mind'],
            'claim'   => ['text', 'Claim (H1, Teil 2)', 'Train like a fighter.'],
            'pillars' => ['text', 'Bereichszeile', 'Striking · Grappling · Strength · Conditioning · Mindset'],
            'lead'    => ['text', 'Fettgedruckter Satz', 'Trainiere wie ein Fighter – ohne einer sein zu müssen.'],
            'sub'     => ['textarea', 'Text darunter', '12 Wochen. 1 Training pro Woche. Ein System für Körper und Kopf.'],
            'cta'     => ['text', 'Haupt-Button', 'Secure your spot'],
            'cta2'    => ['text', 'Zweiter Button', 'Discover the program'],
            'photo'   => ['text', 'Hintergrundbild (Dateiname in assets/)', ''],
        ]],

        'facts' => ['label' => 'Faktenleiste', 'repeater' => 'Eintrag', 'fields' => [
            'label' => ['text', 'Bezeichnung', ''],
            'value' => ['text', 'Wert', ''],
            'note'  => ['text', 'Zusatz', ''],
        ], 'default' => [
            ['label' => 'Start',  'value' => '12. Okt 2026', 'note' => 'bis 28. Dezember'],
            ['label' => 'Rhythmus', 'value' => '1× pro Woche', 'note' => 'Montag, 12:00–13:00'],
            ['label' => 'Ort',    'value' => 'Basel',        'note' => 'Trainingsort folgt'],
            ['label' => 'Plätze', 'value' => 'Max. 16',      'note' => 'ab 16 Jahren'],
        ]],

        'concept' => ['label' => 'Concept', 'fields' => [
            'eyebrow' => ['text', 'Kleine Zeile', 'Concept'],
            'h1'      => ['text', 'Überschrift Zeile 1', "You don't have to fight"],
            'h2'      => ['text', 'Überschrift Zeile 2', 'to train like'],
            'h3'      => ['text', 'Überschrift Zeile 3 (gold)', 'a fighter.'],
            'body'    => ['textarea', 'Fliesstext (Leerzeile = neuer Absatz)',
                          "COMBAT MIND verbindet Elemente aus Kampfsport und funktionellem Training zu einem strukturierten 60-Minuten-Workout.\n\nDu lernst sichere Basics aus Striking und Grappling, entwickelst Kraft und Kondition und trainierst gleichzeitig Fokus, Disziplin und mentale Widerstandsfähigkeit."],
            'tags'    => ['list', 'Badges (eine pro Zeile)', "Kein Sparring-Zwang\nKeine Kampfsporterfahrung nötig\nKeine klassische Fight School"],
        ]],

        'pillars' => ['label' => 'Die 5 Bereiche', 'repeater' => 'Bereich', 'fields' => [
            'title' => ['text', 'Titel', ''],
            'text'  => ['textarea', 'Beschreibung', ''],
        ], 'default' => [
            ['title' => 'Striking',     'text' => 'Basics, Technik, Kombinationen, Reaktion.'],
            ['title' => 'Grappling',    'text' => 'Kontrollierte, anfängerfreundliche Partnerarbeit und Bewegungsmuster.'],
            ['title' => 'Strength',     'text' => 'Funktionelle Kraft für einen belastbaren Körper.'],
            ['title' => 'Conditioning', 'text' => 'Fighter-typische Ausdauer, Explosivität und Work Capacity.'],
            ['title' => 'Mindset',      'text' => 'Fokus, Disziplin, Selbstkontrolle, Resilienz und der Umgang mit Herausforderung.'],
        ]],

        'program' => ['label' => '12 Week Program', 'fields' => [
            'badge'      => ['text', 'Badge', 'Das Programm'],
            'title'      => ['text', 'Titel', '12 Week'],
            'title_gold' => ['text', 'Titel (gold)', 'Program'],
            'lede'       => ['textarea', 'Einleitung', 'Zwölf Wochen, ein Training pro Woche, eine feste Gruppe. Ab 16 Jahren — geeignet für Einsteiger und sportliche Teilnehmer, mit oder ohne Kampfsporterfahrung.'],
            'price'      => ['text', 'Preis (nur Zahl)', '299'],
            'price_note' => ['textarea', 'Hinweis beim Preis', "12 × 60 Minuten · alles inklusive.\nMaximal 16 Plätze."],
            'cta'        => ['text', 'Button', 'Secure my spot'],
            'seats_total'  => ['text', 'Plätze insgesamt', '16'],
            'seats_left'   => ['text', 'Noch freie Plätze (leer = keine Anzeige)', ''],
            'sold_out'     => ['bool', 'Kurs ist ausgebucht', ''],
            'waitlist_cta' => ['text', 'Button-Text bei ausgebucht', 'Auf die Warteliste'],
            'waitlist_url' => ['text', 'Warteliste — Formular-Link', ''],
            'waitlist_id'  => ['text', 'Warteliste — Tally Formular-ID', ''],
            'checks'     => ['list', 'Häkchen-Liste (eine pro Zeile)',
                             "Keine Kampfsporterfahrung nötig.\nKein Sparring-Zwang.\nFeste Gruppe, persönliches Coaching, klarer Aufbau."],
        ]],

        'specs' => ['label' => 'Program — Eckdaten', 'repeater' => 'Eckdatum', 'fields' => [
            'label' => ['text', 'Bezeichnung', ''],
            'value' => ['text', 'Wert', ''],
        ], 'default' => [
            ['label' => 'Zeitraum', 'value' => '12. Oktober – 28. Dezember 2026'],
            ['label' => 'Zeit',     'value' => 'Montag · 12:00–13:00 Uhr'],
            ['label' => 'Umfang',   'value' => '12 × 60 Minuten'],
            ['label' => 'Ort',      'value' => 'Basel'],
        ]],

        'progression' => ['label' => 'Progression — Kopfbereich', 'fields' => [
            'eyebrow' => ['text', 'Kleine Zeile', 'Progression'],
            'title'   => ['text', 'Überschrift', '12 Wochen,'],
            'title_gold' => ['text', 'Überschrift (gold)', 'ein Aufbau.'],
            'lede'    => ['textarea', 'Einleitung', 'Jede Woche hat einen Schwerpunkt. Was du in Woche 1 lernst, trägt bis zum Fight Day in Woche 12.'],
        ]],

        'weeks' => ['label' => 'Progression — Wochen', 'repeater' => 'Woche', 'fields' => [
            'title' => ['text', 'Titel', ''],
        ], 'default' => [
            ['title' => 'Boxing I'], ['title' => 'Boxing II'], ['title' => 'Kickboxing I'],
            ['title' => 'Fighter Engine'], ['title' => 'Grappling I'], ['title' => 'Grappling II'],
            ['title' => 'Striking Combinations'], ['title' => 'MMA Flow'], ['title' => 'Speed & Reaction'],
            ['title' => 'Fighter Strength'], ['title' => 'Challenge Prep'], ['title' => 'Fight Day'],
        ]],

        'coach' => ['label' => 'Meet your Coach', 'fields' => [
            'eyebrow' => ['text', 'Kleine Zeile', 'Meet your Coach'],
            'name'  => ['text', 'Name', 'Jocelyn'],
            'role'  => ['text', 'Rolle', 'Inhaberin & Coach · Combat Mind'],
            'bio'   => ['textarea', 'Bio (Leerzeile = neuer Absatz)',
                        "Jocelyn Gubler ist Judo-Schwarzgurt, BJJ Blue Belt und verfügt über langjährige Erfahrung im Training und Coaching.\n\nSie trainiert selbst aktiv in verschiedenen Bereichen des Kampfsports und verbindet in COMBAT MIND ihre Erfahrung aus Judo, Combat Sports und funktionellem Training."],
            'creds' => ['list', 'Qualifikationen (eine pro Zeile)', "Judo-Schwarzgurt\nBJJ Blue Belt\nLangjährige Erfahrung in Training und Coaching\nJudo, Combat Sports & funktionelles Training"],
            'quote' => ['textarea', 'Zitat', 'Du musst nicht kämpfen wollen, um wie ein Fighter zu trainieren.'],
            'photo' => ['text', 'Foto (Dateiname in assets/)', ''],
        ]],

        'faq' => ['label' => 'FAQ — Kopfbereich', 'fields' => [
            'eyebrow' => ['text', 'Kleine Zeile', 'FAQ'],
            'title'   => ['text', 'Überschrift', 'Häufige'],
            'title_gold' => ['text', 'Überschrift (gold)', 'Fragen.'],
        ]],

        'faqs' => ['label' => 'FAQ — Fragen', 'repeater' => 'Frage', 'fields' => [
            'q' => ['text', 'Frage', ''],
            'a' => ['textarea', 'Antwort', ''],
        ], 'default' => [
            ['q' => 'Brauche ich Kampfsporterfahrung?', 'a' => 'Nein.'],
            ['q' => 'Muss ich kämpfen oder sparren?', 'a' => 'Nein. Das 12 WEEK PROGRAM ist Combat Fitness und kein Fight Camp.'],
            ['q' => 'Wie fit muss ich sein?', 'a' => 'Das Training ist fordernd, Übungen können aber angepasst werden.'],
            ['q' => 'Was brauche ich?', 'a' => 'Bequeme Sportkleidung, Trinkflasche und saubere Hallenschuhe bzw. je nach Einheit barfuss. Weitere Ausrüstung wird vor dem Start kommuniziert.'],
            ['q' => 'Was passiert, wenn ich eine Einheit verpasse?', 'a' => 'Verpasste Einheiten werden grundsätzlich nicht rückerstattet oder gutgeschrieben. Details gemäss AGB.'],
            ['q' => 'Wie alt muss ich sein?', 'a' => 'Ab 16 Jahren. Unter 18 brauchst du die schriftliche Einwilligung deiner Eltern oder erziehungsberechtigten Person.'],
            ['q' => 'Wie viele Plätze gibt es?', 'a' => 'Maximal 16.'],
        ]],

        'events' => ['label' => 'Termine', 'fields' => [
            'eyebrow' => ['text', 'Kleine Zeile', 'Termine'],
            'title'   => ['text', 'Überschrift', 'Nächste'],
            'title_gold' => ['text', 'Überschrift (gold)', 'Termine.'],
            'lede'    => ['textarea', 'Einleitung', 'Alle kommenden Trainings und Pausen auf einen Blick.'],
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
            'text'    => ['textarea', 'Text', 'Maximal 16 Plätze im 12 Week Program. Sichere dir deinen Platz — oder stell vorher deine Fragen.'],
        ]],

        'contact' => ['label' => 'Kontakt & Footer', 'fields' => [
            'site_url'=> ['text', 'Domain (mit https://, ohne Schrägstrich am Ende)', 'https://combat-mind.ch'],
            'owner'   => ['text', 'Inhaberin', 'Inhaberin Jocelyn Gubler'],
            'email'   => ['text', 'E-Mail', 'info@combat-mind.ch'],
            'address' => ['text', 'Strasse und Hausnummer', 'Blotzheimerstr. 68'],
            'zip'     => ['text', 'PLZ', '4054'],
            'city'    => ['text', 'Ort', 'Basel'],
            'about'   => ['textarea', 'Footer-Text', 'Premium Combat Fitness in Basel. Striking · Grappling · Strength · Conditioning · Mindset.'],
            'form_url'=> ['text', 'Anmeldeformular (Tally-Link)', ''],
            'form_id' => ['text', 'Tally Formular-ID', ''],
        ]],
    ];
}

/** Standardinhalt aus dem Schema — greift, solange nichts gespeichert wurde. */
function ff_defaults(): array {
    $out = [];
    foreach (ff_schema() as $sec => $def) {
        if (isset($def['repeater'])) { $out[$sec] = $def['default'] ?? []; continue; }
        foreach ($def['fields'] as $key => [$type, , $default]) {
            $out[$sec][$key] = match ($type) {
                'list' => array_values(array_filter(array_map('trim', explode("\n", $default)), 'strlen')),
                'bool' => (bool)$default,
                default => $default,
            };
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
        $out[$sec] = is_array($val) && !isset($out[$sec][0]) && !is_list_array($val)
            ? array_merge($out[$sec], $val) : $val;
    }
    return $cache = $out;
}
