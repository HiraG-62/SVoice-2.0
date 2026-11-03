param(
  [ValidateSet('Launch', 'Interrupt', 'Ports')][string]$Action,
  [string]$Directory,
  [string]$WorkingDirectory,
  [string]$Executable,
  [string]$ArgumentsBase64 = 'W10=',
  [int]$TargetId
)
$ErrorActionPreference = 'Stop'
if ($Action -eq 'Ports') {
  $listeners = @([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object {
    @{ address = $_.Address.ToString(); port = $_.Port }
  })
  ConvertTo-Json -InputObject $listeners -Compress
  exit 0
}
Add-Type -Path (Join-Path $PSScriptRoot 'control-native.cs')
if ($Action -eq 'Interrupt') {
  [SmokeNativeProcess]::Interrupt($TargetId)
  exit 0
}
$appProcess = $null
try {
  $argumentsJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ArgumentsBase64))
  [string[]]$appArguments = @(ConvertFrom-Json $argumentsJson | ForEach-Object { $_ })
  $appProcess = [SmokeNativeProcess]::Start($Executable, $appArguments, $WorkingDirectory, $Directory)
  Write-Output "SVOICE_PID=$($appProcess.Id)"
  while (-not $appProcess.Wait(200)) {}
  $appExitCode = $appProcess.ExitCode
  Write-Output "SVOICE_EXIT=$appExitCode"
  exit $appExitCode
} finally {
  if ($null -ne $appProcess) { $appProcess.Dispose() }
}
