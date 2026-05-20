// ── Client de chat pour la page de chat autonome ───────────────────────────────────────

let currentUser = localStorage.getItem('currentUser');
if (!currentUser) {
  currentUser = 'Moi';
}

let wsProtocol = 'ws:';
if (location.protocol === 'https:') {
  wsProtocol = 'wss:';
}

let wsHost = `${location.hostname}:8081`;
if (location.hostname === 'localhost') {
  wsHost = 'localhost:8081';
}

let restHost = `http://${location.hostname}:8081`;
if (location.hostname === 'localhost') {
  restHost = 'http://localhost:8081';
}

const chat = new ChatClient({
  wsUrl: `${wsProtocol}//${wsHost}/ws`,
  restBase: restHost,
  maxReconnects: 10,
  reconnectDelay: 1000,
  historyLimit: 50,
});

// DOM (Éléments de l'interface)
const sendForm = document.getElementById('send');
const newMessage = document.getElementById('new_message');
const chatBox = document.getElementById('chat_box');

// ── Rendu des messages ─────────────────────────────────────────────────────────

function appendMessage(author, text, createdAt, isOwnMessage) {
  const messageDiv = document.createElement('div');
  
  let messageClass = 'other';
  if (isOwnMessage) {
    messageClass = 'own';
  }
  messageDiv.className = 'message ' + messageClass;
  
  let timeString;
  if (createdAt) {
    const messageDate = new Date(createdAt);
    timeString = messageDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } else {
    const currentDate = new Date();
    timeString = currentDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  
  messageDiv.innerHTML = `<div class="msg-author">${escapeHtml(author)}</div><div>${escapeHtml(text)}</div><div class="msg-time">${timeString}</div>`;
  chatBox.appendChild(messageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(str) {
  const escapeDiv = document.createElement('div');
  escapeDiv.textContent = str;
  return escapeDiv.innerHTML;
}

// ── Callbacks du chat (Réponses aux événements) ───────────────────────────────

chat.on('message', (message) => {
  const isOwnMessage = message.owner === currentUser;
  appendMessage(message.owner, message.content, message.created_at, isOwnMessage);
});

chat.on('historyLoaded', ({ messages }) => {
  chatBox.innerHTML = '';
  for (const message of messages) {
    const isOwnMessage = message.owner === currentUser;
    appendMessage(message.owner, message.content, message.created_at, isOwnMessage);
  }
});

chat.on('error', (errorMessage) => {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message other';
  messageDiv.style.opacity = '0.6';
  messageDiv.style.fontStyle = 'italic';
  messageDiv.textContent = '⚠ ' + errorMessage;
  chatBox.appendChild(messageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
});

// ── Envoi de messages ─────────────────────────────────────────────────────────

if (sendForm) {
  sendForm.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!newMessage) {
      return;
    }
    if (!newMessage.value.trim()) {
      return;
    }
    const text = newMessage.value.trim();
    // Rendu optimiste uniquement si le message est accepté
    if (chat.sendMessage(text) !== null) {
      chat.markOptimistic(chat.currentRoom, currentUser, text);
      appendMessage(currentUser, text, null, true);
    }
    newMessage.value = '';
  });
}

// ── Connexion et entrée dans le salon par défaut ──────────────────────────────

chat.connect();
chat.on('connected', () => {
  chat.joinRoom('general').catch(error => console.error('Erreur joinRoom :', error));
});

// ── Gestion de la reconnexion ─────────────────────────────────────────────────

chat.on('reconnect', (attempt) => {
  chatBox.innerHTML = `<div class="chat-loading">Reconnexion en cours… (tentative ${attempt})</div>`;
});
