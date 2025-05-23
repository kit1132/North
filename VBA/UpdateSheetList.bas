Public Sub UpdateSheetList()
    Dim ws As Worksheet
    Dim listSheet As Worksheet
    Dim i As Long

    ' 高速化とエラー抑制
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False

    ' 既存の一覧シートを取得  無ければ新規作成
    On Error Resume Next
    Set listSheet = Worksheets("シート一覧")
    On Error GoTo 0

    If listSheet Is Nothing Then
        ' 新規作成して一番左へ配置
        Set listSheet = Worksheets.Add(Before:=Worksheets(1))
        listSheet.Name = "シート一覧"
    Else
        ' 既存シートを一番左へ移動し、A列だけクリア
        listSheet.Move Before:=Worksheets(1)
        listSheet.Columns("A").Clear
    End If

    listSheet.Cells(1, 1).Value = "シート名"

    ' 各シート名をハイパーリンク付きで記入
    i = 2
    For Each ws In ThisWorkbook.Worksheets
        If ws.Name <> "シート一覧" Then
            listSheet.Hyperlinks.Add _
                Anchor:=listSheet.Cells(i, 1), _
                Address:="", _
                SubAddress:="'" & ws.Name & "'!A1", _
                TextToDisplay:=ws.Name
            i = i + 1
        End If
    Next ws

    ' 仕上げ
    listSheet.Columns("A:A").AutoFit
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.ScreenUpdating = True
End Sub
