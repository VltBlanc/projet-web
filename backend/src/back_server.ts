import { Application } from "https://deno.land/x/oak@v17.1.6/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

import { router, initDb } from "./route.ts";

// Port is passed as first CLI argument (mirrors frontend pattern)
if (Deno.args.length < 1) {
  console.error("Usage: back_server.ts PORT [CERT KEY]");
  Deno.exit(1);
}
const PORT = Number(Deno.args[0]);
// Endpoint variables
const ENV_ORIGIN = Deno.env.get("FRONTEND_ORIGIN");
// Explicit allow-list: env variable + common local dev origins
const ALLOWED_ORIGINS = Array.from(
  new Set(
    [
      ENV_ORIGIN,
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "https://localhost:8080",
      "https://127.0.0.1:8080",
    ].filter((o): o is string => typeof o === "string")
  )
);

// Initialize the application
const app = new Application();

// CORS — explicit allow-list
app.use(
  oakCors({
    origin: (origin) => {
      if (!origin) return true; // Not a CORS request, let it pass through
      if (ALLOWED_ORIGINS.includes(origin)) {
        return origin;
      }
      return ""; // Disallowed origin
    },
    credentials: true, // <--- AJOUTEZ CETTE LIGNE
    optionsSuccessStatus: 200
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
console.log(`CORS allow-list: ${ALLOWED_ORIGINS.join(", ")}`);

if (Deno.args.length >= 3) {
  console.log(`SSL conf ready (use https)`);
  await app.listen({
    port: PORT,
    hostname: "0.0.0.0",
    cert: await Deno.readTextFile(Deno.args[1]),
    key: await Deno.readTextFile(Deno.args[2]),
  });
} else {
  await app.listen({ port: PORT, hostname: "0.0.0.0" });
}
