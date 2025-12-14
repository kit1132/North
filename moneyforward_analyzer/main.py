#!/usr/bin/env python3
"""
MoneyForward ME Weekly Analysis and Notification System

Main orchestration script that:
1. Exports CSV from MoneyForward ME (or uses existing CSV)
2. Parses and analyzes the data using Claude API
3. Sends notifications via LINE and/or email

Usage:
    python main.py                    # Use latest CSV in download directory
    python main.py --csv path/to.csv  # Use specific CSV file
    python main.py --export           # Export from MoneyForward first
    python main.py --dry-run          # Analyze but don't send notifications
"""

import argparse
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from .config import Config
from .csv_parser import CSVParser, find_latest_csv
from .ai_analyzer import AIAnalyzer
from .line_notifier import LineNotifier
from .email_notifier import EmailNotifier
from .selenium_exporter import SeleniumExporter


def setup_logging(log_dir: str, verbose: bool = False) -> logging.Logger:
    """Configure logging for the application."""
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    log_file = log_path / f"mf_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )

    return logging.getLogger(__name__)


def run_analysis(
    config: Config,
    csv_path: Optional[str] = None,
    export_first: bool = False,
    dry_run: bool = False,
    logger: Optional[logging.Logger] = None,
) -> bool:
    """Run the full analysis and notification pipeline.

    Args:
        config: Configuration object
        csv_path: Path to CSV file (optional)
        export_first: Whether to export from MoneyForward first
        dry_run: If True, analyze but don't send notifications
        logger: Logger instance

    Returns:
        True if successful
    """
    log = logger or logging.getLogger(__name__)

    # Step 1: Get CSV data
    if export_first:
        log.info("Exporting CSV from MoneyForward ME...")
        exporter = SeleniumExporter(
            email=config.mf_email,
            password=config.mf_password,
            totp_secret=config.mf_totp_secret,
            download_dir=config.csv_download_dir,
        )
        result = exporter.export()

        if not result.success:
            log.error(f"Export failed: {result.message}")
            return False

        csv_path = str(result.file_path)
        log.info(f"CSV exported to: {csv_path}")

    elif not csv_path:
        # Find latest CSV in download directory
        log.info(f"Looking for latest CSV in {config.csv_download_dir}")
        latest = find_latest_csv(config.csv_download_dir)

        if not latest:
            log.error("No CSV files found in download directory")
            return False

        csv_path = str(latest)
        log.info(f"Using CSV: {csv_path}")

    # Step 2: Parse CSV
    log.info("Parsing CSV data...")
    try:
        parser = CSVParser(csv_path)
        transactions = parser.parse()
        log.info(f"Parsed {len(transactions)} transactions")
    except Exception as e:
        log.error(f"Failed to parse CSV: {e}")
        return False

    # Get summary and formatted text for analysis
    summary = parser.get_summary()
    analysis_text = parser.to_analysis_text()

    log.info(f"Date range: {summary['date_range']['start']} to {summary['date_range']['end']}")
    log.info(f"Income: ¥{summary['total_income']:,}, Expense: ¥{summary['total_expense']:,}")

    # Step 3: AI Analysis
    log.info("Running AI analysis...")
    try:
        analyzer = AIAnalyzer(api_key=config.anthropic_api_key)
        result = analyzer.analyze(analysis_text)
        log.info("AI analysis completed")
    except Exception as e:
        log.error(f"AI analysis failed: {e}")
        return False

    # Generate notification message
    line_message = analyzer.generate_line_message(result)

    if dry_run:
        log.info("=== DRY RUN - Not sending notifications ===")
        log.info(f"Full report:\n{result.full_report}")
        log.info(f"LINE message:\n{line_message}")
        return True

    # Step 4: Send Notifications
    success = True

    # LINE notification
    log.info("Sending LINE notification...")
    try:
        line = LineNotifier(
            access_token=config.line_access_token,
            user_id=config.line_user_id,
        )
        line_result = line.send(line_message)

        if line_result.success:
            log.info("LINE notification sent successfully")
        else:
            log.warning(f"LINE notification failed: {line_result.message}")
            success = False
    except Exception as e:
        log.error(f"LINE notification error: {e}")
        success = False

    # Email notification (backup)
    if config.has_email_config():
        log.info("Sending email notification...")
        try:
            email = EmailNotifier(
                gmail_address=config.gmail_address,
                app_password=config.gmail_app_password,
                to_address=config.notification_email,
            )
            email_result = email.send_weekly_report(
                report_text=result.full_report,
                summary=result.summary,
            )

            if email_result.success:
                log.info("Email notification sent successfully")
            else:
                log.warning(f"Email notification failed: {email_result.message}")
        except Exception as e:
            log.error(f"Email notification error: {e}")

    return success


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="MoneyForward ME Weekly Analysis and Notification System"
    )
    parser.add_argument(
        "--csv",
        type=str,
        help="Path to CSV file to analyze",
    )
    parser.add_argument(
        "--export",
        action="store_true",
        help="Export CSV from MoneyForward first",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Analyze but don't send notifications",
    )
    parser.add_argument(
        "--env-file",
        type=str,
        help="Path to .env file",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    # Load configuration
    try:
        config = Config.from_env(args.env_file)
    except ValueError as e:
        print(f"Configuration error: {e}", file=sys.stderr)
        print("Please ensure all required environment variables are set.", file=sys.stderr)
        sys.exit(1)

    # Validate and show warnings
    warnings = config.validate()
    for warning in warnings:
        print(f"Warning: {warning}", file=sys.stderr)

    # Setup logging
    logger = setup_logging(config.log_dir, args.verbose)
    logger.info("MoneyForward ME Analysis starting...")

    # Run analysis
    success = run_analysis(
        config=config,
        csv_path=args.csv,
        export_first=args.export,
        dry_run=args.dry_run,
        logger=logger,
    )

    if success:
        logger.info("Analysis completed successfully")
        sys.exit(0)
    else:
        logger.error("Analysis failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
