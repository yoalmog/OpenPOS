// OpenPOS Back Office Restaurant & Cafe Suite Controller
document.addEventListener('DOMContentLoaded', () => {
  // Global State
  let state = {
    storeInfo: { name: 'Artisan Cafe & Bistro', currency: '$', taxRate: 17.0 },
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
    kdsFilterStation: 'ALL'
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
  const wasteModal = document.getElementById('wasteModal');
  const tempModal = document.getElementById('tempModal');
  const recipeModal = document.getElementById('recipeModal');

  // Initialize
  initClock();
  initRouting();
  initTheme();
  setupSyncUrl();
  setupModals();
  fetchInitialData();

  // Polling for live updates
  setInterval(() => {
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
        forecast: 'Predictive Staffing & Demand Forecast',
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
      else if (tabId === 'forecast') fetchForecast();
      else if (tabId === 'safety') fetchSafety();
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
      state.storeInfo = {
        name: data.storeName || 'Artisan Cafe & Bistro',
        currency: data.currency || '$',
        taxRate: data.taxRate || 17.0
      };
      if (storeNameLabel) storeNameLabel.textContent = state.storeInfo.name;
      populateSettingsForm();
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
      const res = await fetch('/api/recipes/profitability');
      const data = await res.json();
      state.recipeProfitability = data.items || [];
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

    tbody.innerHTML = state.recipeProfitability.map((m, idx) => {
      let statusBadge = '<span class="badge badge-success">Healthy (&lt;30%)</span>';
      if (m.foodCostPct > 35) statusBadge = '<span class="badge badge-danger">High Cost (&gt;35%)</span>';
      else if (m.foodCostPct > 30) statusBadge = '<span class="badge badge-warning">Moderate (30-35%)</span>';

      return `
        <tr>
          <td><strong>${escapeHtml(m.itemName)}</strong></td>
          <td><span class="badge badge-info">${escapeHtml(m.station?.replace('_', ' ') || 'KITCHEN')}</span></td>
          <td><strong>$${Number(m.price).toFixed(2)}</strong></td>
          <td style="color:#f59e0b;">$${Number(m.foodCost).toFixed(2)}</td>
          <td style="color:#10b981;"><strong>$${Number(m.grossMargin).toFixed(2)}</strong></td>
          <td>
            <div style="font-weight:700;">${m.foodCostPct}%</div>
            <div class="profit-meter">
              <div class="profit-meter-fill" style="width:${Math.min(100, m.foodCostPct * 2)}%; background:${m.foodCostPct > 35 ? '#ef4444' : '#10b981'};"></div>
            </div>
          </td>
          <td>${statusBadge}</td>
          <td class="text-right">
            <button class="btn btn-outline btn-sm" onclick="window.openRecipeModal(${idx})">
              <i class="fa-solid fa-list"></i> View BOM
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.openRecipeModal = function(index) {
    const m = state.recipeProfitability[index];
    if (!m) return;
    document.getElementById('recipeModalTitle').textContent = `Recipe BOM: ${m.itemName}`;
    document.getElementById('recipeModalMeta').textContent = 
      `Selling Price: $${m.price.toFixed(2)} | Raw Food Cost: $${m.foodCost.toFixed(2)} | Gross Margin: $${m.grossMargin.toFixed(2)} (${m.profitMarginPct}%)`;

    const tbody = document.getElementById('recipeIngredientsList');
    if (m.ingredients && m.ingredients.length > 0) {
      tbody.innerHTML = m.ingredients.map(ing => `
        <tr>
          <td><strong>${escapeHtml(ing.name)}</strong></td>
          <td>${ing.quantity} ${escapeHtml(ing.unit)}</td>
          <td>$${Number(ing.unitCost).toFixed(4)}</td>
          <td><strong>$${Number(ing.lineCost).toFixed(2)}</strong></td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No specific raw ingredients assigned yet.</td></tr>';
    }

    const recipe = state.recipes.find(r => r.itemId === m.itemId);
    document.getElementById('recipeInstructionsBox').innerHTML = `
      <div style="font-weight:600; margin-bottom:4px; font-size:0.8rem; color:var(--text-muted);">Preparation Instructions:</div>
      <div style="font-size:0.875rem;">${escapeHtml(recipe?.instructions || 'Standard barista & kitchen preparation procedure.')}</div>
      ${recipe?.allergens ? `<div style="font-size:0.75rem; color:#f59e0b; margin-top:6px;"><strong>Allergens:</strong> ${escapeHtml(recipe.allergens)}</div>` : ''}
    `;

    openModal(recipeModal);
  };

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
            <button class="btn btn-outline btn-sm" onclick="window.promptAdjustStock('${ing.id}', '${escapeHtml(ing.name)}')">
              <i class="fa-solid fa-plus-minus"></i> Adjust
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

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

  function renderProductsTable() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    if (state.items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No products in catalog.</td></tr>';
      return;
    }

    tbody.innerHTML = state.items.map(item => {
      const cat = state.categories.find(c => c.id === item.categoryId);
      return `
        <tr>
          <td><span style="display:inline-block; width:18px; height:18px; border-radius:50%; background:${item.color || '#2E7D32'};"></span></td>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td>${escapeHtml(cat?.name || 'General')}</td>
          <td><span class="badge badge-info">${escapeHtml(item.station?.replace('_', ' ') || 'HOT KITCHEN')}</span></td>
          <td>${item.prepTimeMinutes || 5} min</td>
          <td>$${Number(item.price).toFixed(2)}</td>
          <td>${item.stockQuantity}</td>
          <td class="text-right">
            <button class="btn btn-icon btn-sm text-danger" onclick="window.deleteProduct('${item.id}')" title="Delete">
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
    if (prodCatSelect) {
      prodCatSelect.innerHTML = state.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
    if (filterSelect) {
      filterSelect.innerHTML = '<option value="">All Categories</option>' + state.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
  }

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
        showToast('Store settings saved!', 'success');
      }
    } catch (_) {}
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
});
