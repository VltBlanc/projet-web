(() => {
  // ── events.js ── Module de gestion des événements ──
  // Gère : la récupération, l'affichage, la création, l'inscription/désinscription aux événements
  // et la mise à jour des salons de discussion dans la barre latérale

  let apiBaseUrl = `http://${location.hostname}:8081`;
  if (location.hostname === "localhost") {
    apiBaseUrl = "http://localhost:8081";
  }

  // ── État ──
  let allEvents = [];
  let myEventIds = new Set();
  let currentSportFilter = "all";
  let followedCategories = [];

  const sportsCategories = [
    {
      id: "all",
      name: "Tous",
      icon: "🌐",
      iconClass: "fa fa-globe",
      theme: "",
    },
    {
      id: "football",
      name: "Football",
      icon: "⚽",
      iconClass: "fa fa-futbol-o",
      theme: "theme-football",
    },
    {
      id: "basket",
      name: "Basket",
      icon: "🏀",
      iconClass: "fa fa-dribbble",
      theme: "theme-basket",
    },
    {
      id: "running",
      name: "Running",
      icon: "🏃",
      iconClass: "fa fa-road",
      theme: "theme-running",
    },
    {
      id: "tennis",
      name: "Tennis",
      icon: "🎾",
      iconClass: "fa fa-circle-thin",
      theme: "theme-tennis",
    },
    {
      id: "musculation",
      name: "Musculation",
      icon: "💪",
      iconClass: "fa fa-trophy",
      theme: "theme-musculation",
    },
    {
      id: "yoga",
      name: "Yoga",
      icon: "🧘",
      iconClass: "fa fa-leaf",
      theme: "theme-yoga",
    },
    {
      id: "escalade",
      name: "Escalade",
      icon: "🧗",
      iconClass: "fa fa-area-chart",
      theme: "theme-escalade",
    },
    {
      id: "cyclisme",
      name: "Cyclisme",
      icon: "🚴",
      iconClass: "fa fa-bicycle",
      theme: "theme-cyclisme",
    },
  ];

  // ── Vérifier si l'utilisateur est admin ──
  function isAdmin() {
    return localStorage.getItem("userRole") === "admin";
  }

  // ── Fonctions d'aide ──
  function escapeHtml(str) {
    const escapeDiv = document.createElement("div");
    escapeDiv.textContent = str;
    return escapeDiv.innerHTML;
  }

  async function apiFetch(path, options) {
    if (!options) options = {};
    const requestOptions = {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    };
    if (options.method) requestOptions.method = options.method;
    if (options.body) requestOptions.body = options.body;

    const response = await fetch(`${apiBaseUrl}${path}`, requestOptions);
    if (response.status === 401) {
      window.location.href = "login.html";
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
    const eventDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const timeString = date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (eventDay.getTime() === today.getTime()) {
      return `Aujourd'hui ${timeString}`;
    }
    if (eventDay.getTime() === tomorrow.getTime()) {
      return `Demain ${timeString}`;
    }
    return (
      date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) +
      " " +
      timeString
    );
  }

  function formatShortDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  }

  // ── Récupération des données ──
  async function fetchAllEvents() {
    try {
      const response = await apiFetch("/events");
      if (!response) return;
      allEvents = await response.json();
      window.allEvents = allEvents;
    } catch (error) {
      console.error("Failed to fetch events:", error);
      allEvents = [];
      window.allEvents = [];
    }
  }

  async function fetchMyEvents() {
    try {
      const response = await apiFetch("/my-events");
      if (!response) return;
      const data = await response.json();
      myEventIds = new Set(data.map((id) => Number(id)));
    } catch (error) {
      console.error("Failed to fetch my events:", error);
      myEventIds = new Set();
    }
  }

  async function fetchFollowedCategories() {
    try {
      const response = await fetch(`${apiBaseUrl}/categories/followed`, {
        credentials: "include",
      });
      if (response.ok) {
        followedCategories = await response.json();
      }
    } catch (error) {
      console.error("Error fetching followed categories:", error);
    }
  }

  // ── Render Feed Grid (Accueil - Activités Tendance) ──
  function renderFeedGrid() {
    const feedGrid = document.getElementById("feed-grid");
    if (!feedGrid) return;
    feedGrid.innerHTML = "";

    const now = new Date();
    const upcoming = allEvents.filter((event) => {
      const date = new Date(event.event_date);
      const isFuture = date > now;
      const hasSpace =
        Number(event.participants_count) < Number(event.capacity);
      return isFuture && hasSpace;
    });

    const trendingEvents = upcoming
      .sort((a, b) => {
        const fillRatioA =
          Number(a.participants_count) / Number(a.capacity || 1);
        const fillRatioB =
          Number(b.participants_count) / Number(b.capacity || 1);
        const timeA = new Date(a.event_date).getTime();
        const timeB = new Date(b.event_date).getTime();
        const hoursA = Math.max((timeA - now.getTime()) / (1000 * 60 * 60), 1);
        const hoursB = Math.max((timeB - now.getTime()) / (1000 * 60 * 60), 1);
        const scoreA = fillRatioA * 50 + 200 / hoursA;
        const scoreB = fillRatioB * 50 + 200 / hoursB;
        return scoreB - scoreA;
      })
      .slice(0, 4);

    if (trendingEvents.length === 0) {
      feedGrid.innerHTML =
        '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem;">Aucune activité tendance disponible pour le moment.</p>';
      return;
    }

    trendingEvents.forEach((event) => {
      const isJoined = myEventIds.has(event.id);
      const participantsCount = Number(event.participants_count);
      const card = document.createElement("div");
      card.className = "feed-card";

      let avatarsHtml = "";
      const avatarLimit = Math.min(participantsCount, 4);
      for (let i = 0; i < avatarLimit; i++) {
        avatarsHtml += `<div class="avatar">U${i + 1}</div>`;
      }
      if (participantsCount > 4)
        avatarsHtml += `<div class="avatar">+${participantsCount - 4}</div>`;

      let joinButtonClass = "join-btn";
      let joinButtonText = "Rejoindre";
      if (isJoined) {
        joinButtonClass = "join-btn joined";
        joinButtonText = "✓ Inscrit";
      }

      const sportNameLower = (event.sport || "").toLowerCase();
      const category = sportsCategories.find(
        (c) => c.name.toLowerCase() === sportNameLower,
      );
      const iconClass = category ? category.iconClass : "fa fa-futbol-o";
      card.dataset.sportId = category ? category.id : "all";

      // Bouton supprimer pour les admins (feed)
      let feedAdminDeleteHtml = "";
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
      <div class="feed-image ${sportNameLower}">
        <span class="feed-badge">${escapeHtml(event.sport)}</span>
        <span class="feed-trending-badge">Tendance 🔥</span>
        <div class="feed-image-icon"><i class="${iconClass}"></i></div>
      </div>
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

  // ── Générer le Carrousel de Catégories Défilant ──
  function renderCategoriesMarquee() {
    const track = document.getElementById("categories-marquee-track");
    if (!track) return;
    track.innerHTML = "";

    const categories = sportsCategories.filter((c) => c.id !== "all");
    const repeatCount = 3;
    let trackHtml = "";

    for (let r = 0; r < repeatCount; r++) {
      categories.forEach((category) => {
        trackHtml += `
        <div class="marquee-item" onclick="handleMarqueeClick('${category.id}')" style="cursor: pointer;">
          <span class="marquee-icon"><i class="${category.iconClass}"></i></span>
          <span class="marquee-name">${category.name}</span>
        </div>
      `;
      });
    }
    track.innerHTML = trackHtml;
  }

  // ── Gérer le Clic sur une Catégorie du Carrousel ──
  function handleMarqueeClick(categoryId) {
    const category = sportsCategories.find((c) => c.id === categoryId);
    if (!category) return;

    if (typeof window.showSection === "function") {
      window.showSection("events");
    }

    const mockEvent = {
      currentTarget: document.body,
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
    };

    handleCategoryTileClick(mockEvent, category);
  }
  window.handleMarqueeClick = handleMarqueeClick;

  // ── Créer la carte d'un événement (utilisée dans la grille des événements) ──
  function createEventCardHTML(event) {
    const isJoined = myEventIds.has(event.id);
    const participantsCount = Number(event.participants_count);
    const fillPercent = (participantsCount / (event.capacity || 1)) * 100;
    const isFull = participantsCount >= event.capacity;

    const eventDiv = document.createElement("div");
    let cardClass = "event-card";
    if (isJoined) cardClass = "event-card event-joined";
    eventDiv.className = cardClass;

    let creatorHtml = "";
    if (event.is_automatic) {
      creatorHtml = '<div class="event-auto-badge">⚡ Automatique</div>';
    } else {
      creatorHtml = `<div class="event-creator">👤 ${escapeHtml(event.creator_name || "")}</div>`;
    }

    let actionButtonHtml = "";
    if (isJoined) {
      actionButtonHtml = `<button class="event-btn event-btn-leave" data-event-id="${event.id}">Quitter</button>`;
    } else if (isFull) {
      actionButtonHtml = `<button class="event-btn full" data-event-id="${event.id}" disabled>Complet</button>`;
    } else {
      actionButtonHtml = `<button class="event-btn" data-event-id="${event.id}">Rejoindre</button>`;
    }

    const sportNameLower = (event.sport || "").toLowerCase();
    const category = sportsCategories.find(
      (c) => c.name.toLowerCase() === sportNameLower,
    );
    const iconClass = category ? category.iconClass : "fa fa-futbol-o";

    // Bouton supprimer pour les admins
    let adminDeleteHtml = "";
    if (isAdmin()) {
      adminDeleteHtml = `<button class="event-btn event-btn-delete" data-event-id="${event.id}" title="Supprimer l'événement">🗑️ Supprimer</button>`;
    }

    eventDiv.innerHTML = `
    <div class="feed-image ${sportNameLower}">
      <span class="feed-badge">${escapeHtml(event.sport || "")}</span>
      <span class="feed-date-badge">${formatShortDate(event.event_date)}</span>
      <div class="feed-image-icon"><i class="${iconClass}"></i></div>
    </div>
    <div class="feed-body">
      <div class="feed-title">${escapeHtml(event.title || "")}</div>
      <div class="feed-meta">📍 ${escapeHtml(event.location || "")}</div>
      ${creatorHtml}
      <div class="event-bar"><div style="width:${Math.min(fillPercent, 100)}%"></div></div>
      <div class="feed-footer">
        <span class="event-spots">${participantsCount}/${event.capacity || 0} inscrits</span>
        <div class="event-actions" style="display:flex; gap:0.5rem; align-items:center;">
          ${actionButtonHtml}
          ${adminDeleteHtml}
        </div>
      </div>
    </div>`;

    return eventDiv;
  }

  // ── Render Events Grid (Événements) ──
  function renderEventsGrid(filter) {
    if (!filter) filter = "";
    const eventsGrid = document.getElementById("events-grid");
    if (!eventsGrid) return;
    eventsGrid.innerHTML = "";

    const lowerFilter = filter.toLowerCase();
    let filteredEvents = allEvents.slice();

    // Filtrer d'abord par catégorie de sport active
    if (currentSportFilter !== "all") {
      const selectedCategory = sportsCategories.find(
        (c) => c.id === currentSportFilter,
      );
      if (selectedCategory) {
        filteredEvents = filteredEvents.filter(
          (event) =>
            event.sport.toLowerCase() === selectedCategory.name.toLowerCase(),
        );
      }
    }

    // Filtrer ensuite par le texte recherché
    if (lowerFilter) {
      filteredEvents = filteredEvents.filter((event) => {
        return (
          (event.title || "").toLowerCase().includes(lowerFilter) ||
          (event.sport || "").toLowerCase().includes(lowerFilter) ||
          (event.location || "").toLowerCase().includes(lowerFilter)
        );
      });
    }

    if (filteredEvents.length === 0) {
      eventsGrid.innerHTML =
        '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem;">Aucun événement trouvé</p>';
      return;
    }

    filteredEvents.forEach((event) => {
      eventsGrid.appendChild(createEventCardHTML(event));
    });
  }

  // ── Génération Dynamique des Tuiles de Sport dans le Sidebar ──
  function renderSportCategoriesList() {
    const listContainer = document.getElementById("events-categories-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    sportsCategories.forEach((category) => {
      let count = 0;
      if (category.id === "all") count = allEvents.length;
      else
        count = allEvents.filter(
          (e) => e.sport.toLowerCase() === category.name.toLowerCase(),
        ).length;

      const tile = document.createElement("div");
      tile.className = `event-category-tile${currentSportFilter === category.id ? " active" : ""}`;
      tile.dataset.categoryId = category.id;

      tile.innerHTML = `
      <span class="tile-icon"><i class="${category.iconClass}"></i></span>
      <span class="tile-name">${category.name}</span>
      <span class="tile-count">${count}</span>
    `;

      tile.addEventListener("click", (e) => {
        handleCategoryTileClick(e, category);
      });

      listContainer.appendChild(tile);
    });
  }

  // ── Gestionnaire de Clic sur les Tuiles de Catégorie ──
  function handleCategoryTileClick(event, category) {
    if (currentSportFilter === category.id) return; // Déjà sélectionné

    window.scrollTo({ top: 0 });
    const mainContent = document.querySelector(".main-content");
    if (mainContent) {
      mainContent.scrollTo({ top: 0 });
    }

    const tileElement = event.currentTarget;
    const rect = tileElement.getBoundingClientRect();
    const clickX = rect.left + rect.width / 2;
    const clickY = rect.top + rect.height / 2;

    // 1. Éclatement de petites émoticônes depuis le clic
    spawnEmojiBurst(clickX, clickY, category.icon);

    // 2. Balayage radial de transition thématique
    triggerThemeTransition(clickX, clickY, category.theme, () => {
      // Changement de classe de thème à mi-chemin
      sportsCategories.forEach((c) => {
        if (c.theme) document.body.classList.remove(c.theme);
      });

      if (category.theme) document.body.classList.add(category.theme);

      // Mettre à jour le filtre de sport actif
      currentSportFilter = category.id;
      window.currentSportFilter = category.id;

      // Actualiser le bouton de suivi et le titre du header
      updateFollowButton();

      // Mettre à jour l'arrière-plan d'icônes
      if (window.updateAmbientBackdrop)
        window.updateAmbientBackdrop(category.id);

      // Actualiser le rendu de la barre latérale des catégories et de la grille
      renderSportCategoriesList();

      const searchInput = document.getElementById("event-search");
      const searchValue = searchInput ? searchInput.value : "";
      renderEventsGrid(searchValue);
    });
  }

  // ── Éclatement d'Émoticônes (Confetti Burst) ──
  function spawnEmojiBurst(x, y, emoji) {
    const container = document.body;
    const particleCount = 10;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement("span");
      particle.className = "emoji-burst-particle";
      particle.textContent = emoji;

      const angle = Math.random() * Math.PI * 2;
      const distance = 80 + Math.random() * 120;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      const rot = Math.random() * 360 + 180;

      particle.style.setProperty("--x", `${x}px`);
      particle.style.setProperty("--y", `${y}px`);
      particle.style.setProperty("--dx", `${dx}`);
      particle.style.setProperty("--dy", `${dy}`);
      particle.style.setProperty("--rot", `${rot}deg`);

      container.appendChild(particle);

      setTimeout(() => {
        particle.remove();
      }, 400);
    }
  }

  // ── Déclencheur de Transition Thématique Verticale (Vertical Slide) ──
  function triggerThemeTransition(x, y, newTheme, midwayCallback) {
    const overlay = document.getElementById("theme-transition-overlay");
    if (!overlay) {
      if (midwayCallback) midwayCallback();
      return;
    }

    let targetTranslucentBg =
      "linear-gradient(to bottom, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.02))";
    overlay.style.setProperty("--bg-new-translucent", targetTranslucentBg);

    overlay.classList.remove("animating", "fade-out");
    overlay.style.display = "block";

    overlay.offsetWidth; // reflow
    overlay.classList.add("animating");

    setTimeout(() => {
      if (midwayCallback) midwayCallback();
    }, 180);

    setTimeout(() => {
      overlay.classList.add("fade-out");
    }, 400);

    setTimeout(() => {
      overlay.style.display = "none";
      overlay.classList.remove("animating", "fade-out");
    }, 600);
  }

  window.renderCategoryEvents = function (sportName) {
    const container = document.getElementById("category-events-grid");
    if (!container) return;
    container.innerHTML = "";

    const filteredEvents = allEvents.filter(
      (event) => event.sport.toLowerCase() === sportName.toLowerCase(),
    );

    if (filteredEvents.length === 0) {
      container.innerHTML =
        "<p style='color:var(--text-muted); grid-column:1/-1;'>Aucune activité trouvée pour cette catégorie.</p>";
      return;
    }

    filteredEvents.forEach((event) => {
      container.appendChild(createEventCardHTML(event));
    });
  };

  // ── Rejoindre / Quitter ──
  async function joinEvent(eventId) {
    try {
      const response = await apiFetch(`/events/${eventId}/join`, {
        method: "POST",
      });
      if (!response) return;
      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || "Erreur lors de l'inscription");
        return;
      }
      await refreshAll();
    } catch (error) {
      console.error("Join error:", error);
    }
  }

  async function leaveEvent(eventId) {
    try {
      const response = await apiFetch(`/events/${eventId}/leave`, {
        method: "POST",
      });
      if (!response) return;
      await refreshAll();
    } catch (error) {
      console.error("Leave error:", error);
    }
  }

  // ── Supprimer un événement (admin uniquement) ──
  async function deleteEvent(eventId) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet événement ? Cette action est irréversible.")) {
      return;
    }
    try {
      const response = await apiFetch(`/events/${eventId}`, { method: "DELETE" });
      if (!response) return;
      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || "Erreur lors de la suppression");
        return;
      }
      await refreshAll();
    } catch (error) {
      console.error("Delete event error:", error);
    }
  }

  // ── Créer un événement ──
  async function createEvent(formData) {
    const errorDiv = document.getElementById("create-event-error");
    const errorText = document.getElementById("create-event-error-text");
    
    try {
      const response = await apiFetch("/events", {
        method: "POST",
        body: JSON.stringify(formData),
      });
      if (!response) return false;
      if (!response.ok) {
        const errorData = await response.json();
        if (errorDiv && errorText) {
          errorText.textContent = errorData.error || "Erreur lors de la création de l'événement";
          errorDiv.style.display = "flex";
        } else {
          alert(errorData.error || "Erreur lors de la création");
        }
        return false;
      }
      if (errorDiv) errorDiv.style.display = "none";
      await refreshAll();
      return true;
    } catch (error) {
      console.error("Create event error:", error);
      if (errorDiv && errorText) {
        errorText.textContent = "Erreur de connexion avec le serveur.";
        errorDiv.style.display = "flex";
      }
      return false;
    }
  }

  // ── Modale de création d'événement ──
  function initCreateEventModal() {
    const modal = document.getElementById("create-event-modal");
    const openButton = document.getElementById("btn-create-event");
    const closeButton = document.getElementById("modal-close");
    const cancelButton = document.getElementById("modal-cancel");
    const form = document.getElementById("create-event-form");

    if (!modal || !openButton || !form) return;

    const sportSelect = form.querySelector("#ev-sport-select");
    const customContainer = form.querySelector("#ev-sport-custom-container");
    const customInput = form.querySelector("#ev-sport-custom");

    if (sportSelect && customContainer && customInput) {
      sportSelect.addEventListener("change", () => {
        if (sportSelect.value === "autre") {
          customContainer.style.display = "flex";
          customInput.required = true;
          customInput.focus();
        } else {
          customContainer.style.display = "none";
          customInput.required = false;
          customInput.value = "";
        }
      });
    }

    openButton.addEventListener("click", () => {
      modal.classList.add("active");
      const dateInput = form.querySelector("#ev-date");
      if (dateInput) {
        // Empêcher de sélectionner une date antérieure à aujourd'hui
        const today = new Date();
        const yyyy = today.getFullYear();
        let mm = today.getMonth() + 1;
        let dd = today.getDate();
        if (dd < 10) dd = '0' + dd;
        if (mm < 10) mm = '0' + mm;
        dateInput.min = yyyy + '-' + mm + '-' + dd;
      }
    });

    function closeModal() {
      modal.classList.remove("active");
      form.reset();
      const errorDiv = document.getElementById("create-event-error");
      if (errorDiv) errorDiv.style.display = "none";
      if (customContainer) customContainer.style.display = "none";
      if (customInput) customInput.required = false;
    }

    if (closeButton) closeButton.addEventListener("click", closeModal);
    if (cancelButton) cancelButton.addEventListener("click", closeModal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const dateValue = form.querySelector("#ev-date").value.trim();
      const timeValue = form.querySelector("#ev-time").value.trim();

      let finalSport = "";
      if (sportSelect) {
        if (sportSelect.value === "autre" && customInput)
          finalSport = customInput.value.trim();
        else finalSport = sportSelect.value;
      }

      const formData = {
        title: form.querySelector("#ev-title").value.trim(),
        sport: finalSport,
        location: form.querySelector("#ev-location").value.trim(),
        event_date: dateValue + "T" + timeValue,
        capacity: Number(form.querySelector("#ev-capacity").value),
      };

      if (
        !formData.title ||
        !formData.sport ||
        !formData.location ||
        !dateValue ||
        !timeValue ||
        !formData.capacity
      ) {
        const errorDiv = document.getElementById("create-event-error");
        const errorText = document.getElementById("create-event-error-text");
        if (errorDiv && errorText) {
          errorText.textContent = "Tous les champs sont obligatoires";
          errorDiv.style.display = "flex";
        } else {
          alert("Tous les champs sont obligatoires");
        }
        return;
      }

      const success = await createEvent(formData);
      if (success) closeModal();
    });
  }

  // ── Délégation de clic pour les boutons rejoindre/quitter/supprimer ──
  function initClickHandlers() {
    document.addEventListener("click", async (event) => {
      const feedCard = event.target.closest(".feed-card");
      if (feedCard && !event.target.closest("button")) {
        const sportId = feedCard.dataset.sportId;
        if (sportId) {
          const category = sportsCategories.find((c) => c.id === sportId);
          if (category) {
            if (typeof window.showSection === "function") {
              window.showSection("events");
            }
            const mockEvent = {
              currentTarget: document.querySelector(`[data-category-id="${sportId}"]`) || document.body,
              clientX: window.innerWidth / 2,
              clientY: window.innerHeight / 2,
            };
            handleCategoryTileClick(mockEvent, category);
          }
        }
        return;
      }

      const joinButton = event.target.closest(".join-btn:not(.joined)");
      if (joinButton) {
        const eventId = Number(joinButton.dataset.eventId);
        if (eventId) await joinEvent(eventId);
        return;
      }

      const joinedButton = event.target.closest(".join-btn.joined");
      if (joinedButton) {
        const eventId = Number(joinedButton.dataset.eventId);
        if (eventId) await leaveEvent(eventId);
        return;
      }

      const eventJoinButton = event.target.closest(
        ".event-btn:not(.full):not(.event-btn-leave):not(.event-btn-delete)",
      );
      if (eventJoinButton) {
        if (eventJoinButton.dataset.eventId) {
          const eventId = Number(eventJoinButton.dataset.eventId);
          if (eventId) await joinEvent(eventId);
        }
        return;
      }

      const leaveButton = event.target.closest(".event-btn-leave");
      if (leaveButton) {
        const eventId = Number(leaveButton.dataset.eventId);
        if (eventId) await leaveEvent(eventId);
        return;
      }

      const deleteButton = event.target.closest(".event-btn-delete");
      if (deleteButton) {
        const eventId = Number(deleteButton.dataset.eventId);
        if (eventId) await deleteEvent(eventId);
        return;
      }
    });
  }

  // ── Recherche ──
  function initSearch() {
    const searchInput = document.getElementById("event-search");
    if (searchInput) {
      searchInput.addEventListener("input", (event) => {
        renderEventsGrid(event.target.value);
      });
    }
  }

  // ── Arrière-plan d'icônes de sport flottantes (Défilement ambiant) ──
  function updateAmbientBackdrop(sportId) {
    const backdrop = document.getElementById("ambient-sports-backdrop");
    if (!backdrop) return;
    backdrop.innerHTML = "";

    if (!sportId) sportId = "all";

    const gridWatermark = document.getElementById(
      "events-grid-sport-watermark",
    );
    if (gridWatermark) {
      let gridIconClass = "fa fa-globe";
      if (sportId !== "all") {
        const category = sportsCategories.find((c) => c.id === sportId);
        if (category && category.iconClass) gridIconClass = category.iconClass;
      }
      gridWatermark.style.transform = "scale(0.3)";
      gridWatermark.style.opacity = "0";

      setTimeout(() => {
        gridWatermark.innerHTML = `<i class="${gridIconClass}"></i>`;
        gridWatermark.style.transform = "scale(1)";
        gridWatermark.style.opacity = "0.12";
      }, 150);
    }

    const sidebarLogoContainer = document.getElementById(
      "sidebar-active-sport-logo",
    );
    if (sidebarLogoContainer) {
      let sidebarIconClass = "fa fa-globe";
      if (sportId !== "all") {
        const category = sportsCategories.find((c) => c.id === sportId);
        if (category && category.iconClass)
          sidebarIconClass = category.iconClass;
      }
      sidebarLogoContainer.style.transform = "scale(0.3)";
      sidebarLogoContainer.style.opacity = "0";
      setTimeout(() => {
        sidebarLogoContainer.innerHTML = `<i class="${sidebarIconClass}"></i>`;
        sidebarLogoContainer.style.transform = "scale(1)";
        sidebarLogoContainer.style.opacity = "0.25";
      }, 150);
    }

    const particleCount = 15;
    const availableCategories = sportsCategories.filter(
      (c) => c.id !== "all" && c.iconClass,
    );

    for (let i = 0; i < particleCount; i++) {
      let iconClass = "";
      if (sportId === "all") {
        if (availableCategories.length > 0) {
          const randCat =
            availableCategories[
              Math.floor(Math.random() * availableCategories.length)
            ];
          iconClass = randCat.iconClass;
        } else continue;
      } else {
        const category = sportsCategories.find((c) => c.id === sportId);
        if (!category || !category.iconClass) continue;
        iconClass = category.iconClass;
      }

      const iconEl = document.createElement("i");
      iconEl.className = `${iconClass} floating-background-icon`;

      const left = Math.random() * 100;
      const size = 3 + Math.random() * 5;
      const duration = 20 + Math.random() * 25;
      const delay = -(Math.random() * duration);
      const driftX = -100 + Math.random() * 200;

      iconEl.style.setProperty("--left", `${left}%`);
      iconEl.style.setProperty("--size", `${size}rem`);
      iconEl.style.setProperty("--duration", `${duration}s`);
      iconEl.style.setProperty("--delay", `${delay}s`);
      iconEl.style.setProperty("--drift-x", `${driftX}px`);

      backdrop.appendChild(iconEl);
    }
  }
  window.updateAmbientBackdrop = updateAmbientBackdrop;

  // ── Suivi des catégories de sport dans la page événements ──
  function updateFollowButton() {
    const followBtn = document.getElementById("events-follow-sport-btn");
    const pageTitle = document.getElementById("events-page-title");
    if (!followBtn || !pageTitle) return;

    if (currentSportFilter === "all") {
      followBtn.style.display = "none";
      pageTitle.textContent = "Événements sportifs";
    } else {
      const selectedCategory = sportsCategories.find(
        (c) => c.id === currentSportFilter,
      );
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
      const selectedCategory = sportsCategories.find(
        (c) => c.id === currentSportFilter,
      );
      if (!selectedCategory) return;

      const categoryId = selectedCategory.id;
      const isFollowing = followedCategories.includes(categoryId);

      let method = "POST";
      if (isFollowing) method = "DELETE";

      try {
        const response = await fetch(
          `${apiBaseUrl}/categories/${categoryId}/follow`,
          { method, credentials: "include" },
        );
        if (response.ok) {
          if (isFollowing)
            followedCategories = followedCategories.filter(
              (id) => id !== categoryId,
            );
          else followedCategories.push(categoryId);

          updateFollowButton();

          if (window.loadRooms) window.loadRooms();
        }
      } catch (error) {
        console.error("Error toggling follow:", error);
      }
    });
  }

  // ── Actualiser toutes les données ──
  async function refreshAll() {
    await Promise.all([
      fetchAllEvents(),
      fetchMyEvents(),
      fetchFollowedCategories(),
    ]);
    renderFeedGrid();
    renderCategoriesMarquee();

    const searchInput = document.getElementById("event-search");
    let searchValue = "";
    if (searchInput) searchValue = searchInput.value;

    renderEventsGrid(searchValue);
    renderSportCategoriesList();
    updateFollowButton();
    updateAmbientBackdrop(currentSportFilter);

    if (window.currentCategoryDetail)
      window.renderCategoryEvents(window.currentCategoryDetail);
    if (window.loadRooms) window.loadRooms();
    if (window.renderCategories) window.renderCategories();
    if (window.loadProfileData) window.loadProfileData();
  }
  window.refreshAll = refreshAll;

  // Exposer globalement les variables pour les autres scripts (navigation, chat)
  window.sportsCategories = sportsCategories;
  window.currentSportFilter = currentSportFilter;
  window.spawnEmojiBurst = spawnEmojiBurst;
  window.triggerThemeTransition = triggerThemeTransition;
  window.updateAmbientBackdrop = updateAmbientBackdrop;
  window.allEvents = allEvents;

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
