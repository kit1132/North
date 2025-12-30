/**
 * Amazon Order Exporter - Background Service Worker
 * Handles multi-page fetching and coordination
 */

// Base URL for Amazon order history
const ORDER_HISTORY_BASE_URL = 'https://www.amazon.co.jp/gp/your-account/order-history';

/**
 * Generate a random delay between min and max milliseconds
 * @param {number} min - Minimum delay in ms
 * @param {number} max - Maximum delay in ms
 * @returns {Promise} Promise that resolves after the delay
 */
function delay(min, max) {
  const ms = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch orders from a specific page using tabs
 * @param {number} tabId - Tab ID to use
 * @param {string} url - URL to fetch
 * @returns {Promise} Promise resolving to order data
 */
async function fetchOrdersFromTab(tabId, url) {
  return new Promise((resolve, reject) => {
    // Navigate to the URL
    chrome.tabs.update(tabId, { url: url }, async (tab) => {
      // Wait for page to load
      const checkLoaded = () => {
        return new Promise((resolveCheck) => {
          const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolveCheck();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);

          // Timeout after 30 seconds
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolveCheck();
          }, 30000);
        });
      };

      await checkLoaded();

      // Give the page a moment to render
      await delay(1000, 2000);

      // Execute content script to extract orders
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: extractOrdersFromPage
        });

        if (results && results[0] && results[0].result) {
          resolve(results[0].result);
        } else {
          reject(new Error('Failed to extract orders from page'));
        }
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Function to be injected into the page for order extraction
 * This is a copy of the extraction logic for direct injection
 */
function extractOrdersFromPage() {
  function parseJapaneseDate(dateStr) {
    if (!dateStr) return '';
    const match = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (match) {
      const [_, year, month, day] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return dateStr;
  }

  function parsePrice(priceStr) {
    if (!priceStr) return 0;
    return parseInt(priceStr.replace(/[¥,￥\s]/g, ''), 10) || 0;
  }

  function extractOrderData(card) {
    const orders = [];
    const orderInfoValues = card.querySelectorAll('.order-info span.a-color-secondary.value');

    let orderDate = '';
    let orderId = '';

    if (orderInfoValues.length >= 3) {
      orderDate = parseJapaneseDate(orderInfoValues[0]?.textContent?.trim());
      orderId = orderInfoValues[2]?.textContent?.trim() || '';
    } else {
      orderInfoValues.forEach(val => {
        const text = val.textContent?.trim() || '';
        if (text.match(/\d{4}年\d{1,2}月\d{1,2}日/)) {
          orderDate = parseJapaneseDate(text);
        } else if (text.match(/^\d{3}-\d{7}-\d{7}$/)) {
          orderId = text;
        }
      });
    }

    if (!orderId) {
      const orderIdLink = card.querySelector('a[href*="order-details"]');
      if (orderIdLink) {
        const match = orderIdLink.href.match(/orderID=([^&]+)/);
        if (match) orderId = match[1];
      }
    }

    const items = card.querySelectorAll('.yohtmlc-item');
    items.forEach(item => {
      const titleEl = item.querySelector('.yohtmlc-product-title');
      const title = titleEl?.textContent?.trim();
      const priceEl = item.querySelector('span.a-price span.a-offscreen');
      let price = parsePrice(priceEl?.textContent);

      if (!price) {
        const altPriceEl = item.querySelector('.a-color-price, .a-price-whole');
        price = parsePrice(altPriceEl?.textContent);
      }

      let quantity = 1;
      const qtyMatch = item.textContent?.match(/数量[:\s]*(\d+)/);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1], 10) || 1;
      }

      if (title) {
        orders.push({
          orderId: orderId,
          date: orderDate,
          time: '',
          item: title,
          quantity: quantity,
          price: price || 0
        });
      }
    });

    return orders;
  }

  const isLoginRequired = window.location.href.includes('/ap/signin') ||
                          window.location.href.includes('/ap/login') ||
                          document.querySelector('form[name="signIn"]') !== null;

  if (isLoginRequired) {
    return {
      success: false,
      error: 'LOGIN_REQUIRED',
      message: 'ログインが必要です'
    };
  }

  const orderCards = document.querySelectorAll('.order-card');
  const allOrders = [];
  orderCards.forEach(card => {
    allOrders.push(...extractOrderData(card));
  });

  const pagination = document.querySelector('.a-pagination');
  const nextPage = pagination?.querySelector('li.a-last:not(.a-disabled) a');
  const hasNextPage = !!nextPage;

  return {
    success: true,
    orders: allOrders,
    hasNextPage: hasNextPage,
    url: window.location.href
  };
}

/**
 * Fetch all orders for a specific year
 * @param {number} year - Year to fetch orders for
 * @param {number} tabId - Tab ID to use for fetching
 * @param {Function} progressCallback - Callback for progress updates
 * @returns {Promise} Promise resolving to all orders
 */
async function fetchAllOrdersForYear(year, tabId, progressCallback) {
  const allOrders = [];
  let startIndex = 0;
  let hasMore = true;
  let pageNum = 1;
  let retryCount = 0;
  const maxRetries = 3;

  while (hasMore) {
    const url = `${ORDER_HISTORY_BASE_URL}?orderFilter=year-${year}&startIndex=${startIndex}`;

    try {
      // Send progress update
      if (progressCallback) {
        progressCallback({
          type: 'progress',
          page: pageNum,
          ordersCount: allOrders.length,
          status: `ページ ${pageNum} を取得中...`
        });
      }

      const result = await fetchOrdersFromTab(tabId, url);

      if (!result.success) {
        if (result.error === 'LOGIN_REQUIRED') {
          throw new Error('LOGIN_REQUIRED');
        }
        throw new Error(result.message || 'Failed to extract orders');
      }

      allOrders.push(...result.orders);
      hasMore = result.hasNextPage;
      retryCount = 0;

      if (hasMore) {
        startIndex += 10;
        pageNum++;
        // Random delay between pages (2-4 seconds)
        await delay(2000, 4000);
      }
    } catch (error) {
      if (error.message === 'LOGIN_REQUIRED') {
        throw error;
      }

      retryCount++;
      if (retryCount >= maxRetries) {
        throw new Error(`Failed after ${maxRetries} retries: ${error.message}`);
      }

      // Exponential backoff
      const backoffTime = Math.pow(2, retryCount) * 1000;
      await delay(backoffTime, backoffTime + 1000);
    }
  }

  return allOrders;
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchAllOrders') {
    const { year, tabId } = request;

    fetchAllOrdersForYear(year, tabId, (progress) => {
      // Send progress updates to popup
      chrome.runtime.sendMessage({
        action: 'progressUpdate',
        ...progress
      });
    })
    .then(orders => {
      sendResponse({
        success: true,
        orders: orders
      });
    })
    .catch(error => {
      sendResponse({
        success: false,
        error: error.message
      });
    });

    return true; // Keep message channel open for async response
  }

  if (request.action === 'saveOrders') {
    const { orders, year } = request;
    chrome.storage.local.set({
      [`orders_${year}`]: orders,
      lastUpdate: Date.now()
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'getStoredOrders') {
    const { year } = request;
    chrome.storage.local.get([`orders_${year}`, 'lastUpdate'], (result) => {
      sendResponse({
        orders: result[`orders_${year}`] || [],
        lastUpdate: result.lastUpdate
      });
    });
    return true;
  }
});

// Log that service worker is active
console.log('[Amazon Order Exporter] Service worker started');
