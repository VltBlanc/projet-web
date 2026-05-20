const chatRoomsContainer = document.getElementById("chat-rooms");
const chatTitle = document.getElementById("chat-title");
const chatBox = document.getElementById("chat-box");

// ── WebSocket Chat ──
const sendForm = document.getElementById("send");
const newMessage = document.getElementById("new_message");

// Déterminer le nom de l'utilisateur actuel à partir du localStorage (défini lors de la connexion dans script.js)
let currentUser = localStorage.getItem("currentUser");
if (!currentUser) {
  currentUser = "Moi";
}

// Utiliser la détection dynamique de l'hôte pour que cela fonctionne dans Docker et en local
let wsProtocol = "ws:";
if (location.protocol === "https:") {
  wsProtocol = "wss:";
}

let wsHost = `${location.hostname}:8081`;
if (location.hostname === "localhost") {
  wsHost = "localhost:8081";
}

let restHost = `http://${location.hostname}:8081`;
if (location.hostname === "localhost") {
  restHost = "http://localhost:8081";
}

const chat = new ChatClient({
  wsUrl: `${wsProtocol}//${wsHost}/ws`,
  restBase: restHost,
  maxReconnects: 10,
  reconnectDelay: 1000,
  historyLimit: 50,
});
// Exposer l'instance de chat globalement pour que events.js et navigation.js puissent l'utiliser
window.chat = chat;

chat.on("message", (message) => {
  // Afficher uniquement les messages du salon actuel
  if (message.room !== chat.currentRoom) {
    return;
  }
  const isOwnMessage = message.owner === currentUser;
  appendMessage(message.owner, message.content, message.created_at, isOwnMessage);
});

chat.on("historyLoaded", ({ messages }) => {
  if (chatBox) {
    chatBox.innerHTML = "";
    for (const message of messages) {
      const isOwnMessage = message.owner === currentUser;
      appendMessage(message.owner, message.content, message.created_at, isOwnMessage);
    }
  }
});

chat.on("error", (errorMessage) => {
  console.warn("Erreur du chat :", errorMessage);
  if (chatBox) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "message other";
    errorDiv.style.opacity = "0.6";
    errorDiv.style.fontStyle = "italic";
    errorDiv.textContent = "⚠ " + errorMessage;
    chatBox.appendChild(errorDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
  }
});

// Indicateur de reconnexion
chat.on("reconnect", (attempt) => {
  if (chatTitle) {
    chatTitle.textContent = chatTitle.textContent.replace(" ⏳ Reconnexion...", "") + " ⏳ Reconnexion...";
  }
});

chat.on("connected", () => {
  if (chatTitle) {
    chatTitle.textContent = chatTitle.textContent.replace(" ⏳ Reconnexion...", "");
  }
});

// ── Rendu des messages ─────────────────────────────────────────────────────────

function appendMessage(author, text, createdAt, isOwnMessage) {
  if (!chatBox) {
    return;
  }
  const messageDiv = document.createElement("div");
  
  let messageClass = "other";
  if (isOwnMessage) {
    messageClass = "own";
  }
  messageDiv.className = "message " + messageClass;
  
  // Utiliser l'horodatage du serveur si disponible, sinon l'heure actuelle
  let timeString;
  if (createdAt) {
    const messageDate = new Date(createdAt);
    timeString = messageDate.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } else {
    const currentDate = new Date();
    timeString = currentDate.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  
  messageDiv.innerHTML = `<div class="msg-author">${escapeHtml(author)}</div><div>${escapeHtml(text)}</div><div class="msg-time">${timeString}</div>`;
  chatBox.appendChild(messageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(str) {
  const escapeDiv = document.createElement("div");
  escapeDiv.textContent = str;
  return escapeDiv.innerHTML;
}

// ── Envoi de messages ─────────────────────────────────────────────────────────

if (sendForm) {
  sendForm.addEventListener("submit", function (event) {
    event.preventDefault();
    event.stopPropagation();
    if (!newMessage) {
      return;
    }
    if (!newMessage.value.trim()) {
      return;
    }
    const text = newMessage.value.trim();
    // Effectuer le rendu optimiste uniquement si le message a été accepté
    if (chat.sendMessage(text) !== null) {
      chat.markOptimistic(chat.currentRoom, currentUser, text);
      appendMessage(currentUser, text, null, true);
    }
    newMessage.value = "";
  });
}

// ── Changement de salon ────────────────────────────────────────────────────────

let currentRoomSlug = "general";

/** Affiche les salons à partir des données de l'API, en mettant en valeur le salon actif */
async function loadRooms() {
  const rooms = await chat.fetchRooms();
  if (!rooms || rooms.length === 0) {
    if (chatRoomsContainer) {
      chatRoomsContainer.innerHTML = '<div class="chat-loading">Aucune conversation disponible.</div>';
    }
    return;
  }

  // S'assurer de rejoindre TOUS les salons au niveau WS pour recevoir les notifications en direct
  rooms.forEach(room => chat.joinChannel(room.slug));

  // Si le salon actuel n'est plus dans la liste, se rabattre sur le premier
  let exists = false;
  for (const room of rooms) {
    if (room.slug === currentRoomSlug) {
      exists = true;
    }
  }

  if (!exists) {
    if (rooms.length > 0) {
      currentRoomSlug = rooms[0].slug;
      if (chatTitle) {
        chatTitle.textContent = rooms[0].name;
      }
      chat.joinRoom(currentRoomSlug).catch((error) => console.error("Erreur joinRoom :", error));
    }
  }

  if (!chatRoomsContainer) {
    return;
  }
  chatRoomsContainer.innerHTML = "";
  
  rooms.forEach((room) => {
    const roomItemDiv = document.createElement("div");
    
    let itemClass = "room-item";
    if (room.slug === currentRoomSlug) {
      itemClass = "room-item active";
    }
    roomItemDiv.className = itemClass;
    roomItemDiv.dataset.room = room.slug;
    
    const initial = room.name.charAt(0).toUpperCase();
    
    let preview = "Aucun message";
    if (room.last_message_preview) {
      if (room.last_message_preview.length > 40) {
        preview = room.last_message_preview.slice(0, 40) + "…";
      } else {
        preview = room.last_message_preview;
      }
    }

    roomItemDiv.innerHTML = `
      <div class="room-avatar">${escapeHtml(initial)}</div>
      <div class="room-info">
        <span class="room-name">${escapeHtml(room.name)}</span>
        <span class="room-preview">${escapeHtml(preview)}</span>
      </div>`;

    roomItemDiv.addEventListener("click", () => {
      if (room.slug === currentRoomSlug) {
        return;
      }
      document.querySelectorAll(".room-item").forEach((element) => {
        element.classList.remove("active");
      });
      roomItemDiv.classList.add("active");
      if (chatTitle) {
        chatTitle.textContent = room.name;
      }
      currentRoomSlug = room.slug;
      if (chatBox) {
        chatBox.innerHTML = '<div class="chat-loading">Chargement des messages…</div>';
      }
      chat.joinRoom(room.slug).catch((error) => {
        console.error("Erreur joinRoom :", error);
        if (chatBox) {
          chatBox.innerHTML = "";
        }
      });
    });

    chatRoomsContainer.appendChild(roomItemDiv);
  });
}

// Charger les salons au démarrage
loadRooms();
window.loadRooms = loadRooms;

// Actualiser la liste des salons à la réception d'un message (pour mettre à jour l'aperçu et l'ordre)
chat.on("message", () => {
  // Limiteur (debounce) : recharger les salons au maximum toutes les 2 secondes
  if (!chat._roomsReloadTimer) {
    chat._roomsReloadTimer = setTimeout(() => {
      chat._roomsReloadTimer = null;
      loadRooms();
    }, 2000);
  }
});

// Recharger toutes les données lorsque le serveur signale une mise à jour générale
chat.on("data_updated", () => {
  if (window.refreshAll) {
    window.refreshAll();
  } else {
    loadRooms();
  }
});

chat.on("update_users", (usernames) => {
  const usersList = document.getElementById("users-online");
  if (!usersList) {
    return;
  }
  usersList.innerHTML = "";
  for (const username of usernames) {
    const listItem = document.createElement("li");
    listItem.textContent = username;
    usersList.appendChild(listItem);
  }
});

// ── Connexion au chat ─────────────────────────────────────────────────────────

chat.connect();
// Rejoindre automatiquement le salon par défaut après la connexion
chat.on("connected", () => {
  chat.joinRoom(currentRoomSlug).catch((error) => console.error("Erreur de connexion initiale :", error));
});

// ── Défilement vers le bas lors de l'accès à l'onglet de chat ─────────────────

const chatNavItem = document.querySelector('.nav-item[data-section="chat"]');
if (chatNavItem) {
  chatNavItem.addEventListener("click", () => {
    setTimeout(() => {
      if (chatBox) {
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    }, 100);
  });
}
