import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".doc",
  ".docx",
  ".txt",
  ".csv",
]);

const resolveRoot = (): string => {
  const configured = process.env.STORAGE_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), "private", "uploads");
};

export const getStorageRoot = (): string => resolveRoot();

const toSafeRelative = (relativePath: string): string => {
  const clean = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const normalized = path.posix.normalize(clean);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("Invalid file path.");
  }
  return normalized;
};

export const saveFile = async (args: {
  bytes: Buffer | Uint8Array;
  filename: string;
  folder?: string;
}): Promise<string> => {
  if (process.env.STORAGE_DRIVER === "blob") {
    throw new Error(
      "Blob storage is not configured yet. Set STORAGE_DRIVER to local.",
    );
  }
  const data =
    Buffer.isBuffer(args.bytes) ? args.bytes : Buffer.from(args.bytes);
  if (data.length === 0) {
    throw new Error("Empty files are not allowed.");
  }
  if (data.length > MAX_FILE_BYTES) {
    throw new Error("File is too large. Limit is 5 MB.");
  }
  const ext = path.extname(args.filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error("File type is not allowed.");
  }
  const folder = args.folder ? toSafeRelative(args.folder) : "general";
  const base =
    path
      .basename(args.filename)
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .slice(0, 80) || "file";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}`;
  const relative = path.posix.join(folder, unique);
  const root = resolveRoot();
  const absolute = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, data);
  return relative;
};

export const readStoredFile = async (relativePath: string): Promise<Buffer> => {
  const safe = toSafeRelative(relativePath);
  const root = resolveRoot();
  const absolute = path.join(root, ...safe.split("/"));
  if (!absolute.startsWith(root)) {
    throw new Error("Invalid file path.");
  }
  return readFile(absolute);
};

export const deleteStoredFile = async (relativePath: string): Promise<void> => {
  const safe = toSafeRelative(relativePath);
  const root = resolveRoot();
  const absolute = path.join(root, ...safe.split("/"));
  if (!absolute.startsWith(root)) {
    throw new Error("Invalid file path.");
  }
  await rm(absolute, { force: true });
};
