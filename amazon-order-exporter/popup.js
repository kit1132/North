/**
 * Amazon Order Exporter - Popup Script
 * Main logic for the extension popup
 */

(function() {
  'use strict';

  // DOM Elements
  const yearSelect = document.getElementById('yearSelect');
  const exportBtn = document.getElementById('exportBtn');
  const copyBtn = document.getElementById('copyBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const resultContainer = document.getElementById('resultContainer');
  const orderCount = document.getElementById('orderCount');
  const totalSpent = document.getElementById('totalSpent');
  const statusMessage = document.getElementById('statusMessage');

  // State
  let currentOrders = [];
  let csvContent = '';

  /**
   * Initialize the popup
   */
  function init() {
    populateYearSelect();
    setupEventListeners();
    checkCurrentTab();
  }

  /**
   * Populate the year select dropdown with past 5 years
   */
  function populateYearSelect() {
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 5; i++) {
      const year = currentYear - i;
      const option = document.createElement('option');
      option.value = year;
      option.textContent = `${year}年`;
      yearSelect.appendChild(option);
    }
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    exportBtn.addEventListener('click', handleExport);
    copyBtn.addEventListener('click', handleCopy);

    // Listen for progress updates from background script
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'progressUpdate') {
        updateProgress(message);
      }
    });
  }

  /**
   * Check if the current tab is an Amazon order history page
   */
  async function checkCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url || !tab.url.includes('amazon.co.jp')) {
        showStatus('warning', 'Amazon.co.jpのページで実行してください。');
        exportBtn.disabled = true;
        return;
      }

      if (!tab.url.includes('/gp/your-account/order-history') &&
          !tab.url.includes('/gp/css/order-history')) {
        showStatus('info', '注文履歴ページに移動してからエクスポートを開始してください。');
      }
    } catch (error) {
      console.error('Error checking current tab:', error);
    }
  }

  /**
   * Handle export button click
   */
  async function handleExport() {
    const year = yearSelect.value;

    try {
      setExportLoading(true);
      hideStatus();
      hideResult();
      showProgress();

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        throw new Error('アクティブなタブが見つかりません');
      }

      // Navigate to the order history page for the selected year
      const orderHistoryUrl = `https://www.amazon.co.jp/gp/your-account/order-history?orderFilter=year-${year}&startIndex=0`;

      // Update the current tab to the order history page
      await chrome.tabs.update(tab.id, { url: orderHistoryUrl });

      // Wait for page to load
      await waitForTabLoad(tab.id);

      // Inject content script if needed and extract orders
      currentOrders = await extractOrdersFromAllPages(tab.id, year);

      // Generate CSV
      csvContent = generateCSV(currentOrders, year);

      // Show results
      showResult(currentOrders);
      showStatus('success', 'エクスポートが完了しました！');

    } catch (error) {
      console.error('Export error:', error);

      if (error.message === 'LOGIN_REQUIRED') {
        showStatus('error', 'ログインが必要です。Amazonにログインしてから再度お試しください。');
      } else {
        showStatus('error', `エラー: ${error.message}`);
      }
    } finally {
      setExportLoading(false);
      hideProgress();
    }
  }

  /**
   * Wait for a tab to finish loading
   * @param {number} tabId - Tab ID
   * @returns {Promise}
   */
  function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          // Extra delay for JavaScript to execute
          setTimeout(resolve, 2000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);

      // Timeout after 30 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 30000);
    });
  }

  /**
   * Extract orders from all pages for a given year
   * @param {number} tabId - Tab ID
   * @param {number} year - Year to extract
   * @returns {Promise<Array>} All orders
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

      // Extract orders from current page
      const result = await executeContentScript(tabId);

      if (!result.success) {
        if (result.error === 'LOGIN_REQUIRED') {
          throw new Error('LOGIN_REQUIRED');
        }
        throw new Error(result.message || '注文データの抽出に失敗しました');
      }

      allOrders.push(...result.orders);
      hasMore = result.hasNextPage;

      if (hasMore) {
        startIndex += 10;
        pageNum++;

        // Navigate to next page
        const nextUrl = `https://www.amazon.co.jp/gp/your-account/order-history?orderFilter=year-${year}&startIndex=${startIndex}`;
        await chrome.tabs.update(tabId, { url: nextUrl });
        await waitForTabLoad(tabId);

        // Random delay to avoid rate limiting (2-4 seconds)
        await delay(2000 + Math.random() * 2000);
      }
    }

    return allOrders;
  }

  /**
   * Execute content script on a tab and get orders
   * @param {number} tabId - Tab ID
   * @returns {Promise<Object>} Extraction result
   */
  async function executeContentScript(tabId) {
    try {
      // First try to send message to existing content script
      return await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'extractOrders' }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script not loaded, inject it
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      // Inject and execute content script
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: extractOrdersFunction
      });

      if (results && results[0] && results[0].result) {
        return results[0].result;
      }

      throw new Error('コンテンツスクリプトの実行に失敗しました');
    }
  }

  /**
   * Function to be injected for order extraction
   */
  function extractOrdersFunction() {
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
      let orderTotal = 0;
      let orderId = '';

      if (orderInfoValues.length >= 3) {
        orderDate = parseJapaneseDate(orderInfoValues[0]?.textContent?.trim());
        orderTotal = parsePrice(orderInfoValues[1]?.textContent?.trim());
        orderId = orderInfoValues[2]?.textContent?.trim() || '';
      } else {
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

      if (!orderId) {
        const orderIdLink = card.querySelector('a[href*="order-details"]');
        if (orderIdLink) {
          const match = orderIdLink.href.match(/orderID=([^&]+)/);
          if (match) orderId = match[1];
        }
      }

      const items = card.querySelectorAll('.yohtmlc-item');

      if (items.length === 0) {
        const altItems = card.querySelectorAll('.a-fixed-left-grid-inner');
        altItems.forEach(item => {
          const title = item.querySelector('.a-link-normal')?.textContent?.trim();
          const priceEl = item.querySelector('.a-price .a-offscreen, .a-color-price');
          const price = parsePrice(priceEl?.textContent);

          if (title) {
            orders.push({
              orderId: orderId,
              date: orderDate,
              time: '',
              item: title,
              quantity: 1,
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
      }

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
   * Generate CSV from orders
   * @param {Array} orders - Order data
   * @param {number} year - Year
   * @returns {string} CSV content
   */
  function generateCSV(orders, year) {
    const totalSpentAmount = orders.reduce((sum, o) => sum + o.price * o.quantity, 0);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Find date range
    const dates = orders.map(o => o.date).filter(d => d).sort();
    const startDate = dates[dates.length - 1] || `${year}-01-01`;
    const endDate = dates[0] || `${year}-12-31`;

    const header = [
      `# Amazon注文履歴エクスポート`,
      `# 期間: ${startDate} 〜 ${endDate}`,
      `# 総注文数: ${orders.length}件 | 総支出: ¥${totalSpentAmount.toLocaleString()}`,
      `# エクスポート日時: ${now}`,
      ``,
      `order_id,date,time,item,quantity,price`
    ].join('\n');

    const rows = orders.map(o =>
      `${o.orderId},${o.date},${o.time || ''},${escapeCSV(o.item)},${o.quantity},${o.price}`
    ).join('\n');

    return header + '\n' + rows;
  }

  /**
   * Escape CSV field
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  function escapeCSV(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Handle copy button click
   */
  async function handleCopy() {
    if (!csvContent) {
      showStatus('error', 'コピーするデータがありません');
      return;
    }

    try {
      await navigator.clipboard.writeText(csvContent);
      showStatus('success', 'クリップボードにコピーしました！');
      copyBtn.textContent = 'コピー完了！';
      setTimeout(() => {
        copyBtn.textContent = 'クリップボードにコピー';
      }, 2000);
    } catch (error) {
      console.error('Copy error:', error);
      showStatus('error', 'クリップボードへのコピーに失敗しました');
    }
  }

  /**
   * Utility delay function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise}
   */
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // UI Helper Functions

  function setExportLoading(loading) {
    exportBtn.disabled = loading;
    exportBtn.querySelector('.btn-text').style.display = loading ? 'none' : 'inline';
    exportBtn.querySelector('.btn-loading').style.display = loading ? 'inline' : 'none';
  }

  function showProgress() {
    progressContainer.style.display = 'block';
    progressContainer.classList.add('fade-in');
    progressFill.classList.add('indeterminate');
  }

  function hideProgress() {
    progressContainer.style.display = 'none';
    progressFill.classList.remove('indeterminate');
  }

  function updateProgress(data) {
    if (data.status) {
      progressText.textContent = data.status;
    }
    if (data.ordersCount !== undefined) {
      progressText.textContent = `${data.status || '取得中...'} (${data.ordersCount}件取得済み)`;
    }
  }

  function showResult(orders) {
    const total = orders.reduce((sum, o) => sum + o.price * o.quantity, 0);
    orderCount.textContent = orders.length;
    totalSpent.textContent = total.toLocaleString();
    resultContainer.style.display = 'block';
    resultContainer.classList.add('fade-in');
    copyBtn.disabled = false;
  }

  function hideResult() {
    resultContainer.style.display = 'none';
  }

  function showStatus(type, message) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type} fade-in`;
    statusMessage.style.display = 'block';
  }

  function hideStatus() {
    statusMessage.style.display = 'none';
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', init);
})();
