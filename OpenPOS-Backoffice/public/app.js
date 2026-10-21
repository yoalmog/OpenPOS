// OpenPOS Back Office Web Application Controller
document.addEventListener('DOMContentLoaded', () => {
  // Global State
  let state = {
    storeInfo: { name: 'OpenPOS Store', currency: '$', taxRate: 17.0 },
    stats: {},
    items: [],
    categories: [],
    receipts: [],
    activeTab: 'dashboard',
    selectedProductColor: '#2E7D32',
    selectedCatColor: '#1976D2',
    chartInstance: null
  };

  // DOM Elements
  const tabPanes = document.querySelectorAll('.tab-pane');
  const navItems = document.querySelectorAll('.nav-item, .nav-quick');
  const pageTitle = document.getElementById('pageTitle');
  const storeNameLabel = document.getElementById('storeNameLabel');
  const liveClock = document.getElementById('liveClock');
  const refreshBtn = document.getElementById('refreshBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const toastContainer = document.getElementById('toastContainer');
  const displaySyncUrl = document.getElementById('displaySyncUrl');
  const copySyncUrlBtn = document.getElementById('copySyncUrlBtn');

  // Modals
  const productModal = document.getElementById('productModal');
  const categoryModal = document.getElementById('categoryModal');
  const receiptModal = document.getElementById('receiptModal');
  const openAddProductModalBtn = document.getElementById('openAddProductModalBtn');
  const openAddCategoryModalBtn = document.getElementById('openAddCategoryModalBtn');

  // Initialize
  initClock();
  initRouting();
  initTheme();
  setupSyncUrl();
  fetchInitialData();

  // Polling for live updates every 5 seconds
  setInterval(() => {
    fetchStats();
    if (state.activeTab === 'receipts' || state.activeTab === 'dashboard') {
      fetchReceipts();
    }
  }, 5000);

  // Live Clock
  function initClock() {
    function updateClock() {
      const now = new Date();
      liveClock.textContent = now.toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }) + ' ' + now.toLocaleTimeString();
    }
    updateClock();
    setInterval(updateClock, 1000);
  }

  // Sync URL display
  function setupSyncUrl() {
    const host = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    const protocol = window.location.protocol;
    const currentUrl = `${protocol}//${host}${port}`;
    if (displaySyncUrl) {
      displaySyncUrl.textContent = currentUrl;
    }
    if (copySyncUrlBtn) {
      copySyncUrlBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(currentUrl).then(() => {
          showToast('Sync URL copied to clipboard!', 'success');
        });
      });
    }
  }

  // Navigation Routing
  function initRouting() {
    function switchTab(tabId) {
      state.activeTab = tabId;
      navItems.forEach(item => {
        if (item.dataset.tab === tabId) item.classList.add('active');
        else item.classList.remove('active');
      });

      tabPanes.forEach(pane => {
        if (pane.id === `tab-${tabId}`) pane.classList.add('active');
        else pane.classList.remove('active');
      });

      const titles = {
        dashboard: 'Dashboard Overview',
        products: 'Products & Inventory',
        categories: 'Product Categories',
        receipts: 'Sales & Receipts Log',
        settings: 'Back Office Settings'
      };
      if (pageTitle) pageTitle.textContent = titles[tabId] || 'Back Office';

      if (tabId === 'dashboard') {
        renderSalesChart();
      }
    }

    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.dataset.tab;
        window.location.hash = tab;
        switchTab(tab);
      });
    });

    const hash = window.location.hash.replace('#', '') || 'dashboard';
    switchTab(hash);
  }

  // Theme Toggle
  function initTheme() {
    const savedTheme = localStorage.getItem('pos_theme') || 'dark';
    if (savedTheme === 'light') {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }

    themeToggleBtn.addEventListener('click', () => {
      if (document.body.classList.contains('dark-theme')) {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        localStorage.setItem('pos_theme', 'light');
      } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        localStorage.setItem('pos_theme', 'dark');
      }
      renderSalesChart();
    });
  }

  // Fetch Initial Data
  async function fetchInitialData() {
    await Promise.all([
      fetchStatus(),
      fetchStats(),
      fetchCategories(),
      fetchItems(),
      fetchReceipts()
    ]);
  }

  refreshBtn.addEventListener('click', () => {
    fetchInitialData();
    showToast('Dashboard data refreshed', 'success');
  });

  // API Calls
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      state.storeInfo = {
        name: data.storeName || 'OpenPOS Store',
        currency: data.currency || '$',
        taxRate: data.taxRate || 17.0
      };
      if (storeNameLabel) storeNameLabel.textContent = state.storeInfo.name;
      populateSettingsForm();
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      state.stats = data;
      renderKPIs(data);
      renderTopSelling(data.topSelling || []);
      renderSalesChart(data.hourlySales || {});
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }

  async function fetchCategories() {
    try {
      const res = await fetch('/api/categories');
      state.categories = await res.json();
      renderCategoriesTable();
      populateCategorySelects();
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  }

  async function fetchItems() {
    try {
      const res = await fetch('/api/items');
      state.items = await res.json();
      renderProductsTable();
    } catch (err) {
      console.error('Error fetching items:', err);
    }
  }

  async function fetchReceipts() {
    try {
      const res = await fetch('/api/receipts');
      state.receipts = await res.json();
      renderReceiptsTable();
      renderRecentReceiptsTable();
    } catch (err) {
      console.error('Error fetching receipts:', err);
    }
  }

  // Format Currency
  function formatMoney(amount) {
    const curr = state.storeInfo.currency || '$';
    return `${curr}${Number(amount || 0).toFixed(2)}`;
  }

  // Render KPIs
  function renderKPIs(stats) {
    const kpiRevenue = document.getElementById('kpiRevenue');
    const kpiOrders = document.getElementById('kpiOrders');
    const kpiAvgTicket = document.getElementById('kpiAvgTicket');
    const kpiCash = document.getElementById('kpiCash');
    const kpiCard = document.getElementById('kpiCard');
    const kpiCashPct = document.getElementById('kpiCashPct');
    const kpiCardPct = document.getElementById('kpiCardPct');

    if (kpiRevenue) kpiRevenue.textContent = formatMoney(stats.totalRevenue);
    if (kpiOrders) kpiOrders.textContent = stats.totalOrders || 0;
    if (kpiAvgTicket) kpiAvgTicket.textContent = `Avg ticket: ${formatMoney(stats.averageTicket)}`;
    if (kpiCash) kpiCash.textContent = formatMoney(stats.cashSales);
    if (kpiCard) kpiCard.textContent = formatMoney(stats.cardSales);

    const totalRev = Number(stats.totalRevenue) || 1;
    const cashPct = Math.round(((stats.cashSales || 0) / totalRev) * 100);
    const cardPct = Math.round(((stats.cardSales || 0) / totalRev) * 100);

    if (kpiCashPct) kpiCashPct.textContent = `${cashPct}% of total`;
    if (kpiCardPct) kpiCardPct.textContent = `${cardPct}% of total`;
  }

  // Render Top Selling
  function renderTopSelling(topList) {
    const container = document.getElementById('topProductsList');
    if (!container) return;
    if (!topList || topList.length === 0) {
      container.innerHTML = '<div class="empty-state-sm">No sales recorded yet. Register transactions via POS.</div>';
      return;
    }

    container.innerHTML = topList.map((item, idx) => `
      <div class="top-item-row">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-weight:700;color:var(--accent-primary)">#${idx + 1}</span>
          <span class="top-item-name">${escapeHtml(item.name)}</span>
        </div>
        <span class="top-item-qty">${item.qty} units sold</span>
      </div>
    `).join('');
  }

  // Render Hourly Chart
  function renderSalesChart(hourlySales) {
    const canvas = document.getElementById('salesChart');
    if (!canvas) return;

    const data = hourlySales || (state.stats && state.stats.hourlySales) || {};
    const labels = Object.keys(data);
    const values = Object.values(data);

    if (state.chartInstance) {
      state.chartInstance.destroy();
    }

    const isDark = document.body.classList.contains('dark-theme');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#9ca3af' : '#4b5563';

    state.chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['08:00', '12:00', '16:00', '20:00'],
        datasets: [{
          label: 'Hourly Sales',
          data: values.length ? values : [0, 0, 0, 0],
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: '#3b82f6',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Sales: ${formatMoney(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Inter', size: 11 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'Inter', size: 11 },
              callback: (v) => `${state.storeInfo.currency}${v}`
            },
            beginAtZero: true
          }
        }
      }
    });
  }

  // Render Recent Receipts (Dashboard preview)
  function renderRecentReceiptsTable() {
    const tbody = document.getElementById('recentReceiptsTable');
    if (!tbody) return;
    const recent = state.receipts.slice(0, 5);

    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No transactions found</td></tr>';
      return;
    }

    tbody.innerHTML = recent.map(r => {
      const dateStr = new Date(r.timestamp).toLocaleString();
      const itemsCount = Array.isArray(r.items) ? r.items.reduce((s, i) => s + (i.quantity || 1), 0) : '-';
      const payMethod = Array.isArray(r.payments) && r.payments[0] ? r.payments[0].type : 'CASH';

      return `
        <tr>
          <td><strong>${escapeHtml(r.id)}</strong></td>
          <td>${dateStr}</td>
          <td>${escapeHtml(r.employeeName || 'Cashier')}</td>
          <td>${itemsCount}</td>
          <td><span class="badge" style="background:rgba(59,130,246,0.15);color:#3b82f6">${escapeHtml(payMethod)}</span></td>
          <td style="font-weight:700;color:var(--accent-success)">${formatMoney(r.grandTotal)}</td>
          <td>
            <button class="btn btn-sm btn-outline view-receipt-btn" data-id="${escapeHtml(r.id)}">
              <i class="fa-solid fa-file-invoice"></i> View
            </button>
          </td>
        </tr>
      `;
    }).join('');

    attachReceiptViewListeners(tbody);
  }

  // Render Products Table
  function renderProductsTable() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    const search = (document.getElementById('productSearchInput')?.value || '').toLowerCase();
    const catFilter = document.getElementById('categoryFilterSelect')?.value || '';

    const filtered = state.items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(search) || (item.barcode && item.barcode.includes(search));
      const matchCat = !catFilter || item.categoryId === catFilter;
      return matchSearch && matchCat;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No products found matching filters.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(item => `
      <tr>
        <td>
          <span class="item-color-pill" style="background:${escapeHtml(item.color || '#2E7D32')}"></span>
        </td>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>
          <span class="category-badge" style="background:${escapeHtml(item.color || '#1976D2')}">
            ${escapeHtml(item.categoryName || 'General')}
          </span>
        </td>
        <td style="font-weight:700">${formatMoney(item.price)}</td>
        <td><code>${escapeHtml(item.barcode || '—')}</code></td>
        <td>
          <span style="font-weight:600;color:${item.stockQuantity <= 10 ? 'var(--accent-warning)' : 'inherit'}">
            ${item.stockQuantity}
          </span>
        </td>
        <td class="text-right">
          <button class="btn btn-sm btn-outline edit-product-btn" data-id="${escapeHtml(item.id)}" title="Edit Product">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn btn-sm btn-outline text-danger delete-product-btn" data-id="${escapeHtml(item.id)}" title="Delete Product">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');

    // Attach actions
    tbody.querySelectorAll('.edit-product-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = state.items.find(i => i.id === id);
        if (item) openEditProductModal(item);
      });
    });

    tbody.querySelectorAll('.delete-product-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (confirm('Delete this product from catalog?')) {
          await deleteProduct(id);
        }
      });
    });
  }

  // Filter triggers
  document.getElementById('productSearchInput')?.addEventListener('input', renderProductsTable);
  document.getElementById('categoryFilterSelect')?.addEventListener('change', renderProductsTable);

  // Render Categories Table
  function renderCategoriesTable() {
    const tbody = document.getElementById('categoriesTableBody');
    if (!tbody) return;

    if (state.categories.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No categories created yet. Tap "+ New Category" to add one.</td></tr>';
      return;
    }

    tbody.innerHTML = state.categories.map(cat => `
      <tr>
        <td>
          <span class="item-color-pill" style="background:${escapeHtml(cat.color || '#1976D2')}"></span>
        </td>
        <td><strong>${escapeHtml(cat.name)}</strong></td>
        <td><code>${escapeHtml(cat.id)}</code></td>
        <td class="text-right">
          <span class="badge" style="background:rgba(59,130,246,0.15);color:#3b82f6">Active</span>
        </td>
      </tr>
    `).join('');
  }

  // Populate Category Selects
  function populateCategorySelects() {
    const filterSelect = document.getElementById('categoryFilterSelect');
    const modalSelect = document.getElementById('modalProductCategory');

    const options = state.categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');

    if (filterSelect) {
      filterSelect.innerHTML = '<option value="">All Categories</option>' + options;
    }
    if (modalSelect) {
      modalSelect.innerHTML = '<option value="general">General</option>' + options;
    }
  }

  // Render Receipts Table
  function renderReceiptsTable() {
    const tbody = document.getElementById('receiptsTableBody');
    if (!tbody) return;

    const dateFilter = document.getElementById('receiptDateFilter')?.value;

    const filtered = state.receipts.filter(r => {
      if (!dateFilter) return true;
      const rDate = new Date(r.timestamp).toISOString().split('T')[0];
      return rDate === dateFilter;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No transactions found for selected date.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const dateStr = new Date(r.timestamp).toLocaleString();
      const payMethod = Array.isArray(r.payments) && r.payments[0] ? r.payments[0].type : 'CASH';

      return `
        <tr>
          <td><strong>${escapeHtml(r.id)}</strong></td>
          <td>${dateStr}</td>
          <td>${escapeHtml(r.employeeName || 'Cashier')}</td>
          <td>${escapeHtml(r.customerName || 'Walk-in')}</td>
          <td>${formatMoney(r.subtotal)}</td>
          <td>${formatMoney(r.taxAmount)}</td>
          <td style="font-weight:700;color:var(--accent-success)">${formatMoney(r.grandTotal)}</td>
          <td><span class="badge" style="background:rgba(59,130,246,0.15);color:#3b82f6">${escapeHtml(payMethod)}</span></td>
          <td class="text-right">
            <button class="btn btn-sm btn-outline view-receipt-btn" data-id="${escapeHtml(r.id)}">
              <i class="fa-solid fa-receipt"></i> View Ticket
            </button>
          </td>
        </tr>
      `;
    }).join('');

    attachReceiptViewListeners(tbody);
  }

  document.getElementById('receiptDateFilter')?.addEventListener('change', renderReceiptsTable);
  document.getElementById('clearReceiptFilterBtn')?.addEventListener('click', () => {
    const dateInp = document.getElementById('receiptDateFilter');
    if (dateInp) dateInp.value = '';
    renderReceiptsTable();
  });

  // Attach Receipt View Listener
  function attachReceiptViewListeners(container) {
    container.querySelectorAll('.view-receipt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const receipt = state.receipts.find(r => r.id === id);
        if (receipt) openReceiptModal(receipt);
      });
    });
  }

  // Open Receipt Modal
  function openReceiptModal(receipt) {
    const storeHeader = document.getElementById('receiptStoreHeader');
    const metaLine = document.getElementById('receiptMetaLine');
    const cashierLine = document.getElementById('receiptCashierLine');
    const itemsBody = document.getElementById('receiptItemsBody');
    const totalsBody = document.getElementById('receiptTotalsBody');

    if (storeHeader) storeHeader.textContent = state.storeInfo.name;
    if (metaLine) metaLine.textContent = `${receipt.id} • ${new Date(receipt.timestamp).toLocaleString()}`;
    if (cashierLine) cashierLine.textContent = `Cashier: ${receipt.employeeName || 'Staff'}` + (receipt.customerName ? ` • Customer: ${receipt.customerName}` : '');

    if (itemsBody) {
      if (Array.isArray(receipt.items) && receipt.items.length > 0) {
        itemsBody.innerHTML = receipt.items.map(ci => {
          const name = ci.name || (ci.item && ci.item.name) || 'Item';
          const qty = ci.quantity || 1;
          const price = ci.totalPrice !== undefined ? ci.totalPrice : ((ci.price || 0) * qty);
          return `
            <tr>
              <td>${escapeHtml(name)}</td>
              <td>${qty}</td>
              <td class="text-right">${formatMoney(price)}</td>
            </tr>
          `;
        }).join('');
      } else {
        itemsBody.innerHTML = '<tr><td colspan="3">Items data not recorded</td></tr>';
      }
    }

    if (totalsBody) {
      totalsBody.innerHTML = `
        <div class="row"><span>Subtotal:</span><span>${formatMoney(receipt.subtotal)}</span></div>
        <div class="row"><span>Tax (${state.storeInfo.taxRate}%):</span><span>${formatMoney(receipt.taxAmount)}</span></div>
        <div class="row grand-total"><span>Total:</span><span>${formatMoney(receipt.grandTotal)}</span></div>
      `;
    }

    openModal(receiptModal);
  }

  document.getElementById('printReceiptBtn')?.addEventListener('click', () => {
    window.print();
  });

  // Color Swatch pickers
  document.querySelectorAll('#productColorPalette .color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('#productColorPalette .color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      state.selectedProductColor = swatch.dataset.color;
    });
  });

  document.querySelectorAll('#catColorPalette .color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('#catColorPalette .color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      state.selectedCatColor = swatch.dataset.color;
    });
  });

  // Modal Controllers
  function openModal(modal) {
    if (modal) modal.classList.add('active');
  }

  function closeModal(modal) {
    if (modal) modal.classList.remove('active');
  }

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.close;
      closeModal(document.getElementById(modalId));
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach(m => closeModal(m));
    });
  });

  // Add Product Button
  if (openAddProductModalBtn) {
    openAddProductModalBtn.addEventListener('click', () => {
      document.getElementById('productForm').reset();
      document.getElementById('modalProductId').value = '';
      document.getElementById('productModalTitle').textContent = 'Add New Product';
      openModal(productModal);
    });
  }

  function openEditProductModal(item) {
    document.getElementById('modalProductId').value = item.id;
    document.getElementById('modalProductName').value = item.name;
    document.getElementById('modalProductPrice').value = item.price;
    document.getElementById('modalProductStock').value = item.stockQuantity || 100;
    document.getElementById('modalProductCategory').value = item.categoryId || 'general';
    document.getElementById('modalProductBarcode').value = item.barcode || '';
    document.getElementById('productModalTitle').textContent = 'Edit Product';
    openModal(productModal);
  }

  // Product Form Submit
  document.getElementById('productForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modalProductId').value;
    const name = document.getElementById('modalProductName').value;
    const price = document.getElementById('modalProductPrice').value;
    const stockQuantity = document.getElementById('modalProductStock').value;
    const categoryId = document.getElementById('modalProductCategory').value;
    const barcode = document.getElementById('modalProductBarcode').value;
    const cat = state.categories.find(c => c.id === categoryId);

    const payload = {
      id: id || undefined,
      name,
      price: Number(price),
      stockQuantity: Number(stockQuantity),
      categoryId,
      categoryName: cat ? cat.name : 'General',
      barcode,
      color: state.selectedProductColor
    };

    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        closeModal(productModal);
        showToast(id ? 'Product updated successfully' : 'Product created successfully', 'success');
        await fetchItems();
        await fetchStats();
      }
    } catch (err) {
      showToast('Error saving product', 'error');
    }
  });

  async function deleteProduct(id) {
    try {
      const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Product removed from catalog', 'success');
        await fetchItems();
        await fetchStats();
      }
    } catch (err) {
      showToast('Error deleting product', 'error');
    }
  }

  // Category Modal
  if (openAddCategoryModalBtn) {
    openAddCategoryModalBtn.addEventListener('click', () => {
      document.getElementById('categoryForm').reset();
      openModal(categoryModal);
    });
  }

  document.getElementById('categoryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('modalCatName').value;
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: state.selectedCatColor })
      });
      const data = await res.json();
      if (data.success) {
        closeModal(categoryModal);
        showToast('Category created', 'success');
        await fetchCategories();
      }
    } catch (err) {
      showToast('Error creating category', 'error');
    }
  });

  // Settings Form
  function populateSettingsForm() {
    const nameInput = document.getElementById('settingStoreName');
    const currInput = document.getElementById('settingCurrency');
    const taxInput = document.getElementById('settingTaxRate');
    const addrInput = document.getElementById('settingAddress');

    if (nameInput) nameInput.value = state.storeInfo.name;
    if (currInput) currInput.value = state.storeInfo.currency;
    if (taxInput) taxInput.value = state.storeInfo.taxRate;
    if (addrInput) addrInput.value = state.storeInfo.address || '';
  }

  document.getElementById('storeSettingsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('settingStoreName').value,
      currency: document.getElementById('settingCurrency').value,
      taxRate: document.getElementById('settingTaxRate').value,
      address: document.getElementById('settingAddress').value
    };

    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        state.storeInfo = data.storeInfo;
        if (storeNameLabel) storeNameLabel.textContent = data.storeInfo.name;
        showToast('Store profile settings saved!', 'success');
        fetchStats();
      }
    } catch (err) {
      showToast('Error saving settings', 'error');
    }
  });

  // Reset Data (Danger Zone)
  document.getElementById('resetAllDataBtn')?.addEventListener('click', async () => {
    if (confirm('ARE YOU ABSOLUTELY SURE? This will permanently wipe all products, categories, and sales receipts from the online back office!')) {
      try {
        const res = await fetch('/api/reset', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast('All back office data has been reset to empty state.', 'success');
          await fetchInitialData();
        }
      } catch (err) {
        showToast('Error resetting data', 'error');
      }
    }
  });

  // Toast Helper
  function showToast(message, type = 'success') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // HTML sanitizer
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
