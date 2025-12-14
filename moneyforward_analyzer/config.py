"""
Configuration management for MoneyForward ME Auto Analysis System.

Loads settings from environment variables for security.
"""

import os
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv


@dataclass
class Config:
    """Configuration settings loaded from environment variables."""

    # MoneyForward credentials
    mf_email: str
    mf_password: str
    mf_totp_secret: Optional[str]

    # Claude API
    anthropic_api_key: str

    # LINE Messaging API
    line_access_token: str
    line_user_id: str

    # Gmail SMTP (backup notification)
    gmail_address: Optional[str]
    gmail_app_password: Optional[str]
    notification_email: Optional[str]

    # Paths
    csv_download_dir: str
    log_dir: str

    @classmethod
    def from_env(cls, env_file: Optional[str] = None) -> "Config":
        """Load configuration from environment variables.

        Args:
            env_file: Optional path to .env file

        Returns:
            Config instance with loaded settings

        Raises:
            ValueError: If required environment variables are missing
        """
        if env_file:
            load_dotenv(env_file)
        else:
            load_dotenv()

        # Required variables
        required_vars = [
            "MF_EMAIL",
            "MF_PASSWORD",
            "ANTHROPIC_API_KEY",
            "LINE_ACCESS_TOKEN",
            "LINE_USER_ID",
        ]

        missing = [var for var in required_vars if not os.getenv(var)]
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")

        return cls(
            mf_email=os.getenv("MF_EMAIL", ""),
            mf_password=os.getenv("MF_PASSWORD", ""),
            mf_totp_secret=os.getenv("MF_TOTP_SECRET"),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            line_access_token=os.getenv("LINE_ACCESS_TOKEN", ""),
            line_user_id=os.getenv("LINE_USER_ID", ""),
            gmail_address=os.getenv("GMAIL_ADDRESS"),
            gmail_app_password=os.getenv("GMAIL_APP_PASSWORD"),
            notification_email=os.getenv("NOTIFICATION_EMAIL"),
            csv_download_dir=os.getenv("CSV_DOWNLOAD_DIR", os.path.expanduser("~/Downloads")),
            log_dir=os.getenv("LOG_DIR", os.path.expanduser("~/logs/moneyforward")),
        )

    def has_email_config(self) -> bool:
        """Check if email notification is configured."""
        return all([
            self.gmail_address,
            self.gmail_app_password,
            self.notification_email,
        ])

    def validate(self) -> list[str]:
        """Validate configuration and return list of warnings."""
        warnings = []

        if not self.mf_totp_secret:
            warnings.append("MF_TOTP_SECRET not set - 2FA automation disabled")

        if not self.has_email_config():
            warnings.append("Email notification not configured - LINE only")

        return warnings
