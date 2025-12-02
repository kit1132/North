// DOM elements
const form = document.getElementById('options-form');
const themeModeSelect = document.getElementById('theme-mode');
const apiProviderSelect = document.getElementById('api-provider');
const apiKeyInput = document.getElementById('api-key');
const toggleKeyBtn = document.getElementById('toggle-key');
const verifyBtn = document.getElementById('verify-btn');
const saveBtn = document.getElementById('save-btn');
const notification = document.getElementById('notification');
const apiStatus = document.getElementById('api-status');
const apiHint = document.getElementById('api-hint');
const apiLink = document.getElementById('api-link');
const apiInfo = document.getElementById('api-info');

// API provider configurations
const API_CONFIGS = {
  claude: {
    name: 'Claude',
    placeholder: 'sk-ant-api03-...',
    hint: 'Anthropic Console',
    url: 'https://console.anthropic.com/',
    info: '<strong>Claude:</strong> Best for high-quality summaries. Uses claude-sonnet-4-20250514.',
    validatePrefix: (key) => key.startsWith('sk-ant-')
  },
  openai: {
    name: 'OpenAI',
    placeholder: 'sk-...',
    hint: 'OpenAI Platform',
    url: 'https://platform.openai.com/api-keys',
    info: '<strong>OpenAI:</strong> Uses GPT-4o. Fast and reliable summaries.',
    validatePrefix: (key) => key.startsWith('sk-')
  },
  gemini: {
    name: 'Gemini',
    placeholder: 'AIza...',
    hint: 'Google AI Studio',
    url: 'https://aistudio.google.com/app/apikey',
    info: '<strong>Gemini:</strong> Uses Gemini 1.5 Pro. Handles long videos well.',
    validatePrefix: (key) => key.startsWith('AIza')
  }
};

// Load saved settings on page load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const result = await chrome.storage.sync.get(['apiProvider', 'apiKey', 'themeMode']);
    if (result.themeMode) {
      themeModeSelect.value = result.themeMode;
    }
    if (result.apiProvider) {
      apiProviderSelect.value = result.apiProvider;
    }
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    updateProviderUI();
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
});

// Theme mode change - save immediately
themeModeSelect.addEventListener('change', async () => {
  const themeMode = themeModeSelect.value;
  try {
    await chrome.storage.sync.set({ themeMode });
    showNotification('Theme changed', 'success');
  } catch (error) {
    console.error('Failed to save theme:', error);
  }
});

// Update UI when provider changes
apiProviderSelect.addEventListener('change', () => {
  updateProviderUI();
  clearStatus();
});

function updateProviderUI() {
  const provider = apiProviderSelect.value;
  const config = API_CONFIGS[provider];

  apiKeyInput.placeholder = config.placeholder;
  apiLink.textContent = config.hint;
  apiLink.href = config.url;
  apiInfo.innerHTML = config.info;
}

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

// Show status
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

function clearStatus() {
  apiStatus.innerHTML = '';
}

// Verify API key
verifyBtn.addEventListener('click', async () => {
  const provider = apiProviderSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const config = API_CONFIGS[provider];

  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }

  if (!config.validatePrefix(apiKey)) {
    showStatus(`Please enter a valid ${config.name} API key`, 'error');
    return;
  }

  verifyBtn.disabled = true;
  showStatus('Verifying API key...', 'verifying');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'verifyApiKey',
      provider: provider,
      apiKey: apiKey
    });

    if (response && response.success) {
      showStatus('API key is valid', 'success');
    } else {
      showStatus(response?.error || 'API key is invalid', 'error');
    }
  } catch (error) {
    showStatus('Verification failed: ' + error.message, 'error');
  } finally {
    verifyBtn.disabled = false;
  }
});

// Save settings
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const provider = apiProviderSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const config = API_CONFIGS[provider];

  if (!apiKey) {
    showNotification('Please enter an API key', 'error');
    return;
  }

  if (!config.validatePrefix(apiKey)) {
    showNotification(`Please enter a valid ${config.name} API key`, 'error');
    return;
  }

  saveBtn.disabled = true;

  try {
    // Verify before saving
    showStatus('Verifying API key...', 'verifying');

    const verifyResponse = await chrome.runtime.sendMessage({
      action: 'verifyApiKey',
      provider: provider,
      apiKey: apiKey
    });

    if (!verifyResponse || !verifyResponse.success) {
      showStatus(verifyResponse?.error || 'API key is invalid', 'error');
      showNotification('API key is invalid. Please check.', 'error');
      return;
    }

    // Save to storage
    await chrome.storage.sync.set({
      apiProvider: provider,
      apiKey: apiKey
    });

    showStatus('API key is valid', 'success');
    showNotification('Settings saved', 'success');

    // Close the options page after a short delay
    setTimeout(() => {
      window.close();
    }, 1500);

  } catch (error) {
    console.error('Failed to save settings:', error);
    showNotification('Failed to save settings', 'error');
  } finally {
    saveBtn.disabled = false;
  }
});
