#!/usr/bin/env python3
"""
MoneyForward ME Weekly Analysis and Notification System

Main orchestration script that:
1. Exports CSV from MoneyForward ME (or uses existing CSV)
2. Parses and analyzes the data using Claude API
3. Sends notifications via LINE and/or email

Usage:
    python -m moneyforward_analyzer.main                    # Use latest CSV
    python -m moneyforward_analyzer.main --csv path/to.csv  # Use specific CSV
    python -m moneyforward_analyzer.main --export           # Export from MF first
    python -m moneyforward_analyzer.main --dry-run          # Analyze without notify
"""

import argparse
import logging
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import Optional

from .config import Config, ConfigurationError
from .csv_parser import CSVParser, CSVParseError, find_latest_csv
from .ai_analyzer import AIAnalyzer, AIAnalysisError
from .line_notifier import LineNotifier, LineNotificationError
from .email_notifier import EmailNotifier, EmailNotificationError
from .selenium_exporter import SeleniumExporter, SeleniumExportError

# ロガー設定
logger = logging.getLogger(__name__)


class AnalysisError(Exception):
    """分析処理全体のエラーを表すカスタム例外"""
    pass


def setup_logging(log_dir: str, verbose: bool = False) -> logging.Logger:
    """アプリケーションのログ設定を行う

    Args:
        log_dir: ログファイルの出力ディレクトリ
        verbose: 詳細ログを有効にするか

    Returns:
        設定済みのロガー
    """
    log_path = Path(log_dir)

    try:
        log_path.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        print(f"Warning: Cannot create log directory: {e}", file=sys.stderr)
        # ログディレクトリが作れない場合はカレントディレクトリを使用
        log_path = Path(".")

    log_file = log_path / f"mf_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

    # ログフォーマット設定
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format=log_format,
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )

    app_logger = logging.getLogger(__name__)
    app_logger.info(f"Logging to: {log_file}")

    return app_logger


def run_analysis(
    config: Config,
    csv_path: Optional[str] = None,
    export_first: bool = False,
    dry_run: bool = False,
) -> bool:
    """分析と通知のパイプライン全体を実行

    Args:
        config: 設定オブジェクト
        csv_path: CSVファイルのパス（オプション）
        export_first: MoneyForwardからまずエクスポートするか
        dry_run: Trueの場合、分析のみで通知は送信しない

    Returns:
        成功した場合True
    """
    # ========================================
    # Step 1: CSVデータの取得
    # ========================================
    csv_file_path = _get_csv_data(config, csv_path, export_first)
    if not csv_file_path:
        return False

    # ========================================
    # Step 2: CSVデータの解析
    # ========================================
    parser = _parse_csv_data(csv_file_path)
    if not parser:
        return False

    # サマリーと分析用テキストを取得
    summary = parser.get_summary()
    analysis_text = parser.to_analysis_text()

    _log_summary(summary)

    # ========================================
    # Step 3: AI分析
    # ========================================
    analysis_result = _run_ai_analysis(config, analysis_text)
    if not analysis_result:
        return False

    # LINE用メッセージを生成
    line_message = AIAnalyzer(config.anthropic_api_key).generate_line_message(analysis_result)

    # ドライランの場合はここで終了
    if dry_run:
        logger.info("=== DRY RUN - Not sending notifications ===")
        logger.info(f"Full report:\n{analysis_result.full_report}")
        logger.info(f"LINE message:\n{line_message}")
        return True

    # ========================================
    # Step 4: 通知送信
    # ========================================
    return _send_notifications(config, analysis_result, line_message)


def _get_csv_data(
    config: Config,
    csv_path: Optional[str],
    export_first: bool,
) -> Optional[str]:
    """CSVデータを取得（エクスポートまたは既存ファイル）

    Args:
        config: 設定オブジェクト
        csv_path: 指定されたCSVパス
        export_first: エクスポートを先に行うか

    Returns:
        CSVファイルのパス、失敗時はNone
    """
    if export_first:
        # MoneyForwardからエクスポート
        logger.info("Exporting CSV from MoneyForward ME...")
        try:
            exporter = SeleniumExporter(
                email=config.mf_email,
                password=config.mf_password,
                totp_secret=config.mf_totp_secret,
                download_dir=config.csv_download_dir,
            )
            result = exporter.export()

            if not result.success:
                logger.error(f"Export failed: {result.message}")
                return None

            logger.info(f"CSV exported to: {result.file_path}")
            return str(result.file_path)

        except SeleniumExportError as e:
            logger.error(f"Selenium export error: {e}")
            return None

    elif csv_path:
        # 指定されたCSVファイルを使用
        path = Path(csv_path)
        if not path.exists():
            logger.error(f"Specified CSV file not found: {csv_path}")
            return None
        if not path.is_file():
            logger.error(f"Path is not a file: {csv_path}")
            return None
        logger.info(f"Using specified CSV: {csv_path}")
        return csv_path

    else:
        # ダウンロードディレクトリから最新のCSVを検索
        logger.info(f"Looking for latest CSV in {config.csv_download_dir}")
        latest = find_latest_csv(config.csv_download_dir)

        if not latest:
            logger.error(
                f"No CSV files found in download directory: {config.csv_download_dir}\n"
                "Please download a CSV from MoneyForward ME or specify a file with --csv"
            )
            return None

        logger.info(f"Using latest CSV: {latest}")
        return str(latest)


def _parse_csv_data(csv_path: str) -> Optional[CSVParser]:
    """CSVデータを解析

    Args:
        csv_path: CSVファイルのパス

    Returns:
        CSVParserインスタンス、失敗時はNone
    """
    logger.info("Parsing CSV data...")
    try:
        parser = CSVParser(csv_path)
        transactions = parser.parse()

        logger.info(f"Parsed {len(transactions)} transactions")

        # 解析エラーがあれば警告
        parse_errors = parser.get_parse_errors()
        if parse_errors:
            logger.warning(f"Parse errors: {len(parse_errors)} rows skipped")
            for error in parse_errors[:5]:  # 最初の5件のみ表示
                logger.debug(f"  - {error}")

        return parser

    except CSVParseError as e:
        logger.error(f"CSV parse error: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error parsing CSV: {e}")
        logger.debug(traceback.format_exc())
        return None


def _log_summary(summary: dict) -> None:
    """サマリー情報をログ出力

    Args:
        summary: サマリー辞書
    """
    if summary.get("date_range"):
        logger.info(
            f"Date range: {summary['date_range']['start']} to {summary['date_range']['end']}"
        )

    logger.info(
        f"Income: ¥{summary.get('total_income', 0):,}, "
        f"Expense: ¥{summary.get('total_expense', 0):,}"
    )

    if summary.get("expense_by_category"):
        top_categories = list(summary["expense_by_category"].items())[:3]
        logger.info(
            f"Top categories: " +
            ", ".join(f"{cat}: ¥{amt:,}" for cat, amt in top_categories)
        )


def _run_ai_analysis(config: Config, analysis_text: str):
    """AI分析を実行

    Args:
        config: 設定オブジェクト
        analysis_text: 分析用テキスト

    Returns:
        AnalysisResult、失敗時はNone
    """
    logger.info("Running AI analysis...")
    try:
        analyzer = AIAnalyzer(api_key=config.anthropic_api_key)
        result = analyzer.analyze(analysis_text)

        if result.is_valid():
            logger.info(
                f"AI analysis completed (tokens used: {result.tokens_used})"
            )
        else:
            logger.warning("AI analysis completed but result may be incomplete")

        return result

    except AIAnalysisError as e:
        logger.error(f"AI analysis error: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error in AI analysis: {e}")
        logger.debug(traceback.format_exc())
        return None


def _send_notifications(config: Config, analysis_result, line_message: str) -> bool:
    """通知を送信

    Args:
        config: 設定オブジェクト
        analysis_result: 分析結果
        line_message: LINE用メッセージ

    Returns:
        少なくとも1つの通知が成功した場合True
    """
    line_success = False
    email_success = False

    # ----------------------------------------
    # LINE通知
    # ----------------------------------------
    logger.info("Sending LINE notification...")
    try:
        line = LineNotifier(
            access_token=config.line_access_token,
            user_id=config.line_user_id,
        )
        line_result = line.send(line_message)

        if line_result.success:
            logger.info(
                f"LINE notification sent successfully "
                f"(request_id: {line_result.request_id})"
            )
            line_success = True
        else:
            logger.warning(
                f"LINE notification failed: {line_result.message} "
                f"(status: {line_result.status_code})"
            )

    except LineNotificationError as e:
        logger.error(f"LINE notification error: {e}")
    except Exception as e:
        logger.error(f"Unexpected LINE error: {e}")
        logger.debug(traceback.format_exc())

    # ----------------------------------------
    # メール通知（バックアップ）
    # ----------------------------------------
    if config.has_email_config():
        logger.info("Sending email notification...")
        try:
            email = EmailNotifier(
                gmail_address=config.gmail_address,
                app_password=config.gmail_app_password,
                to_address=config.notification_email,
            )
            email_result = email.send_weekly_report(
                report_text=analysis_result.full_report,
                summary=analysis_result.summary,
            )

            if email_result.success:
                logger.info("Email notification sent successfully")
                email_success = True
            else:
                logger.warning(f"Email notification failed: {email_result.message}")

        except EmailNotificationError as e:
            logger.error(f"Email notification error: {e}")
        except Exception as e:
            logger.error(f"Unexpected email error: {e}")
            logger.debug(traceback.format_exc())

    # 結果判定
    if line_success or email_success:
        return True
    else:
        logger.error("All notifications failed")
        return False


def main() -> None:
    """メインエントリーポイント"""
    parser = argparse.ArgumentParser(
        description="MoneyForward ME Weekly Analysis and Notification System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                          Use latest CSV in download directory
  %(prog)s --csv ~/Downloads/mf.csv Use specific CSV file
  %(prog)s --export                 Export from MoneyForward first
  %(prog)s --dry-run                Analyze but don't send notifications
  %(prog)s --dry-run --csv mf.csv   Test analysis with specific file
        """,
    )

    parser.add_argument(
        "--csv",
        type=str,
        metavar="PATH",
        help="Path to CSV file to analyze",
    )
    parser.add_argument(
        "--export",
        action="store_true",
        help="Export CSV from MoneyForward first (requires Selenium)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Analyze but don't send notifications",
    )
    parser.add_argument(
        "--env-file",
        type=str,
        metavar="PATH",
        help="Path to .env file (default: .env in current directory)",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose (debug) logging",
    )
    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 1.0.0",
    )

    args = parser.parse_args()

    # ========================================
    # 設定の読み込み
    # ========================================
    try:
        config = Config.from_env(args.env_file)
    except ConfigurationError as e:
        print(f"Configuration error: {e}", file=sys.stderr)
        print("\nPlease check your .env file or environment variables.", file=sys.stderr)
        sys.exit(1)

    # 設定の警告を表示
    warnings = config.validate()
    for warning in warnings:
        print(f"Warning: {warning}", file=sys.stderr)

    # ========================================
    # ロギングの設定
    # ========================================
    app_logger = setup_logging(config.log_dir, args.verbose)
    app_logger.info("=" * 50)
    app_logger.info("MoneyForward ME Analysis starting...")
    app_logger.info("=" * 50)

    if args.verbose:
        app_logger.debug(f"Configuration: {config}")

    # ========================================
    # 分析の実行
    # ========================================
    try:
        success = run_analysis(
            config=config,
            csv_path=args.csv,
            export_first=args.export,
            dry_run=args.dry_run,
        )

        if success:
            app_logger.info("=" * 50)
            app_logger.info("Analysis completed successfully")
            app_logger.info("=" * 50)
            sys.exit(0)
        else:
            app_logger.error("=" * 50)
            app_logger.error("Analysis failed")
            app_logger.error("=" * 50)
            sys.exit(1)

    except KeyboardInterrupt:
        app_logger.warning("Interrupted by user")
        sys.exit(130)

    except Exception as e:
        app_logger.error(f"Unexpected error: {e}")
        app_logger.debug(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
