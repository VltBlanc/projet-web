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

/** POST /register  { username, password } */
router.post("/register", async (ctx) => {
  const body = await ctx.request.body.json();
  const { username, password } = body ?? {}; // On récupère 'username' envoyé par le JS

  if (!username || !password) {
    ctx.response.status = 400;
    ctx.response.body = { error: "username and password are required" };
    return;
  }

  const client = await getClient();
  try {
    // On insère uniquement name et password
    await client.queryArray(
      "INSERT INTO users (name, password) VALUES ($1, $2)",
      [username, password],
    );
    ctx.response.status = 201;
    ctx.response.body = { message: "User created" };
  } catch (e: unknown) {
    ctx.response.status = 500;
    ctx.response.body = { error: e instanceof Error ? e.message : String(e) };
  } finally {
    await client.end();
  }
});

/** POST /login  { username, password } */
router.post("/login", async (ctx) => {
  const body = await ctx.request.body.json();
  const { username, password } = body ?? {};

  const client = await getClient();
  try {
    // On cherche par NAME et non plus par EMAIL
    const result = await client.queryObject<{ id: number; name: string; password: string }>(
      "SELECT * FROM users WHERE name = $1",
      [username],
    );

    if (result.rows.length === 0) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid credentials" };
      return;
    }

    const user = result.rows[0];
    if (user.password !== password) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid credentials" };
      return;
    }

    ctx.response.status = 200;
    ctx.response.body = { message: "Login successful", user: { id: user.id, name: user.name } };
  } finally {
    await client.end();
  }
});


/** GET /health  – used by Docker HEALTHCHECK */
router.get("/health", (ctx) => {
  ctx.response.status = 200;
  ctx.response.body = { status: "ok" };
});
