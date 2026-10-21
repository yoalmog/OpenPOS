// Standalone Kitchen Display System (KDS) Controller
document.addEventListener('DOMContentLoaded', () => {
  let state = {
    selectedStation: 'ALL',
    tickets: [],
    knownTicketIds: new Set()
  };

  const kdsBoard = document.getElementById('kdsBoard');
  const stationFilters = document.getElementById('stationFilters');
  const activeTicketsCount = document.getElementById('activeTicketsCount');

  // Sound chime synthesizer using Web Audio API
  function playNewOrderChime() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    } catch (_) {}
  }

  // Setup station filter clicks
  stationFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.station-btn');
    if (!btn) return;
    document.querySelectorAll('.station-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedStation = btn.dataset.station;
    renderTickets();
  });

  // Fetch Tickets
  async function fetchTickets() {
    try {
      const res = await fetch('/api/kitchen/tickets');
      const tickets = await res.json();

      // Check if new ticket arrived
      let hasNew = false;
      tickets.forEach(t => {
        if (!state.knownTicketIds.has(t.id) && t.status !== 'SERVED') {
          hasNew = true;
          state.knownTicketIds.add(t.id);
        }
      });
      if (hasNew && state.tickets.length > 0) {
        playNewOrderChime();
      }

      state.tickets = tickets;
      renderTickets();
    } catch (err) {
      console.error('Failed to fetch KDS tickets:', err);
    }
  }

  // Render tickets
  function renderTickets() {
    let filtered = state.tickets.filter(t => t.status !== 'SERVED');
    if (state.selectedStation !== 'ALL') {
      filtered = filtered.filter(t => t.station === state.selectedStation);
    }

    activeTicketsCount.textContent = filtered.length;

    if (filtered.length === 0) {
      kdsBoard.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--kds-text-dim); padding: 5rem 1rem;">
          <i class="fa-solid fa-utensils fa-3x" style="opacity: 0.2; margin-bottom: 1rem;"></i>
          <p style="font-size: 1.1rem;">All caught up! No active tickets for ${escapeHtml(state.selectedStation.replace('_', ' '))}.</p>
        </div>
      `;
      return;
    }

    const now = Date.now();
    kdsBoard.innerHTML = filtered.map(t => {
      const elapsedSeconds = Math.floor((now - t.createdAt) / 1000);
      const minutes = Math.floor(elapsedSeconds / 60);
      const seconds = elapsedSeconds % 60;
      const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // Urgency
      const targetPrepMinutes = Math.round((t.targetReadyAt - t.createdAt) / 60000) || 5;
      let urgencyClass = 'urgency-normal';
      let timerClass = 'timer-normal';

      if (minutes >= targetPrepMinutes) {
        urgencyClass = 'urgency-danger';
        timerClass = 'timer-danger';
      } else if (minutes >= targetPrepMinutes * 0.7) {
        urgencyClass = 'urgency-warning';
        timerClass = 'timer-warning';
      }

      const channelPill = t.channel === 'WEB' ? '🛍️ ONLINE' : (t.channel === 'DELIVERY' ? '🛵 DELIVERY' : '🍽️ DINE-IN');

      return `
        <div class="kds-ticket ${urgencyClass}" data-ticket-id="${t.id}">
          <div class="ticket-header">
            <div style="display:flex;align-items:center;gap:0.5rem;">
              <span class="ticket-num">#${escapeHtml(t.orderNumber)}</span>
              <span class="ticket-destination">${escapeHtml(t.tableNumber || channelPill)}</span>
            </div>
            <div class="ticket-timer ${timerClass}">
              <i class="fa-regular fa-clock"></i>
              <span>${timeFormatted}</span>
            </div>
          </div>

          <div class="ticket-body">
            <div class="ticket-guest-info">
              <span><i class="fa-solid fa-user"></i> ${escapeHtml(t.customerName)}</span>
              <span style="font-weight:700;color:#3b82f6;">${escapeHtml(t.station.replace('_', ' '))}</span>
            </div>

            <div class="ticket-items">
              ${(t.items || []).map(item => `
                <div class="ticket-item-row" onclick="this.classList.toggle('struck')">
                  <span class="item-qty-badge">${item.quantity}</span>
                  <div class="item-details">
                    <div class="item-name">${escapeHtml(item.name)}</div>
                    ${item.notes ? `<div class="item-notes">${escapeHtml(item.notes)}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="ticket-footer">
            ${t.status === 'PENDING' ? `
              <button class="kds-btn btn-prep" onclick="updateTicketStatus('${t.id}', 'PREPARING')">
                <i class="fa-solid fa-fire"></i> Start Prep
              </button>
            ` : ''}

            ${t.status === 'PREPARING' ? `
              <button class="kds-btn btn-ready" onclick="updateTicketStatus('${t.id}', 'READY')">
                <i class="fa-solid fa-check"></i> Mark Ready
              </button>
            ` : ''}

            ${t.status === 'READY' ? `
              <button class="kds-btn btn-bump" onclick="updateTicketStatus('${t.id}', 'SERVED')">
                <i class="fa-solid fa-bell-concierge"></i> Bump / Done
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Update Ticket Status
  window.updateTicketStatus = async function(id, status) {
    try {
      await fetch(`/api/kitchen/tickets/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const t = state.tickets.find(tick => tick.id === id);
      if (t) t.status = status;
      renderTickets();
    } catch (err) {
      console.error('Failed to update ticket status:', err);
    }
  };

  // Initial load
  fetchTickets();

  // Poll for live tickets every 3 seconds
  setInterval(fetchTickets, 3000);

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
