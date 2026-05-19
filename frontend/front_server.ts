import { Application } from "https://deno.land/x/oak@v17.1.6/mod.ts";
import { join } from "https://deno.land/std@0.224.0/path/join.ts";

const app = new Application();
const ROOT = join(Deno.cwd(), "src");

app.use(async (ctx) => {
  try {
    await ctx.send({
      root: ROOT,
      index: "login.html",
    });
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


const options: Record<string, unknown> = { port: PORT };

if (Deno.args.length >= 3) {
  options.secure = true;
  options.cert = await Deno.readTextFile(Deno.args[1]);
  options.key = await Deno.readTextFile(Deno.args[2]);
  console.log(`SSL conf ready (use https)`);
}

await app.listen(options);