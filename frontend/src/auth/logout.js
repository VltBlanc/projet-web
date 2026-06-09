// ── Déconnexion (Logout) ──
// Ce fichier est chargé uniquement dans main.html
// Il ne contient que la logique de déconnexion, sans les listeners de login/register
// qui utilisaient le même id "#send" que le formulaire du chat.

const logoutButton = document.getElementById("logout");

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    let restHost = `http://${location.hostname}:8081`;
    if (location.hostname === "localhost") {
      restHost = "http://localhost:8081";
    }
    try {
      await fetch(`${restHost}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Erreur lors de la déconnexion :", error);
    }
    if (window.chat) {
      window.chat.disconnect();
    }
    window.location.href = "login.html";
  });
}
