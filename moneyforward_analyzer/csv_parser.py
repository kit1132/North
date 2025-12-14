"""
CSV Parser for MoneyForward ME export data.

Parses CSV files exported from MoneyForward ME and provides
structured access to transaction data for analysis.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd

# ロガー設定
logger = logging.getLogger(__name__)


class CSVParseError(Exception):
    """CSV解析エラーを表すカスタム例外"""
    pass


@dataclass
class Transaction:
    """Single transaction record from MoneyForward ME."""

    is_calculated: bool  # 計算対象
    date: datetime  # 日付
    description: str  # 内容
    amount: int  # 金額（円）
    institution: str  # 保有金融機関
    major_category: str  # 大項目
    minor_category: str  # 中項目
    memo: str  # メモ
    is_transfer: bool  # 振替
    transaction_id: str  # ID

    def __post_init__(self):
        """データクラス初期化後のバリデーション"""
        # 説明が空の場合はデフォルト値を設定
        if not self.description or self.description == "nan":
            self.description = "(不明)"

        # カテゴリが空の場合はデフォルト値を設定
        if not self.major_category or self.major_category == "nan":
            self.major_category = "未分類"
        if not self.minor_category or self.minor_category == "nan":
            self.minor_category = "未分類"


class CSVParser:
    """Parser for MoneyForward ME CSV export files.

    MoneyForward MEからエクスポートされたCSVファイルを解析し、
    構造化されたトランザクションデータを提供する。
    """

    # MoneyForward ME CSVの期待されるカラム名（日本語）
    COLUMN_MAPPING = {
        "計算対象": "is_calculated",
        "日付": "date",
        "内容": "description",
        "金額（円）": "amount",
        "保有金融機関": "institution",
        "大項目": "major_category",
        "中項目": "minor_category",
        "メモ": "memo",
        "振替": "is_transfer",
        "ID": "transaction_id",
    }

    # サポートするエンコーディング（優先順）
    SUPPORTED_ENCODINGS = ["utf-8", "utf-8-sig", "shift_jis", "cp932"]

    # CSVファイルサイズの上限（10MB）- メモリ保護
    MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

    def __init__(self, csv_path: str | Path):
        """Initialize parser with CSV file path.

        Args:
            csv_path: Path to the MoneyForward ME CSV export file

        Raises:
            CSVParseError: If path is invalid or file doesn't exist
        """
        # 入力バリデーション
        if csv_path is None:
            raise CSVParseError("CSV path cannot be None")

        self.csv_path = Path(csv_path)

        # ファイル存在チェック
        if not self.csv_path.exists():
            raise CSVParseError(f"CSV file not found: {self.csv_path}")

        # ファイルかどうかチェック
        if not self.csv_path.is_file():
            raise CSVParseError(f"Path is not a file: {self.csv_path}")

        # 拡張子チェック
        if self.csv_path.suffix.lower() not in [".csv", ".txt"]:
            logger.warning(f"Unexpected file extension: {self.csv_path.suffix}")

        # ファイルサイズチェック
        file_size = self.csv_path.stat().st_size
        if file_size == 0:
            raise CSVParseError(f"CSV file is empty: {self.csv_path}")
        if file_size > self.MAX_FILE_SIZE_BYTES:
            raise CSVParseError(
                f"CSV file too large ({file_size / 1024 / 1024:.1f}MB). "
                f"Max allowed: {self.MAX_FILE_SIZE_BYTES / 1024 / 1024:.0f}MB"
            )

        self._df: Optional[pd.DataFrame] = None
        self._transactions: Optional[list[Transaction]] = None
        self._parse_errors: list[str] = []  # 解析中のエラーを記録

    def parse(self) -> list[Transaction]:
        """Parse CSV file and return list of transactions.

        Returns:
            List of Transaction objects

        Raises:
            CSVParseError: If CSV format is invalid or cannot be parsed
        """
        try:
            # エンコーディングを自動検出してCSVを読み込む
            df = self._read_csv_with_encoding_detection()

            # カラムのバリデーション
            self._validate_columns(df)

            # データの前処理
            df = self._preprocess_dataframe(df)

            self._df = df
            self._transactions = self._convert_to_transactions(df)

            # 解析結果のサマリーをログ出力
            logger.info(
                f"Parsed {len(self._transactions)} transactions "
                f"({len(self._parse_errors)} errors)"
            )

            return self._transactions

        except CSVParseError:
            raise
        except pd.errors.EmptyDataError:
            raise CSVParseError(f"CSV file contains no data: {self.csv_path}")
        except Exception as e:
            raise CSVParseError(f"Failed to parse CSV: {str(e)}") from e

    def _read_csv_with_encoding_detection(self) -> pd.DataFrame:
        """複数のエンコーディングを試行してCSVを読み込む

        Returns:
            読み込んだDataFrame

        Raises:
            CSVParseError: すべてのエンコーディングで失敗した場合
        """
        last_error = None

        for encoding in self.SUPPORTED_ENCODINGS:
            try:
                df = pd.read_csv(
                    self.csv_path,
                    encoding=encoding,
                    dtype=str,  # すべて文字列として読み込み、後で変換
                    na_values=["", "NA", "N/A", "null", "NULL"],
                    keep_default_na=True,
                )
                logger.debug(f"Successfully read CSV with encoding: {encoding}")
                return df

            except UnicodeDecodeError as e:
                last_error = e
                logger.debug(f"Encoding {encoding} failed: {e}")
                continue

            except Exception as e:
                last_error = e
                logger.debug(f"Failed to read CSV with {encoding}: {e}")
                continue

        raise CSVParseError(
            f"Could not decode CSV file with any supported encoding. "
            f"Tried: {', '.join(self.SUPPORTED_ENCODINGS)}. "
            f"Last error: {last_error}"
        )

    def _validate_columns(self, df: pd.DataFrame) -> None:
        """CSVカラムのバリデーション

        Args:
            df: 検証するDataFrame

        Raises:
            CSVParseError: 必須カラムが欠けている場合
        """
        if df.empty:
            raise CSVParseError("CSV file contains no rows")

        # 期待されるカラムと実際のカラムを比較
        expected_cols = set(self.COLUMN_MAPPING.keys())
        actual_cols = set(df.columns)

        missing_cols = expected_cols - actual_cols
        if missing_cols:
            # 類似カラム名を提案（タイポ対策）
            suggestions = []
            for missing in missing_cols:
                for actual in actual_cols:
                    if missing[:2] == actual[:2]:  # 先頭2文字が一致
                        suggestions.append(f"'{missing}' -> '{actual}'?")

            error_msg = f"Missing required columns: {missing_cols}"
            if suggestions:
                error_msg += f"\nPossible matches: {', '.join(suggestions)}"
            error_msg += f"\nActual columns: {list(actual_cols)}"

            raise CSVParseError(error_msg)

        # 余分なカラムがあれば警告
        extra_cols = actual_cols - expected_cols
        if extra_cols:
            logger.warning(f"Ignoring unexpected columns: {extra_cols}")

    def _preprocess_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """DataFrameの前処理（型変換、クリーニング）

        Args:
            df: 前処理するDataFrame

        Returns:
            前処理済みDataFrame
        """
        # 空白行を削除
        df = df.dropna(how="all")

        # カラム名の前後の空白を除去
        df.columns = df.columns.str.strip()

        # 各カラムの値の前後の空白を除去（文字列カラムのみ）
        for col in df.select_dtypes(include=["object"]).columns:
            df[col] = df[col].str.strip() if df[col].dtype == "object" else df[col]

        return df

    def _convert_to_transactions(self, df: pd.DataFrame) -> list[Transaction]:
        """DataFrameの各行をTransactionオブジェクトに変換

        Args:
            df: 変換するDataFrame

        Returns:
            Transactionオブジェクトのリスト
        """
        transactions = []
        self._parse_errors = []

        for idx, row in df.iterrows():
            try:
                transaction = self._parse_row(row, idx)
                if transaction:
                    transactions.append(transaction)
            except Exception as e:
                error_msg = f"Row {idx}: {str(e)}"
                self._parse_errors.append(error_msg)
                logger.warning(f"Skipping malformed row: {error_msg}")
                continue

        # すべての行でエラーが発生した場合は例外を発生
        if not transactions and self._parse_errors:
            raise CSVParseError(
                f"Failed to parse any transactions. "
                f"Errors: {self._parse_errors[:5]}..."  # 最初の5件のみ表示
            )

        return transactions

    def _parse_row(self, row: pd.Series, row_idx: int) -> Optional[Transaction]:
        """1行をTransactionオブジェクトに変換

        Args:
            row: DataFrameの1行
            row_idx: 行インデックス（エラーメッセージ用）

        Returns:
            Transaction オブジェクト、またはスキップする場合はNone
        """
        # 日付の解析
        date_str = row.get("日付", "")
        if pd.isna(date_str) or not str(date_str).strip():
            raise ValueError("Date is missing or empty")

        try:
            # 複数の日付形式に対応
            date = self._parse_date(str(date_str))
        except ValueError as e:
            raise ValueError(f"Invalid date format '{date_str}': {e}")

        # 金額の解析
        amount_str = row.get("金額（円）", "0")
        try:
            amount = self._parse_amount(amount_str)
        except ValueError as e:
            raise ValueError(f"Invalid amount '{amount_str}': {e}")

        # ブール値の解析
        is_calculated = self._parse_boolean(row.get("計算対象", "0"))
        is_transfer = self._parse_boolean(row.get("振替", "0"))

        # 文字列フィールドの安全な取得
        description = self._safe_string(row.get("内容", ""))
        institution = self._safe_string(row.get("保有金融機関", ""))
        major_category = self._safe_string(row.get("大項目", ""))
        minor_category = self._safe_string(row.get("中項目", ""))
        memo = self._safe_string(row.get("メモ", ""))
        transaction_id = self._safe_string(row.get("ID", f"unknown_{row_idx}"))

        return Transaction(
            is_calculated=is_calculated,
            date=date,
            description=description,
            amount=amount,
            institution=institution,
            major_category=major_category,
            minor_category=minor_category,
            memo=memo,
            is_transfer=is_transfer,
            transaction_id=transaction_id,
        )

    def _parse_date(self, date_str: str) -> datetime:
        """日付文字列を datetime に変換（複数形式対応）

        Args:
            date_str: 日付文字列

        Returns:
            datetime オブジェクト

        Raises:
            ValueError: 解析できない形式の場合
        """
        date_str = date_str.strip()

        # サポートする日付形式
        formats = [
            "%Y/%m/%d",      # 2024/01/15
            "%Y-%m-%d",      # 2024-01-15
            "%Y年%m月%d日",   # 2024年01月15日
            "%m/%d/%Y",      # 01/15/2024
            "%d/%m/%Y",      # 15/01/2024
        ]

        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue

        # pandasのパーサーをフォールバックとして使用
        try:
            return pd.to_datetime(date_str).to_pydatetime()
        except Exception:
            pass

        raise ValueError(f"Unrecognized date format: {date_str}")

    def _parse_amount(self, amount_str) -> int:
        """金額文字列を整数に変換

        Args:
            amount_str: 金額文字列（カンマ、通貨記号を含む場合あり）

        Returns:
            整数の金額

        Raises:
            ValueError: 解析できない形式の場合
        """
        if pd.isna(amount_str):
            return 0

        # 文字列に変換
        amount_str = str(amount_str).strip()

        if not amount_str:
            return 0

        # 通貨記号とカンマを除去
        cleaned = amount_str.replace("¥", "").replace(",", "").replace("円", "")
        cleaned = cleaned.replace("￥", "").replace(" ", "")

        # 小数点以下を切り捨て
        if "." in cleaned:
            cleaned = cleaned.split(".")[0]

        try:
            return int(cleaned)
        except ValueError:
            raise ValueError(f"Cannot convert to integer: {amount_str}")

    def _parse_boolean(self, value) -> bool:
        """ブール値として解釈可能な値を変換

        Args:
            value: 変換する値

        Returns:
            ブール値
        """
        if pd.isna(value):
            return False

        if isinstance(value, bool):
            return value

        str_value = str(value).strip().lower()
        return str_value in ["1", "true", "yes", "○", "◯"]

    def _safe_string(self, value) -> str:
        """安全に文字列に変換（None/NaN対応）

        Args:
            value: 変換する値

        Returns:
            文字列（None/NaNの場合は空文字）
        """
        if pd.isna(value) or value is None:
            return ""
        return str(value).strip()

    def get_parse_errors(self) -> list[str]:
        """解析中に発生したエラーのリストを取得

        Returns:
            エラーメッセージのリスト
        """
        return self._parse_errors.copy()

    def get_dataframe(self) -> pd.DataFrame:
        """Get parsed data as pandas DataFrame.

        Returns:
            DataFrame のコピー

        Raises:
            CSVParseError: まだ解析されていない場合
        """
        if self._df is None:
            self.parse()
        return self._df.copy()

    def get_summary(self) -> dict:
        """Get summary statistics of the parsed data.

        Returns:
            Dictionary with summary statistics
        """
        if self._transactions is None:
            self.parse()

        transactions = self._transactions

        # 空のトランザクションリストの場合
        if not transactions:
            return {
                "total_transactions": 0,
                "date_range": None,
                "total_income": 0,
                "total_expense": 0,
                "net_cashflow": 0,
                "expense_by_category": {},
                "institutions": [],
                "parse_errors": len(self._parse_errors),
            }

        # 振替を除外して計算（収支を正確に計算するため）
        non_transfer = [t for t in transactions if not t.is_transfer and t.is_calculated]

        income = sum(t.amount for t in non_transfer if t.amount > 0)
        expense = sum(t.amount for t in non_transfer if t.amount < 0)

        # カテゴリ別支出の集計
        expense_by_category: dict[str, int] = {}
        for t in non_transfer:
            if t.amount < 0:
                category = t.major_category or "未分類"
                expense_by_category[category] = expense_by_category.get(category, 0) + abs(t.amount)

        # 金額降順でソート
        expense_by_category = dict(
            sorted(expense_by_category.items(), key=lambda x: x[1], reverse=True)
        )

        # 日付範囲の安全な取得
        dates = [t.date for t in transactions if t.date]
        date_range = None
        if dates:
            date_range = {
                "start": min(dates).strftime("%Y-%m-%d"),
                "end": max(dates).strftime("%Y-%m-%d"),
            }

        return {
            "total_transactions": len(transactions),
            "date_range": date_range,
            "total_income": income,
            "total_expense": abs(expense),
            "net_cashflow": income + expense,
            "expense_by_category": expense_by_category,
            "institutions": list(set(t.institution for t in transactions if t.institution)),
            "parse_errors": len(self._parse_errors),
        }

    def to_csv_string(self) -> str:
        """Convert parsed data back to CSV string for API submission.

        Returns:
            CSV formatted string
        """
        if self._df is None:
            self.parse()
        return self._df.to_csv(index=False)

    def to_analysis_text(self) -> str:
        """Convert data to human-readable text for AI analysis.

        Returns:
            Formatted text suitable for AI analysis
        """
        if self._transactions is None:
            self.parse()

        summary = self.get_summary()

        # サマリーが空の場合
        if summary["total_transactions"] == 0:
            return "# 家計簿データサマリー\n\nデータがありません。"

        lines = [
            "# 家計簿データサマリー",
            "",
        ]

        # 日付範囲の表示
        if summary["date_range"]:
            lines.append(
                f"期間: {summary['date_range']['start']} 〜 {summary['date_range']['end']}"
            )
        lines.append(f"総取引数: {summary['total_transactions']}件")

        if summary["parse_errors"] > 0:
            lines.append(f"※ {summary['parse_errors']}件の解析エラーがありました")

        lines.extend([
            "",
            "## 収支概要",
            f"- 収入合計: ¥{summary['total_income']:,}",
            f"- 支出合計: ¥{summary['total_expense']:,}",
            f"- 収支差額: ¥{summary['net_cashflow']:,}",
            "",
            "## カテゴリ別支出",
        ])

        if summary["expense_by_category"]:
            for category, amount in summary["expense_by_category"].items():
                lines.append(f"- {category}: ¥{amount:,}")
        else:
            lines.append("- （支出データなし）")

        lines.extend([
            "",
            "## 取引明細（直近20件）",
        ])

        # 直近のトランザクションを表示
        recent = sorted(self._transactions, key=lambda t: t.date, reverse=True)[:20]
        for t in recent:
            amount_str = f"¥{t.amount:,}" if t.amount >= 0 else f"-¥{abs(t.amount):,}"
            lines.append(
                f"- {t.date.strftime('%Y-%m-%d')} | {t.description} | {amount_str} | {t.major_category}"
            )

        return "\n".join(lines)


def find_latest_csv(
    directory: str | Path,
    pattern: str = "*.csv",
    min_size_bytes: int = 100,
) -> Optional[Path]:
    """Find the most recently modified CSV file in a directory.

    Args:
        directory: Directory to search
        pattern: Glob pattern for CSV files
        min_size_bytes: Minimum file size to consider (skip empty files)

    Returns:
        Path to the most recent CSV file, or None if not found
    """
    # 入力バリデーション
    if directory is None:
        logger.warning("Directory is None")
        return None

    dir_path = Path(directory)

    if not dir_path.exists():
        logger.warning(f"Directory does not exist: {dir_path}")
        return None

    if not dir_path.is_dir():
        logger.warning(f"Path is not a directory: {dir_path}")
        return None

    try:
        # パターンに一致するファイルを検索
        csv_files = list(dir_path.glob(pattern))

        # 空でないファイルのみをフィルタ
        valid_files = [
            f for f in csv_files
            if f.is_file() and f.stat().st_size >= min_size_bytes
        ]

        if not valid_files:
            logger.info(f"No CSV files found in {dir_path} matching '{pattern}'")
            return None

        # 更新日時が最新のファイルを返す
        latest = max(valid_files, key=lambda p: p.stat().st_mtime)
        logger.info(f"Found latest CSV: {latest}")
        return latest

    except PermissionError as e:
        logger.error(f"Permission denied accessing directory: {e}")
        return None
    except OSError as e:
        logger.error(f"Error accessing directory: {e}")
        return None
