# North

このリポジトリには、Excel VBA のサンプルマクロが含まれています。

## マクロ: AddRowsAndGoHome

`VBA/AddRowsAndGoHome.bas` にあるモジュールは、すべてのワークシートの先頭に 2 行を挿入し、その後に左端のシートを表示します。

```vba
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

このコードを Excel ブックに追加すれば、ホーム画面のように先頭シートへ戻りつつ、各シートの冒頭に 2 行追加することができます。

