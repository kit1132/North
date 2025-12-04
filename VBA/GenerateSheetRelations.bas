Option Explicit

Public Sub GenerateSheetRelations()
    Dim wb As Workbook
    Dim rel As ModelRelationship
    Dim relationsSheet As Worksheet
    Dim currentRow As Long

    Set wb = ThisWorkbook

    On Error Resume Next
    Set relationsSheet = wb.Worksheets("SheetRelations")
    On Error GoTo 0

    If relationsSheet Is Nothing Then
        Set relationsSheet = wb.Worksheets.Add
        relationsSheet.Name = "SheetRelations"
    Else
        relationsSheet.Cells.Clear
    End If

    currentRow = 1
    relationsSheet.Cells(currentRow, 1).Value = "ForeignKey"
    relationsSheet.Cells(currentRow, 2).Value = "PrimaryKey"
    currentRow = currentRow + 1

    ' Data Model relationships
    If Not wb.Model Is Nothing Then
        For Each rel In wb.Model.ModelRelationships
            relationsSheet.Cells(currentRow, 1).Value = rel.ForeignKeyTable.Name & _
                "." & rel.ForeignKeyColumn.Name
            relationsSheet.Cells(currentRow, 2).Value = rel.PrimaryKeyTable.Name & _
                "." & rel.PrimaryKeyColumn.Name
            currentRow = currentRow + 1
        Next rel
    End If
End Sub
