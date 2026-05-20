// =============================================================================
// ChatClient — module de chat réutilisable
// Fonctionne à la fois sur main.html (tableau de bord multi-salons) et chat.html (autonome)
// =============================================================================

class ChatClient {
  /**
   * @param {object} options
   * @param {string}  options.wsUrl       — Point de terminaison WebSocket (ex: "ws://localhost:8081/ws")
   * @param {string}  options.restBase    — Base de l'API REST (ex: "http://localhost:8081")
   * @param {number}  [options.maxReconnects=10] — Nombre maximum de tentatives de reconnexion
   * @param {number}  [options.reconnectDelay=1000] — Délai initial en ms (retrait exponentiel)
   * @param {number}  [options.historyLimit=50] — Limite de messages à récupérer par page
   */
  constructor(options) {
    this.wsUrl = options.wsUrl;
    this.restBase = options.restBase;
    
    let maxReconnects = options.maxReconnects;
    if (maxReconnects === undefined || maxReconnects === null) {
      maxReconnects = 10;
    }
    this.maxReconnects = maxReconnects;

    let reconnectDelay = options.reconnectDelay;
    if (reconnectDelay === undefined || reconnectDelay === null) {
      reconnectDelay = 1000;
    }
    this.reconnectDelay = reconnectDelay;

    let historyLimit = options.historyLimit;
    if (historyLimit === undefined || historyLimit === null) {
      historyLimit = 50;
    }
    this.historyLimit = historyLimit;

    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.currentRoom = null;
    this._pendingMessages = [];          // Messages en attente envoyés avant l'ouverture du WebSocket
    this._optimisticCounters = new Map(); // Déduplication : hash → compteur pour les rendus optimistes

    // Registre des fonctions de rappel (callbacks)
    this._callbacks = {
      connected: [],      // () => void
      disconnected: [],   // () => void
      message: [],        // ({ id, room, owner, content, created_at }) => void
      historyLoaded: [],  // (messages[]) => void
      joined: [],         // (roomSlug) => void
      left: [],           // (roomSlug) => void
      error: [],          // (message) => void
      reconnect: [],      // (attempt) => void
      data_updated: [],   // () => void
      update_users: [],   // (usernames) => void
    };
  }

  // ── Enregistrement des callbacks ─────────────────────────────────────────

  /** Enregistre un callback. Retourne une fonction pour se désabonner. */
  on(event, fn) {
    if (this._callbacks[event]) {
      this._callbacks[event].push(fn);
    }
    return () => {
      this._callbacks[event] = this._callbacks[event].filter(callbackFunction => callbackFunction !== fn);
    };
  }

  _emit(event, ...args) {
    let callbacksList = this._callbacks[event];
    if (!callbacksList) {
      callbacksList = [];
    }
    for (const callbackFunction of callbacksList) {
      try { 
        callbackFunction(...args); 
      } catch (error) { 
        console.error(`Erreur de callback ChatClient [${event}]:`, error); 
      }
    }
  }

  // ── Connexion ────────────────────────────────────────────────────────────

  connect() {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        return;
      }
    }

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch (error) {
      console.error('ChatClient : Échec de la création du WebSocket', error);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('ChatClient : connecté');
      this.reconnectAttempts = 0;

      // Envoyer les messages en attente qui ont été mis en cache avant l'ouverture de la connexion
      if (this._pendingMessages.length > 0) {
        console.log(`ChatClient : envoi de ${this._pendingMessages.length} messages en attente`);
        for (const messageObject of this._pendingMessages) {
          if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify(messageObject));
            }
          }
        }
        this._pendingMessages = [];
      }

      this._emit('connected');

      // Rejoindre à nouveau le salon actuel s'il y en a un
      if (this.currentRoom) {
        this._send({ type: 'join_room', room: this.currentRoom });
      }
    };

    this.ws.onmessage = (event) => {
      let responseData;
      try { 
        responseData = JSON.parse(event.data); 
      } catch (error) { 
        return; 
      }
      this._handleMessage(responseData);
    };

    this.ws.onerror = (error) => {
      console.error('ChatClient : Erreur WebSocket', error);
      // onclose se déclenchera après cela
    };

    this.ws.onclose = () => {
      this.ws = null;
      this._emit('disconnected');
      this._scheduleReconnect();
    };
  }

  disconnect() {
    this._clearReconnect();
    this._pendingMessages = [];  // Vider le tampon pour éviter d'envoyer des messages périmés plus tard
    if (this.ws) {
      this.ws.onclose = null; // Empêcher la reconnexion automatique
      this.ws.close();
      this.ws = null;
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }
    if (this.reconnectAttempts >= this.maxReconnects) {
      console.error('ChatClient : Nombre maximal de tentatives de reconnexion atteint');
      this._pendingMessages = [];  // Vider le tampon
      this._emit('error', 'Impossible de se reconnecter au serveur.');
      return;
    }
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this._emit('reconnect', this.reconnectAttempts);
    console.log(`ChatClient : Reconnexion dans ${delay}ms (tentative ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  _clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── Aides WebSocket ────────────────────────────────────────────────────────

  _send(messageObject) {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(messageObject));
        return;
      }
    }
    
    // Mettre le message en attente — il sera envoyé dans onopen
    if (this._pendingMessages.length >= 50) {
      this._pendingMessages.shift(); // Supprimer le plus ancien
    }
    this._pendingMessages.push(messageObject);
    console.warn('ChatClient : Message mis en attente (WebSocket non ouvert)');
  }

  _handleMessage(responseData) {
    if (responseData.type === 'message') {
      // Déduplication : ignorer si nous avons déjà affiché ce message de manière optimiste
      const hash = responseData.room + '::' + responseData.owner + '::' + responseData.content;
      
      let count = this._optimisticCounters.get(hash);
      if (count === undefined || count === null) {
        count = 0;
      }
      
      if (count > 0) {
        if (count === 1) {
          this._optimisticCounters.delete(hash);
        } else {
          this._optimisticCounters.set(hash, count - 1);
        }
        return; // Ne pas émettre — déjà affiché de manière optimiste
      }
      
      this._emit('message', {
        id: responseData.id,
        room: responseData.room,
        owner: responseData.owner,
        content: responseData.content,
        created_at: responseData.created_at,
      });
    } else if (responseData.type === 'joined') {
      this._emit('joined', responseData.room);
    } else if (responseData.type === 'left') {
      this._emit('left', responseData.room);
    } else if (responseData.type === 'error') {
      console.error('Erreur du serveur ChatClient :', responseData.message);
      this._emit('error', responseData.message);
    } else if (responseData.type === 'data_updated') {
      this._emit('data_updated');
    } else if (responseData.type === 'update_users') {
      this._emit('update_users', responseData.usernames);
    }
  }

  // ── Gestion des salons ─────────────────────────────────────────────────────

  async joinRoom(roomSlug) {
    this.currentRoom = roomSlug;

    // Charger l'historique
    await this.loadHistory(roomSlug);
  }

  joinChannel(roomSlug) {
    this._send({ type: 'join_room', room: roomSlug });
  }

  /**
   * Charger l'historique des messages depuis l'API REST.
   * @param {string}  roomSlug
   * @param {number}  [beforeId] — curseur pour la pagination
   */
  async loadHistory(roomSlug, beforeId = null) {
    let url = `${this.restBase}/rooms/${encodeURIComponent(roomSlug)}/messages?limit=${this.historyLimit}`;
    if (beforeId) {
      url += `&before=${beforeId}`;
    }

    try {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        console.error('ChatClient : Échec de la récupération de l\'historique', response.status);
        return;
      }
      const responseData = await response.json();
      
      let messagesList = responseData.messages;
      if (!messagesList) {
        messagesList = [];
      }
      
      let hasMore = responseData.hasMore;
      if (!hasMore) {
        hasMore = false;
      }
      
      let oldestId = responseData.oldestId;
      if (!oldestId) {
        oldestId = null;
      }

      this._emit('historyLoaded', {
        messages: messagesList,
        hasMore: hasMore,
        oldestId: oldestId,
      });
    } catch (error) {
      console.error('ChatClient : Erreur de récupération de l\'historique', error);
    }
  }

  /**
   * Charger des messages plus anciens (pagination vers le haut).
   * @param {string} roomSlug
   * @param {number} beforeId
   */
  async loadOlder(roomSlug, beforeId) {
    return this.loadHistory(roomSlug, beforeId);
  }

  /**
   * Envoyer un message dans le salon actuel.
   * @param {string} content — Texte du message
   * @returns {string|null} hash si rendu optimiste, null sinon
   */
  sendMessage(content) {
    if (!this.currentRoom) {
      console.error('ChatClient : Aucun salon rejoint');
      this._emit('error', 'Rejoignez une conversation d\'abord.');
      return null;
    }
    if (!content || !content.trim()) {
      return null;
    }

    const trimmed = content.trim();

    // Marquer pour la déduplication afin que l'écho du serveur ne produise pas de doublon
    let connectionStatus = "buffered::";
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        connectionStatus = "";
      }
    }
    
    const hash = this.currentRoom + '::' + connectionStatus + trimmed;

    this._send({
      type: 'send_message',
      room: this.currentRoom,
      message: trimmed,
    });

    return trimmed;
  }

  /**
   * Marquer un message comme rendu optimiste afin que l'écho WebSocket soit dédoublonné.
   * Prend en charge plusieurs messages identiques via un compteur.
   * @param {string} room - slug du salon
   * @param {string} owner - nom de l'auteur du message
   * @param {string} content - contenu du message
   */
  markOptimistic(room, owner, content) {
    const hash = room + '::' + owner + '::' + content;
    
    let currentCounter = this._optimisticCounters.get(hash);
    if (currentCounter === undefined || currentCounter === null) {
      currentCounter = 0;
    }
    
    this._optimisticCounters.set(hash, currentCounter + 1);
  }

  // ── Liste des salons ──────────────────────────────────────────────────────────

  /**
   * Récupérer la liste des salons disponibles.
   * @returns {Promise<Array<{id:number, name:string, slug:string}>>}
   */
  async fetchRooms() {
    try {
      const response = await fetch(`${this.restBase}/rooms`, { credentials: 'include' });
      if (!response.ok) {
        return [];
      }
      return await response.json();
    } catch (error) {
      console.error('ChatClient : Erreur de récupération des salons', error);
      return [];
    }
  }
}

// Exposer globalement pour d'autres scripts
window.ChatClient = ChatClient;
