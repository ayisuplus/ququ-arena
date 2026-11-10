$ErrorActionPreference = 'Stop'
$arenaRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $arenaRoot '.local\sites-executor.json'
if (-not (Test-Path -LiteralPath $configPath)) { throw '尚未配置 Sites 执行器。' }
$logPath = Join-Path $arenaRoot '.local\sites-executor.log'
$errorPath = Join-Path $arenaRoot '.local\sites-executor-error.log'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$process = Start-Process -FilePath $nodePath -ArgumentList @('--use-env-proxy', 'scripts/sites-executor.mjs') -WorkingDirectory $arenaRoot -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errorPath -PassThru
Write-Output ('Sites 执行器已启动，进程 ' + $process.Id + '。连接状态会显示在站点顶部。')
