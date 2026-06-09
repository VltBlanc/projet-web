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
  appendMessage(message.owner, message.content, message.created_at, isOwnMessage, message.id);
});

chat.on("historyLoaded", ({ messages }) => {
  if (chatBox) {
    chatBox.innerHTML = "";
    for (const message of messages) {
      const isOwnMessage = message.owner === currentUser;
      appendMessage(message.owner, message.content, message.created_at, isOwnMessage, message.id);
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

function appendMessage(author, text, createdAt, isOwnMessage, messageId) {
  if (!chatBox) {
    return;
  }
  const messageDiv = document.createElement("div");
  
  let messageClass = "other";
  if (isOwnMessage) {
    messageClass = "own";
  }
  messageDiv.className = "message " + messageClass;
  
  // Stocker l'ID du message pour la suppression
  if (messageId) {
    messageDiv.dataset.messageId = messageId;
  }
  
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
  
  // Bouton de suppression pour l'admin
  const isAdmin = localStorage.getItem("userRole") === "admin";
  let deleteBtnHtml = "";
  if (isAdmin && messageId) {
    deleteBtnHtml = `<button class="msg-delete-btn" data-message-id="${messageId}" title="Supprimer"><i class="fa fa-trash-o"></i></button>`;
  }
  
  messageDiv.innerHTML = `${deleteBtnHtml}<div class="msg-author" style="cursor: pointer;">${escapeHtml(author)}</div><div>${escapeHtml(text)}</div><div class="msg-time">${timeString}</div>`;
  chatBox.appendChild(messageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Gestionnaire de clic pour le chat (délégation d'événement)
if (chatBox) {
  chatBox.addEventListener("click", async function (e) {
    const authorEl = e.target.closest(".msg-author");
    if (authorEl) {
      const username = authorEl.textContent.trim();
      if (window.showPublicProfile) {
        window.showPublicProfile(username);
      }
      return;
    }

    const deleteBtn = e.target.closest(".msg-delete-btn");
    if (!deleteBtn) return;
    
    const messageId = deleteBtn.dataset.messageId;
    if (!messageId) return;
    
    if (!confirm("Supprimer ce message ?")) return;
    
    try {
      const response = await fetch(`${restHost}/messages/${messageId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error("Erreur suppression message:", errData.error || response.status);
        alert("Erreur lors de la suppression du message.");
        return;
      }
      // Supprimer visuellement immédiatement (le WebSocket confirmera)
      const msgEl = deleteBtn.closest(".message");
      if (msgEl) {
        msgEl.style.opacity = "0.4";
        msgEl.style.transition = "opacity 0.3s";
        setTimeout(() => msgEl.remove(), 300);
      }
    } catch (err) {
      console.error("Erreur réseau suppression message:", err);
      alert("Erreur réseau.");
    }
  });
}

// Écouter les événements de message supprimé via WebSocket
chat.on("message_deleted", (messageId) => {
  const msgEl = chatBox ? chatBox.querySelector(`[data-message-id="${messageId}"]`) : null;
  if (msgEl) {
    msgEl.style.opacity = "0.2";
    msgEl.style.transition = "opacity 0.3s";
    setTimeout(() => msgEl.remove(), 300);
  }
});

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
    
    // Détecter le sport correspondant pour afficher le bon logo
    const roomThemeData = getThemeForRoom(room.name);
    const matchedCategory = roomThemeData.category;
    
    let avatarContent = '';
    if (matchedCategory && matchedCategory.iconClass) {
      avatarContent = `<i class="${matchedCategory.iconClass}"></i>`;
    } else {
      avatarContent = `<i class="fa fa-comments-o"></i>`;
    }
    
    let preview = "Aucun message";
    if (room.last_message_preview) {
      if (room.last_message_preview.length > 40) {
        preview = room.last_message_preview.slice(0, 40) + "…";
      } else {
        preview = room.last_message_preview;
      }
    }

    roomItemDiv.innerHTML = `
      <div class="room-avatar">${avatarContent}</div>
      <div class="room-info">
        <span class="room-name">${escapeHtml(room.name)}</span>
        <span class="room-preview">${escapeHtml(preview)}</span>
      </div>`;

    roomItemDiv.addEventListener("click", (e) => {
      if (room.slug === currentRoomSlug) {
        return;
      }

      // Détecter le sport correspondant au salon de discussion
      const roomThemeData = getThemeForRoom(room.name);
      const targetTheme = roomThemeData.theme;
      const matchedCategory = roomThemeData.category;

      // Déclencher la transition thématique si disponible
      if (window.triggerThemeTransition) {
        const clickX = e.clientX || window.innerWidth / 2;
        const clickY = e.clientY || window.innerHeight / 2;

        if (window.spawnEmojiBurst && matchedCategory) {
          window.spawnEmojiBurst(clickX, clickY, matchedCategory.icon);
        }

        window.triggerThemeTransition(clickX, clickY, targetTheme, () => {
          if (window.sportsCategories) {
            window.sportsCategories.forEach(c => {
              if (c.theme) {
                document.body.classList.remove(c.theme);
              }
            });
          }
          if (targetTheme) {
            document.body.classList.add(targetTheme);
          }
          // Mettre à jour le défilement d'icônes de sport en arrière-plan
          if (window.updateAmbientBackdrop) {
            window.updateAmbientBackdrop(matchedCategory ? matchedCategory.id : 'all');
          }
        });
      } else {
        // Fallback sans animation
        if (window.sportsCategories) {
          window.sportsCategories.forEach(c => {
            if (c.theme) {
              document.body.classList.remove(c.theme);
            }
          });
        }
        if (targetTheme) {
          document.body.classList.add(targetTheme);
        }
        // Mettre à jour le défilement d'icônes de sport en arrière-plan
        if (window.updateAmbientBackdrop) {
          window.updateAmbientBackdrop(matchedCategory ? matchedCategory.id : 'all');
        }
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
    listItem.style.cursor = "pointer";
    listItem.addEventListener("click", () => {
      if (window.showPublicProfile) {
        window.showPublicProfile(username);
      }
    });
    usersList.appendChild(listItem);
  }
});

// ── Connexion au chat ─────────────────────────────────────────────────────────

chat.connect();
// Rejoindre automatiquement le salon par défaut après la connexion
chat.on("connected", () => {
  chat.joinRoom(currentRoomSlug).catch((error) => console.error("Erreur de connexion initiale :", error));
});

// Détecter le thème d'un salon (catégorie ou événement associé)
function getThemeForRoom(roomName) {
  if (!roomName) return { theme: "", category: null };
  const roomNameLower = roomName.toLowerCase();
  let matchedSportName = null;
  
  // 1. Essayer de faire correspondre avec le nom de l'événement dans la liste globale
  if (window.allEvents) {
    const matchedEvent = window.allEvents.find(e => 
      e.title.toLowerCase() === roomNameLower || 
      roomNameLower.includes(e.title.toLowerCase()) || 
      e.title.toLowerCase().includes(roomNameLower)
    );
    if (matchedEvent) {
      matchedSportName = matchedEvent.sport.toLowerCase();
    }
  }
  
  // 2. Chercher dans sportsCategories la catégorie correspondante
  if (window.sportsCategories) {
    if (matchedSportName) {
      const category = window.sportsCategories.find(c => 
        c.id !== 'all' && (c.name.toLowerCase() === matchedSportName || c.id === matchedSportName)
      );
      if (category) {
        return { theme: category.theme, category: category };
      }
    }
    
    // Sinon, on cherche si le nom du salon contient le nom/ID d'un sport
    const category = window.sportsCategories.find(c => 
      c.id !== 'all' && (roomNameLower.includes(c.name.toLowerCase()) || roomNameLower.includes(c.id))
    );
    if (category) {
      return { theme: category.theme, category: category };
    }
  }
  
  return { theme: "", category: null };
}

// Fonction pour appliquer le thème d'un salon directement sans transition (ex: au chargement/changement d'onglet)
function applyRoomThemeDirect(roomName) {
  if (!roomName) return;
  const roomThemeData = getThemeForRoom(roomName);
  const targetTheme = roomThemeData.theme;
  const matchedCategory = roomThemeData.category;
  
  if (window.sportsCategories) {
    window.sportsCategories.forEach(c => {
      if (c.theme) {
        document.body.classList.remove(c.theme);
      }
    });
  }
  
  if (targetTheme) {
    document.body.classList.add(targetTheme);
  }

  // Mettre à jour le défilement d'icônes de sport en arrière-plan
  if (window.updateAmbientBackdrop) {
    window.updateAmbientBackdrop(matchedCategory ? matchedCategory.id : 'all');
  }
}
window.applyRoomThemeDirect = applyRoomThemeDirect;

// ── Défilement vers le bas lors de l'accès à l'onglet de chat ─────────────────

const chatNavItem = document.querySelector('.nav-item[data-section="chat"]');
if (chatNavItem) {
  chatNavItem.addEventListener("click", () => {
    // Appliquer le thème du salon actif lors du clic sur l'onglet chat
    const activeRoom = document.querySelector(".room-item.active");
    if (activeRoom) {
      const roomName = activeRoom.querySelector(".room-name").textContent;
      applyRoomThemeDirect(roomName);
    } else {
      const activeRoomTitle = document.getElementById("chat-title");
      if (activeRoomTitle) {
        applyRoomThemeDirect(activeRoomTitle.textContent);
      }
    }

    setTimeout(() => {
      if (chatBox) {
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    }, 100);
  });
}
