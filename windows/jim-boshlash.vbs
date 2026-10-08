' Botni oyna ko'rsatmasdan ishga tushiradi.
' Windows Task Scheduler shu faylni chaqiradi.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
papka = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = papka
' 0 = oyna ko'rinmaydi, False = kutmaydi
shell.Run """" & papka & "\2-boshlash.bat"" jim", 0, False
