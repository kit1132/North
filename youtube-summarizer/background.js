// Background Service Worker for YouTube Summarizer
// Handles Claude API communication

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;

// Summary prompt template
const SUMMARY_PROMPT = `あなたはYouTube動画の要約アシスタントです。
以下のトランスクリプトを日本語で要約してください。

## 出力フォーマット（必ずこの形式で）

### 結論（200文字以内）
[動画の核心を簡潔に]

### タイムライン要約
| 時間 | トピック | 要点 |
|------|----------|------|
| 0:00 | [トピック名] | [1-2文で要点] |
| X:XX | [トピック名] | [1-2文で要点] |
（主要なセクションごとに記載）

### 重要ポイント（3-5個）
- [具体的なポイント1]
- [具体的なポイント2]
- [具体的なポイント3]

### 実践アクション
この動画から得られる具体的な行動ステップ：
1. [すぐできること]
2. [次のステップ]

### 関連する問い
この内容を深めるための問いかけ：
- [考えるべき問い]

---

## ルール
- 英語の動画でも必ず日本語で要約
- 抽象的な表現を避け、具体的に書く
- 長すぎる説明は避け、要点を明確に
- 表はマークダウン形式で出力

## トランスクリプト：
`;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    handleSummarize(request.transcript, request.apiKey)
      .then(summary => {
        sendResponse({ success: true, summary });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Required for async response
  }
});

// Handle summarization request
async function handleSummarize(transcript, apiKey) {
  if (!transcript) {
    throw new Error('トランスクリプトがありません');
  }

  if (!apiKey) {
    throw new Error('APIキーが設定されていません');
  }

  // Prepare the full prompt
  const fullPrompt = SUMMARY_PROMPT + transcript;

  // Call Claude API
  const response = await callClaudeAPI(fullPrompt, apiKey);

  return response;
}

// Call Claude API
async function callClaudeAPI(prompt, apiKey) {
  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 401) {
        throw new Error('APIキーが無効です');
      } else if (response.status === 429) {
        throw new Error('API制限に達しました。しばらく待ってから再試行してください');
      } else if (response.status === 400) {
        throw new Error(errorData.error?.message || 'リクエストエラーが発生しました');
      } else if (response.status === 500 || response.status === 503) {
        throw new Error('APIサーバーエラーが発生しました。しばらく待ってから再試行してください');
      } else {
        throw new Error(`APIエラー (${response.status}): ${errorData.error?.message || '不明なエラー'}`);
      }
    }

    const data = await response.json();

    // Extract text from response
    if (data.content && data.content.length > 0) {
      const textContent = data.content.find(c => c.type === 'text');
      if (textContent) {
        return textContent.text;
      }
    }

    throw new Error('APIからの応答が不正です');

  } catch (error) {
    // Handle network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('ネットワークエラー: APIに接続できません');
    }

    throw error;
  }
}
