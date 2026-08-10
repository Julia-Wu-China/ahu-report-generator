import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.env.DATA_DIR ?? "data");
const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
const supabaseBucket = process.env.SUPABASE_BUCKET ?? "ahu-report-generator";
const supabasePrefix = (process.env.SUPABASE_DATA_PREFIX ?? "data").replace(/^\/+|\/+$/g, "");

let syncTimer: NodeJS.Timeout | null = null;
let syncInFlight = false;
let syncQueued = false;

type ManifestFile = { path: string; size: number; updatedAt: string };

function supabaseEnabled() {
  return Boolean(supabaseUrl && supabaseKey && supabaseBucket && supabasePrefix);
}

function objectUrl(relativePath: string) {
  const objectPath = [supabaseBucket, supabasePrefix, ...relativePath.split("/").filter(Boolean)]
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${supabaseUrl}/storage/v1/object/${objectPath}`;
}

function headers(contentType?: string) {
  return {
    apikey: supabaseKey,
    authorization: `Bearer ${supabaseKey}`,
    ...(contentType ? { "content-type": contentType } : {}),
  };
}

function collectFiles(root: string, dir = root): ManifestFile[] {
  if (!fs.existsSync(dir)) return [];
  const files: ManifestFile[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(root, full));
      continue;
    }
    if (entry.name.endsWith("-wal") || entry.name.endsWith("-shm")) continue;
    const stat = fs.statSync(full);
    files.push({
      path: path.relative(root, full).replaceAll(path.sep, "/"),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function uploadObject(relativePath: string, body: BodyInit, contentType: string) {
  const response = await fetch(objectUrl(relativePath), {
    method: "PUT",
    headers: { ...headers(contentType), "x-upsert": "true", "cache-control": "no-store" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Supabase upload failed for ${relativePath}: ${response.status} ${await response.text()}`);
  }
}

export async function uploadDataSnapshot(reason = "sync") {
  if (!supabaseEnabled()) return false;
  const files = collectFiles(dataDir);
  await Promise.all(files.map((file) => uploadObject(file.path, fs.readFileSync(path.join(dataDir, file.path)), "application/octet-stream")));
  await uploadObject(
    "_manifest.json",
    Buffer.from(JSON.stringify({ uploadedAt: new Date().toISOString(), reason, files }, null, 2)),
    "application/json",
  );
  console.log(`Supabase data snapshot uploaded: ${reason} (${files.length} files)`);
  return true;
}

export function scheduleDataSnapshotSync(reason = "sync") {
  if (!supabaseEnabled()) return;
  syncQueued = true;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void runQueuedSync(reason);
  }, 1200);
}

async function runQueuedSync(reason: string) {
  if (syncInFlight) return;
  syncInFlight = true;
  while (syncQueued) {
    syncQueued = false;
    try {
      await uploadDataSnapshot(reason);
    } catch (error) {
      console.error(error);
    }
  }
  syncInFlight = false;
}
