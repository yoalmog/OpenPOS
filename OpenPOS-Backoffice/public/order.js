// Customer Online Ordering Client Controller
document.addEventListener('DOMContentLoaded', () => {
  let state = {
    items: [],
    categories: [],
    activeCategory: 'ALL',
    orderMode: 'DINE_IN',
    cart: []
  };

  // DOM Elements
  const menuItemsGrid = document.getElementById('menuItemsGrid');
  const categoryBar = document.getElementById('categoryBar');
  const cartDrawer = document.getElementById('cartDrawer');
  const cartBackdrop = document.getElementById('cartBackdrop');
  const openCartBtn = document.getElementById('openCartBtn');
  const closeCartBtn = document.getElementById('closeCartBtn');
  const cartBadge = document.getElementById('cartBadge');
  const cartItemsList = document.getElementById('cartItemsList');
  const cartSubtotal = document.getElementById('cartSubtotal');
  const cartTax = document.getElementById('cartTax');
  const cartTotal = document.getElementById('cartTotal');
  const proceedCheckoutBtn = document.getElementById('proceedCheckoutBtn');
  const checkoutModal = document.getElementById('checkoutModal');
  const closeCheckoutModalBtn = document.getElementById('closeCheckoutModalBtn');
  const checkoutForm = document.getElementById('checkoutForm');
  const orderModeTabs = document.getElementById('orderModeTabs');
  const tableNumberGroup = document.getElementById('tableNumberGroup');
  const deliveryAddressGroup = document.getElementById('deliveryAddressGroup');
  const menuMainView = document.getElementById('menuMainView');
  const orderTrackerView = document.getElementById('orderTrackerView');
  const newOrderBtn = document.getElementById('newOrderBtn');

  // Initialize
  initData();
  setupEvents();

  async function initData() {
    try {
      const [catsRes, itemsRes] = await Promise.all([
        fetch('/api/categories').then(r => r.json()),
        fetch('/api/items').then(r => r.json())
      ]);

      state.categories = catsRes;
      state.items = itemsRes;

      renderCategoryPills();
      renderMenuItems();
    } catch (err) {
      console.error('Failed to load menu data:', err);
      menuItemsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 3rem;">
          <i class="fa-solid fa-triangle-exclamation fa-2x"></i>
          <p style="margin-top: 1rem;">Failed to load menu. Please refresh or try again later.</p>
        </div>
      `;
    }
  }

  function setupEvents() {
    // Cart open/close
    openCartBtn.addEventListener('click', () => {
      cartDrawer.classList.add('open');
      cartBackdrop.classList.add('open');
    });

    const closeCart = () => {
      cartDrawer.classList.remove('open');
      cartBackdrop.classList.remove('open');
    };

    closeCartBtn.addEventListener('click', closeCart);
    cartBackdrop.addEventListener('click', closeCart);

    // Order mode tabs
    orderModeTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.order-mode-btn');
      if (!btn) return;
      document.querySelectorAll('.order-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.orderMode = btn.dataset.mode;

      if (state.orderMode === 'DINE_IN') {
        tableNumberGroup.style.display = 'block';
        deliveryAddressGroup.style.display = 'none';
      } else if (state.orderMode === 'DELIVERY') {
        tableNumberGroup.style.display = 'none';
        deliveryAddressGroup.style.display = 'block';
      } else {
        tableNumberGroup.style.display = 'none';
        deliveryAddressGroup.style.display = 'none';
      }
    });

    // Checkout modal trigger
    proceedCheckoutBtn.addEventListener('click', () => {
      if (state.cart.length === 0) {
        alert('Your cart is empty. Please add items before checking out.');
        return;
      }
      closeCart();
      checkoutModal.classList.add('open');
    });

    closeCheckoutModalBtn.addEventListener('click', () => {
      checkoutModal.classList.remove('open');
    });

    // Checkout Form Submit
    checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const customerName = document.getElementById('custNameInput').value.trim();
      const customerPhone = document.getElementById('custPhoneInput').value.trim();
      const tableNumber = document.getElementById('custTableInput').value.trim();
      const address = document.getElementById('custAddressInput').value.trim();
      const notes = document.getElementById('custNotesInput').value.trim();

      const payload = {
        customerName,
        customerPhone,
        deliveryType: state.orderMode,
        tableNumber: state.orderMode === 'DINE_IN' ? tableNumber : null,
        pickupTime: state.orderMode === 'DELIVERY' ? `Delivery to: ${address}` : (state.orderMode === 'DINE_IN' ? tableNumber : 'Ready in 15 min'),
        notes,
        items: state.cart.map(c => ({
          itemId: c.item.id,
          name: c.item.name,
          quantity: c.quantity,
          price: c.item.price,
          notes: c.notes || ""
        }))
      };

      try {
        const res = await fetch('/api/online-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          checkoutModal.classList.remove('open');
          state.cart = [];
          updateCartUI();

          // Show Tracker View
          document.getElementById('trackerOrderNumber').textContent = `#${data.order.orderNumber}`;
          document.getElementById('trackerEstTime').textContent = "In 15 minutes";
          document.getElementById('trackerDestination').textContent = 
            state.orderMode === 'DINE_IN' ? `Table ${tableNumber}` : (state.orderMode === 'DELIVERY' ? address : 'Takeaway Counter');

          menuMainView.style.display = 'none';
          document.querySelector('.category-scroll-bar').style.display = 'none';
          orderTrackerView.style.display = 'block';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          alert('Could not submit order: ' + (data.error || 'Server error'));
        }
      } catch (err) {
        alert('Network error submitting order. Please try again.');
      }
    });

    // Place another order
    newOrderBtn?.addEventListener('click', () => {
      orderTrackerView.style.display = 'none';
      menuMainView.style.display = 'block';
      document.querySelector('.category-scroll-bar').style.display = 'flex';
    });
  }

  function renderCategoryPills() {
    const html = ['<button class="cat-pill active" data-category="ALL">All Items</button>'];
    state.categories.forEach(cat => {
      html.push(`<button class="cat-pill" data-category="${cat.id}">${escapeHtml(cat.name)}</button>`);
    });
    categoryBar.innerHTML = html.join('');

    categoryBar.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        categoryBar.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeCategory = btn.dataset.category;
        renderMenuItems();
      });
    });
  }

  function renderMenuItems() {
    let filtered = state.items;
    if (state.activeCategory !== 'ALL') {
      filtered = filtered.filter(i => i.categoryId === state.activeCategory);
    }

    if (filtered.length === 0) {
      menuItemsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--store-text-muted); padding: 3rem;">
          <p>No dishes found in this category.</p>
        </div>
      `;
      return;
    }

    const stationIcons = {
      COFFEE_BAR: 'fa-mug-hot',
      HOT_KITCHEN: 'fa-fire-burner',
      SALADS: 'fa-leaf',
      DESSERTS: 'fa-cake-candles',
      BAR: 'fa-martini-glass'
    };

    menuItemsGrid.innerHTML = filtered.map(item => {
      const icon = stationIcons[item.station] || 'fa-utensils';
      const prepTime = item.prepTimeMinutes || 5;

      return `
        <div class="menu-card">
          <div>
            <div class="card-top">
              <div class="item-icon-box">
                <i class="fa-solid ${icon}"></i>
              </div>
              <span class="item-station-tag">${escapeHtml(item.station?.replace('_', ' ') || 'KITCHEN')}</span>
            </div>
            <h3 class="item-title">${escapeHtml(item.name)}</h3>
            <div class="item-meta">
              <span class="item-prep-time"><i class="fa-regular fa-clock"></i> ${prepTime} min</span>
              <span>•</span>
              <span style="color:#10b981;"><i class="fa-solid fa-check"></i> Fresh Made</span>
            </div>
            <p class="item-desc">Crafted fresh with premium ingredients, prepared on-demand by our kitchen team.</p>
          </div>
          <div class="card-bottom">
            <span class="item-price">$${Number(item.price).toFixed(2)}</span>
            <button class="add-to-cart-btn" data-item-id="${item.id}">
              <i class="fa-solid fa-plus"></i> Add
            </button>
          </div>
        </div>
      `;
    }).join('');

    menuItemsGrid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemId = btn.dataset.itemId;
        const item = state.items.find(i => i.id === itemId);
        if (item) addToCart(item);
      });
    });
  }

  function addToCart(item) {
    const existing = state.cart.find(c => c.item.id === item.id);
    if (existing) {
      existing.quantity++;
    } else {
      state.cart.push({ item, quantity: 1, notes: "" });
    }
    updateCartUI();

    // Pulse cart button
    openCartBtn.style.transform = 'scale(1.1)';
    setTimeout(() => { openCartBtn.style.transform = ''; }, 200);
  }

  function updateCartUI() {
    const totalCount = state.cart.reduce((sum, c) => sum + c.quantity, 0);
    cartBadge.textContent = totalCount;

    if (state.cart.length === 0) {
      cartItemsList.innerHTML = `
        <div style="text-align: center; color: var(--store-text-muted); padding: 3rem 1rem;">
          <i class="fa-solid fa-mug-saucer fa-3x" style="opacity: 0.3; margin-bottom: 1rem;"></i>
          <p>Your order is empty.<br>Select items from our menu to start.</p>
        </div>
      `;
      cartSubtotal.textContent = '$0.00';
      cartTax.textContent = '$0.00';
      cartTotal.textContent = '$0.00';
      return;
    }

    cartItemsList.innerHTML = state.cart.map((cartItem, idx) => `
      <div class="cart-item-row">
        <div>
          <div style="font-weight: 600; font-size: 0.95rem; color: #fff;">${escapeHtml(cartItem.item.name)}</div>
          <div style="font-size: 0.8rem; color: var(--store-text-muted);">$${Number(cartItem.item.price).toFixed(2)} each</div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div class="cart-qty-ctrl">
            <button class="qty-btn" data-action="dec" data-index="${idx}"><i class="fa-solid fa-minus"></i></button>
            <span style="font-weight: 700; font-size: 0.85rem; min-width: 16px; text-align: center;">${cartItem.quantity}</span>
            <button class="qty-btn" data-action="inc" data-index="${idx}"><i class="fa-solid fa-plus"></i></button>
          </div>
          <span style="font-weight: 700; font-size: 0.95rem; min-width: 50px; text-align: right;">
            $${(cartItem.quantity * cartItem.item.price).toFixed(2)}
          </span>
        </div>
      </div>
    `).join('');

    // Attach qty button listeners
    cartItemsList.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const index = parseInt(btn.dataset.index, 10);
        if (action === 'inc') {
          state.cart[index].quantity++;
        } else if (action === 'dec') {
          state.cart[index].quantity--;
          if (state.cart[index].quantity <= 0) {
            state.cart.splice(index, 1);
          }
        }
        updateCartUI();
      });
    });

    const sub = state.cart.reduce((s, c) => s + (c.item.price * c.quantity), 0);
    const tax = sub * 0.17;
    const tot = sub + tax;

    cartSubtotal.textContent = `$${sub.toFixed(2)}`;
    cartTax.textContent = `$${tax.toFixed(2)}`;
    cartTotal.textContent = `$${tot.toFixed(2)}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
