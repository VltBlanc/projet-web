// ── events.js ── Event management module ──
// Handles: fetching, rendering, creating, joining/leaving events
// and updating chat rooms in the sidebar

const API = 'http://localhost:8081';

// ── State ──
let allEvents = [];
let myEventIds = new Set();

// ── Helpers ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = 'login.html';
    return null;
  }
  return res;
}

function formatEventDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const eventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (eventDay.getTime() === today.getTime()) return `Aujourd'hui ${timeStr}`;
  if (eventDay.getTime() === tomorrow.getTime()) return `Demain ${timeStr}`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' ' + timeStr;
}

function formatShortDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

// ── Fetch data ──
async function fetchAllEvents() {
  try {
    const res = await apiFetch('/events');
    if (!res) return;
    allEvents = await res.json();
  } catch (err) {
    console.error('Failed to fetch events:', err);
    allEvents = [];
  }
}

async function fetchMyEvents() {
  try {
    const res = await apiFetch('/my-events');
    if (!res) return;
    const data = await res.json();
    myEventIds = new Set(data.map(id => Number(id)));
  } catch (err) {
    console.error('Failed to fetch my events:', err);
    myEventIds = new Set();
  }
}

// ── Render Feed Grid (Accueil) ──
function renderFeedGrid() {
  const feedGrid = document.getElementById('feed-grid');
  if (!feedGrid) return;
  feedGrid.innerHTML = '';

  const upcoming = allEvents.slice(0, 4);

  if (upcoming.length === 0) {
    feedGrid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem;">Aucune activité récente</p>';
    return;
  }

  upcoming.forEach(ev => {
    const joined = myEventIds.has(ev.id);
    const count = Number(ev.participants_count);
    const card = document.createElement('div');
    card.className = 'feed-card';
    card.innerHTML = `
      <div class="feed-image"><span class="feed-badge">${escapeHtml(ev.sport)}</span></div>
      <div class="feed-body">
        <div class="feed-title">${escapeHtml(ev.title)}</div>
        <div class="feed-meta">📍 ${escapeHtml(ev.location)} &nbsp;•&nbsp; 🕐 ${formatEventDate(ev.event_date)}</div>
        <div class="feed-footer">
          <div class="feed-avatars">
            ${Array.from({ length: Math.min(count, 4) }, (_, i) => `<div class="avatar">U${i + 1}</div>`).join('')}
            ${count > 4 ? `<div class="avatar">+${count - 4}</div>` : ''}
          </div>
          <button class="join-btn ${joined ? 'joined' : ''}" data-event-id="${ev.id}">
            ${joined ? '✓ Inscrit' : 'Rejoindre'}
          </button>
        </div>
      </div>`;
    feedGrid.appendChild(card);
  });
}

// ── Render Events Grid (Événements) ──
function renderEventsGrid(filter = '') {
  const eventsGrid = document.getElementById('events-grid');
  if (!eventsGrid) return;
  eventsGrid.innerHTML = '';

  const lowerFilter = filter.toLowerCase();
  const filtered = allEvents.filter(e =>
    e.title.toLowerCase().includes(lowerFilter) ||
    e.sport.toLowerCase().includes(lowerFilter) ||
    e.location.toLowerCase().includes(lowerFilter)
  );

  if (filtered.length === 0) {
    eventsGrid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem;">Aucun événement trouvé</p>';
    return;
  }

  filtered.forEach(ev => {
    const joined = myEventIds.has(ev.id);
    const count = Number(ev.participants_count);
    const pct = (count / ev.capacity) * 100;
    const isFull = count >= ev.capacity;

    const div = document.createElement('div');
    div.className = 'event-card' + (joined ? ' event-joined' : '');
    div.innerHTML = `
      <div class="event-header">
        <span class="event-sport">${escapeHtml(ev.sport)}</span>
        <span class="event-date">${formatShortDate(ev.event_date)}</span>
      </div>
      <div class="event-title">${escapeHtml(ev.title)}</div>
      <div class="event-location">📍 ${escapeHtml(ev.location)}</div>
      ${ev.is_automatic ? '<div class="event-auto-badge">⚡ Automatique</div>' : `<div class="event-creator">👤 ${escapeHtml(ev.creator_name)}</div>`}
      <div class="event-bar"><div style="width:${Math.min(pct, 100)}%"></div></div>
      <div class="event-footer">
        <span class="event-spots">${count}/${ev.capacity} inscrits</span>
        ${joined
          ? `<button class="event-btn event-btn-leave" data-event-id="${ev.id}">Quitter</button>`
          : `<button class="event-btn ${isFull ? 'full' : ''}" data-event-id="${ev.id}" ${isFull ? 'disabled' : ''}>${isFull ? 'Complet' : 'Rejoindre'}</button>`
        }
      </div>`;
    eventsGrid.appendChild(div);
  });
}

// ── Join / Leave ──
async function joinEvent(eventId) {
  try {
    const res = await apiFetch(`/events/${eventId}/join`, { method: 'POST' });
    if (!res) return;
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Erreur lors de l\'inscription');
      return;
    }
    await refreshAll();
  } catch (err) {
    console.error('Join error:', err);
  }
}

async function leaveEvent(eventId) {
  try {
    const res = await apiFetch(`/events/${eventId}/leave`, { method: 'POST' });
    if (!res) return;
    await refreshAll();
  } catch (err) {
    console.error('Leave error:', err);
  }
}

// ── Create Event ──
async function createEvent(formData) {
  try {
    const res = await apiFetch('/events', {
      method: 'POST',
      body: JSON.stringify(formData),
    });
    if (!res) return false;
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Erreur lors de la création');
      return false;
    }
    await refreshAll();
    return true;
  } catch (err) {
    console.error('Create event error:', err);
    return false;
  }
}


// ── Create Event Modal ──
function initCreateEventModal() {
  const modal = document.getElementById('create-event-modal');
  const btn = document.getElementById('btn-create-event');
  const closeBtn = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('modal-cancel');
  const form = document.getElementById('create-event-form');

  if (!modal || !btn || !form) return;

  btn.addEventListener('click', () => {
    modal.classList.add('active');
  });

  function closeModal() {
    modal.classList.remove('active');
    form.reset();
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      title: form.querySelector('#ev-title').value.trim(),
      sport: form.querySelector('#ev-sport').value.trim(),
      location: form.querySelector('#ev-location').value.trim(),
      event_date: form.querySelector('#ev-date').value,
      capacity: Number(form.querySelector('#ev-capacity').value),
    };

    if (!data.title || !data.sport || !data.location || !data.event_date || !data.capacity) {
      alert('Tous les champs sont obligatoires');
      return;
    }

    const ok = await createEvent(data);
    if (ok) closeModal();
  });
}

// ── Click delegation for join/leave buttons ──
function initClickHandlers() {
  document.addEventListener('click', async (e) => {
    const joinBtn = e.target.closest('.join-btn:not(.joined)');
    if (joinBtn) {
      const eventId = Number(joinBtn.dataset.eventId);
      if (eventId) await joinEvent(eventId);
      return;
    }

    const joinedBtn = e.target.closest('.join-btn.joined');
    if (joinedBtn) {
      const eventId = Number(joinedBtn.dataset.eventId);
      if (eventId) await leaveEvent(eventId);
      return;
    }

    const eventBtn = e.target.closest('.event-btn:not(.full):not(.event-btn-leave)');
    if (eventBtn && eventBtn.dataset.eventId) {
      const eventId = Number(eventBtn.dataset.eventId);
      if (eventId) await joinEvent(eventId);
      return;
    }

    const leaveBtn = e.target.closest('.event-btn-leave');
    if (leaveBtn) {
      const eventId = Number(leaveBtn.dataset.eventId);
      if (eventId) await leaveEvent(eventId);
      return;
    }
  });
}

// ── Search ──
function initSearch() {
  const searchInput = document.getElementById('event-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderEventsGrid(e.target.value);
    });
  }
}

// ── Refresh all data ──
async function refreshAll() {
  await Promise.all([fetchAllEvents(), fetchMyEvents()]);
  renderFeedGrid();
  renderEventsGrid(document.getElementById('event-search')?.value || '');
  if (window.loadRooms) {
    window.loadRooms();
  }
}

// ── Init ──
async function initEvents() {
  await refreshAll();
  initSearch();
  initClickHandlers();
  initCreateEventModal();
}

// Run on load
initEvents();
