// ============================================================================
// options.js - 設定画面の処理
// ============================================================================
//
// 【このファイルの役割】
// 拡張機能の設定画面（options.html）の動作を制御します。
// ユーザーが設定を変更・保存する際の処理を担当します。
//
// 【主な機能】
// 1. 言語設定の変更と即時反映
// 2. テーマモード（ライト/ダーク/システム）の変更
// 3. AIプロバイダー（Claude/OpenAI/Gemini）の選択
// 4. APIキーの入力・検証・保存
//
// 【Chrome Storage について】
// chrome.storage.sync - Chromeアカウントに紐づいた設定保存
//   - 複数のデバイス間で設定が同期される
//   - get(): 設定を読み込む
//   - set(): 設定を保存する
// ============================================================================

// ----------------------------------------------------------------------------
// DOM要素の取得
// ----------------------------------------------------------------------------
// document.getElementById() でHTMLの要素を取得し、
// JavaScriptから操作できるようにします。
// これらの変数は画面上のボタンや入力欄を指します。
// ----------------------------------------------------------------------------
const form = document.getElementById('options-form');           // 設定フォーム全体
const languageSelect = document.getElementById('language');     // 言語選択ドロップダウン
const themeModeSelect = document.getElementById('theme-mode');  // テーマ選択ドロップダウン
const apiProviderSelect = document.getElementById('api-provider'); // AIプロバイダー選択
const versionModeSelect = document.getElementById('version-mode'); // バージョン選択（無料/API）
const versionHint = document.getElementById('version-hint');    // バージョンのヒント
const apiKeyGroup = document.getElementById('api-key-group');   // APIキー入力グループ
const apiKeyInput = document.getElementById('api-key');         // APIキー入力欄
const toggleKeyBtn = document.getElementById('toggle-key');     // APIキー表示/非表示ボタン
const verifyBtn = document.getElementById('verify-btn');        // 検証ボタン
const saveBtn = document.getElementById('save-btn');            // 保存ボタン
const notification = document.getElementById('notification');   // 通知メッセージ表示エリア
const apiStatus = document.getElementById('api-status');        // API検証状態表示エリア
const apiHint = document.getElementById('api-hint');            // APIキー取得先のヒント
const apiLink = document.getElementById('api-link');            // APIキー取得先リンク
const apiInfo = document.getElementById('api-info');            // AIプロバイダーの説明

// ----------------------------------------------------------------------------
// 現在の言語
// ----------------------------------------------------------------------------
// この変数で現在選択されている言語を管理します。
// 初期値は 'en'（英語）で、ページ読み込み時に設定から読み込まれます。
// ----------------------------------------------------------------------------
let currentLang = 'en';

// ----------------------------------------------------------------------------
// API_CONFIGS - 各AIプロバイダーの設定情報
// ----------------------------------------------------------------------------
// 各AIサービスのAPIに関する基本情報を定義します。
//
// プロパティの説明:
//   name           - プロバイダー名（エラーメッセージ等で使用）
//   placeholder    - APIキー入力欄のプレースホルダー（入力例）
//   url            - APIキー取得ページのURL
//   validatePrefix - APIキーの形式チェック関数
//                   （正しいプレフィックスで始まるかを確認）
// ----------------------------------------------------------------------------
const API_CONFIGS = {
  // Claude (Anthropic) の設定
  claude: {
    name: 'Claude',
    placeholder: 'sk-ant-api03-...',  // Claudeのキーは'sk-ant-'で始まる
    url: 'https://console.anthropic.com/',
    validatePrefix: (key) => key.startsWith('sk-ant-')
  },
  // OpenAI (ChatGPT) の設定
  openai: {
    name: 'OpenAI',
    placeholder: 'sk-...',  // OpenAIのキーは'sk-'で始まる
    url: 'https://platform.openai.com/api-keys',
    validatePrefix: (key) => key.startsWith('sk-')
  },
  // Gemini (Google) の設定
  gemini: {
    name: 'Gemini',
    placeholder: 'AIza...',  // Geminiのキーは'AIza'で始まる
    url: 'https://aistudio.google.com/app/apikey',
    validatePrefix: (key) => key.startsWith('AIza')
  }
};

// ----------------------------------------------------------------------------
// getApiConfig - プロバイダーの設定を翻訳付きで取得
// ----------------------------------------------------------------------------
// API_CONFIGSの基本設定に翻訳テキストを追加して返します。
//
// 引数:
//   provider - プロバイダー名（'claude', 'openai', 'gemini'）
// 戻り値: 翻訳済みの設定オブジェクト
// ----------------------------------------------------------------------------
function getApiConfig(provider) {
  const base = API_CONFIGS[provider];
  return {
    ...base,
    hint: t(provider + 'Hint', currentLang),
    info: t(provider + 'Info', currentLang)
  };
}

// ============================================================================
// 初期化処理（ページ読み込み時）
// ============================================================================

// ----------------------------------------------------------------------------
// DOMContentLoaded イベントリスナー
// ----------------------------------------------------------------------------
// ページの読み込みが完了したときに実行される処理です。
// 保存されている設定を読み込み、画面に反映します。
//
// 【処理の流れ】
// 1. chrome.storage.sync から設定を読み込む
// 2. 言語設定を適用
// 3. 各選択肢に保存された値をセット
// 4. 画面のテキストを翻訳
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const result = await chrome.storage.sync.get(['apiProvider', 'apiKey', 'themeMode', 'language', 'versionMode']);

    // Load language setting first
    if (result.language) {
      languageSelect.value = result.language;
      currentLang = resolveLanguage(result.language);
    } else {
      currentLang = getSystemLanguage();
    }

    // Apply translations
    applyTranslations();

    if (result.themeMode) {
      themeModeSelect.value = result.themeMode;
    }
    if (result.apiProvider) {
      apiProviderSelect.value = result.apiProvider;
    }
    // Load version mode (default to 'free')
    if (result.versionMode) {
      versionModeSelect.value = result.versionMode;
    } else {
      versionModeSelect.value = 'free';
    }
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    updateProviderUI();
    updateVersionModeUI();
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
});

// ----------------------------------------------------------------------------
// applyTranslations - 画面のテキストを翻訳
// ----------------------------------------------------------------------------
// 画面上のすべてのテキスト要素を現在の言語に翻訳します。
// 言語が変更されたときに呼び出されます。
//
// 【翻訳対象】
// - タイトル、サブタイトル
// - 各ラベル
// - ドロップダウンの選択肢
// - ボタンテキスト
// - ヒントメッセージ
// ----------------------------------------------------------------------------
function applyTranslations() {
  // Title and subtitle
  document.getElementById('options-title').textContent = t('optionsTitle', currentLang);
  document.getElementById('options-subtitle').textContent = t('optionsSubtitle', currentLang);

  // Labels
  document.getElementById('label-language').textContent = t('labelLanguage', currentLang);
  document.getElementById('label-theme-mode').textContent = t('labelThemeMode', currentLang);
  document.getElementById('label-api-provider').textContent = t('labelAiProvider', currentLang);
  document.getElementById('label-api-key').textContent = t('labelApiKey', currentLang);

  // Language options (keep English/日本語 as-is for recognition)
  languageSelect.options[0].textContent = t('langSystem', currentLang);

  // Theme options
  document.getElementById('theme-system').textContent = t('themeSystem', currentLang);
  document.getElementById('theme-light').textContent = t('themeLight', currentLang);
  document.getElementById('theme-dark').textContent = t('themeDark', currentLang);

  // Provider options
  document.getElementById('provider-claude').textContent = t('providerClaude', currentLang);
  document.getElementById('provider-openai').textContent = t('providerOpenai', currentLang);
  document.getElementById('provider-gemini').textContent = t('providerGemini', currentLang);

  // Version mode label and options
  document.getElementById('label-version-mode').textContent = t('labelVersionMode', currentLang);
  document.getElementById('version-free').textContent = t('versionFree', currentLang);
  document.getElementById('version-api').textContent = t('versionApi', currentLang);

  // API key placeholder
  apiKeyInput.placeholder = t('apiKeyPlaceholder', currentLang);

  // Buttons
  document.getElementById('verify-btn-text').textContent = t('btnVerify', currentLang);
  document.getElementById('save-btn-text').textContent = t('btnSaveClose', currentLang);

  // Update provider UI with new translations
  updateProviderUI();
}

// ============================================================================
// イベントリスナー（ユーザー操作の処理）
// ============================================================================

// ----------------------------------------------------------------------------
// 言語変更イベント
// ----------------------------------------------------------------------------
// 言語が変更されたとき、即座に設定を保存し画面を更新します。
// 「ページをリロードせずに即時反映」がポイントです。
// ----------------------------------------------------------------------------
languageSelect.addEventListener('change', async () => {
  const language = languageSelect.value;
  try {
    await chrome.storage.sync.set({ language });
    currentLang = resolveLanguage(language);
    applyTranslations();
    showNotification(t('languageChanged', currentLang), 'success');
  } catch (error) {
    console.error('Failed to save language:', error);
  }
});

// ----------------------------------------------------------------------------
// テーマモード変更イベント
// ----------------------------------------------------------------------------
// ライト/ダーク/システムのテーマ設定を保存します。
// 実際の画面への適用は sidepanel.html 側の CSS で処理されます。
// ----------------------------------------------------------------------------
themeModeSelect.addEventListener('change', async () => {
  const themeMode = themeModeSelect.value;
  try {
    await chrome.storage.sync.set({ themeMode });
    showNotification(t('themeChanged', currentLang), 'success');
  } catch (error) {
    console.error('Failed to save theme:', error);
  }
});

// ----------------------------------------------------------------------------
// AIプロバイダー変更イベント
// ----------------------------------------------------------------------------
// プロバイダーが変更されたとき、UIを更新します（APIキーのヒント等）。
// ----------------------------------------------------------------------------
apiProviderSelect.addEventListener('change', async () => {
  updateProviderUI();  // プロバイダー情報を更新
  clearStatus();       // 検証状態をクリア
  // プロバイダー変更時にstorageも更新
  try {
    await chrome.storage.sync.set({ apiProvider: apiProviderSelect.value });
  } catch (error) {
    console.error('Failed to save provider:', error);
  }
});

// ----------------------------------------------------------------------------
// バージョンモード変更イベント
// ----------------------------------------------------------------------------
// 無料版/API版が変更されたとき、APIキー入力欄の表示/非表示を切り替えます。
// 無料版: APIキー不要、Webインターフェースを開く
// API版: APIキーが必要、直接API呼び出し
// ----------------------------------------------------------------------------
versionModeSelect.addEventListener('change', async () => {
  const versionMode = versionModeSelect.value;
  try {
    await chrome.storage.sync.set({ versionMode });
    updateVersionModeUI();
    showNotification(t('settingsSaved', currentLang), 'success');
  } catch (error) {
    console.error('Failed to save version mode:', error);
  }
});

// ----------------------------------------------------------------------------
// updateVersionModeUI - バージョンモードに応じたUI更新
// ----------------------------------------------------------------------------
// 無料版が選択された場合: APIキー入力欄、検証ボタンを非表示
// API版が選択された場合: APIキー入力欄、検証ボタンを表示
// ----------------------------------------------------------------------------
function updateVersionModeUI() {
  const isFreeMode = versionModeSelect.value === 'free';

  // APIキー関連の要素を表示/非表示
  apiKeyGroup.classList.toggle('hidden', isFreeMode);
  apiStatus.classList.toggle('hidden', isFreeMode);
  apiInfo.classList.toggle('hidden', isFreeMode);
  verifyBtn.classList.toggle('hidden', isFreeMode);

  // バージョンヒントを更新
  if (isFreeMode) {
    versionHint.innerHTML = t('versionFreeDesc', currentLang);
    versionHint.className = 'hint';
  } else {
    versionHint.innerHTML = t('versionApiDesc', currentLang);
    versionHint.className = 'hint';
  }
}

// ----------------------------------------------------------------------------
// updateProviderUI - プロバイダーに応じた情報表示を更新
// ----------------------------------------------------------------------------
// 選択されたプロバイダーに合わせて:
// - APIキー入力欄のプレースホルダー
// - APIキー取得先のリンク
// - プロバイダーの説明文
// を更新します。
// ----------------------------------------------------------------------------
function updateProviderUI() {
  const provider = apiProviderSelect.value;
  const baseConfig = API_CONFIGS[provider];
  const config = getApiConfig(provider);

  apiKeyInput.placeholder = baseConfig.placeholder;
  apiHint.innerHTML = `${t('getApiKeyFrom', currentLang)} <a href="${baseConfig.url}" target="_blank" id="api-link">${config.hint}</a>`;
  apiInfo.innerHTML = config.info;
}

// ----------------------------------------------------------------------------
// APIキー表示/非表示トグル
// ----------------------------------------------------------------------------
// 目のアイコンをクリックするとAPIキーの表示/非表示を切り替えます。
// セキュリティのため、デフォルトは非表示（password type）です。
// ----------------------------------------------------------------------------
toggleKeyBtn.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  toggleKeyBtn.innerHTML = isPassword
    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>`;
});

// ============================================================================
// 通知・ステータス表示関数
// ============================================================================

// ----------------------------------------------------------------------------
// showNotification - 画面上部に通知メッセージを表示
// ----------------------------------------------------------------------------
// 操作結果（成功/エラー）をユーザーに伝えます。
// 3秒後に自動的に消えます。
//
// 引数:
//   message - 表示するメッセージ
//   type    - 'success'（緑）または 'error'（赤）
// ----------------------------------------------------------------------------
function showNotification(message, type = 'success') {
  notification.textContent = message;
  notification.className = `notification ${type} show`;

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// ----------------------------------------------------------------------------
// showStatus - APIキー検証状態を表示
// ----------------------------------------------------------------------------
// APIキーの検証結果をアイコン付きで表示します。
//
// 引数:
//   message - 表示するメッセージ
//   type    - 'success'（チェックマーク）, 'error'（×マーク）,
//             'verifying'（スピナー）
// ----------------------------------------------------------------------------
function showStatus(message, type) {
  let icon = '';
  if (type === 'success') {
    icon = `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>`;
  } else if (type === 'error') {
    icon = `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>`;
  } else if (type === 'verifying') {
    icon = `<div class="spinner"></div>`;
  }

  apiStatus.innerHTML = `<div class="status ${type}">${icon}<span>${message}</span></div>`;
}

// ステータス表示をクリア
function clearStatus() {
  apiStatus.innerHTML = '';
}

// ============================================================================
// APIキー検証・保存処理
// ============================================================================

// ----------------------------------------------------------------------------
// 検証ボタンクリックイベント
// ----------------------------------------------------------------------------
// 「検証」ボタンがクリックされたとき、入力されたAPIキーを検証します。
// 実際のAPI呼び出しは background.js で行われます。
//
// 【検証の流れ】
// 1. 入力チェック（空欄、プレフィックス形式）
// 2. background.js に検証リクエストを送信
// 3. 結果を画面に表示
// ----------------------------------------------------------------------------
verifyBtn.addEventListener('click', async () => {
  const provider = apiProviderSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const config = API_CONFIGS[provider];

  if (!apiKey) {
    showStatus(t('pleaseEnterApiKey', currentLang), 'error');
    return;
  }

  if (!config.validatePrefix(apiKey)) {
    showStatus(t('pleaseEnterValidApiKey', currentLang).replace('{provider}', config.name), 'error');
    return;
  }

  verifyBtn.disabled = true;
  showStatus(t('verifyingApiKey', currentLang), 'verifying');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'verifyApiKey',
      provider: provider,
      apiKey: apiKey
    });

    if (response && response.success) {
      showStatus(t('apiKeyValid', currentLang), 'success');
    } else {
      showStatus(response?.error || t('apiKeyInvalid', currentLang), 'error');
    }
  } catch (error) {
    showStatus(t('verificationFailed', currentLang) + ': ' + error.message, 'error');
  } finally {
    verifyBtn.disabled = false;
  }
});

// ----------------------------------------------------------------------------
// フォーム送信イベント（保存処理）
// ----------------------------------------------------------------------------
// 「保存して閉じる」ボタンがクリックされたとき、設定を保存します。
//
// 【処理の流れ】
// 1. バージョンモードを確認
// 2. 無料版: プロバイダーのみ保存
// 3. API版: APIキーを検証して保存
// 4. 成功したら設定画面を閉じる
//
// 【セキュリティ】
// - API版では保存前に必ずAPIキーを検証
// - 無効なキーは保存しない
// ----------------------------------------------------------------------------
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const provider = apiProviderSelect.value;
  const versionMode = versionModeSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const config = API_CONFIGS[provider];

  saveBtn.disabled = true;

  try {
    // 無料版の場合はAPIキー検証なしで保存
    if (versionMode === 'free') {
      await chrome.storage.sync.set({
        apiProvider: provider,
        versionMode: versionMode
      });

      showNotification(t('settingsSaved', currentLang), 'success');

      // Close the options page after a short delay
      setTimeout(() => {
        window.close();
      }, 1500);
      return;
    }

    // API版の場合はAPIキーを検証
    if (!apiKey) {
      showNotification(t('pleaseEnterApiKey', currentLang), 'error');
      saveBtn.disabled = false;
      return;
    }

    if (!config.validatePrefix(apiKey)) {
      showNotification(t('pleaseEnterValidApiKey', currentLang).replace('{provider}', config.name), 'error');
      saveBtn.disabled = false;
      return;
    }

    // Verify before saving
    showStatus(t('verifyingApiKey', currentLang), 'verifying');

    const verifyResponse = await chrome.runtime.sendMessage({
      action: 'verifyApiKey',
      provider: provider,
      apiKey: apiKey
    });

    if (!verifyResponse || !verifyResponse.success) {
      showStatus(verifyResponse?.error || t('apiKeyInvalid', currentLang), 'error');
      showNotification(t('apiKeyInvalidCheck', currentLang), 'error');
      return;
    }

    // Save to storage
    await chrome.storage.sync.set({
      apiProvider: provider,
      versionMode: versionMode,
      apiKey: apiKey
    });

    showStatus(t('apiKeyValid', currentLang), 'success');
    showNotification(t('settingsSaved', currentLang), 'success');

    // Close the options page after a short delay
    setTimeout(() => {
      window.close();
    }, 1500);

  } catch (error) {
    console.error('Failed to save settings:', error);
    showNotification(t('failedToSaveSettings', currentLang), 'error');
  } finally {
    saveBtn.disabled = false;
  }
});
