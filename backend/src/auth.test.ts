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
