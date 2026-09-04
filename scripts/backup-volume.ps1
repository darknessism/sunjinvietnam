# Back up the Railway Volume (/data) to a local, timestamped folder.
#
#   powershell -File scripts/backup-volume.ps1
#   powershell -File scripts/backup-volume.ps1 -Dest "C:\Backups\sunjin"
#
# The volume holds every uploaded image and banner video. db/backup.js dumps the
# database but NOT these files, so this script is the other half of a restore.
#
# Requires: the Railway CLI, logged in to the account that owns the project
# (`railway login`), and an SSH key registered with it (`railway ssh keys add`)
# because the transfer runs over SFTP.
#
# Railway's SFTP session fails to initialise fairly often, so each directory is
# retried; a directory that already has files is skipped, which also makes an
# interrupted run safe to re-run.

param(
    [string]$Dest    = "backups",
    [string]$Volume  = "sunjinvietnam-volume",
    [int]$Retries    = 8
)

$ErrorActionPreference = "Continue"
$stamp  = Get-Date -Format "yyyy-MM-dd"
$target = Join-Path $Dest "data-$stamp"
New-Item -ItemType Directory -Force $target | Out-Null

# Downloading "/" fails ("could not infer a local filename"), so name each
# directory. lost+found is a filesystem artefact and is deliberately skipped.
$dirs = @("media", "page-images", "banner-clips")

Write-Output "Backing up volume '$Volume' -> $target"

foreach ($sub in $dirs) {
    $dir = Join-Path $target $sub
    for ($try = 1; $try -le $Retries; $try++) {
        $have = 0
        if (Test-Path $dir) {
            $have = (Get-ChildItem -Recurse -File $dir -ErrorAction SilentlyContinue | Measure-Object).Count
        }
        if ($have -gt 0) { break }

        Write-Output "  $sub - attempt $try"
        railway volume files --volume $Volume download "/$sub" $dir 2>&1 |
            Select-String -NotMatch "railway.ps1|CategoryInfo|FullyQualified|^\s*\+|RemoteException" |
            Select-Object -Last 1
        Start-Sleep -Seconds 4
    }
}

Write-Output ""
Write-Output "=== RESULT ==="
$total = 0
$failed = @()
foreach ($sub in $dirs) {
    $dir = Join-Path $target $sub
    if (Test-Path $dir) {
        $m = Get-ChildItem -Recurse -File $dir | Measure-Object -Sum Length
        $total += $m.Sum
        Write-Output ("  {0,-14} {1,5} files  {2,8:N1} MB" -f $sub, $m.Count, ($m.Sum / 1MB))
    } else {
        $failed += $sub
        Write-Output ("  {0,-14} FAILED - no files downloaded" -f $sub)
    }
}
Write-Output ("  {0,-14} {1,8:N1} MB total" -f "", ($total / 1MB))

if ($failed.Count -gt 0) {
    Write-Output ""
    Write-Output "INCOMPLETE: $($failed -join ', ') did not download. Re-run this script;"
    Write-Output "directories that already succeeded are skipped."
    exit 1
}
Write-Output ""
Write-Output "Backup complete."
