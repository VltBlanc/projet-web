(() => {
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
let currentSportFilter = 'all';

const sportsCategories = [
  { id: "all", name: "Tous", icon: "🌐", iconClass: "fa fa-globe", theme: "" },
  { id: "football", name: "Football", icon: "⚽", iconClass: "fa fa-futbol-o", theme: "theme-football" },
  { id: "basket", name: "Basket", icon: "🏀", iconClass: "fa fa-dribbble", theme: "theme-basket" },
  { id: "running", name: "Running", icon: "🏃", iconClass: "fa fa-road", theme: "theme-running" },
  { id: "tennis", name: "Tennis", icon: "🎾", iconClass: "fa fa-circle-thin", theme: "theme-tennis" },
  { id: "musculation", name: "Musculation", icon: "💪", iconClass: "fa fa-trophy", theme: "theme-musculation" },
  { id: "yoga", name: "Yoga", icon: "🧘", iconClass: "fa fa-leaf", theme: "theme-yoga" },
  { id: "escalade", name: "Escalade", icon: "🧗", iconClass: "fa fa-area-chart", theme: "theme-escalade" },
  { id: "cyclisme", name: "Cyclisme", icon: "🚴", iconClass: "fa fa-bicycle", theme: "theme-cyclisme" },
];

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

    card.innerHTML = `
      <div class="feed-image"><span class="feed-badge">${escapeHtml(event.sport)}</span></div>
      <div class="feed-body">
        <div class="feed-title">${escapeHtml(event.title)}</div>
        <div class="feed-meta">📍 ${escapeHtml(event.location)} &nbsp;•&nbsp; 🕐 ${formatEventDate(event.event_date)}</div>
        <div class="feed-footer">
          <div class="feed-avatars">${avatarsHtml}</div>
          <button class="${joinButtonClass}" data-event-id="${event.id}">${joinButtonText}</button>
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

  let actionButtonHtml = '';
  if (isJoined) {
    actionButtonHtml = `<button class="event-btn event-btn-leave" data-event-id="${event.id}">Quitter</button>`;
  } else if (isFull) {
    actionButtonHtml = `<button class="event-btn full" data-event-id="${event.id}" disabled>Complet</button>`;
  } else {
    actionButtonHtml = `<button class="event-btn" data-event-id="${event.id}">Rejoindre</button>`;
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
      ${actionButtonHtml}
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
  let filteredEvents = allEvents;

  // Filtrer d'abord par catégorie de sport active
  if (currentSportFilter !== 'all') {
    const selectedCategory = sportsCategories.find(c => c.id === currentSportFilter);
    if (selectedCategory) {
      filteredEvents = filteredEvents.filter(event => 
        event.sport.toLowerCase() === selectedCategory.name.toLowerCase()
      );
    }
  }

  // Filtrer ensuite par le texte recherché
  if (lowerFilter) {
    filteredEvents = filteredEvents.filter(event =>
      event.title.toLowerCase().includes(lowerFilter) ||
      event.sport.toLowerCase().includes(lowerFilter) ||
      event.location.toLowerCase().includes(lowerFilter)
    );
  }

  if (filteredEvents.length === 0) {
    eventsGrid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem;">Aucun événement trouvé</p>';
    return;
  }

  filteredEvents.forEach(event => {
    eventsGrid.appendChild(createEventCardHTML(event));
  });
}

// ── Génération Dynamique des Tuiles de Sport dans le Sidebar ──
function renderSportCategoriesList() {
  const listContainer = document.getElementById('events-categories-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  sportsCategories.forEach(category => {
    // Calculer le nombre d'événements pour cette catégorie
    let count = 0;
    if (category.id === 'all') {
      count = allEvents.length;
    } else {
      count = allEvents.filter(e => e.sport.toLowerCase() === category.name.toLowerCase()).length;
    }

    const tile = document.createElement('div');
    tile.className = `event-category-tile${currentSportFilter === category.id ? ' active' : ''}`;
    tile.dataset.categoryId = category.id;

    tile.innerHTML = `
      <span class="tile-icon"><i class="${category.iconClass}"></i></span>
      <span class="tile-name">${category.name}</span>
      <span class="tile-count">${count}</span>
    `;

    tile.addEventListener('click', (e) => {
      handleCategoryTileClick(e, category);
    });

    listContainer.appendChild(tile);
  });
}

// ── Gestionnaire de Clic sur les Tuiles de Catégorie ──
function handleCategoryTileClick(event, category) {
  if (currentSportFilter === category.id) return; // Déjà sélectionné

  const tileElement = event.currentTarget;
  const rect = tileElement.getBoundingClientRect();
  const clickX = rect.left + rect.width / 2;
  const clickY = rect.top + rect.height / 2;

  // 1. Éclatement de petites émoticônes depuis le clic
  spawnEmojiBurst(clickX, clickY, category.icon);

  // 2. Balayage radial de transition thématique
  triggerThemeTransition(clickX, clickY, category.theme, () => {
    // Changement de classe de thème à mi-chemin
    sportsCategories.forEach(c => {
      if (c.theme) {
        document.body.classList.remove(c.theme);
      }
    });

    if (category.theme) {
      document.body.classList.add(category.theme);
    }

    // Mettre à jour le filtre de sport actif
    currentSportFilter = category.id;
    window.currentSportFilter = category.id;

    // Actualiser le bouton de suivi et le titre du header
    updateFollowButton();

    // Mettre à jour l'arrière-plan d'icônes
    if (window.updateAmbientBackdrop) {
      window.updateAmbientBackdrop(category.id);
    }

    // Actualiser le rendu de la barre latérale des catégories et de la grille
    renderSportCategoriesList();
    
    const searchInput = document.getElementById('event-search');
    const searchValue = searchInput ? searchInput.value : '';
    renderEventsGrid(searchValue);
  });
}

// ── Éclatement d'Émoticônes (Confetti Burst) ──
function spawnEmojiBurst(x, y, emoji) {
  const container = document.body;
  const particleCount = 10;
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('span');
    particle.className = 'emoji-burst-particle';
    particle.textContent = emoji;

    // Angle aléatoire sur 360° et distance de propulsion aléatoire
    const angle = Math.random() * Math.PI * 2;
    const distance = 80 + Math.random() * 120;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const rot = Math.random() * 360 + 180;

    particle.style.setProperty('--x', `${x}px`);
    particle.style.setProperty('--y', `${y}px`);
    particle.style.setProperty('--dx', `${dx}`);
    particle.style.setProperty('--dy', `${dy}`);
    particle.style.setProperty('--rot', `${rot}deg`);

    container.appendChild(particle);

    // Supprimer la particule après l'animation (400ms)
    setTimeout(() => {
      particle.remove();
    }, 400);
  }
}

// ── Déclencheur de Transition Thématique Verticale (Vertical Slide) ──
function triggerThemeTransition(x, y, newTheme, midwayCallback) {
  const overlay = document.getElementById('theme-transition-overlay');
  if (!overlay) {
    midwayCallback();
    return;
  }

  // Associer le fond translucide en dégradé linéaire vertical (de haut en bas) neutre
  let targetTranslucentBg = 'linear-gradient(to bottom, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.02))';
  overlay.style.setProperty('--bg-new-translucent', targetTranslucentBg);
  
  overlay.classList.remove('animating', 'fade-out');
  overlay.style.display = 'block';

  // Forcer le reflow
  overlay.offsetWidth;

  // Lancer le glissement vertical
  overlay.classList.add('animating');

  // Callback à mi-chemin de la descente pour appliquer le thème (180ms)
  setTimeout(() => {
    if (midwayCallback) midwayCallback();
  }, 180);

  // Début du fade-out de l'overlay après complétion du glissement (400ms)
  setTimeout(() => {
    overlay.classList.add('fade-out');
  }, 400);

  // Cacher et réinitialiser l'overlay après le fondu (600ms)
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('animating', 'fade-out');
  }, 600);
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

  // Gérer la liste déroulante et le champ personnalisé
  const sportSelect = form.querySelector('#ev-sport-select');
  const customContainer = form.querySelector('#ev-sport-custom-container');
  const customInput = form.querySelector('#ev-sport-custom');
  
  if (sportSelect && customContainer && customInput) {
    sportSelect.addEventListener('change', () => {
      if (sportSelect.value === 'autre') {
        customContainer.style.display = 'flex';
        customInput.required = true;
        customInput.focus();
      } else {
        customContainer.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
      }
    });
  }

  openButton.addEventListener('click', () => {
    modal.classList.add('active');
  });

  function closeModal() {
    modal.classList.remove('active');
    form.reset();
    if (customContainer) {
      customContainer.style.display = 'none';
    }
    if (customInput) {
      customInput.required = false;
    }
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
    
    // Récupérer la valeur finale du sport (predefini ou custom)
    let finalSport = '';
    if (sportSelect) {
      if (sportSelect.value === 'autre' && customInput) {
        finalSport = customInput.value.trim();
      } else {
        finalSport = sportSelect.value;
      }
    }

    const formData = {
      title: form.querySelector('#ev-title').value.trim(),
      sport: finalSport,
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

    const eventJoinButton = event.target.closest('.event-btn:not(.full):not(.event-btn-leave)');
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

// ── Arrière-plan d'icônes de sport flottantes (Défilement ambiant) ──
function updateAmbientBackdrop(sportId) {
  const backdrop = document.getElementById('ambient-sports-backdrop');
  if (!backdrop) return;
  backdrop.innerHTML = '';

  // Si pas de sportId ou 'all', on affiche un mélange de tous les sports
  if (!sportId) sportId = 'all';

  // Mettre à jour le logo du sport actif dans la barre latérale nav
  const sidebarLogoContainer = document.getElementById('sidebar-active-sport-logo');
  if (sidebarLogoContainer) {
    let sidebarIconClass = 'fa fa-globe'; // Par défaut
    if (sportId !== 'all') {
      const category = sportsCategories.find(c => c.id === sportId);
      if (category && category.iconClass) {
        sidebarIconClass = category.iconClass;
      }
    }
    
    // Animation de transition fluide (scale down, changement d'icône, scale up)
    sidebarLogoContainer.style.transform = 'scale(0.3)';
    sidebarLogoContainer.style.opacity = '0';
    
    setTimeout(() => {
      sidebarLogoContainer.innerHTML = `<i class="${sidebarIconClass}"></i>`;
      sidebarLogoContainer.style.transform = 'scale(1)';
      sidebarLogoContainer.style.opacity = '0.25';
    }, 150);
  }

  const particleCount = 15;
  const availableCategories = sportsCategories.filter(c => c.id !== 'all' && c.iconClass);

  for (let i = 0; i < particleCount; i++) {
    let iconClass = '';
    if (sportId === 'all') {
      if (availableCategories.length > 0) {
        const randCat = availableCategories[Math.floor(Math.random() * availableCategories.length)];
        iconClass = randCat.iconClass;
      } else {
        continue;
      }
    } else {
      const category = sportsCategories.find(c => c.id === sportId);
      if (!category || !category.iconClass) continue;
      iconClass = category.iconClass;
    }

    const iconEl = document.createElement('i');
    iconEl.className = `${iconClass} floating-background-icon`;

    // Position initiale aléatoire et dérive
    const left = Math.random() * 100;
    const size = 3 + Math.random() * 5; // 3rem à 8rem
    const duration = 20 + Math.random() * 25; // 20s à 45s
    const delay = -(Math.random() * duration); // Décaler le démarrage des animations uniformément
    const driftX = -100 + Math.random() * 200;

    iconEl.style.setProperty('--left', `${left}%`);
    iconEl.style.setProperty('--size', `${size}rem`);
    iconEl.style.setProperty('--duration', `${duration}s`);
    iconEl.style.setProperty('--delay', `${delay}s`);
    iconEl.style.setProperty('--drift-x', `${driftX}px`);

    backdrop.appendChild(iconEl);
  }
}
window.updateAmbientBackdrop = updateAmbientBackdrop;

// ── Suivi des catégories de sport dans la page événements ──
let followedCategories = [];

async function fetchFollowedCategories() {
  try {
    const response = await fetch(`${apiBaseUrl}/categories/followed`, { credentials: 'include' });
    if (response.ok) {
      followedCategories = await response.json();
    }
  } catch (error) {
    console.error("Error fetching followed categories:", error);
  }
}

function updateFollowButton() {
  const followBtn = document.getElementById("events-follow-sport-btn");
  const pageTitle = document.getElementById("events-page-title");
  if (!followBtn || !pageTitle) return;

  if (currentSportFilter === "all") {
    followBtn.style.display = "none";
    pageTitle.textContent = "Événements sportifs";
  } else {
    const selectedCategory = sportsCategories.find(c => c.id === currentSportFilter);
    if (selectedCategory) {
      pageTitle.textContent = `Événements ${selectedCategory.name}`;
      followBtn.style.display = "inline-block";
      
      const isFollowing = followedCategories.includes(selectedCategory.id);
      if (isFollowing) {
        followBtn.textContent = "Ne plus suivre";
        followBtn.classList.remove("btn-primary");
        followBtn.classList.add("btn-secondary");
      } else {
        followBtn.textContent = "Suivre";
        followBtn.classList.remove("btn-secondary");
        followBtn.classList.add("btn-primary");
      }
    }
  }
}

function initFollowButton() {
  const followBtn = document.getElementById("events-follow-sport-btn");
  if (!followBtn) return;
  
  followBtn.addEventListener("click", async () => {
    if (currentSportFilter === "all") return;
    
    const selectedCategory = sportsCategories.find(c => c.id === currentSportFilter);
    if (!selectedCategory) return;
    
    const categoryId = selectedCategory.id;
    const isFollowing = followedCategories.includes(categoryId);
    
    let method = "POST";
    if (isFollowing) {
      method = "DELETE";
    }

    try {
      const response = await fetch(`${apiBaseUrl}/categories/${categoryId}/follow`, {
        method: method,
        credentials: "include"
      });
      if (response.ok) {
        if (isFollowing) {
          followedCategories = followedCategories.filter(id => id !== categoryId);
        } else {
          followedCategories.push(categoryId);
        }
        updateFollowButton();
        
        // Rafraîchir les salons de chat ou les catégories
        if (window.loadRooms) {
          window.loadRooms();
        }
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
    }
  });
}

// ── Actualiser toutes les données ──
async function refreshAll() {
  await Promise.all([fetchAllEvents(), fetchMyEvents(), fetchFollowedCategories()]);
  renderFeedGrid();

  const searchInput = document.getElementById('event-search');
  let searchValue = '';
  if (searchInput) {
    searchValue = searchInput.value;
  }
  renderEventsGrid(searchValue);
  renderSportCategoriesList();
  updateFollowButton();
  updateAmbientBackdrop(currentSportFilter);

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

// Exposer globalement les variables pour les autres scripts (navigation, chat)
window.sportsCategories = sportsCategories;
window.currentSportFilter = currentSportFilter;
window.spawnEmojiBurst = spawnEmojiBurst;
window.triggerThemeTransition = triggerThemeTransition;
window.updateAmbientBackdrop = updateAmbientBackdrop;

// ── Initialisation ──
async function initEvents() {
  await refreshAll();
  initSearch();
  initClickHandlers();
  initCreateEventModal();
  initFollowButton();
  
  // S'assurer de synchroniser l'état exposé au démarrage
  window.currentSportFilter = currentSportFilter;
}

// Exécuter au chargement
initEvents();
})();
