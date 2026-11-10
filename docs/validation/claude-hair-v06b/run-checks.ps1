param(
    [string]$Executable='C:/Users/36322/AppData/Local/Temp/ququ-arena3d-build-22dd3ca5/BuildClaudeHairV06b/QuQuArena3D.exe',
    [string]$OutputRoot='E:/projects/AI斗兽场/docs/validation/claude-hair-v06b',
    [switch]$HairOnly
)
$checks=@('hair')
if(!$HairOnly){$checks+='spectator'}
foreach($check in $checks){
    $output=Join-Path $OutputRoot ('player-'+$check)
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    $arguments=@("--arena-$check-validation",'--arena-qa-output',$output,'-logFile',($output+'/player.log'))
    $player=Start-Process -FilePath $Executable -ArgumentList $arguments -WorkingDirectory (Split-Path $Executable) -WindowStyle Normal -PassThru
    [pscustomobject]@{pid=$player.Id;started=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath ($output+'/process.json')
    $player.WaitForExit()
    [pscustomobject]@{pid=$player.Id;exitCode=$player.ExitCode;ended=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath ($output+'/exit.json')
    if($player.ExitCode -ne 0){exit 1}
}
