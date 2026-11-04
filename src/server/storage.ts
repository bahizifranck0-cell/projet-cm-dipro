import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { ValidationError } from "./auth/actor";

// Fichiers privés : jamais servis directement, uniquement via une route qui contrôle les droits.
export const STORAGE_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "storage");

const IMAGE_SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
];

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Enregistre une photo après vérification du contenu réel (pas seulement de l'extension). */
export async function savePhoto(folder: string, data: Buffer): Promise<string> {
  if (data.length === 0) throw new ValidationError("Le fichier photo est vide.", "photo");
  if (data.length > MAX_PHOTO_BYTES) throw new ValidationError("La photo dépasse 5 Mo.", "photo");
  const kind = IMAGE_SIGNATURES.find((s) => s.test(data));
  if (!kind) throw new ValidationError("Format de photo non accepté (JPEG, PNG ou WebP).", "photo");
  const rel = path.posix.join(folder, `${Date.now()}-${randomBytes(6).toString("hex")}.${kind.ext}`);
  const abs = resolveSafe(rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return rel;
}

export async function readStored(rel: string) {
  const abs = resolveSafe(rel);
  const data = await readFile(abs);
  const kind = IMAGE_SIGNATURES.find((s) => s.test(data));
  return { data, mime: kind?.mime ?? "application/octet-stream" };
}

function resolveSafe(rel: string) {
  const abs = path.resolve(STORAGE_DIR, rel);
  if (!abs.startsWith(STORAGE_DIR + path.sep)) throw new Error("Chemin de fichier refusé.");
  return abs;
}
