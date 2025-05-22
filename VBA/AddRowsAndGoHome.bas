Sub AddRowsAndGoHome()
    Dim ws As Worksheet
    ' 全シートの先頭に2行追加
    For Each ws In ThisWorkbook.Worksheets
        ws.Rows("1:2").Insert Shift:=xlDown
    Next ws
    ' ブック内で一番左にあるシートへ移動
    ThisWorkbook.Worksheets(1).Activate
End Sub
