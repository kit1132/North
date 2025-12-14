"""
AI Analyzer for MoneyForward ME data using Claude API.

Uses Anthropic's Claude API to analyze spending patterns,
detect anomalies, and provide improvement suggestions.
"""

from dataclasses import dataclass
from typing import Optional
import anthropic


@dataclass
class AnalysisResult:
    """Result of AI analysis on financial data."""

    summary: str  # Brief overview
    spending_insights: str  # Spending pattern analysis
    anomalies: str  # Unusual transactions detected
    recommendations: str  # Improvement suggestions
    full_report: str  # Complete analysis text


class AIAnalyzer:
    """Analyzer using Claude API for financial insights."""

    DEFAULT_MODEL = "claude-sonnet-4-20250514"

    SYSTEM_PROMPT = """あなたは個人の家計管理を支援する優秀なファイナンシャルアドバイザーです。
ユーザーのマネーフォワードMEから出力された家計簿データを分析し、以下の観点でアドバイスを提供してください：

1. **支出パターン分析**: カテゴリ別の支出傾向、前週との比較（データがあれば）
2. **異常検知**: 通常と異なる大きな支出、重複支出の可能性など
3. **改善提案**: 節約できそうなポイント、予算管理のアドバイス
4. **ポジティブな点**: 良い傾向や達成できていること

回答は簡潔で実用的なものにしてください。日本語で回答してください。
金額は必ず「¥」記号と桁区切りカンマを使用してください（例：¥12,345）。"""

    def __init__(self, api_key: str, model: Optional[str] = None):
        """Initialize analyzer with API key.

        Args:
            api_key: Anthropic API key
            model: Model to use (defaults to claude-sonnet-4-20250514)
        """
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model or self.DEFAULT_MODEL

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
        """
        user_prompt = f"""以下の家計簿データを分析してください。

{data_text}

"""
        if additional_context:
            user_prompt += f"\n追加のコンテキスト:\n{additional_context}"

        user_prompt += """
以下の形式で分析結果を提供してください：

## 今週のサマリー
（2-3文で今週の収支状況を要約）

## 支出分析
（カテゴリ別の傾向、注目すべき支出）

## 気になる点
（異常な支出、確認すべき取引）

## 改善のヒント
（具体的で実行可能なアドバイス2-3点）

## 良かった点
（ポジティブなフィードバック）
"""

        message = self.client.messages.create(
            model=self.model,
            max_tokens=2000,
            system=self.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        full_report = message.content[0].text

        # Parse sections from the response
        sections = self._parse_sections(full_report)

        return AnalysisResult(
            summary=sections.get("今週のサマリー", ""),
            spending_insights=sections.get("支出分析", ""),
            anomalies=sections.get("気になる点", ""),
            recommendations=sections.get("改善のヒント", ""),
            full_report=full_report,
        )

    def _parse_sections(self, text: str) -> dict[str, str]:
        """Parse markdown sections from response text."""
        sections = {}
        current_section = None
        current_content = []

        for line in text.split("\n"):
            if line.startswith("## "):
                # Save previous section
                if current_section:
                    sections[current_section] = "\n".join(current_content).strip()
                # Start new section
                current_section = line[3:].strip()
                current_content = []
            elif current_section:
                current_content.append(line)

        # Save last section
        if current_section:
            sections[current_section] = "\n".join(current_content).strip()

        return sections

    def generate_line_message(self, result: AnalysisResult) -> str:
        """Generate a concise message suitable for LINE notification.

        Args:
            result: AnalysisResult from analyze()

        Returns:
            Formatted message string for LINE
        """
        lines = [
            "📊 今週の家計レポート",
            "",
            "【サマリー】",
            result.summary[:200] if result.summary else "分析結果なし",
            "",
        ]

        if result.anomalies and result.anomalies.strip():
            lines.extend([
                "⚠️ 気になる点",
                result.anomalies[:150],
                "",
            ])

        if result.recommendations:
            lines.extend([
                "💡 改善のヒント",
                result.recommendations[:200],
            ])

        return "\n".join(lines)

    def quick_summary(self, data_text: str) -> str:
        """Generate a quick one-paragraph summary.

        Args:
            data_text: Formatted financial data text

        Returns:
            Brief summary string
        """
        message = self.client.messages.create(
            model=self.model,
            max_tokens=300,
            system="あなたは家計アドバイザーです。データを見て、2-3文で今週の状況を簡潔にまとめてください。日本語で回答してください。",
            messages=[
                {
                    "role": "user",
                    "content": f"この家計データを2-3文で要約してください:\n\n{data_text}",
                }
            ],
        )

        return message.content[0].text
