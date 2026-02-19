$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Bootstrap = Join-Path $ScriptDir "install.mjs"

if (-not (Test-Path -LiteralPath $Bootstrap)) {
  throw "Bootstrap entry not found: $Bootstrap"
}

node $Bootstrap
