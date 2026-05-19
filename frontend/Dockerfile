FROM denoland/deno:alpine-2.0.6

WORKDIR /app

# Copy the source code
COPY . .

# Remove any host lockfile that may have an incompatible format
RUN rm -f deno.lock

# Cache dependencies (run as root so Deno can write node_modules/.deno)
RUN deno cache front_server.ts

# Prefer not to run as root.
USER deno

# Start the server on port 8080
CMD ["run", "--no-lock", "--allow-net", "--allow-read", "front_server.ts", "8080"]
