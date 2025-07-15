Option Explicit
'=============================================
'  依存マップ自動生成（選択シート限定版）
'  ・ファイルダイアログなし
'  ・Dictionary で高速集計
'  ・選択したシートのみ解析
'=============================================

'グローバル記号 : EdgeKey → Array(Count, IsDynamic, IsExternal)
Private gEdges As Object 'Scripting.Dictionary

'─────────────────────────────────────────────
Public Sub GenerateDependencyMap()
'─────────────────────────────────────────────
    Dim calcState As XlCalculation, scrnState As Boolean, evtState As Boolean
    On Error GoTo ErrHandler
    
    '―― 高速化用の環境退避
    calcState = Application.Calculation
    Application.Calculation = xlCalculationManual
    
    scrnState = Application.ScreenUpdating
    Application.ScreenUpdating = False
    
    evtState = Application.EnableEvents
    Application.EnableEvents = False
    
    '―― 辞書を初期化
    Set gEdges = CreateObject("Scripting.Dictionary")
    
    '―― 選択シートのみを解析
    Application.StatusBar = "解析中…"
    AnalyzeSheets ActiveWindow.SelectedSheets
    Application.StatusBar = "結果を出力中…"
    
    '―― 出力
    OutputDependencyTable
    OutputMatrices
    
Finally:  '―― 復元
    Application.StatusBar = False
    Application.Calculation = calcState
    Application.ScreenUpdating = scrnState
    Application.EnableEvents = evtState
    
    If Not gEdges Is Nothing Then
        gEdges.RemoveAll
        Set gEdges = Nothing
    End If
    Exit Sub
    
ErrHandler:
    MsgBox "エラー : " & Err.Description, vbCritical
    Resume Finally
End Sub

'─────────────────────────────────────────────
'  ブック単位の解析（現ブックのみ呼ばれる）
'─────────────────────────────────────────────
Private Sub AnalyzeSheets(ByVal shs As Sheets)
    Dim sh As Worksheet, rng As Range, c As Range
    Dim scanned As Long

    For Each sh In shs
        If TypeOf sh Is Worksheet Then
            On Error Resume Next
            Set rng = sh.UsedRange.SpecialCells(xlCellTypeFormulas)
            On Error GoTo 0

            If Not rng Is Nothing Then
                For Each c In rng
                    ParseFormula CStr(c.Formula), sh.Name
                    scanned = scanned + 1
                    If (scanned Mod 5000) = 0 Then
                        Application.StatusBar = "解析中… " & _
                            Format$(scanned, "#,##0") & " cells / " & sh.Name
                        DoEvents
                    End If
                Next c
                Set rng = Nothing
            End If
        End If
    Next sh
End Sub

'─────────────────────────────────────────────
'  数式文字列から参照を抽出
'─────────────────────────────────────────────
Private Sub ParseFormula(ByVal f As String, _
                         ByVal srcSheet As String)
    
    Static re As Object
    If re Is Nothing Then
        Set re = CreateObject("VBScript.RegExp")
        With re
            .Global = True: .IgnoreCase = True
            .Pattern = "'?\[([^\]]+)\]([^'!]+)'?!|'?([^'!\[]+)'?!"
        End With
    End If
    
    Dim isDyn As Boolean
    isDyn = (InStr(1, f, "INDIRECT(", vbTextCompare) > 0) Or _
            (InStr(1, f, "OFFSET(",   vbTextCompare) > 0)
    
    Dim mc As Object, m As Object
    Dim tgtSheet As String, isExt As Boolean
    Set mc = re.Execute(f)

    For Each m In mc
        If m.SubMatches(0) <> "" Then                 '外部ブック書式
            tgtSheet = m.SubMatches(1)
            isExt = True
        Else                                          '同一ブック
            tgtSheet = m.SubMatches(2)
            isExt = False
        End If
        AddEdge srcSheet, tgtSheet, isDyn, isExt
    Next m
End Sub

'─────────────────────────────────────────────
'  EdgeKey を生成して辞書へ追加／カウント増分
'─────────────────────────────────────────────
Private Sub AddEdge(ByVal fSh As String, ByVal tSh As String, _
                    ByVal isDyn As Boolean, ByVal isExt As Boolean)
    Dim key As String: key = fSh & "|" & tSh
    Dim info As Variant
    If gEdges.Exists(key) Then
        info = gEdges(key)
        info(0) = info(0) + 1
        info(1) = info(1) Or isDyn
        info(2) = info(2) Or isExt
        gEdges(key) = info
    Else
        gEdges.Add key, Array(1, isDyn, isExt)
    End If
End Sub

'─────────────────────────────────────────────
'  一覧テーブル出力 (_DependencyTable)
'─────────────────────────────────────────────
Private Sub OutputDependencyTable()
    Dim ws As Worksheet, arr(), i As Long
    Dim key As Variant, parts() As String, info As Variant
    
    Application.DisplayAlerts = False
    On Error Resume Next
    ThisWorkbook.Worksheets("_DependencyTable").Delete
    On Error GoTo 0
    Application.DisplayAlerts = True
    
    Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
    ws.Name = "_DependencyTable"
    
    If gEdges.Count > 0 Then
        ReDim arr(1 To gEdges.Count, 1 To 5)
        i = 1
        For Each key In gEdges.Keys
            info = gEdges(key)
            parts = Split(key, "|")
            arr(i, 1) = parts(0)
            arr(i, 2) = parts(1)
            arr(i, 3) = info(0)
            arr(i, 4) = info(2)
            arr(i, 5) = info(1)
            i = i + 1
        Next key
        ws.Range("A2").Resize(UBound(arr, 1), UBound(arr, 2)).Value = arr
    End If

    ws.Range("A1").Resize(, 5).Value = _
        Array("FromSheet", "ToSheet", "Count", "External", "Dynamic")
    ws.Columns.AutoFit
End Sub

'─────────────────────────────────────────────
'  ブック単位マトリクス出力 (Map_<BookName>)
'─────────────────────────────────────────────
Private Sub OutputMatrices()
    CreateMatrixSheet
End Sub

'---------------------------------------------
'  マトリクスシート作成
'---------------------------------------------
Private Sub CreateMatrixSheet()
    Dim dictSheets As Object: Set dictSheets = CreateObject("Scripting.Dictionary")
    Dim key As Variant, info As Variant, parts() As String

    For Each key In gEdges.Keys
        parts = Split(key, "|")
        If Not dictSheets.Exists(parts(0)) Then dictSheets.Add parts(0), dictSheets.Count
        If Not dictSheets.Exists(parts(1)) Then dictSheets.Add parts(1), dictSheets.Count
    Next key
    If dictSheets.Count = 0 Then Exit Sub
    
    Dim n As Long: n = dictSheets.Count
    Dim arr() As Variant: ReDim arr(0 To n, 0 To n)
    Dim keys() As Variant: keys = dictSheets.Keys
    Dim i As Long, j As Long
    
    For i = 0 To n - 1
        arr(i + 1, 0) = keys(i)
        arr(0, i + 1) = keys(i)
    Next i
    
    For Each key In gEdges.Keys
        info = gEdges(key)
        parts = Split(key, "|")
        i = dictSheets(parts(0))
        j = dictSheets(parts(1))
        arr(i + 1, j + 1) = arr(i + 1, j + 1) + info(0)
    Next key
    
    Application.DisplayAlerts = False
    On Error Resume Next
    ThisWorkbook.Worksheets("Map_Selected").Delete
    On Error GoTo 0
    Application.DisplayAlerts = True
    
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
    ws.Name = "Map_Selected"
    
    ws.Range("A1").Resize(UBound(arr, 1) + 1, UBound(arr, 2) + 1).Value = arr
    ws.Range("A1").EntireRow.Font.Bold = True
    ws.Range("A1").EntireColumn.Font.Bold = True
    ws.Columns.AutoFit
    
    For i = 1 To n
        Dim hasDep As Boolean: hasDep = False
        For j = 1 To n
            If Len(ws.Cells(i + 1, j + 1).Value) > 0 Then
                hasDep = True: Exit For
            End If
        Next j
        If Not hasDep Then
            ws.Cells(i + 1, 1).Interior.Color = RGB(220, 220, 220)
            ws.Cells(1, i + 1).Interior.Color = RGB(220, 220, 220)
        End If
    Next i
End Sub
