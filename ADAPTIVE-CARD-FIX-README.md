# アダプティブカード重複メッセージ修正ガイド

## 📋 問題の説明

Copilot Studioで入力内容の確認用アダプティブカードを実装したところ、**連続で2回メッセージが表示される**問題が発生しました。

### 原因
- `AdaptiveCardPrompt`（確認画面）で1回目のカード表示
- `SendActivity`（完了通知）で2回目のカード表示
- SendActivityが無条件に実行されるため、重複が発生

---

## 📁 提供ファイル

| ファイル名 | 説明 |
|-----------|------|
| `adaptive-card-BEFORE-FIX.yaml` | **修正前**：問題のあるコード |
| `adaptive-card-SOLUTION-1-SIMPLE-TEXT.yaml` | **解決策1**（推奨）：SendActivityをシンプルなテキストに変更 |
| `adaptive-card-SOLUTION-2-CONDITIONAL.yaml` | **解決策2**：条件分岐で「はい」の時だけ完了通知 |
| `adaptive-card-SOLUTION-3-REMOVE-SENDACTIVITY.yaml` | **解決策3**：SendActivityを完全に削除 |

---

## ✅ 推奨される解決策

### **解決策1：SendActivityをシンプルなテキストに変更**（最もシンプル）

```yaml
# 修正前
- kind: SendActivity
  activity:
    text: "入力内容で承認しました。"
    attachments:
      - contentType: application/vnd.microsoft.card.adaptive
        content:
          type: AdaptiveCard
          # ... 大量のカード定義 ...

# 修正後
- kind: SendActivity
  activity:
    text: "入力内容を確認しました。処理を進めます。"
    # attachments を削除！
```

**メリット：**
- 最も簡単に修正できる
- 確認画面（アダプティブカード）+ 完了通知（テキスト）で明確に区別できる

---

## 🧪 テスト手順

### Copilot Studioでのテスト

1. **トピックを開く**
2. **コードエディタービューに切り替え**
3. **いずれかのソリューションファイルの内容をコピー**
4. **既存のコードに貼り付け**
5. **保存してテスト**

### Power Virtual Agents / Bot Frameworkでのテスト

1. ファイルをインポート
2. 必要な変数を設定：
   ```yaml
   Topic.InquiryType
   Topic.Department
   Topic.PersonInCharge
   Topic.ConsultationSummary
   Topic.CurrencyType
   Topic.ReceivingAccount
   Topic.ScheduledDate
   ```
3. テストチャットで確認

---

## 🔍 各解決策の比較

| 解決策 | メリット | デメリット | 推奨度 |
|-------|---------|-----------|--------|
| **1. シンプルテキスト** | 最も簡単、明確 | デザイン性が低い | ⭐⭐⭐⭐⭐ |
| **2. 条件分岐** | 柔軟性が高い | やや複雑 | ⭐⭐⭐⭐ |
| **3. SendActivity削除** | 最もシンプル | 完了通知がない | ⭐⭐⭐ |

---

## 🛠️ カスタマイズ例

### FactSetの項目を追加する場合

```yaml
- type: FactSet
  facts:
    - title: "相談区分"
      value: "${Topic.InquiryType}"
    # 新しい項目を追加
    - title: "メールアドレス"
      value: "${Topic.Email}"
```

### ボタンのスタイルを変更する場合

```yaml
actions:
  - type: Action.Submit
    title: "決定"
    style: positive  # positive, destructive, default
```

---

## 📞 サポート

問題が解決しない場合は、以下の情報を提供してください：

- 使用している解決策番号
- エラーメッセージ（あれば）
- 期待する動作と実際の動作

---

## 📝 変更履歴

- 2025-11-07：初版作成
  - 修正前コードと3つの解決策を提供
