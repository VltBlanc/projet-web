// =============================================================================
// ChatClient — reusable chat module
// Works on both main.html (multi-room dashboard) and chat.html (standalone)
// =============================================================================

class ChatClient {
  /**
   * @param {object} options
   * @param {string}  options.wsUrl       — WebSocket endpoint (e.g. "ws://localhost:8081/ws")
   * @param {string}  options.restBase    — REST API base (e.g. "http://localhost:8081")
   * @param {number}  [options.maxReconnects=10] — max reconnection attempts
   * @param {number}  [options.reconnectDelay=1000] — initial delay in ms (exponential backoff)
   * @param {number}  [options.historyLimit=50] — messages to fetch per page
   */
  constructor(options) {
    this.wsUrl = options.wsUrl;
    this.restBase = options.restBase;
    this.maxReconnects = options.maxReconnects ?? 10;
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.historyLimit = options.historyLimit ?? 50;

    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.currentRoom = null;
    this._pendingMessages = [];          // buffered messages sent before WS is open
    this._optimisticCounters = new Map(); // dedup: hash → count for optimistic renders

    // Callback registry
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
    };
  }

  // ── Callback registration ────────────────────────────────────────────────

  /** Register a callback. Returns an unsubscribe function. */
  on(event, fn) {
    if (this._callbacks[event]) {
      this._callbacks[event].push(fn);
    }
    return () => {
      this._callbacks[event] = this._callbacks[event].filter(f => f !== fn);
    };
  }

  _emit(event, ...args) {
    for (const fn of this._callbacks[event] || []) {
      try { fn(...args); } catch (e) { console.error(`ChatClient callback error [${event}]:`, e); }
    }
  }

  // ── Connection ────────────────────────────────────────────────────────────

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch (err) {
      console.error('ChatClient: WebSocket creation failed', err);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('ChatClient: connected');
      this.reconnectAttempts = 0;

      // Flush any pending messages that were queued before the connection opened
      if (this._pendingMessages.length > 0) {
        console.log(`ChatClient: flushing ${this._pendingMessages.length} pending messages`);
        for (const obj of this._pendingMessages) {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
          }
        }
        this._pendingMessages = [];
      }

      this._emit('connected');

      // Re-join current room if any
      if (this.currentRoom) {
        this._send({ type: 'join_room', room: this.currentRoom });
      }
    };

    this.ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); }
      catch { return; }
      this._handleMessage(data);
    };

    this.ws.onerror = (err) => {
      console.error('ChatClient: WebSocket error', err);
      // onclose will fire after this
    };

    this.ws.onclose = () => {
      this.ws = null;
      this._emit('disconnected');
      this._scheduleReconnect();
    };
  }

  disconnect() {
    this._clearReconnect();
    this._pendingMessages = [];  // clear buffer so stale messages aren't re-sent
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect
      this.ws.close();
      this.ws = null;
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnects) {
      console.error('ChatClient: max reconnect attempts reached');
      this._pendingMessages = [];  // clear buffer so stale messages aren't re-sent
      this._emit('error', 'Impossible de se reconnecter au serveur.');
      return;
    }
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this._emit('reconnect', this.reconnectAttempts);
    console.log(`ChatClient: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
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

  // ── WS helpers ────────────────────────────────────────────────────────────

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    } else {
      // Buffer the message — will be flushed in onopen
      if (this._pendingMessages.length >= 50) {
        this._pendingMessages.shift(); // drop oldest
      }
      this._pendingMessages.push(obj);
      console.warn('ChatClient: message buffered (WS not open)');
    }
  }

  _handleMessage(data) {
    switch (data.type) {
      case 'message':
        // Dedup: skip if we optimistically rendered this message (counter-based)
        const hash = data.room + '::' + data.owner + '::' + data.content;
        const count = this._optimisticCounters.get(hash);
        if (count && count > 0) {
          if (count === 1) {
            this._optimisticCounters.delete(hash);
          } else {
            this._optimisticCounters.set(hash, count - 1);
          }
          break; // don't emit — already shown optimistically
        }
        this._emit('message', {
          id: data.id,
          room: data.room,
          owner: data.owner,
          content: data.content,
          created_at: data.created_at,
        });
        break;
      case 'joined':
        this._emit('joined', data.room);
        break;
      case 'left':
        this._emit('left', data.room);
        break;
      case 'error':
        console.error('ChatClient server error:', data.message);
        this._emit('error', data.message);
        break;
      case 'data_updated':
        this._emit('data_updated');
        break;
      default:
        // Ignore unknown message types for forward compatibility
    }
  }

  // ── Room management ───────────────────────────────────────────────────────

  async joinRoom(roomSlug) {
    this.currentRoom = roomSlug;

    // Load history
    await this.loadHistory(roomSlug);
  }

  joinChannel(roomSlug) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this._send({ type: 'join_room', room: roomSlug });
    } else {
      this._send({ type: 'join_room', room: roomSlug }); // will be buffered
    }
  }

  /**
   * Load message history from REST API.
   * @param {string}  roomSlug
   * @param {number}  [beforeId] — cursor for pagination
   */
  async loadHistory(roomSlug, beforeId = null) {
    let url = `${this.restBase}/rooms/${encodeURIComponent(roomSlug)}/messages?limit=${this.historyLimit}`;
    if (beforeId) {
      url += `&before=${beforeId}`;
    }

    try {
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) {
        console.error('ChatClient: history fetch failed', resp.status);
        return;
      }
      const data = await resp.json();
      this._emit('historyLoaded', {
        messages: data.messages || [],
        hasMore: data.hasMore || false,
        oldestId: data.oldestId || null,
      });
    } catch (err) {
      console.error('ChatClient: history fetch error', err);
    }
  }

  /**
   * Load older messages (scroll up pagination).
   * @param {string} roomSlug
   * @param {number} beforeId
   */
  async loadOlder(roomSlug, beforeId) {
    return this.loadHistory(roomSlug, beforeId);
  }

  /**
   * Send a message to the current room.
   * @param {string} content — message text
   * @returns {string|null} hash if optimistically rendered, null otherwise
   */
  sendMessage(content) {
    if (!this.currentRoom) {
      console.error('ChatClient: no room joined');
      this._emit('error', 'Rejoignez une conversation d\'abord.');
      return null;
    }
    if (!content || !content.trim()) return null;

    const trimmed = content.trim();

    // Mark for dedup so the echo doesn't produce a duplicate
    const hash = this.currentRoom + '::' + (this.ws && this.ws.readyState === WebSocket.OPEN ? '' : 'buffered::') + trimmed;
    // We use a dynamic user-based hash for the dedup — the frontend will call markOptimistic with the actual user

    this._send({
      type: 'send_message',
      room: this.currentRoom,
      message: trimmed,
    });

    return trimmed;
  }

  /**
   * Mark a message as optimistically rendered so the WS echo is deduplicated.
   * Supports multiple identical messages via a counter.
   * @param {string} room - room slug
   * @param {string} owner - message author name
   * @param {string} content - message content
   */
  markOptimistic(room, owner, content) {
    const hash = room + '::' + owner + '::' + content;
    this._optimisticCounters.set(hash, (this._optimisticCounters.get(hash) || 0) + 1);
  }

  // ── Rooms list ────────────────────────────────────────────────────────────

  /**
   * Fetch the list of available rooms.
   * @returns {Promise<Array<{id:number, name:string, slug:string}>>}
   */
  async fetchRooms() {
    try {
      const resp = await fetch(`${this.restBase}/rooms`, { credentials: 'include' });
      if (!resp.ok) return [];
      return await resp.json();
    } catch (err) {
      console.error('ChatClient: fetchRooms error', err);
      return [];
    }
  }
}

// Export for use in other scripts
window.ChatClient = ChatClient;
