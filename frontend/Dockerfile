FROM denoland/deno:alpine-2.0.6

WORKDIR /app

# Prefer not to run as root.
USER deno

# Copy the source code
COPY . .

# Cache dependencies
RUN deno cache front_server.ts

# Start the server on port 8080
CMD ["run", "--allow-net", "--allow-read", "front_server.ts", "8080"]
