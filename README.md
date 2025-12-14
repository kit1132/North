# MoneyForward ME 自動分析・通知システム

マネーフォワード ME の家計簿データを自動で取得・AI分析し、LINE/メールで通知するシステム。

## 概要

このシステムは以下の機能を提供します：

1. **データ取得**: MoneyForward ME からCSVをエクスポート（手動または自動）
2. **AI分析**: Claude API を使用して支出傾向・異常検知・改善提案を生成
3. **通知**: LINE Messaging API およびGmail SMTP で分析結果を送信
4. **定期実行**: macOS launchd による週次自動実行

## インストール

### 前提条件

- Python 3.10 以上
- Chrome ブラウザ（自動エクスポート使用時）
- MoneyForward ME プレミアム会員（CSVエクスポート機能）

### セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/your-username/North.git
cd North/moneyforward_analyzer

# 仮想環境を作成
python3 -m venv venv
source venv/bin/activate

# 依存関係をインストール
pip install -r requirements.txt

# 環境変数を設定
cp .env.example .env
# .env ファイルを編集して認証情報を入力
```

## 設定

### 必須の認証情報

1. **MoneyForward ME**
   - プレミアム会員登録（月額500円）
   - メールアドレスとパスワード
   - 2段階認証を使用する場合はTOTPシークレット

2. **Claude API**
   - [Anthropic Console](https://console.anthropic.com/) でAPIキーを取得

3. **LINE Messaging API**
   - [LINE Official Account Manager](https://manager.line.biz/) で公式アカウントを作成
   - [LINE Developers Console](https://developers.line.biz/console/) でMessaging APIを有効化
   - チャネルアクセストークンとユーザーIDを取得

### オプションの設定

4. **Gmail SMTP**（バックアップ通知用）
   - Googleアカウントで2段階認証を有効化
   - [アプリパスワード](https://myaccount.google.com/apppasswords)を生成

## 使用方法

### 基本的な使い方

```bash
# 最新のCSVファイルを使用して分析・通知
python -m moneyforward_analyzer.main

# 特定のCSVファイルを指定
python -m moneyforward_analyzer.main --csv path/to/export.csv

# MoneyForwardから自動でCSVをエクスポートしてから分析
python -m moneyforward_analyzer.main --export

# 分析のみ実行（通知は送信しない）
python -m moneyforward_analyzer.main --dry-run

# 詳細なログを表示
python -m moneyforward_analyzer.main -v
```

### 週次自動実行（macOS）

```bash
# launchd ジョブをインストール
cd moneyforward_analyzer/launchd
chmod +x setup_launchd.sh
./setup_launchd.sh install

# ステータス確認
./setup_launchd.sh status

# 手動で実行テスト
./setup_launchd.sh run

# アンインストール
./setup_launchd.sh uninstall
```

## アーキテクチャ

```
moneyforward_analyzer/
├── __init__.py           # パッケージ初期化
├── main.py               # メインオーケストレーション
├── config.py             # 設定管理
├── csv_parser.py         # CSVデータ解析
├── ai_analyzer.py        # Claude API による分析
├── line_notifier.py      # LINE Messaging API 通知
├── email_notifier.py     # Gmail SMTP 通知
├── selenium_exporter.py  # 自動CSVエクスポート
├── requirements.txt      # Python依存関係
├── .env.example          # 環境変数テンプレート
└── launchd/              # macOS 定期実行設定
    ├── com.moneyforward.weekly-analysis.plist
    └── setup_launchd.sh
```

## 利用規約に関する注意

**Selenium による自動エクスポートは、MoneyForward ME の利用規約に抵触する可能性があります。**

利用規約 第13条では以下が禁止されています：
- 「正式には公開されていない操作方法」の使用
- 「ネットワーク・システムに過度な負荷をかける行為」

**推奨される安全な方法：**
1. 週1回、手動でCSVをダウンロード
2. ダウンロードしたCSVを本システムで分析

自動エクスポート機能の使用は自己責任でお願いします。

## コスト見積もり

| サービス | 費用 | 備考 |
|---------|------|------|
| MoneyForward ME プレミアム | ¥500/月 | CSVエクスポート機能 |
| Claude API | 〜¥50/月 | 週1回の分析 |
| LINE Messaging API | 無料 | 月200通まで |
| Gmail | 無料 | 日500通まで |
| **合計** | **〜¥550/月** | |

## トラブルシューティング

### CSVが読み込めない

MoneyForward ME のCSVは Shift-JIS または UTF-8 でエンコードされています。
本システムは両方のエンコーディングを自動検出します。

### 2段階認証でログインできない

TOTPシークレットが正しく設定されているか確認してください：
- MoneyForward の2FA設定画面で「QRコードが読み取れない場合」を選択
- 表示される20文字のシークレットを `MF_TOTP_SECRET` に設定

### LINE通知が届かない

1. LINE公式アカウントとBOTが友だちになっているか確認
2. ユーザーIDが `U` で始まる33文字であるか確認
3. チャネルアクセストークンが有効か確認

## ライセンス

MIT License

## 参考資料

- [MoneyForward ME](https://moneyforward.com/)
- [LINE Messaging API](https://developers.line.biz/ja/docs/messaging-api/)
- [Claude API](https://docs.anthropic.com/)
- [LINE Notify終了のお知らせ](https://notify-bot.line.me/closing-announce)
