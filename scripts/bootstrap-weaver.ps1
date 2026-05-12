[CmdletBinding()]
Param()

# Prepare the Weaver-based semconv toolchain for PowerShell.
#
# Reads the pinned semconv_version from templates/registry/typespec/weaver.yaml,
# uses pinned Weaver v0.23.0, checks the pinned .tools/semconv-upstream submodule,
# and downloads the platform-specific Weaver binary into .tools/weaver/.

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

trap
{
    Write-Error $_.Exception.Message
    exit 1
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\")
$ToolsDir = Join-Path $RepoRoot ".tools"
$WeaverDir = Join-Path $ToolsDir "weaver"
$UpstreamDir = Join-Path $ToolsDir "semconv-upstream"
$WeaverYaml = Join-Path $RepoRoot "templates\registry\typespec\weaver.yaml"

$WeaverVersion = "v0.23.0"
$yaml = Get-Content -Raw -Path $WeaverYaml
$match = [regex]::Match($yaml, '^\s*semconv_version:\s*"([^"]+)"', "Multiline")
if (-not $match.Success)
{
    Write-Error "Could not read semconv_version from ${WeaverYaml}"
    exit 1
}
$SemconvVersion = $match.Groups[1].Value

if (-not (Test-Path (Join-Path $UpstreamDir "model\attributes\registry.yaml")) -and
    -not (Test-Path (Join-Path $UpstreamDir "model")))
{
    Write-Error "semconv-upstream submodule missing at ${UpstreamDir}"
    Write-Error "Run: git submodule update --init .tools/semconv-upstream"
    exit 1
}

$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
$isWindows = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::Windows
)

if ($isWindows)
{
    switch ($architecture)
    {
        "x64" { $weaverArch = "x86_64-pc-windows-msvc" }
        "arm64" { $weaverArch = "aarch64-pc-windows-msvc" }
        default
        {
            Write-Error "Unsupported architecture: ${architecture}"
            exit 1
        }
    }

    $archiveSuffix = "zip"
    $binaryName = "weaver.exe"
}
elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Linux))
{
    switch ($architecture)
    {
        "x64" { $weaverArch = "x86_64-unknown-linux-gnu" }
        "arm64" { $weaverArch = "aarch64-unknown-linux-gnu" }
        default
        {
            Write-Error "Unsupported architecture: ${architecture}"
            exit 1
        }
    }

    $archiveSuffix = "tar.xz"
    $binaryName = "weaver"
}
else
{
    switch ($architecture)
    {
        "arm64" { $weaverArch = "aarch64-apple-darwin" }
        "x64" { $weaverArch = "x86_64-apple-darwin" }
        default
        {
            Write-Error "Unsupported architecture: ${architecture}"
            exit 1
        }
    }

    $archiveSuffix = "tar.xz"
    $binaryName = "weaver"
}

$ReleaseArchive = "weaver-${weaverArch}.${archiveSuffix}"
$WeaverBinary = Join-Path (Join-Path $WeaverDir "weaver-${weaverArch}") $binaryName

if (-not (Test-Path (Split-Path $WeaverBinary -Parent)))
{
    New-Item -ItemType Directory -Path (Split-Path $WeaverBinary -Parent) | Out-Null
}

if (-not (Test-Path $WeaverBinary))
{
    Write-Output "Downloading Weaver ${WeaverVersion} (${weaverArch})..."
    $archiveFile = Join-Path $ToolsDir "weaver.${archiveSuffix}"
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/open-telemetry/weaver/releases/download/${WeaverVersion}/${ReleaseArchive}" -OutFile $archiveFile

    $targetDir = Split-Path $WeaverBinary -Parent
    if ($archiveSuffix -eq "zip")
    {
        $extractDir = Join-Path $WeaverDir "extract-${weaverArch}"
        if (Test-Path $extractDir)
        {
            Remove-Item -Recurse -Force $extractDir
        }

        New-Item -ItemType Directory -Path $extractDir | Out-Null
        Expand-Archive -Path $archiveFile -DestinationPath $extractDir -Force

        $extractedBinary = Get-ChildItem -Path $extractDir -Recurse -Filter $binaryName | Select-Object -First 1
        if (-not $extractedBinary)
        {
            Write-Error "Could not find ${binaryName} in ${ReleaseArchive}"
            exit 1
        }

        Copy-Item -Path $extractedBinary.FullName -Destination $WeaverBinary -Force
        Remove-Item -Recurse -Force $extractDir
    }
    else
    {
        tar -xf $archiveFile -C $WeaverDir
    }

    Remove-Item $archiveFile
}

Write-Output ""
Write-Output "Weaver:   ${WeaverBinary} ($(& $WeaverBinary --version))"
Write-Output "Upstream: ${UpstreamDir} (semconv v${SemconvVersion})"
Write-Output ""
Write-Output "Next: ./scripts/run-weaver.sh"
