import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2] || "restore";
const dataDir = path.resolve(process.env.DATA_DIR || "data");
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const supabaseBucket = process.env.SUPABASE_BUCKET || "ahu-report-generator";
const supabasePrefix = (process.env.SUPABASE_DATA_PREFIX || "data").replace(/^\/+|\/+$/g, "");

function enabled() {
  return Boolean(supabaseUrl && supabaseKey && supabaseBucket && supabasePrefix);
}

function objectUrl(relativePath) {
  const objectPath = [supabaseBucket, supabasePrefix, ...relativePath.split("/").filter(Boolean)]
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${supabaseUrl}/storage/v1/object/${objectPath}`;
}

function headers(contentType) {
  return {
    apikey: supabaseKey,
    authorization: `Bearer ${supabaseKey}`,
    ...(contentType ? { "content-type": contentType } : {}),
  };
}

function collectFiles(root, dir = root) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
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

function removeUnlistedFiles(manifestFiles) {
  const keep = new Set(manifestFiles.map((file) => file.path));
  for (const file of collectFiles(dataDir)) {
    if (keep.has(file.path)) continue;
    fs.rmSync(path.join(dataDir, file.path), { force: true });
  }
}

async function uploadObject(relativePath, body, contentType) {
  const response = await fetch(objectUrl(relativePath), {
    method: "PUT",
    headers: { ...headers(contentType), "x-upsert": "true", "cache-control": "no-store" },
    body,
  });
  if (!response.ok) throw new Error(`Supabase upload failed for ${relativePath}: ${response.status} ${await response.text()}`);
}

async function restore() {
  if (!enabled()) {
    console.log("Supabase data restore skipped: env vars not set.");
    return;
  }
  const manifestResponse = await fetch(objectUrl("_manifest.json"), { headers: headers() });
  if (manifestResponse.status === 404) {
    console.log("Supabase data manifest not found; using bundled/local data.");
    return;
  }
  if (!manifestResponse.ok) throw new Error(`Supabase manifest restore failed: ${manifestResponse.status} ${await manifestResponse.text()}`);
  const manifest = await manifestResponse.json();
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  fs.mkdirSync(dataDir, { recursive: true });
  removeUnlistedFiles(files);
  for (const file of files) {
    if (!file?.path || file.path.includes("..")) throw new Error(`Unsafe manifest path: ${file?.path}`);
    const response = await fetch(objectUrl(file.path), { headers: headers() });
    if (!response.ok) throw new Error(`Supabase file restore failed for ${file.path}: ${response.status} ${await response.text()}`);
    const target = path.resolve(dataDir, file.path);
    if (!target.startsWith(dataDir + path.sep) && target !== dataDir) throw new Error(`Unsafe target path: ${file.path}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  }
  console.log(`Supabase data snapshot restored (${files.length} files).`);
}

async function backup() {
  if (!enabled()) {
    console.log("Supabase data backup skipped: env vars not set.");
    return;
  }
  const files = collectFiles(dataDir);
  for (const file of files) {
    await uploadObject(file.path, fs.readFileSync(path.join(dataDir, file.path)), "application/octet-stream");
  }
  await uploadObject(
    "_manifest.json",
    Buffer.from(JSON.stringify({ uploadedAt: new Date().toISOString(), reason: "manual-backup", files }, null, 2)),
    "application/json",
  );
  console.log(`Supabase data snapshot uploaded (${files.length} files).`);
}

if (mode === "backup") await backup();
else await restore();
