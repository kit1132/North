"""
LINE Messaging API integration for notifications.

Uses LINE Messaging API to send push messages to the user.
Note: LINE Notify was deprecated on March 31, 2025.
"""

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Optional

import requests

# ロガー設定
logger = logging.getLogger(__name__)


class LineNotificationError(Exception):
    """LINE通知エラーを表すカスタム例外"""
    pass


@dataclass
class SendResult:
    """Result of sending a LINE message."""

    success: bool
    status_code: int
    message: str
    request_id: Optional[str] = None
    retry_count: int = 0  # リトライ回数


class LineNotifier:
    """LINE Messaging API client for sending notifications.

    LINE Messaging APIを使用してプッシュメッセージを送信する。
    リトライ機能と詳細なエラーハンドリングを提供。
    """

    API_ENDPOINT = "https://api.line.me/v2/bot/message/push"
    QUOTA_ENDPOINT = "https://api.line.me/v2/bot/message/quota"
    MAX_MESSAGE_LENGTH = 5000  # LINEテキストメッセージの上限

    # リトライ設定
    MAX_RETRIES = 3
    RETRY_DELAY_SECONDS = 2
    MAX_RETRY_DELAY_SECONDS = 30

    # タイムアウト設定
    REQUEST_TIMEOUT = 30

    def __init__(
        self,
        access_token: str,
        user_id: str,
        max_retries: int = MAX_RETRIES,
    ):
        """Initialize LINE notifier.

        Args:
            access_token: Channel access token from LINE Developers Console
            user_id: Target user ID (starts with 'U', 32 hex chars)
            max_retries: Maximum number of retry attempts

        Raises:
            LineNotificationError: If credentials are invalid
        """
        # 入力バリデーション
        self._validate_access_token(access_token)
        self._validate_user_id(user_id)

        self.access_token = access_token.strip()
        self.user_id = user_id.strip()
        self.max_retries = max_retries

    def _validate_access_token(self, token: str) -> None:
        """アクセストークンのバリデーション

        Args:
            token: 検証するアクセストークン

        Raises:
            LineNotificationError: トークンが無効な場合
        """
        if not token or not token.strip():
            raise LineNotificationError("Access token cannot be empty")

        # チャネルアクセストークンは通常170文字以上
        if len(token.strip()) < 100:
            raise LineNotificationError(
                f"Access token appears too short ({len(token)} chars). "
                "Channel access tokens are typically 170+ characters."
            )

    def _validate_user_id(self, user_id: str) -> None:
        """ユーザーIDのバリデーション

        Args:
            user_id: 検証するユーザーID

        Raises:
            LineNotificationError: ユーザーIDが無効な場合
        """
        if not user_id or not user_id.strip():
            raise LineNotificationError("User ID cannot be empty")

        user_id = user_id.strip()

        # LINE User ID形式: U + 32文字の16進数
        if not re.match(r'^U[0-9a-f]{32}$', user_id):
            raise LineNotificationError(
                f"Invalid user ID format. Expected 'U' followed by 32 hex chars, "
                f"got: '{user_id[:10]}...' (length: {len(user_id)})"
            )

    def _validate_message(self, message: str) -> str:
        """メッセージのバリデーションと正規化

        Args:
            message: 検証するメッセージ

        Returns:
            正規化されたメッセージ

        Raises:
            LineNotificationError: メッセージが無効な場合
        """
        if message is None:
            raise LineNotificationError("Message cannot be None")

        if not message.strip():
            raise LineNotificationError("Message cannot be empty")

        # 長すぎるメッセージは切り詰め
        if len(message) > self.MAX_MESSAGE_LENGTH:
            logger.warning(
                f"Message truncated from {len(message)} to {self.MAX_MESSAGE_LENGTH} chars"
            )
            message = message[:self.MAX_MESSAGE_LENGTH - 3] + "..."

        return message

    def send(self, message: str) -> SendResult:
        """Send a text message to the configured user.

        Args:
            message: Text message to send (max 5000 chars)

        Returns:
            SendResult with success status and details
        """
        try:
            message = self._validate_message(message)
        except LineNotificationError as e:
            return SendResult(
                success=False,
                status_code=0,
                message=str(e),
            )

        return self._send_with_retry(message)

    def _send_with_retry(self, message: str) -> SendResult:
        """リトライ機能付きでメッセージを送信

        Args:
            message: 送信するメッセージ

        Returns:
            SendResult with success status
        """
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.access_token}",
        }

        payload = {
            "to": self.user_id,
            "messages": [{"type": "text", "text": message}],
        }

        last_error = None
        delay = self.RETRY_DELAY_SECONDS

        for attempt in range(self.max_retries):
            try:
                logger.debug(f"LINE API call attempt {attempt + 1}/{self.max_retries}")

                response = requests.post(
                    self.API_ENDPOINT,
                    headers=headers,
                    data=json.dumps(payload),
                    timeout=self.REQUEST_TIMEOUT,
                )

                request_id = response.headers.get("X-Line-Request-Id")

                # 成功
                if response.status_code == 200:
                    logger.info(f"LINE message sent successfully (request_id: {request_id})")
                    return SendResult(
                        success=True,
                        status_code=200,
                        message="Message sent successfully",
                        request_id=request_id,
                        retry_count=attempt,
                    )

                # エラーレスポンスの解析
                error_message = self._parse_error_response(response)

                # リトライ可能なエラーかどうか判定
                if response.status_code >= 500:
                    # サーバーエラー - リトライ
                    last_error = f"Server error ({response.status_code}): {error_message}"
                    logger.warning(f"{last_error}. Retrying in {delay}s...")
                    time.sleep(delay)
                    delay = min(delay * 2, self.MAX_RETRY_DELAY_SECONDS)
                    continue

                elif response.status_code == 429:
                    # レート制限 - より長く待機してリトライ
                    last_error = f"Rate limited: {error_message}"
                    wait_time = min(delay * 3, self.MAX_RETRY_DELAY_SECONDS)
                    logger.warning(f"{last_error}. Waiting {wait_time}s...")
                    time.sleep(wait_time)
                    delay = wait_time
                    continue

                else:
                    # クライアントエラー - リトライしない
                    return SendResult(
                        success=False,
                        status_code=response.status_code,
                        message=f"API error: {error_message}",
                        request_id=request_id,
                        retry_count=attempt,
                    )

            except requests.exceptions.Timeout:
                last_error = "Request timeout"
                logger.warning(f"{last_error}. Retrying in {delay}s...")
                time.sleep(delay)
                delay = min(delay * 2, self.MAX_RETRY_DELAY_SECONDS)

            except requests.exceptions.ConnectionError as e:
                last_error = f"Connection error: {str(e)}"
                logger.warning(f"{last_error}. Retrying in {delay}s...")
                time.sleep(delay)
                delay = min(delay * 2, self.MAX_RETRY_DELAY_SECONDS)

            except requests.exceptions.RequestException as e:
                # その他のリクエストエラー - リトライしない
                return SendResult(
                    success=False,
                    status_code=0,
                    message=f"Request failed: {str(e)}",
                    retry_count=attempt,
                )

        # すべてのリトライが失敗
        return SendResult(
            success=False,
            status_code=0,
            message=f"Failed after {self.max_retries} attempts. Last error: {last_error}",
            retry_count=self.max_retries,
        )

    def _parse_error_response(self, response: requests.Response) -> str:
        """エラーレスポンスを解析

        Args:
            response: HTTPレスポンス

        Returns:
            エラーメッセージ文字列
        """
        try:
            if response.text:
                error_body = response.json()
                return error_body.get("message", str(error_body))
        except (json.JSONDecodeError, ValueError):
            pass

        return f"HTTP {response.status_code}: {response.reason}"

    def send_with_title(self, title: str, body: str) -> SendResult:
        """Send a message with a title format.

        Args:
            title: Title/header for the message
            body: Main content

        Returns:
            SendResult with success status
        """
        # 入力バリデーション
        if not title:
            title = "通知"
        if not body:
            return SendResult(
                success=False,
                status_code=0,
                message="Body cannot be empty",
            )

        formatted_message = f"【{title}】\n\n{body}"
        return self.send(formatted_message)

    def send_multipart(self, messages: list[str]) -> list[SendResult]:
        """Send multiple messages as separate LINE messages.

        Args:
            messages: List of message strings

        Returns:
            List of SendResult for each message
        """
        if not messages:
            return []

        results = []
        for idx, msg in enumerate(messages):
            if not msg or not msg.strip():
                logger.warning(f"Skipping empty message at index {idx}")
                continue

            result = self.send(msg)
            results.append(result)

            if not result.success:
                # 失敗したら残りをスキップ
                logger.error(f"Message {idx + 1} failed, stopping multipart send")
                break

            # メッセージ間に少し待機（レート制限対策）
            if idx < len(messages) - 1:
                time.sleep(0.5)

        return results

    def validate_credentials(self) -> SendResult:
        """Validate that the access token and user ID are valid by checking quota.

        Returns:
            SendResult indicating if credentials are valid
        """
        try:
            quota = self.get_quota()
            if quota is not None:
                return SendResult(
                    success=True,
                    status_code=200,
                    message=f"Credentials valid. Quota type: {quota.get('type', 'unknown')}",
                )
            else:
                return SendResult(
                    success=False,
                    status_code=0,
                    message="Could not verify credentials",
                )
        except Exception as e:
            return SendResult(
                success=False,
                status_code=0,
                message=f"Validation failed: {str(e)}",
            )

    def get_quota(self) -> Optional[dict]:
        """Get the message quota information.

        Returns:
            Dictionary with quota info, or None on error
        """
        headers = {"Authorization": f"Bearer {self.access_token}"}

        try:
            response = requests.get(
                self.QUOTA_ENDPOINT,
                headers=headers,
                timeout=10,
            )

            if response.status_code == 200:
                quota_data = response.json()
                logger.debug(f"LINE quota: {quota_data}")
                return quota_data

            logger.warning(f"Failed to get quota: HTTP {response.status_code}")
            return None

        except requests.exceptions.Timeout:
            logger.warning("Quota request timed out")
            return None
        except requests.exceptions.RequestException as e:
            logger.warning(f"Failed to get quota: {e}")
            return None
        except json.JSONDecodeError:
            logger.warning("Invalid JSON in quota response")
            return None

    def get_remaining_quota(self) -> Optional[int]:
        """Get the remaining message quota for this month.

        Returns:
            Remaining message count, or None if unavailable
        """
        try:
            headers = {"Authorization": f"Bearer {self.access_token}"}

            response = requests.get(
                "https://api.line.me/v2/bot/message/quota/consumption",
                headers=headers,
                timeout=10,
            )

            if response.status_code == 200:
                data = response.json()
                total_usage = data.get("totalUsage", 0)

                # 月間上限を取得
                quota = self.get_quota()
                if quota and "value" in quota:
                    remaining = quota["value"] - total_usage
                    logger.info(f"LINE quota remaining: {remaining}")
                    return remaining

            return None

        except Exception as e:
            logger.warning(f"Failed to get remaining quota: {e}")
            return None
