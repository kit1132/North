/**
 * Amazon Order Exporter - Content Script
 * Extracts order data from Amazon.co.jp order history pages
 */

(function() {
  'use strict';

  /**
   * Parse Japanese date format to ISO format
   * @param {string} dateStr - Date string like "2024年12月25日"
   * @returns {string} ISO format date "2024-12-25"
   */
  function parseJapaneseDate(dateStr) {
    if (!dateStr) return '';
    const match = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (match) {
      const [_, year, month, day] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return dateStr;
  }

  /**
   * Parse price string to integer
   * @param {string} priceStr - Price string like "¥7,999"
   * @returns {number} Numeric price value
   */
  function parsePrice(priceStr) {
    if (!priceStr) return 0;
    return parseInt(priceStr.replace(/[¥,￥\s]/g, ''), 10) || 0;
  }

  /**
   * Extract order data from a single order card element
   * @param {Element} card - Order card DOM element
   * @returns {Array} Array of order items
   */
  function extractOrderData(card) {
    const orders = [];

    // Get order meta info (date, total, order ID)
    const orderInfoValues = card.querySelectorAll('.order-info span.a-color-secondary.value');

    let orderDate = '';
    let orderTotal = 0;
    let orderId = '';

    if (orderInfoValues.length >= 3) {
      orderDate = parseJapaneseDate(orderInfoValues[0]?.textContent?.trim());
      orderTotal = parsePrice(orderInfoValues[1]?.textContent?.trim());
      orderId = orderInfoValues[2]?.textContent?.trim() || '';
    } else if (orderInfoValues.length >= 1) {
      // Fallback: try to extract what we can
      orderInfoValues.forEach(val => {
        const text = val.textContent?.trim() || '';
        if (text.match(/\d{4}年\d{1,2}月\d{1,2}日/)) {
          orderDate = parseJapaneseDate(text);
        } else if (text.match(/^¥|^￥/)) {
          orderTotal = parsePrice(text);
        } else if (text.match(/^\d{3}-\d{7}-\d{7}$/)) {
          orderId = text;
        }
      });
    }

    // Alternative selectors for order ID if not found
    if (!orderId) {
      const orderIdLink = card.querySelector('a[href*="order-details"]');
      if (orderIdLink) {
        const match = orderIdLink.href.match(/orderID=([^&]+)/);
        if (match) orderId = match[1];
      }
    }

    // Get product items
    const items = card.querySelectorAll('.yohtmlc-item');

    if (items.length === 0) {
      // Fallback: try alternative selectors
      const altItems = card.querySelectorAll('.a-fixed-left-grid-inner');
      altItems.forEach(item => {
        const title = item.querySelector('.a-link-normal')?.textContent?.trim();
        const priceEl = item.querySelector('.a-price .a-offscreen, .a-color-price');
        const price = parsePrice(priceEl?.textContent);

        if (title) {
          orders.push({
            orderId: orderId,
            date: orderDate,
            time: '', // Time not available on list page
            item: title,
            quantity: 1, // Default quantity
            price: price || Math.floor(orderTotal / Math.max(1, items.length))
          });
        }
      });
    } else {
      items.forEach(item => {
        const titleEl = item.querySelector('.yohtmlc-product-title');
        const title = titleEl?.textContent?.trim();

        const priceEl = item.querySelector('span.a-price span.a-offscreen');
        let price = parsePrice(priceEl?.textContent);

        // Fallback price selectors
        if (!price) {
          const altPriceEl = item.querySelector('.a-color-price, .a-price-whole');
          price = parsePrice(altPriceEl?.textContent);
        }

        // Try to get quantity
        let quantity = 1;
        const qtyMatch = item.textContent?.match(/数量[:\s]*(\d+)/);
        if (qtyMatch) {
          quantity = parseInt(qtyMatch[1], 10) || 1;
        }

        if (title) {
          orders.push({
            orderId: orderId,
            date: orderDate,
            time: '', // Time not available on list page
            item: title,
            quantity: quantity,
            price: price || 0
          });
        }
      });
    }

    return orders;
  }

  /**
   * Extract all orders from the current page
   * @returns {Array} Array of all order items on the page
   */
  function extractAllOrders() {
    const orderCards = document.querySelectorAll('.order-card');
    const allOrders = [];

    orderCards.forEach(card => {
      const orders = extractOrderData(card);
      allOrders.push(...orders);
    });

    return allOrders;
  }

  /**
   * Check if there's a next page
   * @returns {boolean} True if next page exists
   */
  function hasNextPage() {
    const pagination = document.querySelector('.a-pagination');
    const nextPage = pagination?.querySelector('li.a-last:not(.a-disabled) a');
    return !!nextPage;
  }

  /**
   * Get the current page number
   * @returns {number} Current page number (1-indexed)
   */
  function getCurrentPageNumber() {
    const urlParams = new URLSearchParams(window.location.search);
    const startIndex = parseInt(urlParams.get('startIndex'), 10) || 0;
    return Math.floor(startIndex / 10) + 1;
  }

  /**
   * Check if we're on a login page
   * @returns {boolean} True if login is required
   */
  function isLoginRequired() {
    return window.location.href.includes('/ap/signin') ||
           window.location.href.includes('/ap/login') ||
           document.querySelector('form[name="signIn"]') !== null;
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractOrders') {
      try {
        if (isLoginRequired()) {
          sendResponse({
            success: false,
            error: 'LOGIN_REQUIRED',
            message: 'ログインが必要です。Amazonにログインしてから再度お試しください。'
          });
          return true;
        }

        const orders = extractAllOrders();
        const hasMore = hasNextPage();
        const currentPage = getCurrentPageNumber();

        sendResponse({
          success: true,
          orders: orders,
          hasNextPage: hasMore,
          currentPage: currentPage,
          pageUrl: window.location.href
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: 'EXTRACTION_ERROR',
          message: error.message
        });
      }
      return true; // Keep message channel open for async response
    }

    if (request.action === 'checkPage') {
      const isOrderHistoryPage = window.location.href.includes('/gp/your-account/order-history') ||
                                  window.location.href.includes('/gp/css/order-history');
      sendResponse({
        isOrderHistoryPage: isOrderHistoryPage,
        isLoginRequired: isLoginRequired(),
        url: window.location.href
      });
      return true;
    }
  });

  // Log that content script is loaded (for debugging)
  console.log('[Amazon Order Exporter] Content script loaded on:', window.location.href);
})();
