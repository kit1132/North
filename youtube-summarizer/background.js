// Background Service Worker for YouTube Summarizer
// Handles multiple AI API communication and side panel

const MAX_TOKENS = 4096;

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Enable side panel for YouTube
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.includes('youtube.com')) {
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'sidepanel.html',
        enabled: true
      });
    } else {
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: true
      });
    }
  }
});

// API configurations
const API_CONFIGS = {
  claude: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-20250514'
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o'
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
    model: 'gemini-1.5-pro'
  }
};

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

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    handleSummarize(request.transcript)
      .then(summary => {
        sendResponse({ success: true, summary });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'verifyApiKey') {
    verifyApiKey(request.provider, request.apiKey)
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// Handle summarization request
async function handleSummarize(transcript) {
  if (!transcript) {
    throw new Error('トランスクリプトがありません');
  }

  // Get settings from storage
  const settings = await chrome.storage.sync.get(['apiProvider', 'apiKey']);
  const provider = settings.apiProvider || 'claude';
  const apiKey = settings.apiKey;

  if (!apiKey) {
    throw new Error('APIキーが設定されていません');
  }

  const fullPrompt = SUMMARY_PROMPT + transcript;

  // Call appropriate API
  switch (provider) {
    case 'claude':
      return await callClaudeAPI(fullPrompt, apiKey);
    case 'openai':
      return await callOpenAIAPI(fullPrompt, apiKey);
    case 'gemini':
      return await callGeminiAPI(fullPrompt, apiKey);
    default:
      throw new Error('不明なAPIプロバイダーです');
  }
}

// Verify API key
async function verifyApiKey(provider, apiKey) {
  try {
    switch (provider) {
      case 'claude':
        return await verifyClaudeKey(apiKey);
      case 'openai':
        return await verifyOpenAIKey(apiKey);
      case 'gemini':
        return await verifyGeminiKey(apiKey);
      default:
        return { success: false, error: '不明なAPIプロバイダーです' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ===== Claude API =====
async function callClaudeAPI(prompt, apiKey) {
  const response = await fetch(API_CONFIGS.claude.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: API_CONFIGS.claude.model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw await handleAPIError(response, 'Claude');
  }

  const data = await response.json();
  const textContent = data.content?.find(c => c.type === 'text');
  if (textContent) {
    return textContent.text;
  }
  throw new Error('APIからの応答が不正です');
}

async function verifyClaudeKey(apiKey) {
  const response = await fetch(API_CONFIGS.claude.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: API_CONFIGS.claude.model,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    })
  });

  if (response.ok) {
    return { success: true };
  }

  if (response.status === 401) {
    return { success: false, error: 'APIキーが無効です' };
  }

  const errorData = await response.json().catch(() => ({}));
  return { success: false, error: errorData.error?.message || `エラー: ${response.status}` };
}

// ===== OpenAI API =====
async function callOpenAIAPI(prompt, apiKey) {
  const response = await fetch(API_CONFIGS.openai.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: API_CONFIGS.openai.model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw await handleAPIError(response, 'OpenAI');
  }

  const data = await response.json();
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  throw new Error('APIからの応答が不正です');
}

async function verifyOpenAIKey(apiKey) {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });

  if (response.ok) {
    return { success: true };
  }

  if (response.status === 401) {
    return { success: false, error: 'APIキーが無効です' };
  }

  const errorData = await response.json().catch(() => ({}));
  return { success: false, error: errorData.error?.message || `エラー: ${response.status}` };
}

// ===== Gemini API =====
async function callGeminiAPI(prompt, apiKey) {
  const url = `${API_CONFIGS.gemini.url}?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        maxOutputTokens: MAX_TOKENS
      }
    })
  });

  if (!response.ok) {
    throw await handleAPIError(response, 'Gemini');
  }

  const data = await response.json();
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error('APIからの応答が不正です');
}

async function verifyGeminiKey(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'GET'
  });

  if (response.ok) {
    return { success: true };
  }

  if (response.status === 400 || response.status === 403) {
    return { success: false, error: 'APIキーが無効です' };
  }

  const errorData = await response.json().catch(() => ({}));
  return { success: false, error: errorData.error?.message || `エラー: ${response.status}` };
}

// ===== Error Handling =====
async function handleAPIError(response, provider) {
  const errorData = await response.json().catch(() => ({}));

  if (response.status === 401) {
    return new Error('APIキーが無効です');
  } else if (response.status === 429) {
    return new Error('API制限に達しました。しばらく待ってから再試行してください');
  } else if (response.status === 400) {
    return new Error(errorData.error?.message || 'リクエストエラーが発生しました');
  } else if (response.status === 500 || response.status === 503) {
    return new Error(`${provider}サーバーエラーが発生しました`);
  }

  return new Error(`${provider}エラー (${response.status}): ${errorData.error?.message || '不明なエラー'}`);
}
