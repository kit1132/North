/**
 * Amazon Order Exporter - Content Script
 * Amazon.co.jp注文履歴ページからデータを抽出するスクリプト
 *
 * @fileoverview このスクリプトはAmazonの注文履歴ページに注入され、
 * DOM解析によって注文データを抽出します。
 */

(function() {
  'use strict';

  // ============================================================================
  // 定数・ユーティリティ（utils.jsがロードされていない場合のフォールバック）
  // ============================================================================

  /**
   * ユーティリティへの参照を取得
   * @returns {Object} ユーティリティオブジェクト
   */
  function getUtils() {
    if (typeof window !== 'undefined' && window.AmazonExporterUtils) {
      return window.AmazonExporterUtils;
    }
    // フォールバック: 最小限の実装
    return createFallbackUtils();
  }

  /**
   * utils.jsがロードされていない場合のフォールバック実装
   * @returns {Object} 最小限のユーティリティ
   */
  function createFallbackUtils() {
    const ErrorTypes = {
      LOGIN_REQUIRED: 'LOGIN_REQUIRED',
      EXTRACTION_ERROR: 'EXTRACTION_ERROR',
      DOM_STRUCTURE_CHANGED: 'DOM_STRUCTURE_CHANGED',
      UNKNOWN_ERROR: 'UNKNOWN_ERROR'
    };

    const DOMSelectors = {
      ORDER_CARD: '.order-card',
      ORDER_INFO_VALUES: '.order-info span.a-color-secondary.value',
      PRODUCT_ITEM: '.yohtmlc-item',
      PRODUCT_TITLE: '.yohtmlc-product-title',
      PRODUCT_PRICE: 'span.a-price span.a-offscreen',
      ALT_PRODUCT_ITEM: '.a-fixed-left-grid-inner',
      ALT_PRODUCT_TITLE: '.a-link-normal',
      ALT_PRODUCT_PRICE: ['.a-price .a-offscreen', '.a-color-price', '.a-price-whole'],
      ORDER_DETAILS_LINK: 'a[href*="order-details"]',
      PAGINATION: '.a-pagination',
      NEXT_PAGE: 'li.a-last:not(.a-disabled) a',
      LOGIN_FORM: 'form[name="signIn"]'
    };

    const Patterns = {
      JAPANESE_DATE: /(\d{4})年(\d{1,2})月(\d{1,2})日/,
      PRICE: /^[¥￥]/,
      ORDER_ID: /^\d{3}-\d{7}-\d{7}$/,
      ORDER_ID_IN_URL: /orderID=([^&]+)/,
      QUANTITY: /数量[:\s]*(\d+)/,
      PRICE_CLEANUP: /[¥￥,\s]/g
    };

    return {
      ErrorTypes,
      DOMSelectors,
      Patterns,

      parseJapaneseDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return '';
        const match = dateStr.trim().match(Patterns.JAPANESE_DATE);
        if (match) {
          const [, year, month, day] = match;
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return dateStr.trim();
      },

      parsePrice(priceStr) {
        if (!priceStr || typeof priceStr !== 'string') return 0;
        const parsed = parseInt(priceStr.replace(Patterns.PRICE_CLEANUP, ''), 10);
        return Number.isNaN(parsed) ? 0 : parsed;
      },

      parseQuantity(text) {
        if (!text || typeof text !== 'string') return 1;
        const match = text.match(Patterns.QUANTITY);
        if (match) {
          const parsed = parseInt(match[1], 10);
          return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
        }
        return 1;
      },

      safeGetText(element) {
        if (!element) return '';
        return (element.textContent || '').trim();
      },

      queryWithFallback(parent, selectors) {
        if (!parent) return null;
        const list = Array.isArray(selectors) ? selectors : [selectors];
        for (const sel of list) {
          try {
            const el = parent.querySelector(sel);
            if (el) return el;
          } catch (e) { /* ignore */ }
        }
        return null;
      },

      createOrderData({ orderId, date, time = '', item, quantity = 1, price = 0 }) {
        return {
          orderId: String(orderId || ''),
          date: String(date || ''),
          time: String(time || ''),
          item: String(item || ''),
          quantity: Math.max(1, parseInt(quantity, 10) || 1),
          price: Math.max(0, parseInt(price, 10) || 0)
        };
      },

      createExportError(type, message) {
        return { success: false, error: type, message };
      },

      createSuccessResponse(data) {
        return { success: true, ...data };
      }
    };
  }

  // ============================================================================
  // 抽出ロジック
  // ============================================================================

  /**
   * 注文カードからメタ情報（日付、合計、注文ID）を抽出
   *
   * @param {Element} card - 注文カードのDOM要素
   * @param {Object} utils - ユーティリティオブジェクト
   * @returns {Object} 抽出されたメタ情報
   */
  function extractOrderMeta(card, utils) {
    const { DOMSelectors, Patterns, parseJapaneseDate, parsePrice, safeGetText } = utils;

    let orderDate = '';
    let orderTotal = 0;
    let orderId = '';

    try {
      const orderInfoValues = card.querySelectorAll(DOMSelectors.ORDER_INFO_VALUES);

      // ケース1: 標準的なDOM構造（3つの値が順番に並ぶ）
      if (orderInfoValues.length >= 3) {
        orderDate = parseJapaneseDate(safeGetText(orderInfoValues[0]));
        orderTotal = parsePrice(safeGetText(orderInfoValues[1]));
        orderId = safeGetText(orderInfoValues[2]);
      }
      // ケース2: DOM構造が異なる場合、パターンマッチで判別
      else if (orderInfoValues.length >= 1) {
        orderInfoValues.forEach(val => {
          const text = safeGetText(val);
          if (!text) return;

          // 日付パターン
          if (Patterns.JAPANESE_DATE.test(text)) {
            orderDate = parseJapaneseDate(text);
          }
          // 価格パターン
          else if (Patterns.PRICE.test(text)) {
            orderTotal = parsePrice(text);
          }
          // 注文IDパターン
          else if (Patterns.ORDER_ID.test(text)) {
            orderId = text;
          }
        });
      }

      // フォールバック: リンクから注文IDを取得
      if (!orderId) {
        const orderIdLink = card.querySelector(DOMSelectors.ORDER_DETAILS_LINK);
        if (orderIdLink && orderIdLink.href) {
          const match = orderIdLink.href.match(Patterns.ORDER_ID_IN_URL);
          if (match) {
            orderId = match[1];
          }
        }
      }
    } catch (error) {
      // DOM解析エラーは警告としてログ出力
      console.warn('[Amazon Order Exporter] メタ情報抽出エラー:', error.message);
    }

    return { orderDate, orderTotal, orderId };
  }

  /**
   * 商品アイテムリストからデータを抽出
   *
   * @param {Element} card - 注文カードのDOM要素
   * @param {Object} meta - 注文メタ情報
   * @param {Object} utils - ユーティリティオブジェクト
   * @returns {Array} 抽出された商品データの配列
   */
  function extractProductItems(card, meta, utils) {
    const { DOMSelectors, parsePrice, parseQuantity, safeGetText, queryWithFallback, createOrderData } = utils;
    const { orderDate, orderTotal, orderId } = meta;
    const orders = [];

    try {
      // 標準セレクタで商品アイテムを検索
      let items = card.querySelectorAll(DOMSelectors.PRODUCT_ITEM);

      // 商品が見つからない場合、フォールバックセレクタを使用
      if (items.length === 0) {
        items = card.querySelectorAll(DOMSelectors.ALT_PRODUCT_ITEM);

        items.forEach((item, index) => {
          const titleEl = queryWithFallback(item, DOMSelectors.ALT_PRODUCT_TITLE);
          const title = safeGetText(titleEl);

          if (!title) return; // タイトルがない商品はスキップ

          const priceEl = queryWithFallback(item, DOMSelectors.ALT_PRODUCT_PRICE);
          let price = parsePrice(safeGetText(priceEl));

          // 価格が取得できない場合、合計を商品数で割る（推定値）
          if (price === 0 && orderTotal > 0 && items.length > 0) {
            price = Math.floor(orderTotal / items.length);
          }

          orders.push(createOrderData({
            orderId,
            date: orderDate,
            time: '', // 一覧ページでは時刻は取得不可
            item: title,
            quantity: 1,
            price
          }));
        });
      } else {
        // 標準セレクタで商品情報を抽出
        items.forEach((item, index) => {
          const titleEl = item.querySelector(DOMSelectors.PRODUCT_TITLE);
          const title = safeGetText(titleEl);

          if (!title) return; // タイトルがない商品はスキップ

          // 価格を取得（複数セレクタを試行）
          let priceEl = item.querySelector(DOMSelectors.PRODUCT_PRICE);
          let price = parsePrice(safeGetText(priceEl));

          if (price === 0) {
            priceEl = queryWithFallback(item, DOMSelectors.ALT_PRODUCT_PRICE);
            price = parsePrice(safeGetText(priceEl));
          }

          // 数量を取得
          const quantity = parseQuantity(item.textContent);

          orders.push(createOrderData({
            orderId,
            date: orderDate,
            time: '',
            item: title,
            quantity,
            price
          }));
        });
      }
    } catch (error) {
      console.warn('[Amazon Order Exporter] 商品情報抽出エラー:', error.message);
    }

    return orders;
  }

  /**
   * 単一の注文カードから全データを抽出
   *
   * @param {Element} card - 注文カードのDOM要素
   * @param {Object} utils - ユーティリティオブジェクト
   * @returns {Array} 抽出された注文データの配列
   */
  function extractOrderData(card, utils) {
    if (!card) {
      return [];
    }

    const meta = extractOrderMeta(card, utils);
    return extractProductItems(card, meta, utils);
  }

  /**
   * 現在のページから全注文を抽出
   *
   * @param {Object} utils - ユーティリティオブジェクト
   * @returns {Object} 抽出結果オブジェクト
   */
  function extractAllOrders(utils) {
    const { DOMSelectors, ErrorTypes, createExportError, createSuccessResponse } = utils;

    try {
      // ログインチェック
      if (checkLoginRequired(utils)) {
        return createExportError(
          ErrorTypes.LOGIN_REQUIRED,
          'ログインが必要です。Amazonにログインしてから再度お試しください。'
        );
      }

      // 注文カードを取得
      const orderCards = document.querySelectorAll(DOMSelectors.ORDER_CARD);

      // 注文がない場合（DOM構造が変わった可能性も考慮）
      if (orderCards.length === 0) {
        console.warn('[Amazon Order Exporter] 注文カードが見つかりません。DOM構造が変更された可能性があります。');
      }

      const allOrders = [];
      let extractionErrors = 0;

      orderCards.forEach((card, index) => {
        try {
          const orders = extractOrderData(card, utils);
          allOrders.push(...orders);
        } catch (error) {
          extractionErrors++;
          console.error(`[Amazon Order Exporter] カード${index + 1}の抽出エラー:`, error);
        }
      });

      // 統計情報をログ出力
      console.log(`[Amazon Order Exporter] 抽出完了: ${allOrders.length}件の商品 (${orderCards.length}件の注文カードから)`);

      if (extractionErrors > 0) {
        console.warn(`[Amazon Order Exporter] ${extractionErrors}件の抽出エラーが発生しました`);
      }

      return createSuccessResponse({
        orders: allOrders,
        hasNextPage: checkHasNextPage(utils),
        currentPage: getCurrentPageNumber(),
        pageUrl: window.location.href,
        stats: {
          orderCards: orderCards.length,
          extractedItems: allOrders.length,
          errors: extractionErrors
        }
      });
    } catch (error) {
      console.error('[Amazon Order Exporter] 抽出処理で予期しないエラー:', error);
      return createExportError(
        ErrorTypes.EXTRACTION_ERROR,
        `抽出エラー: ${error.message}`
      );
    }
  }

  // ============================================================================
  // ページ状態チェック
  // ============================================================================

  /**
   * ログインが必要かどうかをチェック
   *
   * @param {Object} utils - ユーティリティオブジェクト
   * @returns {boolean} ログインが必要な場合true
   */
  function checkLoginRequired(utils) {
    const { DOMSelectors } = utils;

    // URL によるチェック
    const url = window.location.href;
    if (url.includes('/ap/signin') || url.includes('/ap/login')) {
      return true;
    }

    // ログインフォームの存在チェック
    const loginForm = document.querySelector(DOMSelectors.LOGIN_FORM);
    return loginForm !== null;
  }

  /**
   * 次のページが存在するかチェック
   *
   * @param {Object} utils - ユーティリティオブジェクト
   * @returns {boolean} 次ページが存在する場合true
   */
  function checkHasNextPage(utils) {
    const { DOMSelectors } = utils;

    try {
      const pagination = document.querySelector(DOMSelectors.PAGINATION);
      if (!pagination) {
        return false;
      }

      const nextPage = pagination.querySelector(DOMSelectors.NEXT_PAGE);
      return nextPage !== null;
    } catch (error) {
      console.warn('[Amazon Order Exporter] ページネーションチェックエラー:', error);
      return false;
    }
  }

  /**
   * 現在のページ番号を取得
   *
   * @returns {number} ページ番号（1から開始）
   */
  function getCurrentPageNumber() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const startIndex = parseInt(urlParams.get('startIndex'), 10);

      if (Number.isNaN(startIndex) || startIndex < 0) {
        return 1;
      }

      // Amazonは10件ずつ表示
      return Math.floor(startIndex / 10) + 1;
    } catch (error) {
      return 1;
    }
  }

  /**
   * 現在のページが注文履歴ページかチェック
   *
   * @returns {boolean} 注文履歴ページの場合true
   */
  function isOrderHistoryPage() {
    const url = window.location.href;
    return url.includes('/gp/your-account/order-history') ||
           url.includes('/gp/css/order-history');
  }

  // ============================================================================
  // メッセージハンドラ
  // ============================================================================

  /**
   * Chrome拡張機能のメッセージリスナーを設定
   */
  function setupMessageListener() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) {
      console.warn('[Amazon Order Exporter] Chrome拡張機能APIが利用できません');
      return;
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const utils = getUtils();

      // リクエストのバリデーション
      if (!request || typeof request.action !== 'string') {
        sendResponse(utils.createExportError(
          utils.ErrorTypes.VALIDATION_ERROR || 'VALIDATION_ERROR',
          '不正なリクエストです'
        ));
        return true;
      }

      try {
        switch (request.action) {
          case 'extractOrders':
            handleExtractOrders(sendResponse, utils);
            break;

          case 'checkPage':
            handleCheckPage(sendResponse, utils);
            break;

          case 'ping':
            // 接続確認用
            sendResponse({ success: true, message: 'pong' });
            break;

          default:
            sendResponse(utils.createExportError(
              utils.ErrorTypes.VALIDATION_ERROR || 'VALIDATION_ERROR',
              `不明なアクション: ${request.action}`
            ));
        }
      } catch (error) {
        console.error('[Amazon Order Exporter] メッセージ処理エラー:', error);
        sendResponse(utils.createExportError(
          utils.ErrorTypes.UNKNOWN_ERROR || 'UNKNOWN_ERROR',
          `処理エラー: ${error.message}`
        ));
      }

      return true; // 非同期レスポンスのためチャネルを開いておく
    });
  }

  /**
   * 注文抽出リクエストを処理
   *
   * @param {Function} sendResponse - レスポンス送信関数
   * @param {Object} utils - ユーティリティオブジェクト
   */
  function handleExtractOrders(sendResponse, utils) {
    const result = extractAllOrders(utils);
    sendResponse(result);
  }

  /**
   * ページチェックリクエストを処理
   *
   * @param {Function} sendResponse - レスポンス送信関数
   * @param {Object} utils - ユーティリティオブジェクト
   */
  function handleCheckPage(sendResponse, utils) {
    sendResponse({
      success: true,
      isOrderHistoryPage: isOrderHistoryPage(),
      isLoginRequired: checkLoginRequired(utils),
      url: window.location.href,
      pageNumber: getCurrentPageNumber()
    });
  }

  // ============================================================================
  // 初期化
  // ============================================================================

  /**
   * スクリプト初期化
   */
  function initialize() {
    setupMessageListener();

    // 初期化完了をログ出力
    console.log('[Amazon Order Exporter] Content script loaded:', {
      url: window.location.href,
      isOrderHistoryPage: isOrderHistoryPage(),
      timestamp: new Date().toISOString()
    });
  }

  // スクリプト実行
  initialize();
})();
