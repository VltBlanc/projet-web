import { Application, Router } from "https://deno.land/x/oak@v17.1.6/mod.ts"

const app = new Application();
const ROOT = `${Deno.cwd()}/`;

app.use(async (ctx) => {
  try {
    await ctx.send({
      root: ROOT,
      index: "public/index.html",
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

console.log(`Oak static server running on port ${PORT} for the files in ${ROOT}`);

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
