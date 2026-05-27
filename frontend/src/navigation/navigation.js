// ── Navigation & Sidebar ──
const navigationItems = document.querySelectorAll(".nav-item");
const contentSections = document.querySelectorAll(".content-section");
const sidebar = document.getElementById("sidebar");
const menuToggleButton = document.getElementById("menu-toggle");

function showSection(sectionId) {
  const outgoingSection = document.querySelector(".content-section.active") || document.querySelector(".content-section.page-enter-active");
  const incomingSection = document.getElementById(sectionId);

  if (!incomingSection) return;
  if (incomingSection === outgoingSection) return;

  window.scrollTo({ top: 0 });
  const mainContent = document.querySelector(".main-content");
  if (mainContent) {
    mainContent.scrollTo({ top: 0 });
  }

  // Annuler le timeout existant pour éviter les conflits d'états
  if (window.showSectionTimeout) {
    clearTimeout(window.showSectionTimeout);
    window.showSectionTimeout = null;
  }

  // Nettoyer immédiatement toutes les classes de transition sur toutes les sections
  contentSections.forEach((section) => {
    section.classList.remove("page-enter", "page-enter-active", "page-leave-active");
  });

  // Activer le bon bouton de navigation
  navigationItems.forEach((navItem) => navItem.classList.remove("active"));
  const activeNavItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
  if (activeNavItem) {
    activeNavItem.classList.add("active");
  }

  // L'ancienne section active reste visible en arrière-plan pendant la transition
  if (outgoingSection) {
    outgoingSection.classList.remove("active");
    outgoingSection.classList.add("page-leave-active");
  }

  // Déclencher la transition glissante décalée (modèle Vue page transition)
  incomingSection.classList.add("page-enter");
  incomingSection.offsetWidth; // Forcer le reflow
  incomingSection.classList.add("page-enter-active");
  incomingSection.classList.remove("page-enter");

  window.showSectionTimeout = setTimeout(() => {
    contentSections.forEach((section) => {
      section.classList.remove("page-enter", "page-enter-active", "page-leave-active");
    });
    incomingSection.classList.add("active");
    window.showSectionTimeout = null;
  }, 1300);

  // Afficher le logo du sport dans la barre latérale uniquement pour l'onglet Événements
  const sidebarLogo = document.getElementById("sidebar-active-sport-logo");
  if (sidebarLogo) {
    sidebarLogo.style.display = (sectionId === "events") ? "flex" : "none";
  }

  // Gérer l'application ou la réinitialisation du thème de sport selon l'onglet
  if (sectionId === "feed" || sectionId === "profile") {
    // Réinitialiser au thème par défaut
    if (window.sportsCategories) {
      window.sportsCategories.forEach(c => {
        if (c.theme) {
          document.body.classList.remove(c.theme);
        }
      });
    }
    // Mettre à jour le défilement d'icônes de sport en arrière-plan (mélange complet)
    if (window.updateAmbientBackdrop) {
      window.updateAmbientBackdrop('all');
    }
  } else if (sectionId === "events") {
    // Appliquer le thème du filtre/catégorie de sport active sur la page événement
    const activeFilter = window.currentSportFilter || "all";
    if (window.sportsCategories) {
      const selectedCategory = window.sportsCategories.find(c => c.id === activeFilter);
      
      window.sportsCategories.forEach(c => {
        if (c.theme) {
          document.body.classList.remove(c.theme);
        }
      });
      
      if (selectedCategory && selectedCategory.theme) {
        document.body.classList.add(selectedCategory.theme);
      }
    }
    // Mettre à jour le défilement d'icônes de sport en arrière-plan avec le sport filtre actif
    if (window.updateAmbientBackdrop) {
      window.updateAmbientBackdrop(activeFilter);
    }
  } else if (sectionId === "chat") {
    // Appliquer le thème de la room active du chat
    if (typeof window.applyRoomThemeDirect === "function") {
      const activeRoom = document.querySelector(".room-item.active");
      if (activeRoom) {
        const roomName = activeRoom.querySelector(".room-name").textContent;
        window.applyRoomThemeDirect(roomName);
      } else {
        const activeRoomTitle = document.getElementById("chat-title");
        if (activeRoomTitle) {
          window.applyRoomThemeDirect(activeRoomTitle.textContent);
        }
      }
    }
  }

  if (window.innerWidth <= 768) {
    if (sidebar) {
      sidebar.classList.remove("open");
    }
  }
}
window.showSection = showSection;

navigationItems.forEach((navItem) => {
  navItem.addEventListener("click", () => showSection(navItem.dataset.section));
});

if (menuToggleButton) {
  if (sidebar) {
    menuToggleButton.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }
}
