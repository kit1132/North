/**
 * Amazon Order Exporter - Shared Utilities
 * 共通のユーティリティ関数と定数を提供
 *
 * @fileoverview このファイルはcontent.js、background.js、popup.jsで共有される
 * ユーティリティ関数と定数を定義します。
 */

'use strict';

// ============================================================================
// 定数定義
// ============================================================================

/**
 * エラータイプの列挙
 * @readonly
 * @enum {string}
 */
const ErrorTypes = Object.freeze({
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  EXTRACTION_ERROR: 'EXTRACTION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DOM_STRUCTURE_CHANGED: 'DOM_STRUCTURE_CHANGED',
  CLIPBOARD_ERROR: 'CLIPBOARD_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
});

/**
 * エラーメッセージの定義（日本語）
 * @readonly
 * @type {Object.<string, string>}
 */
const ErrorMessages = Object.freeze({
  [ErrorTypes.LOGIN_REQUIRED]: 'ログインが必要です。Amazonにログインしてから再度お試しください。',
  [ErrorTypes.EXTRACTION_ERROR]: '注文データの抽出に失敗しました。',
  [ErrorTypes.NETWORK_ERROR]: 'ネットワークエラーが発生しました。接続を確認してください。',
  [ErrorTypes.TIMEOUT_ERROR]: 'タイムアウトしました。再度お試しください。',
  [ErrorTypes.VALIDATION_ERROR]: '入力データが不正です。',
  [ErrorTypes.DOM_STRUCTURE_CHANGED]: 'ページ構造が変更された可能性があります。拡張機能の更新が必要です。',
  [ErrorTypes.CLIPBOARD_ERROR]: 'クリップボードへのコピーに失敗しました。',
  [ErrorTypes.STORAGE_ERROR]: 'データの保存に失敗しました。',
  [ErrorTypes.UNKNOWN_ERROR]: '予期しないエラーが発生しました。'
});

/**
 * Amazon注文履歴ページのDOMセレクタ
 * Amazonがページ構造を変更した場合、ここを更新する
 * @readonly
 * @type {Object.<string, string|string[]>}
 */
const DOMSelectors = Object.freeze({
  // 注文カード関連（2025年1月時点のDOM構造）
  ORDER_CARD: '.a-box-group.a-spacing-top-base',
  ORDER_CARD_ALT: '#orderCard',
  ORDER_CARD_FALLBACK: '.order-card',
  ORDER_INFO: '.order-info',
  ORDER_INFO_VALUES: '.order-info span.a-color-secondary.value',

  // 注文ヘッダー情報（日付、合計、注文ID）
  ORDER_HEADER: '#orderCardHeader, .a-box.a-color-offset-background',
  ORDER_DATE: '.a-column.a-span2',
  ORDER_TOTAL: '.a-column.a-span2 .a-color-secondary',

  // 商品情報関連
  PRODUCT_ITEM: '.yohtmlc-item',
  PRODUCT_TITLE: '.yohtmlc-product-title',
  PRODUCT_PRICE: 'span.a-price span.a-offscreen',

  // フォールバック用セレクタ（メインセレクタで取得できない場合）
  ALT_PRODUCT_ITEM: '.a-fixed-left-grid-inner',
  ALT_PRODUCT_TITLE: '.a-link-normal',
  ALT_PRODUCT_PRICE: ['.a-price .a-offscreen', '.a-color-price', '.a-price-whole'],

  // 注文ID取得用
  ORDER_DETAILS_LINK: 'a[href*="order-details"]',

  // ページネーション
  PAGINATION: '.a-pagination',
  NEXT_PAGE: 'li.a-last:not(.a-disabled) a',

  // ログイン検出
  LOGIN_FORM: 'form[name="signIn"]'
});

/**
 * 正規表現パターン
 * @readonly
 * @type {Object.<string, RegExp>}
 */
const Patterns = Object.freeze({
  // 日本語日付形式: "2024年12月25日"
  JAPANESE_DATE: /(\d{4})年(\d{1,2})月(\d{1,2})日/,

  // 価格形式: "¥7,999" または "￥7,999"
  PRICE: /^[¥￥]/,

  // 注文ID形式: "503-1234567-8901234"
  ORDER_ID: /^\d{3}-\d{7}-\d{7}$/,

  // URL内の注文ID
  ORDER_ID_IN_URL: /orderID=([^&]+)/,

  // 数量表記: "数量: 2" または "数量2"
  QUANTITY: /数量[:\s]*(\d+)/,

  // 価格から不要文字を除去
  PRICE_CLEANUP: /[¥￥,\s]/g
});

/**
 * 設定値
 * @readonly
 * @type {Object.<string, number>}
 */
const Config = Object.freeze({
  // ページあたりの注文数
  ORDERS_PER_PAGE: 10,

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

  // 年選択の範囲
  YEAR_RANGE: 5,

  // 最大注文数（安全制限）
  MAX_ORDERS_LIMIT: 10000
});

/**
 * Amazon URL定義
 * @readonly
 * @type {Object.<string, string>}
 */
const URLs = Object.freeze({
  BASE: 'https://www.amazon.co.jp',
  ORDER_HISTORY: 'https://www.amazon.co.jp/gp/your-account/order-history',
  LOGIN_PATHS: ['/ap/signin', '/ap/login']
});

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 日本語日付形式をISO形式に変換
 *
 * @param {string|null|undefined} dateStr - 日本語日付文字列 (例: "2024年12月25日")
 * @returns {string} ISO形式の日付文字列 (例: "2024-12-25")、パース失敗時は空文字列
 *
 * @example
 * parseJapaneseDate("2024年12月25日") // => "2024-12-25"
 * parseJapaneseDate("2024年1月5日")   // => "2024-01-05"
 * parseJapaneseDate(null)             // => ""
 * parseJapaneseDate("invalid")        // => "invalid"
 */
function parseJapaneseDate(dateStr) {
  // nullやundefinedのチェック
  if (dateStr == null || typeof dateStr !== 'string') {
    return '';
  }

  const trimmed = dateStr.trim();
  if (trimmed === '') {
    return '';
  }

  const match = trimmed.match(Patterns.JAPANESE_DATE);
  if (match) {
    const [, year, month, day] = match;
    // 月と日を2桁にパディング
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    return `${year}-${paddedMonth}-${paddedDay}`;
  }

  // パターンにマッチしない場合は元の文字列を返す
  return trimmed;
}

/**
 * 価格文字列を数値に変換
 *
 * @param {string|null|undefined} priceStr - 価格文字列 (例: "¥7,999")
 * @returns {number} 数値化された価格、変換失敗時は0
 *
 * @example
 * parsePrice("¥7,999")   // => 7999
 * parsePrice("￥1,234")  // => 1234
 * parsePrice("999")      // => 999
 * parsePrice(null)       // => 0
 * parsePrice("invalid")  // => 0
 */
function parsePrice(priceStr) {
  // nullやundefinedのチェック
  if (priceStr == null || typeof priceStr !== 'string') {
    return 0;
  }

  // 価格関連の文字を除去して数値に変換
  const cleaned = priceStr.replace(Patterns.PRICE_CLEANUP, '');
  const parsed = parseInt(cleaned, 10);

  // NaNチェック: 不正な値は0を返す
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * 数量文字列を数値に変換
 *
 * @param {string|null|undefined} text - 数量を含むテキスト (例: "数量: 2")
 * @returns {number} 抽出された数量、見つからない場合は1
 *
 * @example
 * parseQuantity("数量: 2")  // => 2
 * parseQuantity("数量3")    // => 3
 * parseQuantity("テスト")   // => 1
 */
function parseQuantity(text) {
  if (text == null || typeof text !== 'string') {
    return 1;
  }

  const match = text.match(Patterns.QUANTITY);
  if (match) {
    const parsed = parseInt(match[1], 10);
    return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
  }

  return 1;
}

/**
 * 注文IDの形式を検証
 *
 * @param {string|null|undefined} orderId - 検証する注文ID
 * @returns {boolean} 有効な形式の場合true
 *
 * @example
 * isValidOrderId("503-1234567-8901234")  // => true
 * isValidOrderId("invalid")               // => false
 */
function isValidOrderId(orderId) {
  if (orderId == null || typeof orderId !== 'string') {
    return false;
  }
  return Patterns.ORDER_ID.test(orderId.trim());
}

/**
 * 日付形式の検証
 *
 * @param {string|null|undefined} dateStr - 検証する日付文字列
 * @returns {boolean} ISO形式(YYYY-MM-DD)の場合true
 */
function isValidISODate(dateStr) {
  if (dateStr == null || typeof dateStr !== 'string') {
    return false;
  }

  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoPattern.test(dateStr)) {
    return false;
  }

  // 実際に有効な日付かチェック
  const date = new Date(dateStr);
  return !Number.isNaN(date.getTime());
}

/**
 * CSV用に文字列をエスケープ
 * カンマ、ダブルクォート、改行を含む場合はダブルクォートで囲む
 *
 * @param {string|null|undefined} str - エスケープする文字列
 * @returns {string} エスケープされた文字列
 *
 * @example
 * escapeCSV("hello, world")  // => '"hello, world"'
 * escapeCSV('say "hi"')      // => '"say ""hi"""'
 * escapeCSV("normal")        // => "normal"
 */
function escapeCSV(str) {
  if (str == null) {
    return '';
  }

  const strValue = String(str);

  // エスケープが必要な文字を含むかチェック
  if (strValue.includes(',') || strValue.includes('"') ||
      strValue.includes('\n') || strValue.includes('\r')) {
    // ダブルクォートをエスケープしてから全体をダブルクォートで囲む
    return `"${strValue.replace(/"/g, '""')}"`;
  }

  return strValue;
}

/**
 * 指定範囲のランダムな遅延を生成
 *
 * @param {number} min - 最小遅延（ミリ秒）
 * @param {number} max - 最大遅延（ミリ秒）
 * @returns {Promise<void>} 遅延後に解決されるPromise
 * @throws {Error} 引数が不正な場合
 */
function delay(min, max) {
  // 引数のバリデーション
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw new Error('delay: min and max must be numbers');
  }
  if (min < 0 || max < 0) {
    throw new Error('delay: min and max must be non-negative');
  }
  if (min > max) {
    throw new Error('delay: min must be less than or equal to max');
  }

  const ms = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 固定時間の遅延を生成
 *
 * @param {number} ms - 遅延時間（ミリ秒）
 * @returns {Promise<void>} 遅延後に解決されるPromise
 */
function delayFixed(ms) {
  if (typeof ms !== 'number' || ms < 0) {
    throw new Error('delayFixed: ms must be a non-negative number');
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 指数バックオフ遅延を計算
 *
 * @param {number} retryCount - リトライ回数（0から開始）
 * @param {number} [baseDelay=1000] - 基本遅延（ミリ秒）
 * @param {number} [maxDelay=30000] - 最大遅延（ミリ秒）
 * @returns {number} 遅延時間（ミリ秒）
 */
function calculateBackoff(retryCount, baseDelay = 1000, maxDelay = 30000) {
  const exponentialDelay = baseDelay * Math.pow(2, retryCount);
  // ジッターを追加（±10%）
  const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * 安全にDOM要素のテキストを取得
 *
 * @param {Element|null|undefined} element - DOM要素
 * @returns {string} トリミングされたテキスト、要素がない場合は空文字列
 */
function safeGetText(element) {
  if (element == null) {
    return '';
  }
  return (element.textContent || '').trim();
}

/**
 * 複数のセレクタを試行してDOM要素を取得
 *
 * @param {Element} parent - 親要素
 * @param {string|string[]} selectors - 試行するセレクタ（文字列または配列）
 * @returns {Element|null} 見つかった要素、見つからない場合はnull
 */
function queryWithFallback(parent, selectors) {
  if (parent == null) {
    return null;
  }

  const selectorList = Array.isArray(selectors) ? selectors : [selectors];

  for (const selector of selectorList) {
    try {
      const element = parent.querySelector(selector);
      if (element) {
        return element;
      }
    } catch (e) {
      // 不正なセレクタは無視して次を試行
      console.warn(`[Amazon Order Exporter] Invalid selector: ${selector}`);
    }
  }

  return null;
}

/**
 * 注文データオブジェクトを作成
 *
 * @param {Object} params - パラメータ
 * @param {string} params.orderId - 注文ID
 * @param {string} params.date - 注文日（ISO形式）
 * @param {string} [params.time=''] - 注文時刻
 * @param {string} params.item - 商品名
 * @param {number} [params.quantity=1] - 数量
 * @param {number} [params.price=0] - 価格
 * @returns {Object} 正規化された注文データオブジェクト
 */
function createOrderData({ orderId, date, time = '', item, quantity = 1, price = 0 }) {
  return {
    orderId: String(orderId || ''),
    date: String(date || ''),
    time: String(time || ''),
    item: String(item || ''),
    quantity: Math.max(1, parseInt(quantity, 10) || 1),
    price: Math.max(0, parseInt(price, 10) || 0)
  };
}

/**
 * 現在のURLからログインが必要かどうかを判定
 *
 * @param {string} url - チェックするURL
 * @returns {boolean} ログインページの場合true
 */
function isLoginPage(url) {
  if (typeof url !== 'string') {
    return false;
  }

  return URLs.LOGIN_PATHS.some(path => url.includes(path));
}

/**
 * 現在のURLが注文履歴ページかどうかを判定
 *
 * @param {string} url - チェックするURL
 * @returns {boolean} 注文履歴ページの場合true
 */
function isOrderHistoryPage(url) {
  if (typeof url !== 'string') {
    return false;
  }

  return url.includes('/gp/your-account/order-history') ||
         url.includes('/gp/css/order-history');
}

/**
 * エクスポートエラーを生成
 *
 * @param {string} type - エラータイプ (ErrorTypes)
 * @param {string} [customMessage] - カスタムメッセージ（オプション）
 * @param {Error} [originalError] - 元のエラー（オプション）
 * @returns {Object} エラーオブジェクト
 */
function createExportError(type, customMessage = null, originalError = null) {
  const message = customMessage || ErrorMessages[type] || ErrorMessages[ErrorTypes.UNKNOWN_ERROR];

  return {
    success: false,
    error: type,
    message: message,
    originalError: originalError ? originalError.message : null,
    timestamp: new Date().toISOString()
  };
}

/**
 * 成功レスポンスを生成
 *
 * @param {Object} data - レスポンスデータ
 * @returns {Object} 成功レスポンスオブジェクト
 */
function createSuccessResponse(data) {
  return {
    success: true,
    ...data,
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// エクスポート（Chrome拡張機能のコンテキストに応じて使用）
// ============================================================================

// グローバルオブジェクトとして公開（content scriptおよびpopupで使用可能）
if (typeof window !== 'undefined') {
  window.AmazonExporterUtils = {
    // 定数
    ErrorTypes,
    ErrorMessages,
    DOMSelectors,
    Patterns,
    Config,
    URLs,

    // ユーティリティ関数
    parseJapaneseDate,
    parsePrice,
    parseQuantity,
    isValidOrderId,
    isValidISODate,
    escapeCSV,
    delay,
    delayFixed,
    calculateBackoff,
    safeGetText,
    queryWithFallback,
    createOrderData,
    isLoginPage,
    isOrderHistoryPage,
    createExportError,
    createSuccessResponse
  };
}
