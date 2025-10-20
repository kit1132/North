Sub UnifySheetFormatting()
    Dim ws As Worksheet
    Dim targetFont As String
    Dim targetSize As Integer
    Dim targetZoom As Integer

    ' 設定値（必要に応じて変更してください）
    targetFont = "游ゴシック"  ' 統一するフォント名
    targetSize = 11            ' 統一するフォントサイズ
    targetZoom = 100           ' 統一する倍率（%）

    ' 高速化設定
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False

    ' 全シートに対して処理
    For Each ws In ThisWorkbook.Worksheets
        ' シートを選択（倍率変更に必要）
        ws.Activate

        ' フォントの統一
        ws.Cells.Font.Name = targetFont
        ws.Cells.Font.Size = targetSize

        ' 倍率の統一
        ActiveWindow.Zoom = targetZoom
    Next ws

    ' 最初のシートに戻る
    ThisWorkbook.Worksheets(1).Activate

    ' 設定を戻す
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.ScreenUpdating = True

    MsgBox "全シートのフォントと倍率を統一しました。" & vbCrLf & _
           "フォント: " & targetFont & vbCrLf & _
           "サイズ: " & targetSize & vbCrLf & _
           "倍率: " & targetZoom & "%", vbInformation
End Sub
