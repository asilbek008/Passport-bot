/**
 * Hujjat rasmlarini diskda saqlash.
 *
 * MUHIM O'ZGARISH: boshida bot rasmni ATAYLAB saqlamasdi. Egasining
 * talabi bo'yicha endi saqlaydi — chunki viza arizasiga pasport skanini
 * ilova qilish kerak. Shuning uchun bu papkada mijozlarning pasport
 * skanlari turadi va u himoyaga muhtoj:
 *
 *   • yozuv o'chirilganda rasmi ham o'chadi (shu modul orqali);
 *   • `RETENTION_DAYS` o'tgach ikkisi ham avtomatik o'chadi;
 *   • papka umumiy kompyuterda yoki ochiq zaxirada qolmasligi kerak.
 *
 * Fayl nomi odam uchun o'qiladigan bo'ladi: `FAMILIYA_ISM_uzb-pasport.jpg`.
 */

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { config } from "./config.ts";

/** Rasm turiga mos kengaytma. */
export function extensionFor(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

/**
 * Guruh nomini papka nomiga aylantiradi. Guruh bo'lmasa `_guruhsiz`.
 * Faqat ASCII — zip va Windows bilan muammo bo'lmasligi uchun.
 */
export function groupFolder(label: string): string {
  const safe = label
    .replace(/[Oo][‘’'`‘’]/g, (m) => (m[0] === "O" ? "O" : "o"))
    .replace(/[Gg][‘’'`‘’]/g, (m) => (m[0] === "G" ? "G" : "g"))
    .replace(/[‘’'`‘’]/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return safe || "_guruhsiz";
}

/**
 * Papka ichidagi yo'lni tekshiradi: `..` bilan tashqariga chiqib
 * ketishning oldini oladi (yo'l qismlari bazadan keladi).
 */
function fullPath(relative: string): string {
  const root = resolve(config.photosDir);
  const full = resolve(root, relative);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`Rasm yo'li papkadan tashqarida: ${relative}`);
  }
  return full;
}

/** Rasmni saqlaydi. Papkalar o'zi yaratiladi. */
export function savePhoto(relative: string, bytes: Uint8Array): void {
  const full = fullPath(relative);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, bytes);
}

/** Rasmni o'qiydi; yo'q bo'lsa `null` (fayl qo'lda o'chirilgan bo'lishi mumkin). */
export function readPhoto(relative: string): Uint8Array | null {
  try {
    const full = fullPath(relative);
    if (!existsSync(full)) return null;
    const buffer = readFileSync(full);
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/** Rasmni o'chiradi. Yo'q bo'lsa jim qaytadi. */
export function deletePhoto(relative: string | null | undefined): void {
  if (!relative) return;
  try {
    rmSync(fullPath(relative), { force: true });
  } catch {
    // Fayl allaqachon yo'q yoki yo'l buzuq — yozuvni o'chirish to'xtamasin
  }
}

/** Bir nechta rasmni o'chiradi (guruh yoki tozalashdan keyin). */
export function deletePhotos(paths: (string | null | undefined)[]): number {
  let removed = 0;
  for (const path of paths) {
    if (!path) continue;
    const full = (() => {
      try {
        return fullPath(path);
      } catch {
        return null;
      }
    })();
    if (full && existsSync(full)) {
      deletePhoto(path);
      removed++;
    }
  }
  return removed;
}

/** Bo'shab qolgan guruh papkasini olib tashlaydi. */
export function removeGroupFolder(label: string): void {
  try {
    rmSync(join(resolve(config.photosDir), groupFolder(label)), {
      recursive: true,
      force: true,
    });
  } catch {
    // Papka yo'q bo'lsa ham muammo emas
  }
}

/**
 * Yozuv uchun rasm yo'lini yasaydi: `<guruh>/<FAMILIYA_ISM_turi>.<kengaytma>`.
 *
 * `taken` — boshqa yozuvlar egallagan yo'llar. Ikki xil odam bir xil
 * nomli bo'lsa, ikkinchisiga pasport raqami qo'shiladi: ismi bir xil
 * bo'lgani uchun birining rasmi yo'qolib ketmasligi kerak.
 */
export function photoPath(o: {
  group: string;
  baseName: string;
  docNumber: string;
  mime: string;
  taken?: Set<string>;
}): string {
  const folder = groupFolder(o.group);
  const ext = extensionFor(o.mime);
  const candidate = `${folder}/${o.baseName}.${ext}`;

  if (!o.taken || !o.taken.has(candidate)) return candidate;
  return `${folder}/${o.baseName}_${o.docNumber}.${ext}`;
}
