import { Application } from "https://deno.land/x/oak@v17.1.6/mod.ts";
import { join } from "https://deno.land/std@0.224.0/path/join.ts";

const app = new Application();
// In Docker, WORKDIR=/app and frontend/ files are copied directly into /app
// So src/ is directly under cwd. Locally, run from the frontend/ directory.
const ROOT = join(Deno.cwd(), "src");

// Map known content types
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

app.use(async (ctx) => {
  const reqPath = ctx.request.url.pathname;
  // Serve login.html at root — strip leading / so join() builds a relative path
  const filePath = reqPath === "/" ? "login.html" : reqPath.slice(1);
  const fullPath = join(ROOT, filePath);

  try {
    const content = await Deno.readFile(fullPath);
    const ext = fullPath.slice(fullPath.lastIndexOf("."));
    ctx.response.headers.set("Content-Type", MIME[ext] ?? "application/octet-stream");
    ctx.response.body = content;
  } catch {
    ctx.response.status = 404;
    ctx.response.body = "404 File not found";
  }
});

if (Deno.args.length < 1) {
  console.log(`Usage: $ deno run --allow-net --allow-read=./ server.ts PORT [CERT_PATH KEY_PATH]`);
  Deno.exit();
}

const PORT = Number(Deno.args[0]);

console.log(`Oak static server running on port ${PORT}, root=${ROOT}`);

if (Deno.args.length >= 3) {
  console.log(`SSL conf ready (use https)`);
  await app.listen({
    port: PORT,
    cert: await Deno.readTextFile(Deno.args[1]),
    key: await Deno.readTextFile(Deno.args[2]),
  });
} else {
  await app.listen({ port: PORT });
}
