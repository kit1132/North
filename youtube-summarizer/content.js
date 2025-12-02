// YouTube Transcript Extractor
// This script extracts transcript/subtitle data from YouTube videos

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
    return true; // Required for async response
  }
});

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

// Fetch transcript data from YouTube's internal API
async function getTranscript() {
  const videoId = getVideoId();
  if (!videoId) {
    throw new Error('動画IDが見つかりません');
  }

  try {
    // Method 1: Try to get from ytInitialPlayerResponse
    const transcript = await getTranscriptFromPage();
    if (transcript) {
      return transcript;
    }
  } catch (e) {
    console.log('Method 1 failed, trying alternative methods...');
  }

  try {
    // Method 2: Try to get from API
    const transcript = await getTranscriptFromAPI(videoId);
    if (transcript) {
      return transcript;
    }
  } catch (e) {
    console.log('Method 2 failed:', e.message);
  }

  throw new Error('この動画には字幕がありません');
}

// Method 1: Extract from page's embedded data
async function getTranscriptFromPage() {
  // Find ytInitialPlayerResponse in the page
  const scripts = document.querySelectorAll('script');
  let playerResponse = null;

  for (const script of scripts) {
    const content = script.textContent;
    if (content.includes('ytInitialPlayerResponse')) {
      const match = content.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
      if (match) {
        try {
          playerResponse = JSON.parse(match[1]);
          break;
        } catch (e) {
          continue;
        }
      }
    }
  }

  // Also try to get from window object via injection
  if (!playerResponse) {
    playerResponse = await new Promise((resolve) => {
      const script = document.createElement('script');
      script.textContent = `
        window.postMessage({
          type: 'YT_PLAYER_RESPONSE',
          data: typeof ytInitialPlayerResponse !== 'undefined' ? ytInitialPlayerResponse : null
        }, '*');
      `;
      document.documentElement.appendChild(script);
      script.remove();

      const handler = (event) => {
        if (event.data && event.data.type === 'YT_PLAYER_RESPONSE') {
          window.removeEventListener('message', handler);
          resolve(event.data.data);
        }
      };
      window.addEventListener('message', handler);

      // Timeout after 2 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 2000);
    });
  }

  if (!playerResponse) {
    return null;
  }

  // Get caption tracks
  const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!captions || captions.length === 0) {
    return null;
  }

  // Prefer Japanese, then auto-generated, then first available
  let selectedTrack = captions.find(t => t.languageCode === 'ja') ||
                      captions.find(t => t.languageCode === 'ja-JP') ||
                      captions.find(t => t.kind === 'asr') ||
                      captions[0];

  if (!selectedTrack || !selectedTrack.baseUrl) {
    return null;
  }

  // Fetch the transcript XML
  const response = await fetch(selectedTrack.baseUrl);
  const xml = await response.text();

  return parseTranscriptXML(xml);
}

// Method 2: Get transcript via YouTube's timedtext API
async function getTranscriptFromAPI(videoId) {
  // Try to get video info
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
  const html = await response.text();

  // Extract caption track URLs
  const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
  if (!captionMatch) {
    return null;
  }

  let captionTracks;
  try {
    captionTracks = JSON.parse(captionMatch[1]);
  } catch (e) {
    return null;
  }

  if (!captionTracks || captionTracks.length === 0) {
    return null;
  }

  // Select best track (prefer Japanese)
  let selectedTrack = captionTracks.find(t => t.languageCode === 'ja') ||
                      captionTracks.find(t => t.languageCode === 'ja-JP') ||
                      captionTracks.find(t => t.kind === 'asr') ||
                      captionTracks[0];

  if (!selectedTrack || !selectedTrack.baseUrl) {
    return null;
  }

  // Fetch transcript
  const transcriptResponse = await fetch(selectedTrack.baseUrl);
  const xml = await transcriptResponse.text();

  return parseTranscriptXML(xml);
}

// Parse YouTube's transcript XML format
function parseTranscriptXML(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const textElements = doc.querySelectorAll('text');

  if (textElements.length === 0) {
    throw new Error('字幕データが見つかりません');
  }

  const transcriptParts = [];

  textElements.forEach((element) => {
    const start = parseFloat(element.getAttribute('start'));
    const text = element.textContent
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\n/g, ' ')
      .trim();

    if (text) {
      transcriptParts.push({
        time: formatTime(start),
        seconds: start,
        text: text
      });
    }
  });

  // Combine transcript with timestamps
  const formattedTranscript = transcriptParts
    .map(part => `[${part.time}] ${part.text}`)
    .join('\n');

  // Check if transcript is too long (limit to ~100k characters for API)
  const maxLength = 100000;
  if (formattedTranscript.length > maxLength) {
    // Truncate and add note
    return formattedTranscript.substring(0, maxLength) + '\n\n[注: トランスクリプトが長いため、一部省略されています]';
  }

  return formattedTranscript;
}
