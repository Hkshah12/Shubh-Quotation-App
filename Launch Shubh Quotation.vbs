' Shubh Enterprise - Quotation Generator launcher
' Starts the local server (hidden) and opens the app in your default browser.
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")

' Start the Node server hidden (0 = hidden window, False = don't wait)
sh.CurrentDirectory = appDir
sh.Run "cmd /c node """ & appDir & "\server.js""", 0, False

' Give the server a moment to boot, then open the browser
WScript.Sleep 1200
sh.Run "http://localhost:4321", 1, False
