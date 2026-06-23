/**
 * Minimal DEFLATE-aware ZIP patcher for injecting <a:srcRect> crop values
 * into word/document.xml inside a .docx buffer, without any external ZIP library.
 */
import zlib from "node:zlib";
import { promisify } from "node:util";

const inflateRaw = promisify(zlib.inflateRaw);
const deflateRaw = promisify(zlib.deflateRaw);

// ── CRC-32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type SrcRect = { l: number; r: number; t: number; b: number };

// ── XML patcher ───────────────────────────────────────────────────────────────
function applyRects(xml: string, rects: Array<SrcRect | null>): string {
  let idx = 0;
  return xml.replace(/<a:srcRect\/>/g, () => {
    const rect = rects[idx++] ?? null;
    if (!rect || (!rect.l && !rect.r && !rect.t && !rect.b)) return "<a:srcRect/>";
    const parts: string[] = [];
    if (rect.l) parts.push(`l="${rect.l}"`);
    if (rect.r) parts.push(`r="${rect.r}"`);
    if (rect.t) parts.push(`t="${rect.t}"`);
    if (rect.b) parts.push(`b="${rect.b}"`);
    return `<a:srcRect ${parts.join(" ")}/>`;
  });
}

// ── ZIP patcher ───────────────────────────────────────────────────────────────
const EOCD_SIG = 0x06054b50;
const CD_SIG   = 0x02014b50;

export async function patchDocxSrcRects(
  docxBuf: Buffer,
  rects: Array<SrcRect | null>,
): Promise<Buffer> {
  if (!rects.length || rects.every((r) => !r)) return docxBuf;

  // 1. Locate end-of-central-directory
  let eocdPos = -1;
  for (let i = docxBuf.length - 22; i >= Math.max(0, docxBuf.length - 65558); i--) {
    if (docxBuf.readUInt32LE(i) === EOCD_SIG) { eocdPos = i; break; }
  }
  if (eocdPos < 0) return docxBuf;

  const numEntries = docxBuf.readUInt16LE(eocdPos + 8);
  const cdOffset   = docxBuf.readUInt32LE(eocdPos + 16);

  // 2. Scan central directory for word/document.xml
  let tCD = -1, tMethod = 0, tCompSize = 0, tUncompSize = 0, tLocalOff = 0;
  let p = cdOffset;
  for (let e = 0; e < numEntries; e++) {
    if (docxBuf.readUInt32LE(p) !== CD_SIG) break;
    const method    = docxBuf.readUInt16LE(p + 10);
    const compSize  = docxBuf.readUInt32LE(p + 20);
    const uncompSize= docxBuf.readUInt32LE(p + 24);
    const fnLen     = docxBuf.readUInt16LE(p + 28);
    const exLen     = docxBuf.readUInt16LE(p + 30);
    const cmLen     = docxBuf.readUInt16LE(p + 32);
    const localOff  = docxBuf.readUInt32LE(p + 42);
    const fn        = docxBuf.subarray(p + 46, p + 46 + fnLen).toString();
    if (fn === "word/document.xml") {
      tCD = p; tMethod = method; tCompSize = compSize;
      tUncompSize = uncompSize; tLocalOff = localOff;
    }
    p += 46 + fnLen + exLen + cmLen;
  }
  if (tCD < 0) return docxBuf;

  // 3. Find data start after local file header
  const lFnLen   = docxBuf.readUInt16LE(tLocalOff + 26);
  const lExLen   = docxBuf.readUInt16LE(tLocalOff + 28);
  const dataStart = tLocalOff + 30 + lFnLen + lExLen;

  // 4. Decompress
  const compData = docxBuf.subarray(dataStart, dataStart + tCompSize);
  const rawBuf: Buffer = tMethod === 0
    ? Buffer.from(compData)
    : (await inflateRaw(compData) as Buffer);

  // 5. Patch XML
  const patched    = applyRects(rawBuf.toString("utf-8"), rects);
  const patchedBuf = Buffer.from(patched, "utf-8");
  if (patchedBuf.equals(rawBuf)) return docxBuf; // no-op

  // 6. Recompress
  const newComp: Buffer = tMethod === 0
    ? patchedBuf
    : (await deflateRaw(patchedBuf) as Buffer);
  const newCrc     = crc32(patchedBuf);
  const sizeDiff   = newComp.length - tCompSize;

  // 7. Update local file header (copy + patch)
  const localHeader = Buffer.from(docxBuf.subarray(tLocalOff, dataStart));
  localHeader.writeUInt32LE(newCrc,           14);
  localHeader.writeUInt32LE(newComp.length,   18);
  localHeader.writeUInt32LE(patchedBuf.length,22);

  // 8. Rebuild central directory with updated sizes / offsets
  const cdChunks: Buffer[] = [];
  p = cdOffset;
  for (let e = 0; e < numEntries; e++) {
    if (docxBuf.readUInt32LE(p) !== CD_SIG) break;
    const fnLen = docxBuf.readUInt16LE(p + 28);
    const exLen = docxBuf.readUInt16LE(p + 30);
    const cmLen = docxBuf.readUInt16LE(p + 32);
    const eSize = 46 + fnLen + exLen + cmLen;
    const entry = Buffer.from(docxBuf.subarray(p, p + eSize));
    if (p === tCD) {
      entry.writeUInt32LE(newCrc,             16);
      entry.writeUInt32LE(newComp.length,     20);
      entry.writeUInt32LE(patchedBuf.length,  24);
    } else {
      const lo = entry.readUInt32LE(42);
      if (lo > tLocalOff) entry.writeUInt32LE(lo + sizeDiff, 42);
    }
    cdChunks.push(entry);
    p += eSize;
  }
  const newCD = Buffer.concat(cdChunks);

  // 9. Rebuild EOCD
  const eocdBuf = Buffer.from(docxBuf.subarray(eocdPos));
  eocdBuf.writeUInt32LE(newCD.length,         12);
  eocdBuf.writeUInt32LE(cdOffset + sizeDiff,  16);

  return Buffer.concat([
    docxBuf.subarray(0, tLocalOff), // everything before our entry
    localHeader,
    newComp,
    docxBuf.subarray(dataStart + tCompSize, cdOffset), // other entries
    newCD,
    eocdBuf,
  ]);
}
