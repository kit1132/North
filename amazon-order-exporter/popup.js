/**
 * Amazon Order Exporter - Popup Script
 * 拡張機能ポップアップのメインロジック
 *
 * @fileoverview このスクリプトはポップアップUIの操作を担当し、
 * ユーザーインタラクション、データ取得、CSV生成を行います。
 */

(function() {
  'use strict';

  // ============================================================================
  // 定数定義
  // ============================================================================

  /**
   * 設定値
   * @readonly
   */
  const Config = Object.freeze({
    // 年選択の範囲
    YEAR_RANGE: 5,

    // Amazon URL
    ORDER_HISTORY_BASE_URL: 'https://www.amazon.co.jp/gp/your-account/order-history',

    // タイムアウト設定（ミリ秒）
    PAGE_LOAD_TIMEOUT: 30000,
    PAGE_NAVIGATION_DELAY_MIN: 2000,
    PAGE_NAVIGATION_DELAY_MAX: 4000,

    // UI更新の遅延
    COPY_BUTTON_RESET_DELAY: 2000
  });

  /**
   * エラータイプ
   * @readonly
   */
  const ErrorTypes = Object.freeze({
    LOGIN_REQUIRED: 'LOGIN_REQUIRED',
    EXTRACTION_ERROR: 'EXTRACTION_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    CLIPBOARD_ERROR: 'CLIPBOARD_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR'
  });

  /**
   * エラーメッセージ
   * @readonly
   */
  const ErrorMessages = Object.freeze({
    [ErrorTypes.LOGIN_REQUIRED]: 'ログインが必要です。Amazonにログインしてから再度お試しください。',
    [ErrorTypes.EXTRACTION_ERROR]: '注文データの抽出に失敗しました。',
    [ErrorTypes.NETWORK_ERROR]: 'ネットワークエラーが発生しました。',
    [ErrorTypes.CLIPBOARD_ERROR]: 'クリップボードへのコピーに失敗しました。',
    [ErrorTypes.VALIDATION_ERROR]: '入力データが不正です。'
  });

  /**
   * ステータスタイプ
   * @readonly
   */
  const StatusTypes = Object.freeze({
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
  });

  // ============================================================================
  // DOM要素参照
  // ============================================================================

  /**
   * DOM要素の参照を保持するオブジェクト
   * @type {Object.<string, HTMLElement|null>}
   */
  const Elements = {
    yearSelect: null,
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

  /**
   * アプリケーションの状態を管理
   * @type {Object}
   */
  const State = {
    /** @type {Array} 抽出された注文データ */
    orders: [],

    /** @type {string} 生成されたCSVコンテンツ */
    csvContent: '',

    /** @type {boolean} エクスポート処理中フラグ */
    isExporting: false,

    /** @type {number|null} 選択された年 */
    selectedYear: null
  };

  // ============================================================================
  // ユーティリティ関数
  // ============================================================================

  /**
   * 安全にDOM要素を取得
   *
   * @param {string} id - 要素のID
   * @returns {HTMLElement|null} DOM要素またはnull
   */
  function safeGetElement(id) {
    try {
      return document.getElementById(id);
    } catch (error) {
      console.error(`[Amazon Order Exporter] Failed to get element: ${id}`, error);
      return null;
    }
  }

  /**
   * 遅延を生成
   *
   * @param {number} ms - 遅延時間（ミリ秒）
   * @returns {Promise<void>}
   */
  function delay(ms) {
    if (typeof ms !== 'number' || ms < 0) {
      ms = 0;
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 年の値を検証
   *
   * @param {number|string} year - 検証する年
   * @returns {boolean} 有効な場合true
   */
  function isValidYear(year) {
    const numYear = parseInt(year, 10);
    const currentYear = new Date().getFullYear();
    return !Number.isNaN(numYear) && numYear >= 2000 && numYear <= currentYear;
  }

  /**
   * CSV用に文字列をエスケープ
   *
   * @param {string|null|undefined} str - エスケープする文字列
   * @returns {string} エスケープされた文字列
   */
  function escapeCSV(str) {
    if (str == null) return '';
    const strValue = String(str);
    if (strValue.includes(',') || strValue.includes('"') ||
        strValue.includes('\n') || strValue.includes('\r')) {
      return `"${strValue.replace(/"/g, '""')}"`;
    }
    return strValue;
  }

  /**
   * 価格を日本語フォーマットで表示
   *
   * @param {number} amount - 金額
   * @returns {string} フォーマットされた金額
   */
  function formatPrice(amount) {
    if (typeof amount !== 'number' || Number.isNaN(amount)) {
      return '0';
    }
    return Math.max(0, Math.floor(amount)).toLocaleString('ja-JP');
  }

  // ============================================================================
  // DOM要素初期化
  // ============================================================================

  /**
   * DOM要素の参照を初期化
   *
   * @returns {boolean} 全要素が取得できた場合true
   */
  function initializeElements() {
    const elementIds = [
      'yearSelect',
      'exportBtn',
      'copyBtn',
      'progressContainer',
      'progressFill',
      'progressText',
      'resultContainer',
      'orderCount',
      'totalSpent',
      'statusMessage'
    ];

    let allFound = true;

    elementIds.forEach(id => {
      Elements[id] = safeGetElement(id);
      if (!Elements[id]) {
        console.error(`[Amazon Order Exporter] Required element not found: ${id}`);
        allFound = false;
      }
    });

    return allFound;
  }

  // ============================================================================
  // UI操作関数
  // ============================================================================

  /**
   * 年選択ドロップダウンを初期化
   */
  function populateYearSelect() {
    if (!Elements.yearSelect) return;

    const currentYear = new Date().getFullYear();

    // 既存のオプションをクリア
    Elements.yearSelect.innerHTML = '';

    for (let i = 0; i < Config.YEAR_RANGE; i++) {
      const year = currentYear - i;
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = `${year}年`;
      Elements.yearSelect.appendChild(option);
    }

    // 初期値を設定
    State.selectedYear = currentYear;
  }

  /**
   * エクスポートボタンのローディング状態を設定
   *
   * @param {boolean} loading - ローディング中の場合true
   */
  function setExportLoading(loading) {
    State.isExporting = loading;

    if (!Elements.exportBtn) return;

    Elements.exportBtn.disabled = loading;

    const btnText = Elements.exportBtn.querySelector('.btn-text');
    const btnLoading = Elements.exportBtn.querySelector('.btn-loading');

    if (btnText) {
      btnText.style.display = loading ? 'none' : 'inline';
    }
    if (btnLoading) {
      btnLoading.style.display = loading ? 'inline' : 'none';
    }
  }

  /**
   * 進捗表示を表示
   */
  function showProgress() {
    if (!Elements.progressContainer || !Elements.progressFill) return;

    Elements.progressContainer.style.display = 'block';
    Elements.progressContainer.classList.add('fade-in');
    Elements.progressFill.classList.add('indeterminate');
  }

  /**
   * 進捗表示を非表示
   */
  function hideProgress() {
    if (!Elements.progressContainer || !Elements.progressFill) return;

    Elements.progressContainer.style.display = 'none';
    Elements.progressFill.classList.remove('indeterminate');
  }

  /**
   * 進捗情報を更新
   *
   * @param {Object} data - 進捗データ
   * @param {string} [data.status] - ステータスメッセージ
   * @param {number} [data.ordersCount] - 取得済み注文数
   */
  function updateProgress(data) {
    if (!Elements.progressText) return;

    let message = data.status || '取得中...';

    if (typeof data.ordersCount === 'number' && data.ordersCount >= 0) {
      message = `${data.status || '取得中...'} (${data.ordersCount}件取得済み)`;
    }

    Elements.progressText.textContent = message;
  }

  /**
   * 結果を表示
   *
   * @param {Array} orders - 注文データ配列
   */
  function showResult(orders) {
    if (!Elements.resultContainer || !Elements.orderCount ||
        !Elements.totalSpent || !Elements.copyBtn) return;

    if (!Array.isArray(orders)) {
      console.error('[Amazon Order Exporter] Invalid orders data');
      return;
    }

    // 合計金額を計算（価格 × 数量）
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

  /**
   * 結果を非表示
   */
  function hideResult() {
    if (!Elements.resultContainer) return;
    Elements.resultContainer.style.display = 'none';
  }

  /**
   * ステータスメッセージを表示
   *
   * @param {string} type - ステータスタイプ（success, error, warning, info）
   * @param {string} message - 表示するメッセージ
   */
  function showStatus(type, message) {
    if (!Elements.statusMessage) return;

    // バリデーション
    const validTypes = Object.values(StatusTypes);
    const statusType = validTypes.includes(type) ? type : StatusTypes.INFO;

    Elements.statusMessage.textContent = message;
    Elements.statusMessage.className = `status-message ${statusType} fade-in`;
    Elements.statusMessage.style.display = 'block';
  }

  /**
   * ステータスメッセージを非表示
   */
  function hideStatus() {
    if (!Elements.statusMessage) return;
    Elements.statusMessage.style.display = 'none';
  }

  // ============================================================================
  // タブ操作
  // ============================================================================

  /**
   * 現在のタブ情報を取得
   *
   * @returns {Promise<chrome.tabs.Tab|null>} タブ情報またはnull
   */
  async function getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab || null;
    } catch (error) {
      console.error('[Amazon Order Exporter] Failed to get current tab:', error);
      return null;
    }
  }

  /**
   * 現在のタブがAmazonかどうかをチェック
   */
  async function checkCurrentTab() {
    try {
      const tab = await getCurrentTab();

      if (!tab || !tab.url) {
        showStatus(StatusTypes.WARNING, 'タブ情報を取得できませんでした。');
        if (Elements.exportBtn) Elements.exportBtn.disabled = true;
        return;
      }

      // Amazon.co.jpかチェック
      if (!tab.url.includes('amazon.co.jp')) {
        showStatus(StatusTypes.WARNING, 'Amazon.co.jpのページで実行してください。');
        if (Elements.exportBtn) Elements.exportBtn.disabled = true;
        return;
      }

      // 注文履歴ページかチェック
      const isOrderPage = tab.url.includes('/gp/your-account/order-history') ||
                          tab.url.includes('/gp/css/order-history');

      if (!isOrderPage) {
        showStatus(StatusTypes.INFO, '注文履歴ページに移動してからエクスポートを開始してください。');
      }
    } catch (error) {
      console.error('[Amazon Order Exporter] Tab check error:', error);
    }
  }

  /**
   * タブの読み込み完了を待機
   *
   * @param {number} tabId - タブID
   * @returns {Promise<void>}
   */
  function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
      let resolved = false;

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          if (!resolved) {
            resolved = true;
            chrome.tabs.onUpdated.removeListener(listener);
            // JavaScriptの実行を待つ追加遅延
            setTimeout(resolve, 2000);
          }
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      // タイムアウト
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

  /**
   * コンテンツスクリプトを実行して注文を抽出
   *
   * @param {number} tabId - タブID
   * @returns {Promise<Object>} 抽出結果
   */
  async function executeContentScript(tabId) {
    // まず既存のコンテンツスクリプトにメッセージを送信
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
      // コンテンツスクリプトがロードされていない場合、直接注入して実行
      console.log('[Amazon Order Exporter] Content script not loaded, injecting...');

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
        console.error('[Amazon Order Exporter] Script injection failed:', scriptError);
        throw scriptError;
      }
    }
  }

  /**
   * ページに注入される抽出関数
   * background.jsと同じロジックを含む
   */
  function extractOrdersFunction() {
    // ヘルパー関数
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

    // セレクタ
    const SELECTORS = {
      ORDER_CARD: '.order-card',
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
      // ログインチェック
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

      // 注文カードを取得
      const orderCards = document.querySelectorAll(SELECTORS.ORDER_CARD);
      const allOrders = [];

      orderCards.forEach(card => {
        try {
          // メタ情報を抽出
          const orderInfoValues = card.querySelectorAll(SELECTORS.ORDER_INFO_VALUES);
          let orderDate = '';
          let orderTotal = 0;
          let orderId = '';

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

          // フォールバック: リンクから注文IDを取得
          if (!orderId) {
            const link = card.querySelector(SELECTORS.ORDER_DETAILS_LINK);
            if (link && link.href) {
              const match = link.href.match(PATTERNS.ORDER_ID_IN_URL);
              if (match) orderId = match[1];
            }
          }

          // 商品情報を抽出
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

      // ページネーションをチェック
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

  /**
   * 指定年の全ページから注文を抽出
   *
   * @param {number} tabId - タブID
   * @param {number} year - 年
   * @returns {Promise<Array>} 全注文データ
   */
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

      // 現在のページから注文を抽出
      const result = await executeContentScript(tabId);

      // エラーチェック
      if (!result || !result.success) {
        if (result && result.error === ErrorTypes.LOGIN_REQUIRED) {
          throw new Error(ErrorTypes.LOGIN_REQUIRED);
        }
        throw new Error(result?.message || '注文データの抽出に失敗しました');
      }

      // 注文を追加
      if (Array.isArray(result.orders)) {
        allOrders.push(...result.orders);
      }

      hasMore = result.hasNextPage === true;

      // 次のページへ移動
      if (hasMore) {
        startIndex += 10;
        pageNum++;

        const nextUrl = `${Config.ORDER_HISTORY_BASE_URL}?orderFilter=year-${year}&startIndex=${startIndex}`;
        await chrome.tabs.update(tabId, { url: nextUrl });
        await waitForTabLoad(tabId);

        // レート制限対策の遅延
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

  /**
   * 注文データからCSVを生成
   *
   * @param {Array} orders - 注文データ配列
   * @param {number} year - 年
   * @returns {string} CSV形式の文字列
   */
  function generateCSV(orders, year) {
    if (!Array.isArray(orders)) {
      console.error('[Amazon Order Exporter] Invalid orders data for CSV generation');
      return '';
    }

    // 合計金額を計算
    const totalSpentAmount = orders.reduce((sum, order) => {
      const price = typeof order.price === 'number' ? order.price : 0;
      const quantity = typeof order.quantity === 'number' ? order.quantity : 1;
      return sum + (price * quantity);
    }, 0);

    // 現在日時
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 日付範囲を取得
    const dates = orders
      .map(o => o.date)
      .filter(d => typeof d === 'string' && d.length > 0)
      .sort();

    const startDate = dates.length > 0 ? dates[dates.length - 1] : `${year}-01-01`;
    const endDate = dates.length > 0 ? dates[0] : `${year}-12-31`;

    // ヘッダーコメント
    const header = [
      `# Amazon注文履歴エクスポート`,
      `# 期間: ${startDate} 〜 ${endDate}`,
      `# 総注文数: ${orders.length}件 | 総支出: ¥${totalSpentAmount.toLocaleString('ja-JP')}`,
      `# エクスポート日時: ${now}`,
      ``,
      `order_id,date,time,item,quantity,price`
    ].join('\n');

    // データ行
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

  /**
   * エクスポートボタンのクリックハンドラ
   */
  async function handleExport() {
    // 多重実行防止
    if (State.isExporting) {
      console.log('[Amazon Order Exporter] Export already in progress');
      return;
    }

    // 年を取得・検証
    const year = Elements.yearSelect ? Elements.yearSelect.value : null;

    if (!isValidYear(year)) {
      showStatus(StatusTypes.ERROR, '有効な年を選択してください。');
      return;
    }

    State.selectedYear = parseInt(year, 10);

    try {
      setExportLoading(true);
      hideStatus();
      hideResult();
      showProgress();

      // 現在のタブを取得
      const tab = await getCurrentTab();

      if (!tab || !tab.id) {
        throw new Error('アクティブなタブが見つかりません');
      }

      // 注文履歴ページに移動
      const orderHistoryUrl = `${Config.ORDER_HISTORY_BASE_URL}?orderFilter=year-${year}&startIndex=0`;
      await chrome.tabs.update(tab.id, { url: orderHistoryUrl });
      await waitForTabLoad(tab.id);

      // 全ページから注文を抽出
      State.orders = await extractOrdersFromAllPages(tab.id, State.selectedYear);

      // CSVを生成
      State.csvContent = generateCSV(State.orders, State.selectedYear);

      // 結果を表示
      showResult(State.orders);
      showStatus(StatusTypes.SUCCESS, 'エクスポートが完了しました！');

      console.log(`[Amazon Order Exporter] Export complete: ${State.orders.length} items`);

    } catch (error) {
      console.error('[Amazon Order Exporter] Export error:', error);

      // エラータイプに応じたメッセージ
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

  /**
   * コピーボタンのクリックハンドラ
   */
  async function handleCopy() {
    // CSVコンテンツがあるかチェック
    if (!State.csvContent) {
      showStatus(StatusTypes.ERROR, 'コピーするデータがありません。');
      return;
    }

    try {
      await navigator.clipboard.writeText(State.csvContent);

      showStatus(StatusTypes.SUCCESS, 'クリップボードにコピーしました！');

      // ボタンテキストを一時的に変更
      if (Elements.copyBtn) {
        const originalText = Elements.copyBtn.textContent;
        Elements.copyBtn.textContent = 'コピー完了！';

        setTimeout(() => {
          if (Elements.copyBtn) {
            Elements.copyBtn.textContent = originalText || 'クリップボードにコピー';
          }
        }, Config.COPY_BUTTON_RESET_DELAY);
      }

      console.log('[Amazon Order Exporter] CSV copied to clipboard');

    } catch (error) {
      console.error('[Amazon Order Exporter] Copy error:', error);
      showStatus(StatusTypes.ERROR, ErrorMessages[ErrorTypes.CLIPBOARD_ERROR]);
    }
  }

  /**
   * 進捗更新メッセージのハンドラ
   *
   * @param {Object} message - メッセージデータ
   */
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

  /**
   * イベントリスナーを設定
   */
  function setupEventListeners() {
    // エクスポートボタン
    if (Elements.exportBtn) {
      Elements.exportBtn.addEventListener('click', handleExport);
    }

    // コピーボタン
    if (Elements.copyBtn) {
      Elements.copyBtn.addEventListener('click', handleCopy);
    }

    // バックグラウンドからの進捗更新
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(handleProgressUpdate);
    }
  }

  // ============================================================================
  // 初期化
  // ============================================================================

  /**
   * アプリケーションを初期化
   */
  function initialize() {
    console.log('[Amazon Order Exporter] Popup initializing...');

    // DOM要素を取得
    if (!initializeElements()) {
      console.error('[Amazon Order Exporter] Failed to initialize elements');
      return;
    }

    // 年選択を設定
    populateYearSelect();

    // イベントリスナーを設定
    setupEventListeners();

    // 現在のタブをチェック
    checkCurrentTab();

    console.log('[Amazon Order Exporter] Popup initialized');
  }

  // DOMContentLoadedで初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
