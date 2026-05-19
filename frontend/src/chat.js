// ── ChatClient for standalone chat page ───────────────────────────────────────

const currentUser = localStorage.getItem('currentUser') || 'Moi';

const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = location.hostname === 'localhost' ? 'localhost:8081' : `${location.hostname}:8081`;
const restHost = location.hostname === 'localhost' ? 'http://localhost:8081' : `http://${location.hostname}:8081`;

const chat = new ChatClient({
  wsUrl: `${wsProtocol}//${wsHost}/ws`,
  restBase: restHost,
  maxReconnects: 10,
  reconnectDelay: 1000,
  historyLimit: 50,
});

// DOM
const sendForm = document.getElementById('send');
const newMessage = document.getElementById('new_message');
const chatBox = document.getElementById('chat_box');

// ── Message rendering ─────────────────────────────────────────────────────────

function appendMessage(author, text, createdAt, isOwn) {
  const div = document.createElement('div');
  div.className = 'message ' + (isOwn ? 'own' : 'other');
  let timeStr;
  if (createdAt) {
    const d = new Date(createdAt);
    timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } else {
    timeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  div.innerHTML = `<div class="msg-author">${escapeHtml(author)}</div><div>${escapeHtml(text)}</div><div class="msg-time">${timeStr}</div>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Chat callbacks ────────────────────────────────────────────────────────────

chat.on('message', (msg) => {
  const isOwn = msg.owner === currentUser;
  appendMessage(msg.owner, msg.content, msg.created_at, isOwn);
});

chat.on('historyLoaded', ({ messages }) => {
  chatBox.innerHTML = '';
  for (const msg of messages) {
    const isOwn = msg.owner === currentUser;
    appendMessage(msg.owner, msg.content, msg.created_at, isOwn);
  }
});

chat.on('error', (errMsg) => {
  const div = document.createElement('div');
  div.className = 'message other';
  div.style.opacity = '0.6';
  div.style.fontStyle = 'italic';
  div.textContent = '⚠ ' + errMsg;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
});

// ── Send ──────────────────────────────────────────────────────────────────────

sendForm.addEventListener('submit', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!newMessage.value.trim()) return;
  const text = newMessage.value.trim();
  // Only optimistically render if the message was actually accepted
  if (chat.sendMessage(text) !== null) {
    chat.markOptimistic(chat.currentRoom, currentUser, text);
    appendMessage(currentUser, text, null, true);
  }
  newMessage.value = '';
});

// ── Connect & join default room ───────────────────────────────────────────────

chat.connect();
chat.on('connected', () => {
  chat.joinRoom('general').catch(err => console.error('joinRoom error:', err));
});

// ── Reconnection handling ─────────────────────────────────────────────────────

chat.on('reconnect', (attempt) => {
  chatBox.innerHTML = `<div class="chat-loading">Reconnexion en cours… (tentative ${attempt})</div>`;
});
