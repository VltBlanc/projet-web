import { assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  hashPassword, 
  comparePassword, 
  signAccessToken, 
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from "./route.ts";

Deno.test("Security: Password Hashing Logic", async () => {
  const password = "test-password-123";
  const hash = await hashPassword(password);
  
  assertExists(hash);
  assertEquals(await comparePassword(password, hash), true);
  assertEquals(await comparePassword("wrong-password", hash), false);
});

Deno.test("Security: JWT Access Token Logic", async () => {
  const userId = 123;
  const username = "testuser";
  
  const token = await signAccessToken(userId, username);
  assertExists(token);
  
  const { payload } = await verifyAccessToken(token);
  assertEquals(payload.sub, String(userId));
  assertEquals(payload.name, username);
});

Deno.test("Security: JWT Refresh Token Logic", async () => {
  const userId = 456;
  
  const token = await signRefreshToken(userId);
  assertExists(token);
  
  const { payload } = await verifyRefreshToken(token);
  assertEquals(payload.sub, String(userId));
});

Deno.test("Security: Invalid JWT Handling", async () => {
  const invalidToken = "not.a.valid.token";
  await assertRejects(async () => {
    await verifyAccessToken(invalidToken);
  });
});

import { Context } from "https://deno.land/x/oak@v17.1.6/mod.ts";
import { authMiddleware, adminMiddleware } from "./route.ts";

function createMockContext(token: string | null): Context {
  const cookiesMap = new Map<string, string>();
  if (token) {
    cookiesMap.set("access_token", token);
  }
  
  return {
    cookies: {
      get: (name: string) => Promise.resolve(cookiesMap.get(name)),
    },
    state: {} as Record<string, unknown>,
    response: {
      status: 200,
      body: null as unknown,
    },
    request: {
      secure: false,
    }
  } as unknown as Context;
}

Deno.test("Security: authMiddleware with valid token", async () => {
  const token = await signAccessToken(123, "testuser", "user");
  const ctx = createMockContext(token);
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
    return Promise.resolve();
  };

  await authMiddleware(ctx, next);

  assertEquals(nextCalled, true);
  assertEquals(ctx.state.user.name, "testuser");
  assertEquals(ctx.state.user.role, "user");
});

Deno.test("Security: authMiddleware with no token", async () => {
  const ctx = createMockContext(null);
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
    return Promise.resolve();
  };

  await authMiddleware(ctx, next);

  assertEquals(nextCalled, false);
  assertEquals(ctx.response.status, 401);
});

Deno.test("Security: authMiddleware with invalid token", async () => {
  const ctx = createMockContext("invalid-token-value");
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
    return Promise.resolve();
  };

  await authMiddleware(ctx, next);

  assertEquals(nextCalled, false);
  assertEquals(ctx.response.status, 401);
});

Deno.test("Security: adminMiddleware with admin user", async () => {
  const token = await signAccessToken(123, "adminuser", "admin");
  const ctx = createMockContext(token);
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
    return Promise.resolve();
  };

  await adminMiddleware(ctx, next);

  assertEquals(nextCalled, true);
  assertEquals(ctx.state.user.role, "admin");
});

Deno.test("Security: adminMiddleware with non-admin user", async () => {
  const token = await signAccessToken(123, "regularuser", "user");
  const ctx = createMockContext(token);
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
    return Promise.resolve();
  };

  await adminMiddleware(ctx, next);

  assertEquals(nextCalled, false);
  assertEquals(ctx.response.status, 403);
});

