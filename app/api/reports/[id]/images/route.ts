import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { authorize, routeError } from "@/lib/api";
import { createId } from "@/lib/auth";
import { storageRoot, publicReport, updateReport } from "@/lib/db";
import { mediaSignature } from "@/lib/security";
import { PHOTO_SLOTS, SLOT_MAX, type PhotoSlotKey } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;
type Context = { params: Promise<{ id: string }> };
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params; const auth = authorize(request, id); if (auth.error) return auth.error;
    const form = await request.formData(); const file = form.get("file"); const slot = form.get("slot") as PhotoSlotKey;
    if (!(file instanceof File) || !PHOTO_SLOTS.includes(slot)) return NextResponse.json({ error: "上传参数无效" }, { status: 400 });
    if (!allowed.has(file.type) || file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "仅支持20MB以内的 JPG、PNG、WebP 或 HEIC 图片" }, { status: 400 });
    const report = publicReport(auth.row);
    const slotMax = SLOT_MAX[slot]; if (report.data.photos.filter((p) => p.slot === slot).length >= slotMax) return NextResponse.json({ error: `该照片区最多${slotMax}张图片` }, { status: 400 });
    const imageId = createId(); const dir = path.join(storageRoot, id, "images"); fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${imageId}.jpg`);
    const result = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "error" }).rotate().resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toFile(target);
    const url = `/api/media/${id}/${imageId}?sig=${encodeURIComponent(mediaSignature(id, imageId))}`;
    report.data.photos.push({ id:imageId, slot, url, filename:file.name, crop:{ x:50, y:50, zoom:1 }, width:result.width, height:result.height });
    updateReport(id, report.data);
    return NextResponse.json({ photo: report.data.photos.at(-1) }, { status: 201 });
  } catch (error) { return routeError(error); }
}
