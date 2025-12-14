"""
LINE Messaging API integration for notifications.

Uses LINE Messaging API to send push messages to the user.
Note: LINE Notify was deprecated on March 31, 2025.
"""

import json
from dataclasses import dataclass
from typing import Optional
import requests


@dataclass
class SendResult:
    """Result of sending a LINE message."""

    success: bool
    status_code: int
    message: str
    request_id: Optional[str] = None


class LineNotifier:
    """LINE Messaging API client for sending notifications."""

    API_ENDPOINT = "https://api.line.me/v2/bot/message/push"
    MAX_MESSAGE_LENGTH = 5000  # LINE text message limit

    def __init__(self, access_token: str, user_id: str):
        """Initialize LINE notifier.

        Args:
            access_token: Channel access token from LINE Developers Console
            user_id: Target user ID (starts with 'U', 32 hex chars)
        """
        self.access_token = access_token
        self.user_id = user_id

    def send(self, message: str) -> SendResult:
        """Send a text message to the configured user.

        Args:
            message: Text message to send (max 5000 chars)

        Returns:
            SendResult with success status and details
        """
        # Truncate if message is too long
        if len(message) > self.MAX_MESSAGE_LENGTH:
            message = message[: self.MAX_MESSAGE_LENGTH - 3] + "..."

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.access_token}",
        }

        payload = {
            "to": self.user_id,
            "messages": [{"type": "text", "text": message}],
        }

        try:
            response = requests.post(
                self.API_ENDPOINT,
                headers=headers,
                data=json.dumps(payload),
                timeout=30,
            )

            request_id = response.headers.get("X-Line-Request-Id")

            if response.status_code == 200:
                return SendResult(
                    success=True,
                    status_code=200,
                    message="Message sent successfully",
                    request_id=request_id,
                )
            else:
                error_body = response.json() if response.text else {}
                error_message = error_body.get("message", "Unknown error")
                return SendResult(
                    success=False,
                    status_code=response.status_code,
                    message=f"API error: {error_message}",
                    request_id=request_id,
                )

        except requests.exceptions.Timeout:
            return SendResult(
                success=False,
                status_code=0,
                message="Request timeout",
            )
        except requests.exceptions.RequestException as e:
            return SendResult(
                success=False,
                status_code=0,
                message=f"Request failed: {str(e)}",
            )

    def send_with_title(self, title: str, body: str) -> SendResult:
        """Send a message with a title format.

        Args:
            title: Title/header for the message
            body: Main content

        Returns:
            SendResult with success status
        """
        formatted_message = f"【{title}】\n\n{body}"
        return self.send(formatted_message)

    def send_multipart(self, messages: list[str]) -> list[SendResult]:
        """Send multiple messages as separate LINE messages.

        Args:
            messages: List of message strings

        Returns:
            List of SendResult for each message
        """
        results = []
        for msg in messages:
            result = self.send(msg)
            results.append(result)
            if not result.success:
                # Stop on first failure
                break
        return results

    def validate_credentials(self) -> bool:
        """Validate that the access token and user ID are valid.

        Returns:
            True if credentials appear valid
        """
        # Check token format
        if not self.access_token or len(self.access_token) < 100:
            return False

        # Check user ID format (U + 32 hex chars)
        if not self.user_id or not self.user_id.startswith("U"):
            return False
        if len(self.user_id) != 33:  # U + 32 chars
            return False

        return True

    def get_quota(self) -> Optional[dict]:
        """Get the message quota information.

        Returns:
            Dictionary with quota info, or None on error
        """
        headers = {"Authorization": f"Bearer {self.access_token}"}

        try:
            response = requests.get(
                "https://api.line.me/v2/bot/message/quota",
                headers=headers,
                timeout=10,
            )

            if response.status_code == 200:
                return response.json()
            return None

        except requests.exceptions.RequestException:
            return None
