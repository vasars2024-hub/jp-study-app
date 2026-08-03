# Shared helpers for the jp-bridge scripts.
#
# Credentials are NEVER passed as arguments. Every script reads port and token
# from debug/bridge.json itself, so a token can't end up in a shell history, a
# transcript, or a handoff document.
#
# Contract for callers: these throw. Nothing here returns an empty result on
# failure — a silent empty is how a run "confirms" something that never happened.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
    # Resolve from this file's location, not the cwd, so a script invoked from
    # anywhere still finds the right bridge file. (This mirrors how the MCP
    # server resolves PROJECT_ROOT in tools/claude-app-bridge/server.mjs:18-20.)
    return (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
}

function Get-BridgeInfo {
    $file = Join-Path (Get-RepoRoot) 'debug\bridge.json'
    if (-not (Test-Path $file)) {
        throw @"
No debug/bridge.json at $file — the app is not running with a debug bridge.

The bridge exists only in a dev-server run: startDebugBridge() is called under
isDevServer() (src/main.ts:1419) and hard-stops on app.isPackaged
(src/main/debugBridge.ts:380). A packaged build never has one.

Do NOT start the app to fix this. The dev app belongs to the user; ask before
starting anything.
"@
    }

    $info = Get-Content -Raw $file | ConvertFrom-Json
    if (-not $info.port -or -not $info.token) {
        throw "debug/bridge.json at $file is missing 'port' or 'token' — it is truncated or from an unclean shutdown."
    }
    return $info
}

function Invoke-Bridge {
    param(
        [Parameter(Mandatory)][string] $Route,
        [hashtable] $Body,
        [string]    $Method = 'POST',
        [int]       $TimeoutSec = 30
    )

    $info = Get-BridgeInfo
    $uri  = "http://127.0.0.1:$($info.port)$Route"

    # Deliberately not named $args — that is an automatic variable in PowerShell.
    $req = @{
        Uri     = $uri
        Method  = $Method
        Headers = @{ authorization = "Bearer $($info.token)"; 'content-type' = 'application/json' }
        TimeoutSec = $TimeoutSec
    }
    if ($Method -eq 'POST') {
        $payload = if ($null -eq $Body) { @{} } else { $Body }
        $req.Body = ($payload | ConvertTo-Json -Depth 10 -Compress)
    }

    try {
        return Invoke-RestMethod @req
    } catch {
        # 401 here almost always means a stale bridge.json from a previous run:
        # the token is regenerated on every start (debugBridge.ts:383).
        throw "Bridge request to $Route failed: $($_.Exception.Message)"
    }
}

function Assert-BridgeOk {
    # The bridge returns HTTP 200 with {ok:false,error:...} for in-renderer
    # failures (debugBridge.ts:240-242 etc.), so a 200 is not success. Callers
    # that skip this check will read an error object as a result.
    param([Parameter(Mandatory)] $Response, [string] $What = 'bridge call')

    if ($null -eq $Response) { throw "$What returned no response body." }
    if (-not $Response.ok)   { throw "$What failed: $($Response.error)" }
    return $Response
}
