Option Explicit

Private Sub Workbook_NewSheet(ByVal Sh As Object)
    ' 新しいシート作成時に一覧を更新
    UpdateSheetList
End Sub
