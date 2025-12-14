"""
CSV Parser for MoneyForward ME export data.

Parses CSV files exported from MoneyForward ME and provides
structured access to transaction data for analysis.
"""

import csv
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional
import pandas as pd


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


class CSVParser:
    """Parser for MoneyForward ME CSV export files."""

    # Expected CSV columns in Japanese
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

    def __init__(self, csv_path: str | Path):
        """Initialize parser with CSV file path.

        Args:
            csv_path: Path to the MoneyForward ME CSV export file
        """
        self.csv_path = Path(csv_path)
        self._df: Optional[pd.DataFrame] = None
        self._transactions: Optional[list[Transaction]] = None

    def parse(self) -> list[Transaction]:
        """Parse CSV file and return list of transactions.

        Returns:
            List of Transaction objects

        Raises:
            FileNotFoundError: If CSV file doesn't exist
            ValueError: If CSV format is invalid
        """
        if not self.csv_path.exists():
            raise FileNotFoundError(f"CSV file not found: {self.csv_path}")

        # Read CSV with proper encoding (MoneyForward uses Shift-JIS or UTF-8)
        encodings = ["utf-8", "shift_jis", "cp932"]
        df = None

        for encoding in encodings:
            try:
                df = pd.read_csv(self.csv_path, encoding=encoding)
                break
            except UnicodeDecodeError:
                continue

        if df is None:
            raise ValueError(f"Could not decode CSV file: {self.csv_path}")

        # Validate columns
        missing_cols = set(self.COLUMN_MAPPING.keys()) - set(df.columns)
        if missing_cols:
            raise ValueError(f"Missing expected columns: {missing_cols}")

        self._df = df
        self._transactions = self._convert_to_transactions(df)
        return self._transactions

    def _convert_to_transactions(self, df: pd.DataFrame) -> list[Transaction]:
        """Convert DataFrame rows to Transaction objects."""
        transactions = []

        for _, row in df.iterrows():
            try:
                transaction = Transaction(
                    is_calculated=row["計算対象"] == 1 or row["計算対象"] == "1",
                    date=pd.to_datetime(row["日付"]),
                    description=str(row["内容"]),
                    amount=int(row["金額（円）"]),
                    institution=str(row["保有金融機関"]),
                    major_category=str(row["大項目"]),
                    minor_category=str(row["中項目"]),
                    memo=str(row["メモ"]) if pd.notna(row["メモ"]) else "",
                    is_transfer=row["振替"] == 1 or row["振替"] == "1",
                    transaction_id=str(row["ID"]),
                )
                transactions.append(transaction)
            except (ValueError, KeyError) as e:
                # Skip malformed rows with a warning
                print(f"Warning: Skipping malformed row: {e}")
                continue

        return transactions

    def get_dataframe(self) -> pd.DataFrame:
        """Get parsed data as pandas DataFrame."""
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
        if not transactions:
            return {"total_transactions": 0}

        # Filter out transfers for accurate income/expense calculation
        non_transfer = [t for t in transactions if not t.is_transfer and t.is_calculated]

        income = sum(t.amount for t in non_transfer if t.amount > 0)
        expense = sum(t.amount for t in non_transfer if t.amount < 0)

        # Category breakdown
        expense_by_category = {}
        for t in non_transfer:
            if t.amount < 0:
                category = t.major_category
                expense_by_category[category] = expense_by_category.get(category, 0) + abs(t.amount)

        # Sort by amount descending
        expense_by_category = dict(
            sorted(expense_by_category.items(), key=lambda x: x[1], reverse=True)
        )

        return {
            "total_transactions": len(transactions),
            "date_range": {
                "start": min(t.date for t in transactions).strftime("%Y-%m-%d"),
                "end": max(t.date for t in transactions).strftime("%Y-%m-%d"),
            },
            "total_income": income,
            "total_expense": abs(expense),
            "net_cashflow": income + expense,
            "expense_by_category": expense_by_category,
            "institutions": list(set(t.institution for t in transactions)),
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
        lines = [
            "# 家計簿データサマリー",
            "",
            f"期間: {summary['date_range']['start']} 〜 {summary['date_range']['end']}",
            f"総取引数: {summary['total_transactions']}件",
            "",
            "## 収支概要",
            f"- 収入合計: ¥{summary['total_income']:,}",
            f"- 支出合計: ¥{summary['total_expense']:,}",
            f"- 収支差額: ¥{summary['net_cashflow']:,}",
            "",
            "## カテゴリ別支出",
        ]

        for category, amount in summary["expense_by_category"].items():
            lines.append(f"- {category}: ¥{amount:,}")

        lines.extend([
            "",
            "## 取引明細（直近20件）",
        ])

        # Add recent transactions
        recent = sorted(self._transactions, key=lambda t: t.date, reverse=True)[:20]
        for t in recent:
            amount_str = f"¥{t.amount:,}" if t.amount >= 0 else f"-¥{abs(t.amount):,}"
            lines.append(
                f"- {t.date.strftime('%Y-%m-%d')} | {t.description} | {amount_str} | {t.major_category}"
            )

        return "\n".join(lines)


def find_latest_csv(directory: str | Path, pattern: str = "*.csv") -> Optional[Path]:
    """Find the most recently modified CSV file in a directory.

    Args:
        directory: Directory to search
        pattern: Glob pattern for CSV files

    Returns:
        Path to the most recent CSV file, or None if not found
    """
    dir_path = Path(directory)
    if not dir_path.exists():
        return None

    csv_files = list(dir_path.glob(pattern))
    if not csv_files:
        return None

    # Return most recently modified file
    return max(csv_files, key=lambda p: p.stat().st_mtime)
