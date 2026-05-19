import { Router, Context } from "https://deno.land/x/oak@v17.1.6/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { SignJWT, jwtVerify } from "https://deno.land/x/jose@v5.9.3/index.ts";

// ── Secrets ───────────────────────────────────────────────────────────────────
const JWT_SECRET = new TextEncoder().encode(
  Deno.env.get("JWT_SECRET") ?? "dev-access-secret-change-me"
);
const REFRESH_SECRET = new TextEncoder().encode(
  Deno.env.get("REFRESH_SECRET") ?? "dev-refresh-secret-change-me"
);
const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

// ── Database connection ───────────────────────────────────────────────────────
const DB_HOST = Deno.env.get("DB_HOST") ?? "localhost";
const DB_PASSWORD = Deno.env.get("DB_PASSWORD") ?? "password";
const DB_USER = Deno.env.get("DB_USER") ?? "user";
const DB_NAME = Deno.env.get("DB_NAME") ?? "projet_web";

async function getClient(): Promise<Client> {
  console.log(`Connecting to DB at ${DB_HOST}:5432 (user=${DB_USER}, db=${DB_NAME})`);
  const client = new Client({
    hostname: DB_HOST,
    port: 5432,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    tls: { enabled: false },
  });
  await client.connect();
  return client;
}

// ── Schema initialisation (runs once at startup) ──────────────────────────────
export async function initDb(): Promise<void> {
  const client = await getClient();
  try {
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(255) NOT NULL UNIQUE,
        password      TEXT NOT NULL,
        refresh_token TEXT
      )
    `);
    await client.queryArray(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS refresh_token TEXT
    `);
    // Rooms & Messages
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS rooms (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL UNIQUE,
        slug       VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS messages (
        id         SERIAL PRIMARY KEY,
        room_id    INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
        user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        owner      VARCHAR(255) NOT NULL,
        content    TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.queryArray(`
      CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id)
    `);
    await client.queryArray(`
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)
    `);
    // Seed default rooms
    const rooms = [
      ["Général", "general"],
      ["Football", "football"],
      ["Running", "running"],
      ["Musculation", "musculation"],
    ];
    for (const [name, slug] of rooms) {
      await client.queryArray(
        `INSERT INTO rooms (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`,
        [name, slug],
      );
    }
    console.log("DB schema ready.");
  } finally {
    await client.end();
  }
}

// hachage du mdp
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16; // bytes
const KEY_LENGTH = 256; // bits

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    KEY_LENGTH,
  );
  const hashArray = new Uint8Array(derivedBits);
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(hashArray).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

async function comparePassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [saltHex, hashHex] = parts;
  if (saltHex.length !== SALT_LENGTH * 2) return false;
  const salt = new Uint8Array(
    saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    KEY_LENGTH,
  );
  const hashArray = new Uint8Array(derivedBits);
  const computedHash = Array.from(hashArray).map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time comparison
  if (computedHash.length !== hashHex.length) return false;
  let result = 0;
  for (let i = 0; i < computedHash.length; i++) {
    result |= computedHash.charCodeAt(i) ^ hashHex.charCodeAt(i);
  }
  return result === 0;
}

// ── JWT helpers ───────────────────────────────────────────────────────────────
async function signAccessToken(userId: number, name: string): Promise<string> {
  return await new SignJWT({ sub: String(userId), name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRY)
    .sign(JWT_SECRET);
}

async function signRefreshToken(userId: number): Promise<string> {
  return await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRY)
    .sign(REFRESH_SECRET);
}

async function verifyAccessToken(token: string) {
  return await jwtVerify(token, JWT_SECRET, { clockTolerance: 60 });
}

async function verifyRefreshToken(token: string) {
  return await jwtVerify(token, REFRESH_SECRET, { clockTolerance: 60 });
}

// ── Cookie helpers ────────────────────────────────────────────────────────────
async function setAccessCookie(ctx: Context, token: string) {
  ctx.cookies.set("access_token", token, {
    httpOnly: true,
    secure: false, // localhost dev
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60, // 15 minutes in seconds
  });
}

async function setRefreshCookie(ctx: Context, token: string) {
  ctx.cookies.set("refresh_token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

async function clearAuthCookies(ctx: Context) {
  ctx.cookies.delete("access_token", { path: "/" });
  ctx.cookies.delete("refresh_token", { path: "/" });
}

// ── Auth middleware ────────────────────────────────────────────────────────────
export async function authMiddleware(
  ctx: Context,
  next: () => Promise<unknown>
) {
  const token = await ctx.cookies.get("access_token");
  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }
  try {
    const { payload } = await verifyAccessToken(token);
    ctx.state.user = payload;
    await next();
  } catch {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
  }
}

// ── Router ────────────────────────────────────────────────────────────────────
export const router = new Router();

/** POST /register  { username, password } */
router.post("/register", async (ctx) => {
  let body: Record<string, unknown> | undefined;
  try {
    body = await ctx.request.body.json();
  } catch {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid JSON body" };
    return;
  }
  const { username, password } = body ?? {};

  if (
    !username || !password || typeof username !== "string" ||
    typeof password !== "string"
  ) {
    ctx.response.status = 400;
    ctx.response.body = { error: "username and password are required" };
    return;
  }

  if (password.length < 6) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Password must be at least 6 characters" };
    return;
  }

  let client: Client;
  try {
    client = await getClient();
  } catch (err) {
    console.error("Register DB connection error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    const hashed = await hashPassword(password);
    await client.queryArray(
      "INSERT INTO users (name, password) VALUES ($1, $2)",
      [username, hashed],
    );
    ctx.response.status = 201;
    ctx.response.body = { message: "User created" };
  } catch (err) {
    console.error("Register error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** POST /login  { username, password } */
router.post("/login", async (ctx) => {
  let body: Record<string, unknown> | undefined;
  try {
    body = await ctx.request.body.json();
  } catch {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid JSON body" };
    return;
  }
  const { username, password } = body ?? {};

  let client: Client;
  try {
    client = await getClient();
  } catch (err) {
    console.error("Login DB connection error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    const result = await client.queryObject<
      { id: number; name: string; password: string }
    >(
      "SELECT id, name, password FROM users WHERE name = $1",
      [username],
    );

    if (result.rows.length === 0) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid credentials" };
      return;
    }

    const user = result.rows[0];
    const valid = await comparePassword(String(password), user.password);
    if (!valid) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid credentials" };
      return;
    }

    const accessToken = await signAccessToken(user.id, user.name);
    const refreshToken = await signRefreshToken(user.id);

    await client.queryArray(
      "UPDATE users SET refresh_token = $1 WHERE id = $2",
      [refreshToken, user.id],
    );

    await setAccessCookie(ctx, accessToken);
    await setRefreshCookie(ctx, refreshToken);

    ctx.response.status = 200;
    ctx.response.body = { message: "Login successful", user: { id: user.id, name: user.name } };
  } catch (err) {
    console.error("Login error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** POST /refresh */
router.post("/refresh", async (ctx) => {
  const refreshToken = await ctx.cookies.get("refresh_token");
  if (!refreshToken) {
    ctx.response.status = 401;
    ctx.response.body = { error: "No refresh token" };
    return;
  }

  let payload;
  try {
    ({ payload } = await verifyRefreshToken(refreshToken));
  } catch {
    await clearAuthCookies(ctx);
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid refresh token" };
    return;
  }

  const userId = Number(payload.sub);
  let client: Client;
  try {
    client = await getClient();
  } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    const result = await client.queryObject<
      { id: number; name: string; refresh_token: string | null }
    >(
      "SELECT id, name, refresh_token FROM users WHERE id = $1",
      [userId],
    );
    if (
      result.rows.length === 0 ||
      result.rows[0].refresh_token !== refreshToken
    ) {
      await clearAuthCookies(ctx);
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid refresh token" };
      return;
    }

    const user = result.rows[0];
    const newAccess = await signAccessToken(user.id, user.name);
    await setAccessCookie(ctx, newAccess);
    ctx.response.status = 200;
    ctx.response.body = { message: "Token refreshed" };
  } catch (err) {
    console.error("Refresh token error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** POST /logout */
router.post("/logout", async (ctx) => {
  const refreshToken = await ctx.cookies.get("refresh_token");
  if (refreshToken) {
    try {
      const client = await getClient();
      try {
        await client.queryArray(
          "UPDATE users SET refresh_token = NULL WHERE refresh_token = $1",
          [refreshToken],
        );
      } finally {
        await client.end();
      }
    } catch {
      // ignore DB error on logout
    }
  }
  await clearAuthCookies(ctx);
  ctx.response.status = 200;
  ctx.response.body = { message: "Logged out" };
});

/** GET /health  – used by Docker HEALTHCHECK */
router.get("/health", (ctx) => {
  ctx.response.status = 200;
  ctx.response.body = { status: "ok" };
});

// ── Rooms REST ───────────────────────────────────────────────────────────────

/** GET /rooms  – list all rooms sorted by last message (auth required) */
router.get("/rooms", authMiddleware, async (ctx) => {
  let client: Client;
  try {
    client = await getClient();
  } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    const result = await client.queryObject<{
      id: number;
      name: string;
      slug: string;
      last_message_at: string | null;
      last_message_preview: string | null;
    }>(
      `SELECT r.id, r.name, r.slug,
              lm.created_at AS last_message_at,
              lm.content AS last_message_preview
       FROM rooms r
       LEFT JOIN LATERAL (
         SELECT m.created_at, m.content
         FROM messages m
         WHERE m.room_id = r.id
         ORDER BY m.id DESC
         LIMIT 1
       ) lm ON true
       ORDER BY last_message_at DESC NULLS LAST`
    );
    ctx.response.status = 200;
    ctx.response.body = result.rows;
  } catch (err) {
    console.error("GET /rooms error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** GET /rooms/:slug/messages?before=<id>&limit=50  – paginated message history (auth required) */
router.get("/rooms/:slug/messages", authMiddleware, async (ctx) => {
  const slug = ctx.params.slug;
  const before = ctx.request.url.searchParams.get("before");
  const limit = parseInt(ctx.request.url.searchParams.get("limit") ?? "50");

  let client: Client;
  try {
    client = await getClient();
  } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    let query = `
      SELECT m.id, m.owner, m.content, m.created_at, m.room_id, r.slug as room_slug
      FROM messages m
      JOIN rooms r ON r.id = m.room_id
      WHERE r.slug = $1
    `;
    const params: (string | number)[] = [slug];

    if (before) {
      query += ` AND m.id < $2`;
      params.push(Number(before));
    }

    query += ` ORDER BY m.id DESC LIMIT $${params.length + 1}`;
    params.push(Math.min(limit, 100));

    const result = await client.queryObject<{
      id: number;
      owner: string;
      content: string;
      created_at: string;
      room_id: number;
      room_slug: string;
    }>(query, params);

    // Reverse to chronological order
    const rows = result.rows.reverse();
    ctx.response.status = 200;
    ctx.response.body = {
      messages: rows,
      hasMore: rows.length === Math.min(limit, 100),
      oldestId: rows.length > 0 ? rows[0].id : null,
    };
  } catch (err) {
    console.error("GET /rooms/:slug/messages error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

// ── Message persistence helper ───────────────────────────────────────────────

async function persistMessage(
  roomSlug: string,
  userId: number,
  owner: string,
  content: string,
): Promise<{ id: number; created_at: string } | null> {
  let client: Client;
  try {
    client = await getClient();
  } catch {
    return null;
  }
  try {
    const result = await client.queryObject<{ id: number; created_at: string }>(
      `INSERT INTO messages (room_id, user_id, owner, content)
       SELECT id, $2, $3, $4 FROM rooms WHERE slug = $1
       RETURNING messages.id, messages.created_at`,
      [roomSlug, userId, owner, content],
    );
    if (result.rows.length > 0) return result.rows[0];
    return null;
  } catch (err) {
    console.error("persistMessage error:", err);
    return null;
  } finally {
    await client.end();
  }
}

// ── WebSocket with rooms ─────────────────────────────────────────────────────

type WsClient = WebSocket & { user?: { sub: string; name: string }; rooms: Set<string> };

const roomClients = new Map<string, Set<WsClient>>();

function getOrCreateRoom(room: string): Set<WsClient> {
  if (!roomClients.has(room)) roomClients.set(room, new Set());
  return roomClients.get(room)!;
}

function broadcastToRoom(room: string, data: unknown) {
  const msg = JSON.stringify(data);
  const clients = roomClients.get(room);
  if (!clients) return;
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function sendTo(ws: WsClient, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function removeFromAllRooms(ws: WsClient) {
  if (ws.rooms) {
    for (const room of ws.rooms) {
      const clients = roomClients.get(room);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) roomClients.delete(room);
      }
    }
  }
}

router.get("/ws", async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Not upgradable" };
    return;
  }

  const token = await ctx.cookies.get("access_token");
  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }

  let payload;
  try {
    ({ payload } = await verifyAccessToken(token));
  } catch {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }

  const ws = ctx.upgrade() as WsClient;
  ws.user = { sub: String(payload.sub), name: String(payload.name) };
  ws.rooms = new Set();

  ws.onopen = () => {
    console.log(`WS client connected: ${payload.name}`);
    // Auto-join everyone to the general chat
    const generalRoom = getOrCreateRoom("general");
    generalRoom.add(ws);
    ws.rooms!.add("general");
    console.log(`${payload.name} auto-joined general`);
  };

  ws.onmessage = async (event) => {
    let data: { type?: string; room?: string; message?: string };
    try {
      data = JSON.parse(event.data);
    } catch {
      sendTo(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    const type = data.type;
    const userPayload = ws.user!;
    const userId = Number(userPayload.sub);
    const userName = userPayload.name;

    switch (type) {
      case "join_room": {
        const roomSlug = data.room;
        if (!roomSlug || typeof roomSlug !== "string") {
          sendTo(ws, { type: "error", message: "room is required" });
          return;
        }
        ws.rooms!.add(roomSlug);
        const room = getOrCreateRoom(roomSlug);
        room.add(ws);
        sendTo(ws, { type: "joined", room: roomSlug });
        console.log(`${userName} joined room ${roomSlug}`);
        break;
      }
      case "leave_room": {
        const roomSlug = data.room;
        if (!roomSlug || typeof roomSlug !== "string") {
          sendTo(ws, { type: "error", message: "room is required" });
          return;
        }
        ws.rooms!.delete(roomSlug);
        const clients = roomClients.get(roomSlug);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) roomClients.delete(roomSlug);
        }
        sendTo(ws, { type: "left", room: roomSlug });
        break;
      }
      case "send_message": {
        const roomSlug = data.room;
        const content = data.message;
        if (!roomSlug || typeof roomSlug !== "string") {
          sendTo(ws, { type: "error", message: "room is required" });
          return;
        }
        if (!content || typeof content !== "string" || content.trim().length === 0) {
          sendTo(ws, { type: "error", message: "message is required" });
          return;
        }
        if (content.length > 2000) {
          sendTo(ws, { type: "error", message: "Message too long (max 2000)" });
          return;
        }

        // Verify the client has joined this room
        if (!ws.rooms.has(roomSlug)) {
          sendTo(ws, { type: "error", message: "You must join the room first" });
          return;
        }

        const persisted = await persistMessage(roomSlug, userId, userName, content.trim());
        if (!persisted) {
          sendTo(ws, { type: "error", message: "Failed to save message" });
          return;
        }

        const broadcastMsg = {
          type: "message",
          id: persisted.id,
          room: roomSlug,
          owner: userName,
          content: content.trim(),
          created_at: persisted.created_at,
        };
        broadcastToRoom(roomSlug, broadcastMsg);
        break;
      }
      default:
        sendTo(ws, { type: "error", message: `Unknown type: ${type}` });
    }
  };

  ws.onclose = () => {
    removeFromAllRooms(ws);
    console.log(`WS client disconnected: ${payload.name}`);
  };

  ws.onerror = (err) => {
    console.error("WS error:", err);
    removeFromAllRooms(ws);
  };
});
