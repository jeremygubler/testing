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
function mail_send(string $to, string $subject, string $body, string $replyTo = ''): bool {
    $from = mailer_from();
    if ($from === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    foreach ([$to, $from, $replyTo, $subject] as $teil) {
        if (preg_match('/[\r\n]/', $teil)) return false;
    }

    $kopf = [
        'From: COMBAT MIND <' . $from . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'X-Mailer: combat-mind',
    ];
    if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $kopf[] = 'Reply-To: ' . $replyTo;
    }

    $body = str_replace("\r\n", "\n", $body);
    return @mail($to, mailer_subject($subject), $body, implode("\r\n", $kopf), '-f' . $from);
}
