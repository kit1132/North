Public Sub UpdateSheetList()
    Dim ws As Worksheet
    Dim listSheet As Worksheet
    Dim i As Long

    ' 高速化とエラー抑制
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False
    On Error Resume Next
    Application.DisplayAlerts = False
    Worksheets("シート一覧").Delete
    Application.DisplayAlerts = True
    On Error GoTo 0

    ' 一覧シートを追加して一番左に配置
    Set listSheet = Worksheets.Add(Before:=Worksheets(1))
    listSheet.Name = "シート一覧"
    listSheet.Cells(1, 1).Value = "Id"
    listSheet.Cells(1, 2).Value = "シート名"

    ' 各シート名をハイパーリンク付きで記入
    i = 2
    For Each ws In ThisWorkbook.Worksheets
        If ws.Name <> "シート一覧" Then
            listSheet.Cells(i, 1).Value = i - 1  ' Id列に連番を追加
            listSheet.Hyperlinks.Add _
                Anchor:=listSheet.Cells(i, 2), _
                Address:="", _
                SubAddress:="'" & ws.Name & "'!A1", _
                TextToDisplay:=ws.Name
            i = i + 1
        End If
    Next ws

    ' 仕上げ
    listSheet.Columns("A:B").AutoFit
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.ScreenUpdating = True
End Sub
