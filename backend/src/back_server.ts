import { Application, Router } from "https://deno.land/x/oak@v17.1.6/mod.ts"
import { create, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const router = new Router();
const app = new Application();
const ORIGIN = "http://localhost:8080";

const secretKey = await crypto.subtle.generateKey(
  { name: "HMAC", hash: "SHA-512" },
  true,
  ["sign", "verify"]
);

const connections: WebSocket[] = [];
const tokens: { [key: string]: string } = {};

async function get_hash(password: string): Promise<string> {
  const saltRounds = 10;
  const salt = await bcrypt.genSalt(saltRounds);  // Generate the salt manually
  return await bcrypt.hash(password, salt);  // Pass the salt to the hash function
}

function removeTokenByUser(user: string) {
  for (const token in tokens) {
    if (tokens[token] === user) {
      delete tokens[token];
      break;
    }
  }
}

// Function to check the tokens received by websocket messages
const is_authorized = async (auth_token: string) => {
  if (!auth_token) {
    return false;
  }
  if (auth_token in tokens) {
    try {
      const payload = await verify(auth_token, secretKey);
      if (payload.userName === tokens[auth_token]) {
        return true;
      }
    } catch {
      console.log("verify token failed");
      return false;
    }
  }
  console.log("Unknown token");
  return false;
}// Lecture directe du cookie depuis les headers HTTP
function getCookieFromHeaders(headers: Headers, name: string): string | null {
  const cookieHeader = headers.get("Cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    if (key === name) return value;
  }
  return null;
}
function notifyAllUsers(json: any) {
  connections.forEach((client) => {
    client.send(JSON.stringify(json));
  });
}

const users = [
  { id: '1', username: 'Superman', password_hash: await get_hash('Superman'), last_action_date: 0 },
  { id: '2', username: 'Mickey_Mouse', password_hash: await get_hash('Mickey_Mouse'), last_action_date: 0 },
  { id: '3', username: 'James_Bond', password_hash: await get_hash('James_Bond'), last_action_date: 0 },
  { id: '25', username: 'Popeye', password_hash: await get_hash('Popeye'), last_action_date: 0 },
  { id: '26', username: 'Tarzan', password_hash: await get_hash('Tarzan'), last_action_date: 0 },
  { id: '27', username: 'Forrest_Gump', password_hash: await get_hash('Forrest_Gump'), last_action_date: 0 },
  { id: '28', username: 'Hannibal_Lector', password_hash: await get_hash('Hannibal_Lector'), last_action_date: 0 },
  { id: '29', username: 'Big_Bird', password_hash: await get_hash('Big_Bird'), last_action_date: 0 },
  { id: '30', username: 'Holden_Caulfield', password_hash: await get_hash('Holden_Caulfield'), last_action_date: 0 },
  { id: '31', username: 'Tony_Montana', password_hash: await get_hash('Tony_Montana'), last_action_date: 0 },
  { id: '32', username: 'Tony_Soprano', password_hash: await get_hash('Tony_Soprano'), last_action_date: 0 },
  { id: '33', username: 'The_Terminator', password_hash: await get_hash('The_Terminator'), last_action_date: 0 },
  { id: '34', username: 'Jon_Snow', password_hash: await get_hash('Jon_Snow'), last_action_date: 0 },
  { id: '35', username: 'Norman_Bates', password_hash: await get_hash('Norman_Bates'), last_action_date: 0 },
  { id: '36', username: 'Charles_Foster_Kane', password_hash: await get_hash('Charles_Foster_Kane'), last_action_date: 0 },
  { id: '37', username: 'Marty_McFly', password_hash: await get_hash('Marty_McFly'), last_action_date: 0 },
  { id: '38', username: 'Rick_Blaine', password_hash: await get_hash('Rick_Blaine'), last_action_date: 0 },
  { id: '39', username: 'Man_With_No_Name', password_hash: await get_hash('Man_With_No_Name'), last_action_date: 0 },
  { id: '40', username: 'Charlie_Brown', password_hash: await get_hash('Charlie_Brown'), last_action_date: 0 },
  { id: '41', username: 'ET', password_hash: await get_hash('ET'), last_action_date: 0 }
];

router.get("/", async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(501);
  }

  // Lire le cookie AVANT l'upgrade directement depuis les headers
  const auth_token = getCookieFromHeaders(ctx.request.headers, "auth_token");

  if (!auth_token || !(await is_authorized(auth_token))) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }

  const owner = tokens[auth_token];
  const ws = ctx.upgrade();

  connections.push(ws);
  console.log(`+ websocket connected (${connections.length})`);

  ws.onerror = (_error) => {
    const index = connections.indexOf(ws);
    if (index !== -1) {
      connections.splice(index, 1);
    }
    console.log(`- websocket error`);
  };

  ws.onmessage = async (event) => {
    const message = event.data;
    const data = JSON.parse(message);

    const user = users.find((u) => u.username === owner);

    // Check if user exists, if not send an error and disconnect the websocket
    if (!user) {
      console.log("? user in token doesn't exist");
      ws.close();
      return;
    }

    if ("message" in data) {
      const msg = data.message
      if (msg.length > 35) {
        ws.send(JSON.stringify({ to_long: 35 }));
        return
      }
      if (msg.length == 0) {
        return
      }

      notifyAllUsers({ message: msg, owner: owner });
      return
    }
  };

  ws.onclose = () => {
    const index = connections.indexOf(ws);
    if (index !== -1) {
      connections.splice(index, 1);
    }
    console.log(`- websocket disconnected (${connections.length})`);
  };
});

router.post("/login", async (ctx) => {
  const { username, password } = await ctx.request.body.json();

  const user = users.find((u) => u.username === username);
  if (!user) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid username or password" };
    return;
  }

  const result = await bcrypt.compare(password, user.password_hash);
  if (!result) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid username or password" };
    return;
  }

  const token = await create({ alg: "HS512", typ: "JWT" }, { userName: user.username }, secretKey);
  removeTokenByUser(username);
  tokens[token] = username;

  ctx.response.headers.set("Set-Cookie", `auth_token=${token}; Max-Age=3600; HttpOnly; Path=/; SameSite=Lax`);

  // Return success
  ctx.response.status = 200;
  ctx.response.body = { success: true };
});

if (Deno.args.length < 1) {
  console.log(`Usage: $ deno run --allow-net server.ts PORT [CERT_PATH KEY_PATH]`);
  Deno.exit();
}

const options = { port: Deno.args[0] }

if (Deno.args.length >= 3) {
  options.secure = true;
  options.cert = await Deno.readTextFile(Deno.args[1]);
  options.key = await Deno.readTextFile(Deno.args[2]);
  console.log(`SSL conf ready (use https)`);
}

console.log(`Oak back server running on port ${options.port}`);

app.use(
  oakCors({
    origin: `${ORIGIN}`, // Allow requests from this origin
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Specify allowed methods
    allowedHeaders: ["Content-Type", "Authorization"], // Specify allowed headers
    credentials: true, // Allow credentials like cookies
  })
);
app.use(router.routes());
app.use(router.allowedMethods())
await app.listen(options);
