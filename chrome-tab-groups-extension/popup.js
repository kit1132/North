// DOM elements - Current Groups Tab
const groupCountEl = document.getElementById('groupCount');
const groupListEl = document.getElementById('groupList');
const emptyMessageEl = document.getElementById('emptyMessage');
const statusEl = document.getElementById('status');
const deleteAllBtn = document.getElementById('deleteAllGroups');
const ungroupAllBtn = document.getElementById('ungroupAllTabs');
const refreshBtn = document.getElementById('refreshList');
const selectAllBtn = document.getElementById('selectAll');
const deselectAllBtn = document.getElementById('deselectAll');
const selectionActionsEl = document.getElementById('selectionActions');
const selectedCountEl = document.getElementById('selectedCount');
const deleteSelectedBtn = document.getElementById('deleteSelected');
const ungroupSelectedBtn = document.getElementById('ungroupSelected');
const settingsToggleBtn = document.getElementById('settingsToggle');
const settingsPanelEl = document.getElementById('settingsPanel');
const languageSelectEl = document.getElementById('languageSelect');

// DOM elements - History Tab
const sessionCountEl = document.getElementById('sessionCount');
const sessionListEl = document.getElementById('sessionList');
const emptySessionMessageEl = document.getElementById('emptySessionMessage');
const clearHistoryBtn = document.getElementById('clearHistory');
const refreshHistoryBtn = document.getElementById('refreshHistory');

// DOM elements - Tab navigation
const tabBtns = document.querySelectorAll('.tab-btn');
const currentTabEl = document.getElementById('currentTab');
const historyTabEl = document.getElementById('historyTab');

// State
let selectedGroups = new Set();
let groupsData = [];
let sessionsData = [];

// Show status message
function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = 'status ' + (isError ? 'error' : 'success');
  setTimeout(() => {
    statusEl.className = 'status';
  }, 3000);
}

// Tab navigation
function switchTab(tabName) {
  tabBtns.forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (tabName === 'current') {
    currentTabEl.classList.add('active');
    historyTabEl.classList.remove('active');
    loadGroups();
  } else {
    currentTabEl.classList.remove('active');
    historyTabEl.classList.add('active');
    loadSessions();
  }
}

// Update selection UI
function updateSelectionUI() {
  const count = selectedGroups.size;
  selectedCountEl.textContent = count;

  if (count > 0) {
    selectionActionsEl.style.display = 'flex';
  } else {
    selectionActionsEl.style.display = 'none';
  }

  // Update checkbox states
  document.querySelectorAll('.group-checkbox').forEach(checkbox => {
    const groupId = parseInt(checkbox.dataset.groupId);
    checkbox.checked = selectedGroups.has(groupId);

    const item = checkbox.closest('.group-item');
    if (selectedGroups.has(groupId)) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

// Get all tab groups
async function getTabGroups() {
  try {
    const groups = await chrome.tabGroups.query({});
    return groups;
  } catch (error) {
    console.error('Failed to get tab groups:', error);
    return [];
  }
}

// Get tabs in a specific group
async function getTabsInGroup(groupId) {
  try {
    const tabs = await chrome.tabs.query({ groupId: groupId });
    return tabs;
  } catch (error) {
    console.error('Failed to get tabs in group:', error);
    return [];
  }
}

// Delete a tab group (closes all tabs in the group)
async function deleteGroup(groupId) {
  try {
    const tabs = await getTabsInGroup(groupId);
    const tabIds = tabs.map(tab => tab.id);
    if (tabIds.length > 0) {
      await chrome.tabs.remove(tabIds);
    }
    return true;
  } catch (error) {
    console.error('Failed to delete group:', error);
    return false;
  }
}

// Ungroup tabs (remove from group but keep tabs open)
async function ungroupTabs(groupId) {
  try {
    const tabs = await getTabsInGroup(groupId);
    const tabIds = tabs.map(tab => tab.id);
    if (tabIds.length > 0) {
      await chrome.tabs.ungroup(tabIds);
    }
    return true;
  } catch (error) {
    console.error('Failed to ungroup tabs:', error);
    return false;
  }
}

// Render a single group item
function renderGroupItem(group, tabCount) {
  const item = document.createElement('div');
  item.className = `group-item border-${group.color}`;
  item.dataset.groupId = group.id;

  const groupName = group.title || t('unnamed');

  item.innerHTML = `
    <input type="checkbox" class="group-checkbox" data-group-id="${group.id}">
    <div class="group-info">
      <div class="group-color color-${group.color}"></div>
      <span class="group-name" title="${groupName}">${groupName}</span>
      <span class="group-tab-count">${tabCount} ${t('tabs')}</span>
    </div>
    <div class="group-actions">
      <button class="btn btn-warning btn-sm ungroup-btn" title="${t('ungroup')}">${t('ungroup')}</button>
      <button class="btn btn-danger btn-sm delete-btn" title="${t('delete')}">${t('delete')}</button>
    </div>
  `;

  // Checkbox event
  const checkbox = item.querySelector('.group-checkbox');
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      selectedGroups.add(group.id);
    } else {
      selectedGroups.delete(group.id);
    }
    updateSelectionUI();
  });

  // Click on group info to toggle selection
  item.querySelector('.group-info').addEventListener('click', () => {
    checkbox.checked = !checkbox.checked;
    if (checkbox.checked) {
      selectedGroups.add(group.id);
    } else {
      selectedGroups.delete(group.id);
    }
    updateSelectionUI();
  });

  // Add event listeners for buttons
  item.querySelector('.delete-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm(t('confirmDeleteGroup', { tabs: tabCount }).replace('{name}', `"${groupName}"`))) {
      const success = await deleteGroup(group.id);
      if (success) {
        showStatus(`"${groupName}" ${t('deleted').replace(/^\d+/, '').trim()}`);
        selectedGroups.delete(group.id);
        loadGroups();
      } else {
        showStatus(t('deleteFailed'), true);
      }
    }
  });

  item.querySelector('.ungroup-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const success = await ungroupTabs(group.id);
    if (success) {
      showStatus(`"${groupName}" ${t('ungrouped').replace(/^\d+/, '').trim()}`);
      selectedGroups.delete(group.id);
      loadGroups();
    } else {
      showStatus(t('ungroupFailed'), true);
    }
  });

  // Check if already selected
  if (selectedGroups.has(group.id)) {
    checkbox.checked = true;
    item.classList.add('selected');
  }

  return item;
}

// Load and display all groups
async function loadGroups() {
  const groups = await getTabGroups();
  groupsData = groups;

  // Clean up selected groups that no longer exist
  const existingIds = new Set(groups.map(g => g.id));
  selectedGroups = new Set([...selectedGroups].filter(id => existingIds.has(id)));

  groupCountEl.textContent = groups.length;
  groupListEl.innerHTML = '';

  if (groups.length === 0) {
    emptyMessageEl.style.display = 'block';
    groupListEl.style.display = 'none';
  } else {
    emptyMessageEl.style.display = 'none';
    groupListEl.style.display = 'flex';

    for (const group of groups) {
      const tabs = await getTabsInGroup(group.id);
      const item = renderGroupItem(group, tabs.length);
      groupListEl.appendChild(item);
    }
  }

  updateSelectionUI();
}

// Delete all groups
async function deleteAllGroups() {
  const groups = await getTabGroups();

  if (groups.length === 0) {
    showStatus(t('noGroupsToDelete'));
    return;
  }

  const totalTabs = await Promise.all(
    groups.map(g => getTabsInGroup(g.id))
  ).then(results => results.reduce((sum, tabs) => sum + tabs.length, 0));

  const message = t('confirmDeleteAll', { count: groups.length, tabs: totalTabs });
  if (!confirm(message)) {
    return;
  }

  let deleted = 0;
  for (const group of groups) {
    const success = await deleteGroup(group.id);
    if (success) deleted++;
  }

  selectedGroups.clear();
  showStatus(`${deleted} ${t('deleted')}`);
  loadGroups();
}

// Ungroup all tabs
async function ungroupAllTabs() {
  const groups = await getTabGroups();

  if (groups.length === 0) {
    showStatus(t('noGroupsToUngroup'));
    return;
  }

  const message = t('confirmUngroupAll', { count: groups.length });
  if (!confirm(message)) {
    return;
  }

  let ungrouped = 0;
  for (const group of groups) {
    const success = await ungroupTabs(group.id);
    if (success) ungrouped++;
  }

  selectedGroups.clear();
  showStatus(`${ungrouped} ${t('ungrouped')}`);
  loadGroups();
}

// Delete selected groups
async function deleteSelectedGroups() {
  if (selectedGroups.size === 0) {
    showStatus(t('noSelection'));
    return;
  }

  const message = t('confirmDeleteSelected', { count: selectedGroups.size });
  if (!confirm(message)) {
    return;
  }

  let deleted = 0;
  for (const groupId of selectedGroups) {
    const success = await deleteGroup(groupId);
    if (success) deleted++;
  }

  selectedGroups.clear();
  showStatus(`${deleted} ${t('deleted')}`);
  loadGroups();
}

// Ungroup selected groups
async function ungroupSelectedGroups() {
  if (selectedGroups.size === 0) {
    showStatus(t('noSelection'));
    return;
  }

  const message = t('confirmUngroupSelected', { count: selectedGroups.size });
  if (!confirm(message)) {
    return;
  }

  let ungrouped = 0;
  for (const groupId of selectedGroups) {
    const success = await ungroupTabs(groupId);
    if (success) ungrouped++;
  }

  selectedGroups.clear();
  showStatus(`${ungrouped} ${t('ungrouped')}`);
  loadGroups();
}

// Select all groups
function selectAllGroups() {
  groupsData.forEach(group => {
    selectedGroups.add(group.id);
  });
  updateSelectionUI();
}

// Deselect all groups
function deselectAllGroups() {
  selectedGroups.clear();
  updateSelectionUI();
}

// Toggle settings panel
function toggleSettings() {
  if (settingsPanelEl.style.display === 'none') {
    settingsPanelEl.style.display = 'block';
  } else {
    settingsPanelEl.style.display = 'none';
  }
}

// ==================== Sessions (History Tab) ====================

// Get recently closed sessions
async function getRecentlyClosed() {
  try {
    const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
    return sessions;
  } catch (error) {
    console.error('Failed to get recently closed sessions:', error);
    return [];
  }
}

// Restore a session (tab or window)
async function restoreSession(sessionId) {
  try {
    await chrome.sessions.restore(sessionId);
    return true;
  } catch (error) {
    console.error('Failed to restore session:', error);
    return false;
  }
}

// Render a session item
function renderSessionItem(session) {
  const item = document.createElement('div');

  if (session.tab) {
    // Single tab
    const tab = session.tab;
    item.className = 'session-item session-tab';

    const faviconUrl = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect fill="%23ddd" width="16" height="16" rx="2"/></svg>';

    item.innerHTML = `
      <div class="session-icon">
        <img src="${faviconUrl}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><rect fill=%22%23ddd%22 width=%2216%22 height=%2216%22 rx=%222%22/></svg>'">
      </div>
      <div class="session-info">
        <span class="session-title" title="${tab.title || ''}">${tab.title || t('unnamed')}</span>
        <span class="session-url" title="${tab.url || ''}">${tab.url || ''}</span>
      </div>
      <span class="session-type">${t('tab')}</span>
      <div class="session-actions">
        <button class="btn btn-success btn-sm restore-btn">${t('restore')}</button>
      </div>
    `;

    item.querySelector('.restore-btn').addEventListener('click', async () => {
      const success = await restoreSession(session.tab.sessionId);
      if (success) {
        showStatus(t('restored'));
        loadSessions();
      } else {
        showStatus(t('restoreFailed'), true);
      }
    });
  } else if (session.window) {
    // Window with multiple tabs
    const win = session.window;
    const tabCount = win.tabs ? win.tabs.length : 0;
    item.className = 'session-item session-window';

    item.innerHTML = `
      <div class="session-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="#28a745">
          <rect x="1" y="3" width="14" height="10" rx="1" stroke="#28a745" stroke-width="1.5" fill="none"/>
          <rect x="1" y="3" width="14" height="3" fill="#28a745"/>
        </svg>
      </div>
      <div class="session-info">
        <span class="session-title">${t('window')}</span>
        <span class="session-url">${t('tabsCount', { count: tabCount })}</span>
      </div>
      <span class="session-type">${t('window')}</span>
      <div class="session-actions">
        <button class="btn btn-success btn-sm restore-btn">${t('restore')}</button>
      </div>
    `;

    item.querySelector('.restore-btn').addEventListener('click', async () => {
      const success = await restoreSession(session.window.sessionId);
      if (success) {
        showStatus(t('restored'));
        loadSessions();
      } else {
        showStatus(t('restoreFailed'), true);
      }
    });
  }

  return item;
}

// Load and display recently closed sessions
async function loadSessions() {
  const sessions = await getRecentlyClosed();
  sessionsData = sessions;

  sessionCountEl.textContent = sessions.length;
  sessionListEl.innerHTML = '';

  if (sessions.length === 0) {
    emptySessionMessageEl.style.display = 'block';
    sessionListEl.style.display = 'none';
  } else {
    emptySessionMessageEl.style.display = 'none';
    sessionListEl.style.display = 'flex';

    for (const session of sessions) {
      const item = renderSessionItem(session);
      if (item.innerHTML) {
        sessionListEl.appendChild(item);
      }
    }
  }
}

// Clear browsing history (this will clear recently closed tabs)
async function clearBrowsingHistory() {
  if (!confirm(t('confirmClearHistory'))) {
    return;
  }

  try {
    // Open Chrome's clear browsing data page
    await chrome.tabs.create({ url: 'chrome://settings/clearBrowserData' });
    showStatus(t('historyCleared'));
  } catch (error) {
    console.error('Failed to open clear history page:', error);
    showStatus(t('historyClearFailed'), true);
  }
}

// ==================== Event Listeners ====================

// Tab navigation
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
  });
});

// Current Groups Tab
deleteAllBtn.addEventListener('click', deleteAllGroups);
ungroupAllBtn.addEventListener('click', ungroupAllTabs);
refreshBtn.addEventListener('click', () => {
  loadGroups();
  showStatus(t('refreshed'));
});
selectAllBtn.addEventListener('click', selectAllGroups);
deselectAllBtn.addEventListener('click', deselectAllGroups);
deleteSelectedBtn.addEventListener('click', deleteSelectedGroups);
ungroupSelectedBtn.addEventListener('click', ungroupSelectedGroups);

// History Tab
clearHistoryBtn.addEventListener('click', clearBrowsingHistory);
refreshHistoryBtn.addEventListener('click', () => {
  loadSessions();
  showStatus(t('refreshed'));
});

// Settings
settingsToggleBtn.addEventListener('click', toggleSettings);

// Language change event
languageSelectEl.addEventListener('change', (e) => {
  setLanguage(e.target.value);
  // Reload current tab content
  if (currentTabEl.classList.contains('active')) {
    loadGroups();
  } else {
    loadSessions();
  }
});

// Initial load
loadGroups();
