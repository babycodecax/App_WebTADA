$t = [Environment]::GetEnvironmentVariable("ZALO_BOT_TOKEN", "User")
if (-not $t) { exit 1 }
$env:ZALO_BOT_TOKEN = $t
$log = "D:\Projects\App_WebTADA\tools\zalo-bridge\bridge.log"
$err = "D:\Projects\App_WebTADA\tools\zalo-bridge\bridge.err.log"
Start-Process -FilePath "node" -ArgumentList "D:\Projects\App_WebTADA\tools\zalo-bridge\bridge.mjs" -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err
