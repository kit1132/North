# North

This repository contains simple Excel VBA macros.

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

## Macro: UpdateSheetList

`VBA/UpdateSheetList.bas` creates or refreshes a sheet named "シート一覧" at the
leftmost position. Only column A is overwritten with the list of sheet names,
so any data in other columns remains intact. Each worksheet name includes a
hyperlink that jumps to the corresponding sheet.

## Workbook Event

`VBA/ThisWorkbook.cls` contains a `Workbook_NewSheet` event that calls `UpdateSheetList` whenever a new worksheet is added, ensuring the list stays up to date automatically.
