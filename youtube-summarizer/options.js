// DOM elements
const form = document.getElementById('options-form');
const apiKeyInput = document.getElementById('api-key');
const toggleKeyBtn = document.getElementById('toggle-key');
const notification = document.getElementById('notification');

// Load saved API key on page load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const result = await chrome.storage.sync.get(['claudeApiKey']);
    if (result.claudeApiKey) {
      apiKeyInput.value = result.claudeApiKey;
    }
  } catch (error) {
    console.error('Failed to load API key:', error);
  }
});

// Toggle API key visibility
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

// Show notification
function showNotification(message, type = 'success') {
  notification.textContent = message;
  notification.className = `notification ${type} show`;

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// Save API key
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showNotification('APIキーを入力してください', 'error');
    return;
  }

  if (!apiKey.startsWith('sk-ant-')) {
    showNotification('有効なClaude APIキーを入力してください', 'error');
    return;
  }

  try {
    await chrome.storage.sync.set({ claudeApiKey: apiKey });
    showNotification('設定を保存しました', 'success');
  } catch (error) {
    console.error('Failed to save API key:', error);
    showNotification('保存に失敗しました', 'error');
  }
});
