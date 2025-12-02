// YouTube Transcript Extractor with Side Panel
// This script extracts transcript/subtitle data from YouTube videos

// Store transcript data
let transcriptData = [];
let currentSummary = '';

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTranscript') {
    getTranscript()
      .then(transcript => {
        sendResponse({ success: true, transcript });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  if (request.action === 'togglePanel') {
    togglePanel();
    sendResponse({ success: true });
    return true;
  }
});

// Initialize when on YouTube watch page
function init() {
  if (!window.location.pathname.includes('/watch')) {
    return;
  }

  // Wait for page to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI);
  } else {
    createUI();
  }

  // Watch for URL changes (YouTube SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (window.location.pathname.includes('/watch')) {
        // Reset data for new video
        transcriptData = [];
        currentSummary = '';
        updateTranscriptUI();
        updateSummaryUI('empty');
      }
    }
  }).observe(document, { subtree: true, childList: true });
}

// Create UI elements
function createUI() {
  // Remove existing elements if any
  const existingPanel = document.getElementById('yt-summarizer-panel');
  const existingToggle = document.getElementById('yt-summarizer-toggle');
  if (existingPanel) existingPanel.remove();
  if (existingToggle) existingToggle.remove();

  // Create toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'yt-summarizer-toggle';
  toggleBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  `;
  toggleBtn.title = 'Show transcript';
  toggleBtn.addEventListener('click', togglePanel);
  document.body.appendChild(toggleBtn);

  // Create side panel
  const panel = document.createElement('div');
  panel.id = 'yt-summarizer-panel';
  panel.innerHTML = `
    <div class="yt-summarizer-header">
      <div class="yt-summarizer-header-left">
        <div class="yt-summarizer-logo">Y</div>
        <span class="yt-summarizer-title">YouTube Summary</span>
      </div>
      <button class="yt-summarizer-close-btn" id="yt-summarizer-close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <div class="yt-summarizer-tabs">
      <button class="yt-summarizer-tab active" data-tab="transcript">Transcript</button>
      <button class="yt-summarizer-tab" data-tab="summary">Summary</button>
    </div>

    <div class="yt-summarizer-content">
      <!-- Transcript Tab -->
      <div class="yt-summarizer-tab-content active" id="yt-summarizer-transcript-tab">
        <div class="yt-summarizer-transcript-controls">
          <button class="yt-summarizer-btn yt-summarizer-btn-primary" id="yt-summarizer-load-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            Load
          </button>
          <button class="yt-summarizer-btn yt-summarizer-btn-secondary" id="yt-summarizer-copy-transcript-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
        </div>
        <div class="yt-summarizer-transcript-list" id="yt-summarizer-transcript-list">
          <div class="yt-summarizer-empty">
            <div class="yt-summarizer-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            </div>
            <p class="yt-summarizer-empty-text">Click "Load" to<br>get the transcript</p>
          </div>
        </div>
      </div>

      <!-- Summary Tab -->
      <div class="yt-summarizer-tab-content" id="yt-summarizer-summary-tab">
        <div class="yt-summarizer-summary-actions">
          <button class="yt-summarizer-btn yt-summarizer-btn-primary" id="yt-summarizer-summarize-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20V10"></path>
              <path d="M18 20V4"></path>
              <path d="M6 20v-4"></path>
            </svg>
            Summarize
          </button>
          <button class="yt-summarizer-btn yt-summarizer-btn-secondary" id="yt-summarizer-copy-summary-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
        </div>
        <div class="yt-summarizer-summary-content" id="yt-summarizer-summary-content">
          <div class="yt-summarizer-empty">
            <div class="yt-summarizer-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 20V10"></path>
                <path d="M18 20V4"></path>
                <path d="M6 20v-4"></path>
              </svg>
            </div>
            <p class="yt-summarizer-empty-text">Click "Summarize" to<br>generate AI summary</p>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'yt-summarizer-notification';
  notification.id = 'yt-summarizer-notification';
  document.body.appendChild(notification);

  // Add event listeners
  setupEventListeners();
}

// Setup event listeners
function setupEventListeners() {
  // Close button
  document.getElementById('yt-summarizer-close').addEventListener('click', togglePanel);

  // Tab switching
  document.querySelectorAll('.yt-summarizer-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Load transcript button
  document.getElementById('yt-summarizer-load-btn').addEventListener('click', loadTranscript);

  // Copy transcript button
  document.getElementById('yt-summarizer-copy-transcript-btn').addEventListener('click', copyTranscript);

  // Summarize button
  document.getElementById('yt-summarizer-summarize-btn').addEventListener('click', summarize);

  // Copy summary button
  document.getElementById('yt-summarizer-copy-summary-btn').addEventListener('click', copySummary);
}

// Toggle panel visibility
function togglePanel() {
  const panel = document.getElementById('yt-summarizer-panel');
  if (panel) {
    panel.classList.toggle('open');
  }
}

// Switch tabs
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.yt-summarizer-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll('.yt-summarizer-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `yt-summarizer-${tabName}-tab`);
  });
}

// Load transcript
async function loadTranscript() {
  const listEl = document.getElementById('yt-summarizer-transcript-list');
  const loadBtn = document.getElementById('yt-summarizer-load-btn');

  // Show loading
  loadBtn.disabled = true;
  listEl.innerHTML = `
    <div class="yt-summarizer-loading">
      <div class="yt-summarizer-spinner"></div>
      <span class="yt-summarizer-loading-text">Loading transcript...</span>
    </div>
  `;

  try {
    transcriptData = await getTranscriptData();
    updateTranscriptUI();
  } catch (error) {
    listEl.innerHTML = `
      <div class="yt-summarizer-error">
        <div class="yt-summarizer-error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <p class="yt-summarizer-error-message">${error.message}</p>
      </div>
    `;
  } finally {
    loadBtn.disabled = false;
  }
}

// Update transcript UI
function updateTranscriptUI() {
  const listEl = document.getElementById('yt-summarizer-transcript-list');

  if (transcriptData.length === 0) {
    listEl.innerHTML = `
      <div class="yt-summarizer-empty">
        <div class="yt-summarizer-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
        </div>
        <p class="yt-summarizer-empty-text">Click "Load" to<br>get the transcript</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = transcriptData.map((item, index) => `
    <div class="yt-summarizer-transcript-item" data-index="${index}" data-time="${item.seconds}">
      <span class="yt-summarizer-transcript-time">${item.time}</span>
      <span class="yt-summarizer-transcript-text">${escapeHtml(item.text)}</span>
    </div>
  `).join('');

  // Add click event to seek video
  listEl.querySelectorAll('.yt-summarizer-transcript-item').forEach(item => {
    item.addEventListener('click', () => {
      const time = parseFloat(item.dataset.time);
      seekVideo(time);

      // Highlight active item
      listEl.querySelectorAll('.yt-summarizer-transcript-item').forEach(el => {
        el.classList.remove('active');
      });
      item.classList.add('active');
    });
  });
}

// Seek video to specific time
function seekVideo(seconds) {
  const video = document.querySelector('video');
  if (video) {
    video.currentTime = seconds;
  }
}

// Copy transcript to clipboard
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
  const contentEl = document.getElementById('yt-summarizer-summary-content');
  const summarizeBtn = document.getElementById('yt-summarizer-summarize-btn');

  // Check if transcript is loaded
  if (transcriptData.length === 0) {
    // Try to load first
    await loadTranscript();
    if (transcriptData.length === 0) {
      return;
    }
  }

  // Check API key
  const result = await chrome.storage.sync.get(['apiKey', 'apiProvider']);
  if (!result.apiKey) {
    contentEl.innerHTML = `
      <div class="yt-summarizer-error">
        <div class="yt-summarizer-error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <p class="yt-summarizer-error-message">API key not set<br>Please configure in extension settings</p>
      </div>
    `;
    return;
  }

  // Show loading
  summarizeBtn.disabled = true;
  contentEl.innerHTML = `
    <div class="yt-summarizer-loading">
      <div class="yt-summarizer-spinner"></div>
      <span class="yt-summarizer-loading-text">Generating summary...</span>
    </div>
  `;

  try {
    const transcript = transcriptData.map(item => `[${item.time}] ${item.text}`).join('\n');

    const response = await chrome.runtime.sendMessage({
      action: 'summarize',
      transcript: transcript
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
    contentEl.innerHTML = `
      <div class="yt-summarizer-error">
        <div class="yt-summarizer-error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <p class="yt-summarizer-error-message">${error.message}</p>
      </div>
    `;
  } finally {
    summarizeBtn.disabled = false;
  }
}

// Update summary UI
function updateSummaryUI(state) {
  const contentEl = document.getElementById('yt-summarizer-summary-content');

  if (state === 'empty' || !currentSummary) {
    contentEl.innerHTML = `
      <div class="yt-summarizer-empty">
        <div class="yt-summarizer-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 20V10"></path>
            <path d="M18 20V4"></path>
            <path d="M6 20v-4"></path>
          </svg>
        </div>
        <p class="yt-summarizer-empty-text">Click "Summarize" to<br>generate AI summary</p>
      </div>
    `;
    return;
  }

  if (state === 'success') {
    contentEl.innerHTML = parseMarkdown(currentSummary);
  }
}

// Copy summary to clipboard
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
  const notification = document.getElementById('yt-summarizer-notification');
  if (notification) {
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => {
      notification.classList.remove('show');
    }, 2000);
  }
}

// Parse markdown to HTML
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

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Cleanup
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

// ===== Transcript Extraction Functions =====

// Format time from seconds to MM:SS
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Get video ID from URL
function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

// Get transcript data as array
async function getTranscriptData() {
  const videoId = getVideoId();
  if (!videoId) {
    throw new Error('Video ID not found');
  }

  // Try multiple methods in order of reliability
  const methods = [
    { name: 'Innertube API', fn: () => getTranscriptFromInnertube(videoId) },
    { name: 'Page embedded data', fn: () => getTranscriptFromPage() },
    { name: 'YouTube API', fn: () => getTranscriptFromYouTubeAPI(videoId) },
    { name: 'Page refetch', fn: () => getTranscriptFromFetch(videoId) },
    { name: 'Transcript panel', fn: () => getTranscriptFromPanel() }
  ];

  for (const method of methods) {
    try {
      console.log(`[YouTube要約] ${method.name}で字幕を取得中...`);
      const data = await method.fn();
      if (data && data.length > 0) {
        console.log(`[YouTube要約] ${method.name}で${data.length}件の字幕を取得しました`);
        return data;
      }
    } catch (e) {
      console.log(`[YouTube要約] ${method.name}失敗:`, e.message);
    }
  }

  throw new Error('No subtitles available for this video. Please check if captions are enabled.');
}

// Fetch transcript as formatted string (for popup)
async function getTranscript() {
  const data = await getTranscriptData();
  const formattedTranscript = data.map(part => `[${part.time}] ${part.text}`).join('\n');

  const maxLength = 100000;
  if (formattedTranscript.length > maxLength) {
    return formattedTranscript.substring(0, maxLength) + '\n\n[Note: Transcript truncated due to length]';
  }

  return formattedTranscript;
}

// Method 0: Get transcript using YouTube's Innertube API (most reliable)
async function getTranscriptFromInnertube(videoId) {
  // First, get the video page to extract necessary tokens
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

  // Try to find serializedShareEntity for transcript
  const serializedMatch = pageHtml.match(/"serializedShareEntity":"([^"]+)"/);

  // Try to find engagement panel params
  const paramsMatch = pageHtml.match(/"params":"([^"]+)"[^}]*"targetId":"engagement-panel-searchable-transcript"/);

  // Method A: Use get_transcript endpoint if we have the params
  if (paramsMatch) {
    try {
      const transcriptResponse = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
          params: paramsMatch[1]
        })
      });

      if (transcriptResponse.ok) {
        const data = await transcriptResponse.json();
        const transcript = parseInnertubeTranscript(data);
        if (transcript && transcript.length > 0) {
          return transcript;
        }
      }
    } catch (e) {
      console.log('[YouTube要約] get_transcript API failed:', e.message);
    }
  }

  // Method B: Get captions from player endpoint
  try {
    const playerResponse = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
        console.log('[YouTube要約] Innertube player APIからcaptionTracks取得');
        return await fetchCaptionTrack(captions);
      }
    }
  } catch (e) {
    console.log('[YouTube要約] player API failed:', e.message);
  }

  return null;
}

// Parse transcript from innertube API response
function parseInnertubeTranscript(data) {
  try {
    const actions = data?.actions;
    if (!actions) return null;

    for (const action of actions) {
      const transcriptRenderer = action?.updateEngagementPanelAction?.content?.transcriptRenderer;
      const body = transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body;
      const segments = body?.transcriptSegmentListRenderer?.initialSegments;

      if (segments) {
        return segments.map(seg => {
          const segment = seg.transcriptSegmentRenderer;
          const startMs = parseInt(segment.startMs || '0');
          const text = segment.snippet?.runs?.map(r => r.text).join('') || '';
          return {
            time: formatTime(startMs / 1000),
            seconds: startMs / 1000,
            text: text.trim()
          };
        }).filter(item => item.text);
      }
    }
  } catch (e) {
    console.log('[YouTube要約] parseInnertubeTranscript error:', e.message);
  }
  return null;
}

// Method 5: Get transcript from the transcript panel UI
async function getTranscriptFromPanel() {
  // Try to open the transcript panel
  const moreButton = document.querySelector('button[aria-label="その他の操作"]') ||
                     document.querySelector('button[aria-label="More actions"]') ||
                     document.querySelector('#button[aria-label*="more"]') ||
                     document.querySelector('ytd-menu-renderer button');

  if (!moreButton) {
    console.log('[YouTube要約] More button not found');
    return null;
  }

  // Click the more button to open menu
  moreButton.click();
  await new Promise(resolve => setTimeout(resolve, 500));

  // Find and click "Show transcript" option
  const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item');
  let transcriptButton = null;

  for (const item of menuItems) {
    const text = item.textContent || '';
    if (text.includes('文字起こし') || text.includes('Transcript') || text.includes('字幕')) {
      transcriptButton = item;
      break;
    }
  }

  if (!transcriptButton) {
    // Close the menu
    document.body.click();
    console.log('[YouTube要約] Transcript menu item not found');
    return null;
  }

  transcriptButton.click();
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Extract transcript from the panel
  const transcriptPanel = document.querySelector('ytd-transcript-segment-list-renderer, ytd-transcript-renderer');
  if (!transcriptPanel) {
    console.log('[YouTube要約] Transcript panel not found');
    return null;
  }

  const segments = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
  if (segments.length === 0) {
    console.log('[YouTube要約] No transcript segments found');
    return null;
  }

  const transcriptData = [];
  segments.forEach(segment => {
    const timeEl = segment.querySelector('.segment-timestamp');
    const textEl = segment.querySelector('.segment-text');

    if (timeEl && textEl) {
      const timeText = timeEl.textContent.trim();
      const text = textEl.textContent.trim();

      // Parse time to seconds
      const timeParts = timeText.split(':').map(Number);
      let seconds = 0;
      if (timeParts.length === 2) {
        seconds = timeParts[0] * 60 + timeParts[1];
      } else if (timeParts.length === 3) {
        seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
      }

      if (text) {
        transcriptData.push({
          time: timeText,
          seconds: seconds,
          text: text
        });
      }
    }
  });

  return transcriptData;
}

// Method 1: Extract from page's embedded data (ytInitialPlayerResponse)
async function getTranscriptFromPage() {
  // Try to find ytInitialPlayerResponse in script tags
  const scripts = document.querySelectorAll('script');
  let playerResponse = null;

  for (const script of scripts) {
    const content = script.textContent || '';

    // Skip if no relevant content
    if (!content.includes('captions') && !content.includes('captionTracks')) {
      continue;
    }

    // Try different patterns - more comprehensive matching
    const patterns = [
      // Standard ytInitialPlayerResponse patterns
      /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;?\s*(?:var|let|const|<\/script|$)/s,
      /var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s,
      // Pattern with captions specifically
      /ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?"captionTracks"[\s\S]*?\})\s*;/,
      // Embedded in other variables
      /\{"captions":\{"playerCaptionsTracklistRenderer":\{"captionTracks":(\[[\s\S]*?\]),"audioTracks"/
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        try {
          // Handle array match (last pattern)
          if (match[1].startsWith('[')) {
            const captionTracks = JSON.parse(match[1]);
            if (captionTracks && captionTracks.length > 0) {
              console.log('[YouTube要約] captionTracksを直接抽出');
              return await fetchCaptionTrack(captionTracks);
            }
          } else {
            playerResponse = JSON.parse(match[1]);
            if (playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
              break;
            }
            playerResponse = null;
          }
        } catch (e) {
          // Try to extract just the captionTracks portion
          try {
            const captionMatch = content.match(/"captionTracks":\s*(\[[\s\S]*?\])(?=,"audioTracks"|,"translationLanguages"|,"|$)/);
            if (captionMatch) {
              const captionTracks = JSON.parse(captionMatch[1]);
              if (captionTracks && captionTracks.length > 0) {
                console.log('[YouTube要約] captionTracksを部分抽出');
                return await fetchCaptionTrack(captionTracks);
              }
            }
          } catch (e2) {
            continue;
          }
        }
      }
    }
    if (playerResponse) break;
  }

  if (!playerResponse) {
    // Try extracting captionTracks directly from any script
    for (const script of scripts) {
      const content = script.textContent || '';
      const captionMatch = content.match(/"captionTracks":\s*(\[[\s\S]*?\])(?=,"audioTracks"|,"translationLanguages"|,"defaultAudioTrackIndex")/);
      if (captionMatch) {
        try {
          const captionTracks = JSON.parse(captionMatch[1]);
          if (captionTracks && captionTracks.length > 0) {
            console.log('[YouTube要約] スクリプトからcaptionTracksを抽出');
            return await fetchCaptionTrack(captionTracks);
          }
        } catch (e) {
          continue;
        }
      }
    }
    return null;
  }

  return extractCaptionsFromResponse(playerResponse);
}

// Method 2: Get from YouTube's internal API
async function getTranscriptFromYouTubeAPI(videoId) {
  // Try to get player response from window object using multiple methods
  const result = await new Promise((resolve) => {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          var data = null;
          var captionTracks = null;

          // Method 1: ytInitialPlayerResponse
          if (typeof ytInitialPlayerResponse !== 'undefined' && ytInitialPlayerResponse) {
            data = ytInitialPlayerResponse;
          }

          // Method 2: ytplayer.config
          if (!data && typeof ytplayer !== 'undefined' && ytplayer && ytplayer.config) {
            if (ytplayer.config.args && ytplayer.config.args.player_response) {
              try {
                data = JSON.parse(ytplayer.config.args.player_response);
              } catch(e) {}
            }
          }

          // Method 3: movie_player element
          if (!data) {
            var player = document.getElementById('movie_player');
            if (player && player.getPlayerResponse) {
              try {
                data = player.getPlayerResponse();
              } catch(e) {}
            }
          }

          // Method 4: yt.config_
          if (!data && typeof yt !== 'undefined' && yt.config_ && yt.config_.PLAYER_VARS) {
            if (yt.config_.PLAYER_VARS.embedded_player_response) {
              try {
                data = JSON.parse(yt.config_.PLAYER_VARS.embedded_player_response);
              } catch(e) {}
            }
          }

          // Try to extract captionTracks from data
          if (data && data.captions && data.captions.playerCaptionsTracklistRenderer) {
            captionTracks = data.captions.playerCaptionsTracklistRenderer.captionTracks;
          }

          window.postMessage({
            type: 'YT_PLAYER_RESPONSE_V3',
            data: data,
            captionTracks: captionTracks
          }, '*');
        } catch(e) {
          window.postMessage({ type: 'YT_PLAYER_RESPONSE_V3', data: null, error: e.message }, '*');
        }
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();

    const handler = (event) => {
      if (event.data && event.data.type === 'YT_PLAYER_RESPONSE_V3') {
        window.removeEventListener('message', handler);
        resolve(event.data);
      }
    };
    window.addEventListener('message', handler);

    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, 3000);
  });

  if (!result) {
    return null;
  }

  // If we got captionTracks directly, use them
  if (result.captionTracks && result.captionTracks.length > 0) {
    console.log('[YouTube要約] APIからcaptionTracksを取得');
    return await fetchCaptionTrack(result.captionTracks);
  }

  // Otherwise try to extract from full response
  if (result.data) {
    return extractCaptionsFromResponse(result.data);
  }

  return null;
}

// Method 3: Fetch the page and extract captions
async function getTranscriptFromFetch(videoId) {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'Accept-Language': 'ja,en;q=0.9'
    }
  });
  const html = await response.text();

  // Try to find captionTracks in the HTML with multiple patterns
  const patterns = [
    /"captionTracks":\s*(\[[\s\S]*?\])(?=,"audioTracks")/,
    /"captionTracks":\s*(\[[\s\S]*?\])(?=,"translationLanguages")/,
    /"captionTracks":\s*(\[[\s\S]*?\])(?=,"defaultAudioTrackIndex")/,
    /"captionTracks":\s*(\[[\s\S]*?\])(?=,\s*")/,
    /"captions":\s*\{[\s\S]*?"captionTracks":\s*(\[[\s\S]*?\])/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        // Clean up the JSON string (remove any trailing incomplete data)
        let jsonStr = match[1];
        // Find the last complete object in the array
        let depth = 0;
        let lastValidEnd = 0;
        for (let i = 0; i < jsonStr.length; i++) {
          if (jsonStr[i] === '{' || jsonStr[i] === '[') depth++;
          if (jsonStr[i] === '}' || jsonStr[i] === ']') {
            depth--;
            if (depth === 0) lastValidEnd = i + 1;
          }
        }
        if (lastValidEnd > 0 && lastValidEnd < jsonStr.length) {
          jsonStr = jsonStr.substring(0, lastValidEnd);
        }

        const captionTracks = JSON.parse(jsonStr);
        if (captionTracks && captionTracks.length > 0) {
          console.log('[YouTube要約] ページ再取得からcaptionTracksを抽出');
          return await fetchCaptionTrack(captionTracks);
        }
      } catch (e) {
        console.log('[YouTube要約] キャプショントラックのパース失敗:', e.message);
      }
    }
  }

  // Try to find baseUrl directly
  const baseUrlMatch = html.match(/"baseUrl":\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
  if (baseUrlMatch) {
    try {
      const baseUrl = baseUrlMatch[1].replace(/\\u0026/g, '&');
      console.log('[YouTube要約] baseUrlを直接抽出');
      const transcriptResponse = await fetch(baseUrl);
      const xml = await transcriptResponse.text();
      return parseTranscriptXML(xml);
    } catch (e) {
      console.log('[YouTube要約] baseUrl取得失敗:', e.message);
    }
  }

  return null;
}

// Extract captions from player response
async function extractCaptionsFromResponse(playerResponse) {
  const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!captions || captions.length === 0) {
    return null;
  }

  return await fetchCaptionTrack(captions);
}

// Fetch caption track and parse
async function fetchCaptionTrack(captionTracks) {
  console.log(`[YouTube要約] 利用可能な字幕トラック: ${captionTracks.length}件`);
  captionTracks.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.languageCode} (${t.kind || 'manual'}) - ${t.name?.simpleText || t.name?.runs?.[0]?.text || 'unknown'}`);
  });

  // Priority order:
  // 1. Japanese manual captions
  // 2. Japanese auto-generated (asr)
  // 3. Japanese-JP variant
  // 4. English manual captions
  // 5. English auto-generated
  // 6. Any auto-generated captions
  // 7. First available track
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
    console.log('[YouTube要約] 適切な字幕トラックが見つかりません');
    return null;
  }

  // Get baseUrl - handle escaped URLs
  let baseUrl = selectedTrack.baseUrl;
  if (!baseUrl) {
    console.log('[YouTube要約] baseUrlがありません');
    return null;
  }

  // Unescape URL if needed
  baseUrl = baseUrl.replace(/\\u0026/g, '&');

  console.log(`[YouTube要約] 選択した字幕: ${selectedTrack.languageCode} (${selectedTrack.kind || 'manual'})`);

  try {
    const response = await fetch(baseUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const xml = await response.text();
    return parseTranscriptXML(xml);
  } catch (e) {
    console.log('[YouTube要約] 字幕取得エラー:', e.message);
    return null;
  }
}

// Parse YouTube's transcript XML format - returns array
function parseTranscriptXML(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const textElements = doc.querySelectorAll('text');

  if (textElements.length === 0) {
    // Check for parse error
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Invalid subtitle data format');
    }
    throw new Error('Subtitle data not found');
  }

  const transcriptParts = [];

  textElements.forEach((element) => {
    const start = parseFloat(element.getAttribute('start') || '0');
    let text = element.textContent || '';

    // Decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    text = textarea.value;

    // Clean up the text
    text = text
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

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

// Initialize
init();
