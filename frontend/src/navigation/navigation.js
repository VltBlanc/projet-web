// ── Navigation & Sidebar ──
const navigationItems = document.querySelectorAll(".nav-item");
const contentSections = document.querySelectorAll(".content-section");
const sidebar = document.getElementById("sidebar");
const menuToggleButton = document.getElementById("menu-toggle");

function showSection(sectionId) {
  contentSections.forEach((section) => section.classList.remove("active"));
  navigationItems.forEach((navItem) => navItem.classList.remove("active"));

  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.classList.add("active");
  }

  const activeNavItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
  if (activeNavItem) {
    activeNavItem.classList.add("active");
  }

  if (window.innerWidth <= 768) {
    if (sidebar) {
      sidebar.classList.remove("open");
    }
  }
}

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
