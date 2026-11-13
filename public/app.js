// OpenPOS Back Office Restaurant & Cafe Suite Controller
function bootOpenPosApp() {
  if (window.__openposAppBooted) return;
  window.__openposAppBooted = true;
  // Global State
  let state = {
    storeInfo: {
      name: 'Artisan Cafe & Bistro',
      address: '',
      phone: '',
      supportEmail: '',
      businessHours: '',
      currency: '$',
      taxRate: 17.0,
      receiptFooter: '',
      lowStockThreshold: 10,
      autoDepleteOnSync: true,
      enableLowStockAlerts: true,
      acceptOnlineOrders: true,
      defaultPrepTimeMinutes: 15,
      allowDineIn: true,
      allowTakeaway: true,
      allowDelivery: true
    },
    stats: {},
    items: [],
    categories: [],
    receipts: [],
    ingredients: [],
    recipes: [],
    recipeProfitability: [],
    kitchenTickets: [],
    onlineOrders: [],
    wasteData: { totalWasteCost: 0, logs: [] },
    forecast: {},
    tempLogs: [],
    checklists: [],
    activeTab: 'dashboard',
    selectedProductColor: '#2E7D32',
    chartInstance: null,
    ingredientHistoryChartInstance: null,
    activeRecipeIndex: null,
    kdsFilterStation: 'ALL',
    lowStockOnly: false,
    productSearch: '',
    productCategoryFilter: '',
    selectedProductIds: new Set()
  };

  // DOM Elements
  const tabPanes = document.querySelectorAll('.tab-pane');
  const navItems = document.querySelectorAll('.nav-item');
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
  const ingredientModal = document.getElementById('ingredientModal');
  const ingredientHistoryModal = document.getElementById('ingredientHistoryModal');
  const wasteModal = document.getElementById('wasteModal');
  const tempModal = document.getElementById('tempModal');
  const recipeModal = document.getElementById('recipeModal');
  const recipePrintModal = document.getElementById('recipePrintModal');

  // Initialize
  initClock();
  initRouting();
  initTheme();
  setupSyncUrl();
  setupModals();
  fetchInitialData();
  window.__openposRefreshAll = fetchInitialData;
  window.showToast = showToast;

  // Polling for live updates (paused whenever session is signed out)
  setInterval(() => {
    if (window.openposAuthRequired && !window.__openposSignedIn) return;
    if (state.activeTab === 'dashboard') fetchStats();
    if (state.activeTab === 'kitchen') fetchKdsTickets();
    if (state.activeTab === 'online-orders') fetchOnlineOrders();
  }, 4000);

  // Live Clock
  function initClock() {
    function updateClock() {
      const now = new Date();
      liveClock.textContent = now.toLocaleDateString(undefined, {
        weekday: 'short',
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
    if (displaySyncUrl) displaySyncUrl.textContent = currentUrl;
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
        kitchen: 'Live Kitchen Display (KDS)',
        'online-orders': 'Omnichannel Inbound Orders',
        products: 'Menu & Catalog Items',
        recipes: 'Recipe Costing & Profitability Matrix',
        ingredients: 'Raw Ingredients & Bulk Stock',
        categories: 'Catalog Categories',
        waste: 'Food Waste & Spoilage Log',
        forecast: 'Workforce Management & Peru Payroll',
        safety: 'Food Safety & Daily Checklists',
        receipts: 'Sales & Receipts Log',
        settings: 'Back Office Settings'
      };
      if (pageTitle) pageTitle.textContent = titles[tabId] || 'Back Office';

      // Load specific tab data on demand
      if (tabId === 'dashboard') renderSalesChart();
      else if (tabId === 'kitchen') fetchKdsTickets();
      else if (tabId === 'online-orders') fetchOnlineOrders();
      else if (tabId === 'recipes') fetchRecipeProfitability();
      else if (tabId === 'ingredients') fetchIngredients();
      else if (tabId === 'waste') fetchWaste();
      else if (tabId === 'forecast') {
        fetchForecast();
        if (typeof window.refreshWorkforcePeruData === 'function') {
          window.refreshWorkforcePeruData();
        }
      }
      else if (tabId === 'safety') fetchSafety();
      else if (tabId === 'settings') fetchStatus();
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
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let savedTheme = localStorage.getItem('pos_theme') || 'auto';
    const applyTheme = () => {
      const dark = savedTheme === 'dark' || (savedTheme === 'auto' && media.matches);
      document.body.classList.toggle('dark-theme', dark);
      document.body.classList.toggle('light-theme', !dark);
      document.body.dataset.themePreference = savedTheme;
      if (themeToggleBtn) {
        themeToggleBtn.setAttribute('aria-label', savedTheme === 'auto' ? 'Theme: automatic' : 'Switch theme');
        themeToggleBtn.title = savedTheme === 'auto' ? 'Automatic theme (follows device)' : 'Switch theme';
        themeToggleBtn.innerHTML = savedTheme === 'auto'
          ? '<i class="fa-solid fa-circle-half-stroke"></i>'
          : (dark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>');
      }
      renderSalesChart();
    };
    applyTheme();
    if (media.addEventListener) media.addEventListener('change', () => { if (savedTheme === 'auto') applyTheme(); });
    else if (media.addListener) media.addListener(() => { if (savedTheme === 'auto') applyTheme(); });
    themeToggleBtn?.addEventListener('click', () => {
      savedTheme = savedTheme === 'auto' ? (media.matches ? 'light' : 'dark') : (savedTheme === 'dark' ? 'light' : 'dark');
      localStorage.setItem('pos_theme', savedTheme);
      applyTheme();
    });
  }

  // Fetch Initial Data
  async function fetchInitialData() {
    await Promise.all([
      fetchStatus(),
      fetchStats(),
      fetchCategories(),
      fetchItems(),
      fetchReceipts(),
      fetchIngredients(),
      fetchRecipeProfitability()
    ]);
  }

  refreshBtn.addEventListener('click', () => {
    fetchInitialData();
    showToast('Restaurant data refreshed', 'success');
  });

  // -------------------------------------------------------------
  // API FETCH & RENDER METHODS
  // -------------------------------------------------------------

  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      const s = data.storeSettings || {};
      state.storeInfo = {
        ...state.storeInfo,
        name: s.name || data.storeName || 'OpenPOS Store',
        currency: s.currency || data.currency || 'S/',
        taxRate: s.taxRate !== null && s.taxRate !== undefined && Number.isFinite(Number(s.taxRate))
          ? Number(s.taxRate)
          : (data.taxRate !== null && data.taxRate !== undefined && Number.isFinite(Number(data.taxRate)) ? Number(data.taxRate) : null),
        address: s.address ?? data.storeAddress ?? '',
        phone: s.phone ?? '',
        supportEmail: s.supportEmail ?? '',
        businessHours: s.businessHours ?? '',
        receiptFooter: s.receiptFooter ?? '',
        lowStockThreshold: Number.isFinite(Number(s.lowStockThreshold)) ? Number(s.lowStockThreshold) : 10,
        autoDepleteOnSync: s.autoDepleteOnSync !== false,
        enableLowStockAlerts: s.enableLowStockAlerts !== false,
        acceptOnlineOrders: s.acceptOnlineOrders !== false,
        defaultPrepTimeMinutes: Number.isFinite(Number(s.defaultPrepTimeMinutes)) ? Number(s.defaultPrepTimeMinutes) : 15,
        allowDineIn: s.allowDineIn !== false,
        allowTakeaway: s.allowTakeaway !== false,
        allowDelivery: s.allowDelivery !== false
      };
      if (storeNameLabel) storeNameLabel.textContent = state.storeInfo.name;
      const dbStatus = document.getElementById('settingsDbStatus');
      const storageEngine = document.getElementById('settingsStorageEngine');
      const databaseState = document.getElementById('settingsDatabaseState');
      const catalogCount = document.getElementById('settingsCatalogCount');
      const connected = data.database?.connected === true;
      if (dbStatus) {
        dbStatus.classList.toggle('is-online', connected);
        dbStatus.classList.toggle('is-offline', !connected);
        dbStatus.innerHTML = '<span class="settings-status-dot"></span>' + (connected ? 'Connected' : 'Unavailable');
      }
      if (storageEngine) storageEngine.textContent = data.storageEngine || 'Unknown';
      if (databaseState) databaseState.textContent = connected ? 'Connected' : 'Not connected';
      if (catalogCount) catalogCount.textContent = String(data.counts?.items ?? '—');
      populateSettingsForm();
      renderProductsTable();
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  }

  async function fetchStats(period) {
    try {
      const selectedPeriod = period || (document.getElementById('statsPeriodSelect')?.value) || 'today';
      const res = await fetch(`/api/stats?period=${encodeURIComponent(selectedPeriod)}`);
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
    } catch (err) {
      console.error('Error fetching receipts:', err);
    }
  }

  // 1. KDS Kitchen Tickets
  async function fetchKdsTickets() {
    try {
      const res = await fetch('/api/kitchen/tickets');
      state.kitchenTickets = await res.json();
      renderKdsTickets();
    } catch (err) {
      console.error('Error fetching KDS tickets:', err);
    }
  }

  function renderKdsTickets() {
    const container = document.getElementById('kdsTicketsList');
    if (!container) return;

    let filtered = state.kitchenTickets.filter(t => t.status !== 'SERVED');
    if (state.kdsFilterStation !== 'ALL') {
      filtered = filtered.filter(t => t.station === state.kdsFilterStation);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">
          <i class="fa-solid fa-kitchen-set fa-2x" style="opacity:0.3; margin-bottom:10px;"></i>
          <p>No active kitchen tickets for ${escapeHtml(state.kdsFilterStation.replace('_', ' '))}.</p>
        </div>
      `;
      return;
    }

    const now = Date.now();
    container.innerHTML = filtered.map(t => {
      const elapsedMins = Math.floor((now - t.createdAt) / 60000);
      const targetMins = Math.round((t.targetReadyAt - t.createdAt) / 60000) || 5;
      const isUrgent = elapsedMins >= targetMins;

      return `
        <div class="kds-mini-ticket ${isUrgent ? 'urgency-danger' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:1.15rem; color:#fff;">#${escapeHtml(t.orderNumber)}</strong>
            <span class="badge ${isUrgent ? 'badge-danger' : 'badge-info'}">
              <i class="fa-regular fa-clock"></i> ${elapsedMins}m / ${targetMins}m
            </span>
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:10px;">
            <span>${escapeHtml(t.tableNumber || t.channel)}</span> • 
            <span style="color:#60a5fa; font-weight:700;">${escapeHtml(t.station.replace('_', ' '))}</span>
          </div>
          <div style="margin-bottom:12px;">
            ${(t.items || []).map(i => `
              <div style="display:flex; justify-content:space-between; font-size:0.875rem; margin-bottom:4px;">
                <span><strong>${i.quantity}x</strong> ${escapeHtml(i.name)}</span>
              </div>
              ${i.notes ? `<div style="font-size:0.75rem; color:#f59e0b; margin-bottom:4px;">• ${escapeHtml(i.notes)}</div>` : ''}
            `).join('')}
          </div>
          <div style="display:flex; gap:6px; margin-top:auto;">
            ${t.status === 'PENDING' ? `
              <button class="btn btn-outline btn-sm flex-1" onclick="window.updateKdsStatus('${t.id}', 'PREPARING')">
                <i class="fa-solid fa-fire"></i> Start Prep
              </button>
            ` : ''}
            ${t.status === 'PREPARING' ? `
              <button class="btn btn-primary btn-sm flex-1" onclick="window.updateKdsStatus('${t.id}', 'READY')">
                <i class="fa-solid fa-check"></i> Mark Ready
              </button>
            ` : ''}
            ${t.status === 'READY' ? `
              <button class="btn btn-outline btn-sm flex-1" onclick="window.updateKdsStatus('${t.id}', 'SERVED')">
                <i class="fa-solid fa-bell-concierge"></i> Bump
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  window.updateKdsStatus = async function(id, status) {
    try {
      await fetch(`/api/kitchen/tickets/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchKdsTickets();
    } catch (_) {}
  };

  // Station filter buttons in KDS tab
  document.getElementById('kdsStationFilterPills')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.kds-pill-btn');
    if (!btn) return;
    document.querySelectorAll('.kds-pill-btn').forEach(b => b.classList.remove('active', 'btn-primary'));
    document.querySelectorAll('.kds-pill-btn').forEach(b => b.classList.add('btn-outline'));
    btn.classList.remove('btn-outline');
    btn.classList.add('active', 'btn-primary');
    state.kdsFilterStation = btn.dataset.station;
    renderKdsTickets();
  });

  // 2. Online Orders
  async function fetchOnlineOrders() {
    try {
      const res = await fetch('/api/online-orders');
      state.onlineOrders = await res.json();
      renderOnlineOrders();
    } catch (err) {
      console.error('Error fetching online orders:', err);
    }
  }

  function renderOnlineOrders() {
    const tbody = document.getElementById('onlineOrdersTableBody');
    if (!tbody) return;
    if (state.onlineOrders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No inbound online orders yet.</td></tr>';
      return;
    }

    tbody.innerHTML = state.onlineOrders.map(o => `
      <tr>
        <td><strong>#${escapeHtml(o.orderNumber)}</strong></td>
        <td><span class="badge badge-info">${escapeHtml(o.channel)}</span></td>
        <td>
          <div style="font-weight:600;">${escapeHtml(o.customerName)}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(o.customerPhone || '')}</div>
        </td>
        <td>${escapeHtml(o.deliveryType)} ${o.tableNumber ? `(${escapeHtml(o.tableNumber)})` : ''}</td>
        <td>${(o.items || []).map(i => `${escapeHtml(i.name)} (x${i.quantity})`).join(', ')}</td>
        <td><strong>$${Number(o.total).toFixed(2)}</strong></td>
        <td>
          <span class="badge ${o.status === 'READY' ? 'badge-success' : (o.status === 'PREPARING' ? 'badge-warning' : 'badge-info')}">
            ${escapeHtml(o.status)}
          </span>
        </td>
        <td class="text-right">
          ${o.status === 'RECEIVED' ? `
            <button class="btn btn-outline btn-sm" onclick="window.updateOnlineStatus('${o.id}', 'PREPARING')">Accept & Prep</button>
          ` : ''}
          ${o.status === 'PREPARING' ? `
            <button class="btn btn-primary btn-sm" onclick="window.updateOnlineStatus('${o.id}', 'READY')">Ready for Pickup</button>
          ` : ''}
          ${o.status === 'READY' ? `
            <button class="btn btn-outline btn-sm" onclick="window.updateOnlineStatus('${o.id}', 'COMPLETED')">Complete</button>
          ` : ''}
        </td>
      </tr>
    `).join('');
  }

  window.updateOnlineStatus = async function(id, status) {
    try {
      await fetch(`/api/online-orders/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchOnlineOrders();
    } catch (_) {}
  };

  // 3. Recipes & Food Cost Profitability
  async function fetchRecipeProfitability() {
    try {
      const [profitRes, recipesRes] = await Promise.all([
        fetch('/api/recipes/profitability'),
        fetch('/api/recipes')
      ]);
      const data = await profitRes.json();
      state.recipeProfitability = data.items || [];
      if (recipesRes.ok) {
        const recipesData = await recipesRes.json();
        if (Array.isArray(recipesData)) state.recipes = recipesData;
      }
      renderRecipeProfitability();
    } catch (err) {
      console.error('Error fetching recipe profitability:', err);
    }
  }

  function renderRecipeProfitability() {
    const tbody = document.getElementById('recipeProfitabilityTableBody');
    if (!tbody) return;
    if (state.recipeProfitability.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No recipes found.</td></tr>';
      return;
    }

    const curr = state.storeInfo.currency || '$';
    tbody.innerHTML = state.recipeProfitability.map((m, idx) => {
      let statusBadge = '<span class="badge badge-success">Healthy (&lt;30%)</span>';
      if (m.foodCostPct > 35) statusBadge = '<span class="badge badge-danger">High Cost (&gt;35%)</span>';
      else if (m.foodCostPct > 30) statusBadge = '<span class="badge badge-warning">Moderate (30-35%)</span>';

      return `
        <tr>
          <td><strong>${escapeHtml(m.itemName)}</strong></td>
          <td><span class="badge badge-info">${escapeHtml(m.station?.replace('_', ' ') || 'KITCHEN')}</span></td>
          <td><strong>${escapeHtml(curr)}${Number(m.price).toFixed(2)}</strong></td>
          <td style="color:#f59e0b;">${escapeHtml(curr)}${Number(m.foodCost).toFixed(2)}</td>
          <td style="color:#10b981;"><strong>${escapeHtml(curr)}${Number(m.grossMargin).toFixed(2)}</strong></td>
          <td>
            <div style="font-weight:700;">${m.foodCostPct}%</div>
            <div class="profit-meter">
              <div class="profit-meter-fill" style="width:${Math.min(100, m.foodCostPct * 2)}%; background:${m.foodCostPct > 35 ? '#ef4444' : '#10b981'};"></div>
            </div>
          </td>
          <td>${statusBadge}</td>
          <td class="text-right">
            <div class="action-btn-group">
              <button type="button" class="btn btn-outline btn-sm" onclick="window.openRecipeModal(${idx})">
                <i class="fa-solid fa-list"></i> View BOM
              </button>
              <button type="button" class="btn btn-outline btn-sm" onclick="window.printRecipeCard(${idx})" title="Generate printable recipe card">
                <i class="fa-solid fa-print"></i> Print Card
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function resolveRecipeMeta(m) {
    const recipe = state.recipes.find(r => r.itemId === m.itemId);
    return {
      instructions: m.instructions || recipe?.instructions || 'Standard barista & kitchen preparation procedure.',
      allergens: m.allergens || recipe?.allergens || ''
    };
  }

  window.openRecipeModal = function(index) {
    const m = state.recipeProfitability[index];
    if (!m) return;
    state.activeRecipeIndex = index;
    const curr = state.storeInfo.currency || '$';
    document.getElementById('recipeModalTitle').textContent = `Recipe BOM: ${m.itemName}`;
    document.getElementById('recipeModalMeta').textContent =
      `Selling Price: ${curr}${m.price.toFixed(2)} | Raw Food Cost: ${curr}${m.foodCost.toFixed(2)} | Gross Margin: ${curr}${m.grossMargin.toFixed(2)} (${m.profitMarginPct}%)`;

    const tbody = document.getElementById('recipeIngredientsList');
    if (m.ingredients && m.ingredients.length > 0) {
      tbody.innerHTML = m.ingredients.map(ing => `
        <tr>
          <td><strong>${escapeHtml(ing.name)}</strong></td>
          <td>${ing.quantity} ${escapeHtml(ing.unit)}</td>
          <td>${escapeHtml(curr)}${Number(ing.unitCost).toFixed(4)}</td>
          <td><strong>${escapeHtml(curr)}${Number(ing.lineCost).toFixed(2)}</strong></td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No specific raw ingredients assigned yet.</td></tr>';
    }

    const { instructions, allergens } = resolveRecipeMeta(m);
    document.getElementById('recipeInstructionsBox').innerHTML = `
      <div style="font-weight:600; margin-bottom:4px; font-size:0.8rem; color:var(--text-muted);">Preparation Instructions:</div>
      <div style="font-size:0.875rem; white-space:pre-line;">${escapeHtml(instructions)}</div>
      ${allergens ? `<div style="font-size:0.75rem; color:#f59e0b; margin-top:6px;"><strong>Allergens:</strong> ${escapeHtml(allergens)}</div>` : ''}
    `;

    openModal(recipeModal);
  };

  window.printRecipeCard = function(index) {
    const m = state.recipeProfitability[index];
    if (!m) return;
    const sheet = document.getElementById('printableRecipeCard');
    if (!sheet) return;

    const curr = state.storeInfo.currency || '$';
    const { instructions, allergens } = resolveRecipeMeta(m);
    const stationLabel = (m.station || 'HOT_KITCHEN').replace(/_/g, ' ');
    const ingredientsRows = (m.ingredients && m.ingredients.length > 0)
      ? m.ingredients.map(ing => `
          <tr>
            <td><strong>${escapeHtml(ing.name)}</strong></td>
            <td>${escapeHtml(String(ing.quantity))} ${escapeHtml(ing.unit || '')}</td>
            <td>${escapeHtml(curr)}${Number(ing.unitCost || 0).toFixed(4)}</td>
            <td><strong>${escapeHtml(curr)}${Number(ing.lineCost || 0).toFixed(2)}</strong></td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" style="color:#64748b;">No raw ingredients assigned to this recipe yet.</td></tr>';

    sheet.innerHTML = `
      <div class="recipe-card-top">
        <div>
          <div class="recipe-card-brand">${escapeHtml(state.storeInfo.name || 'OpenPOS')} — Kitchen Recipe Card</div>
          <h2 class="recipe-card-title">${escapeHtml(m.itemName)}</h2>
          <div class="recipe-card-badges">
            <span class="recipe-card-pill"><i class="fa-solid fa-fire-burner"></i> ${escapeHtml(stationLabel)}</span>
            <span class="recipe-card-pill"><i class="fa-regular fa-clock"></i> ${Number(m.prepTimeMinutes || 5)} min prep</span>
            <span class="recipe-card-pill"><i class="fa-solid fa-tag"></i> ${escapeHtml(m.category || 'Menu Item')}</span>
          </div>
        </div>
        <div class="recipe-card-meta-right">
          <div>Generated ${escapeHtml(new Date().toLocaleDateString())}</div>
          <div>ID: ${escapeHtml(m.itemId)}</div>
        </div>
      </div>

      <div class="recipe-card-kpis">
        <div class="recipe-card-kpi"><span>Menu Price</span><strong>${escapeHtml(curr)}${Number(m.price || 0).toFixed(2)}</strong></div>
        <div class="recipe-card-kpi"><span>Raw Food Cost</span><strong>${escapeHtml(curr)}${Number(m.foodCost || 0).toFixed(2)}</strong></div>
        <div class="recipe-card-kpi"><span>Food Cost %</span><strong>${Number(m.foodCostPct || 0)}%</strong></div>
        <div class="recipe-card-kpi"><span>Gross Margin</span><strong>${escapeHtml(curr)}${Number(m.grossMargin || 0).toFixed(2)}</strong></div>
      </div>

      <div class="recipe-card-section">
        <h4>Ingredients &amp; Standard Portions</h4>
        <table class="recipe-card-table">
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Portion Needed</th>
              <th>Unit Cost</th>
              <th>Line Cost</th>
            </tr>
          </thead>
          <tbody>${ingredientsRows}</tbody>
        </table>
      </div>

      <div class="recipe-card-section" style="margin-bottom:0;">
        <h4>Preparation Instructions</h4>
        <div class="recipe-card-instructions">${escapeHtml(instructions)}</div>
        ${allergens ? `<div class="recipe-card-allergens"><i class="fa-solid fa-triangle-exclamation"></i> Allergens: ${escapeHtml(allergens)}</div>` : ''}
      </div>
    `;

    closeModal(recipeModal);
    openModal(recipePrintModal);
    if (typeof window.print === 'function') {
      setTimeout(() => {
        try { window.print(); } catch (_) {}
      }, 150);
    }
  };

  document.getElementById('recipeModalPrintBtn')?.addEventListener('click', () => {
    if (state.activeRecipeIndex !== null) {
      window.printRecipeCard(state.activeRecipeIndex);
    }
  });

  document.getElementById('confirmPrintRecipeBtn')?.addEventListener('click', () => {
    if (typeof window.print === 'function') window.print();
  });

  // 4. Raw Ingredients
  async function fetchIngredients() {
    try {
      const res = await fetch('/api/ingredients');
      state.ingredients = await res.json();
      renderIngredients();
    } catch (err) {
      console.error('Error fetching ingredients:', err);
    }
  }

  function renderIngredients() {
    const tbody = document.getElementById('ingredientsTableBody');
    const toolbarHistoryBtn = document.getElementById('openIngredientHistoryBtn');
    if (toolbarHistoryBtn) toolbarHistoryBtn.disabled = state.ingredients.length === 0;
    if (!tbody) return;
    if (state.ingredients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No ingredients registered.</td></tr>';
      return;
    }

    tbody.innerHTML = state.ingredients.map(ing => {
      const isLow = Number(ing.currentStock) <= Number(ing.minThreshold);
      return `
        <tr>
          <td><strong>${escapeHtml(ing.name)}</strong></td>
          <td>${escapeHtml(ing.unit)}</td>
          <td>$${Number(ing.unitCost).toFixed(4)}</td>
          <td><strong>${ing.currentStock} ${escapeHtml(ing.unit)}</strong></td>
          <td>${ing.minThreshold} ${escapeHtml(ing.unit)}</td>
          <td>
            <span class="badge ${isLow ? 'badge-danger' : 'badge-success'}">
              ${isLow ? 'Low Stock' : 'In Stock'}
            </span>
          </td>
          <td class="text-right">
            <div class="action-btn-group">
              <button type="button" class="btn btn-outline btn-sm" onclick="window.openIngredientHistoryModal('${escapeHtml(ing.id)}')">
                <i class="fa-solid fa-chart-line"></i> View History
              </button>
              <button type="button" class="btn btn-outline btn-sm" onclick="window.promptAdjustStock('${escapeHtml(ing.id)}', '${escapeHtml(ing.name)}')">
                <i class="fa-solid fa-plus-minus"></i> Adjust
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function populateHistoryIngredientSelect(selectedId) {
    const select = document.getElementById('historyIngredientSelect');
    if (!select) return;
    select.innerHTML = state.ingredients.map(ing =>
      `<option value="${escapeHtml(ing.id)}">${escapeHtml(ing.name)} (${escapeHtml(ing.unit)})</option>`
    ).join('');
    if (selectedId) select.value = selectedId;
  }

  function renderIngredientHistoryChart(history) {
    const canvas = document.getElementById('ingredientHistoryChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const series = Array.isArray(history.series) ? history.series : [];
    const labels = series.map(p => p.label);
    const values = series.map(p => p.stockLevel);
    const thresholdValues = series.map(p => p.minThreshold);
    const unit = history.ingredient?.unit || '';

    if (state.ingredientHistoryChartInstance) {
      state.ingredientHistoryChartInstance.destroy();
    }

    state.ingredientHistoryChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `Stock Level (${unit || 'units'})`,
            data: values,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.14)',
            fill: true,
            tension: 0.25,
            pointRadius: series.map(p => (p.eventCount > 0 ? 4 : 1.5)),
            pointHoverRadius: 6
          },
          {
            label: `Min Threshold (${unit || 'units'})`,
            data: thresholdValues,
            borderColor: '#ef4444',
            borderDash: [6, 5],
            borderWidth: 1.5,
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top' }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8 }, grid: { color: 'rgba(148, 163, 184, 0.12)' } },
          y: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.12)' } }
        }
      }
    });
  }

  async function loadIngredientHistory(ingredientId) {
    const titleEl = document.getElementById('ingredientHistoryModalTitle');
    const noticeEl = document.getElementById('ingredientHistoryNotice');
    const eventsBody = document.getElementById('ingredientHistoryEventsBody');
    if (eventsBody) {
      eventsBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Loading 30-day stock history...</td></tr>';
    }
    try {
      const res = await fetch(`/api/ingredients/${encodeURIComponent(ingredientId)}/history?days=30`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not load stock history.');
      }

      const ing = data.ingredient || {};
      const unit = ing.unit ? ` ${ing.unit}` : '';
      if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-chart-line"></i> ${escapeHtml(ing.name || 'Ingredient')} — 30-Day Stock History`;
      }
      const summary = data.summary || {};
      const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setTxt('histCurrentStock', `${summary.currentStock ?? 0}${unit}`);
      setTxt('histMinThreshold', `${summary.minThreshold ?? 0}${unit}`);
      setTxt('histRange', `${summary.minObserved ?? 0} – ${summary.maxObserved ?? 0}${unit}`);
      setTxt('histMovementsCount', String(summary.totalMovements ?? 0));

      if (noticeEl) {
        if ((summary.totalMovements ?? 0) === 0) {
          noticeEl.style.display = 'block';
          noticeEl.textContent = `No stock adjustments, waste logs, or recipe sales were recorded for ${ing.name} in the past 30 days — showing current stock level (${summary.currentStock ?? 0}${unit}).`;
        } else {
          noticeEl.style.display = 'none';
          noticeEl.textContent = '';
        }
      }

      renderIngredientHistoryChart(data);

      const events = Array.isArray(data.events) ? data.events : [];
      if (eventsBody) {
        if (events.length === 0) {
          eventsBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No stock movements recorded in the past 30 days.</td></tr>';
        } else {
          eventsBody.innerHTML = events.map(ev => {
            const delta = Number(ev.delta);
            const hasDelta = Number.isFinite(delta);
            const deltaLabel = hasDelta ? `${delta > 0 ? '+' : ''}${delta}${unit}` : 'Snapshot';
            const deltaColor = hasDelta ? (delta >= 0 ? '#10b981' : '#ef4444') : 'var(--text-muted)';
            const typeBadge = ev.type === 'SALE_DEPLETION'
              ? '<span class="badge badge-info">POS Sale</span>'
              : (ev.type === 'WASTE' ? '<span class="badge badge-danger">Waste</span>' : '<span class="badge badge-warning">Adjustment</span>');
            return `
              <tr>
                <td>${escapeHtml(new Date(ev.timestamp).toLocaleString())}</td>
                <td>${typeBadge}</td>
                <td>${escapeHtml(ev.reason || '')}</td>
                <td style="color:${deltaColor}; font-weight:700;">${escapeHtml(deltaLabel)}</td>
                <td><strong>${ev.stockAfter !== undefined ? `${ev.stockAfter}${escapeHtml(unit)}` : '—'}</strong></td>
              </tr>
            `;
          }).join('');
        }
      }
    } catch (err) {
      if (eventsBody) {
        eventsBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">${escapeHtml(err.message || 'Could not load stock history.')}</td></tr>`;
      }
      showToast(err.message || 'Could not load ingredient history.', 'error');
    }
  }

  window.openIngredientHistoryModal = async function(ingredientId) {
    if (state.ingredients.length === 0) {
      return showToast('Add an ingredient first to view stock history.', 'error');
    }
    const targetId = ingredientId || state.ingredients[0].id;
    populateHistoryIngredientSelect(targetId);
    openModal(ingredientHistoryModal);
    await loadIngredientHistory(targetId);
  };

  document.getElementById('openIngredientHistoryBtn')?.addEventListener('click', () => {
    window.openIngredientHistoryModal(state.ingredients[0]?.id);
  });

  document.getElementById('historyIngredientSelect')?.addEventListener('change', (e) => {
    if (e.target.value) loadIngredientHistory(e.target.value);
  });

  window.promptAdjustStock = async function(id, name) {
    const change = prompt(`Receive or adjust stock for ${name} (e.g. +1000 or -500):`);
    if (!change || isNaN(Number(change))) return;
    try {
      await fetch(`/api/ingredients/${id}/stock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change: Number(change), reason: "Manual Back Office Adjustment" })
      });
      showToast('Ingredient stock updated!', 'success');
      fetchIngredients();
      fetchRecipeProfitability();
    } catch (_) {}
  };

  // 5. Food Waste
  async function fetchWaste() {
    try {
      const res = await fetch('/api/waste');
      state.wasteData = await res.json();
      renderWaste();
    } catch (err) {
      console.error('Error fetching waste log:', err);
    }
  }

  function renderWaste() {
    const tbody = document.getElementById('wasteTableBody');
    const kpiVal = document.getElementById('kpiWasteTotal');
    if (kpiVal) kpiVal.textContent = `$${Number(state.wasteData.totalWasteCost || 0).toFixed(2)}`;
    if (!tbody) return;

    const logs = state.wasteData.logs || [];
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No food waste logged.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(w => `
      <tr>
        <td>${new Date(w.timestamp).toLocaleString()}</td>
        <td><strong>${escapeHtml(w.name)}</strong></td>
        <td>${w.quantity} ${escapeHtml(w.unit || '')}</td>
        <td style="color:#ef4444; font-weight:700;">$${Number(w.cost).toFixed(2)}</td>
        <td><span class="badge badge-warning">${escapeHtml(w.reason)}</span></td>
        <td>${escapeHtml(w.loggedBy || 'Staff')}</td>
      </tr>
    `).join('');
  }

  // 6. Forecast & Staffing
  async function fetchForecast() {
    try {
      const res = await fetch('/api/forecast');
      state.forecast = await res.json();
      renderForecast();
    } catch (err) {
      console.error('Error fetching forecast:', err);
    }
  }

  function renderForecast() {
    const tbody = document.getElementById('forecastTableBody');
    const totalOrdersLabel = document.getElementById('forecastTotalOrders');
    if (totalOrdersLabel && state.forecast.totalPredictedOrders) {
      totalOrdersLabel.textContent = state.forecast.totalPredictedOrders;
    }
    if (!tbody) return;

    const list = state.forecast.hourlyForecast || [];
    tbody.innerHTML = list.map(f => `
      <tr>
        <td><strong>${escapeHtml(f.hour)}</strong></td>
        <td>${f.predictedOrders} orders</td>
        <td><strong style="color:#60a5fa; font-size:1.05rem;">${f.recommendedStaff.total} Staff</strong></td>
        <td>☕ ${f.recommendedStaff.baristas} Baristas</td>
        <td>🍳 ${f.recommendedStaff.kitchenCooks} Cooks</td>
        <td>🍽️ ${f.recommendedStaff.floorStaff} Floor</td>
      </tr>
    `).join('');
  }

  // 7. Safety & Checklists
  async function fetchSafety() {
    try {
      const [tempRes, checkRes] = await Promise.all([
        fetch('/api/safety/temperature').then(r => r.json()),
        fetch('/api/safety/checklists').then(r => r.json())
      ]);
      state.tempLogs = tempRes;
      state.checklists = checkRes;
      renderSafety();
    } catch (err) {
      console.error('Error fetching safety data:', err);
    }
  }

  function renderSafety() {
    const tbody = document.getElementById('tempLogsTableBody');
    if (tbody) {
      if (state.tempLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No temperature checks logged.</td></tr>';
      } else {
        tbody.innerHTML = state.tempLogs.map(t => `
          <tr>
            <td><strong>${escapeHtml(t.unitName)}</strong></td>
            <td>${t.targetTempC}°C</td>
            <td><strong>${t.actualTempC}°C</strong></td>
            <td><span class="badge ${t.status === 'NORMAL' ? 'badge-success' : 'badge-danger'}">${t.status}</span></td>
            <td>${escapeHtml(t.checkedBy)}</td>
          </tr>
        `).join('');
      }
    }

    const checkContainer = document.getElementById('checklistsContainer');
    if (checkContainer) {
      checkContainer.innerHTML = state.checklists.map(list => `
        <div style="margin-bottom:1.5rem;">
          <h4 style="margin:0 0 0.5rem; font-size:0.95rem; color:#fff;">
            <i class="fa-solid fa-clipboard-check" style="color:#10b981;"></i> ${escapeHtml(list.title)}
          </h4>
          <div>
            ${list.items.map(task => `
              <div class="checklist-item-row ${task.done ? 'completed' : ''}" onclick="window.toggleChecklist('${list.id}', '${task.id}', ${!task.done})">
                <input type="checkbox" ${task.done ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
                <span style="flex:1; font-size:0.875rem;">${escapeHtml(task.text)}</span>
                ${task.time ? `<span style="font-size:0.75rem; color:#10b981;"><i class="fa-regular fa-clock"></i> ${task.time}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
    }
  }

  window.toggleChecklist = async function(listId, itemId, done) {
    try {
      await fetch(`/api/safety/checklists/${listId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, done })
      });
      fetchSafety();
    } catch (_) {}
  };

  // -------------------------------------------------------------
  // CATALOG, MODALS & RECEPTIONS
  // -------------------------------------------------------------

  function getLowStockThreshold(item) {
    if (item && item.minThreshold !== undefined && item.minThreshold !== null && Number.isFinite(Number(item.minThreshold))) {
      return Number(item.minThreshold);
    }
    const storeThreshold = Number(state.storeInfo.lowStockThreshold);
    return Number.isFinite(storeThreshold) ? storeThreshold : 10;
  }

  function isItemLowStock(item) {
    const qty = Number(item?.stockQuantity ?? 0);
    return qty < getLowStockThreshold(item);
  }

  function getFilteredProducts() {
    const query = (state.productSearch || '').trim().toLowerCase();
    const catFilter = state.productCategoryFilter || '';
    return state.items.filter(item => {
      if (catFilter && item.categoryId !== catFilter) return false;
      if (state.lowStockOnly && !isItemLowStock(item)) return false;
      if (query) {
        const nameMatch = String(item.name || '').toLowerCase().includes(query);
        const barcodeMatch = String(item.barcode || '').toLowerCase().includes(query);
        if (!nameMatch && !barcodeMatch) return false;
      }
      return true;
    });
  }

  function syncBulkToolbar(visibleItems = getFilteredProducts()) {
    const validIds = new Set(state.items.map(i => String(i.id)));
    for (const id of [...state.selectedProductIds]) {
      if (!validIds.has(id)) state.selectedProductIds.delete(id);
    }

    const bulkBar = document.getElementById('productsBulkBar');
    const countEl = document.getElementById('bulkSelectedCount');
    const selectAllEl = document.getElementById('selectAllProductsCheckbox');
    const selectedCount = state.selectedProductIds.size;

    if (bulkBar) bulkBar.style.display = selectedCount > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = String(selectedCount);

    if (selectAllEl) {
      const visibleIds = visibleItems.map(i => String(i.id));
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => state.selectedProductIds.has(id));
      const someVisibleSelected = visibleIds.some(id => state.selectedProductIds.has(id));
      selectAllEl.checked = allVisibleSelected;
      selectAllEl.indeterminate = !allVisibleSelected && someVisibleSelected;
      selectAllEl.disabled = visibleIds.length === 0;
    }
  }

  function updateLowStockFilterUi() {
    const btn = document.getElementById('lowStockFilterBtn');
    const badge = document.getElementById('lowStockCountBadge');
    const lowStockCount = state.items.filter(isItemLowStock).length;
    if (badge) badge.textContent = String(lowStockCount);
    if (btn) {
      btn.classList.toggle('is-active', state.lowStockOnly);
      btn.setAttribute('aria-pressed', state.lowStockOnly ? 'true' : 'false');
    }
  }

  function renderProductsTable() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    updateLowStockFilterUi();
    const filtered = getFilteredProducts();
    syncBulkToolbar(filtered);

    if (state.items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No products in catalog.</td></tr>';
      return;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No products match the current filters.</td></tr>';
      return;
    }

    const curr = state.storeInfo.currency || '$';
    const showLowBadge = state.storeInfo.enableLowStockAlerts !== false;

    tbody.innerHTML = filtered.map(item => {
      const id = String(item.id);
      const isSelected = state.selectedProductIds.has(id);
      const lowStock = isItemLowStock(item);
      const threshold = getLowStockThreshold(item);
      const cat = state.categories.find(c => c.id === item.categoryId);
      const qty = Number(item.stockQuantity ?? 0);
      return `
        <tr class="${isSelected ? 'is-selected' : ''}">
          <td>
            <input type="checkbox" class="product-select-checkbox" data-product-id="${escapeHtml(id)}" ${isSelected ? 'checked' : ''} aria-label="Select ${escapeHtml(item.name)}">
          </td>
          <td><span style="display:inline-block; width:18px; height:18px; border-radius:50%; background:${escapeHtml(String(item.color || '#2E7D32'))};"></span></td>
          <td>
            <strong>${escapeHtml(item.name)}</strong>
            ${item.barcode ? `<div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(item.barcode)}</div>` : ''}
          </td>
          <td>${escapeHtml(cat?.name || 'General')}</td>
          <td><span class="badge badge-info">${escapeHtml(item.station?.replace('_', ' ') || 'HOT KITCHEN')}</span></td>
          <td>${item.prepTimeMinutes || 5} min</td>
          <td>${escapeHtml(curr)}${Number(item.price).toFixed(2)}</td>
          <td>
            <div class="stock-cell-wrap">
              <span class="stock-qty-num ${lowStock && showLowBadge ? 'is-low' : ''}">${qty}</span>
              ${lowStock && showLowBadge ? `<span class="badge badge-danger" title="Below minimum threshold (${threshold})"><i class="fa-solid fa-triangle-exclamation"></i> Low Stock</span>` : ''}
            </div>
          </td>
          <td class="text-right">
            <button class="btn btn-icon btn-sm text-danger" onclick="window.deleteProduct('${escapeHtml(id)}')" title="Delete">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.deleteProduct = async function(id) {
    if (!confirm('Are you sure you want to remove this product?')) return;
    try {
      await fetch(`/api/items/${id}`, { method: 'DELETE' });
      state.selectedProductIds.delete(String(id));
      showToast('Product removed', 'success');
      fetchItems();
      fetchRecipeProfitability();
    } catch (_) {}
  };

  function renderCategoriesTable() {
    const tbody = document.getElementById('categoriesTableBody');
    if (!tbody) return;
    tbody.innerHTML = state.categories.map(c => `
      <tr>
        <td><span style="display:inline-block; width:18px; height:18px; border-radius:50%; background:#1976D2;"></span></td>
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td><code>${escapeHtml(c.id)}</code></td>
      </tr>
    `).join('');
  }

  function populateCategorySelects() {
    const prodCatSelect = document.getElementById('modalProductCategory');
    const filterSelect = document.getElementById('categoryFilterSelect');
    const bulkCatSelect = document.getElementById('bulkCategorySelect');
    if (prodCatSelect) {
      prodCatSelect.innerHTML = state.categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    }
    if (filterSelect) {
      const prev = filterSelect.value;
      filterSelect.innerHTML = '<option value="">All Categories</option>' + state.categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
      if (prev) filterSelect.value = prev;
    }
    if (bulkCatSelect) {
      const prev = bulkCatSelect.value;
      bulkCatSelect.innerHTML = '<option value="">Keep Category</option>' + state.categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
      if (prev) bulkCatSelect.value = prev;
    }
  }

  document.getElementById('productSearchInput')?.addEventListener('input', (e) => {
    state.productSearch = e.target.value || '';
    renderProductsTable();
  });

  document.getElementById('categoryFilterSelect')?.addEventListener('change', (e) => {
    state.productCategoryFilter = e.target.value || '';
    renderProductsTable();
  });

  document.getElementById('lowStockFilterBtn')?.addEventListener('click', () => {
    state.lowStockOnly = !state.lowStockOnly;
    renderProductsTable();
  });

  document.getElementById('selectAllProductsCheckbox')?.addEventListener('change', (e) => {
    const visible = getFilteredProducts();
    if (e.target.checked) {
      visible.forEach(item => state.selectedProductIds.add(String(item.id)));
    } else {
      visible.forEach(item => state.selectedProductIds.delete(String(item.id)));
    }
    renderProductsTable();
  });

  document.getElementById('productsTableBody')?.addEventListener('change', (e) => {
    const checkbox = e.target.closest('.product-select-checkbox');
    if (!checkbox) return;
    const id = checkbox.dataset.productId;
    if (!id) return;
    if (checkbox.checked) state.selectedProductIds.add(id);
    else state.selectedProductIds.delete(id);
    const row = checkbox.closest('tr');
    if (row) row.classList.toggle('is-selected', checkbox.checked);
    syncBulkToolbar();
  });

  document.getElementById('clearBulkSelectionBtn')?.addEventListener('click', () => {
    state.selectedProductIds.clear();
    renderProductsTable();
  });

  document.getElementById('applyBulkUpdateBtn')?.addEventListener('click', async () => {
    const ids = [...state.selectedProductIds];
    const categoryId = document.getElementById('bulkCategorySelect')?.value || '';
    const station = document.getElementById('bulkStationSelect')?.value || '';
    if (ids.length === 0) {
      return showToast('Select at least one product to update.', 'error');
    }
    if (!categoryId && !station) {
      return showToast('Choose a target category or kitchen station.', 'error');
    }

    const btn = document.getElementById('applyBulkUpdateBtn');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating…';
    }
    try {
      const payload = { ids };
      if (categoryId) payload.categoryId = categoryId;
      if (station) payload.station = station;
      const res = await fetch('/api/items/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Bulk update failed.');
      }
      state.selectedProductIds.clear();
      if (document.getElementById('bulkCategorySelect')) document.getElementById('bulkCategorySelect').value = '';
      if (document.getElementById('bulkStationSelect')) document.getElementById('bulkStationSelect').value = '';
      showToast(`Updated ${data.updatedCount ?? ids.length} catalog item(s).`, 'success');
      await Promise.all([fetchItems(), fetchRecipeProfitability()]);
    } catch (err) {
      showToast(err.message || 'Bulk update failed.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  });

  function renderReceiptsTable() {
    const tbody = document.getElementById('receiptsTableBody');
    if (!tbody) return;
    tbody.innerHTML = state.receipts.map(r => `
      <tr>
        <td><strong>${escapeHtml(r.id)}</strong></td>
        <td>${new Date(r.timestamp).toLocaleString()}</td>
        <td>${escapeHtml(r.employeeName || 'Staff')}</td>
        <td>${r.items?.length || 0} items</td>
        <td>${r.isRefund ? '<span class="badge badge-danger">Refund</span>' : '<span class="badge badge-success">Sale</span>'}</td>
        <td><strong>$${Number(r.grandTotal || r.total || 0).toFixed(2)}</strong></td>
        <td><a href="/api/export/receipts" target="_blank" class="btn btn-outline btn-sm">CSV</a></td>
      </tr>
    `).join('');
  }

  function renderKPIs(stats) {
    const kpiRevenue = document.getElementById('kpiRevenue');
    const kpiOrders = document.getElementById('kpiOrders');
    const kpiAvgTicket = document.getElementById('kpiAvgTicket');
    const kpiCash = document.getElementById('kpiCash');
    const kpiCard = document.getElementById('kpiCard');
    const curr = state.storeInfo.currency || '$';

    if (kpiRevenue) kpiRevenue.textContent = `${curr}${Number(stats.totalRevenue || 0).toFixed(2)}`;
    if (kpiOrders) kpiOrders.textContent = stats.totalOrders || 0;
    if (kpiAvgTicket) kpiAvgTicket.textContent = `Avg ticket: ${curr}${Number(stats.averageTicket || 0).toFixed(2)}`;
    if (kpiCash) kpiCash.textContent = `${curr}${Number(stats.cashSales || 0).toFixed(2)}`;
    if (kpiCard) kpiCard.textContent = `${curr}${Number(stats.cardSales || 0).toFixed(2)}`;
  }

  function renderTopSelling(topList) {
    const container = document.getElementById('topProductsList');
    if (!container) return;
    if (!topList || topList.length === 0) {
      container.innerHTML = '<div class="empty-state-sm">No sales recorded yet.</div>';
      return;
    }
    container.innerHTML = topList.map((item, idx) => `
      <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
        <span><strong>#${idx + 1}</strong> ${escapeHtml(item.name)}</span>
        <span style="color:#10b981; font-weight:700;">${item.qty} sold</span>
      </div>
    `).join('');
  }

  function renderSalesChart(hourlySales) {
    const canvas = document.getElementById('salesChart');
    if (!canvas) return;
    const data = hourlySales || (state.stats && state.stats.hourlySales) || {};
    const labels = Object.keys(data);
    const values = Object.values(data);

    if (state.chartInstance) state.chartInstance.destroy();

    state.chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['08:00', '12:00', '16:00', '20:00'],
        datasets: [{
          label: 'Hourly Sales ($)',
          data: values.length ? values : [0, 0, 0, 0],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // -------------------------------------------------------------
  // MODALS & FORMS HANDLING
  // -------------------------------------------------------------
  function setupModals() {
    // Open modal buttons
    document.getElementById('openAddProductModalBtn')?.addEventListener('click', () => openModal(productModal));
    document.getElementById('openAddCategoryModalBtn')?.addEventListener('click', () => openModal(categoryModal));
    document.getElementById('openAddIngredientModalBtn')?.addEventListener('click', () => openModal(ingredientModal));
    document.getElementById('openReportWasteModalBtn')?.addEventListener('click', () => openModal(wasteModal));
    document.getElementById('openAddTempModalBtn')?.addEventListener('click', () => openModal(tempModal));

    // Close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.close;
        const modal = document.getElementById(modalId);
        if (modal) closeModal(modal);
      });
    });

    // Product Form Submit
    document.getElementById('productForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('modalProductName').value,
        price: parseFloat(document.getElementById('modalProductPrice').value),
        stockQuantity: parseInt(document.getElementById('modalProductStock').value, 10),
        categoryId: document.getElementById('modalProductCategory').value,
        station: document.getElementById('modalProductStation').value,
        prepTimeMinutes: parseInt(document.getElementById('modalProductPrepTime').value, 10),
        barcode: document.getElementById('modalProductBarcode').value,
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
          showToast('Product saved successfully', 'success');
          fetchItems();
          fetchRecipeProfitability();
        }
      } catch (_) {}
    });

    // Category Form Submit
    document.getElementById('categoryForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('modalCatName').value;
      try {
        const res = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color: -16744448 })
        });
        const data = await res.json();
        if (data.success) {
          closeModal(categoryModal);
          showToast('Category created', 'success');
          fetchCategories();
        }
      } catch (_) {}
    });

    // Ingredient Form Submit
    document.getElementById('ingredientForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('modalIngName').value,
        unit: document.getElementById('modalIngUnit').value,
        unitCost: parseFloat(document.getElementById('modalIngCost').value),
        currentStock: parseFloat(document.getElementById('modalIngStock').value),
        minThreshold: parseFloat(document.getElementById('modalIngThreshold').value)
      };
      try {
        const res = await fetch('/api/ingredients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          closeModal(ingredientModal);
          showToast('Ingredient added to inventory', 'success');
          fetchIngredients();
        }
      } catch (_) {}
    });

    // Waste Form Submit
    document.getElementById('wasteForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('modalWasteItem').value,
        quantity: parseFloat(document.getElementById('modalWasteQty').value),
        cost: parseFloat(document.getElementById('modalWasteCost').value),
        reason: document.getElementById('modalWasteReason').value,
        loggedBy: 'Manager'
      };
      try {
        const res = await fetch('/api/waste', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          closeModal(wasteModal);
          showToast('Waste recorded and stock adjusted', 'success');
          fetchWaste();
          fetchIngredients();
        }
      } catch (_) {}
    });

    // Temp Form Submit
    document.getElementById('tempForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        unitName: document.getElementById('modalTempUnit').value,
        actualTempC: parseFloat(document.getElementById('modalTempReading').value),
        checkedBy: 'Manager'
      };
      try {
        const res = await fetch('/api/safety/temperature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          closeModal(tempModal);
          showToast('Temperature reading saved', 'success');
          fetchSafety();
        }
      } catch (_) {}
    });
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('active');
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
  }

  // Settings Form
  function populateSettingsForm() {
    const nameInput = document.getElementById('settingStoreName');
    const currInput = document.getElementById('settingCurrency');
    const taxInput = document.getElementById('settingTaxRate');
    const addrInput = document.getElementById('settingAddress');
    const phoneInput = document.getElementById('settingPhone');
    const emailInput = document.getElementById('settingSupportEmail');
    const hoursInput = document.getElementById('settingBusinessHours');
    const thresholdInput = document.getElementById('settingLowStockThreshold');
    const lowStockAlertsInput = document.getElementById('settingLowStockAlerts');
    const autoDepleteInput = document.getElementById('settingAutoDeplete');
    const acceptOnlineInput = document.getElementById('settingAcceptOnlineOrders');
    const prepTimeInput = document.getElementById('settingDefaultPrepTime');
    const dineInInput = document.getElementById('settingAllowDineIn');
    const takeawayInput = document.getElementById('settingAllowTakeaway');
    const deliveryInput = document.getElementById('settingAllowDelivery');
    const receiptFooterInput = document.getElementById('settingReceiptFooter');

    if (nameInput) nameInput.value = state.storeInfo.name || '';
    if (currInput) currInput.value = state.storeInfo.currency || '';
    if (taxInput) taxInput.value = state.storeInfo.taxRate ?? '';
    if (addrInput) addrInput.value = state.storeInfo.address || '';
    if (phoneInput) phoneInput.value = state.storeInfo.phone || '';
    if (emailInput) emailInput.value = state.storeInfo.supportEmail || '';
    if (hoursInput) hoursInput.value = state.storeInfo.businessHours || '';
    if (thresholdInput) thresholdInput.value = state.storeInfo.lowStockThreshold ?? 10;
    if (lowStockAlertsInput) lowStockAlertsInput.checked = state.storeInfo.enableLowStockAlerts !== false;
    if (autoDepleteInput) autoDepleteInput.checked = state.storeInfo.autoDepleteOnSync !== false;
    if (acceptOnlineInput) acceptOnlineInput.checked = state.storeInfo.acceptOnlineOrders !== false;
    if (prepTimeInput) prepTimeInput.value = state.storeInfo.defaultPrepTimeMinutes ?? 15;
    if (dineInInput) dineInInput.checked = state.storeInfo.allowDineIn !== false;
    if (takeawayInput) takeawayInput.checked = state.storeInfo.allowTakeaway !== false;
    if (deliveryInput) deliveryInput.checked = state.storeInfo.allowDelivery !== false;
    if (receiptFooterInput) receiptFooterInput.value = state.storeInfo.receiptFooter || '';
    updateTaxPreview();
  }

  function updateTaxPreview() {
    const preview = document.getElementById('settingTaxPreview');
    const rate = Number(document.getElementById('settingTaxRate')?.value);
    const currency = document.getElementById('settingCurrency')?.value || state.storeInfo.currency || '';
    if (preview) preview.textContent = Number.isFinite(rate) ? currency + ' ' + (100 * rate / 100).toFixed(2) : '—';
  }

  async function saveStoreSettings(payload, buttonId, successMessage) {
    const button = document.getElementById(buttonId);
    const original = button?.innerHTML;
    if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
    const saveState = document.getElementById('settingsSaveState');
    if (saveState) saveState.textContent = 'Saving changes…';
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Settings could not be saved.');
      state.storeInfo = { ...state.storeInfo, ...data.storeInfo };
      if (storeNameLabel) storeNameLabel.textContent = state.storeInfo.name;
      populateSettingsForm();
      renderProductsTable();
      if (saveState) saveState.textContent = 'Saved to cloud just now';
      showToast(successMessage, 'success');
      return true;
    } catch (error) {
      if (saveState) saveState.textContent = 'Save failed — changes were not applied';
      showToast(error.message || 'Settings could not be saved.', 'error');
      return false;
    } finally {
      if (button) { button.disabled = false; button.innerHTML = original; }
    }
  }

  document.getElementById('storeSettingsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('settingStoreName').value.trim();
    const address = document.getElementById('settingAddress').value.trim();
    const phone = document.getElementById('settingPhone')?.value.trim() || '';
    const supportEmail = document.getElementById('settingSupportEmail')?.value.trim() || '';
    const businessHours = document.getElementById('settingBusinessHours')?.value.trim() || '';
    if (!name) return showToast('Enter a restaurant name.', 'error');
    await saveStoreSettings(
      { name, address, phone, supportEmail, businessHours },
      'saveStoreSettingsBtn',
      'Store profile saved.'
    );
  });

  document.getElementById('storeSettingsFormTax')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currency = document.getElementById('settingCurrency').value.trim();
    const taxRate = Number(document.getElementById('settingTaxRate').value);
    if (!currency || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      return showToast('Enter a currency symbol and a tax rate between 0 and 100%.', 'error');
    }
    await saveStoreSettings({ currency, taxRate }, 'saveTaxSettingsBtn', 'Currency and tax settings saved.');
  });

  document.getElementById('storeSettingsFormInventory')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const lowStockThreshold = Number(document.getElementById('settingLowStockThreshold')?.value);
    const enableLowStockAlerts = Boolean(document.getElementById('settingLowStockAlerts')?.checked);
    const autoDepleteOnSync = Boolean(document.getElementById('settingAutoDeplete')?.checked);
    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0 || lowStockThreshold > 100000) {
      return showToast('Enter a valid low-stock threshold (0 to 100,000).', 'error');
    }
    await saveStoreSettings(
      { lowStockThreshold, enableLowStockAlerts, autoDepleteOnSync },
      'saveInventorySettingsBtn',
      'Inventory and alert settings saved.'
    );
  });

  document.getElementById('storeSettingsFormOperations')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const acceptOnlineOrders = Boolean(document.getElementById('settingAcceptOnlineOrders')?.checked);
    const defaultPrepTimeMinutes = Number(document.getElementById('settingDefaultPrepTime')?.value);
    const allowDineIn = Boolean(document.getElementById('settingAllowDineIn')?.checked);
    const allowTakeaway = Boolean(document.getElementById('settingAllowTakeaway')?.checked);
    const allowDelivery = Boolean(document.getElementById('settingAllowDelivery')?.checked);
    const receiptFooter = document.getElementById('settingReceiptFooter')?.value.trim() || '';
    if (!Number.isFinite(defaultPrepTimeMinutes) || defaultPrepTimeMinutes < 1 || defaultPrepTimeMinutes > 180) {
      return showToast('Default prep time must be between 1 and 180 minutes.', 'error');
    }
    await saveStoreSettings(
      {
        acceptOnlineOrders,
        defaultPrepTimeMinutes,
        allowDineIn,
        allowTakeaway,
        allowDelivery,
        receiptFooter
      },
      'saveOperationsSettingsBtn',
      'Storefront and kitchen settings saved.'
    );
  });

  document.getElementById('settingTaxRate')?.addEventListener('input', updateTaxPreview);
  document.getElementById('settingCurrency')?.addEventListener('input', updateTaxPreview);
  document.getElementById('settingsRefreshStatusBtn')?.addEventListener('click', async () => {
    await fetchStatus();
    showToast('Connection status refreshed.', 'success');
  });

  // Danger Reset
  document.getElementById('resetAllDataBtn')?.addEventListener('click', async () => {
    const pin = document.getElementById('dangerManagerPin')?.value.trim();
    if (!pin) {
      alert('Please enter Manager PIN to authorize reset.');
      return;
    }
    if (confirm('ARE YOU SURE? This will reset all store data to restaurant default templates.')) {
      try {
        const res = await fetch('/api/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-manager-pin': pin },
          body: JSON.stringify({ managerPin: pin })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Data reset to restaurant default template', 'success');
          fetchInitialData();
        } else {
          showToast(data.error || 'Reset failed', 'error');
        }
      } catch (_) {}
    }
  });

  // Analytics Period Selector
  document.getElementById('statsPeriodSelect')?.addEventListener('change', (e) => {
    fetchStats(e.target.value);
  });

  function showToast(message, type = 'success') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootOpenPosApp);
} else {
  bootOpenPosApp();
}
