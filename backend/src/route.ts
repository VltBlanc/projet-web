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
const DB_HOST = Deno.env.get("DB_HOST") ?? "db";
const DB_PASSWORD = Deno.env.get("DB_PASSWORD") ?? "password";
const DB_USER = Deno.env.get("DB_USER") ?? "user";
const DB_NAME = Deno.env.get("DB_NAME") ?? "projet_web";

async function getClient(): Promise<Client> {
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
    sameSite: "strict",
    path: "/",
    maxAge: 15 * 60, // 15 minutes in seconds
  });
}

async function setRefreshCookie(ctx: Context, token: string) {
  ctx.cookies.set("refresh_token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "strict",
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
