// ── Initialisation du profil utilisateur ──
const profileUsernameElement = document.getElementById("profile-username");
const profileAvatarLargeElement = document.querySelector(".profile-avatar-large");
const mobileAvatarElement = document.querySelector(".mobile-avatar");

let profileUsername = localStorage.getItem("currentUser");
if (!profileUsername) {
  profileUsername = "Utilisateur";
}

if (profileUsernameElement) {
  profileUsernameElement.textContent = profileUsername;
  // Ajouter un badge admin si l'utilisateur est admin
  const userRole = localStorage.getItem('userRole');
  if (userRole === 'admin') {
    const badge = document.createElement('span');
    badge.className = 'admin-badge';
    badge.textContent = 'Admin';
    profileUsernameElement.appendChild(badge);
  }
}

if (profileUsername !== "Utilisateur") {
  const userInitials = profileUsername.slice(0, 2).toUpperCase();
  if (profileAvatarLargeElement) {
    profileAvatarLargeElement.textContent = userInitials;
  }
  if (mobileAvatarElement) {
    mobileAvatarElement.textContent = userInitials;
  }
}
