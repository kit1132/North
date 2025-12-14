"""
AI Analyzer for MoneyForward ME data using Claude API.

Uses Anthropic's Claude API to analyze spending patterns,
detect anomalies, and provide improvement suggestions.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import anthropic
from anthropic import APIError, APIConnectionError, RateLimitError, APIStatusError

# ロガー設定
logger = logging.getLogger(__name__)


class AIAnalysisError(Exception):
    """AI分析エラーを表すカスタム例外"""
    pass


@dataclass
class AnalysisResult:
    """Result of AI analysis on financial data."""

    summary: str  # Brief overview
    spending_insights: str  # Spending pattern analysis
    anomalies: str  # Unusual transactions detected
    recommendations: str  # Improvement suggestions
    full_report: str  # Complete analysis text
    model_used: str = ""  # 使用されたモデル
    tokens_used: int = 0  # 使用トークン数

    def is_valid(self) -> bool:
        """分析結果が有効かどうかをチェック

        Returns:
            少なくともサマリーがある場合True
        """
        return bool(self.summary and self.summary.strip())


class AIAnalyzer:
    """Analyzer using Claude API for financial insights.

    Claude APIを使用して家計データを分析し、
    支出パターン、異常検知、改善提案を提供する。
    """

    DEFAULT_MODEL = "claude-sonnet-4-20250514"

    # APIリトライ設定
    MAX_RETRIES = 3
    RETRY_DELAY_SECONDS = 2
    MAX_RETRY_DELAY_SECONDS = 30

    # 入力データの制限
    MAX_INPUT_LENGTH = 50000  # 約50KB

    SYSTEM_PROMPT = """あなたは個人の家計管理を支援する優秀なファイナンシャルアドバイザーです。
ユーザーのマネーフォワードMEから出力された家計簿データを分析し、以下の観点でアドバイスを提供してください：

1. **支出パターン分析**: カテゴリ別の支出傾向、前週との比較（データがあれば）
2. **異常検知**: 通常と異なる大きな支出、重複支出の可能性など
3. **改善提案**: 節約できそうなポイント、予算管理のアドバイス
4. **ポジティブな点**: 良い傾向や達成できていること

回答は簡潔で実用的なものにしてください。日本語で回答してください。
金額は必ず「¥」記号と桁区切りカンマを使用してください（例：¥12,345）。"""

    def __init__(
        self,
        api_key: str,
        model: Optional[str] = None,
        max_retries: int = MAX_RETRIES,
    ):
        """Initialize analyzer with API key.

        Args:
            api_key: Anthropic API key
            model: Model to use (defaults to claude-sonnet-4-20250514)
            max_retries: Maximum number of API retry attempts

        Raises:
            AIAnalysisError: If API key is invalid or empty
        """
        # APIキーのバリデーション
        if not api_key or not api_key.strip():
            raise AIAnalysisError("API key cannot be empty")

        if not api_key.startswith("sk-ant-"):
            logger.warning("API key does not start with expected prefix 'sk-ant-'")

        try:
            self.client = anthropic.Anthropic(api_key=api_key.strip())
        except Exception as e:
            raise AIAnalysisError(f"Failed to initialize Anthropic client: {e}") from e

        self.model = model or self.DEFAULT_MODEL
        self.max_retries = max_retries

    def analyze(
        self,
        data_text: str,
        additional_context: Optional[str] = None,
    ) -> AnalysisResult:
        """Analyze financial data and return insights.

        Args:
            data_text: Formatted financial data text
            additional_context: Optional additional context or questions

        Returns:
            AnalysisResult with analysis details

        Raises:
            AIAnalysisError: If analysis fails after all retries
        """
        # 入力バリデーション
        if not data_text or not data_text.strip():
            raise AIAnalysisError("Data text cannot be empty")

        # 入力サイズチェック
        if len(data_text) > self.MAX_INPUT_LENGTH:
            logger.warning(
                f"Input data truncated from {len(data_text)} to {self.MAX_INPUT_LENGTH} chars"
            )
            data_text = data_text[:self.MAX_INPUT_LENGTH] + "\n\n[データが長すぎるため省略されました]"

        # プロンプト構築
        user_prompt = self._build_analysis_prompt(data_text, additional_context)

        # API呼び出し（リトライ付き）
        message = self._call_api_with_retry(
            system=self.SYSTEM_PROMPT,
            user_content=user_prompt,
            max_tokens=2000,
        )

        # レスポンスの検証と解析
        return self._parse_response(message)

    def _build_analysis_prompt(
        self,
        data_text: str,
        additional_context: Optional[str],
    ) -> str:
        """分析用プロンプトを構築

        Args:
            data_text: 家計データテキスト
            additional_context: 追加コンテキスト

        Returns:
            構築されたプロンプト
        """
        prompt_parts = [
            "以下の家計簿データを分析してください。",
            "",
            data_text,
            "",
        ]

        if additional_context:
            prompt_parts.extend([
                "追加のコンテキスト:",
                additional_context,
                "",
            ])

        prompt_parts.extend([
            "以下の形式で分析結果を提供してください：",
            "",
            "## 今週のサマリー",
            "（2-3文で今週の収支状況を要約）",
            "",
            "## 支出分析",
            "（カテゴリ別の傾向、注目すべき支出）",
            "",
            "## 気になる点",
            "（異常な支出、確認すべき取引）",
            "",
            "## 改善のヒント",
            "（具体的で実行可能なアドバイス2-3点）",
            "",
            "## 良かった点",
            "（ポジティブなフィードバック）",
        ])

        return "\n".join(prompt_parts)

    def _call_api_with_retry(
        self,
        system: str,
        user_content: str,
        max_tokens: int,
    ) -> anthropic.types.Message:
        """リトライ機能付きでAPIを呼び出す

        Args:
            system: システムプロンプト
            user_content: ユーザーメッセージ
            max_tokens: 最大トークン数

        Returns:
            APIレスポンス

        Raises:
            AIAnalysisError: すべてのリトライが失敗した場合
        """
        last_error = None
        delay = self.RETRY_DELAY_SECONDS

        for attempt in range(self.max_retries):
            try:
                logger.debug(f"API call attempt {attempt + 1}/{self.max_retries}")

                message = self.client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    system=system,
                    messages=[{"role": "user", "content": user_content}],
                )

                logger.info(
                    f"API call successful. Model: {self.model}, "
                    f"Input tokens: {message.usage.input_tokens}, "
                    f"Output tokens: {message.usage.output_tokens}"
                )

                return message

            except RateLimitError as e:
                # レート制限エラー - より長く待機
                last_error = e
                wait_time = min(delay * 2, self.MAX_RETRY_DELAY_SECONDS)
                logger.warning(
                    f"Rate limit hit, waiting {wait_time}s before retry "
                    f"(attempt {attempt + 1}/{self.max_retries})"
                )
                time.sleep(wait_time)
                delay = wait_time

            except APIConnectionError as e:
                # 接続エラー - リトライ
                last_error = e
                logger.warning(
                    f"API connection error: {e}. "
                    f"Retrying in {delay}s (attempt {attempt + 1}/{self.max_retries})"
                )
                time.sleep(delay)
                delay = min(delay * 2, self.MAX_RETRY_DELAY_SECONDS)

            except APIStatusError as e:
                # ステータスエラー（4xx, 5xx）
                last_error = e
                if e.status_code >= 500:
                    # サーバーエラー - リトライ
                    logger.warning(
                        f"API server error ({e.status_code}): {e.message}. "
                        f"Retrying in {delay}s"
                    )
                    time.sleep(delay)
                    delay = min(delay * 2, self.MAX_RETRY_DELAY_SECONDS)
                else:
                    # クライアントエラー（400番台）- リトライしない
                    raise AIAnalysisError(
                        f"API client error ({e.status_code}): {e.message}"
                    ) from e

            except APIError as e:
                # その他のAPIエラー
                last_error = e
                logger.error(f"API error: {e}")
                raise AIAnalysisError(f"API error: {e}") from e

            except Exception as e:
                # 予期しないエラー
                last_error = e
                logger.error(f"Unexpected error calling API: {e}")
                raise AIAnalysisError(f"Unexpected error: {e}") from e

        # すべてのリトライが失敗
        raise AIAnalysisError(
            f"API call failed after {self.max_retries} attempts. "
            f"Last error: {last_error}"
        )

    def _parse_response(self, message: anthropic.types.Message) -> AnalysisResult:
        """APIレスポンスを解析してAnalysisResultを生成

        Args:
            message: APIレスポンス

        Returns:
            AnalysisResult

        Raises:
            AIAnalysisError: レスポンスの解析に失敗した場合
        """
        # レスポンスの検証
        if not message.content:
            raise AIAnalysisError("API returned empty response")

        # テキストコンテンツを取得
        text_content = None
        for block in message.content:
            if hasattr(block, "text"):
                text_content = block.text
                break

        if not text_content:
            raise AIAnalysisError("API response contains no text content")

        full_report = text_content

        # セクションを解析
        sections = self._parse_sections(full_report)

        # 結果を構築
        result = AnalysisResult(
            summary=sections.get("今週のサマリー", ""),
            spending_insights=sections.get("支出分析", ""),
            anomalies=sections.get("気になる点", ""),
            recommendations=sections.get("改善のヒント", ""),
            full_report=full_report,
            model_used=self.model,
            tokens_used=message.usage.input_tokens + message.usage.output_tokens,
        )

        # 結果の検証
        if not result.is_valid():
            logger.warning("Analysis result appears incomplete - summary is empty")

        return result

    def _parse_sections(self, text: str) -> dict[str, str]:
        """マークダウンセクションを解析

        Args:
            text: マークダウン形式のテキスト

        Returns:
            セクション名をキー、内容を値とする辞書
        """
        if not text:
            return {}

        sections: dict[str, str] = {}
        current_section: Optional[str] = None
        current_content: list[str] = []

        for line in text.split("\n"):
            # ##で始まるセクションヘッダーを検出
            if line.startswith("## "):
                # 前のセクションを保存
                if current_section:
                    sections[current_section] = "\n".join(current_content).strip()
                # 新しいセクションを開始
                current_section = line[3:].strip()
                current_content = []
            elif current_section:
                current_content.append(line)

        # 最後のセクションを保存
        if current_section:
            sections[current_section] = "\n".join(current_content).strip()

        return sections

    def generate_line_message(self, result: AnalysisResult) -> str:
        """LINE通知用の簡潔なメッセージを生成

        Args:
            result: analyze()から返されたAnalysisResult

        Returns:
            LINE向けにフォーマットされたメッセージ

        Raises:
            AIAnalysisError: resultがNoneの場合
        """
        if result is None:
            raise AIAnalysisError("Cannot generate message from None result")

        lines = [
            "📊 今週の家計レポート",
            "",
            "【サマリー】",
        ]

        # サマリー（最大200文字）
        if result.summary:
            summary = result.summary[:200]
            if len(result.summary) > 200:
                summary += "..."
            lines.append(summary)
        else:
            lines.append("分析結果なし")

        lines.append("")

        # 気になる点（存在する場合、最大150文字）
        if result.anomalies and result.anomalies.strip():
            anomalies = result.anomalies[:150]
            if len(result.anomalies) > 150:
                anomalies += "..."
            lines.extend([
                "⚠️ 気になる点",
                anomalies,
                "",
            ])

        # 改善のヒント（最大200文字）
        if result.recommendations:
            recommendations = result.recommendations[:200]
            if len(result.recommendations) > 200:
                recommendations += "..."
            lines.extend([
                "💡 改善のヒント",
                recommendations,
            ])

        return "\n".join(lines)

    def quick_summary(self, data_text: str) -> str:
        """簡易サマリーを生成（2-3文）

        Args:
            data_text: 家計データテキスト

        Returns:
            簡潔なサマリー文字列

        Raises:
            AIAnalysisError: 生成に失敗した場合
        """
        # 入力バリデーション
        if not data_text or not data_text.strip():
            raise AIAnalysisError("Data text cannot be empty")

        # 入力サイズ制限
        if len(data_text) > self.MAX_INPUT_LENGTH:
            data_text = data_text[:self.MAX_INPUT_LENGTH]

        try:
            message = self._call_api_with_retry(
                system="あなたは家計アドバイザーです。データを見て、2-3文で今週の状況を簡潔にまとめてください。日本語で回答してください。",
                user_content=f"この家計データを2-3文で要約してください:\n\n{data_text}",
                max_tokens=300,
            )

            # レスポンスからテキストを取得
            for block in message.content:
                if hasattr(block, "text"):
                    return block.text

            return "サマリーを生成できませんでした。"

        except AIAnalysisError:
            raise
        except Exception as e:
            raise AIAnalysisError(f"Failed to generate quick summary: {e}") from e

    def test_connection(self) -> bool:
        """API接続をテスト

        Returns:
            接続成功の場合True
        """
        try:
            # 最小限のリクエストで接続テスト
            message = self.client.messages.create(
                model=self.model,
                max_tokens=10,
                messages=[{"role": "user", "content": "Hello"}],
            )
            logger.info(f"API connection test successful. Model: {self.model}")
            return True

        except Exception as e:
            logger.error(f"API connection test failed: {e}")
            return False
