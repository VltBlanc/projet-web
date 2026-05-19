// ── Navigation ──
const navItems = document.querySelectorAll(".nav-item");
const sections = document.querySelectorAll(".content-section");
const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menu-toggle");

function showSection(id) {
  sections.forEach((s) => s.classList.remove("active"));
  navItems.forEach((n) => n.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document
    .querySelector(`.nav-item[data-section="${id}"]`)
    .classList.add("active");
  if (window.innerWidth <= 768) sidebar.classList.remove("open");
}

navItems.forEach((btn) => {
  btn.addEventListener("click", () => showSection(btn.dataset.section));
});

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

// ── Feed demo data ──
const feedData = [
  {
    title: "Match de foot 5v5",
    sport: "Football",
    location: "Stade Municipal, Lyon",
    time: "Aujourd'hui 18h",
    participants: 4,
    capacity: 10,
  },
  {
    title: "Sortie running 10km",
    sport: "Running",
    location: "Parc de la Tête d'Or",
    time: "Demain 7h",
    participants: 8,
    capacity: 12,
  },
  {
    title: "Session musculation",
    sport: "Musculation",
    location: "Basic-Fit Villeurbanne",
    time: "Mercredi 19h",
    participants: 2,
    capacity: 6,
  },
  {
    title: "Tennis en double",
    sport: "Tennis",
    location: "Club de Tennis, Caluire",
    time: "Jeudi 17h30",
    participants: 3,
    capacity: 4,
  },
];
const feedGrid = document.getElementById("feed-grid");
if (feedGrid) {
  feedData.forEach((item) => {
    const card = document.createElement("div");
    card.className = "feed-card";
    card.innerHTML = `
      <div class="feed-image"><span class="feed-badge">${item.sport}</span></div>
      <div class="feed-body">
        <div class="feed-title">${item.title}</div>
        <div class="feed-meta">📍 ${item.location} &nbsp;•&nbsp; 🕐 ${item.time}</div>
        <div class="feed-footer">
          <div class="feed-avatars">
            ${Array.from({ length: Math.min(item.participants, 4) }, (_, i) => `<div class="avatar">U${i + 1}</div>`).join("")}
          </div>
          <button class="join-btn">Rejoindre</button>
        </div>
      </div>`;
    feedGrid.appendChild(card);
  });
}

// ── Events demo data ──
const eventsData = [
  {
    sport: "Football",
    title: "Tournoi inter-quartiers",
    location: "Stade de Gerland, Lyon",
    date: "15 juin",
    spots: 3,
    capacity: 12,
  },
  {
    sport: "Basket",
    title: "Pick-up game du weekend",
    location: "Gymnase Tony Parker",
    date: "16 juin",
    spots: 5,
    capacity: 10,
  },
  {
    sport: "Running",
    title: "Trail des monts du Lyonnais",
    location: "Saint-Priest",
    date: "22 juin",
    spots: 45,
    capacity: 100,
  },
  {
    sport: "Yoga",
    title: "Yoga en plein air",
    location: "Parc de la Tête d'Or",
    date: "17 juin",
    spots: 2,
    capacity: 15,
  },
  {
    sport: "Escalade",
    title: "Initiation bloc",
    location: "Salle d'escalade L'Orange Bleue",
    date: "18 juin",
    spots: 6,
    capacity: 8,
  },
  {
    sport: "Cyclisme",
    title: "Sortie vélo route 80km",
    location: "Place Bellecour",
    date: "20 juin",
    spots: 8,
    capacity: 20,
  },
];
const eventsGrid = document.getElementById("events-grid");
function renderEvents(filter = "") {
  if (!eventsGrid) return;
  eventsGrid.innerHTML = "";
  eventsData
    .filter(
      (e) =>
        e.title.toLowerCase().includes(filter.toLowerCase()) ||
        e.sport.toLowerCase().includes(filter.toLowerCase()) ||
        e.location.toLowerCase().includes(filter.toLowerCase()),
    )
    .forEach((ev) => {
      const pct = (ev.spots / ev.capacity) * 100;
      const div = document.createElement("div");
      div.className = "event-card";
      div.innerHTML = `<div class="event-header"><span class="event-sport">${ev.sport}</span><span class="event-date">${ev.date}</span></div>
      <div class="event-title">${ev.title}</div>
      <div class="event-location">📍 ${ev.location}</div>
      <div class="event-bar"><div style="width:${pct}%"></div></div>
      <div class="event-footer"><span class="event-spots">${ev.spots}/${ev.capacity} inscrits</span><button class="event-btn ${ev.spots >= ev.capacity ? "full" : ""}">${ev.spots >= ev.capacity ? "Complet" : "Rejoindre"}</button></div>`;
      eventsGrid.appendChild(div);
    });
}
renderEvents();
const eventSearch = document.getElementById("event-search");
if (eventSearch) {
  eventSearch.addEventListener("input", (e) => renderEvents(e.target.value));
}
// btn-create-event is handled by events.js

const chatRoomsContainer = document.getElementById("chat-rooms");
const chatTitle = document.getElementById("chat-title");
const chatBox = document.getElementById("chat-box");

// ── WebSocket Chat ──
const sendForm = document.getElementById("send");
const newMessage = document.getElementById("new_message");

// Determine current user name from localStorage (set at login in script.js)
const currentUser = localStorage.getItem("currentUser") || "Moi";

// Use dynamic host detection so it works in Docker and locally
const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const wsHost =
  location.hostname === "localhost"
    ? "localhost:8081"
    : `${location.hostname}:8081`;
const restHost =
  location.hostname === "localhost"
    ? "http://localhost:8081"
    : `http://${location.hostname}:8081`;

const chat = new ChatClient({
  wsUrl: `${wsProtocol}//${wsHost}/ws`,
  restBase: restHost,
  maxReconnects: 10,
  reconnectDelay: 1000,
  historyLimit: 50,
});
// Expose chat instance globally so events.js can use it
window.chat = chat;

chat.on("message", (msg) => {
  // Only show messages for the current room
  if (msg.room !== chat.currentRoom) return;
  const isOwn = msg.owner === currentUser;
  appendMessage(msg.owner, msg.content, msg.created_at, isOwn);
});

chat.on("historyLoaded", ({ messages }) => {
  chatBox.innerHTML = "";
  for (const msg of messages) {
    const isOwn = msg.owner === currentUser;
    appendMessage(msg.owner, msg.content, msg.created_at, isOwn);
  }
});

chat.on("error", (errMsg) => {
  console.warn("Chat error:", errMsg);
  const div = document.createElement("div");
  div.className = "message other";
  div.style.opacity = "0.6";
  div.style.fontStyle = "italic";
  div.textContent = "⚠ " + errMsg;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
});

// Reconnection indicator
chat.on("reconnect", (attempt) => {
  chatTitle.textContent =
    chatTitle.textContent.replace(" ⏳ Reconnexion...", "") +
    " ⏳ Reconnexion...";
});

chat.on("connected", () => {
  chatTitle.textContent = chatTitle.textContent.replace(
    " ⏳ Reconnexion...",
    "",
  );
});

// ── Message rendering ─────────────────────────────────────────────────────────

function appendMessage(author, text, createdAt, isOwn) {
  const div = document.createElement("div");
  div.className = "message " + (isOwn ? "own" : "other");
  // Use server timestamp if available, else current time
  let timeStr;
  if (createdAt) {
    const d = new Date(createdAt);
    timeStr = d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } else {
    timeStr = new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  div.innerHTML = `<div class="msg-author">${escapeHtml(author)}</div><div>${escapeHtml(text)}</div><div class="msg-time">${timeStr}</div>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Send message ──────────────────────────────────────────────────────────────

if (sendForm) {
  sendForm.addEventListener("submit", function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (!newMessage.value.trim()) return;
    const text = newMessage.value.trim();
    // Only optimistically render if the message was actually accepted
    if (chat.sendMessage(text) !== null) {
      chat.markOptimistic(chat.currentRoom, currentUser, text);
      appendMessage(currentUser, text, null, true);
    }
    newMessage.value = "";
  });
}

// ── Room switching ─────────────────────────────────────────────────────────────

let currentRoomSlug = "general";

/** Render room items from API data, keeping the active room highlighted */
async function loadRooms() {
  const rooms = await chat.fetchRooms();
  if (!rooms || rooms.length === 0) return;

  // Ensure we are joined to ALL rooms on the WS layer so we receive live updates
  rooms.forEach(r => chat.joinChannel(r.slug));

  // If current room isn't in the list anymore, reset to first
  const exists = rooms.some((r) => r.slug === currentRoomSlug);
  if (!exists && rooms.length > 0) {
    currentRoomSlug = rooms[0].slug;
    chatTitle.textContent = rooms[0].name;
    chat
      .joinRoom(currentRoomSlug)
      .catch((err) => console.error("joinRoom error:", err));
  }

  if (!chatRoomsContainer) return;
  chatRoomsContainer.innerHTML = "";
  rooms.forEach((room) => {
    const div = document.createElement("div");
    div.className =
      "room-item" + (room.slug === currentRoomSlug ? " active" : "");
    div.dataset.room = room.slug;
    const initial = room.name.charAt(0).toUpperCase();
    const preview = room.last_message_preview
      ? room.last_message_preview.length > 40
        ? room.last_message_preview.slice(0, 40) + "…"
        : room.last_message_preview
      : "Aucun message";
    div.innerHTML = `
      <div class="room-avatar">${escapeHtml(initial)}</div>
      <div class="room-info">
        <span class="room-name">${escapeHtml(room.name)}</span>
        <span class="room-preview">${escapeHtml(preview)}</span>
      </div>`;

    div.addEventListener("click", () => {
      if (room.slug === currentRoomSlug) return;
      document
        .querySelectorAll(".room-item")
        .forEach((x) => x.classList.remove("active"));
      div.classList.add("active");
      chatTitle.textContent = room.name;
      currentRoomSlug = room.slug;
      chatBox.innerHTML =
        '<div class="chat-loading">Chargement des messages…</div>';
      chat.joinRoom(room.slug).catch((err) => {
        console.error("joinRoom error:", err);
        chatBox.innerHTML = "";
      });
    });

    chatRoomsContainer.appendChild(div);
  });
}

// Load rooms on startup
loadRooms();
window.loadRooms = loadRooms;

// Refresh room list when a message arrives (to update preview & order)
chat.on("message", () => {
  // Debounce: reload rooms only every 2 seconds max
  if (!chat._roomsReloadTimer) {
    chat._roomsReloadTimer = setTimeout(() => {
      chat._roomsReloadTimer = null;
      loadRooms();
    }, 2000);
  }
});

// Refresh all data when the server says there was an update
chat.on("data_updated", () => {
  if (window.refreshAll) {
    window.refreshAll();
  } else {
    loadRooms();
  }
});

// ── Chat connection ───────────────────────────────────────────────────────────

chat.connect();
// Auto-join default room on connect
chat.on("connected", () => {
  chat
    .joinRoom(currentRoomSlug)
    .catch((err) => console.error("Initial join error:", err));
});

// ── Chat scroll-to-bottom on section switch ───────────────────────────────────

const chatNavItem = document.querySelector('.nav-item[data-section="chat"]');
if (chatNavItem) {
  chatNavItem.addEventListener("click", () => {
    setTimeout(() => {
      chatBox.scrollTop = chatBox.scrollHeight;
    }, 100);
  });
}

// ── Logout ──
const logoutBtn = document.getElementById("logout");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch(`${restHost}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    chat.disconnect();
    window.location.href = "login.html";
  });
}
