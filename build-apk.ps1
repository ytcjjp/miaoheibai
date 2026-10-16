$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$jdkRoot = Join-Path $root '.toolchain\jdk'
$sdkRoot = Join-Path $root '.toolchain\android-sdk'

if (Test-Path $jdkRoot) {
    $jdk = Get-ChildItem -LiteralPath $jdkRoot -Directory -Filter 'jdk-*' |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
}
if (Test-Path (Join-Path $sdkRoot 'platforms')) {
    $env:ANDROID_HOME = $sdkRoot
    $env:ANDROID_SDK_ROOT = $sdkRoot
}
$env:GRADLE_USER_HOME = Join-Path $root '.toolchain\gradle-home'

Push-Location $root
try {
    & .\gradlew.bat assembleDebug --no-daemon
    if ($LASTEXITCODE -ne 0) { throw 'APK build failed.' }
    $source = Join-Path $root 'app\build\outputs\apk\debug\app-debug.apk'
    $destination = Join-Path $root '喵黑白-debug.apk'
    Copy-Item -LiteralPath $source -Destination $destination -Force
    $metadata = Get-Content -Raw (Join-Path $root 'app\build\outputs\apk\debug\output-metadata.json') | ConvertFrom-Json
    $versioned = Join-Path $root ("喵黑白-" + $metadata.elements[0].versionName + "-debug.apk")
    Copy-Item -LiteralPath $source -Destination $versioned -Force
    Write-Host "APK: $destination"
    Write-Host "Versioned APK: $versioned"
} finally {
    Pop-Location
}
