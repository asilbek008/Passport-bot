' Botni kompyuterga kirganda avtomatik ishga tushirish.
' Chaqirilishi:  wscript //nologo avtomatik.vbs yoq|ochir|holat
Option Explicit

Dim shell, fso, papka, startup, yorliq, amal, link
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

papka = fso.GetParentFolderName(WScript.ScriptFullName)
startup = shell.SpecialFolders("Startup")
yorliq = startup & "\Umra boti.lnk"

If WScript.Arguments.Count = 0 Then
  WScript.Echo "Amal ko'rsatilmadi."
  WScript.Quit 1
End If
amal = LCase(WScript.Arguments(0))

If amal = "yoq" Then
  Set link = shell.CreateShortcut(yorliq)
  link.TargetPath = "wscript.exe"
  link.Arguments = "//nologo """ & papka & "\jim-boshlash.vbs"""
  link.WorkingDirectory = papka
  link.Description = "Umra pasport boti"
  link.Save
  WScript.Echo "Yoqildi: " & yorliq
  WScript.Quit 0
End If

If amal = "ochir" Then
  If fso.FileExists(yorliq) Then
    fso.DeleteFile yorliq
    WScript.Echo "O'chirildi."
  Else
    WScript.Echo "Allaqachon o'chirilgan."
  End If
  WScript.Quit 0
End If

If amal = "holat" Then
  If fso.FileExists(yorliq) Then
    WScript.Echo "YOQILGAN"
    WScript.Quit 0
  Else
    WScript.Echo "O'CHIRILGAN"
    WScript.Quit 1
  End If
End If

WScript.Echo "Amal tushunarsiz: " & amal
WScript.Quit 1
