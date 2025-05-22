# North

This repository contains a simple Excel VBA macro.

## Macro: AddRowsAndGoHome

The module located at `VBA/AddRowsAndGoHome.bas` inserts two rows at the top of
every worksheet except the first one. It also places a hyperlink in cell A1 of
each sheet so you can easily jump back to the leftmost sheet.

```
Sub AddRowsAndGoHome()
    Dim ws As Worksheet
    Dim home As Worksheet
    Set home = ThisWorkbook.Worksheets(1)

    For Each ws In ThisWorkbook.Worksheets
        If ws.Index <> 1 Then
            ws.Rows("1:2").Insert Shift:=xlDown
        End If
        ws.Hyperlinks.Add Anchor:=ws.Range("A1"), Address:="", _
            SubAddress:=home.Name & "!A1", TextToDisplay:="Go Home"
    Next ws

    home.Activate
End Sub

Sub GoHome()
    ThisWorkbook.Worksheets(1).Activate
End Sub
```

Import this module into your workbook and run `AddRowsAndGoHome` to prepare all
sheets. Assign `GoHome` to a button if you want a quick way to return to the
first sheet.
