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
