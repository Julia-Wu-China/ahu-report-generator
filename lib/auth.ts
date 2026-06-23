import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const createId = () => randomUUID();
export const createToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function tokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashToken(token)); const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}
