"""
Configuration management for MoneyForward ME Auto Analysis System.

Loads settings from environment variables for security.
"""

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


class ConfigurationError(Exception):
    """設定関連のエラーを表すカスタム例外"""
    pass


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

    # バリデーションエラーを格納
    _validation_errors: list[str] = field(default_factory=list, repr=False)

    @classmethod
    def from_env(cls, env_file: Optional[str] = None) -> "Config":
        """Load configuration from environment variables.

        Args:
            env_file: Optional path to .env file

        Returns:
            Config instance with loaded settings

        Raises:
            ConfigurationError: If required environment variables are missing or invalid
        """
        try:
            # .envファイルの読み込み（存在しない場合も続行）
            if env_file:
                env_path = Path(env_file)
                if not env_path.exists():
                    raise ConfigurationError(f".env file not found: {env_file}")
                load_dotenv(env_path)
            else:
                load_dotenv()  # デフォルトの.envを探す

            # 必須環境変数のチェック
            required_vars = [
                "MF_EMAIL",
                "MF_PASSWORD",
                "ANTHROPIC_API_KEY",
                "LINE_ACCESS_TOKEN",
                "LINE_USER_ID",
            ]

            missing = [var for var in required_vars if not os.getenv(var)]
            if missing:
                raise ConfigurationError(
                    f"Missing required environment variables: {', '.join(missing)}\n"
                    "Please check your .env file or environment settings."
                )

            # パスの展開と正規化
            csv_dir = cls._expand_and_validate_path(
                os.getenv("CSV_DOWNLOAD_DIR", "~/Downloads"),
                "CSV_DOWNLOAD_DIR"
            )
            log_dir = cls._expand_and_validate_path(
                os.getenv("LOG_DIR", "~/logs/moneyforward"),
                "LOG_DIR",
                create_if_missing=True  # ログディレクトリは自動作成
            )

            config = cls(
                mf_email=os.getenv("MF_EMAIL", "").strip(),
                mf_password=os.getenv("MF_PASSWORD", ""),
                mf_totp_secret=os.getenv("MF_TOTP_SECRET"),
                anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", "").strip(),
                line_access_token=os.getenv("LINE_ACCESS_TOKEN", "").strip(),
                line_user_id=os.getenv("LINE_USER_ID", "").strip(),
                gmail_address=os.getenv("GMAIL_ADDRESS"),
                gmail_app_password=os.getenv("GMAIL_APP_PASSWORD"),
                notification_email=os.getenv("NOTIFICATION_EMAIL"),
                csv_download_dir=csv_dir,
                log_dir=log_dir,
            )

            # 値のフォーマットバリデーション
            config._validate_formats()

            return config

        except ConfigurationError:
            raise
        except Exception as e:
            raise ConfigurationError(f"Failed to load configuration: {str(e)}") from e

    @staticmethod
    def _expand_and_validate_path(
        path_str: str,
        var_name: str,
        create_if_missing: bool = False
    ) -> str:
        """パス文字列を展開し、バリデーションを行う

        Args:
            path_str: パス文字列（~を含む場合あり）
            var_name: 環境変数名（エラーメッセージ用）
            create_if_missing: Trueの場合、ディレクトリが存在しなければ作成

        Returns:
            展開された絶対パス
        """
        if not path_str or not path_str.strip():
            raise ConfigurationError(f"{var_name} cannot be empty")

        # チルダ展開と絶対パス化
        expanded = os.path.expanduser(path_str.strip())
        absolute = os.path.abspath(expanded)

        if create_if_missing:
            try:
                Path(absolute).mkdir(parents=True, exist_ok=True)
            except PermissionError:
                raise ConfigurationError(
                    f"Permission denied creating directory for {var_name}: {absolute}"
                )
            except OSError as e:
                raise ConfigurationError(
                    f"Failed to create directory for {var_name}: {e}"
                )

        return absolute

    def _validate_formats(self) -> None:
        """各設定値のフォーマットをバリデーション"""
        errors = []

        # メールアドレス形式チェック
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, self.mf_email):
            errors.append(f"Invalid email format for MF_EMAIL: {self.mf_email}")

        # LINE User ID形式チェック（U + 32文字の16進数）
        if not re.match(r'^U[0-9a-f]{32}$', self.line_user_id):
            errors.append(
                f"Invalid LINE_USER_ID format. Expected 'U' followed by 32 hex chars, "
                f"got: {self.line_user_id[:10]}..."
            )

        # Anthropic API Key形式チェック
        if not self.anthropic_api_key.startswith("sk-ant-"):
            errors.append(
                "ANTHROPIC_API_KEY should start with 'sk-ant-'. "
                "Please verify your API key."
            )

        # LINE Access Tokenの最小長チェック
        if len(self.line_access_token) < 100:
            errors.append(
                "LINE_ACCESS_TOKEN appears too short. "
                "Channel access tokens are typically 170+ characters."
            )

        # Gmail設定の整合性チェック
        gmail_fields = [self.gmail_address, self.gmail_app_password, self.notification_email]
        gmail_set = [f for f in gmail_fields if f]
        if gmail_set and len(gmail_set) != 3:
            errors.append(
                "Incomplete Gmail configuration. If using email notifications, "
                "all of GMAIL_ADDRESS, GMAIL_APP_PASSWORD, and NOTIFICATION_EMAIL are required."
            )

        # Gmailアドレス形式チェック
        if self.gmail_address and not re.match(email_pattern, self.gmail_address):
            errors.append(f"Invalid email format for GMAIL_ADDRESS: {self.gmail_address}")

        # TOTP secret形式チェック（設定されている場合）
        if self.mf_totp_secret:
            # Base32形式（A-Z, 2-7）、通常16-32文字
            if not re.match(r'^[A-Z2-7]{16,32}$', self.mf_totp_secret.upper()):
                errors.append(
                    "MF_TOTP_SECRET appears invalid. "
                    "Expected 16-32 character Base32 string (A-Z, 2-7)."
                )

        self._validation_errors = errors

        # 致命的なエラーがあれば例外を発生
        if errors:
            raise ConfigurationError(
                "Configuration validation failed:\n" +
                "\n".join(f"  - {e}" for e in errors)
            )

    def has_email_config(self) -> bool:
        """Check if email notification is fully configured."""
        return all([
            self.gmail_address,
            self.gmail_app_password,
            self.notification_email,
        ])

    def has_selenium_config(self) -> bool:
        """Check if Selenium auto-export is configured."""
        return bool(self.mf_totp_secret)

    def validate(self) -> list[str]:
        """Validate configuration and return list of warnings (non-fatal issues).

        Returns:
            List of warning messages about optional configurations
        """
        warnings = []

        # TOTP未設定の警告
        if not self.mf_totp_secret:
            warnings.append(
                "MF_TOTP_SECRET not set - 2FA automation disabled. "
                "Manual CSV download required."
            )

        # メール通知未設定の警告
        if not self.has_email_config():
            warnings.append(
                "Email notification not fully configured - LINE only. "
                "Set GMAIL_ADDRESS, GMAIL_APP_PASSWORD, NOTIFICATION_EMAIL for backup."
            )

        # CSVダウンロードディレクトリの存在確認
        if not Path(self.csv_download_dir).exists():
            warnings.append(
                f"CSV download directory does not exist: {self.csv_download_dir}"
            )

        return warnings

    def to_safe_dict(self) -> dict:
        """設定値を安全な形式（機密情報をマスク）で辞書として返す

        Returns:
            機密情報がマスクされた設定辞書
        """
        def mask_secret(value: Optional[str], visible_chars: int = 4) -> str:
            """機密情報をマスク"""
            if not value:
                return "(not set)"
            if len(value) <= visible_chars * 2:
                return "***"
            return f"{value[:visible_chars]}...{value[-visible_chars:]}"

        return {
            "mf_email": self.mf_email,
            "mf_password": mask_secret(self.mf_password, 0),
            "mf_totp_secret": "(set)" if self.mf_totp_secret else "(not set)",
            "anthropic_api_key": mask_secret(self.anthropic_api_key),
            "line_access_token": mask_secret(self.line_access_token),
            "line_user_id": self.line_user_id,
            "gmail_address": self.gmail_address or "(not set)",
            "gmail_app_password": mask_secret(self.gmail_app_password, 0),
            "notification_email": self.notification_email or "(not set)",
            "csv_download_dir": self.csv_download_dir,
            "log_dir": self.log_dir,
        }

    def __str__(self) -> str:
        """安全な文字列表現を返す"""
        safe = self.to_safe_dict()
        lines = ["Config:"]
        for key, value in safe.items():
            lines.append(f"  {key}: {value}")
        return "\n".join(lines)
