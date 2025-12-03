// ============================================================================
// background.js - バックグラウンドサービスワーカー
// ============================================================================
//
// 【このファイルの役割】
// Chrome拡張機能の「裏方」として常時動作するService Workerです。
// サイドパネルや設定画面からの要求を受け取り、AI APIとの通信を行います。
//
// 【なぜService Workerが必要か】
// Chrome拡張機能では、APIへの通信やクロスオリジンリクエストを
// サイドパネルから直接行うことに制限があります。
// Service Worker経由で通信することでこれを解決します。
//
// 【主な機能】
// 1. AI API（Claude/OpenAI/Gemini）への要約リクエスト
// 2. APIキーの検証
// 3. サイドパネルの制御（開く/閉じる）
// 4. 要約結果のキャッシュ
//
// 【Chrome拡張機能のアーキテクチャ】
// ┌─────────────────┐     メッセージ     ┌──────────────┐
// │ sidepanel.html  │ ←──────────────→ │ background.js │
// │ options.html    │  (sendMessage)   │ (Service Worker)
// └─────────────────┘                   └──────────────┘
//                                              ↓ fetch()
//                                        AI API (外部)
// ============================================================================

// 最大トークン数（AI APIの応答の長さを制限）
const MAX_TOKENS = 4096;

// ----------------------------------------------------------------------------
// キャッシュ設定
// ----------------------------------------------------------------------------
// 同じ動画の要約を何度もAPIに問い合わせないよう、結果をキャッシュします。
// Map<videoId, {summary, timestamp}> の形式で保存します。
// ----------------------------------------------------------------------------
const summaryCache = new Map();
const CACHE_EXPIRY = 30 * 60 * 1000; // 30分間キャッシュを保持

// ----------------------------------------------------------------------------
// AI Web URL設定
// ----------------------------------------------------------------------------
// 「AIで探る」機能で開くWebインターフェースのURLです。
// ----------------------------------------------------------------------------
const AI_WEB_URLS = {
  claude: 'https://claude.ai/new',
  openai: 'https://chat.openai.com/',
  gemini: 'https://gemini.google.com/'
};

// ============================================================================
// サイドパネル制御
// ============================================================================

// ----------------------------------------------------------------------------
// 拡張機能アイコンクリック時の処理
// ----------------------------------------------------------------------------
// ツールバーのアイコンがクリックされたらサイドパネルを開きます。
// まずサイドパネルを有効化してから開きます。
// ----------------------------------------------------------------------------
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // サイドパネルを有効化
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'sidepanel.html',
      enabled: true
    });
    // サイドパネルを開く
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error('Failed to open side panel:', error);
  }
});

// ----------------------------------------------------------------------------
// タブ更新時のサイドパネル有効化
// ----------------------------------------------------------------------------
// YouTubeのページでサイドパネルを有効にします。
// chrome.tabs.onUpdated はページ読み込み完了時などに発火します。
// ----------------------------------------------------------------------------
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

// ============================================================================
// API設定
// ============================================================================

// ----------------------------------------------------------------------------
// API_CONFIGS - 各AIプロバイダーのAPI設定
// ----------------------------------------------------------------------------
// 各AIサービスのエンドポイントURLとデフォルトモデル名を定義します。
//
// 【各プロバイダーの特徴】
// - Claude: Anthropic社のAI。高品質な要約が得意
// - OpenAI: ChatGPTのAPI。高速で安定
// - Gemini: Google社のAI。長いテキストの処理が得意
// ----------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
// SUMMARY_PROMPTS - AI要約用プロンプトテンプレート
// ----------------------------------------------------------------------------
// AIに送信する指示文（プロンプト）を言語別に定義します。
// このプロンプトが要約の品質と形式を決定します。
//
// 【プロンプトエンジニアリングのポイント】
// - 明確な出力形式を指定（見出し、表、箇条書きなど）
// - 具体的な指示（300-500文字、3-5個のポイントなど）
// - ルールを最後に明記して遵守させる
// ----------------------------------------------------------------------------
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

// ============================================================================
// ヘルパー関数
// ============================================================================

// ----------------------------------------------------------------------------
// getSystemLanguage - システム言語を取得
// ----------------------------------------------------------------------------
// Service Worker では navigator.language にアクセスできないため、
// デフォルトで 'en' を返します。
// 実際の言語設定は chrome.storage から取得します。
// ----------------------------------------------------------------------------
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
// 言語に対応した要約プロンプトを取得
function getSummaryPrompt(lang) {
  return SUMMARY_PROMPTS[lang] || SUMMARY_PROMPTS.en;
}

// ============================================================================
// メッセージリスナー
// ============================================================================
// サイドパネルや設定画面からのリクエストを受け取って処理します。
//
// 【メッセージの仕組み】
// chrome.runtime.sendMessage() → chrome.runtime.onMessage.addListener()
//
// 【対応するアクション】
// - 'summarize': 字幕テキストをAIで要約
// - 'verifyApiKey': APIキーの有効性を確認
// - 'getAIWebUrl': AI WebインターフェースのURLを取得
// - 'getCachedSummary': キャッシュされた要約を取得
//
// 【非同期処理について】
// return true; は「応答を非同期で送信する」ことを示します。
// これがないと、async処理の結果を返せません。
// ============================================================================
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

  // ----------------------------------------------------------------------------
  // 無料版モード用アクション
  // ----------------------------------------------------------------------------
  // 無料版の場合、AIのWebインターフェースを開きます。
  // 字幕は呼び出し元でクリップボードにコピーされています。
  // ----------------------------------------------------------------------------
  if (request.action === 'openFreeModeWeb') {
    chrome.storage.sync.get(['apiProvider'], async (result) => {
      const provider = result.apiProvider || 'claude';
      const url = AI_WEB_URLS[provider];
      try {
        await chrome.tabs.create({ url: url });
        sendResponse({ success: true, url: url, provider: provider });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    });
    return true;
  }

  // バージョンモードを取得するアクション
  if (request.action === 'getVersionMode') {
    chrome.storage.sync.get(['versionMode', 'apiProvider'], (result) => {
      sendResponse({
        versionMode: result.versionMode || 'free',
        apiProvider: result.apiProvider || 'claude'
      });
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
    return true;  // 非同期で応答することを示す
  }
});

// ============================================================================
// 要約処理
// ============================================================================

// ----------------------------------------------------------------------------
// handleSummarize - 要約リクエストを処理
// ----------------------------------------------------------------------------
// 字幕テキストをAI APIに送信して要約を取得します。
//
// 引数:
//   transcript - 字幕テキスト（タイムスタンプ付き）
//   videoId    - 動画ID（キャッシュのキーとして使用）
//   language   - 出力言語（'en' または 'ja'）
//
// 【処理の流れ】
// 1. キャッシュを確認（30分以内なら再利用）
// 2. 設定を読み込み（APIプロバイダー、APIキー、言語）
// 3. 長すぎる字幕を切り詰め（APIコスト削減）
// 4. 選択されたプロバイダーのAPIを呼び出し
// 5. 結果をキャッシュして返す
// ----------------------------------------------------------------------------
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

// ============================================================================
// APIキー検証
// ============================================================================

// ----------------------------------------------------------------------------
// verifyApiKey - APIキーの有効性を検証
// ----------------------------------------------------------------------------
// 各プロバイダーのAPIにテストリクエストを送信して、
// キーが有効かどうかを確認します。
// ----------------------------------------------------------------------------
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

// ============================================================================
// Claude API（Anthropic）
// ============================================================================
// Claude API の呼び出し処理です。
// API ドキュメント: https://docs.anthropic.com/claude/reference/
// ============================================================================

// ----------------------------------------------------------------------------
// callClaudeAPI - Claude APIで要約を取得
// ----------------------------------------------------------------------------
// 【リクエスト形式】
// - ヘッダー: x-api-key（APIキー）、anthropic-version（APIバージョン）
// - ボディ: model, max_tokens, messages 配列
//
// 【注意】
// anthropic-dangerous-direct-browser-access ヘッダーは、
// ブラウザから直接APIを呼び出すために必要です。
// 本番環境ではサーバー経由での呼び出しが推奨されています。
// ----------------------------------------------------------------------------
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

// ============================================================================
// OpenAI API（ChatGPT）
// ============================================================================
// OpenAI API の呼び出し処理です。
// API ドキュメント: https://platform.openai.com/docs/api-reference
// ============================================================================

// ----------------------------------------------------------------------------
// callOpenAIAPI - OpenAI APIで要約を取得
// ----------------------------------------------------------------------------
// 【リクエスト形式】
// - ヘッダー: Authorization: Bearer {apiKey}
// - ボディ: model, max_tokens, messages 配列（Claude と似た形式）
// ----------------------------------------------------------------------------
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

// ============================================================================
// Gemini API（Google）
// ============================================================================
// Google Gemini API の呼び出し処理です。
// API ドキュメント: https://ai.google.dev/docs
// ============================================================================

// ----------------------------------------------------------------------------
// callGeminiAPI - Gemini APIで要約を取得
// ----------------------------------------------------------------------------
// 【リクエスト形式】
// - URL に API キーを含める（?key=xxx）
// - ボディ: contents 配列（Claude/OpenAI とは異なる形式）
//
// 【特徴】
// Gemini は長いコンテキストウィンドウを持ち、
// 長い動画の字幕も処理しやすいです。
// ----------------------------------------------------------------------------
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

// ============================================================================
// エラーハンドリング
// ============================================================================

// ----------------------------------------------------------------------------
// handleAPIError - APIエラーを処理
// ----------------------------------------------------------------------------
// API呼び出しが失敗したときのエラーメッセージを生成します。
//
// 【HTTPステータスコードとエラー】
// - 401: 認証エラー（APIキーが無効）
// - 429: レート制限（短時間に多くのリクエスト）
// - 400: リクエストエラー（不正なパラメータ）
// - 500/503: サーバーエラー（一時的な問題）
// ----------------------------------------------------------------------------
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
