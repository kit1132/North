// DOM elements
const form = document.getElementById('options-form');
const languageSelect = document.getElementById('language');
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

// Current language
let currentLang = 'en';

// API provider configurations (base - translations are applied dynamically)
const API_CONFIGS = {
  claude: {
    name: 'Claude',
    placeholder: 'sk-ant-api03-...',
    url: 'https://console.anthropic.com/',
    validatePrefix: (key) => key.startsWith('sk-ant-')
  },
  openai: {
    name: 'OpenAI',
    placeholder: 'sk-...',
    url: 'https://platform.openai.com/api-keys',
    validatePrefix: (key) => key.startsWith('sk-')
  },
  gemini: {
    name: 'Gemini',
    placeholder: 'AIza...',
    url: 'https://aistudio.google.com/app/apikey',
    validatePrefix: (key) => key.startsWith('AIza')
  }
};

// Get translated API config
function getApiConfig(provider) {
  const base = API_CONFIGS[provider];
  return {
    ...base,
    hint: t(provider + 'Hint', currentLang),
    info: t(provider + 'Info', currentLang)
  };
}

// Load saved settings on page load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const result = await chrome.storage.sync.get(['apiProvider', 'apiKey', 'themeMode', 'language']);

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
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    updateProviderUI();
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
});

// Apply translations to the page
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

  // API key placeholder
  apiKeyInput.placeholder = t('apiKeyPlaceholder', currentLang);

  // Buttons
  document.getElementById('verify-btn-text').textContent = t('btnVerify', currentLang);
  document.getElementById('save-btn-text').textContent = t('btnSaveClose', currentLang);

  // Update provider UI with new translations
  updateProviderUI();
}

// Language change - save immediately and update UI
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

// Theme mode change - save immediately
themeModeSelect.addEventListener('change', async () => {
  const themeMode = themeModeSelect.value;
  try {
    await chrome.storage.sync.set({ themeMode });
    showNotification(t('themeChanged', currentLang), 'success');
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
  const baseConfig = API_CONFIGS[provider];
  const config = getApiConfig(provider);

  apiKeyInput.placeholder = baseConfig.placeholder;
  apiHint.innerHTML = `${t('getApiKeyFrom', currentLang)} <a href="${baseConfig.url}" target="_blank" id="api-link">${config.hint}</a>`;
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

// Save settings
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const provider = apiProviderSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const config = API_CONFIGS[provider];

  if (!apiKey) {
    showNotification(t('pleaseEnterApiKey', currentLang), 'error');
    return;
  }

  if (!config.validatePrefix(apiKey)) {
    showNotification(t('pleaseEnterValidApiKey', currentLang).replace('{provider}', config.name), 'error');
    return;
  }

  saveBtn.disabled = true;

  try {
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
