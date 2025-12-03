// DOM elements
const groupCountEl = document.getElementById('groupCount');
const groupListEl = document.getElementById('groupList');
const emptyMessageEl = document.getElementById('emptyMessage');
const statusEl = document.getElementById('status');
const deleteAllBtn = document.getElementById('deleteAllGroups');
const ungroupAllBtn = document.getElementById('ungroupAllTabs');
const refreshBtn = document.getElementById('refreshList');

// Show status message
function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = 'status ' + (isError ? 'error' : 'success');
  setTimeout(() => {
    statusEl.className = 'status';
  }, 3000);
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

  const groupName = group.title || '(名前なし)';

  item.innerHTML = `
    <div class="group-info">
      <div class="group-color color-${group.color}"></div>
      <span class="group-name" title="${groupName}">${groupName}</span>
      <span class="group-tab-count">${tabCount} タブ</span>
    </div>
    <div class="group-actions">
      <button class="btn btn-warning btn-sm ungroup-btn" title="グループ解除">解除</button>
      <button class="btn btn-danger btn-sm delete-btn" title="削除">削除</button>
    </div>
  `;

  // Add event listeners
  item.querySelector('.delete-btn').addEventListener('click', async () => {
    if (confirm(`"${groupName}" グループ内の ${tabCount} 個のタブを閉じますか？`)) {
      const success = await deleteGroup(group.id);
      if (success) {
        showStatus(`"${groupName}" を削除しました`);
        loadGroups();
      } else {
        showStatus('削除に失敗しました', true);
      }
    }
  });

  item.querySelector('.ungroup-btn').addEventListener('click', async () => {
    const success = await ungroupTabs(group.id);
    if (success) {
      showStatus(`"${groupName}" のグループを解除しました`);
      loadGroups();
    } else {
      showStatus('グループ解除に失敗しました', true);
    }
  });

  return item;
}

// Load and display all groups
async function loadGroups() {
  const groups = await getTabGroups();

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
}

// Delete all groups
async function deleteAllGroups() {
  const groups = await getTabGroups();

  if (groups.length === 0) {
    showStatus('削除するグループがありません');
    return;
  }

  const totalTabs = await Promise.all(
    groups.map(g => getTabsInGroup(g.id))
  ).then(results => results.reduce((sum, tabs) => sum + tabs.length, 0));

  if (!confirm(`${groups.length} 個のグループ（合計 ${totalTabs} タブ）を全て削除しますか？\nこの操作は取り消せません。`)) {
    return;
  }

  let deleted = 0;
  for (const group of groups) {
    const success = await deleteGroup(group.id);
    if (success) deleted++;
  }

  showStatus(`${deleted} 個のグループを削除しました`);
  loadGroups();
}

// Ungroup all tabs
async function ungroupAllTabs() {
  const groups = await getTabGroups();

  if (groups.length === 0) {
    showStatus('解除するグループがありません');
    return;
  }

  if (!confirm(`${groups.length} 個のグループを全て解除しますか？\nタブは閉じられずに残ります。`)) {
    return;
  }

  let ungrouped = 0;
  for (const group of groups) {
    const success = await ungroupTabs(group.id);
    if (success) ungrouped++;
  }

  showStatus(`${ungrouped} 個のグループを解除しました`);
  loadGroups();
}

// Event listeners
deleteAllBtn.addEventListener('click', deleteAllGroups);
ungroupAllBtn.addEventListener('click', ungroupAllTabs);
refreshBtn.addEventListener('click', () => {
  loadGroups();
  showStatus('リストを更新しました');
});

// Initial load
loadGroups();
