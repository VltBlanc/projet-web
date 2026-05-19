// ── Tab switching ──
const tabBtns = document.querySelectorAll('.tab-btn');
const formSections = document.querySelectorAll('.form-section');
const msgError = document.getElementById('msg-error');
const msgSuccess = document.getElementById('msg-success');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    formSections.forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    hideMsgs();
  });
});

function showError(text) {
  msgError.textContent = text;
  msgError.style.display = 'block';
  msgSuccess.style.display = 'none';
}
function showSuccess(text) {
  msgSuccess.textContent = text;
  msgSuccess.style.display = 'block';
  msgError.style.display = 'none';
}
function hideMsgs() {
  msgError.style.display = 'none';
  msgSuccess.style.display = 'none';
}

// ── Login ──
const user = document.getElementById('username');
const mdp = document.getElementById('mdp');
const envoyer = document.getElementById('send');

envoyer.addEventListener('click', async () => {
  hideMsgs();
  if (!user.value.trim() || !mdp.value.trim()) {
    showError('Veuillez remplir tous les champs.');
    return;
  }
  try {
    const reponse = await fetch('http://localhost:8081/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: user.value, password: mdp.value })
    });
    if (reponse.ok) {
      window.location.href = 'main.html';
    } else {
      const errorData = await reponse.json();
      showError(errorData.error || 'Échec de la connexion.');
    }
  } catch (error) {
    showError('Erreur réseau ou serveur.');
    console.error(error);
  }
});

// ── Register ──
const userR = document.getElementById('usernameR');
const mdpR = document.getElementById('mdpR');
const envoyerR = document.getElementById('sendR');

envoyerR.addEventListener('click', async () => {
  hideMsgs();
  if (!userR.value.trim() || !mdpR.value.trim()) {
    showError('Veuillez remplir tous les champs.');
    return;
  }
  try {
    const reponse = await fetch('http://localhost:8081/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: userR.value, password: mdpR.value })
    });
    if (reponse.ok) {
      showSuccess('Compte créé avec succès ! Vous pouvez vous connecter.');
      userR.value = '';
      mdpR.value = '';
      // Switch to login tab
      tabBtns.forEach(b => b.classList.remove('active'));
      formSections.forEach(s => s.classList.remove('active'));
      document.querySelector('[data-tab="login"]').classList.add('active');
      document.getElementById('login').classList.add('active');
    } else {
      const errorData = await reponse.json();
      showError(errorData.error || 'Échec de l\'inscription.');
    }
  } catch (error) {
    showError('Erreur réseau ou serveur.');
    console.error(error);
  }
});
