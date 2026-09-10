<?php
declare(strict_types=1);
require_once __DIR__ . '/_layout.php';
auth_require();

$err = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $old = (string)($_POST['old'] ?? '');
    $pw  = (string)($_POST['pw'] ?? '');
    $pw2 = (string)($_POST['pw2'] ?? '');
    if (!password_verify($old, auth_config()['hash'] ?? '')) $err = 'Das aktuelle Passwort stimmt nicht.';
    elseif (mb_strlen($pw) < 10) $err = 'Das neue Passwort muss mindestens 10 Zeichen haben.';
    elseif ($pw !== $pw2)        $err = 'Die beiden neuen Passwörter stimmen nicht überein.';
    elseif (!auth_set_password($pw)) $err = 'Speichern fehlgeschlagen.';
    else { flash('Passwort geändert.'); header('Location: index.php'); exit; }
}

admin_head('Passwort');
admin_tabs('passwort.php');
?>
<h1>Passwort ändern</h1>
<p class="sub">Gespeichert wird nur ein Hash — auch ich kann dein Passwort nicht auslesen.</p>
<?php if ($err): ?><div class="flash err"><?= h($err) ?></div><?php endif ?>
<form method="post" class="card" style="max-width:420px">
  <?= csrf_field() ?>
  <label><span class="lbl">Aktuelles Passwort</span>
    <input type="password" name="old" required autocomplete="current-password"></label>
  <label><span class="lbl">Neues Passwort</span>
    <input type="password" name="pw" required minlength="10" autocomplete="new-password"></label>
  <label><span class="lbl">Neues Passwort wiederholen</span>
    <input type="password" name="pw2" required minlength="10" autocomplete="new-password"></label>
  <button class="btn" type="submit">Passwort ändern</button>
</form>
<?php admin_foot();
