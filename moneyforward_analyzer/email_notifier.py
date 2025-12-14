"""
Email notification via Gmail SMTP.

Uses Gmail SMTP with app password for sending email notifications.
This is a backup notification method alongside LINE.
"""

import smtplib
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional


@dataclass
class EmailResult:
    """Result of sending an email."""

    success: bool
    message: str


class EmailNotifier:
    """Gmail SMTP client for sending email notifications."""

    SMTP_HOST = "smtp.gmail.com"
    SMTP_PORT = 587

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
        """
        self.gmail_address = gmail_address
        self.app_password = app_password
        self.to_address = to_address or gmail_address

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
        try:
            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self.gmail_address
            msg["To"] = self.to_address

            # Add plain text part
            msg.attach(MIMEText(body, "plain", "utf-8"))

            # Add HTML part if provided
            if html_body:
                msg.attach(MIMEText(html_body, "html", "utf-8"))

            # Connect and send
            with smtplib.SMTP(self.SMTP_HOST, self.SMTP_PORT) as server:
                server.starttls()
                server.login(self.gmail_address, self.app_password)
                server.sendmail(
                    self.gmail_address,
                    self.to_address,
                    msg.as_string(),
                )

            return EmailResult(success=True, message="Email sent successfully")

        except smtplib.SMTPAuthenticationError:
            return EmailResult(
                success=False,
                message="Authentication failed. Check Gmail address and app password.",
            )
        except smtplib.SMTPException as e:
            return EmailResult(success=False, message=f"SMTP error: {str(e)}")
        except Exception as e:
            return EmailResult(success=False, message=f"Failed to send email: {str(e)}")

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
        subject = "📊 週次家計レポート - MoneyForward ME分析"

        # Plain text version
        body = f"""
週次家計レポート
================

{summary}

---

詳細レポート:

{report_text}

---
このメールはMoneyForward ME自動分析システムから送信されました。
"""

        # HTML version
        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        h1 {{ color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }}
        .summary {{ background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }}
        .report {{ background: #fff; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }}
        pre {{ white-space: pre-wrap; font-size: 14px; }}
        .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 週次家計レポート</h1>
        <div class="summary">
            <h3>サマリー</h3>
            <p>{summary}</p>
        </div>
        <div class="report">
            <h3>詳細レポート</h3>
            <pre>{report_text}</pre>
        </div>
        <div class="footer">
            このメールはMoneyForward ME自動分析システムから送信されました。
        </div>
    </div>
</body>
</html>
"""

        return self.send(subject, body, html_body)

    def validate_credentials(self) -> EmailResult:
        """Validate Gmail credentials by attempting to connect.

        Returns:
            EmailResult indicating if credentials are valid
        """
        try:
            with smtplib.SMTP(self.SMTP_HOST, self.SMTP_PORT) as server:
                server.starttls()
                server.login(self.gmail_address, self.app_password)
            return EmailResult(success=True, message="Credentials valid")
        except smtplib.SMTPAuthenticationError:
            return EmailResult(success=False, message="Invalid credentials")
        except Exception as e:
            return EmailResult(success=False, message=str(e))
