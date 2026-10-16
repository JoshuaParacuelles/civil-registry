Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)

sh.Run "cmd /c cd /d """ & appDir & """ && set ""API_BASE_URL=http://127.0.0.1:5000""&& npm run electron:start", 0, False