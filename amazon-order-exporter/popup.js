/**
 * Amazon Order Exporter - Popup Script
 * 拡張機能ポップアップのメインロジック
 */

(function() {
  'use strict';

  // ============================================================================
  // 定数定義
  // ============================================================================

  const Config = Object.freeze({
    YEAR_RANGE: 5,
    ORDER_HISTORY_BASE_URL: 'https://www.amazon.co.jp/gp/your-account/order-history',
    PAGE_LOAD_TIMEOUT: 30000,
    PAGE_NAVIGATION_DELAY_MIN: 2000,
    PAGE_NAVIGATION_DELAY_MAX: 4000,
    COPY_BUTTON_RESET_DELAY: 2000
  });

  const ErrorTypes = Object.freeze({
    LOGIN_REQUIRED: 'LOGIN_REQUIRED',
    EXTRACTION_ERROR: 'EXTRACTION_ERROR',
    CLIPBOARD_ERROR: 'CLIPBOARD_ERROR'
  });

  const ErrorMessages = Object.freeze({
    [ErrorTypes.LOGIN_REQUIRED]: 'ログインが必要です。Amazonにログインしてから再度お試しください。',
    [ErrorTypes.EXTRACTION_ERROR]: '注文データの抽出に失敗しました。',
    [ErrorTypes.CLIPBOARD_ERROR]: 'クリップボードへのコピーに失敗しました。'
  });

  const StatusTypes = Object.freeze({
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
  });

  // ============================================================================
  // DOM要素参照
  // ============================================================================

  const Elements = {
    yearSelect: null,
    monthSelect: null,
    monthGroup: null,
    exportBtn: null,
    copyBtn: null,
    progressContainer: null,
    progressFill: null,
    progressText: null,
    resultContainer: null,
    orderCount: null,
    totalSpent: null,
    statusMessage: null
  };

  // ============================================================================
  // アプリケーション状態
  // ============================================================================

  const State = {
    orders: [],
    csvContent: '',
    isExporting: false,
    selectedYear: null,
    selectedMonth: null,  // null = 年全体, 1-12 = 特定月
    periodType: 'year'    // 'year' または 'month'
  };

  // ============================================================================
  // ユーティリティ関数
  // ============================================================================

  function safeGetElement(id) {
    try {
      return document.getElementById(id);
    } catch (error) {
      return null;
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  }

  function isValidYear(year) {
    const numYear = parseInt(year, 10);
    const currentYear = new Date().getFullYear();
    return !Number.isNaN(numYear) && numYear >= 2000 && numYear <= currentYear;
  }

  function escapeCSV(str) {
    if (str == null) return '';
    const strValue = String(str);
    if (strValue.includes(',') || strValue.includes('"') ||
        strValue.includes('\n') || strValue.includes('\r')) {
      return `"${strValue.replace(/"/g, '""')}"`;
    }
    return strValue;
  }

  function formatPrice(amount) {
    if (typeof amount !== 'number' || Number.isNaN(amount)) return '0';
    return Math.max(0, Math.floor(amount)).toLocaleString('ja-JP');
  }

  /**
   * 注文データを月でフィルタリング
   * @param {Array} orders - 注文データ
   * @param {number} year - 年
   * @param {number} month - 月 (1-12)
   * @returns {Array} フィルタされた注文データ
   */
  function filterOrdersByMonth(orders, year, month) {
    if (!Array.isArray(orders) || !month) return orders;

    const targetPrefix = `${year}-${String(month).padStart(2, '0')}`;

    return orders.filter(order => {
      if (!order.date || typeof order.date !== 'string') return false;
      return order.date.startsWith(targetPrefix);
    });
  }

  // ============================================================================
  // DOM要素初期化
  // ============================================================================

  function initializeElements() {
    const elementIds = [
      'yearSelect', 'monthSelect', 'monthGroup',
      'exportBtn', 'copyBtn',
      'progressContainer', 'progressFill', 'progressText',
      'resultContainer', 'orderCount', 'totalSpent',
      'statusMessage'
    ];

    elementIds.forEach(id => {
      Elements[id] = safeGetElement(id);
    });

    // 必須要素のチェック
    return Elements.yearSelect && Elements.exportBtn;
  }

  // ============================================================================
  // UI操作関数
  // ============================================================================

  function populateYearSelect() {
    if (!Elements.yearSelect) return;

    const currentYear = new Date().getFullYear();
    Elements.yearSelect.innerHTML = '';

    for (let i = 0; i < Config.YEAR_RANGE; i++) {
      const year = currentYear - i;
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = `${year}年`;
      Elements.yearSelect.appendChild(option);
    }

    State.selectedYear = currentYear;
  }

  function setCurrentMonth() {
    // 現在の月をデフォルトで選択
    if (Elements.monthSelect) {
      const currentMonth = new Date().getMonth() + 1;
      Elements.monthSelect.value = String(currentMonth);
      State.selectedMonth = currentMonth;
    }
  }

  function toggleMonthSelect(show) {
    if (Elements.monthGroup) {
      Elements.monthGroup.style.display = show ? 'block' : 'none';
    }
  }

  function setExportLoading(loading) {
    State.isExporting = loading;
    if (!Elements.exportBtn) return;

    Elements.exportBtn.disabled = loading;
    const btnText = Elements.exportBtn.querySelector('.btn-text');
    const btnLoading = Elements.exportBtn.querySelector('.btn-loading');

    if (btnText) btnText.style.display = loading ? 'none' : 'inline';
    if (btnLoading) btnLoading.style.display = loading ? 'inline' : 'none';
  }

  function showProgress() {
    if (!Elements.progressContainer || !Elements.progressFill) return;
    Elements.progressContainer.style.display = 'block';
    Elements.progressContainer.classList.add('fade-in');
    Elements.progressFill.classList.add('indeterminate');
  }

  function hideProgress() {
    if (!Elements.progressContainer || !Elements.progressFill) return;
    Elements.progressContainer.style.display = 'none';
    Elements.progressFill.classList.remove('indeterminate');
  }

  function updateProgress(data) {
    if (!Elements.progressText) return;
    let message = data.status || '取得中...';
    if (typeof data.ordersCount === 'number' && data.ordersCount >= 0) {
      message = `${data.status || '取得中...'} (${data.ordersCount}件取得済み)`;
    }
    Elements.progressText.textContent = message;
  }

  function showResult(orders) {
    if (!Elements.resultContainer || !Elements.orderCount ||
        !Elements.totalSpent || !Elements.copyBtn) return;

    if (!Array.isArray(orders)) return;

    const total = orders.reduce((sum, order) => {
      const price = typeof order.price === 'number' ? order.price : 0;
      const quantity = typeof order.quantity === 'number' ? order.quantity : 1;
      return sum + (price * quantity);
    }, 0);

    Elements.orderCount.textContent = String(orders.length);
    Elements.totalSpent.textContent = formatPrice(total);
    Elements.resultContainer.style.display = 'block';
    Elements.resultContainer.classList.add('fade-in');
    Elements.copyBtn.disabled = false;
  }

  function hideResult() {
    if (Elements.resultContainer) Elements.resultContainer.style.display = 'none';
  }

  function showStatus(type, message) {
    if (!Elements.statusMessage) return;
    const validTypes = Object.values(StatusTypes);
    const statusType = validTypes.includes(type) ? type : StatusTypes.INFO;
    Elements.statusMessage.textContent = message;
    Elements.statusMessage.className = `status-message ${statusType} fade-in`;
    Elements.statusMessage.style.display = 'block';
  }

  function hideStatus() {
    if (Elements.statusMessage) Elements.statusMessage.style.display = 'none';
  }

  // ============================================================================
  // タブ操作
  // ============================================================================

  async function getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab || null;
    } catch (error) {
      return null;
    }
  }

  async function checkCurrentTab() {
    try {
      const tab = await getCurrentTab();

      if (!tab || !tab.url) {
        showStatus(StatusTypes.WARNING, 'タブ情報を取得できませんでした。');
        if (Elements.exportBtn) Elements.exportBtn.disabled = true;
        return;
      }

      if (!tab.url.includes('amazon.co.jp')) {
        showStatus(StatusTypes.WARNING, 'Amazon.co.jpのページで実行してください。');
        if (Elements.exportBtn) Elements.exportBtn.disabled = true;
        return;
      }

      const isOrderPage = tab.url.includes('/gp/your-account/order-history') ||
                          tab.url.includes('/gp/css/order-history');

      if (!isOrderPage) {
        showStatus(StatusTypes.INFO, '「エクスポート開始」をクリックすると注文履歴ページに移動します。');
      }
    } catch (error) {
      console.error('[Amazon Order Exporter] Tab check error:', error);
    }
  }

  function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
      let resolved = false;

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          if (!resolved) {
            resolved = true;
            chrome.tabs.onUpdated.removeListener(listener);
            setTimeout(resolve, 2000);
          }
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }, Config.PAGE_LOAD_TIMEOUT);
    });
  }

  // ============================================================================
  // データ抽出
  // ============================================================================

  async function executeContentScript(tabId) {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'extractOrders' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
      return response;
    } catch (error) {
      // コンテンツスクリプトがない場合は直接注入
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: extractOrdersFunction
        });

        if (results && results[0] && results[0].result) {
          return results[0].result;
        }
        throw new Error('スクリプト実行結果が取得できませんでした');
      } catch (scriptError) {
        throw scriptError;
      }
    }
  }

  function extractOrdersFunction() {
    function parseJapaneseDate(dateStr) {
      if (!dateStr || typeof dateStr !== 'string') return '';
      const pattern = /(\d{4})年(\d{1,2})月(\d{1,2})日/;
      const match = dateStr.trim().match(pattern);
      if (match) {
        const [, year, month, day] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      return dateStr.trim();
    }

    function parsePrice(priceStr) {
      if (!priceStr || typeof priceStr !== 'string') return 0;
      const cleaned = priceStr.replace(/[¥￥,\s]/g, '');
      const parsed = parseInt(cleaned, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    }

    function safeGetText(element) {
      if (!element) return '';
      return (element.textContent || '').trim();
    }

    function queryWithFallback(parent, selectors) {
      if (!parent) return null;
      const list = Array.isArray(selectors) ? selectors : [selectors];
      for (const sel of list) {
        try {
          const el = parent.querySelector(sel);
          if (el) return el;
        } catch (e) { /* ignore */ }
      }
      return null;
    }

    const SELECTORS = {
      // 注文カード（2025年1月時点のDOM構造）
      ORDER_CARD: '.a-box-group.a-spacing-top-base',
      ORDER_CARD_ALT: '#orderCard',
      ORDER_CARD_FALLBACK: '.order-card',
      ORDER_INFO_VALUES: '.order-info span.a-color-secondary.value',
      PRODUCT_ITEM: '.yohtmlc-item',
      PRODUCT_TITLE: '.yohtmlc-product-title',
      PRODUCT_PRICE: 'span.a-price span.a-offscreen',
      ALT_PRODUCT_PRICE: ['.a-price .a-offscreen', '.a-color-price', '.a-price-whole'],
      ORDER_DETAILS_LINK: 'a[href*="order-details"]',
      PAGINATION: '.a-pagination',
      NEXT_PAGE: 'li.a-last:not(.a-disabled) a',
      LOGIN_FORM: 'form[name="signIn"]'
    };

    const PATTERNS = {
      JAPANESE_DATE: /(\d{4})年(\d{1,2})月(\d{1,2})日/,
      PRICE: /^[¥￥]/,
      ORDER_ID: /^\d{3}-\d{7}-\d{7}$/,
      ORDER_ID_IN_URL: /orderID=([^&]+)/,
      QUANTITY: /数量[:\s]*(\d+)/
    };

    try {
      const url = window.location.href;
      const isLoginRequired = url.includes('/ap/signin') ||
                              url.includes('/ap/login') ||
                              document.querySelector(SELECTORS.LOGIN_FORM) !== null;

      if (isLoginRequired) {
        return {
          success: false,
          error: 'LOGIN_REQUIRED',
          message: 'ログインが必要です'
        };
      }

      // 複数のセレクタを試行
      let orderCards = document.querySelectorAll(SELECTORS.ORDER_CARD);
      if (orderCards.length === 0) {
        orderCards = document.querySelectorAll(SELECTORS.ORDER_CARD_ALT);
      }
      if (orderCards.length === 0) {
        orderCards = document.querySelectorAll(SELECTORS.ORDER_CARD_FALLBACK);
      }

      const allOrders = [];

      orderCards.forEach(card => {
        try {
          let orderDate = '';
          let orderTotal = 0;
          let orderId = '';

          // 方法1: 新しいDOM構造（2025年1月時点）
          const columns = card.querySelectorAll('.a-column.a-span2');
          columns.forEach(col => {
            const text = safeGetText(col);
            if (!text) return;
            if (PATTERNS.JAPANESE_DATE.test(text)) {
              orderDate = parseJapaneseDate(text);
            } else if (PATTERNS.PRICE.test(text) || text.includes('¥')) {
              orderTotal = parsePrice(text);
            } else if (PATTERNS.ORDER_ID.test(text)) {
              orderId = text;
            }
          });

          // 方法2: 旧DOM構造へのフォールバック
          if (!orderDate && !orderId) {
            const orderInfoValues = card.querySelectorAll(SELECTORS.ORDER_INFO_VALUES);
            if (orderInfoValues.length >= 3) {
              orderDate = parseJapaneseDate(safeGetText(orderInfoValues[0]));
              orderTotal = parsePrice(safeGetText(orderInfoValues[1]));
              orderId = safeGetText(orderInfoValues[2]);
            } else {
              orderInfoValues.forEach(val => {
                const text = safeGetText(val);
                if (!text) return;
                if (PATTERNS.JAPANESE_DATE.test(text)) {
                  orderDate = parseJapaneseDate(text);
                } else if (PATTERNS.PRICE.test(text)) {
                  orderTotal = parsePrice(text);
                } else if (PATTERNS.ORDER_ID.test(text)) {
                  orderId = text;
                }
              });
            }
          }

          if (!orderId) {
            const link = card.querySelector(SELECTORS.ORDER_DETAILS_LINK);
            if (link && link.href) {
              const match = link.href.match(PATTERNS.ORDER_ID_IN_URL);
              if (match) orderId = match[1];
            }
          }

          const items = card.querySelectorAll(SELECTORS.PRODUCT_ITEM);
          items.forEach(item => {
            const titleEl = item.querySelector(SELECTORS.PRODUCT_TITLE);
            const title = safeGetText(titleEl);
            if (!title) return;

            let priceEl = item.querySelector(SELECTORS.PRODUCT_PRICE);
            let price = parsePrice(safeGetText(priceEl));

            if (price === 0) {
              priceEl = queryWithFallback(item, SELECTORS.ALT_PRODUCT_PRICE);
              price = parsePrice(safeGetText(priceEl));
            }

            let quantity = 1;
            const qtyMatch = (item.textContent || '').match(PATTERNS.QUANTITY);
            if (qtyMatch) {
              const q = parseInt(qtyMatch[1], 10);
              if (!Number.isNaN(q) && q > 0) quantity = q;
            }

            allOrders.push({
              orderId: orderId || '',
              date: orderDate || '',
              time: '',
              item: title,
              quantity,
              price: Math.max(0, price)
            });
          });
        } catch (cardError) {
          console.warn('[Amazon Order Exporter] Card extraction error:', cardError);
        }
      });

      const pagination = document.querySelector(SELECTORS.PAGINATION);
      const nextPageLink = pagination ? pagination.querySelector(SELECTORS.NEXT_PAGE) : null;
      const hasNextPage = nextPageLink !== null;

      return {
        success: true,
        orders: allOrders,
        hasNextPage,
        url: window.location.href
      };
    } catch (error) {
      return {
        success: false,
        error: 'EXTRACTION_ERROR',
        message: error.message || '抽出中にエラーが発生しました'
      };
    }
  }

  async function extractOrdersFromAllPages(tabId, year) {
    const allOrders = [];
    let startIndex = 0;
    let hasMore = true;
    let pageNum = 1;

    while (hasMore) {
      updateProgress({
        status: `ページ ${pageNum} を取得中...`,
        ordersCount: allOrders.length
      });

      const result = await executeContentScript(tabId);

      if (!result || !result.success) {
        if (result && result.error === ErrorTypes.LOGIN_REQUIRED) {
          throw new Error(ErrorTypes.LOGIN_REQUIRED);
        }
        throw new Error(result?.message || '注文データの抽出に失敗しました');
      }

      if (Array.isArray(result.orders)) {
        allOrders.push(...result.orders);
      }

      hasMore = result.hasNextPage === true;

      if (hasMore) {
        startIndex += 10;
        pageNum++;

        const nextUrl = `${Config.ORDER_HISTORY_BASE_URL}?orderFilter=year-${year}&startIndex=${startIndex}`;
        await chrome.tabs.update(tabId, { url: nextUrl });
        await waitForTabLoad(tabId);

        const delayTime = Config.PAGE_NAVIGATION_DELAY_MIN +
          Math.random() * (Config.PAGE_NAVIGATION_DELAY_MAX - Config.PAGE_NAVIGATION_DELAY_MIN);
        await delay(delayTime);
      }
    }

    return allOrders;
  }

  // ============================================================================
  // CSV生成
  // ============================================================================

  function generateCSV(orders, year, month = null) {
    if (!Array.isArray(orders)) return '';

    const totalSpentAmount = orders.reduce((sum, order) => {
      const price = typeof order.price === 'number' ? order.price : 0;
      const quantity = typeof order.quantity === 'number' ? order.quantity : 1;
      return sum + (price * quantity);
    }, 0);

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 期間表示
    let periodStr;
    if (month) {
      periodStr = `${year}年${month}月`;
    } else {
      const dates = orders.map(o => o.date).filter(d => typeof d === 'string' && d.length > 0).sort();
      const startDate = dates.length > 0 ? dates[0] : `${year}-01-01`;
      const endDate = dates.length > 0 ? dates[dates.length - 1] : `${year}-12-31`;
      periodStr = `${startDate} 〜 ${endDate}`;
    }

    const header = [
      `# Amazon注文履歴エクスポート`,
      `# 期間: ${periodStr}`,
      `# 総注文数: ${orders.length}件 | 総支出: ¥${totalSpentAmount.toLocaleString('ja-JP')}`,
      `# エクスポート日時: ${now}`,
      ``,
      `order_id,date,time,item,quantity,price`
    ].join('\n');

    const rows = orders.map(order => {
      const orderId = escapeCSV(order.orderId);
      const date = escapeCSV(order.date);
      const time = escapeCSV(order.time || '');
      const item = escapeCSV(order.item);
      const quantity = typeof order.quantity === 'number' ? order.quantity : 1;
      const price = typeof order.price === 'number' ? order.price : 0;
      return `${orderId},${date},${time},${item},${quantity},${price}`;
    }).join('\n');

    return header + '\n' + rows;
  }

  // ============================================================================
  // イベントハンドラ
  // ============================================================================

  async function handleExport() {
    if (State.isExporting) return;

    const year = Elements.yearSelect ? Elements.yearSelect.value : null;
    if (!isValidYear(year)) {
      showStatus(StatusTypes.ERROR, '有効な年を選択してください。');
      return;
    }

    State.selectedYear = parseInt(year, 10);

    // 月を取得（月単位モードの場合のみ）
    if (State.periodType === 'month' && Elements.monthSelect) {
      State.selectedMonth = parseInt(Elements.monthSelect.value, 10);
    } else {
      State.selectedMonth = null;
    }

    try {
      setExportLoading(true);
      hideStatus();
      hideResult();
      showProgress();

      const tab = await getCurrentTab();
      if (!tab || !tab.id) {
        throw new Error('アクティブなタブが見つかりません');
      }

      // 年単位のURLで注文履歴ページに移動（Amazonには月単位のフィルタがないため）
      const orderHistoryUrl = `${Config.ORDER_HISTORY_BASE_URL}?orderFilter=year-${year}&startIndex=0`;
      await chrome.tabs.update(tab.id, { url: orderHistoryUrl });
      await waitForTabLoad(tab.id);

      // 全ページから注文を抽出
      let orders = await extractOrdersFromAllPages(tab.id, State.selectedYear);

      // 月単位の場合はクライアント側でフィルタリング
      if (State.selectedMonth) {
        updateProgress({ status: `${State.selectedMonth}月のデータを抽出中...` });
        orders = filterOrdersByMonth(orders, State.selectedYear, State.selectedMonth);
      }

      State.orders = orders;
      State.csvContent = generateCSV(State.orders, State.selectedYear, State.selectedMonth);

      showResult(State.orders);

      const periodMsg = State.selectedMonth
        ? `${State.selectedYear}年${State.selectedMonth}月`
        : `${State.selectedYear}年`;
      showStatus(StatusTypes.SUCCESS, `${periodMsg}のエクスポートが完了しました！`);

    } catch (error) {
      console.error('[Amazon Order Exporter] Export error:', error);

      let errorMessage = ErrorMessages[ErrorTypes.EXTRACTION_ERROR];
      if (error.message === ErrorTypes.LOGIN_REQUIRED) {
        errorMessage = ErrorMessages[ErrorTypes.LOGIN_REQUIRED];
      } else if (error.message) {
        errorMessage = `エラー: ${error.message}`;
      }

      showStatus(StatusTypes.ERROR, errorMessage);

    } finally {
      setExportLoading(false);
      hideProgress();
    }
  }

  async function handleCopy() {
    if (!State.csvContent) {
      showStatus(StatusTypes.ERROR, 'コピーするデータがありません。');
      return;
    }

    try {
      await navigator.clipboard.writeText(State.csvContent);
      showStatus(StatusTypes.SUCCESS, 'クリップボードにコピーしました！');

      if (Elements.copyBtn) {
        const originalText = Elements.copyBtn.textContent;
        Elements.copyBtn.textContent = 'コピー完了！';
        setTimeout(() => {
          if (Elements.copyBtn) {
            Elements.copyBtn.textContent = originalText || 'クリップボードにコピー';
          }
        }, Config.COPY_BUTTON_RESET_DELAY);
      }
    } catch (error) {
      showStatus(StatusTypes.ERROR, ErrorMessages[ErrorTypes.CLIPBOARD_ERROR]);
    }
  }

  function handlePeriodTypeChange(event) {
    const selectedType = event.target.value;
    State.periodType = selectedType;

    if (selectedType === 'month') {
      toggleMonthSelect(true);
    } else {
      toggleMonthSelect(false);
    }
  }

  function handleProgressUpdate(message) {
    if (message && message.action === 'progressUpdate') {
      updateProgress({
        status: message.status,
        ordersCount: message.ordersCount
      });
    }
  }

  // ============================================================================
  // イベントリスナー設定
  // ============================================================================

  function setupEventListeners() {
    if (Elements.exportBtn) {
      Elements.exportBtn.addEventListener('click', handleExport);
    }

    if (Elements.copyBtn) {
      Elements.copyBtn.addEventListener('click', handleCopy);
    }

    // 期間タイプのラジオボタン
    const periodRadios = document.querySelectorAll('input[name="periodType"]');
    periodRadios.forEach(radio => {
      radio.addEventListener('change', handlePeriodTypeChange);
    });

    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(handleProgressUpdate);
    }
  }

  // ============================================================================
  // 初期化
  // ============================================================================

  function initialize() {
    console.log('[Amazon Order Exporter] Popup initializing...');

    if (!initializeElements()) {
      console.error('[Amazon Order Exporter] Failed to initialize elements');
      return;
    }

    populateYearSelect();
    setCurrentMonth();
    setupEventListeners();
    checkCurrentTab();

    console.log('[Amazon Order Exporter] Popup initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
