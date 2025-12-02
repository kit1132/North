// DOM Elements
const initialState = document.getElementById('initial-state');
const loadingState = document.getElementById('loading-state');
const resultState = document.getElementById('result-state');
const errorState = document.getElementById('error-state');
const summarizeBtn = document.getElementById('summarize-btn');
const copyBtn = document.getElementById('copy-btn');
const retryBtn = document.getElementById('retry-btn');
const settingsLink = document.getElementById('settings-link');
const resultContent = document.getElementById('result-content');
const errorMessage = document.getElementById('error-message');
const errorActionBtn = document.getElementById('error-action-btn');
const copyNotification = document.getElementById('copy-notification');

let currentSummary = '';

// Show specific state
function showState(state) {
  initialState.classList.add('hidden');
  loadingState.classList.add('hidden');
  resultState.classList.add('hidden');
  errorState.classList.add('hidden');

  state.classList.remove('hidden');
}

// Show error with message
function showError(message, actionText = '再試行', actionCallback = null) {
  errorMessage.textContent = message;
  errorActionBtn.textContent = actionText;
  errorActionBtn.onclick = actionCallback || (() => showState(initialState));
  showState(errorState);
}

// Parse markdown to HTML (simple parser)
function parseMarkdown(text) {
  let html = text;

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h3>$1</h3>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Tables
  const tableRegex = /\|(.+)\|\n\|[-|\s]+\|\n((?:\|.+\|\n?)+)/g;
  html = html.replace(tableRegex, (match, header, rows) => {
    const headers = header.split('|').filter(h => h.trim()).map(h => `<th>${h.trim()}</th>`).join('');
    const rowsHtml = rows.trim().split('\n').map(row => {
      const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table><thead><tr>${headers}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  });

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.+<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs (simple - just handle line breaks)
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Cleanup duplicate ul/li issues
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  html = html.replace(/<br><li>/g, '<li>');
  html = html.replace(/<\/li><br>/g, '</li>');

  return `<p>${html}</p>`;
}

// Copy to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showCopyNotification();
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
}

// Show copy notification
function showCopyNotification() {
  copyNotification.classList.remove('hidden');
  copyNotification.classList.add('show');
  setTimeout(() => {
    copyNotification.classList.remove('show');
    setTimeout(() => {
      copyNotification.classList.add('hidden');
    }, 300);
  }, 2000);
}

// Check if current tab is YouTube video
async function checkYouTubePage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url || !tab.url.includes('youtube.com/watch')) {
    return { isValid: false, tab: null };
  }

  return { isValid: true, tab };
}

// Get API key from storage
async function getApiKey() {
  const result = await chrome.storage.sync.get(['claudeApiKey']);
  return result.claudeApiKey || null;
}

// Main summarize function
async function summarize() {
  // Check YouTube page
  const { isValid, tab } = await checkYouTubePage();
  if (!isValid) {
    showError(
      'YouTubeの動画ページで使用してください',
      'OK',
      () => showState(initialState)
    );
    return;
  }

  // Check API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    showError(
      'APIキーが設定されていません',
      '設定を開く',
      () => chrome.runtime.openOptionsPage()
    );
    return;
  }

  // Show loading
  showState(loadingState);

  try {
    // Get transcript from content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getTranscript' });

    if (!response || !response.success) {
      throw new Error(response?.error || 'トランスクリプトの取得に失敗しました');
    }

    const transcript = response.transcript;

    // Send to background for API call
    const summaryResponse = await chrome.runtime.sendMessage({
      action: 'summarize',
      transcript: transcript,
      apiKey: apiKey
    });

    if (!summaryResponse || !summaryResponse.success) {
      throw new Error(summaryResponse?.error || '要約の生成に失敗しました');
    }

    // Display result
    currentSummary = summaryResponse.summary;
    resultContent.innerHTML = parseMarkdown(currentSummary);
    showState(resultState);

    // Auto copy to clipboard
    await copyToClipboard(currentSummary);

  } catch (error) {
    console.error('Summarize error:', error);

    let errorMsg = error.message;

    // Handle specific errors
    if (errorMsg.includes('字幕') || errorMsg.includes('transcript')) {
      errorMsg = 'この動画には字幕がありません';
    } else if (errorMsg.includes('API') || errorMsg.includes('401')) {
      errorMsg = 'APIキーが無効です。設定を確認してください';
    } else if (errorMsg.includes('429')) {
      errorMsg = 'API制限に達しました。しばらく待ってから再試行してください';
    } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
      errorMsg = 'ネットワークエラーが発生しました';
    }

    showError(errorMsg);
  }
}

// Event listeners
summarizeBtn.addEventListener('click', summarize);
retryBtn.addEventListener('click', summarize);
copyBtn.addEventListener('click', () => copyToClipboard(currentSummary));
settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Initialize - check page on load
document.addEventListener('DOMContentLoaded', async () => {
  const { isValid } = await checkYouTubePage();
  if (!isValid) {
    showError(
      'YouTubeの動画ページで使用してください',
      'OK',
      () => window.close()
    );
  }
});
