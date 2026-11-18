<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/core.php';
auth_logout();
header('Location: index.php');
