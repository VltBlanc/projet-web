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
