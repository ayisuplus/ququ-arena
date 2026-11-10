$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath 'C:/Users/36322/.codex/worktrees/unified-capabilities/alpha-agent'
& 'C:/Users/36322/.codex/worktrees/unified-capabilities/alpha-agent/release/alpha-portable-2026-10-06T12-40-27-074Z/runtime/bun.exe' .alpha/alpha-round-017-go-research-review/dispatch.ts *> .alpha/alpha-round-017-go-research-review/probe.log
$taskExit=$LASTEXITCODE
@{ completedUtc=[DateTime]::UtcNow.ToString('o'); exitCode=$taskExit } | ConvertTo-Json | Set-Content .alpha/alpha-round-017-go-research-review/probe-exit.json
exit $taskExit
