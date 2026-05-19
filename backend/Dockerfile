FROM denoland/deno:alpine-2.0.6

WORKDIR /app

RUN apk add --no-cache curl

RUN addgroup -S app && adduser -S app -G app

# Copy the source code
COPY . .

# Remove any host lockfile that may have an incompatible format
RUN rm -f deno.lock

# Cache dependencies
RUN deno cache src/back_server.ts

USER app

# Start the server on port 8081
CMD ["run", "--no-lock", "--allow-net", "--allow-read", "--allow-env", "src/back_server.ts", "8081"]
