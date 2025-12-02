// ============================================================================
// sidepanel-script.js - サイドパネルのメイン処理
// ============================================================================
//
// 【このファイルの役割】
// Chrome のサイドパネル（右側に表示される領域）の動作を制御します。
// YouTube動画の字幕取得、AI要約生成、クリップボードコピーなどを処理します。
//
// 【主な機能】
// 1. YouTubeページの検出と動画情報の取得
// 2. 字幕（トランスクリプト）の読み込み
// 3. AI APIを使った要約の生成
// 4. コピー機能、動画シーク機能
// 5. テーマ切り替え、言語切り替え
//
// 【Chrome拡張機能の通信】
// - chrome.tabs: タブの情報を取得・操作
// - chrome.scripting: ページ内でスクリプトを実行
// - chrome.runtime.sendMessage: バックグラウンドスクリプトと通信
// - chrome.storage: 設定の保存・読み込み
// ============================================================================

// ----------------------------------------------------------------------------
// グローバル変数（状態管理）
// ----------------------------------------------------------------------------
// これらの変数でサイドパネル全体の状態を管理します。
// 各関数からアクセスして読み書きします。
// ----------------------------------------------------------------------------
let transcriptData = [];   // 字幕データの配列 [{time, seconds, text}, ...]
let currentSummary = '';   // 現在の要約テキスト
let currentTabId = null;   // アクティブなタブのID
let currentLang = 'en';    // 現在の言語設定

// ============================================================================
// テーマ管理（Theme Management）
// ============================================================================
// ライトモード/ダークモード/システム設定に応じた表示を制御します。
// CSSの data-theme 属性を切り替えることで色を変更します。
// ============================================================================

// ----------------------------------------------------------------------------
// initTheme - テーマの初期化
// ----------------------------------------------------------------------------
// ページ読み込み時に保存されたテーマ設定を読み込んで適用します。
// ----------------------------------------------------------------------------
async function initTheme() {
  try {
    const result = await chrome.storage.sync.get(['themeMode']);
    applyTheme(result.themeMode || 'system');
  } catch (error) {
    console.error('Failed to load theme:', error);
    applyTheme('system');
  }
}

// ----------------------------------------------------------------------------
// applyTheme - テーマを適用
// ----------------------------------------------------------------------------
// 引数の mode に応じて HTML要素の data-theme 属性を設定します。
//
// mode の値:
//   'dark'   - ダークモードを強制適用
//   'light'  - ライトモード（data-theme属性を削除）
//   'system' - OSの設定に従う（prefers-color-scheme を確認）
// ----------------------------------------------------------------------------
function applyTheme(mode) {
  const html = document.documentElement;

  if (mode === 'dark') {
    html.setAttribute('data-theme', 'dark');
  } else if (mode === 'light') {
    html.removeAttribute('data-theme');
  } else {
    // System mode - check prefers-color-scheme
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      html.setAttribute('data-theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
    }
  }
}

// ----------------------------------------------------------------------------
// システムテーマ変更の監視
// ----------------------------------------------------------------------------
// OSのダークモード設定が変更されたときに、テーマを再適用します。
// （例：macOSの「外観」設定が変更されたとき）
// ----------------------------------------------------------------------------
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  const result = await chrome.storage.sync.get(['themeMode']);
  if (!result.themeMode || result.themeMode === 'system') {
    applyTheme('system');
  }
});

// ----------------------------------------------------------------------------
// 設定変更の監視（リアルタイム反映）
// ----------------------------------------------------------------------------
// 設定画面(options.html)で設定が変更されたとき、サイドパネルにも
// 即座に反映させます。ページを再読み込みしなくても変更が適用されます。
//
// chrome.storage.onChanged は設定が変更されるたびに呼ばれます。
// namespace が 'sync' の場合は chrome.storage.sync の変更です。
// ----------------------------------------------------------------------------
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.themeMode) {
      applyTheme(changes.themeMode.newValue || 'system');
    }
    if (changes.language) {
      currentLang = resolveLanguage(changes.language.newValue || 'system');
      applyTranslations();
    }
  }
});

// テーマを即座に初期化（ページ読み込み時に実行）
initTheme();

// ============================================================================
// 言語管理（Language Management）
// ============================================================================
// 表示言語の切り替えと翻訳を制御します。
// ============================================================================

// ----------------------------------------------------------------------------
// initLanguage - 言語設定の初期化
// ----------------------------------------------------------------------------
// ページ読み込み時に保存された言語設定を読み込み、UI に適用します。
// ----------------------------------------------------------------------------
async function initLanguage() {
  try {
    const result = await chrome.storage.sync.get(['language']);
    if (result.language) {
      currentLang = resolveLanguage(result.language);
    } else {
      currentLang = getSystemLanguage();
    }
    applyTranslations();
  } catch (error) {
    console.error('Failed to load language:', error);
    currentLang = 'en';
    applyTranslations();
  }
}

// ----------------------------------------------------------------------------
// applyTranslations - サイドパネルの翻訳を適用
// ----------------------------------------------------------------------------
// サイドパネル内のすべてのテキスト要素を現在の言語に翻訳します。
// t() 関数を使って locales.js から翻訳テキストを取得します。
//
// 【処理対象】
// - ヘッダータイトル、設定ボタンのツールチップ
// - タブ名（字幕/要約）
// - ボタンテキスト（読込/コピー/要約）
// - 空状態のメッセージ
// ----------------------------------------------------------------------------
function applyTranslations() {
  // Header
  const headerTitle = document.getElementById('header-title');
  if (headerTitle) headerTitle.textContent = t('extensionName', currentLang);

  // Settings button title
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) settingsBtn.title = t('settings', currentLang);

  // Not YouTube message
  const notYoutubeText = document.getElementById('not-youtube-text');
  if (notYoutubeText) notYoutubeText.textContent = t('notYoutube', currentLang);

  // Tabs
  const tabTranscript = document.getElementById('tab-transcript');
  if (tabTranscript) tabTranscript.textContent = t('tabTranscript', currentLang);
  const tabSummary = document.getElementById('tab-summary');
  if (tabSummary) tabSummary.textContent = t('tabSummary', currentLang);

  // Buttons
  const loadBtnText = document.getElementById('load-btn-text');
  if (loadBtnText) loadBtnText.textContent = t('btnLoad', currentLang);
  const copyTranscriptBtnText = document.getElementById('copy-transcript-btn-text');
  if (copyTranscriptBtnText) copyTranscriptBtnText.textContent = t('btnCopy', currentLang);
  const summarizeBtnText = document.getElementById('summarize-btn-text');
  if (summarizeBtnText) summarizeBtnText.textContent = t('btnSummarize', currentLang);
  const copySummaryBtnText = document.getElementById('copy-summary-btn-text');
  if (copySummaryBtnText) copySummaryBtnText.textContent = t('btnCopy', currentLang);

  // Update empty states if currently showing
  updateTranscriptUI();
  if (!currentSummary) {
    updateSummaryUI('empty');
  }
}

// 言語を即座に初期化（ページ読み込み時に実行）
initLanguage();

// ============================================================================
// DOM要素の取得
// ============================================================================
// HTML内の要素を取得して変数に格納します。
// これらの変数を使って画面の表示を制御します。
// ============================================================================
const notYoutubeEl = document.getElementById('not-youtube');       // YouTube以外の時のメッセージ
const mainContentEl = document.getElementById('main-content');     // メインコンテンツエリア
const videoInfoEl = document.getElementById('video-info');         // 動画情報表示エリア
const videoTitleEl = document.getElementById('video-title');       // 動画タイトル表示
const transcriptListEl = document.getElementById('transcript-list'); // 字幕リスト表示エリア
const summaryContentEl = document.getElementById('summary-content'); // 要約表示エリア
const notificationEl = document.getElementById('notification');    // 通知メッセージ表示

// ============================================================================
// 初期化処理
// ============================================================================
// DOMContentLoaded: HTML の読み込みが完了したときに実行されます。
// イベントリスナーの設定と現在のタブのチェックを行います。
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await checkCurrentTab();

  // Listen for tab updates
  chrome.tabs.onActivated.addListener(checkCurrentTab);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      checkCurrentTab();
    }
  });
});

// ----------------------------------------------------------------------------
// setupEventListeners - イベントリスナーの設定
// ----------------------------------------------------------------------------
// 各ボタンやタブにクリックイベントを設定します。
// ユーザーの操作に対応する処理を登録しています。
// ----------------------------------------------------------------------------
function setupEventListeners() {
  // Settings button
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Load transcript button
  document.getElementById('load-btn').addEventListener('click', loadTranscript);

  // Copy transcript button
  document.getElementById('copy-transcript-btn').addEventListener('click', copyTranscript);

  // Summarize button
  document.getElementById('summarize-btn').addEventListener('click', summarize);

  // Copy summary button
  document.getElementById('copy-summary-btn').addEventListener('click', copySummary);
}

// ============================================================================
// YouTubeページ検出とタブ管理
// ============================================================================

// ----------------------------------------------------------------------------
// checkCurrentTab - 現在のタブがYouTubeかチェック
// ----------------------------------------------------------------------------
// アクティブなタブを確認し、YouTubeの動画ページかどうかを判定します。
//
// 【処理の流れ】
// 1. chrome.tabs.query で現在のタブ情報を取得
// 2. URLに youtube.com/watch が含まれていれば動画ページ
// 3. 動画ページなら: メインコンテンツを表示、動画タイトルを取得
// 4. 違う場合: 「YouTubeを開いてください」メッセージを表示
// ----------------------------------------------------------------------------
async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab?.id;

    if (tab?.url?.includes('youtube.com/watch')) {
      notYoutubeEl.style.display = 'none';
      mainContentEl.style.display = 'flex';

      // Get video title
      const title = await getVideoTitle(tab.id);
      if (title) {
        videoTitleEl.textContent = title;
        videoInfoEl.style.display = 'block';
      }

      // Reset data for new video
      const videoId = new URL(tab.url).searchParams.get('v');
      if (videoId !== currentVideoId) {
        currentVideoId = videoId;
        transcriptData = [];
        currentSummary = '';
        updateTranscriptUI();
        updateSummaryUI('empty');
      }
    } else {
      notYoutubeEl.style.display = 'flex';
      mainContentEl.style.display = 'none';
    }
  } catch (error) {
    console.error('Error checking tab:', error);
  }
}

let currentVideoId = null;

// Get video title from page
async function getVideoTitle(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer, h1.ytd-watch-metadata');
        return titleEl?.textContent?.trim() || document.title.replace(' - YouTube', '');
      }
    });
    return results[0]?.result;
  } catch (error) {
    console.error('Error getting title:', error);
    return null;
  }
}

// Switch tabs
// タブを切り替える
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
}

// ============================================================================
// 字幕読み込み処理
// ============================================================================

// ----------------------------------------------------------------------------
// loadTranscript - 字幕を読み込む
// ----------------------------------------------------------------------------
// YouTubeページから字幕（トランスクリプト）を取得します。
//
// 【処理の流れ】
// 1. ローディング表示
// 2. chrome.scripting.executeScript でページ内でextractTranscript()を実行
//    （extractTranscript関数はこのファイルの末尾に定義されています）
// 3. 結果を transcriptData に保存
// 4. UIを更新
//
// 【chrome.scripting.executeScriptについて】
// YouTube のページ内でJavaScriptを実行できます。
// サイドパネルから直接DOMにアクセスできないため、この方法を使います。
// ----------------------------------------------------------------------------
async function loadTranscript() {
  const loadBtn = document.getElementById('load-btn');
  loadBtn.disabled = true;

  transcriptListEl.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span class="loading-text">${t('loadingTranscript', currentLang)}</span>
    </div>
  `;

  try {
    if (!currentTabId) {
      throw new Error(t('tabNotFound', currentLang));
    }

    // Execute transcript extraction in content script
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: extractTranscript
    });

    const result = results[0]?.result;
    if (!result || !result.success) {
      throw new Error(result?.error || t('failedToGetTranscript', currentLang));
    }

    transcriptData = result.data;
    updateTranscriptUI();

  } catch (error) {
    transcriptListEl.innerHTML = `
      <div class="error">
        <div class="error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <p class="error-message">${error.message}</p>
      </div>
    `;
  } finally {
    loadBtn.disabled = false;
  }
}

// Update transcript UI
function updateTranscriptUI() {
  if (transcriptData.length === 0) {
    transcriptListEl.innerHTML = `
      <div class="empty">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
        </div>
        <p class="empty-text">${t('emptyTranscript', currentLang)}</p>
      </div>
    `;
    return;
  }

  transcriptListEl.innerHTML = transcriptData.map((item, index) => `
    <div class="transcript-item" data-index="${index}" data-time="${item.seconds}">
      <span class="transcript-time">${item.time}</span>
      <span class="transcript-text">${escapeHtml(item.text)}</span>
    </div>
  `).join('');

  // Add click event to seek video
  transcriptListEl.querySelectorAll('.transcript-item').forEach(item => {
    item.addEventListener('click', async () => {
      const time = parseFloat(item.dataset.time);
      await seekVideo(time);

      transcriptListEl.querySelectorAll('.transcript-item').forEach(el => {
        el.classList.remove('active');
      });
      item.classList.add('active');
    });
  });
}

// Seek video to time
async function seekVideo(seconds) {
  if (!currentTabId) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: (time) => {
        const video = document.querySelector('video');
        if (video) video.currentTime = time;
      },
      args: [seconds]
    });
  } catch (error) {
    console.error('Error seeking video:', error);
  }
}

// Copy transcript
async function copyTranscript() {
  if (transcriptData.length === 0) {
    showNotification(t('noTranscript', currentLang));
    return;
  }

  const text = transcriptData.map(item => `[${item.time}] ${item.text}`).join('\n');

  try {
    await navigator.clipboard.writeText(text);
    showNotification(t('transcriptCopied', currentLang));
  } catch (error) {
    showNotification(t('failedToCopy', currentLang));
  }
}

// ============================================================================
// AI要約処理
// ============================================================================

// ----------------------------------------------------------------------------
// summarize - AI要約を生成
// ----------------------------------------------------------------------------
// 字幕テキストをAI APIに送信して要約を生成します。
//
// 【処理の流れ】
// 1. 字幕が読み込まれていなければ自動で読み込む
// 2. APIキーの設定を確認
// 3. ローディング表示
// 4. chrome.runtime.sendMessage で background.js に要約リクエスト
// 5. 結果を表示し、自動でクリップボードにコピー
//
// 【background.js との連携】
// サイドパネルから直接APIを呼べないため、background.js（Service Worker）
// 経由でAPI呼び出しを行います。
// ----------------------------------------------------------------------------
async function summarize() {
  const summarizeBtn = document.getElementById('summarize-btn');

  // Check if transcript is loaded
  if (transcriptData.length === 0) {
    await loadTranscript();
    if (transcriptData.length === 0) return;
  }

  // バージョンモードを取得
  const settings = await chrome.storage.sync.get(['apiKey', 'apiProvider', 'language', 'versionMode']);
  const versionMode = settings.versionMode || 'free';

  // ----------------------------------------------------------------------------
  // 無料版モードの処理
  // ----------------------------------------------------------------------------
  // 無料版の場合: 字幕とプロンプトをクリップボードにコピーし、Webインターフェースを開く
  // ----------------------------------------------------------------------------
  if (versionMode === 'free') {
    summarizeBtn.disabled = true;
    summaryContentEl.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <span class="loading-text">${t('freeModeSummarizing', currentLang)}</span>
      </div>
    `;

    try {
      const transcript = transcriptData.map(item => `[${item.time}] ${item.text}`).join('\n');

      // プロンプトと字幕を結合してコピー
      const prompt = getSummaryPrompt(currentLang);
      const fullText = prompt + transcript;

      await navigator.clipboard.writeText(fullText);

      // Webインターフェースを開く
      const response = await chrome.runtime.sendMessage({
        action: 'openFreeModeWeb'
      });

      if (response && response.success) {
        const providerName = {
          claude: 'Claude',
          openai: 'ChatGPT',
          gemini: 'Gemini'
        }[response.provider] || response.provider;

        summaryContentEl.innerHTML = `
          <div class="free-mode-message">
            <div class="success-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <p class="success-message">${t('freeModeTranscriptCopied', currentLang)} ${providerName}</p>
            <p class="success-hint">${t('freeModeInstructions', currentLang)}</p>
          </div>
        `;
        showNotification(t('freeModeTranscriptCopied', currentLang) + ' ' + providerName);
      } else {
        throw new Error(response?.error || t('errorOccurred', currentLang));
      }
    } catch (error) {
      summaryContentEl.innerHTML = `
        <div class="error">
          <div class="error-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <p class="error-message">${error.message}</p>
        </div>
      `;
    } finally {
      summarizeBtn.disabled = false;
    }
    return;
  }

  // ----------------------------------------------------------------------------
  // API版モードの処理
  // ----------------------------------------------------------------------------
  // API版の場合: APIキーを使用して直接要約を生成
  // ----------------------------------------------------------------------------
  if (!settings.apiKey) {
    summaryContentEl.innerHTML = `
      <div class="error">
        <div class="error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <p class="error-message">${t('apiKeyNotSet', currentLang)}</p>
      </div>
    `;
    return;
  }

  summarizeBtn.disabled = true;
  summaryContentEl.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span class="loading-text">${t('loadingSummary', currentLang)}</span>
    </div>
  `;

  try {
    const transcript = transcriptData.map(item => `[${item.time}] ${item.text}`).join('\n');

    // Send language preference for summary prompt
    const response = await chrome.runtime.sendMessage({
      action: 'summarize',
      transcript: transcript,
      videoId: currentVideoId,
      language: currentLang
    });

    if (!response || !response.success) {
      throw new Error(response?.error || t('failedToGenerateSummary', currentLang));
    }

    currentSummary = response.summary;
    updateSummaryUI('success');

    // Auto copy
    await navigator.clipboard.writeText(currentSummary);
    showNotification(t('summaryCopied', currentLang));

  } catch (error) {
    summaryContentEl.innerHTML = `
      <div class="error">
        <div class="error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <p class="error-message">${error.message}</p>
      </div>
    `;
  } finally {
    summarizeBtn.disabled = false;
  }
}

// Update summary UI
function updateSummaryUI(state) {
  if (state === 'empty' || !currentSummary) {
    summaryContentEl.innerHTML = `
      <div class="empty">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 20V10"></path>
            <path d="M18 20V4"></path>
            <path d="M6 20v-4"></path>
          </svg>
        </div>
        <p class="empty-text">${t('emptySummary', currentLang)}</p>
      </div>
    `;
    return;
  }

  if (state === 'success') {
    // Parse markdown and add AI web link section
    let summaryHtml = parseMarkdown(currentSummary);

    // Add AI web link section at the end
    summaryHtml += `
      <div class="ai-web-link-section">
        <hr style="margin: 16px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">
          💡 ${t('aiWebLinkHint', currentLang)}
        </p>
        <button id="open-ai-web-btn" class="ai-web-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <span>${t('aiWebLinkBtn', currentLang)}</span>
        </button>
        <p style="font-size: 11px; color: #9ca3af; margin-top: 6px;">
          ${t('aiWebLinkDesc', currentLang)}
        </p>
      </div>
    `;

    summaryContentEl.innerHTML = summaryHtml;

    // Add event listener for AI web link button
    document.getElementById('open-ai-web-btn')?.addEventListener('click', openAIWebWithSummary);
  }
}

// Open AI web interface with summary copied to clipboard
async function openAIWebWithSummary() {
  try {
    // Copy summary to clipboard first
    await navigator.clipboard.writeText(currentSummary);

    // Get the AI web URL based on provider
    const response = await chrome.runtime.sendMessage({ action: 'getAIWebUrl' });

    if (response?.url) {
      // Open the AI web interface in a new tab
      chrome.tabs.create({ url: response.url });
      showNotification(`${t('summaryCopiedPaste', currentLang)} ${getProviderName(response.provider)}`);
    } else {
      showNotification(t('couldNotGetUrl', currentLang));
    }
  } catch (error) {
    console.error('Error opening AI web:', error);
    showNotification(t('errorOccurred', currentLang));
  }
}

// Get provider display name
function getProviderName(provider) {
  const names = {
    claude: 'Claude',
    openai: 'ChatGPT',
    gemini: 'Gemini'
  };
  return names[provider] || 'AI';
}

// Copy summary
async function copySummary() {
  if (!currentSummary) {
    showNotification(t('noSummary', currentLang));
    return;
  }

  try {
    await navigator.clipboard.writeText(currentSummary);
    showNotification(t('summaryCopied', currentLang));
  } catch (error) {
    showNotification(t('failedToCopy', currentLang));
  }
}

// Show notification
// 通知メッセージを表示（2秒後に自動で消える）
function showNotification(message) {
  notificationEl.textContent = message;
  notificationEl.classList.add('show');
  setTimeout(() => {
    notificationEl.classList.remove('show');
  }, 2000);
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

// ----------------------------------------------------------------------------
// parseMarkdown - マークダウンをHTMLに変換
// ----------------------------------------------------------------------------
// AIからの応答はマークダウン形式で返ってくるため、
// HTMLに変換して画面に表示します。
//
// 【変換対象】
// - 見出し（#, ##, ###）→ <h3>
// - 太字（**text**）→ <strong>
// - 表（|...|）→ <table>
// - リスト（- item）→ <ul><li>
// ----------------------------------------------------------------------------
function parseMarkdown(text) {
  let html = text;

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  const tableRegex = /\|(.+)\|\n\|[-|\s]+\|\n((?:\|.+\|\n?)+)/g;
  html = html.replace(tableRegex, (match, header, rows) => {
    const headers = header.split('|').filter(h => h.trim()).map(h => `<th>${h.trim()}</th>`).join('');
    const rowsHtml = rows.trim().split('\n').map(row => {
      const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table><thead><tr>${headers}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  });

  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.+<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  html = html.replace(/<br><li>/g, '<li>');
  html = html.replace(/<\/li><br>/g, '</li>');

  return `<p>${html}</p>`;
}

// HTMLエスケープ（XSS対策）
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// 字幕抽出関数（YouTubeページ内で実行される）
// ============================================================================
// この関数は chrome.scripting.executeScript でYouTubeページ内で実行されます。
// サイドパネルのコンテキストではなく、YouTubeページのコンテキストで動作します。
//
// 【なぜここに定義されているか】
// executeScript({ func: extractTranscript }) で呼び出すには、
// 関数を直接定義して渡す必要があるためです。
//
// 【字幕取得の仕組み】
// YouTubeは動画の字幕データをページ内のスクリプトやAPIから取得できます。
// 複数の方法（フォールバック）を用意して、確実に取得できるようにしています。
//
// 【取得方法（優先順）】
// 0. Innertube API（最も安定、yt-dlpと同様の方法）
// 1. ページ内スクリプトから captionTracks を抽出
// 2. ytInitialPlayerResponse グローバル変数から取得
// 3. movie_player.getPlayerResponse() から取得
// 4. baseUrl を直接探して字幕XMLを取得
// ============================================================================
function extractTranscript() {
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function parseTranscriptXML(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const textElements = doc.querySelectorAll('text');

    if (textElements.length === 0) {
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        throw new Error('Invalid subtitle data format');
      }
      throw new Error('Subtitle data is empty');
    }

    const transcriptParts = [];
    textElements.forEach((element) => {
      const start = parseFloat(element.getAttribute('start') || '0');
      let text = element.textContent || '';

      const textarea = document.createElement('textarea');
      textarea.innerHTML = text;
      text = textarea.value.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

      if (text) {
        transcriptParts.push({
          time: formatTime(start),
          seconds: start,
          text: text
        });
      }
    });

    return transcriptParts;
  }

  async function fetchCaptionTrack(captionTracks) {
    console.log('[YouTube要約] 利用可能な字幕トラック:', captionTracks.length);
    captionTracks.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.languageCode} (${t.kind || 'manual'})`);
    });

    // Priority order: Japanese manual > Japanese auto > English > Any auto > First
    let selectedTrack = captionTracks.find(t => t.languageCode === 'ja' && t.kind !== 'asr') ||
                        captionTracks.find(t => t.languageCode === 'ja' && t.kind === 'asr') ||
                        captionTracks.find(t => t.languageCode === 'ja') ||
                        captionTracks.find(t => t.languageCode === 'ja-JP') ||
                        captionTracks.find(t => t.languageCode === 'en' && t.kind !== 'asr') ||
                        captionTracks.find(t => t.languageCode === 'en' && t.kind === 'asr') ||
                        captionTracks.find(t => t.languageCode?.startsWith('en')) ||
                        captionTracks.find(t => t.kind === 'asr') ||
                        captionTracks[0];

    if (!selectedTrack) {
      throw new Error('No suitable subtitle track found');
    }

    let baseUrl = selectedTrack.baseUrl;
    if (!baseUrl) {
      throw new Error('Subtitle URL not found');
    }

    // Unescape URL if needed
    baseUrl = baseUrl.replace(/\\u0026/g, '&');

    console.log('[YouTube要約] 選択:', selectedTrack.languageCode, selectedTrack.kind || 'manual');

    const response = await fetch(baseUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch subtitles');
    }
    const xml = await response.text();
    return parseTranscriptXML(xml);
  }

  // Get video ID from current URL
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  // Method 0: Use Innertube API (most reliable)
  async function getTranscriptFromInnertube() {
    const videoId = getVideoId();
    if (!videoId) return null;

    // Get page HTML for tokens
    const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      credentials: 'include'
    });
    const pageHtml = await pageResponse.text();

    // Extract INNERTUBE_API_KEY
    const apiKeyMatch = pageHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    if (!apiKeyMatch) {
      console.log('[YouTube要約] INNERTUBE_API_KEY not found');
      return null;
    }
    const apiKey = apiKeyMatch[1];

    // Extract client version
    const clientVersionMatch = pageHtml.match(/"clientVersion":"([^"]+)"/);
    const clientVersion = clientVersionMatch ? clientVersionMatch[1] : '2.20231219.04.00';

    // Use player endpoint to get captions
    const playerResponse = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: clientVersion,
            hl: 'ja',
            gl: 'JP'
          }
        },
        videoId: videoId
      })
    });

    if (playerResponse.ok) {
      const data = await playerResponse.json();
      const captions = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (captions && captions.length > 0) {
        console.log('[YouTube要約] Innertube APIから取得成功');
        return await fetchCaptionTrack(captions);
      }
    }
    return null;
  }

  async function getTranscript() {
    let captionTracks = null;

    // Method 0: Try Innertube API first (most reliable like yt-dlp)
    try {
      const innertubeResult = await getTranscriptFromInnertube();
      if (innertubeResult && innertubeResult.length > 0) {
        return innertubeResult;
      }
    } catch (e) {
      console.log('[YouTube要約] Innertube API失敗:', e.message);
    }

    // Method 1: Extract captionTracks from script tags
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const content = script.textContent || '';
      if (!content.includes('captionTracks')) continue;

      // Try to extract captionTracks directly
      const patterns = [
        /"captionTracks":\s*(\[[\s\S]*?\])(?=,"audioTracks")/,
        /"captionTracks":\s*(\[[\s\S]*?\])(?=,"translationLanguages")/,
        /"captionTracks":\s*(\[[\s\S]*?\])(?=,"defaultAudioTrackIndex")/
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          try {
            captionTracks = JSON.parse(match[1]);
            if (captionTracks && captionTracks.length > 0) {
              console.log('[YouTube要約] スクリプトからcaptionTracks抽出成功');
              return await fetchCaptionTrack(captionTracks);
            }
          } catch (e) {
            continue;
          }
        }
      }
    }

    // Method 2: Try window.ytInitialPlayerResponse
    if (typeof ytInitialPlayerResponse !== 'undefined' && ytInitialPlayerResponse) {
      captionTracks = ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (captionTracks && captionTracks.length > 0) {
        console.log('[YouTube要約] ytInitialPlayerResponseから取得');
        return await fetchCaptionTrack(captionTracks);
      }
    }

    // Method 3: Try movie_player.getPlayerResponse()
    const player = document.getElementById('movie_player');
    if (player && player.getPlayerResponse) {
      try {
        const response = player.getPlayerResponse();
        captionTracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (captionTracks && captionTracks.length > 0) {
          console.log('[YouTube要約] movie_playerから取得');
          return await fetchCaptionTrack(captionTracks);
        }
      } catch (e) {
        console.log('[YouTube要約] movie_player取得失敗:', e.message);
      }
    }

    // Method 4: Try to find baseUrl directly
    for (const script of scripts) {
      const content = script.textContent || '';
      const baseUrlMatch = content.match(/"baseUrl":\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
      if (baseUrlMatch) {
        try {
          const baseUrl = baseUrlMatch[1].replace(/\\u0026/g, '&');
          console.log('[YouTube要約] baseUrl直接抽出');
          const response = await fetch(baseUrl);
          const xml = await response.text();
          return parseTranscriptXML(xml);
        } catch (e) {
          continue;
        }
      }
    }

    throw new Error('No subtitles available for this video. Please check if captions are enabled.');
  }

  return getTranscript()
    .then(data => ({ success: true, data }))
    .catch(error => ({ success: false, error: error.message }));
}
