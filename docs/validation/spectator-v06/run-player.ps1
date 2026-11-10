param([string]$OutputDirectory,[switch]$Video,[string]$Executable="C:/Users/36322/AppData/Local/Temp/ququ-arena3d-build-22dd3ca5/BuildSpectatorV06Final/QuQuArena3D.exe")
$exe=$Executable
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$argsList=@('--arena-spectator-validation','--arena-qa-output',$OutputDirectory,'-logFile',($OutputDirectory+'/player.log'))
if($Video){$argsList+='--arena-video'}
$p=Start-Process -FilePath $exe -ArgumentList $argsList -WorkingDirectory (Split-Path $exe) -PassThru -WindowStyle Normal
[pscustomobject]@{pid=$p.Id;started=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath ($OutputDirectory+'/process.json')
$p.WaitForExit()
[pscustomobject]@{pid=$p.Id;exitCode=$p.ExitCode;ended=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath ($OutputDirectory+'/exit.json')
