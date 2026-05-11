import { Router } from "https://deno.land/x/oak@v17.1.6/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

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
        id       SERIAL PRIMARY KEY,
        name     VARCHAR(255) NOT NULL,
        email    VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL
      )
    `);
    console.log("DB schema ready.");
  } finally {
    await client.end();
  }
}

// ── Router ────────────────────────────────────────────────────────────────────
export const router = new Router();

/** POST /register  { name, email, password } */
router.post("/register", async (ctx) => {
  const body = await ctx.request.body.json();
  const { name, email, password } = body ?? {};

  if (!name || !email || !password) {
    ctx.response.status = 400;
    ctx.response.body = { error: "name, email and password are required" };
    return;
  }

  const client = await getClient();
  try {
    await client.queryArray(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3)",
      [name, email, password],
    );
    ctx.response.status = 201;
    ctx.response.body = { message: "User created" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique")) {
      ctx.response.status = 409;
      ctx.response.body = { error: "Email already in use" };
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: msg };
    }
  } finally {
    await client.end();
  }
});

/** POST /login  { username (= email), password } */
router.post("/login", async (ctx) => {
  const body = await ctx.request.body.json();
  const { username, password } = body ?? {};

  if (!username || !password) {
    ctx.response.status = 400;
    ctx.response.body = { error: "username and password are required" };
    return;
  }

  const client = await getClient();
  try {
    const result = await client.queryObject<{ id: number; name: string; email: string; password: string }>(
      "SELECT * FROM users WHERE email = $1",
      [username],
    );

    if (result.rows.length === 0) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid credentials" };
      return;
    }

    const user = result.rows[0];

    // Plain-text comparison (upgrade to bcrypt when needed)
    if (user.password !== password) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid credentials" };
      return;
    }

    ctx.response.status = 200;
    ctx.response.body = { message: "Login successful", user: { id: user.id, name: user.name, email: user.email } };
  } finally {
    await client.end();
  }
});

/** GET /health  – used by Docker HEALTHCHECK */
router.get("/health", (ctx) => {
  ctx.response.status = 200;
  ctx.response.body = { status: "ok" };
});
