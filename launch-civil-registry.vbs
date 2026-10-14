Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)


sh.Run "cmd /c cd /d """ & appDir & """ && npm run electron:start", 0, False