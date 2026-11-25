<#
.SYNOPSIS
  AX developer PC readiness check for bridge-web / bridge-backoffice (read-only).

.DESCRIPTION
  Checks the dev-pc-setup procedure (steps 1-4, 7 and leftovers of the old setup) and prints
  one row per item. It never prints secret values: tokens are reported only as present/absent
  and by kind (taken from the prefix), and credentials inside a remote URL are masked.
  The kind does not tell a classic PAT's scopes; this script cannot see them.
  It changes no settings and no repo files. npm and gh may still write their own cache and logs.
  It never waits for a credential prompt: git runs with GIT_TERMINAL_PROMPT=0 and GCM_INTERACTIVE=never.
  Connectors (BridgeX, Atlassian MCP v2), claude_design and the session root are not visible from here;
  Claude checks those from its own tool list.

  Kept ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 files without a BOM.

.PARAMETER Root
  Folder that holds (or will hold) the bridge-web and bridge-backoffice clones.
  Default: the current folder. The folder and all its parents are searched, so running it
  anywhere inside a repo works.

.PARAMETER Offline
  Skip network checks (gh repo view, gh release view, npm view).

.PARAMETER Json
  Print JSON instead of a table.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\check.ps1 -Root D:\work\bridge
#>
[CmdletBinding()]
param(
  [string]$Root = (Get-Location).Path,
  [switch]$Offline,
  [switch]$Json
)

$ErrorActionPreference = 'Continue'
$results = New-Object System.Collections.Generic.List[object]

# git ls-remote below talks to a private repo. With the default GCM helper and no stored login it
# would open a sign-in window and wait, hanging a non-interactive shell. Fail instead. These are
# restored at the end, so a dot-sourced run leaves the caller's session as it was.
$savedPrompt = @{ GIT_TERMINAL_PROMPT = $env:GIT_TERMINAL_PROMPT; GCM_INTERACTIVE = $env:GCM_INTERACTIVE }
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'

# Status: ok | warn (works but should be fixed) | missing (blocks the procedure) | info (optional / FYI)
#         | unknown (could not be checked)
function Add-Result([string]$Step, [string]$Item, [string]$Status, [string]$Detail) {
  $results.Add([pscustomobject]@{ Step = $Step; Status = $Status; Item = $Item; Detail = $Detail })
}

function Test-Cmd([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Native([string]$Exe, [string[]]$ArgList, [string]$WorkDir) {
  $prev = (Get-Location).Path
  try {
    if ($WorkDir) { Set-Location -LiteralPath $WorkDir }
    $out = & $Exe @ArgList 2>&1 | ForEach-Object { "$_" }
    return [pscustomobject]@{ Code = $LASTEXITCODE; Out = @($out) }
  } catch {
    return [pscustomobject]@{ Code = -1; Out = @("$_") }
  } finally {
    Set-Location -LiteralPath $prev
  }
}

function Get-FirstLine($r) {
  $line = $r.Out | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1
  if ($line) { return $line.Trim() } else { return '' }
}

# Process holds what this shell inherited; User and Machine are what new processes will get.
# A Machine value is inherited too, so a value seen only in Process may still be permanent.
function Get-EnvAny([string]$Name) {
  $p = [Environment]::GetEnvironmentVariable($Name, 'Process')
  $u = [Environment]::GetEnvironmentVariable($Name, 'User')
  $m = [Environment]::GetEnvironmentVariable($Name, 'Machine')
  return [pscustomobject]@{
    Process = [bool]$p; User = [bool]$u; Machine = [bool]$m
    ProcessValue = $p
    # The permanent value new processes get: the user variable wins over the system one.
    StoredValue = $(if ($u) { $u } else { $m })
  }
}

# Credentials may sit in a remote URL (https://<token>@github.com/...). Never print them.
function Hide-UrlCredential([string]$Url) {
  return ($Url -replace '://[^@/]+@', '://***@')
}

function Get-TokenKind([string]$Value) {
  if (-not $Value) { return 'none' }
  if ($Value.StartsWith('github_pat_')) { return 'fine-grained PAT' }
  if ($Value.StartsWith('ghp_')) { return 'classic PAT' }
  if ($Value.StartsWith('gho_')) { return 'oauth (browser login)' }
  if ($Value.StartsWith('ghu_')) { return 'app user token' }
  return 'unknown kind'
}

# Keys are the first indentation level under people:, whatever its width (the schema does not fix it).
function Get-PeopleKeys([string]$File) {
  $keys = @(); $in = $false; $indent = $null
  foreach ($line in Get-Content -LiteralPath $File -Encoding UTF8) {
    if ($line -match '^people:\s*(#.*)?$') { $in = $true; continue }
    if (-not $in) { continue }
    if ($line -match '^\s*(#.*)?$') { continue }
    if ($line -match '^\S') { break }
    if ($line -match '^(\s+)["'']?([A-Za-z0-9-]+)["'']?\s*:') {
      if ($null -eq $indent) { $indent = $Matches[1].Length }
      if ($Matches[1].Length -eq $indent) { $keys += $Matches[2] }
    }
  }
  return $keys
}

# ---------------------------------------------------------------- step 1: tools
$tools = @(
  @{ Name = 'git';    Args = @('--version'); Hint = 'winget install --id Git.Git -e' },
  @{ Name = 'gh';     Args = @('--version'); Hint = 'winget install --id GitHub.cli -e' },
  @{ Name = 'node';   Args = @('-v');        Hint = 'winget install --id OpenJS.NodeJS.22 -e' },
  @{ Name = 'npm';    Args = @('-v');        Hint = 'comes with Node.js' },
  @{ Name = 'winget'; Args = @('--version'); Hint = 'install App Installer from Microsoft Store' }
)
foreach ($t in $tools) {
  if (-not (Test-Cmd $t.Name)) {
    Add-Result '1' $t.Name 'missing' "not on PATH. $($t.Hint), then open a new terminal"
    continue
  }
  $v = Get-FirstLine (Invoke-Native $t.Name $t.Args)
  if ($t.Name -eq 'node' -and $v -notmatch '^v22\.') {
    Add-Result '1' 'node' 'warn' "$v (repos and CI use Node 22)"
  } else {
    Add-Result '1' $t.Name 'ok' $v
  }
}

# VS Code: version, PATH and install kind are separate questions.
# It can be installed without 'code' on PATH (zip/portable copy, or a shell opened before install).
$codeExe = $null
$codeOnPath = Test-Cmd 'code'
if ($codeOnPath) {
  $codeExe = 'code'
} else {
  $cands = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin\code.cmd'),
    (Join-Path $env:ProgramFiles 'Microsoft VS Code\bin\code.cmd')
  )
  $running = Get-Process -Name Code -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path
  if ($running) { $cands += (Join-Path (Split-Path -Parent $running) 'bin\code.cmd') }
  $codeExe = $cands | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $codeExe) {
  Add-Result '1' 'VS Code' 'missing' 'not found. winget install --id Microsoft.VisualStudioCode -e --scope user'
} else {
  $v = Get-FirstLine (Invoke-Native $codeExe @('--version'))
  if ($v -match '^(\d+)\.(\d+)' -and [int]$Matches[1] -eq 1 -and [int]$Matches[2] -lt 94) {
    Add-Result '1' 'VS Code version' 'warn' "$v (Claude Code extension needs 1.94+)"
  } else {
    Add-Result '1' 'VS Code version' 'ok' $v
  }
  if ($codeOnPath) {
    Add-Result '1' 'VS Code on PATH' 'ok' "'code' command available"
  } else {
    Add-Result '1' 'VS Code on PATH' 'warn' "'code' is not on PATH; found $codeExe (add its folder to the user PATH)"
  }
  if (Test-Path (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe')) {
    Add-Result '1' 'VS Code install kind' 'ok' 'user setup (auto-updates)'
  } else {
    Add-Result '1' 'VS Code install kind' 'info' 'not the user setup; zip/portable copies do not auto-update'
  }
}

# Git may be a per-user install or on another drive: also look next to the git on PATH
# (...\Git\cmd\git.exe, ...\Git\bin\git.exe or ...\Git\mingw64\bin\git.exe -> ...\Git\bin\bash.exe).
$bashCands = @('C:\Program Files\Git\bin\bash.exe')
$gitPath = Get-Command git -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if ($gitPath) {
  $d = Split-Path -Parent $gitPath
  foreach ($i in 1..2) {
    $d = Split-Path -Parent $d
    if ($d) { $bashCands += (Join-Path $d 'bin\bash.exe') }
  }
}
$gitBash = $bashCands | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($env:CLAUDE_CODE_GIT_BASH_PATH) {
  Add-Result '1' 'Git Bash' 'ok' 'CLAUDE_CODE_GIT_BASH_PATH is set (Claude Code uses it for bash commands)'
} elseif ($gitBash) {
  Add-Result '1' 'Git Bash' 'ok' "found at $gitBash (Claude Code uses it for bash commands)"
} else {
  Add-Result '1' 'Git Bash' 'warn' 'bash.exe not found next to git; Claude Code falls back to PowerShell'
}

# ---------------------------------------------------------------- step 2: GitHub
# gh can hold several accounts per host. Parse each block and use the active one.
$activeAcct = $null
if (Test-Cmd 'gh') {
  $r = Invoke-Native 'gh' @('auth', 'status', '--hostname', 'github.com')
  $accounts = @(); $cur = $null
  foreach ($line in $r.Out) {
    if ($line -match 'Logged in to github\.com (?:account|as) (\S+)') {
      if ($cur) { $accounts += $cur }
      $cur = [pscustomobject]@{ Name = $Matches[1]; Active = $null; Kind = 'unknown'; Scopes = '' }
      continue
    }
    if (-not $cur) { continue }
    if ($line -match 'Active account:\s*(true|false)') { $cur.Active = ($Matches[1] -eq 'true') }
    elseif ($line -match 'Token:\s+(gho_|ghp_|github_pat_|ghu_)') { $cur.Kind = Get-TokenKind $Matches[1] }
    elseif ($line -match 'Token scopes:\s*(.*)$') { $cur.Scopes = $Matches[1].Trim() }
  }
  if ($cur) { $accounts += $cur }

  # Older gh prints no "Active account" line and supports one account only.
  $active = $accounts | Where-Object { $_.Active -eq $true } | Select-Object -First 1
  if (-not $active -and $accounts.Count -eq 1) { $active = $accounts[0] }

  if (-not $active) {
    Add-Result '2' 'gh login' 'missing' 'run in a separate terminal: gh auth login --hostname github.com --git-protocol https --web'
  } else {
    $activeAcct = $active.Name
    if ($active.Kind -eq 'fine-grained PAT') {
      Add-Result '2' 'gh login' 'warn' "active=$($active.Name); token=fine-grained PAT (gh pr checks 403, cannot read packages). Re-login with --web"
    } else {
      Add-Result '2' 'gh login' 'ok' "active=$($active.Name); token=$($active.Kind); scopes=$($active.Scopes)"
    }
    foreach ($o in ($accounts | Where-Object { $_.Name -ne $active.Name })) {
      $st = 'info'
      if ($o.Kind -eq 'fine-grained PAT') { $st = 'warn' }
      Add-Result '2' 'gh other account' $st "$($o.Name) (inactive, token=$($o.Kind)). PRs are opened as the active account; switch with: gh auth switch -u <name>"
    }
  }
}

if (Test-Cmd 'git') {
  $h = Invoke-Native 'git' @('config', '--global', '--get-all', 'credential.https://github.com.helper')
  if (($h.Out -join ' ') -match 'auth git-credential') {
    Add-Result '2' 'git uses gh credentials' 'ok' 'credential helper for github.com is gh'
  } else {
    Add-Result '2' 'git uses gh credentials' 'warn' 'run: gh auth setup-git (the default GCM can hang in non-interactive sessions)'
  }
}

$dsLatest = $null
if ($activeAcct -and -not $Offline) {
  foreach ($repo in @('bridge-web', 'bridge-backoffice')) {
    $r = Invoke-Native 'gh' @('repo', 'view', "nz-sdk/$repo", '--json', 'viewerPermission', '-q', '.viewerPermission')
    $p = Get-FirstLine $r
    if ($r.Code -eq 0 -and $p -match '^(WRITE|MAINTAIN|ADMIN)$') {
      Add-Result '2' "access nz-sdk/$repo" 'ok' $p
    } elseif ($r.Code -eq 0) {
      Add-Result '2' "access nz-sdk/$repo" 'warn' "$p (WRITE or higher is needed)"
    } else {
      Add-Result '2' "access nz-sdk/$repo" 'missing' 'repo not visible: accept the nz-sdk org invite or ask the org admin'
    }
  }
  $r = Invoke-Native 'gh' @('release', 'view', '-R', 'nz-sdk/DS-Bridge', '--json', 'tagName', '-q', '.tagName')
  if ($r.Code -eq 0) {
    $dsLatest = Get-FirstLine $r
    Add-Result '2' 'DS-Bridge latest release' 'ok' $dsLatest
  } else {
    Add-Result '2' 'DS-Bridge latest release' 'warn' 'cannot read nz-sdk/DS-Bridge releases (no access?)'
  }
}

# Every process the user starts inherits a permanent variable, so only a classic PAT with
# read:packages belongs there. A gh token (gho_) is broad: per terminal only (bridge-web README way).
$tok = Get-EnvAny 'NODE_AUTH_TOKEN'
$storedKind = Get-TokenKind $tok.StoredValue
$procKind = Get-TokenKind $tok.ProcessValue
$scope = $(if ($tok.User) { 'user env' } else { 'system env' })
$scopeNote = 'its scopes cannot be read from the value: keep read:packages only'
if (-not $tok.StoredValue -and -not $tok.ProcessValue) {
  Add-Result '2' 'NODE_AUTH_TOKEN' 'missing' 'create a classic PAT with read:packages only, add it as a USER environment variable'
} elseif ($storedKind -eq 'fine-grained PAT' -or (-not $tok.StoredValue -and $procKind -eq 'fine-grained PAT')) {
  Add-Result '2' 'NODE_AUTH_TOKEN' 'missing' 'is a fine-grained PAT: GitHub Packages rejects it (E403). Use a classic PAT with read:packages'
} elseif ($tok.StoredValue -and $storedKind -ne 'classic PAT') {
  Add-Result '2' 'NODE_AUTH_TOKEN' 'warn' "$scope holds a token of kind '$storedKind': every process you start can read it. Store a classic PAT with read:packages only; use a gh token per terminal at most"
} elseif ($tok.Machine -and -not $tok.User) {
  Add-Result '2' 'NODE_AUTH_TOKEN' 'warn' 'set as a SYSTEM variable: every account on this PC can read it. Move it to a USER variable'
} elseif ($tok.StoredValue -and -not $tok.Process) {
  Add-Result '2' 'NODE_AUTH_TOKEN' 'warn' "set in $scope ($storedKind) but not in this process: restart the terminal / VS Code"
} elseif ($tok.StoredValue) {
  Add-Result '2' 'NODE_AUTH_TOKEN' 'ok' "set in $scope ($storedKind); $scopeNote"
} elseif ($procKind -eq 'oauth (browser login)') {
  Add-Result '2' 'NODE_AUTH_TOKEN' 'info' 'gh token in this process only (bridge-web README way): fine per terminal, do not store it permanently. A classic PAT in a USER variable lasts across terminals'
} else {
  Add-Result '2' 'NODE_AUTH_TOKEN' 'warn' "set only in this process ($procKind): it disappears with this terminal. Add a classic PAT (read:packages) as a USER variable"
}

$npmrc = Join-Path $HOME '.npmrc'
if ((Test-Path $npmrc) -and (Select-String -Path $npmrc -Pattern 'npm\.pkg\.github\.com' -Quiet)) {
  Add-Result '2' '~/.npmrc' 'warn' 'has an npm.pkg.github.com line: remove it (the project .npmrc overrides it and npm returns E401)'
} else {
  Add-Result '2' '~/.npmrc' 'ok' 'no conflicting GitHub Packages entry'
}

# ---------------------------------------------------------------- step 3: repos
$base = $null
$start = Resolve-Path -LiteralPath $Root -ErrorAction SilentlyContinue
if ($start) {
  $c = $start.Path
  while ($c) {
    if ((Test-Path (Join-Path $c 'bridge-web\.git')) -or (Test-Path (Join-Path $c 'bridge-backoffice\.git'))) { $base = $c; break }
    $parent = Split-Path -Parent $c
    if (-not $parent -or $parent -eq $c) { break }
    $c = $parent
  }
}
if ($base) { Add-Result '3' 'work folder' 'ok' $base } else { Add-Result '3' 'work folder' 'missing' "no bridge-web / bridge-backoffice clone in $Root or its parents" }

$repoDirs = @{}
$npmViewDone = $false
foreach ($repo in @('bridge-web', 'bridge-backoffice')) {
  $dir = $null
  if ($base) { $dir = Join-Path $base $repo }
  if (-not $dir -or -not (Test-Path (Join-Path $dir '.git'))) {
    Add-Result '3' "$repo clone" 'missing' "run: gh repo clone nz-sdk/$repo"
    continue
  }
  $repoDirs[$repo] = $dir
  $remote = Hide-UrlCredential (Get-FirstLine (Invoke-Native 'git' @('-C', $dir, 'remote', 'get-url', 'origin')))
  if ($remote -match "nz-sdk/$repo(\.git)?$") { Add-Result '3' "$repo clone" 'ok' $remote }
  else { Add-Result '3' "$repo clone" 'warn' "origin is '$remote'" }

  # A stale checkout misleads: its README and settings may describe a flow that no longer exists.
  # Read-only: ask the remote for main's sha (no fetch) and test whether HEAD already contains it.
  if (-not $Offline) {
    $branch = Get-FirstLine (Invoke-Native 'git' @('-C', $dir, 'rev-parse', '--abbrev-ref', 'HEAD'))
    $ls = Invoke-Native 'git' @('-C', $dir, 'ls-remote', 'origin', 'refs/heads/main')
    $sha = ''
    if ($ls.Code -eq 0 -and (Get-FirstLine $ls) -match '^([0-9a-f]{40})') { $sha = $Matches[1] }
    if (-not $sha) {
      Add-Result '3' "$repo up to date" 'warn' 'cannot read origin main (network or auth)'
    } else {
      $short = $sha.Substring(0, 7)
      # Exit 0 = ancestor. A sha that is not in the local repo yet also fails, which means behind.
      $anc = Invoke-Native 'git' @('-C', $dir, 'merge-base', '--is-ancestor', $sha, 'HEAD')
      if ($anc.Code -eq 0) {
        Add-Result '3' "$repo up to date" 'ok' "$branch contains origin/main ($short)"
      } else {
        Add-Result '3' "$repo up to date" 'warn' "$branch does not contain origin/main ($short): on main run git pull --ff-only, on a work branch update it from main"
      }
    }
  }

  $name = Get-FirstLine (Invoke-Native 'git' @('-C', $dir, 'config', '--local', '--get', 'user.name'))
  $mail = Get-FirstLine (Invoke-Native 'git' @('-C', $dir, 'config', '--local', '--get', 'user.email'))
  if ($name -and $mail) { Add-Result '3' "$repo author (local)" 'ok' "$name <$mail>" }
  else { Add-Result '3' "$repo author (local)" 'missing' 'set repo-local user.name and user.email (not --global)' }

  $pkgJson = Join-Path $dir 'node_modules\@nz-sdk\ds-bridge\package.json'
  if (-not (Test-Path (Join-Path $dir 'node_modules'))) {
    Add-Result '3' "$repo npm ci" 'missing' 'no node_modules: run npm ci in the repo'
  } elseif (-not (Test-Path $pkgJson)) {
    Add-Result '3' "$repo npm ci" 'missing' 'node_modules is an older install without @nz-sdk/ds-bridge: run npm ci in the repo'
  } else {
    $ver = (Get-Content -Raw -LiteralPath $pkgJson | ConvertFrom-Json).version
    if ($dsLatest -and ('v' + $ver) -ne $dsLatest) {
      Add-Result '3' "$repo npm ci" 'info' "@nz-sdk/ds-bridge $ver installed; latest release is $dsLatest (DS sync is its own PR)"
    } else {
      Add-Result '3' "$repo npm ci" 'ok' "@nz-sdk/ds-bridge $ver installed"
    }
  }

  if (-not $Offline -and -not $npmViewDone -and (Test-Cmd 'npm')) {
    $npmViewDone = $true
    $saved = $env:NODE_AUTH_TOKEN
    if (-not $saved -and $tok.StoredValue) { $env:NODE_AUTH_TOKEN = $tok.StoredValue }
    $r = Invoke-Native 'npm' @('view', '@nz-sdk/ds-bridge', 'version') $dir
    $env:NODE_AUTH_TOKEN = $saved
    $all = $r.Out -join ' '
    if ($r.Code -eq 0) { Add-Result '3' 'DS package registry' 'ok' "npm view -> $(Get-FirstLine $r)" }
    elseif ($all -match 'E401') { Add-Result '3' 'DS package registry' 'missing' 'E401: NODE_AUTH_TOKEN missing, expired, or overridden by ~/.npmrc' }
    elseif ($all -match 'E403') { Add-Result '3' 'DS package registry' 'missing' 'E403: needs a classic PAT with read:packages, or the account lacks DS-Bridge package access' }
    else { Add-Result '3' 'DS package registry' 'warn' "npm view failed: $(Get-FirstLine $r)" }
  }

  if ($repo -eq 'bridge-backoffice') {
    $envFile = Join-Path $dir '.env'
    # Only these two are read (vite.config.ts). Login is POST {issuer}/bo/v1/login, so no redirect URI.
    $want = [ordered]@{
      'VITE_AUTH_ISSUER' = 'https://bridge-auth.newzen.kr'
      'VITE_API_BASE'    = 'https://bridge-api.newzen.kr'
    }
    if (-not (Test-Path $envFile)) {
      Add-Result '3' 'bridge-backoffice .env' 'missing' 'copy .env.example to .env and set VITE_AUTH_ISSUER and VITE_API_BASE'
    } else {
      $have = @{}
      foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $have[$Matches[1]] = $Matches[2].Trim() }
      }
      $diff = @()
      foreach ($k in $want.Keys) {
        if ($have[$k] -ne $want[$k]) { $diff += "$k=$($have[$k])" }
      }
      if ($diff.Count -eq 0) { Add-Result '3' 'bridge-backoffice .env' 'ok' 'points at the shared bridge-auth / bridge-api' }
      else { Add-Result '3' 'bridge-backoffice .env' 'warn' ('differs from the standard: ' + ($diff -join '; ')) }
      if ($have.ContainsKey('VITE_REDIRECT_URI')) {
        Add-Result 'old' 'bridge-backoffice .env' 'info' 'VITE_REDIRECT_URI is unused (login is POST /bo/v1/login); the line can go'
      }
    }
  }
}

# ---------------------------------------------------------------- step 4: Claude Code
if ($codeExe) {
  $ext = Invoke-Native $codeExe @('--list-extensions')
  if ($ext.Out -contains 'anthropic.claude-code') { Add-Result '4' 'VS Code extension' 'ok' 'anthropic.claude-code' }
  else { Add-Result '4' 'VS Code extension' 'missing' 'run: code --install-extension anthropic.claude-code' }
}
if (Test-Cmd 'claude') {
  Add-Result '4' 'claude CLI' 'ok' (Get-FirstLine (Invoke-Native 'claude' @('--version')))
} else {
  Add-Result '4' 'claude CLI' 'info' 'not installed (optional)'
}
$keys = @('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN') | Where-Object { $e = Get-EnvAny $_; $e.Process -or $e.User -or $e.Machine }
if ($keys) {
  Add-Result '4' 'API key variables' 'warn' (($keys -join ', ') + ' set: Claude Code will not load claude.ai connectors (BridgeX, Atlassian MCP)')
} else {
  Add-Result '4' 'API key variables' 'ok' 'none (claude.ai login is used)'
}

# ---------------------------------------------------------------- step 7: team map
# The Jira <-> GitHub map must list the GitHub account that opens the PRs (the active gh account).
# Claude compares the jiraAccountId with atlassianUserInfo; this script only checks the key.
foreach ($repo in @('bridge-web', 'bridge-backoffice')) {
  if (-not $repoDirs.ContainsKey($repo)) { continue }
  $map = Join-Path $repoDirs[$repo] '.github\github-jira-map.yml'
  if (-not (Test-Path $map)) { Add-Result '7' "$repo jira map" 'info' 'no .github/github-jira-map.yml'; continue }
  $people = Get-PeopleKeys $map
  if (-not $activeAcct) {
    Add-Result '7' "$repo jira map" 'info' 'gh not logged in; cannot compare'
  } elseif ($people -contains $activeAcct) {
    Add-Result '7' "$repo jira map" 'ok' "$activeAcct is in people"
  } else {
    Add-Result '7' "$repo jira map" 'warn' "active gh account $activeAcct is not in people (has: $($people -join ', '))"
  }
}

# ---------------------------------------------------------------- leftovers of the old POC setup
$hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
if (Test-Path $hosts) {
  $names = @()
  foreach ($line in Get-Content -LiteralPath $hosts) {
    if ($line -match '^\s*#') { continue }
    foreach ($m in [regex]::Matches($line, '\b(bridge[\w.-]*\.newzen\.(?:biz|kr))\b')) { $names += $m.Groups[1].Value }
  }
  if ($names) { Add-Result 'old' 'hosts file' 'warn' ('has entries for ' + (($names | Select-Object -Unique) -join ', ') + ': public *.newzen.kr is used now; remove them (admin)') }
  else { Add-Result 'old' 'hosts file' 'ok' 'no bridge entries' }
}

# The old POC connected with mcp-remote to a bridge host and the bridge-mcp-agent client.
# Match only that, since mcp-remote itself is fine for other servers.
$oldBridge = 'bridge[\w.-]*\.newzen\.(?:biz|kr)|bridge-mcp-agent'
foreach ($repo in $repoDirs.Keys) {
  $mcp = Join-Path $repoDirs[$repo] '.mcp.json'
  if ((Test-Path $mcp) -and (Select-String -Path $mcp -Pattern $oldBridge -Quiet)) {
    Add-Result 'old' "$repo .mcp.json" 'warn' 'has a direct bridge MCP server (mcp-remote): the BridgeX team connector replaces it'
  }
}

# User-scope MCP servers live in ~/.claude.json. Only server names are printed, never values.
$cj = Join-Path $HOME '.claude.json'
if (Test-Path $cj) {
  $raw = Get-Content -Raw -LiteralPath $cj
  if ($raw -notmatch $oldBridge) {
    Add-Result 'old' 'user MCP servers' 'ok' 'no direct bridge MCP server'
  } else {
    $hit = @(); $parsed = $false
    try {
      # ConvertFrom-Json in PS 5.1 caps input size and rejects keys that differ only by case,
      # both common in ~/.claude.json. The .NET serializer handles both.
      Add-Type -AssemblyName System.Web.Extensions
      $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
      $ser.MaxJsonLength = [int]::MaxValue
      $o = $ser.DeserializeObject($raw)
      $blocks = @()
      if ($o.ContainsKey('mcpServers')) { $blocks += ,@('user', $o['mcpServers']) }
      if ($o.ContainsKey('projects')) {
        foreach ($pk in $o['projects'].Keys) {
          $pv = $o['projects'][$pk]
          if ($pv -is [System.Collections.IDictionary] -and $pv.ContainsKey('mcpServers')) { $blocks += ,@("local:$pk", $pv['mcpServers']) }
        }
      }
      foreach ($b in $blocks) {
        if (-not ($b[1] -is [System.Collections.IDictionary])) { continue }
        foreach ($sk in $b[1].Keys) {
          if ($ser.Serialize($b[1][$sk]) -match $oldBridge) { $hit += "$sk [$($b[0])]" }
        }
      }
      $parsed = $true
    } catch { $hit = @() }
    # The raw text already matched, so a parse failure means "cannot tell", not "none".
    if (-not $parsed) {
      Add-Result 'old' 'user MCP servers' 'unknown' 'cannot parse ~/.claude.json and the old bridge address appears in it: check with claude mcp list'
    } elseif ($hit) { Add-Result 'old' 'user MCP servers' 'warn' ('direct bridge MCP servers: ' + ($hit -join ', ') + '. Remove with: claude mcp remove <name> -s user|local') }
    else { Add-Result 'old' 'user MCP servers' 'ok' 'no direct bridge MCP server (the address appears elsewhere in ~/.claude.json)' }
  }
}

# ---------------------------------------------------------------- output
foreach ($k in $savedPrompt.Keys) { [Environment]::SetEnvironmentVariable($k, $savedPrompt[$k], 'Process') }

if ($Json) {
  $results | ConvertTo-Json -Depth 3
} else {
  $results | Format-Table -AutoSize -Wrap Step, Status, Item, Detail | Out-String -Width 240
  $ok = @($results | Where-Object { $_.Status -eq 'ok' }).Count
  $warn = @($results | Where-Object { $_.Status -eq 'warn' }).Count
  $miss = @($results | Where-Object { $_.Status -eq 'missing' }).Count
  $unk = @($results | Where-Object { $_.Status -eq 'unknown' }).Count
  "Summary: ok=$ok warn=$warn missing=$miss unknown=$unk. Connectors, claude_design and the session root are checked by Claude, not by this script."
}
