'=============================================
' Sheet relation extractor  (YAGNI / DRY / KISS)
'=============================================
Option Explicit

' 図も描きたい場合は True
Const DIAGRAM As Boolean = False

Sub GenerateSheetRelations()
    Dim wb As Workbook: Set wb = ThisWorkbook
    Dim wsOut As Worksheet, r As Long, RE As Object, m, c As Range, sh As Worksheet

    '--- 出力シートを作り直し ---
    On Error Resume Next
    Application.DisplayAlerts = False
    wb.Worksheets("SheetRelations").Delete
    Application.DisplayAlerts = True
    On Error GoTo 0
    Set wsOut = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    wsOut.Name = "SheetRelations"
    wsOut.[A1:D1].Value = Array("SourceSheet", "TargetSheet", "RelationType", "Details")
    r = 2                          ' 出力行位置

    '--- 正規表現パターン (他シート参照) ---
    Set RE = CreateObject("VBScript.RegExp")
    RE.Global = True: RE.Pattern = "'?([^']+)'?!"

    '■■ 1) 数式 ----------------------------------------------------------
    For Each sh In wb.Worksheets
        On Error Resume Next
        For Each c In sh.UsedRange.SpecialCells(xlCellTypeFormulas)
            On Error GoTo 0
            If RE.test(c.Formula2) Then
                For Each m In RE.Execute(c.Formula2)
                    wsOut.Cells(r, 1).Resize(1, 4).Value = _
                        Array(sh.Name, m.SubMatches(0), "Formula", c.Address(0, 0))
                    r = r + 1
                Next m
            End If
        Next c
    Next sh

    '■■ 2) 名前定義 ------------------------------------------------------
    Dim nm As Name
    For Each nm In wb.Names
        If RE.test(nm.RefersTo) Then
            For Each m In RE.Execute(nm.RefersTo)
                wsOut.Cells(r, 1).Resize(1, 4).Value = _
                    Array(nm.Parent.Parent.Name, m.SubMatches(0), "Name", nm.Name)
                r = r + 1
            Next m
        End If
    Next nm

    '■■ 3) ピボットテーブル ----------------------------------------------
    Dim pt As PivotTable, src As String
    For Each sh In wb.Worksheets
        For Each pt In sh.PivotTables
            src = pt.SourceData
            If RE.test(src) Then
                For Each m In RE.Execute(src)
                    wsOut.Cells(r, 1).Resize(1, 4).Value = _
                        Array(sh.Name, m.SubMatches(0), "PivotTable", pt.Name)
                    r = r + 1
                Next m
            End If
        Next pt
    Next sh

    '■■ 4) Power Query ---------------------------------------------------
    Dim q As WorkbookQuery
    For Each q In wb.Queries
        For Each sh In wb.Worksheets
            If InStr(1, q.Formula, "'" & sh.Name & "'", vbTextCompare) > 0 Then
                wsOut.Cells(r, 1).Resize(1, 4).Value = _
                    Array("Query:" & q.Name, sh.Name, "Query", "…")
                r = r + 1: Exit For
            End If
        Next sh
    Next q

    '■■ 5) データモデル ---------------------------------------------------
    Dim rel As ModelRelationship
    For Each rel In wb.Model.ModelRelationships
        wsOut.Cells(r, 1).Resize(1, 4).Value = _
            Array(rel.ForeignKeyTable.Parent.Name, _
                  rel.PrimaryKeyTable.Parent.Name, _
                  "DataModel", _
                  rel.ForeignKeyColumn.Name & " → " & rel.PrimaryKeyColumn.Name)
        r = r + 1
    Next rel

    '--- テーブル化 & 体裁整え ---
    wsOut.ListObjects.Add xlSrcRange, wsOut.Range("A1").CurrentRegion, , xlYes
    wsOut.Columns.AutoFit

    '--- (任意) ネットワーク図 -------------------------------------------
    If DIAGRAM Then Call DrawRelationMap(wsOut)

    MsgBox "関係性リストを生成しました (" & r - 2 & " 件)。", vbInformation
End Sub

'------------------------------------------------------------
' ネットワーク図 (簡易版: 円形レイアウト + 矢印コネクタ)
'------------------------------------------------------------
Private Sub DrawRelationMap(wsSrc As Worksheet)
    Const SZ As Double = 80, R As Double = 200
    Dim wb As Workbook: Set wb = wsSrc.Parent
    Dim ws As Worksheet, dict As Object, shp As Shape, i As Long, ang As Double, k
    Dim cx As Double, cy As Double

    On Error Resume Next: wb.Worksheets("SheetRelationMap").Delete: On Error GoTo 0
    Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    ws.Name = "SheetRelationMap"
    cx = 400: cy = 300

    '--- 全シート名を辞書に格納 ---
    Set dict = CreateObject("Scripting.Dictionary")
    Dim rng As Range: Set rng = wsSrc.Range("A2:B" & wsSrc.Cells(wsSrc.Rows.Count, 1).End(xlUp).Row)
    For Each k In rng.Value
        If Not dict.Exists(k) Then dict.Add k, Nothing
    Next k

    '--- シート名ごとに矩形を配置 ----
    Dim shapes As Object: Set shapes = CreateObject("Scripting.Dictionary")
    For i = 0 To dict.Count - 1
        ang = 2 * 3.14159 * i / dict.Count
        Set shp = ws.Shapes.AddShape(msoShapeRectangle, _
                cx + R * Cos(ang), cy + R * Sin(ang), SZ, 30)
        shp.TextFrame2.TextRange.Text = dict.Keys()(i)
        shapes(dict.Keys()(i)) = shp
    Next i

    '--- 矢印コネクタで結ぶ ---
    Dim rIndex As Long
    For rIndex = 2 To rng.Rows.Count
        Dim s As String, t As String
        s = wsSrc.Cells(rIndex, 1).Value: t = wsSrc.Cells(rIndex, 2).Value
        If shapes.Exists(s) And shapes.Exists(t) Then
            With ws.Shapes.AddConnector(msoConnectorElbow, _
                    shapes(s).Left + SZ / 2, shapes(s).Top + 15, _
                    shapes(t).Left + SZ / 2, shapes(t).Top + 15).Line
                .EndArrowheadStyle = msoArrowheadTriangle
            End With
        End If
    Next rIndex
End Sub
