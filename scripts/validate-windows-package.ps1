param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath
)

$ErrorActionPreference = 'Stop'

$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
if ([IO.Path]::GetExtension($installer) -ne '.exe') {
  throw "Expected a Windows installer .exe, received $installer"
}

$installResult = Start-Process -FilePath $installer -ArgumentList @('/S') -Wait -PassThru
if ($installResult.ExitCode -ne 0) {
  throw "Silent TokenStats installation failed with exit code $($installResult.ExitCode)"
}

$programsRoot = Join-Path $env:LOCALAPPDATA 'Programs'
$installed = Get-ChildItem -LiteralPath $programsRoot -Filter 'TokenStats.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $installed) {
  throw "Installed TokenStats.exe was not found under $programsRoot"
}

$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
$userData = Join-Path $tempRoot "tokenstats-windows-smoke-$PID"
$app = $null
try {
  $app = Start-Process -FilePath $installed.FullName -ArgumentList @("--user-data-dir=$userData") -PassThru
  Start-Sleep -Seconds 10
  $app.Refresh()
  if ($app.HasExited) {
    throw "Packaged TokenStats exited during the Windows smoke launch with code $($app.ExitCode)"
  }
  Write-Host "Windows packaged launch passed: $($installed.FullName)"
}
finally {
  if ($null -ne $app -and -not $app.HasExited) {
    Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
  }
  Get-Process -Name 'TokenStats' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $userData) {
    Remove-Item -LiteralPath $userData -Recurse -Force -ErrorAction SilentlyContinue
  }
}
