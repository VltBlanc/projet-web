// ── Alternance des onglets (Tabs) ──
const tabButtons = document.querySelectorAll('.tab-btn');
const formSections = document.querySelectorAll('.form-section');
const errorMessageElement = document.getElementById('msg-error');
const successMessageElement = document.getElementById('msg-success');

if (tabButtons.length > 0) {
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(otherButton => otherButton.classList.remove('active'));
      formSections.forEach(section => section.classList.remove('active'));
      button.classList.add('active');
      const targetSection = document.getElementById(button.dataset.tab);
      if (targetSection) {
        targetSection.classList.add('active');
      }
      hideMessages();
    });
  });
}

function showErrorMessage(text) {
  if (errorMessageElement) {
    errorMessageElement.textContent = text;
    errorMessageElement.style.display = 'block';
  }
  if (successMessageElement) {
    successMessageElement.style.display = 'none';
  }
}

function showSuccessMessage(text) {
  if (successMessageElement) {
    successMessageElement.textContent = text;
    successMessageElement.style.display = 'block';
  }
  if (errorMessageElement) {
    errorMessageElement.style.display = 'none';
  }
}

function hideMessages() {
  if (errorMessageElement) {
    errorMessageElement.style.display = 'none';
  }
  if (successMessageElement) {
    successMessageElement.style.display = 'none';
  }
}

// ── Connexion (Login) ──
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('mdp');
const loginButton = document.getElementById('send');

if (loginButton) {
  loginButton.addEventListener('click', async () => {
    hideMessages();
    if (!usernameInput || !passwordInput) {
      return;
    }
    if (!usernameInput.value.trim() || !passwordInput.value.trim()) {
      showErrorMessage('Veuillez remplir tous les champs.');
      return;
    }

    let restHost = `http://${location.hostname}:8081`;
    if (location.hostname === "localhost") {
      restHost = "http://localhost:8081";
    }

    try {
      const response = await fetch(`${restHost}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: usernameInput.value, password: passwordInput.value })
      });
      if (response.ok) {
        const data = await response.json();
        // Enregistrer le nom d'utilisateur pour l'identification du chat
        if (data.user) {
          if (data.user.name) {
            localStorage.setItem('currentUser', data.user.name);
          }
          if (data.user.role) {
            localStorage.setItem('userRole', data.user.role);
          }
        }
        window.location.href = 'main.html';
      } else {
        const errorData = await response.json();
        let messageErreur = 'Échec de la connexion.';
        if (errorData.error) {
          messageErreur = errorData.error;
        }
        showErrorMessage(messageErreur);
      }
    } catch (error) {
      showErrorMessage('Erreur réseau ou serveur.');
      console.error(error);
    }
  });
}

// ── Inscription (Register) ──
const registerUsernameInput = document.getElementById('usernameR');
const registerPasswordInput = document.getElementById('mdpR');
const registerButton = document.getElementById('sendR');

if (registerButton) {
  registerButton.addEventListener('click', async () => {
    hideMessages();
    if (!registerUsernameInput || !registerPasswordInput) {
      return;
    }
    if (!registerUsernameInput.value.trim() || !registerPasswordInput.value.trim()) {
      showErrorMessage('Veuillez remplir tous les champs.');
      return;
    }

    let restHost = `http://${location.hostname}:8081`;
    if (location.hostname === "localhost") {
      restHost = "http://localhost:8081";
    }

    try {
      const response = await fetch(`${restHost}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: registerUsernameInput.value, password: registerPasswordInput.value })
      });
      if (response.ok) {
        showSuccessMessage('Compte créé avec succès ! Vous pouvez vous connecter.');
        registerUsernameInput.value = '';
        registerPasswordInput.value = '';
        // Basculer vers l'onglet de connexion
        tabButtons.forEach(button => button.classList.remove('active'));
        formSections.forEach(section => section.classList.remove('active'));
        const loginTab = document.querySelector('[data-tab="login"]');
        if (loginTab) {
          loginTab.classList.add('active');
        }
        const loginSection = document.getElementById('login');
        if (loginSection) {
          loginSection.classList.add('active');
        }
      } else {
        const errorData = await response.json();
        let messageErreur = 'Échec de l\'inscription.';
        if (errorData.error) {
          messageErreur = errorData.error;
        }
        showErrorMessage(messageErreur);
      }
    } catch (error) {
      showErrorMessage('Erreur réseau ou serveur.');
      console.error(error);
    }
  });
}

