// Internationalization (i18n) support
const translations = {
  ja: {
    groups: 'グループ',
    selected: '選択中',
    deleteSelected: '選択を削除',
    ungroupSelected: '選択を解除',
    deleteAll: '全グループを削除',
    ungroupAll: '全グループを解除（タブは保持）',
    selectAll: '全選択',
    deselectAll: '選択解除',
    refresh: '更新',
    groupList: 'グループ一覧',
    noGroups: 'タブグループはありません',
    language: 'Language / 言語',
    ungroup: '解除',
    delete: '削除',
    tabs: 'タブ',
    unnamed: '(名前なし)',
    // Tab navigation
    currentGroups: '現在のグループ',
    savedGroups: '保存済みグループ',
    recentlyClosed: '履歴',
    // Saved groups tab
    savedGroupsCount: '保存済みグループ',
    deleteAllSaved: '全ての保存済みグループを削除',
    savedGroupsList: '保存されたタブグループ',
    noSavedGroups: '保存されたタブグループはありません',
    savedGroupsNote: '※ 「Tab Groups」「Acid Tabs」等の名前を含むフォルダのみを対象とします。通常のブックマークは削除されません。',
    savedGroupDeleted: '保存済みグループを削除しました',
    confirmDeleteAllSaved: '全ての保存済みグループを削除しますか？\nこの操作は取り消せません。',
    confirmDeleteSavedGroup: 'この保存済みグループを削除しますか？',
    // History tab
    sessions: 'セッション',
    clearRecentlyClosed: '最近閉じた履歴を削除',
    clearAllHistory: '全閲覧履歴を削除',
    recentlyClosedList: '最近閉じたタブ/ウィンドウ',
    noSessions: '最近閉じたセッションはありません',
    historyNote: '※ 履歴を削除すると、タブグループの復元履歴も削除されます。Chromeのパフォーマンス改善に役立ちます。',
    restore: '復元',
    tab: 'タブ',
    window: 'ウィンドウ',
    tabsCount: '{count}個のタブ',
    // Status messages
    deleted: '個のグループを削除しました',
    ungrouped: '個のグループを解除しました',
    refreshed: 'リストを更新しました',
    noGroupsToDelete: '削除するグループがありません',
    noGroupsToUngroup: '解除するグループがありません',
    deleteFailed: '削除に失敗しました',
    ungroupFailed: 'グループ解除に失敗しました',
    noSelection: '選択されていません',
    restored: '復元しました',
    restoreFailed: '復元に失敗しました',
    historyCleared: '履歴を削除しました',
    historyClearFailed: '履歴の削除に失敗しました',
    recentlyClosedCleared: '最近閉じた履歴を削除しました',
    // Confirm messages
    confirmDeleteAll: '個のグループ（合計 {tabs} タブ）を全て削除しますか？\nこの操作は取り消せません。',
    confirmUngroupAll: '個のグループを全て解除しますか？\nタブは閉じられずに残ります。',
    confirmDeleteGroup: 'グループ内の {tabs} 個のタブを閉じますか？',
    confirmDeleteSelected: '個の選択したグループを削除しますか？',
    confirmUngroupSelected: '個の選択したグループを解除しますか？',
    confirmClearRecentlyClosed: '最近閉じた履歴を削除しますか？\nこの操作は取り消せません。',
    confirmClearAllHistory: '全閲覧履歴を削除しますか？\nこの操作は取り消せません。'
  },
  en: {
    groups: 'groups',
    selected: 'selected',
    deleteSelected: 'Delete Selected',
    ungroupSelected: 'Ungroup Selected',
    deleteAll: 'Delete All Groups',
    ungroupAll: 'Ungroup All (Keep Tabs)',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    refresh: 'Refresh',
    groupList: 'Group List',
    noGroups: 'No tab groups',
    language: 'Language / 言語',
    ungroup: 'Ungroup',
    delete: 'Delete',
    tabs: 'tabs',
    unnamed: '(Unnamed)',
    // Tab navigation
    currentGroups: 'Current Groups',
    savedGroups: 'Saved Groups',
    recentlyClosed: 'History',
    // Saved groups tab
    savedGroupsCount: 'saved groups',
    deleteAllSaved: 'Delete All Saved Groups',
    savedGroupsList: 'Saved Tab Groups',
    noSavedGroups: 'No saved tab groups',
    savedGroupsNote: '* Only targets folders named "Tab Groups", "Acid Tabs", etc. Regular bookmarks are protected.',
    savedGroupDeleted: 'Saved group deleted',
    confirmDeleteAllSaved: 'Delete all saved groups?\nThis cannot be undone.',
    confirmDeleteSavedGroup: 'Delete this saved group?',
    // History tab
    sessions: 'sessions',
    clearRecentlyClosed: 'Clear Recently Closed',
    clearAllHistory: 'Clear All History',
    recentlyClosedList: 'Recently Closed Tabs/Windows',
    noSessions: 'No recently closed sessions',
    historyNote: '* Clearing history will remove tab group restore history and improve Chrome performance.',
    restore: 'Restore',
    tab: 'Tab',
    window: 'Window',
    tabsCount: '{count} tabs',
    // Status messages
    deleted: 'group(s) deleted',
    ungrouped: 'group(s) ungrouped',
    refreshed: 'List refreshed',
    noGroupsToDelete: 'No groups to delete',
    noGroupsToUngroup: 'No groups to ungroup',
    deleteFailed: 'Failed to delete',
    ungroupFailed: 'Failed to ungroup',
    noSelection: 'Nothing selected',
    restored: 'Restored',
    restoreFailed: 'Failed to restore',
    historyCleared: 'History cleared',
    historyClearFailed: 'Failed to clear history',
    recentlyClosedCleared: 'Recently closed history cleared',
    // Confirm messages
    confirmDeleteAll: 'Delete all {count} groups ({tabs} tabs total)?\nThis cannot be undone.',
    confirmUngroupAll: 'Ungroup all {count} groups?\nTabs will remain open.',
    confirmDeleteGroup: 'Close {tabs} tabs in this group?',
    confirmDeleteSelected: 'Delete {count} selected group(s)?',
    confirmUngroupSelected: 'Ungroup {count} selected group(s)?',
    confirmClearRecentlyClosed: 'Clear recently closed history?\nThis cannot be undone.',
    confirmClearAllHistory: 'Clear all browsing history?\nThis cannot be undone.'
  }
};

let currentLang = 'ja';

// Get translation
function t(key, params = {}) {
  let text = translations[currentLang][key] || translations['ja'][key] || key;

  // Replace parameters
  Object.keys(params).forEach(param => {
    text = text.replace(`{${param}}`, params[param]);
  });

  return text;
}

// Apply translations to all elements with data-i18n attribute
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  // Update HTML lang attribute
  document.documentElement.lang = currentLang;
}

// Set language
function setLanguage(lang) {
  currentLang = lang;
  applyTranslations();

  // Save to storage
  if (chrome.storage) {
    chrome.storage.local.set({ language: lang });
  }
}

// Load saved language
async function loadLanguage() {
  if (chrome.storage) {
    try {
      const result = await chrome.storage.local.get('language');
      if (result.language) {
        currentLang = result.language;
        document.getElementById('languageSelect').value = currentLang;
      }
    } catch (e) {
      console.log('Storage not available, using default language');
    }
  }
  applyTranslations();
}

// Initialize
loadLanguage();
