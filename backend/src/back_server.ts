import { Application } from "https://deno.land/x/oak@v17.1.6/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { router } from "./route.ts";

const PORT = 3000;
// Endpoint variables
const ORIGIN = "http://localhost:8080";

// Initialize the application
const app = new Application();

// Middleware
app.use(
  oakCors({
    origin: `${ORIGIN}`, // Allow requests from this origin
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Specify allowed methods
    allowedHeaders: ["Content-Type", "Authorization"], // Specify allowed headers
    credentials: true, // Allow credentials like cookies
  })
);

app.use(async (ctx, next) => {
  console.log(`${ctx.request.method} ${ctx.request.url.pathname}`);
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

const options: any = { port: PORT };

if (Deno.args.length >= 3) {
  options.secure = true;
  options.cert = await Deno.readTextFile(Deno.args[1]);
  options.key = await Deno.readTextFile(Deno.args[2]);
  console.log(`SSL conf ready (use https)`);
}

// Start the server
console.log(`Server is listening on ${PORT}`);
console.log(`CORS allows origin ${ORIGIN}`);
await app.listen(options);
