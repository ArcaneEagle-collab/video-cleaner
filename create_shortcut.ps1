$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop "Video Cleaner.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "C:\Users\Dubai laptop\AppData\Local\Programs\Python\Python311\pythonw.exe"
$Shortcut.Arguments = "`"C:\Users\Dubai laptop\Video Cleaner\launcher.py`""
$Shortcut.WorkingDirectory = "C:\Users\Dubai laptop\Video Cleaner"
$Shortcut.IconLocation = "C:\Users\Dubai laptop\Video Cleaner\video_cleaner.ico, 0"
$Shortcut.Description = "Video Cleaner - Usable Clip Extractor & Editorial Image Remover"
$Shortcut.Save()

Write-Host "SUCCESS: Shortcut created at $ShortcutPath"
