param([string]$RepositoryUrl)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $RepositoryUrl) {
    $RepositoryUrl = Read-Host 'GitHub repository URL (https://github.com/OWNER/REPOSITORY.git)'
}
$RepositoryUrl = $RepositoryUrl.Trim()
if ($RepositoryUrl -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?/?$') {
    throw 'Use an HTTPS GitHub repository URL without credentials or query parameters.'
}

function Invoke-ProjectGit {
    param([string[]]$GitArguments)
    & git -C $projectRoot @GitArguments
    if ($LASTEXITCODE -ne 0) { throw "Git command failed (exit $LASTEXITCODE)." }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is not installed.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.git'))) {
    Invoke-ProjectGit -GitArguments @('init', '-b', 'main')
}

$remoteNames = @(Invoke-ProjectGit -GitArguments @('remote'))
if ($remoteNames -contains 'origin') {
    $existingUrl = Invoke-ProjectGit -GitArguments @('remote', 'get-url', 'origin')
    if ($existingUrl.TrimEnd('/') -ne $RepositoryUrl.TrimEnd('/')) {
        throw 'The existing origin differs from the requested URL. No remote was changed.'
    }
} else {
    Invoke-ProjectGit -GitArguments @('remote', 'add', 'origin', $RepositoryUrl)
}

Invoke-ProjectGit -GitArguments @('add', '--', '.gitignore', 'README.md', 'PROJECT_PLAN.md', 'START_DACHY.cmd', 'scripts', 'krakow-all-in-one.html', 'dachy-miasto')
& git -C $projectRoot diff --cached --quiet
$stagedStatus = $LASTEXITCODE
if ($stagedStatus -eq 1) {
    Invoke-ProjectGit -GitArguments @('commit', '-m', 'Add Dachy Miasta pilot application and data provenance')
} elseif ($stagedStatus -ne 0) {
    throw 'Unable to inspect staged changes.'
}
$currentBranch = Invoke-ProjectGit -GitArguments @('branch', '--show-current')
if (-not $currentBranch) { throw 'No branch is checked out.' }
Invoke-ProjectGit -GitArguments @('push', '--set-upstream', 'origin', $currentBranch.Trim())
Write-Host 'Project pushed to GitHub.'
