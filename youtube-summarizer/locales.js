// Localization for YouTube Summarizer
// Supports English and Japanese with system language detection

const LOCALES = {
  en: {
    // General
    extensionName: 'YouTube Summary',
    settings: 'Settings',

    // Tabs
    tabTranscript: 'Transcript',
    tabSummary: 'Summary',

    // Buttons
    btnLoad: 'Load',
    btnCopy: 'Copy',
    btnSummarize: 'Summarize',
    btnVerify: 'Verify',
    btnSaveClose: 'Save & Close',

    // Empty states
    emptyTranscript: 'Click "Load" to<br>get the transcript',
    emptySummary: 'Click "Summarize" to<br>generate AI summary',

    // Loading states
    loadingTranscript: 'Loading transcript...',
    loadingSummary: 'Generating summary...',

    // Messages
    notYoutube: 'Please open a YouTube video page',
    showTranscript: 'Show transcript',
    transcriptCopied: 'Transcript copied to clipboard',
    summaryCopied: 'Summary copied to clipboard',
    noTranscript: 'No transcript available',
    noSummary: 'No summary available',
    failedToCopy: 'Failed to copy',
    apiKeyNotSet: 'API key not set<br>Please configure in settings',
    tabNotFound: 'Tab not found',
    failedToGetTranscript: 'Failed to get transcript',
    failedToGenerateSummary: 'Failed to generate summary',
    noSubtitles: 'No subtitles available for this video. Please check if captions are enabled.',

    // AI Web Link
    aiWebLinkHint: 'Ask AI to explore this summary further',
    aiWebLinkBtn: 'Explore with AI',
    aiWebLinkDesc: 'Opens AI web interface and copies summary to clipboard.<br>Paste and add your questions.',
    summaryCopiedPaste: 'Summary copied. Paste in',
    couldNotGetUrl: 'Could not get AI URL',
    errorOccurred: 'An error occurred',

    // Options page
    optionsTitle: 'YouTube Summary - Settings',
    optionsSubtitle: 'Summarize videos using AI',
    labelLanguage: 'Language',
    labelThemeMode: 'Theme Mode',
    labelAiProvider: 'AI Provider',
    labelApiKey: 'API Key',

    // Language options
    langSystem: 'Follow System',
    langEnglish: 'English',
    langJapanese: '日本語',

    // Theme options
    themeSystem: 'Follow System',
    themeLight: 'Light Mode',
    themeDark: 'Dark Mode',

    // API providers
    providerClaude: 'Claude (Anthropic)',
    providerOpenai: 'ChatGPT (OpenAI)',
    providerGemini: 'Gemini (Google)',

    // API hints
    apiKeyPlaceholder: 'Enter API key...',
    getApiKeyFrom: 'Get your API key from',

    // API provider hints
    claudeHint: 'Anthropic Console',
    openaiHint: 'OpenAI Platform',
    geminiHint: 'Google AI Studio',

    // API provider info
    claudeInfo: '<strong>Claude:</strong> Best for high-quality summaries. Uses claude-sonnet-4-20250514.',
    openaiInfo: '<strong>OpenAI:</strong> Uses GPT-4o. Fast and reliable summaries.',
    geminiInfo: '<strong>Gemini:</strong> Uses Gemini 1.5 Pro. Handles long videos well.',

    // Validation
    pleaseEnterApiKey: 'Please enter an API key',
    pleaseEnterValidApiKey: 'Please enter a valid {provider} API key',
    verifyingApiKey: 'Verifying API key...',
    apiKeyValid: 'API key is valid',
    apiKeyInvalid: 'API key is invalid',
    verificationFailed: 'Verification failed',
    apiKeyInvalidCheck: 'API key is invalid. Please check.',
    settingsSaved: 'Settings saved',
    failedToSaveSettings: 'Failed to save settings',
    themeChanged: 'Theme changed',
    languageChanged: 'Language changed',

    // Errors
    errorInvalidApiKey: 'API key is invalid',
    errorRateLimit: 'API rate limit reached. Please wait and try again',
    errorRequest: 'Request error occurred',
    errorServer: 'server error occurred',
    errorUnknown: 'Unknown error',
    noTranscriptAvailable: 'No transcript available',
    invalidApiResponse: 'Invalid API response',
    unknownApiProvider: 'Unknown API provider',
    invalidSubtitleFormat: 'Invalid subtitle data format',
    subtitleDataEmpty: 'Subtitle data is empty',
    noSuitableSubtitle: 'No suitable subtitle track found',
    subtitleUrlNotFound: 'Subtitle URL not found',
    failedToFetchSubtitles: 'Failed to fetch subtitles',
    videoIdNotFound: 'Video ID not found',
    subtitleDataNotFound: 'Subtitle data not found'
  },

  ja: {
    // General
    extensionName: 'YouTube要約',
    settings: '設定',

    // Tabs
    tabTranscript: '字幕',
    tabSummary: '要約',

    // Buttons
    btnLoad: '読込',
    btnCopy: 'コピー',
    btnSummarize: '要約',
    btnVerify: '検証',
    btnSaveClose: '保存して閉じる',

    // Empty states
    emptyTranscript: '「読込」をクリックして<br>字幕を取得',
    emptySummary: '「要約」をクリックして<br>AI要約を生成',

    // Loading states
    loadingTranscript: '字幕を読み込み中...',
    loadingSummary: '要約を生成中...',

    // Messages
    notYoutube: 'YouTubeの動画ページを開いてください',
    showTranscript: '字幕を表示',
    transcriptCopied: '字幕をクリップボードにコピーしました',
    summaryCopied: '要約をクリップボードにコピーしました',
    noTranscript: '字幕がありません',
    noSummary: '要約がありません',
    failedToCopy: 'コピーに失敗しました',
    apiKeyNotSet: 'APIキーが設定されていません<br>設定画面で設定してください',
    tabNotFound: 'タブが見つかりません',
    failedToGetTranscript: '字幕の取得に失敗しました',
    failedToGenerateSummary: '要約の生成に失敗しました',
    noSubtitles: 'この動画には字幕がありません。字幕が有効になっているか確認してください。',

    // AI Web Link
    aiWebLinkHint: 'AIに要約についてさらに質問する',
    aiWebLinkBtn: 'AIで探る',
    aiWebLinkDesc: 'AI Webインターフェースを開き、要約をクリップボードにコピーします。<br>貼り付けて質問を追加してください。',
    summaryCopiedPaste: '要約をコピーしました。貼り付け先:',
    couldNotGetUrl: 'AI URLを取得できませんでした',
    errorOccurred: 'エラーが発生しました',

    // Options page
    optionsTitle: 'YouTube要約 - 設定',
    optionsSubtitle: 'AIを使って動画を要約',
    labelLanguage: '言語',
    labelThemeMode: 'テーマモード',
    labelAiProvider: 'AIプロバイダー',
    labelApiKey: 'APIキー',

    // Language options
    langSystem: 'システムに従う',
    langEnglish: 'English',
    langJapanese: '日本語',

    // Theme options
    themeSystem: 'システムに従う',
    themeLight: 'ライトモード',
    themeDark: 'ダークモード',

    // API providers
    providerClaude: 'Claude (Anthropic)',
    providerOpenai: 'ChatGPT (OpenAI)',
    providerGemini: 'Gemini (Google)',

    // API hints
    apiKeyPlaceholder: 'APIキーを入力...',
    getApiKeyFrom: 'APIキーの取得先:',

    // API provider hints
    claudeHint: 'Anthropic Console',
    openaiHint: 'OpenAI Platform',
    geminiHint: 'Google AI Studio',

    // API provider info
    claudeInfo: '<strong>Claude:</strong> 高品質な要約に最適。claude-sonnet-4-20250514を使用。',
    openaiInfo: '<strong>OpenAI:</strong> GPT-4oを使用。高速で信頼性の高い要約。',
    geminiInfo: '<strong>Gemini:</strong> Gemini 1.5 Proを使用。長い動画に強い。',

    // Validation
    pleaseEnterApiKey: 'APIキーを入力してください',
    pleaseEnterValidApiKey: '有効な{provider}のAPIキーを入力してください',
    verifyingApiKey: 'APIキーを検証中...',
    apiKeyValid: 'APIキーは有効です',
    apiKeyInvalid: 'APIキーが無効です',
    verificationFailed: '検証に失敗しました',
    apiKeyInvalidCheck: 'APIキーが無効です。確認してください。',
    settingsSaved: '設定を保存しました',
    failedToSaveSettings: '設定の保存に失敗しました',
    themeChanged: 'テーマを変更しました',
    languageChanged: '言語を変更しました',

    // Errors
    errorInvalidApiKey: 'APIキーが無効です',
    errorRateLimit: 'APIレート制限に達しました。しばらく待ってから再試行してください',
    errorRequest: 'リクエストエラーが発生しました',
    errorServer: 'サーバーエラーが発生しました',
    errorUnknown: '不明なエラー',
    noTranscriptAvailable: '字幕がありません',
    invalidApiResponse: '無効なAPIレスポンス',
    unknownApiProvider: '不明なAPIプロバイダー',
    invalidSubtitleFormat: '無効な字幕データ形式です',
    subtitleDataEmpty: '字幕データが空です',
    noSuitableSubtitle: '適切な字幕トラックが見つかりません',
    subtitleUrlNotFound: '字幕URLが見つかりません',
    failedToFetchSubtitles: '字幕の取得に失敗しました',
    videoIdNotFound: '動画IDが見つかりません',
    subtitleDataNotFound: '字幕データが見つかりません'
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

// Determine the current language
function getCurrentLanguage() {
  // This will be overwritten by storage value when loaded
  return 'en';
}

// Get system language
function getSystemLanguage() {
  const lang = navigator.language || navigator.userLanguage || 'en';
  // Check if Japanese
  if (lang.startsWith('ja')) {
    return 'ja';
  }
  return 'en';
}

// Resolve language setting (system/en/ja) to actual language code
function resolveLanguage(setting) {
  if (setting === 'system') {
    return getSystemLanguage();
  }
  return setting || 'en';
}

// Get translation for a key
function t(key, lang) {
  const locale = LOCALES[lang] || LOCALES.en;
  return locale[key] || LOCALES.en[key] || key;
}

// Get summary prompt for language
function getSummaryPrompt(lang) {
  return SUMMARY_PROMPTS[lang] || SUMMARY_PROMPTS.en;
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.LOCALES = LOCALES;
  window.SUMMARY_PROMPTS = SUMMARY_PROMPTS;
  window.getCurrentLanguage = getCurrentLanguage;
  window.getSystemLanguage = getSystemLanguage;
  window.resolveLanguage = resolveLanguage;
  window.t = t;
  window.getSummaryPrompt = getSummaryPrompt;
}
