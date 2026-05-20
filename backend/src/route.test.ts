import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hashPassword, comparePassword } from "./route.ts";

Deno.test("Password hashing and comparison", async () => {
  const password = "mySecretPassword";
  const hash = await hashPassword(password);
  
  // Verify correct password
  const isValid = await comparePassword(password, hash);
  assertEquals(isValid, true);
  
  // Verify wrong password
  const isInvalid = await comparePassword("wrongPassword", hash);
  assertEquals(isInvalid, false);
});
