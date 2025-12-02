// Background Service Worker for YouTube Summarizer
// Handles multiple AI API communication and side panel

const MAX_TOKENS = 4096;

// Cache for summaries (videoId -> summary)
const summaryCache = new Map();
const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes

// AI Web URLs for each provider
const AI_WEB_URLS = {
  claude: 'https://claude.ai/new',
  openai: 'https://chat.openai.com/',
  gemini: 'https://gemini.google.com/'
};

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

// Summary prompt templates for each language
const SUMMARY_PROMPTS = {
  en: `You are a YouTube video summary assistant.
Please summarize the following transcript.

## Output Format (use this format exactly)

### Conclusion (300-500 characters)
[Explain the core message in detail. Include what viewers can learn and why it matters]

### Timeline Summary
| Time | Topic | Key Points |
|------|-------|------------|
| 0:00 | [Topic name] | [1-2 sentence summary] |
| X:XX | [Topic name] | [1-2 sentence summary] |
(Include major sections)

### Key Points (3-5)
- [Specific point 1]
- [Specific point 2]
- [Specific point 3]

### Action Items
Concrete action steps from this video:
1. [Immediate action]
2. [Next step]

### Related Questions
Questions to explore this topic further:
- [Question to consider 1]
- [Question to consider 2]

---

## Rules
- Avoid abstract expressions, be specific
- Keep explanations concise, make key points clear
- Output tables in markdown format
- Conclusion must be 300-500 characters with detail

## Transcript:
`,

  ja: `あなたはYouTube動画の要約アシスタントです。
以下の字幕内容を要約してください。

## 出力形式（この形式に従ってください）

### 結論（300-500文字）
[核心的なメッセージを詳しく説明。視聴者が学べることと重要性を含める]

### タイムライン要約
| 時間 | トピック | 要点 |
|------|----------|------|
| 0:00 | [トピック名] | [1-2文の要約] |
| X:XX | [トピック名] | [1-2文の要約] |
（主要なセクションを含める）

### 重要ポイント（3-5個）
- [具体的なポイント1]
- [具体的なポイント2]
- [具体的なポイント3]

### アクションアイテム
この動画からの具体的なアクション：
1. [すぐにできること]
2. [次のステップ]

### 関連する質問
このトピックをさらに探るための質問：
- [考えるべき質問1]
- [考えるべき質問2]

---

## ルール
- 抽象的な表現を避け、具体的に書く
- 説明は簡潔に、要点を明確に
- テーブルはマークダウン形式で出力
- 結論は300-500文字で詳細に

## 字幕内容：
`
};

// Get system language
function getSystemLanguage() {
  // In service worker, we can't access navigator.language directly
  // Default to English if system can't be detected
  return 'en';
}

// Resolve language setting
function resolveLanguage(setting) {
  if (setting === 'system') {
    return getSystemLanguage();
  }
  return setting || 'en';
}

// Get summary prompt for language
function getSummaryPrompt(lang) {
  return SUMMARY_PROMPTS[lang] || SUMMARY_PROMPTS.en;
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    handleSummarize(request.transcript, request.videoId, request.language)
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

  if (request.action === 'getAIWebUrl') {
    chrome.storage.sync.get(['apiProvider'], (result) => {
      const provider = result.apiProvider || 'claude';
      sendResponse({ url: AI_WEB_URLS[provider], provider });
    });
    return true;
  }

  if (request.action === 'getCachedSummary') {
    const cached = summaryCache.get(request.videoId);
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
      sendResponse({ success: true, summary: cached.summary });
    } else {
      sendResponse({ success: false });
    }
    return true;
  }
});

// Handle summarization request
async function handleSummarize(transcript, videoId, language) {
  if (!transcript) {
    throw new Error('No transcript available');
  }

  // Check cache first
  if (videoId) {
    const cached = summaryCache.get(videoId);
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
      console.log('[YouTube Summary] Retrieved from cache');
      return cached.summary;
    }
  }

  // Get settings from storage
  const settings = await chrome.storage.sync.get(['apiProvider', 'apiKey', 'language']);
  const provider = settings.apiProvider || 'claude';
  const apiKey = settings.apiKey;

  // Determine language for prompt
  let lang = language;
  if (!lang) {
    lang = resolveLanguage(settings.language || 'system');
  }

  if (!apiKey) {
    throw new Error('API key not set');
  }

  // Truncate transcript if too long to save API costs
  const maxTranscriptLength = 50000;
  let truncatedTranscript = transcript;
  if (transcript.length > maxTranscriptLength) {
    const truncationNote = lang === 'ja'
      ? '\n\n[注: 長さの制限のため字幕を切り詰めました]'
      : '\n\n[Note: Transcript truncated due to length]';
    truncatedTranscript = transcript.substring(0, maxTranscriptLength) + truncationNote;
  }

  const summaryPrompt = getSummaryPrompt(lang);
  const fullPrompt = summaryPrompt + truncatedTranscript;

  // Call appropriate API
  let summary;
  switch (provider) {
    case 'claude':
      summary = await callClaudeAPI(fullPrompt, apiKey);
      break;
    case 'openai':
      summary = await callOpenAIAPI(fullPrompt, apiKey);
      break;
    case 'gemini':
      summary = await callGeminiAPI(fullPrompt, apiKey);
      break;
    default:
      throw new Error('Unknown API provider');
  }

  // Cache the result
  if (videoId) {
    summaryCache.set(videoId, {
      summary,
      timestamp: Date.now()
    });
  }

  return summary;
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
        return { success: false, error: 'Unknown API provider' };
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
  throw new Error('Invalid API response');
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
    return { success: false, error: 'API key is invalid' };
  }

  const errorData = await response.json().catch(() => ({}));
  return { success: false, error: errorData.error?.message || `Error: ${response.status}` };
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
  throw new Error('Invalid API response');
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
    return { success: false, error: 'API key is invalid' };
  }

  const errorData = await response.json().catch(() => ({}));
  return { success: false, error: errorData.error?.message || `Error: ${response.status}` };
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
  throw new Error('Invalid API response');
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
    return { success: false, error: 'API key is invalid' };
  }

  const errorData = await response.json().catch(() => ({}));
  return { success: false, error: errorData.error?.message || `Error: ${response.status}` };
}

// ===== Error Handling =====
async function handleAPIError(response, provider) {
  const errorData = await response.json().catch(() => ({}));

  if (response.status === 401) {
    return new Error('API key is invalid');
  } else if (response.status === 429) {
    return new Error('API rate limit reached. Please wait and try again');
  } else if (response.status === 400) {
    return new Error(errorData.error?.message || 'Request error occurred');
  } else if (response.status === 500 || response.status === 503) {
    return new Error(`${provider} server error occurred`);
  }

  return new Error(`${provider} error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
}
