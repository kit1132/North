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
    // Status messages
    deleted: '個のグループを削除しました',
    ungrouped: '個のグループを解除しました',
    refreshed: 'リストを更新しました',
    noGroupsToDelete: '削除するグループがありません',
    noGroupsToUngroup: '解除するグループがありません',
    deleteFailed: '削除に失敗しました',
    ungroupFailed: 'グループ解除に失敗しました',
    noSelection: '選択されていません',
    // Confirm messages
    confirmDeleteAll: '個のグループ（合計 {tabs} タブ）を全て削除しますか？\nこの操作は取り消せません。',
    confirmUngroupAll: '個のグループを全て解除しますか？\nタブは閉じられずに残ります。',
    confirmDeleteGroup: 'グループ内の {tabs} 個のタブを閉じますか？',
    confirmDeleteSelected: '個の選択したグループを削除しますか？',
    confirmUngroupSelected: '個の選択したグループを解除しますか？'
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
    // Status messages
    deleted: 'group(s) deleted',
    ungrouped: 'group(s) ungrouped',
    refreshed: 'List refreshed',
    noGroupsToDelete: 'No groups to delete',
    noGroupsToUngroup: 'No groups to ungroup',
    deleteFailed: 'Failed to delete',
    ungroupFailed: 'Failed to ungroup',
    noSelection: 'Nothing selected',
    // Confirm messages
    confirmDeleteAll: 'Delete all {count} groups ({tabs} tabs total)?\nThis cannot be undone.',
    confirmUngroupAll: 'Ungroup all {count} groups?\nTabs will remain open.',
    confirmDeleteGroup: 'Close {tabs} tabs in this group?',
    confirmDeleteSelected: 'Delete {count} selected group(s)?',
    confirmUngroupSelected: 'Ungroup {count} selected group(s)?'
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
