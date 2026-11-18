param(
    [string]$Jdk = $env:JAVA_HOME,
    [string]$Sdk = $env:ANDROID_HOME,
    [string]$Platform,
    [string]$BuildTools
)

$ErrorActionPreference = 'Stop'
if (!$Jdk) { throw 'Set JAVA_HOME to a JDK 17 or newer, or pass -Jdk.' }
if (!$Platform) { $Platform = Join-Path $Sdk 'platforms/android-35' }
if (!$BuildTools) { $BuildTools = Join-Path $Sdk 'build-tools/35.0.1' }

$androidJar = Join-Path $Platform 'android.jar'
$java = Join-Path $Jdk 'bin/java.exe'
$javac = Join-Path $Jdk 'bin/javac.exe'
$keytool = Join-Path $Jdk 'bin/keytool.exe'
$aapt = Join-Path $BuildTools 'aapt2.exe'
$zipalign = Join-Path $BuildTools 'zipalign.exe'
$d8 = Join-Path $BuildTools 'lib/d8.jar'
$signer = Join-Path $BuildTools 'lib/apksigner.jar'
foreach ($tool in @($java, $javac, $keytool, $androidJar, $aapt, $zipalign, $d8, $signer)) {
    if (!(Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Tool not found: $tool" }
}

function Invoke-BuildStep([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}

$src = Join-Path $PSScriptRoot 'app/src/main'
$output = Join-Path $PSScriptRoot 'build'
$work = Join-Path $output ('intermediates/' + [guid]::NewGuid().ToString('N'))
$classes = Join-Path $work 'classes'
$dex = Join-Path $work 'dex'
$generated = Join-Path $work 'generated'
$keys = Join-Path $PSScriptRoot '.signing'
New-Item -Force -ItemType Directory -Path $classes, $dex, $keys, $generated | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem

# aapt2 needs the namespace that the Android Gradle plugin usually injects.
$manifest = [xml](Get-Content -LiteralPath (Join-Path $src 'AndroidManifest.xml') -Raw -Encoding UTF8)
$manifest.DocumentElement.SetAttribute('package', 'cn.maidiary.app')
$manifestPath = Join-Path $work 'AndroidManifest.xml'
$manifest.Save($manifestPath)
$resources = Join-Path $work 'resources.zip'
$unsigned = Join-Path $work 'unsigned.apk'
Invoke-BuildStep $aapt @('compile', '--dir', (Join-Path $src 'res'), '-o', $resources)
Invoke-BuildStep $aapt @('link', '-o', $unsigned, '-I', $androidJar, '--manifest', $manifestPath,
    '--min-sdk-version', '26', '--target-sdk-version', '35', '--version-code', '13',
    '--version-name', '1.8.3', '--java', $generated, $resources)

$sources = @(Get-ChildItem -LiteralPath (Join-Path $src 'java') -Recurse -Filter '*.java' -File |
    ForEach-Object { $_.FullName })
$sources += @(Get-ChildItem -LiteralPath $generated -Recurse -Filter '*.java' -File |
    ForEach-Object { $_.FullName })
$bootClassPath = $androidJar + ';' + (Join-Path $BuildTools 'core-lambda-stubs.jar')
Invoke-BuildStep $javac (@('-encoding', 'UTF-8', '-source', '8', '-target', '8',
    '-Xlint:-options', '-bootclasspath', $bootClassPath, '-d', $classes) + $sources)
$classesJar = Join-Path $work 'classes.jar'
[System.IO.Compression.ZipFile]::CreateFromDirectory($classes, $classesJar)
Invoke-BuildStep $java @('-cp', $d8, 'com.android.tools.r8.D8', '--min-api', '26',
    '--lib', $androidJar, '--output', $dex, $classesJar)
$apkArchive = [System.IO.Compression.ZipFile]::Open($unsigned, 'Update')
try {
    # AssetManager expects slash-delimited paths on all build hosts.
    $assetDir = (Resolve-Path (Join-Path $src 'assets')).Path
    foreach ($asset in Get-ChildItem -LiteralPath $assetDir -File -Recurse) {
        $relative = $asset.FullName.Substring($assetDir.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $apkArchive, $asset.FullName, ('assets/' + $relative)) | Out-Null
    }
    foreach ($file in Get-ChildItem -LiteralPath $dex -Filter '*.dex') {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($apkArchive, $file.FullName, $file.Name) | Out-Null
    }
} finally {
    $apkArchive.Dispose()
}

$aligned = Join-Path $work 'aligned.apk'
Invoke-BuildStep $zipalign @('-f', '4', $unsigned, $aligned)
# Keep the signing identity between local builds so the APK can update in place.
$keystore = Join-Path $keys 'local.keystore'
if (!(Test-Path -LiteralPath $keystore)) {
    Invoke-BuildStep $keytool @('-genkeypair', '-keystore', $keystore, '-storetype', 'PKCS12',
        '-storepass', 'android', '-keypass', 'android', '-alias', 'maidiary', '-keyalg', 'RSA',
        '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Mai Diary Local Build')
}
$candidate = Join-Path $work 'signed.apk'
Invoke-BuildStep $java @('-jar', $signer, 'sign', '--ks', $keystore, '--ks-key-alias', 'maidiary',
    '--ks-pass', 'pass:android', '--v4-signing-enabled', 'false', '--out', $candidate, $aligned)
Invoke-BuildStep $java @('-jar', $signer, 'verify', '--verbose', $candidate)
$apk = Join-Path $output 'MaiDiary-1.8.3.apk'
Copy-Item -LiteralPath $candidate -Destination $apk -Force
Get-Item -LiteralPath $apk | Select-Object FullName, Length
