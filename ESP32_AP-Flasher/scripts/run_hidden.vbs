' launch a command hidden (Windows)
' Usage: cscript //nologo run_hidden.vbs "cmd /c python -m http.server 8001 --directory C:\path\to\dir" "logs\hidden.out"
Option Explicit
Dim args, cmd, fso, outPath
Set args = WScript.Arguments
If args.Count < 1 Then
  WScript.Echo "Usage: run_hidden.vbs <command> [outfile]"
  WScript.Quit 1
End If
cmd = args(0)
outPath = "logs\\hidden.vbs.out"
If args.Count > 1 Then outPath = args(1)
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists(fso.GetParentFolderName(outPath)) Then fso.CreateFolder(fso.GetParentFolderName(outPath))
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.Run cmd, 0, False
WScript.Quit 0
