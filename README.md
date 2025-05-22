# North

This repository contains a simple Excel VBA macro.

## Macro: AddRowsAndGoHome

The module located at `VBA/AddRowsAndGoHome.bas` inserts two rows at the top of every worksheet and then activates the first sheet.

```
Sub AddRowsAndGoHome()
    Dim ws As Worksheet
    ' 全シートの先頭に2行追加
    For Each ws In ThisWorkbook.Worksheets
        ws.Rows("1:2").Insert Shift:=xlDown
    Next ws
    ' ブック内で一番左にあるシートへ移動
    ThisWorkbook.Worksheets(1).Activate
End Sub
```

Use this code in your Excel workbook to quickly add two rows to all sheets and return to the leftmost sheet.
