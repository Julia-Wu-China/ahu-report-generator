import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { storageRoot } from "@/lib/db";
import { validMediaSignature } from "@/lib/security";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ reportId:string; imageId:string }> }) {
  const { reportId, imageId } = await params; const sig = new URL(request.url).searchParams.get("sig") ?? "";
  if (!validMediaSignature(reportId, imageId, sig)) return new NextResponse("Forbidden", { status: 403 });
  const file = path.join(storageRoot, reportId, "images", `${imageId}.jpg`);
  if (!fs.existsSync(file)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(fs.readFileSync(file), { headers: { "content-type":"image/jpeg", "cache-control":"private, max-age=31536000, immutable" } });
}
