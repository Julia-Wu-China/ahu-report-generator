import { createHmac, timingSafeEqual } from "node:crypto";

function secret() { return process.env.MEDIA_SECRET ?? "change-this-media-secret-in-production"; }
export function mediaSignature(reportId: string, imageId: string) {
  return createHmac("sha256", secret()).update(`${reportId}:${imageId}`).digest("base64url");
}
export function validMediaSignature(reportId: string, imageId: string, signature: string) {
  const a = Buffer.from(mediaSignature(reportId, imageId)); const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
