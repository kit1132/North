/**
 * Amazon Order Exporter - Background Service Worker
 * マルチページ取得とデータ管理を担当するサービスワーカー
 *
 * @fileoverview このスクリプトはChrome拡張機能のバックグラウンドで動作し、
 * 複数ページにわたる注文データの取得やストレージ管理を行います。
 */

'use strict';

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 設定値
 * @readonly
 */
const Config = Object.freeze({
  // Amazon URL
  ORDER_HISTORY_BASE_URL: 'https://www.amazon.co.jp/gp/your-account/order-history',

  // タイムアウト設定（ミリ秒）
  PAGE_LOAD_TIMEOUT: 30000,
  SCRIPT_EXECUTION_DELAY_MIN: 1000,
  SCRIPT_EXECUTION_DELAY_MAX: 2000,

  // レート制限対策の遅延（ミリ秒）
  PAGE_NAVIGATION_DELAY_MIN: 2000,
  PAGE_NAVIGATION_DELAY_MAX: 4000,

  // リトライ設定
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY: 1000,
  RETRY_MAX_DELAY: 30000,

  // ページあたりの注文数
  ORDERS_PER_PAGE: 10,

  // 安全制限
  MAX_PAGES: 500,
  MAX_ORDERS: 10000
});

/**
 * エラータイプ
 * @readonly
 */
const ErrorTypes = Object.freeze({
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  EXTRACTION_ERROR: 'EXTRACTION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
});

/**
 * エラーメッセージ
 * @readonly
 */
const ErrorMessages = Object.freeze({
  [ErrorTypes.LOGIN_REQUIRED]: 'ログインが必要です。Amazonにログインしてから再度お試しください。',
  [ErrorTypes.EXTRACTION_ERROR]: '注文データの抽出に失敗しました。',
  [ErrorTypes.NETWORK_ERROR]: 'ネットワークエラーが発生しました。',
  [ErrorTypes.TIMEOUT_ERROR]: 'タイムアウトしました。再度お試しください。',
  [ErrorTypes.VALIDATION_ERROR]: '入力データが不正です。',
  [ErrorTypes.STORAGE_ERROR]: 'データの保存に失敗しました。',
  [ErrorTypes.UNKNOWN_ERROR]: '予期しないエラーが発生しました。'
});

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 指定範囲のランダムな遅延を生成
 *
 * @param {number} min - 最小遅延（ミリ秒）
 * @param {number} max - 最大遅延（ミリ秒）
 * @returns {Promise<void>} 遅延後に解決されるPromise
 */
function delay(min, max) {
  if (typeof min !== 'number' || typeof max !== 'number' || min < 0 || max < 0 || min > max) {
    // 不正な引数の場合はデフォルト値を使用
    min = Config.SCRIPT_EXECUTION_DELAY_MIN;
    max = Config.SCRIPT_EXECUTION_DELAY_MAX;
  }
  const ms = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 指数バックオフ遅延を計算
 *
 * @param {number} retryCount - リトライ回数（0から開始）
 * @returns {number} 遅延時間（ミリ秒）
 */
function calculateBackoff(retryCount) {
  const exponentialDelay = Config.RETRY_BASE_DELAY * Math.pow(2, retryCount);
  // ジッターを追加（±10%）
  const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(exponentialDelay + jitter, Config.RETRY_MAX_DELAY);
}

/**
 * エラーレスポンスを生成
 *
 * @param {string} type - エラータイプ
 * @param {string} [customMessage] - カスタムメッセージ
 * @param {Error} [originalError] - 元のエラー
 * @returns {Object} エラーレスポンス
 */
function createErrorResponse(type, customMessage = null, originalError = null) {
  const message = customMessage || ErrorMessages[type] || ErrorMessages[ErrorTypes.UNKNOWN_ERROR];
  return {
    success: false,
    error: type,
    message,
    originalError: originalError ? originalError.message : null,
    timestamp: new Date().toISOString()
  };
}

/**
 * 成功レスポンスを生成
 *
 * @param {Object} data - レスポンスデータ
 * @returns {Object} 成功レスポンス
 */
function createSuccessResponse(data) {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString()
  };
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
  // 2000年から現在の年まで有効
  return !Number.isNaN(numYear) && numYear >= 2000 && numYear <= currentYear;
}

/**
 * タブIDを検証
 *
 * @param {number} tabId - 検証するタブID
 * @returns {boolean} 有効な場合true
 */
function isValidTabId(tabId) {
  return typeof tabId === 'number' && tabId > 0 && Number.isInteger(tabId);
}

// ============================================================================
// タブ操作
// ============================================================================

/**
 * タブの読み込み完了を待機
 *
 * @param {number} tabId - タブID
 * @param {number} [timeout] - タイムアウト（ミリ秒）
 * @returns {Promise<void>}
 */
function waitForTabLoad(tabId, timeout = Config.PAGE_LOAD_TIMEOUT) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let timeoutId = null;

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          if (timeoutId) clearTimeout(timeoutId);
          resolve();
        }
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // タイムアウト設定
    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        // タイムアウトしても処理を続行（ページが部分的に読み込まれている可能性）
        console.warn(`[Amazon Order Exporter] Tab load timeout for tabId: ${tabId}`);
        resolve();
      }
    }, timeout);
  });
}

/**
 * タブが存在するかチェック
 *
 * @param {number} tabId - タブID
 * @returns {Promise<boolean>}
 */
async function checkTabExists(tabId) {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (error) {
    return false;
  }
}

// ============================================================================
// 注文抽出ロジック（ページ内で実行される関数）
// ============================================================================

/**
 * ページ内で実行される注文抽出関数
 * この関数はchrome.scripting.executeScriptで注入される
 *
 * @returns {Object} 抽出結果
 */
function extractOrdersFromPage() {
  // ============ ヘルパー関数（注入先で利用可能にするため内部定義） ============

  /**
   * 日本語日付をISOフォーマットに変換
   */
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

  /**
   * 価格文字列を数値に変換
   */
  function parsePrice(priceStr) {
    if (!priceStr || typeof priceStr !== 'string') return 0;
    const cleaned = priceStr.replace(/[¥￥,\s]/g, '');
    const parsed = parseInt(cleaned, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /**
   * 安全にテキストを取得
   */
  function safeGetText(element) {
    if (!element) return '';
    return (element.textContent || '').trim();
  }

  /**
   * 複数セレクタで要素を検索
   */
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

  // ============ DOMセレクタ ============
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

  // ============ メイン処理 ============

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
      url: window.location.href,
      stats: {
        orderCards: orderCards.length,
        extractedItems: allOrders.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: 'EXTRACTION_ERROR',
      message: error.message || '抽出中にエラーが発生しました'
    };
  }
}

// ============================================================================
// 注文取得処理
// ============================================================================

/**
 * 特定のページから注文データを取得
 *
 * @param {number} tabId - タブID
 * @param {string} url - 取得するURL
 * @returns {Promise<Object>} 抽出結果
 */
async function fetchOrdersFromPage(tabId, url) {
  // タブが存在するか確認
  if (!await checkTabExists(tabId)) {
    throw new Error('タブが閉じられました');
  }

  // URLに移動
  await chrome.tabs.update(tabId, { url });

  // ページ読み込み完了を待機
  await waitForTabLoad(tabId);

  // レンダリング完了を待つ追加遅延
  await delay(Config.SCRIPT_EXECUTION_DELAY_MIN, Config.SCRIPT_EXECUTION_DELAY_MAX);

  // 注文データを抽出
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractOrdersFromPage
    });

    if (results && results[0] && results[0].result) {
      return results[0].result;
    }

    throw new Error('スクリプト実行結果が取得できませんでした');
  } catch (error) {
    console.error('[Amazon Order Exporter] Script execution error:', error);
    throw error;
  }
}

/**
 * 指定年の全注文を取得
 *
 * @param {number} year - 取得する年
 * @param {number} tabId - 使用するタブID
 * @param {Function} [progressCallback] - 進捗コールバック
 * @returns {Promise<Array>} 全注文データ
 */
async function fetchAllOrdersForYear(year, tabId, progressCallback) {
  // 引数のバリデーション
  if (!isValidYear(year)) {
    throw new Error('無効な年が指定されました');
  }

  if (!isValidTabId(tabId)) {
    throw new Error('無効なタブIDです');
  }

  const allOrders = [];
  let startIndex = 0;
  let pageNum = 1;
  let hasMore = true;
  let consecutiveErrors = 0;

  console.log(`[Amazon Order Exporter] Starting fetch for year ${year}`);

  while (hasMore) {
    // 安全制限チェック
    if (pageNum > Config.MAX_PAGES) {
      console.warn(`[Amazon Order Exporter] Max pages limit (${Config.MAX_PAGES}) reached`);
      break;
    }

    if (allOrders.length > Config.MAX_ORDERS) {
      console.warn(`[Amazon Order Exporter] Max orders limit (${Config.MAX_ORDERS}) reached`);
      break;
    }

    const url = `${Config.ORDER_HISTORY_BASE_URL}?orderFilter=year-${year}&startIndex=${startIndex}`;

    // 進捗を報告
    if (typeof progressCallback === 'function') {
      try {
        progressCallback({
          type: 'progress',
          page: pageNum,
          ordersCount: allOrders.length,
          status: `ページ ${pageNum} を取得中...`
        });
      } catch (cbError) {
        console.warn('[Amazon Order Exporter] Progress callback error:', cbError);
      }
    }

    try {
      const result = await fetchOrdersFromPage(tabId, url);

      // エラーチェック
      if (!result.success) {
        if (result.error === ErrorTypes.LOGIN_REQUIRED) {
          throw new Error(ErrorTypes.LOGIN_REQUIRED);
        }
        throw new Error(result.message || '注文データの取得に失敗しました');
      }

      // 注文データを追加
      if (Array.isArray(result.orders)) {
        allOrders.push(...result.orders);
      }

      hasMore = result.hasNextPage === true;
      consecutiveErrors = 0; // 成功したのでエラーカウントをリセット

      console.log(`[Amazon Order Exporter] Page ${pageNum}: ${result.orders?.length || 0} items extracted`);

      // 次のページへ
      if (hasMore) {
        startIndex += Config.ORDERS_PER_PAGE;
        pageNum++;

        // レート制限対策の遅延
        await delay(Config.PAGE_NAVIGATION_DELAY_MIN, Config.PAGE_NAVIGATION_DELAY_MAX);
      }
    } catch (error) {
      console.error(`[Amazon Order Exporter] Error on page ${pageNum}:`, error);

      // ログインエラーは即座に中断
      if (error.message === ErrorTypes.LOGIN_REQUIRED) {
        throw error;
      }

      consecutiveErrors++;

      // リトライ上限チェック
      if (consecutiveErrors >= Config.MAX_RETRIES) {
        throw new Error(`${Config.MAX_RETRIES}回連続でエラーが発生しました: ${error.message}`);
      }

      // 指数バックオフで待機してリトライ
      const backoffTime = calculateBackoff(consecutiveErrors);
      console.log(`[Amazon Order Exporter] Retrying in ${Math.round(backoffTime)}ms...`);
      await delay(backoffTime, backoffTime + 1000);
    }
  }

  console.log(`[Amazon Order Exporter] Fetch complete: ${allOrders.length} items from ${pageNum} pages`);

  return allOrders;
}

// ============================================================================
// ストレージ操作
// ============================================================================

/**
 * 注文データをストレージに保存
 *
 * @param {number} year - 年
 * @param {Array} orders - 注文データ
 * @returns {Promise<void>}
 */
async function saveOrdersToStorage(year, orders) {
  if (!isValidYear(year)) {
    throw new Error('無効な年が指定されました');
  }

  if (!Array.isArray(orders)) {
    throw new Error('注文データが配列ではありません');
  }

  try {
    await chrome.storage.local.set({
      [`orders_${year}`]: orders,
      [`lastUpdate_${year}`]: Date.now()
    });
  } catch (error) {
    console.error('[Amazon Order Exporter] Storage save error:', error);
    throw new Error(ErrorMessages[ErrorTypes.STORAGE_ERROR]);
  }
}

/**
 * ストレージから注文データを取得
 *
 * @param {number} year - 年
 * @returns {Promise<Object>} 注文データとメタ情報
 */
async function getOrdersFromStorage(year) {
  if (!isValidYear(year)) {
    return { orders: [], lastUpdate: null };
  }

  try {
    const result = await chrome.storage.local.get([
      `orders_${year}`,
      `lastUpdate_${year}`
    ]);

    return {
      orders: result[`orders_${year}`] || [],
      lastUpdate: result[`lastUpdate_${year}`] || null
    };
  } catch (error) {
    console.error('[Amazon Order Exporter] Storage read error:', error);
    return { orders: [], lastUpdate: null };
  }
}

// ============================================================================
// メッセージハンドラ
// ============================================================================

/**
 * メッセージリスナーを設定
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // リクエストのバリデーション
  if (!request || typeof request.action !== 'string') {
    sendResponse(createErrorResponse(ErrorTypes.VALIDATION_ERROR, '不正なリクエストです'));
    return true;
  }

  // アクションに応じて処理
  switch (request.action) {
    case 'fetchAllOrders':
      handleFetchAllOrders(request, sendResponse);
      break;

    case 'saveOrders':
      handleSaveOrders(request, sendResponse);
      break;

    case 'getStoredOrders':
      handleGetStoredOrders(request, sendResponse);
      break;

    case 'ping':
      sendResponse(createSuccessResponse({ message: 'pong' }));
      break;

    default:
      sendResponse(createErrorResponse(ErrorTypes.VALIDATION_ERROR, `不明なアクション: ${request.action}`));
  }

  return true; // 非同期レスポンスのためチャネルを開いておく
});

/**
 * fetchAllOrdersアクションを処理
 */
function handleFetchAllOrders(request, sendResponse) {
  const { year, tabId } = request;

  // バリデーション
  if (!isValidYear(year)) {
    sendResponse(createErrorResponse(ErrorTypes.VALIDATION_ERROR, '無効な年が指定されました'));
    return;
  }

  if (!isValidTabId(tabId)) {
    sendResponse(createErrorResponse(ErrorTypes.VALIDATION_ERROR, '無効なタブIDです'));
    return;
  }

  // 非同期処理を開始
  fetchAllOrdersForYear(year, tabId, (progress) => {
    // 進捗をポップアップに送信（エラーは無視）
    try {
      chrome.runtime.sendMessage({
        action: 'progressUpdate',
        ...progress
      });
    } catch (e) {
      // ポップアップが閉じている場合などは無視
    }
  })
  .then(orders => {
    sendResponse(createSuccessResponse({ orders }));
  })
  .catch(error => {
    const errorType = error.message === ErrorTypes.LOGIN_REQUIRED
      ? ErrorTypes.LOGIN_REQUIRED
      : ErrorTypes.EXTRACTION_ERROR;

    sendResponse(createErrorResponse(errorType, error.message, error));
  });
}

/**
 * saveOrdersアクションを処理
 */
function handleSaveOrders(request, sendResponse) {
  const { orders, year } = request;

  if (!isValidYear(year)) {
    sendResponse(createErrorResponse(ErrorTypes.VALIDATION_ERROR, '無効な年が指定されました'));
    return;
  }

  if (!Array.isArray(orders)) {
    sendResponse(createErrorResponse(ErrorTypes.VALIDATION_ERROR, '注文データが不正です'));
    return;
  }

  saveOrdersToStorage(year, orders)
    .then(() => {
      sendResponse(createSuccessResponse({ saved: orders.length }));
    })
    .catch(error => {
      sendResponse(createErrorResponse(ErrorTypes.STORAGE_ERROR, error.message, error));
    });
}

/**
 * getStoredOrdersアクションを処理
 */
function handleGetStoredOrders(request, sendResponse) {
  const { year } = request;

  if (!isValidYear(year)) {
    sendResponse(createErrorResponse(ErrorTypes.VALIDATION_ERROR, '無効な年が指定されました'));
    return;
  }

  getOrdersFromStorage(year)
    .then(data => {
      sendResponse(createSuccessResponse(data));
    })
    .catch(error => {
      sendResponse(createErrorResponse(ErrorTypes.STORAGE_ERROR, error.message, error));
    });
}

// ============================================================================
// 初期化
// ============================================================================

console.log('[Amazon Order Exporter] Service worker started:', {
  timestamp: new Date().toISOString(),
  config: {
    maxRetries: Config.MAX_RETRIES,
    pageTimeout: Config.PAGE_LOAD_TIMEOUT
  }
});
