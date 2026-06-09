(() => {
  // ── Données et logique des catégories ──
  const categoriesData = [
    { id: "football", name: "Football", icon: "⚽" },
    { id: "basket", name: "Basket", icon: "🏀" },
    { id: "running", name: "Running", icon: "🏃" },
    { id: "tennis", name: "Tennis", icon: "🎾" },
    { id: "musculation", name: "Musculation", icon: "💪" },
    { id: "yoga", name: "Yoga", icon: "🧘" },
    { id: "escalade", name: "Escalade", icon: "🧗" },
    { id: "cyclisme", name: "Cyclisme", icon: "🚴" },
  ];

  const categoriesGrid = document.getElementById("categories-grid");
  const categoryDetail = document.getElementById("category-detail");
  const categoriesMain = document.getElementById("categories-main");
  const backToCategoriesButton = document.getElementById("btn-back-categories");
  const categoryDetailTitle = document.getElementById("category-detail-title");
  const followCategoryButton = document.getElementById("btn-follow-category");

  let followedCategories = [];
  let globalRestHost = `http://${location.hostname}:8081`;
  if (location.hostname === "localhost") {
    globalRestHost = "http://localhost:8081";
  }

  // Récupérer la liste des catégories suivies
  async function fetchFollowedCategories() {
    try {
      const response = await fetch(`${globalRestHost}/categories/followed`, { credentials: "include" });
      if (response.ok) {
        followedCategories = await response.json();
      }
    } catch (error) {
      console.error("Error fetching followed categories:", error);
    }
    // Toujours re-rendre les catégories, que la requête ait réussi ou non
    renderCategories();
  }

  let currentCategoryDetail = null;

  if (followCategoryButton) {
    followCategoryButton.addEventListener("click", async () => {
      if (!currentCategoryDetail) {
        return;
      }
      const categoryNameLower = currentCategoryDetail.toLowerCase();
      const isFollowing = followedCategories.includes(categoryNameLower);
      
      let method = "POST";
      if (isFollowing) {
        method = "DELETE";
      }

      try {
        const response = await fetch(`${globalRestHost}/categories/${categoryNameLower}/follow`, {
          method: method,
          credentials: "include"
        });
        if (response.ok) {
          if (isFollowing) {
            followedCategories = followedCategories.filter(categoryItem => categoryItem !== categoryNameLower);
          } else {
            followedCategories.push(categoryNameLower);
          }
          updateFollowButton();
          renderCategories();
          if (window.loadRooms) {
            window.loadRooms();
          }
        }
      } catch (error) {
        console.error("Error toggling follow:", error);
      }
    });
  }

  function updateFollowButton() {
    if (!followCategoryButton || !currentCategoryDetail) {
      return;
    }
    const categoryNameLower = currentCategoryDetail.toLowerCase();
    const isFollowing = followedCategories.includes(categoryNameLower);
    if (isFollowing) {
      followCategoryButton.textContent = "Ne plus suivre";
      followCategoryButton.classList.remove("btn-primary");
      followCategoryButton.classList.add("btn-secondary");
    } else {
      followCategoryButton.textContent = "Suivre";
      followCategoryButton.classList.remove("btn-secondary");
      followCategoryButton.classList.add("btn-primary");
    }
  }

  // La récupération initiale est déclenchée après l'exposition de window.renderCategories (voir bas du fichier)

  function renderCategories() {
    if (!categoriesGrid) {
      return;
    }
    categoriesGrid.innerHTML = "";
    categoriesData.forEach((category) => {
      // Compter les événements pour cette catégorie
      const activeEvents = window.allEvents || [];
      const count = activeEvents.filter(event => event.sport.toLowerCase() === category.name.toLowerCase()).length;
      const isCategoryFollowed = followedCategories.includes(category.id);
      
      let pluralSuffix = "s";
      if (count === 1) {
        pluralSuffix = "";
      }
      
      let followedBadgeHtml = "";
      if (isCategoryFollowed) {
        followedBadgeHtml = '<span class="followed-badge">Suivi</span>';
      }
      
      const card = document.createElement("div");
      card.className = "category-card";
      if (isCategoryFollowed) {
        card.className = "category-card followed";
      }
      
      card.innerHTML = `
        <div class="category-icon">${category.icon}</div>
        <div class="category-title">${category.name}</div>
        <div class="category-count">
          ${count} activité${pluralSuffix}
          ${followedBadgeHtml}
        </div>
      `;
      card.addEventListener("click", () => showCategoryDetail(category.name));
      categoriesGrid.appendChild(card);
    });
  }

  function showCategoryDetail(categoryName) {
    currentCategoryDetail = categoryName;
    window.currentCategoryDetail = categoryName;
    if (categoriesMain) {
      categoriesMain.style.display = "none";
    }
    if (categoryDetail) {
      categoryDetail.style.display = "block";
    }
    if (categoryDetailTitle) {
      categoryDetailTitle.textContent = categoryName;
    }
    updateFollowButton();
    
    if (window.renderCategoryEvents) {
      window.renderCategoryEvents(categoryName);
    }
  }

  if (backToCategoriesButton) {
    backToCategoriesButton.addEventListener("click", () => {
      if (categoryDetail) {
        categoryDetail.style.display = "none";
      }
      if (categoriesMain) {
        categoriesMain.style.display = "block";
      }
    });
  }

  // Exposer globalement pour permettre la mise à jour depuis d'autres modules
  window.renderCategories = renderCategories;

  // Rendu initial synchrone : les cartes apparaissent immédiatement (avec compteurs à 0)
  // puis sont mises à jour dès que les événements sont chargés via refreshAll()
  renderCategories();
  fetchFollowedCategories();

  // Réinitialiser la vue lors du clic sur le menu "Catégories"
  const categoryNavItems = document.querySelectorAll(".nav-item");
  categoryNavItems.forEach((itemButton) => {
    itemButton.addEventListener("click", () => {
      if (itemButton.dataset.section === "categories") {
        if (categoriesMain) {
          categoriesMain.style.display = "block";
        }
        if (categoryDetail) {
          categoryDetail.style.display = "none";
        }
      }
    });
  });
})();
