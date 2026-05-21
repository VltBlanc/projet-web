// ── events.js ── Module de gestion des événements ──
// Gère : la récupération, l'affichage, la création, l'inscription/désinscription aux événements
// et la mise à jour des salons de discussion dans la barre latérale

let apiBaseUrl = `http://${location.hostname}:8081`;
if (location.hostname === 'localhost') {
  apiBaseUrl = 'http://localhost:8081';
}

// ── État ──
let allEvents = [];
let myEventIds = new Set();

// Vérifier si l'utilisateur est admin
function isAdmin() {
  return localStorage.getItem('userRole') === 'admin';
}

// ── Fonctions d'aide ──
function escapeHtml(str) {
  const escapeDiv = document.createElement('div');
  escapeDiv.textContent = str;
  return escapeDiv.innerHTML;
}

async function apiFetch(path, options) {
  if (!options) {
    options = {};
  }
  const requestOptions = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };
  // Fusionner les options passées en paramètre
  if (options.method) {
    requestOptions.method = options.method;
  }
  if (options.body) {
    requestOptions.body = options.body;
  }
  const response = await fetch(`${apiBaseUrl}${path}`, requestOptions);
  if (response.status === 401) {
    window.location.href = 'login.html';
    return null;
  }
  return response;
}

function formatEventDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const eventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const timeString = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (eventDay.getTime() === today.getTime()) {
    return `Aujourd'hui ${timeString}`;
  }
  if (eventDay.getTime() === tomorrow.getTime()) {
    return `Demain ${timeString}`;
  }
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' ' + timeString;
}

function formatShortDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

// ── Récupération des données ──
async function fetchAllEvents() {
  try {
    const response = await apiFetch('/events');
    if (!response) {
      return;
    }
    allEvents = await response.json();
    window.allEvents = allEvents; // Exposer pour les autres modules
  } catch (error) {
    console.error('Failed to fetch events:', error);
    allEvents = [];
    window.allEvents = [];
  }
}

async function fetchMyEvents() {
  try {
    const response = await apiFetch('/my-events');
    if (!response) {
      return;
    }
    const data = await response.json();
    myEventIds = new Set(data.map(id => Number(id)));
  } catch (error) {
    console.error('Failed to fetch my events:', error);
    myEventIds = new Set();
  }
}

// ── Render Feed Grid (Accueil) ──
function renderFeedGrid() {
  const feedGrid = document.getElementById('feed-grid');
  if (!feedGrid) {
    return;
  }
  feedGrid.innerHTML = '';

  const upcomingEvents = allEvents.slice(0, 4);

  if (upcomingEvents.length === 0) {
    feedGrid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem;">Aucune activité récente</p>';
    return;
  }

  upcomingEvents.forEach(event => {
    const isJoined = myEventIds.has(event.id);
    const participantsCount = Number(event.participants_count);
    const card = document.createElement('div');
    card.className = 'feed-card';

    let avatarsHtml = '';
    const avatarLimit = Math.min(participantsCount, 4);
    for (let i = 0; i < avatarLimit; i++) {
      avatarsHtml += `<div class="avatar">U${i + 1}</div>`;
    }
    if (participantsCount > 4) {
      avatarsHtml += `<div class="avatar">+${participantsCount - 4}</div>`;
    }

    let joinButtonClass = 'join-btn';
    let joinButtonText = 'Rejoindre';
    if (isJoined) {
      joinButtonClass = 'join-btn joined';
      joinButtonText = '✓ Inscrit';
    }

    let feedAdminDeleteHtml = '';
    if (isAdmin()) {
      feedAdminDeleteHtml = `<button class="event-btn event-btn-delete feed-delete-btn" data-event-id="${event.id}" title="Supprimer l'événement">🗑️</button>`;
    }

    let footerActionsHtml = `<button class="${joinButtonClass}" data-event-id="${event.id}">${joinButtonText}</button>`;
    if (feedAdminDeleteHtml) {
      footerActionsHtml = `
        <div style="display:flex; gap: 0.5rem; align-items:center;">
          ${feedAdminDeleteHtml}
          <button class="${joinButtonClass}" data-event-id="${event.id}">${joinButtonText}</button>
        </div>`;
    }

    card.innerHTML = `
      <div class="feed-image"><span class="feed-badge">${escapeHtml(event.sport)}</span></div>
      <div class="feed-body">
        <div class="feed-title">${escapeHtml(event.title)}</div>
        <div class="feed-meta">📍 ${escapeHtml(event.location)} &nbsp;•&nbsp; 🕐 ${formatEventDate(event.event_date)}</div>
        <div class="feed-footer">
          <div class="feed-avatars">${avatarsHtml}</div>
          ${footerActionsHtml}
        </div>
      </div>`;
    feedGrid.appendChild(card);
  });
}

function createEventCardHTML(event) {
  const isJoined = myEventIds.has(event.id);
  const participantsCount = Number(event.participants_count);
  const fillPercent = (participantsCount / event.capacity) * 100;
  const isFull = participantsCount >= event.capacity;

  const eventDiv = document.createElement('div');
  let cardClass = 'event-card';
  if (isJoined) {
    cardClass = 'event-card event-joined';
  }
  eventDiv.className = cardClass;

  let creatorHtml = '';
  if (event.is_automatic) {
    creatorHtml = '<div class="event-auto-badge">⚡ Automatique</div>';
  } else {
    creatorHtml = `<div class="event-creator">👤 ${escapeHtml(event.creator_name)}</div>`;
  }

  let actionButtonsHtml = '';
  if (isJoined) {
    actionButtonsHtml = `<button class="event-btn event-btn-leave" data-event-id="${event.id}">Quitter</button>`;
  } else if (isFull) {
    actionButtonsHtml = `<button class="event-btn full" data-event-id="${event.id}" disabled>Complet</button>`;
  } else {
    actionButtonsHtml = `<button class="event-btn" data-event-id="${event.id}">Rejoindre</button>`;
  }

  // Bouton supprimer pour les admins
  let adminDeleteHtml = '';
  if (isAdmin()) {
    adminDeleteHtml = `<button class="event-btn event-btn-delete" data-event-id="${event.id}" title="Supprimer l'événement">🗑️ Supprimer</button>`;
  }

  eventDiv.innerHTML = `
    <div class="event-header">
      <span class="event-sport">${escapeHtml(event.sport)}</span>
      <span class="event-date">${formatShortDate(event.event_date)}</span>
    </div>
    <div class="event-title">${escapeHtml(event.title)}</div>
    <div class="event-location">📍 ${escapeHtml(event.location)}</div>
    ${creatorHtml}
    <div class="event-bar"><div style="width:${Math.min(fillPercent, 100)}%"></div></div>
    <div class="event-footer">
      <span class="event-spots">${participantsCount}/${event.capacity} inscrits</span>
      <div class="event-actions">
        ${actionButtonsHtml}
        ${adminDeleteHtml}
      </div>
    </div>`;
  return eventDiv;
}

// ── Render Events Grid (Événements) ──
function renderEventsGrid(filter) {
  if (!filter) {
    filter = '';
  }
  const eventsGrid = document.getElementById('events-grid');
  if (!eventsGrid) {
    return;
  }
  eventsGrid.innerHTML = '';

  const lowerFilter = filter.toLowerCase();
  const filteredEvents = allEvents.filter(event =>
    event.title.toLowerCase().includes(lowerFilter) ||
    event.sport.toLowerCase().includes(lowerFilter) ||
    event.location.toLowerCase().includes(lowerFilter)
  );

  if (filteredEvents.length === 0) {
    eventsGrid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem;">Aucun événement trouvé</p>';
    return;
  }

  filteredEvents.forEach(event => {
    eventsGrid.appendChild(createEventCardHTML(event));
  });
}

window.renderCategoryEvents = function(sportName) {
  const container = document.getElementById('category-events-grid');
  if (!container) {
    return;
  }
  container.innerHTML = '';
  
  const filteredEvents = allEvents.filter(event => event.sport.toLowerCase() === sportName.toLowerCase());
  
  if (filteredEvents.length === 0) {
    container.innerHTML = "<p style='color:var(--text-muted); grid-column:1/-1;'>Aucune activité trouvée pour cette catégorie.</p>";
    return;
  }
  
  filteredEvents.forEach(event => {
    container.appendChild(createEventCardHTML(event));
  });
};

// ── Rejoindre / Quitter ──
async function joinEvent(eventId) {
  try {
    const response = await apiFetch(`/events/${eventId}/join`, { method: 'POST' });
    if (!response) {
      return;
    }
    if (!response.ok) {
      const errorData = await response.json();
      alert(errorData.error || 'Erreur lors de l\'inscription');
      return;
    }
    await refreshAll();
  } catch (error) {
    console.error('Join error:', error);
  }
}

async function leaveEvent(eventId) {
  try {
    const response = await apiFetch(`/events/${eventId}/leave`, { method: 'POST' });
    if (!response) {
      return;
    }
    await refreshAll();
  } catch (error) {
    console.error('Leave error:', error);
  }
}

// ── Supprimer un événement (admin uniquement) ──
async function deleteEvent(eventId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cet événement ? Cette action est irréversible.')) {
    return;
  }
  try {
    const response = await apiFetch(`/events/${eventId}`, { method: 'DELETE' });
    if (!response) {
      return;
    }
    if (!response.ok) {
      const errorData = await response.json();
      alert(errorData.error || 'Erreur lors de la suppression');
      return;
    }
    await refreshAll();
  } catch (error) {
    console.error('Delete event error:', error);
  }
}

// ── Créer un événement ──
async function createEvent(formData) {
  try {
    const response = await apiFetch('/events', {
      method: 'POST',
      body: JSON.stringify(formData),
    });
    if (!response) {
      return false;
    }
    if (!response.ok) {
      const errorData = await response.json();
      alert(errorData.error || 'Erreur lors de la création');
      return false;
    }
    await refreshAll();
    return true;
  } catch (error) {
    console.error('Create event error:', error);
    return false;
  }
}

// ── Modale de création d'événement ──
function initCreateEventModal() {
  const modal = document.getElementById('create-event-modal');
  const openButton = document.getElementById('btn-create-event');
  const closeButton = document.getElementById('modal-close');
  const cancelButton = document.getElementById('modal-cancel');
  const form = document.getElementById('create-event-form');

  if (!modal || !openButton || !form) {
    return;
  }

  openButton.addEventListener('click', () => {
    modal.classList.add('active');
  });

  function closeModal() {
    modal.classList.remove('active');
    form.reset();
  }

  if (closeButton) {
    closeButton.addEventListener('click', closeModal);
  }
  if (cancelButton) {
    cancelButton.addEventListener('click', closeModal);
  }
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const dateValue = form.querySelector('#ev-date').value.trim();
    const timeValue = form.querySelector('#ev-time').value.trim();
    const formData = {
      title: form.querySelector('#ev-title').value.trim(),
      sport: form.querySelector('#ev-sport').value.trim(),
      location: form.querySelector('#ev-location').value.trim(),
      event_date: dateValue + 'T' + timeValue,
      capacity: Number(form.querySelector('#ev-capacity').value),
    };

    if (!formData.title || !formData.sport || !formData.location || !dateValue || !timeValue || !formData.capacity) {
      alert('Tous les champs sont obligatoires');
      return;
    }

    const success = await createEvent(formData);
    if (success) {
      closeModal();
    }
  });
}

// ── Délégation de clic pour les boutons rejoindre/quitter ──
function initClickHandlers() {
  document.addEventListener('click', async (event) => {
    const joinButton = event.target.closest('.join-btn:not(.joined)');
    if (joinButton) {
      const eventId = Number(joinButton.dataset.eventId);
      if (eventId) {
        await joinEvent(eventId);
      }
      return;
    }

    const joinedButton = event.target.closest('.join-btn.joined');
    if (joinedButton) {
      const eventId = Number(joinedButton.dataset.eventId);
      if (eventId) {
        await leaveEvent(eventId);
      }
      return;
    }

    const eventJoinButton = event.target.closest('.event-btn:not(.full):not(.event-btn-leave):not(.event-btn-delete)');
    if (eventJoinButton) {
      if (eventJoinButton.dataset.eventId) {
        const eventId = Number(eventJoinButton.dataset.eventId);
        if (eventId) {
          await joinEvent(eventId);
        }
      }
      return;
    }

    const leaveButton = event.target.closest('.event-btn-leave');
    if (leaveButton) {
      const eventId = Number(leaveButton.dataset.eventId);
      if (eventId) {
        await leaveEvent(eventId);
      }
      return;
    }

    const deleteButton = event.target.closest('.event-btn-delete');
    if (deleteButton) {
      const eventId = Number(deleteButton.dataset.eventId);
      if (eventId) {
        await deleteEvent(eventId);
      }
      return;
    }
  });
}

// ── Recherche ──
function initSearch() {
  const searchInput = document.getElementById('event-search');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      renderEventsGrid(event.target.value);
    });
  }
}

// ── Actualiser toutes les données ──
async function refreshAll() {
  await Promise.all([fetchAllEvents(), fetchMyEvents()]);
  renderFeedGrid();

  const searchInput = document.getElementById('event-search');
  let searchValue = '';
  if (searchInput) {
    searchValue = searchInput.value;
  }
  renderEventsGrid(searchValue);

  if (window.currentCategoryDetail) {
    window.renderCategoryEvents(window.currentCategoryDetail);
  }
  if (window.loadRooms) {
    window.loadRooms();
  }
  if (window.renderCategories) {
    window.renderCategories();
  }
}
window.refreshAll = refreshAll;

// ── Initialisation ──
async function initEvents() {
  await refreshAll();
  initSearch();
  initClickHandlers();
  initCreateEventModal();
}

// Exécuter au chargement
initEvents();
