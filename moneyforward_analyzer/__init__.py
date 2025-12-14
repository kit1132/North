"""
MoneyForward ME Auto Analysis System

This package provides automated weekly analysis and notification
for MoneyForward ME personal finance data.
"""

__version__ = "1.0.0"
__author__ = "Your Name"

# Configuration
from .config import Config, ConfigurationError

# CSV Parsing
from .csv_parser import CSVParser, CSVParseError, Transaction, find_latest_csv

# AI Analysis
from .ai_analyzer import AIAnalyzer, AIAnalysisError, AnalysisResult

# Notifications
from .line_notifier import LineNotifier, LineNotificationError, SendResult
from .email_notifier import EmailNotifier, EmailNotificationError, EmailResult

# Selenium Export
from .selenium_exporter import (
    SeleniumExporter,
    SeleniumExportError,
    ExportResult,
    export_current_month,
)

__all__ = [
    # Configuration
    "Config",
    "ConfigurationError",
    # CSV
    "CSVParser",
    "CSVParseError",
    "Transaction",
    "find_latest_csv",
    # AI
    "AIAnalyzer",
    "AIAnalysisError",
    "AnalysisResult",
    # LINE
    "LineNotifier",
    "LineNotificationError",
    "SendResult",
    # Email
    "EmailNotifier",
    "EmailNotificationError",
    "EmailResult",
    # Selenium
    "SeleniumExporter",
    "SeleniumExportError",
    "ExportResult",
    "export_current_month",
]
