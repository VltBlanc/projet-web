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
const PEPPER = Deno.env.get("PEPPER") ?? "dev-secret-pepper-change-me";
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
        refresh_token TEXT,
        role          VARCHAR(20) NOT NULL DEFAULT 'user'
      )
    `);
    await client.queryArray(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS refresh_token TEXT
    `);
    await client.queryArray(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'
    `);
    await client.queryArray(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS bio TEXT
    `);
    // ── Messaging system ─────────────────────────────────────────────────
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS rooms (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        slug       VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Drop constraints and old tables if they exist from before
    await client.queryArray("ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_name_key CASCADE");
    await client.queryArray("DROP TABLE IF EXISTS chat_room_members CASCADE");
    await client.queryArray("DROP TABLE IF EXISTS chat_rooms CASCADE");
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

    // ── Events system ───────────────────────────────────────────────────
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

    // ── Categories ──────────────────────────────────────────────────────
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS user_categories (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        category_slug VARCHAR(255) NOT NULL,
        PRIMARY KEY (user_id, category_slug)
      )
    `);


    // Seed default messaging rooms
    const rooms = [
      ["Général", "general"],
      ["Football", "football"],
      ["Basket", "basket"],
      ["Running", "running"],
      ["Tennis", "tennis"],
      ["Musculation", "musculation"],
      ["Yoga", "yoga"],
      ["Escalade", "escalade"],
      ["Cyclisme", "cyclisme"]
    ];
    for (const [name, slug] of rooms) {
      await client.queryArray(
        `INSERT INTO rooms (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`,
        [name, slug],
      );
    }

    // Seed automatic events if the events table is empty
    const countResult = await client.queryObject<{ count: string }>(
      "SELECT COUNT(*) as count FROM events"
    );
    if (Number(countResult.rows[0].count) === 0) {
      console.log("Seeding automatic events...");
      const seeds = [
        { title: "Match de foot 5v5", sport: "Football", location: "Stade Richter, Montpellier", days: 0, hours: 18, capacity: 10 },
        { title: "Sortie running 10km", sport: "Running", location: "Parc de Méric, Montpellier", days: 1, hours: 7, capacity: 12 },
        { title: "Session musculation", sport: "Musculation", location: "Basic-Fit Montpellier Comédie", days: 2, hours: 19, capacity: 6 },
        { title: "Tennis en double", sport: "Tennis", location: "Tennis Club de la Jalade, Montpellier", days: 3, hours: 17, capacity: 4 },
        { title: "Tournoi inter-quartiers", sport: "Football", location: "Stade Philippidès, Montpellier", days: 5, hours: 14, capacity: 12 },
        { title: "Pick-up game du weekend", sport: "Basket", location: "Gymnase René Bougnol, Montpellier", days: 6, hours: 10, capacity: 10 },
        { title: "Trail du Pic Saint-Loup", sport: "Running", location: "Saint-Jean-de-Cuculles", days: 12, hours: 8, capacity: 100 },
        { title: "Yoga en plein air", sport: "Yoga", location: "Jardin des Plantes, Montpellier", days: 7, hours: 9, capacity: 15 },
        { title: "Initiation bloc", sport: "Escalade", location: "Salle d'escalade Block'Out, Montpellier", days: 8, hours: 18, capacity: 8 },
        { title: "Sortie vélo route 80km", sport: "Cyclisme", location: "Place de la Comédie, Montpellier", days: 10, hours: 7, capacity: 20 },
      ];
      for (const s of seeds) {
        const result = await client.queryObject<{ id: number }>(
          `INSERT INTO events (title, sport, location, event_date, capacity, is_automatic)
           VALUES ($1, $2, $3, NOW() + INTERVAL '${s.days} days' + INTERVAL '${s.hours} hours', $4, TRUE)
           RETURNING id`,
          [s.title, s.sport, s.location, s.capacity]
        );
        const eventId = result.rows[0].id;
        await client.queryArray(
          "INSERT INTO rooms (name, slug) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [s.title, `event-${eventId}`]
        );
      }
      console.log("Seeded", seeds.length, "automatic events.");
    }
    // ── Default admin user ────────────────────────────────────────────
    const adminUsername = Deno.env.get("ADMIN_USERNAME");
    if (adminUsername) {
      const existingAdmin = await client.queryObject<{ id: number }>(
        "SELECT id FROM users WHERE name = $1",
        [adminUsername]
      );
      if (existingAdmin.rows.length === 0) {
        const hashedPassword = await hashPassword(adminUsername);
        await client.queryArray(
          "INSERT INTO users (name, password, role) VALUES ($1, $2, 'admin')",
          [adminUsername, hashedPassword]
        );
        console.log(`Default admin user "${adminUsername}" created (password = username).`);
      } else {
        console.log(`Admin user "${adminUsername}" already exists, skipping creation.`);
      }
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

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  // Append PEPPER to password
  const pepperedPassword = password + PEPPER;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepperedPassword),
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

export async function comparePassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [saltHex, hashHex] = parts;
  if (saltHex.length !== SALT_LENGTH * 2) return false;
  const salt = new Uint8Array(
    saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
  );

  // 1. Try with Pepper
  const keyWithPepper = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password + PEPPER),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBitsWithPepper = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyWithPepper,
    KEY_LENGTH,
  );
  const hashArrayWithPepper = new Uint8Array(derivedBitsWithPepper);
  const computedHashWithPepper = Array.from(hashArrayWithPepper).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time comparison for Peppered hash
  if (computedHashWithPepper.length === hashHex.length) {
    let result = 0;
    for (let i = 0; i < computedHashWithPepper.length; i++) {
      result |= computedHashWithPepper.charCodeAt(i) ^ hashHex.charCodeAt(i);
    }
    return result === 0;
  }

  return false;
}

// ── JWT helpers ───────────────────────────────────────────────────────────────
export async function signAccessToken(userId: number, name: string, role: string = "user"): Promise<string> {
  return await new SignJWT({ sub: String(userId), name, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRY)
    .sign(JWT_SECRET);
}

export async function signRefreshToken(userId: number): Promise<string> {
  return await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRY)
    .sign(REFRESH_SECRET);
}

export async function verifyAccessToken(token: string) {
  return await jwtVerify(token, JWT_SECRET, { clockTolerance: 60 });
}

export async function verifyRefreshToken(token: string) {
  return await jwtVerify(token, REFRESH_SECRET, { clockTolerance: 60 });
}

// ── Cookie helpers ────────────────────────────────────────────────────────────
function setAccessCookie(ctx: Context, token: string) {
  ctx.cookies.set("access_token", token, {
    httpOnly: true,
    secure: ctx.request.secure,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60, // 15 minutes in seconds
  });
}

function setRefreshCookie(ctx: Context, token: string) {
  ctx.cookies.set("refresh_token", token, {
    httpOnly: true,
    secure: ctx.request.secure,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

function clearAuthCookies(ctx: Context) {
  ctx.cookies.delete("access_token", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: ctx.request.secure,
  });
  ctx.cookies.delete("refresh_token", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: ctx.request.secure,
  });
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

// ── Admin middleware ───────────────────────────────────────────────────────────
export async function adminMiddleware(
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
    if (payload.role !== "admin") {
      ctx.response.status = 403;
      ctx.response.body = { error: "Forbidden: admin access required" };
      return;
    }
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
      { id: number; name: string; password: string; role: string }
    >(
      "SELECT id, name, password, role FROM users WHERE name = $1",
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

    // Promote to admin if ADMIN_USERNAME matches
    const adminUsername = Deno.env.get("ADMIN_USERNAME");
    if (adminUsername && user.name === adminUsername && user.role !== "admin") {
      await client.queryArray(
        "UPDATE users SET role = 'admin' WHERE name = $1",
        [adminUsername]
      );
      user.role = "admin";
      console.log(`User "${adminUsername}" promoted to admin at login.`);
    }

    const accessToken = await signAccessToken(user.id, user.name, user.role);
    const refreshToken = await signRefreshToken(user.id);

    await client.queryArray(
      "UPDATE users SET refresh_token = $1 WHERE id = $2",
      [refreshToken, user.id],
    );

    await setAccessCookie(ctx, accessToken);
    await setRefreshCookie(ctx, refreshToken);

    ctx.response.status = 200;
    ctx.response.body = { message: "Login successful", user: { id: user.id, name: user.name, role: user.role } };
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
      { id: number; name: string; refresh_token: string | null; role: string }
    >(
      "SELECT id, name, refresh_token, role FROM users WHERE id = $1",
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
    const newAccess = await signAccessToken(user.id, user.name, user.role);
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

/** POST /change-password  { currentPassword, newPassword }  (auth required) */
router.post("/change-password", authMiddleware, async (ctx) => {
  let body: Record<string, unknown> | undefined;
  try {
    body = await ctx.request.body.json();
  } catch {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid JSON body" };
    return;
  }

  const { currentPassword, newPassword } = body ?? {};

  if (!currentPassword || !newPassword ||
      typeof currentPassword !== "string" || typeof newPassword !== "string") {
    ctx.response.status = 400;
    ctx.response.body = { error: "currentPassword and newPassword are required" };
    return;
  }

  if ((newPassword as string).length < 6) {
    ctx.response.status = 400;
    ctx.response.body = { error: "New password must be at least 6 characters" };
    return;
  }

  const userId = Number(ctx.state.user.sub);

  let client: Client;
  try {
    client = await getClient();
  } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }

  try {
    // Fetch current stored hash
    const result = await client.queryObject<{ password: string }>(
      "SELECT password FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const storedHash = result.rows[0].password;
    const valid = await comparePassword(currentPassword as string, storedHash);

    if (!valid) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Mot de passe actuel incorrect" };
      return;
    }

    // Hash and store the new password
    const newHash = await hashPassword(newPassword as string);
    await client.queryArray(
      "UPDATE users SET password = $1 WHERE id = $2",
      [newHash, userId]
    );

    ctx.response.status = 200;
    ctx.response.body = { message: "Password updated successfully" };
  } catch (err) {
    console.error("POST /change-password error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** POST /profile – update biography of logged user */
router.post("/profile", authMiddleware, async (ctx) => {
  let body: Record<string, unknown> | undefined;
  try {
    body = await ctx.request.body.json();
  } catch {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid JSON body" };
    return;
  }
  const { bio } = body ?? {};
  if (typeof bio !== "string") {
    ctx.response.status = 400;
    ctx.response.body = { error: "bio must be a string" };
    return;
  }

  const userId = Number((ctx.state as Record<string, Record<string, string>>).user.sub);
  let client: Client;
  try {
    client = await getClient();
  } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    await client.queryArray(
      "UPDATE users SET bio = $1 WHERE id = $2",
      [bio, userId]
    );
    ctx.response.status = 200;
    ctx.response.body = { message: "Profile updated successfully" };
  } catch (err) {
    console.error("POST /profile error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** GET /users/:username/profile – get public profile information */
router.get("/users/:username/profile", authMiddleware, async (ctx) => {
  const username = ctx.params.username;
  let client: Client;
  try {
    client = await getClient();
  } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    // 1. Get user details
    const userResult = await client.queryObject<{
      id: number;
      name: string;
      role: string;
      bio: string | null;
    }>(
      "SELECT id, name, role, bio FROM users WHERE name = $1",
      [username]
    );

    if (userResult.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const user = userResult.rows[0];

    // 2. Count joined events
    const eventsResult = await client.queryObject<{ count: string }>(
      "SELECT COUNT(*) as count FROM event_participants WHERE user_id = $1",
      [user.id]
    );

    // 3. Count followed categories
    const categoriesResult = await client.queryObject<{ count: string }>(
      "SELECT COUNT(*) as count FROM user_categories WHERE user_id = $1",
      [user.id]
    );

    ctx.response.status = 200;
    ctx.response.body = {
      username: user.name,
      role: user.role,
      bio: user.bio ?? "",
      stats: {
        eventsCount: Number(eventsResult.rows[0].count),
        categoriesCount: Number(categoriesResult.rows[0].count)
      }
    };
  } catch (err) {
    console.error("GET /users/:username/profile error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
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
    const userId = Number(ctx.state.user.sub);
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
       WHERE r.slug = 'general'
          OR r.slug IN (
            SELECT category_slug FROM user_categories WHERE user_id = $1
          )
          OR r.slug IN (
            SELECT 'event-' || event_id FROM event_participants WHERE user_id = $1
          )
       ORDER BY last_message_at DESC NULLS LAST`,
       [userId]
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

    // Inverser pour l'ordre chronologique
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

// ── Message Admin Routes ───────────────────────────────────────────────────────

/** DELETE /messages/:id — delete a message (admin only) */
router.delete("/messages/:id", adminMiddleware, async (ctx) => {
  const messageId = Number(ctx.params.id);

  let client: Client;
  try { client = await getClient(); } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    // Check message exists
    const msg = await client.queryObject<{ id: number; room_id: number }>(
      "SELECT id, room_id FROM messages WHERE id = $1",
      [messageId]
    );
    if (msg.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Message not found" };
      return;
    }

    // Delete the message
    await client.queryArray(
      "DELETE FROM messages WHERE id = $1",
      [messageId]
    );

    // Get the room slug to notify clients
    const room = await client.queryObject<{ slug: string }>(
      "SELECT slug FROM rooms WHERE id = $1",
      [msg.rows[0].room_id]
    );

    ctx.response.status = 200;
    ctx.response.body = { message: "Message deleted" };

    // Broadcast deletion to all users in the room
    if (room.rows.length > 0) {
      broadcastToRoom(room.rows[0].slug, { type: "message_deleted", id: messageId });
    }
  } catch (err) {
    console.error("DELETE /messages/:id error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

// ── Categories REST ──────────────────────────────────────────────────────────

/** GET /categories/followed */
router.get("/categories/followed", authMiddleware, async (ctx) => {
  let client: Client;
  try {
    client = await getClient();
  } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    const userId = Number(ctx.state.user.sub);
    const result = await client.queryObject<{ category_slug: string }>(
      "SELECT category_slug FROM user_categories WHERE user_id = $1",
      [userId]
    );
    ctx.response.status = 200;
    ctx.response.body = result.rows.map(r => r.category_slug);
  } catch (err) {
    console.error("GET /categories/followed error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** POST /categories/:slug/follow */
router.post("/categories/:slug/follow", authMiddleware, async (ctx) => {
  const slug = ctx.params.slug;
  let client: Client;
  try {
    client = await getClient();
  } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    const userId = Number(ctx.state.user.sub);
    await client.queryArray(
      "INSERT INTO user_categories (user_id, category_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [userId, slug]
    );
    ctx.response.status = 200;
    ctx.response.body = { message: "Category followed" };
  } catch (err) {
    console.error("POST /categories/:slug/follow error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});

/** DELETE /categories/:slug/follow */
router.delete("/categories/:slug/follow", authMiddleware, async (ctx) => {
  const slug = ctx.params.slug;
  let client: Client;
  try {
    client = await getClient();
  } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    const userId = Number(ctx.state.user.sub);
    await client.queryArray(
      "DELETE FROM user_categories WHERE user_id = $1 AND category_slug = $2",
      [userId, slug]
    );
    ctx.response.status = 200;
    ctx.response.body = { message: "Category unfollowed" };
  } catch (err) {
    console.error("DELETE /categories/:slug/follow error:", err);
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

function broadcastUsernames() {
  const generalRoom = roomClients.get("general");
  if (!generalRoom) return;

  const usernames = Array.from(generalRoom)
    .map((client) => client.user?.name)
    .filter(Boolean);

  // Send the "update_users" event using our existing 'type' structure
  broadcastToRoom("general", { type: "update_users", usernames });
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
    
    // Broadcast the updated users list
    broadcastUsernames();
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
    broadcastUsernames();
  };

  ws.onerror = (err) => {
    console.error("WS error:", err);
    removeFromAllRooms(ws);
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

  // Reject events with a past date
  const eventDateParsed = new Date(event_date as string);
  if (isNaN(eventDateParsed.getTime())) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Format de date invalide" };
    return;
  }
  if (eventDateParsed <= new Date()) {
    ctx.response.status = 400;
    ctx.response.body = { error: "La date de l'événement doit être dans le futur" };
    return;
  }

  const userId = Number(ctx.state.user.sub);
  const isAdmin = ctx.state.user.role === "admin";
  let client: Client;
  try { client = await getClient(); } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    const result = await client.queryObject<{ id: number }>(
      `INSERT INTO events (title, sport, location, event_date, capacity, creator_id, is_automatic)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [title, sport, location, event_date, capacity, userId, isAdmin]
    );
    const eventId = result.rows[0].id;

    // Auto-join the creator
    await client.queryArray(
      "INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [eventId, userId]
    );

    // Create chat room for this event in the main rooms table
    await client.queryArray(
      "INSERT INTO rooms (name, slug) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [title, `event-${eventId}`]
    );

    ctx.response.status = 201;
    ctx.response.body = { message: "Event created", id: eventId };

    // Broadcast update to all users
    broadcastToRoom("general", { type: "data_updated" });
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

    // Create chat room for this event if it doesn't exist in the main rooms table
    await client.queryArray(
      "INSERT INTO rooms (name, slug) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [ev.rows[0].title, `event-${eventId}`]
    );

    ctx.response.status = 200;
    ctx.response.body = { message: "Joined event" };

    // Broadcast update to all users
    broadcastToRoom("general", { type: "data_updated" });
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

    ctx.response.status = 200;
    ctx.response.body = { message: "Left event" };

    // Broadcast update to all users
    broadcastToRoom("general", { type: "data_updated" });
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

/** DELETE /events/:id — delete an event (admin only) */
router.delete("/events/:id", adminMiddleware, async (ctx) => {
  const eventId = Number(ctx.params.id);

  let client: Client;
  try { client = await getClient(); } catch {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
    return;
  }
  try {
    // Check event exists
    const ev = await client.queryObject<{ id: number; title: string }>(
      "SELECT id, title FROM events WHERE id = $1", [eventId]
    );
    if (ev.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Event not found" };
      return;
    }

    // Delete the associated chat room first (CASCADE will handle messages)
    await client.queryArray(
      "DELETE FROM rooms WHERE slug = $1",
      [`event-${eventId}`]
    );

    // Delete the event (CASCADE will delete event_participants)
    await client.queryArray(
      "DELETE FROM events WHERE id = $1",
      [eventId]
    );

    ctx.response.status = 200;
    ctx.response.body = { message: "Event deleted" };

    // Broadcast update to all users
    broadcastToRoom("general", { type: "data_updated" });
  } catch (err) {
    console.error("DELETE /events/:id error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  } finally {
    await client.end();
  }
});


