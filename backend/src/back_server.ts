import { Application } from "https://deno.land/x/oak@v17.1.6/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

import { router, initDb } from "./route.ts";

// Port is passed as first CLI argument
if (Deno.args.length < 1) {
  console.error("Usage: back_server.ts PORT [CERT KEY]");
  Deno.exit(1);
}
const PORT = Number(Deno.args[0]);

// CORS origin from env, fallback to localhost:8080
const ORIGIN = Deno.env.get("FRONTEND_ORIGIN") ?? "http://localhost:8080";

// Initialize the application
const app = new Application();

// CORS
app.use(
  oakCors({
    origin: ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Request logger
app.use(async (ctx, next) => {
  console.log(`${ctx.request.method} ${ctx.request.url.pathname}`);
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

// Initialise DB schema before starting the server
await initDb();

// Start the server
console.log(`Server is listening on ${PORT}`);
console.log(`CORS allows origin ${ORIGIN}`);

const options: Record<string, unknown> = { port: PORT, hostname: "0.0.0.0" };

if (Deno.args.length >= 3) {
  options.secure = true;
  options.cert = await Deno.readTextFile(Deno.args[1]);
  options.key = await Deno.readTextFile(Deno.args[2]);
  console.log(`SSL conf ready (use https)`);
}

await app.listen(options);