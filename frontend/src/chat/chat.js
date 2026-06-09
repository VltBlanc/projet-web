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

function appendMessage(author, text, createdAt, isOwnMessage, messageId) {
  const messageDiv = document.createElement('div');
  
  let messageClass = 'other';
  if (isOwnMessage) {
    messageClass = 'own';
  }
  messageDiv.className = 'message ' + messageClass;
  
  // Stocker l'ID du message pour la suppression
  if (messageId) {
    messageDiv.dataset.messageId = messageId;
  }
  
  let timeString;
  if (createdAt) {
    const messageDate = new Date(createdAt);
    timeString = messageDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } else {
    const currentDate = new Date();
    timeString = currentDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  
  // Bouton de suppression pour l'admin
  const isAdmin = localStorage.getItem('userRole') === 'admin';
  let deleteBtnHtml = '';
  if (isAdmin && messageId) {
    deleteBtnHtml = `<button class="msg-delete-btn" data-message-id="${messageId}" title="Supprimer"><i class="fa fa-trash-o"></i></button>`;
  }
  
  messageDiv.innerHTML = `${deleteBtnHtml}<div class="msg-author">${escapeHtml(author)}</div><div>${escapeHtml(text)}</div><div class="msg-time">${timeString}</div>`;
  chatBox.appendChild(messageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Gestionnaire de clic pour la suppression de messages (délégation d'événement)
if (chatBox) {
  chatBox.addEventListener('click', async function (e) {
    const deleteBtn = e.target.closest('.msg-delete-btn');
    if (!deleteBtn) return;
    
    const messageId = deleteBtn.dataset.messageId;
    if (!messageId) return;
    
    if (!confirm('Supprimer ce message ?')) return;
    
    try {
      const response = await fetch(`${restHost}/messages/${messageId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('Erreur suppression message:', errData.error || response.status);
        alert('Erreur lors de la suppression du message.');
        return;
      }
      // Supprimer visuellement immédiatement (le WebSocket confirmera)
      const msgEl = deleteBtn.closest('.message');
      if (msgEl) {
        msgEl.style.opacity = '0.4';
        msgEl.style.transition = 'opacity 0.3s';
        setTimeout(() => msgEl.remove(), 300);
      }
    } catch (err) {
      console.error('Erreur réseau suppression message:', err);
      alert('Erreur réseau.');
    }
  });
}

// Écouter les événements de message supprimé via WebSocket
chat.on('message_deleted', (messageId) => {
  const msgEl = chatBox ? chatBox.querySelector(`[data-message-id="${messageId}"]`) : null;
  if (msgEl) {
    msgEl.style.opacity = '0.2';
    msgEl.style.transition = 'opacity 0.3s';
    setTimeout(() => msgEl.remove(), 300);
  }
});

function escapeHtml(str) {
  const escapeDiv = document.createElement('div');
  escapeDiv.textContent = str;
  return escapeDiv.innerHTML;
}

// ── Callbacks du chat (Réponses aux événements) ───────────────────────────────

chat.on('message', (message) => {
  const isOwnMessage = message.owner === currentUser;
  appendMessage(message.owner, message.content, message.created_at, isOwnMessage, message.id);
});

chat.on('historyLoaded', ({ messages }) => {
  chatBox.innerHTML = '';
  for (const message of messages) {
    const isOwnMessage = message.owner === currentUser;
    appendMessage(message.owner, message.content, message.created_at, isOwnMessage, message.id);
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
