FROM denoland/deno:alpine-2.0.6

WORKDIR /app

# Prefer not to run as root.
USER deno

# Copy the source code
COPY . .

# Cache dependencies
RUN deno cache src/back_server.ts

# Start the server on port 8081
CMD ["run", "--allow-net", "--allow-read", "src/back_server.ts", "8081"]
