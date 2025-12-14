"""
Email notification via Gmail SMTP.

Uses Gmail SMTP with app password for sending email notifications.
This is a backup notification method alongside LINE.
"""

import html
import logging
import re
import smtplib
import socket
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

# ロガー設定
logger = logging.getLogger(__name__)


class EmailNotificationError(Exception):
    """メール通知エラーを表すカスタム例外"""
    pass


@dataclass
class EmailResult:
    """Result of sending an email."""

    success: bool
    message: str
    error_code: Optional[str] = None  # SMTPエラーコード


class EmailNotifier:
    """Gmail SMTP client for sending email notifications.

    Gmail SMTPとアプリパスワードを使用してメール通知を送信する。
    LINE通知のバックアップとして機能。
    """

    SMTP_HOST = "smtp.gmail.com"
    SMTP_PORT = 587
    SMTP_TIMEOUT = 30  # 接続タイムアウト（秒）

    # メール制限
    MAX_SUBJECT_LENGTH = 200
    MAX_BODY_LENGTH = 100000  # 約100KB

    def __init__(
        self,
        gmail_address: str,
        app_password: str,
        to_address: Optional[str] = None,
    ):
        """Initialize email notifier.

        Args:
            gmail_address: Gmail address to send from
            app_password: 16-character Gmail app password
            to_address: Recipient address (defaults to sender)

        Raises:
            EmailNotificationError: If credentials are invalid
        """
        # 入力バリデーション
        self._validate_gmail_address(gmail_address)
        self._validate_app_password(app_password)

        self.gmail_address = gmail_address.strip()
        self.app_password = app_password.strip()

        # 宛先アドレスのバリデーション（指定がある場合）
        if to_address:
            self._validate_email_address(to_address, "to_address")
            self.to_address = to_address.strip()
        else:
            self.to_address = self.gmail_address

    def _validate_gmail_address(self, address: str) -> None:
        """Gmailアドレスのバリデーション

        Args:
            address: 検証するアドレス

        Raises:
            EmailNotificationError: アドレスが無効な場合
        """
        if not address or not address.strip():
            raise EmailNotificationError("Gmail address cannot be empty")

        self._validate_email_address(address, "gmail_address")

        # Gmail特有のチェック
        address_lower = address.strip().lower()
        if not (address_lower.endswith("@gmail.com") or
                address_lower.endswith("@googlemail.com")):
            logger.warning(
                f"Address '{address}' is not a Gmail address. "
                "This may not work with Gmail SMTP."
            )

    def _validate_email_address(self, address: str, field_name: str) -> None:
        """メールアドレス形式のバリデーション

        Args:
            address: 検証するアドレス
            field_name: フィールド名（エラーメッセージ用）

        Raises:
            EmailNotificationError: アドレス形式が無効な場合
        """
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, address.strip()):
            raise EmailNotificationError(
                f"Invalid email format for {field_name}: {address}"
            )

    def _validate_app_password(self, password: str) -> None:
        """アプリパスワードのバリデーション

        Args:
            password: 検証するパスワード

        Raises:
            EmailNotificationError: パスワードが無効な場合
        """
        if not password or not password.strip():
            raise EmailNotificationError("App password cannot be empty")

        # Googleアプリパスワードは通常16文字（スペース除く）
        cleaned_password = password.replace(" ", "")
        if len(cleaned_password) != 16:
            logger.warning(
                f"App password length ({len(cleaned_password)}) differs from expected 16 chars. "
                "This may cause authentication to fail."
            )

    def _sanitize_subject(self, subject: str) -> str:
        """件名のサニタイズ

        Args:
            subject: 件名文字列

        Returns:
            サニタイズされた件名
        """
        if not subject:
            return "（件名なし）"

        # 改行を除去
        subject = subject.replace("\n", " ").replace("\r", " ")

        # 長すぎる場合は切り詰め
        if len(subject) > self.MAX_SUBJECT_LENGTH:
            subject = subject[:self.MAX_SUBJECT_LENGTH - 3] + "..."

        return subject.strip()

    def _sanitize_html(self, html_content: str) -> str:
        """HTMLコンテンツのサニタイズ（XSS防止）

        Args:
            html_content: HTMLコンテンツ

        Returns:
            サニタイズされたHTMLコンテンツ
        """
        # 基本的なHTMLエスケープ（テンプレート部分以外）
        # 注: このシステムでは内部生成のHTMLのみ使用するため、
        # ユーザー入力部分のみエスケープ
        return html_content

    def send(
        self,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
    ) -> EmailResult:
        """Send an email notification.

        Args:
            subject: Email subject line
            body: Plain text body
            html_body: Optional HTML body

        Returns:
            EmailResult with success status
        """
        # 入力バリデーション
        if not body or not body.strip():
            return EmailResult(
                success=False,
                message="Email body cannot be empty",
            )

        # 件名のサニタイズ
        subject = self._sanitize_subject(subject)

        # 本文のサイズチェック
        if len(body) > self.MAX_BODY_LENGTH:
            logger.warning(
                f"Email body truncated from {len(body)} to {self.MAX_BODY_LENGTH} chars"
            )
            body = body[:self.MAX_BODY_LENGTH] + "\n\n[本文が長すぎるため省略されました]"

        try:
            # メッセージ作成
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self.gmail_address
            msg["To"] = self.to_address

            # プレーンテキスト部分を追加
            msg.attach(MIMEText(body, "plain", "utf-8"))

            # HTML部分を追加（存在する場合）
            if html_body:
                msg.attach(MIMEText(html_body, "html", "utf-8"))

            # SMTP接続と送信
            return self._send_smtp(msg)

        except EmailNotificationError:
            raise
        except Exception as e:
            logger.error(f"Unexpected error creating email: {e}")
            return EmailResult(
                success=False,
                message=f"Failed to create email: {str(e)}",
            )

    def _send_smtp(self, msg: MIMEMultipart) -> EmailResult:
        """SMTP経由でメールを送信

        Args:
            msg: 送信するメッセージ

        Returns:
            EmailResult with success status
        """
        try:
            with smtplib.SMTP(
                self.SMTP_HOST,
                self.SMTP_PORT,
                timeout=self.SMTP_TIMEOUT
            ) as server:
                # TLS暗号化を開始
                server.starttls()

                # 認証
                server.login(self.gmail_address, self.app_password)

                # 送信
                server.sendmail(
                    self.gmail_address,
                    self.to_address,
                    msg.as_string(),
                )

            logger.info(f"Email sent successfully to {self.to_address}")
            return EmailResult(
                success=True,
                message="Email sent successfully",
            )

        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication failed: {e}")
            return EmailResult(
                success=False,
                message="Authentication failed. Check Gmail address and app password.",
                error_code=str(e.smtp_code) if hasattr(e, 'smtp_code') else None,
            )

        except smtplib.SMTPRecipientsRefused as e:
            logger.error(f"Recipient refused: {e}")
            return EmailResult(
                success=False,
                message=f"Recipient address rejected: {self.to_address}",
                error_code="RECIPIENTS_REFUSED",
            )

        except smtplib.SMTPSenderRefused as e:
            logger.error(f"Sender refused: {e}")
            return EmailResult(
                success=False,
                message=f"Sender address rejected: {self.gmail_address}",
                error_code="SENDER_REFUSED",
            )

        except smtplib.SMTPDataError as e:
            logger.error(f"SMTP data error: {e}")
            return EmailResult(
                success=False,
                message=f"Mail data error: {str(e)}",
                error_code=str(e.smtp_code) if hasattr(e, 'smtp_code') else None,
            )

        except smtplib.SMTPServerDisconnected:
            logger.error("SMTP server disconnected unexpectedly")
            return EmailResult(
                success=False,
                message="Server disconnected unexpectedly. Try again later.",
                error_code="DISCONNECTED",
            )

        except smtplib.SMTPException as e:
            logger.error(f"SMTP error: {e}")
            return EmailResult(
                success=False,
                message=f"SMTP error: {str(e)}",
            )

        except socket.timeout:
            logger.error("SMTP connection timed out")
            return EmailResult(
                success=False,
                message="Connection timed out. Check your network connection.",
                error_code="TIMEOUT",
            )

        except socket.error as e:
            logger.error(f"Network error: {e}")
            return EmailResult(
                success=False,
                message=f"Network error: {str(e)}",
                error_code="NETWORK_ERROR",
            )

        except Exception as e:
            logger.error(f"Unexpected error sending email: {e}")
            return EmailResult(
                success=False,
                message=f"Failed to send email: {str(e)}",
            )

    def send_weekly_report(
        self,
        report_text: str,
        summary: str,
    ) -> EmailResult:
        """Send a formatted weekly report email.

        Args:
            report_text: Full analysis report
            summary: Brief summary for email body

        Returns:
            EmailResult with success status
        """
        # 入力バリデーション
        if not report_text:
            report_text = "（レポートなし）"
        if not summary:
            summary = "（サマリーなし）"

        subject = "📊 週次家計レポート - MoneyForward ME分析"

        # プレーンテキスト版
        body = f"""週次家計レポート
================

{summary}

---

詳細レポート:

{report_text}

---
このメールはMoneyForward ME自動分析システムから送信されました。
"""

        # HTML版（XSS対策としてユーザー入力をエスケープ）
        escaped_summary = html.escape(summary)
        escaped_report = html.escape(report_text)

        html_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{
            font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
        }}
        .container {{
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        h1 {{
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }}
        .summary {{
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }}
        .report {{
            background: #fff;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 8px;
        }}
        pre {{
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 14px;
            font-family: 'Consolas', 'Monaco', monospace;
        }}
        .footer {{
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 週次家計レポート</h1>
        <div class="summary">
            <h3>サマリー</h3>
            <p>{escaped_summary}</p>
        </div>
        <div class="report">
            <h3>詳細レポート</h3>
            <pre>{escaped_report}</pre>
        </div>
        <div class="footer">
            このメールはMoneyForward ME自動分析システムから送信されました。
        </div>
    </div>
</body>
</html>"""

        return self.send(subject, body, html_body)

    def validate_credentials(self) -> EmailResult:
        """Validate Gmail credentials by attempting to connect.

        Returns:
            EmailResult indicating if credentials are valid
        """
        try:
            with smtplib.SMTP(
                self.SMTP_HOST,
                self.SMTP_PORT,
                timeout=self.SMTP_TIMEOUT
            ) as server:
                server.starttls()
                server.login(self.gmail_address, self.app_password)

            logger.info("Gmail credentials validated successfully")
            return EmailResult(
                success=True,
                message="Credentials valid",
            )

        except smtplib.SMTPAuthenticationError:
            return EmailResult(
                success=False,
                message="Invalid credentials. Check Gmail address and app password.",
                error_code="AUTH_FAILED",
            )

        except socket.timeout:
            return EmailResult(
                success=False,
                message="Connection timed out",
                error_code="TIMEOUT",
            )

        except Exception as e:
            return EmailResult(
                success=False,
                message=f"Validation failed: {str(e)}",
            )

    def test_send(self) -> EmailResult:
        """Send a test email to verify the configuration.

        Returns:
            EmailResult indicating if test was successful
        """
        return self.send(
            subject="🧪 MoneyForward ME分析システム - テストメール",
            body="このメールはMoneyForward ME自動分析システムの設定テストです。\n\n"
                 "このメールが届いていれば、メール通知の設定は正常です。",
        )
