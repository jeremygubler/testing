<?php
/**
 * E-Mail-Versand.
 *
 * Bewusst über die PHP-Funktion mail() und damit über cyons eigenen Mailserver.
 * Das ist der Punkt, auf den es bei der Zustellbarkeit ankommt: Die Mail geht
 * von demselben Haus aus, das im SPF-Eintrag der Domain steht, und wird dort
 * signiert. Ein selbstgebauter SMTP-Versand über dieselben Server brächte
 * nichts ausser mehr Code, der schiefgehen kann.
 *
 * Entscheidend ist dafür eine Regel: Absender ist immer eine Adresse der
 * eigenen Domain. Die Adresse der anmeldenden Person steht in Reply-To. Wer
 * fremde Adressen als Absender einträgt, scheitert an SPF und DMARC und landet
 * im Spam — der häufigste Fehler bei Formularmails überhaupt.
 */
declare(strict_types=1);

require_once __DIR__ . '/core.php';

/** Absenderadresse aus dem Admin, sonst die Kontaktadresse. */
function mailer_from(): string {
    $c = ff_content();
    $from = trim((string)($c['signup']['from'] ?? ''));
    if ($from === '' || !filter_var($from, FILTER_VALIDATE_EMAIL)) {
        $from = trim((string)$c['contact']['email']);
    }
    return filter_var($from, FILTER_VALIDATE_EMAIL) ? $from : '';
}

/** Betreffzeilen dürfen keine Umlaute im Klartext enthalten. */
function mailer_subject(string $s): string {
    return preg_match('/[\x80-\xFF]/', $s)
        ? '=?UTF-8?B?' . base64_encode($s) . '?='
        : $s;
}

/**
 * Eine Textmail verschicken. Kopfzeilen werden gegen eingeschleuste Zeilen
 * geprüft — eine E-Mail-Adresse aus einem Formular ist fremde Eingabe.
 */
/**
 * Eine Textmail verschicken, wahlweise mit einem Anhang.
 *
 * $anhang: ['name' => 'training.ics', 'type' => 'text/calendar; charset=UTF-8',
 *           'data' => '...']
 */
function mail_send(string $to, string $subject, string $body, string $replyTo = '',
                   ?array $anhang = null): bool {
    $from = mailer_from();
    if ($from === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    foreach ([$to, $from, $replyTo, $subject] as $teil) {
        if (preg_match('/[\r\n]/', $teil)) return false;
    }

    $kopf = [
        'From: COMBAT MIND <' . $from . '>',
        'MIME-Version: 1.0',
        'X-Mailer: combat-mind',
    ];
    if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $kopf[] = 'Reply-To: ' . $replyTo;
    }

    $body = str_replace("\r\n", "\n", $body);

    if ($anhang === null) {
        $kopf[] = 'Content-Type: text/plain; charset=UTF-8';
        $kopf[] = 'Content-Transfer-Encoding: 8bit';
        $inhalt = $body;
    } else {
        // Der Dateiname kommt aus dem eigenen Code, wird aber trotzdem auf
        // Harmloses beschränkt — Kopfzeilen sind kein Ort für Überraschungen.
        $name = preg_replace('/[^A-Za-z0-9._-]/', '', (string)$anhang['name']) ?: 'anhang.txt';
        $typ  = preg_replace('/[^A-Za-z0-9\/;=+.\- ]/', '', (string)$anhang['type']) ?: 'application/octet-stream';
        $g    = '=_cm_' . bin2hex(random_bytes(12));

        $kopf[] = 'Content-Type: multipart/mixed; boundary="' . $g . '"';
        $inhalt = "--$g\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . str_replace("\n", "\r\n", $body) . "\r\n\r\n"
            . "--$g\r\n"
            . 'Content-Type: ' . $typ . '; name="' . $name . "\"\r\n"
            . "Content-Transfer-Encoding: base64\r\n"
            . 'Content-Disposition: attachment; filename="' . $name . "\"\r\n\r\n"
            . chunk_split(base64_encode((string)$anhang['data']))
            . "--$g--\r\n";
    }

    return @mail($to, mailer_subject($subject), $inhalt, implode("\r\n", $kopf), '-f' . $from);
}
