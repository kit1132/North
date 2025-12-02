// Side Panel Script for YouTube Summarizer

let transcriptData = [];
let currentSummary = '';
let currentTabId = null;

// Theme Management
async function initTheme() {
  try {
    const result = await chrome.storage.sync.get(['themeMode']);
    applyTheme(result.themeMode || 'system');
  } catch (error) {
    console.error('Failed to load theme:', error);
    applyTheme('system');
  }
}

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

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  const result = await chrome.storage.sync.get(['themeMode']);
  if (!result.themeMode || result.themeMode === 'system') {
    applyTheme('system');
  }
});

// Listen for theme changes from settings
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.themeMode) {
    applyTheme(changes.themeMode.newValue || 'system');
  }
});

// Initialize theme immediately
initTheme();

// DOM Elements
const notYoutubeEl = document.getElementById('not-youtube');
const mainContentEl = document.getElementById('main-content');
const videoInfoEl = document.getElementById('video-info');
const videoTitleEl = document.getElementById('video-title');
const transcriptListEl = document.getElementById('transcript-list');
const summaryContentEl = document.getElementById('summary-content');
const notificationEl = document.getElementById('notification');

// Initialize
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

// Setup event listeners
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

// Check if current tab is YouTube
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
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
}

// Load transcript from content script
async function loadTranscript() {
  const loadBtn = document.getElementById('load-btn');
  loadBtn.disabled = true;

  transcriptListEl.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span class="loading-text">Loading transcript...</span>
    </div>
  `;

  try {
    if (!currentTabId) {
      throw new Error('Tab not found');
    }

    // Execute transcript extraction in content script
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: extractTranscript
    });

    const result = results[0]?.result;
    if (!result || !result.success) {
      throw new Error(result?.error || 'Failed to get transcript');
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
        <p class="empty-text">Click "Load" to<br>get the transcript</p>
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
    showNotification('No transcript available');
    return;
  }

  const text = transcriptData.map(item => `[${item.time}] ${item.text}`).join('\n');

  try {
    await navigator.clipboard.writeText(text);
    showNotification('Transcript copied to clipboard');
  } catch (error) {
    showNotification('Failed to copy');
  }
}

// Summarize
async function summarize() {
  const summarizeBtn = document.getElementById('summarize-btn');

  // Check if transcript is loaded
  if (transcriptData.length === 0) {
    await loadTranscript();
    if (transcriptData.length === 0) return;
  }

  // Check API key
  const settings = await chrome.storage.sync.get(['apiKey', 'apiProvider']);
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
        <p class="error-message">API key not set<br>Please configure in settings</p>
      </div>
    `;
    return;
  }

  summarizeBtn.disabled = true;
  summaryContentEl.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span class="loading-text">Generating summary...</span>
    </div>
  `;

  try {
    const transcript = transcriptData.map(item => `[${item.time}] ${item.text}`).join('\n');

    const response = await chrome.runtime.sendMessage({
      action: 'summarize',
      transcript: transcript,
      videoId: currentVideoId
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to generate summary');
    }

    currentSummary = response.summary;
    updateSummaryUI('success');

    // Auto copy
    await navigator.clipboard.writeText(currentSummary);
    showNotification('Summary copied to clipboard');

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
        <p class="empty-text">Click "Summarize" to<br>generate AI summary</p>
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
          💡 Ask AI to explore this summary further
        </p>
        <button id="open-ai-web-btn" class="ai-web-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <span>Explore with AI</span>
        </button>
        <p style="font-size: 11px; color: #9ca3af; margin-top: 6px;">
          Opens AI web interface and copies summary to clipboard.<br>
          Paste and add your questions.
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
      showNotification(`Summary copied. Paste in ${getProviderName(response.provider)}.`);
    } else {
      showNotification('Could not get AI URL');
    }
  } catch (error) {
    console.error('Error opening AI web:', error);
    showNotification('An error occurred');
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
    showNotification('No summary available');
    return;
  }

  try {
    await navigator.clipboard.writeText(currentSummary);
    showNotification('Summary copied');
  } catch (error) {
    showNotification('Failed to copy');
  }
}

// Show notification
function showNotification(message) {
  notificationEl.textContent = message;
  notificationEl.classList.add('show');
  setTimeout(() => {
    notificationEl.classList.remove('show');
  }, 2000);
}

// Parse markdown to HTML
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

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Transcript Extraction Function (injected into page) =====
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
