$serverRunning = $false
$folderPath = "D:\QuickBillPOS" 

while ($true) {
    # Check if TallyPrime is running
    $tallyRunning = Get-Process -Name "tally", "tallyprime" -ErrorAction SilentlyContinue

    if ($tallyRunning -and -not $serverRunning) {
        # Tally just opened -> Start the Node server invisibly
        Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $folderPath -WindowStyle Hidden
        $serverRunning = $true
    }
    elseif (-not $tallyRunning -and $serverRunning) {
        # Tally closed -> Safely kill ONLY the server.js Node process
        $nodeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"
        foreach ($proc in $nodeProcesses) {
            if ($proc.CommandLine -match "server.js") {
                Stop-Process -Id $proc.ProcessId -Force
            }
        }
        $serverRunning = $false
    }

    # Pause for 5 seconds before checking again
    Start-Sleep -Seconds 5
}
