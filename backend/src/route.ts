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
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS events (
        id          SERIAL PRIMARY KEY,
        title       VARCHAR(255) NOT NULL,
        sport       VARCHAR(100) NOT NULL,
        location    VARCHAR(255) NOT NULL,
        event_date  TIMESTAMP NOT NULL,
        capacity    INTEGER NOT NULL DEFAULT 10,
        creator_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_automatic BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS event_participants (
        id        SERIAL PRIMARY KEY,
        event_id  INTEGER REFERENCES events(id) ON DELETE CASCADE,
        user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(event_id, user_id)
      )
    `);
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id         SERIAL PRIMARY KEY,
        event_id   INTEGER REFERENCES events(id) ON DELETE CASCADE UNIQUE,
        name       VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS chat_room_members (
        id        SERIAL PRIMARY KEY,
        room_id   INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
        user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(room_id, user_id)
      )
    `);

    // Seed automatic events if the events table is empty
    const countResult = await client.queryObject<{ count: string }>(
      "SELECT COUNT(*) as count FROM events"
    );
    if (Number(countResult.rows[0].count) === 0) {
      console.log("Seeding automatic events...");
      const seeds = [
        { title: "Match de foot 5v5", sport: "Football", location: "Stade Municipal, Lyon", days: 0, hours: 18, capacity: 10 },
        { title: "Sortie running 10km", sport: "Running", location: "Parc de la Tête d'Or", days: 1, hours: 7, capacity: 12 },
        { title: "Session musculation", sport: "Musculation", location: "Basic-Fit Villeurbanne", days: 2, hours: 19, capacity: 6 },
        { title: "Tennis en double", sport: "Tennis", location: "Club de Tennis, Caluire", days: 3, hours: 17, capacity: 4 },
        { title: "Tournoi inter-quartiers", sport: "Football", location: "Stade de Gerland, Lyon", days: 5, hours: 14, capacity: 12 },
        { title: "Pick-up game du weekend", sport: "Basket", location: "Gymnase Tony Parker", days: 6, hours: 10, capacity: 10 },
        { title: "Trail des monts du Lyonnais", sport: "Running", location: "Saint-Priest", days: 12, hours: 8, capacity: 100 },
        { title: "Yoga en plein air", sport: "Yoga", location: "Parc de la Tête d'Or", days: 7, hours: 9, capacity: 15 },
        { title: "Initiation bloc", sport: "Escalade", location: "Salle d'escalade L'Orange Bleue", days: 8, hours: 18, capacity: 8 },
        { title: "Sortie vélo route 80km", sport: "Cyclisme", location: "Place Bellecour", days: 10, hours: 7, capacity: 20 },
      ];
      for (const s of seeds) {
        await client.queryArray(
          `INSERT INTO events (title, sport, location, event_date, capacity, is_automatic)
           VALUES ($1, $2, $3, NOW() + INTERVAL '${s.days} days' + INTERVAL '${s.hours} hours', $4, TRUE)`,
          [s.title, s.sport, s.location, s.capacity]
        );
      }
      console.log("Seeded", seeds.length, "automatic events.");
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

// ── WebSocket ─────────────────────────────────────────────────────────────────
const wsClients = new Set<WebSocket>();

function broadcast(data: unknown) {
  const msg = JSON.stringify(data);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
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

  const ws = ctx.upgrade();
  (ws as unknown as Record<string, unknown>).user = payload;

  ws.onopen = () => {
    wsClients.add(ws);
    console.log(`WS client connected: ${payload.name}`);
  };

  ws.onmessage = (event) => {
    const userPayload =
      (ws as unknown as Record<string, { name: string }>).user;
    let data: { message?: string };
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (data.message && typeof data.message === "string") {
      broadcast({ owner: userPayload.name, message: data.message });
    }
  };

  ws.onclose = () => {
    wsClients.delete(ws);
    console.log("WS client disconnected");
  };

  ws.onerror = (err) => {
    console.error("WS error:", err);
    wsClients.delete(ws);
  };
});

// ── Event Routes ──────────────────────────────────────────────────────────────

/** GET /events — list all events with participant count */
router.get("/events", async (ctx) => {
  let client: Client;
  try { client = await getClient(); } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    const result = await client.queryObject(`
      SELECT e.*,
        (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.event_id = e.id) AS participants_count,
        COALESCE(u.name, 'Système') AS creator_name
      FROM events e
      LEFT JOIN users u ON e.creator_id = u.id
      ORDER BY e.event_date ASC
    `);
    ctx.response.body = result.rows;
  } catch (err) {
    console.error("GET /events error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** POST /events — create event (auth required) */
router.post("/events", authMiddleware, async (ctx) => {
  let body: Record<string, unknown> | undefined;
  try { body = await ctx.request.body.json(); } catch {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid JSON body" };
    return;
  }
  const { title, sport, location, event_date, capacity } = body ?? {};
  if (!title || !sport || !location || !event_date || !capacity) {
    ctx.response.status = 400;
    ctx.response.body = { error: "title, sport, location, event_date, capacity are required" };
    return;
  }

  const userId = Number(ctx.state.user.sub);
  let client: Client;
  try { client = await getClient(); } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    const result = await client.queryObject<{ id: number }>(
      `INSERT INTO events (title, sport, location, event_date, capacity, creator_id, is_automatic)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING id`,
      [title, sport, location, event_date, capacity, userId]
    );
    const eventId = result.rows[0].id;

    // Auto-join the creator
    await client.queryArray(
      "INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [eventId, userId]
    );

    // Create chat room for this event
    const roomResult = await client.queryObject<{ id: number }>(
      "INSERT INTO chat_rooms (event_id, name) VALUES ($1, $2) RETURNING id",
      [eventId, title]
    );
    await client.queryArray(
      "INSERT INTO chat_room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [roomResult.rows[0].id, userId]
    );

    ctx.response.status = 201;
    ctx.response.body = { message: "Event created", id: eventId };
  } catch (err) {
    console.error("POST /events error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** POST /events/:id/join — join event + create/join chat room (auth required) */
router.post("/events/:id/join", authMiddleware, async (ctx) => {
  const eventId = Number(ctx.params.id);
  const userId = Number(ctx.state.user.sub);

  let client: Client;
  try { client = await getClient(); } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    // Check event exists and has space
    const ev = await client.queryObject<{ id: number; title: string; capacity: number }>(
      "SELECT id, title, capacity FROM events WHERE id = $1", [eventId]
    );
    if (ev.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Event not found" };
      return;
    }
    const pCount = await client.queryObject<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM event_participants WHERE event_id = $1", [eventId]
    );
    if (pCount.rows[0].count >= ev.rows[0].capacity) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Event is full" };
      return;
    }

    // Join the event
    await client.queryArray(
      "INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [eventId, userId]
    );

    // Create chat room if it doesn't exist, then add user
    let roomResult = await client.queryObject<{ id: number }>(
      "SELECT id FROM chat_rooms WHERE event_id = $1", [eventId]
    );
    let roomId: number;
    if (roomResult.rows.length === 0) {
      const newRoom = await client.queryObject<{ id: number }>(
        "INSERT INTO chat_rooms (event_id, name) VALUES ($1, $2) RETURNING id",
        [eventId, ev.rows[0].title]
      );
      roomId = newRoom.rows[0].id;
    } else {
      roomId = roomResult.rows[0].id;
    }
    await client.queryArray(
      "INSERT INTO chat_room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [roomId, userId]
    );

    ctx.response.status = 200;
    ctx.response.body = { message: "Joined event", room_id: roomId };
  } catch (err) {
    console.error("POST /events/:id/join error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** POST /events/:id/leave — leave event + leave chat room (auth required) */
router.post("/events/:id/leave", authMiddleware, async (ctx) => {
  const eventId = Number(ctx.params.id);
  const userId = Number(ctx.state.user.sub);

  let client: Client;
  try { client = await getClient(); } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    await client.queryArray(
      "DELETE FROM event_participants WHERE event_id = $1 AND user_id = $2",
      [eventId, userId]
    );
    // Remove from associated chat room
    const room = await client.queryObject<{ id: number }>(
      "SELECT id FROM chat_rooms WHERE event_id = $1", [eventId]
    );
    if (room.rows.length > 0) {
      await client.queryArray(
        "DELETE FROM chat_room_members WHERE room_id = $1 AND user_id = $2",
        [room.rows[0].id, userId]
      );
    }
    ctx.response.status = 200;
    ctx.response.body = { message: "Left event" };
  } catch (err) {
    console.error("POST /events/:id/leave error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** GET /my-events — get IDs of events the current user joined (auth required) */
router.get("/my-events", authMiddleware, async (ctx) => {
  const userId = Number(ctx.state.user.sub);
  let client: Client;
  try { client = await getClient(); } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    const result = await client.queryObject<{ event_id: number }>(
      "SELECT event_id FROM event_participants WHERE user_id = $1", [userId]
    );
    ctx.response.body = result.rows.map((r) => r.event_id);
  } catch (err) {
    console.error("GET /my-events error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** GET /my-chat-rooms — get chat rooms the current user is in (auth required) */
router.get("/my-chat-rooms", authMiddleware, async (ctx) => {
  const userId = Number(ctx.state.user.sub);
  let client: Client;
  try { client = await getClient(); } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    const result = await client.queryObject(`
      SELECT cr.id, cr.name, cr.event_id,
        (SELECT COUNT(*)::int FROM chat_room_members m WHERE m.room_id = cr.id) AS member_count
      FROM chat_rooms cr
      INNER JOIN chat_room_members crm ON crm.room_id = cr.id
      WHERE crm.user_id = $1
      ORDER BY cr.created_at DESC
    `, [userId]);
    ctx.response.body = result.rows;
  } catch (err) {
    console.error("GET /my-chat-rooms error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});
