/**
 * Zaxira: baza va rasmlarni BITTA SHIFRLANGAN faylga yig'ish.
 *
 * NEGA KERAK: `data/umra.db` bitta fayl, rasmlar bitta papka. Disk
 * buzilsa yoki kompyuter yo'qolsa — 300 pasport ma'lumoti ketadi va
 * ularni qaytarib bo'lmaydi.
 *
 * NEGA SHIFRLANGAN: zaxirada mijozlarning pasport skanlari va shaxsiy
 * ma'lumoti bo'ladi. Oddiy zip'ni flesh-diskka tashlab, o'sha fleshni
 * yo'qotish — ma'lumot tarqalishi bilan barobar. Shuning uchun fayl
 * parol bilan shifrlanadi: flesh begonaga tushsa ham ichidagi o'qilmaydi.
 *
 * Shifrlash: AES-256-GCM, kalit paroldan scrypt bilan olinadi.
 * GCM — faqat shifrlamaydi, buzilganini ham ANIQLAYDI: fayl yarim
 * ko'chirilgan yoki o'zgartirilgan bo'lsa, tiklashda xato beradi
 * (jim turib buzuq ma'lumot bermaydi).
 *
 * Bulutga yuklash ATAYLAB yo'q: qayerga saqlash — egasining qarori,
 * men mijozlar pasportini begona xizmatga yubormayman.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/** Fayl boshidagi belgi — tasodifiy faylni tiklashga urinmaslik uchun. */
export const MAGIC = "UMRAZAX1";

const SALT_BYTES = 16;
const IV_BYTES = 12; // GCM uchun standart
const TAG_BYTES = 16;
const KEY_BYTES = 32; // AES-256

/**
 * scrypt parametri. 2^16 — oddiy kompyuterda ~0.5 soniya, ya'ni parolni
 * taxmin qilib ko'rish juda qimmat bo'ladi, lekin bizga sezilmaydi.
 */
const SCRYPT_COST = 2 ** 16;

function keyFrom(password: string, salt: Uint8Array): Buffer {
  return scryptSync(password, salt, KEY_BYTES, {
    N: SCRYPT_COST,
    r: 8,
    p: 1,
    // scrypt N katta bo'lsa Node standart xotira chegarasidan oshadi
    maxmem: 128 * SCRYPT_COST * 8 * 2,
  });
}

/**
 * Fayl tuzilishi (hammasi bitta faylda, kutubxonasiz o'qiladi):
 *
 *   "UMRAZAX1" | tuz (16) | iv (12) | shifrlangan ma'lumot | teg (16)
 *
 * Tuz va iv har zaxirada yangi: bir xil parol bilan ikki marta zaxira
 * olinsa ham fayllar bir xil bo'lmaydi.
 */
export function encrypt(
  data: Uint8Array,
  password: string,
): Uint8Array<ArrayBuffer> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(password, salt), iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return new Uint8Array(
    Buffer.concat([Buffer.from(MAGIC, "ascii"), salt, iv, body, tag]),
  ) as Uint8Array<ArrayBuffer>;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

/**
 * Shifrni ochadi.
 *
 * Xatolar o'zbekcha va ANIQ: parol xatomi, fayl buzuqmi yoki bu
 * umuman zaxira fayli emasmi — tiklash paytida buni bilish muhim.
 */
export function decrypt(file: Uint8Array, password: string): Uint8Array<ArrayBuffer> {
  const head = Buffer.from(file.subarray(0, MAGIC.length)).toString("ascii");
  if (head !== MAGIC) {
    throw new BackupError(
      "Bu zaxira fayli emas (yoki boshqa versiyada yaratilgan).",
    );
  }

  const least = MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES;
  if (file.length <= least) {
    throw new BackupError("Zaxira fayli juda kichik — to'liq ko'chirilmagan.");
  }

  let at = MAGIC.length;
  const salt = file.subarray(at, (at += SALT_BYTES));
  const iv = file.subarray(at, (at += IV_BYTES));
  const body = file.subarray(at, file.length - TAG_BYTES);
  const tag = file.subarray(file.length - TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", keyFrom(password, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return new Uint8Array(
      Buffer.concat([decipher.update(body), decipher.final()]),
    ) as Uint8Array<ArrayBuffer>;
  } catch {
    // GCM tegi mos kelmadi. Ikki sabab bor va ikkisini ajratib bo'lmaydi,
    // shuning uchun ikkisini ham aytamiz.
    throw new BackupError(
      "Parol xato yoki fayl buzilgan. Parolni tekshirib qayta urinib ko'ring.",
    );
  }
}

// --- Fayllarni bitta bo'lakka yig'ish ---
//
// ZIP ishlatilmadi: `zip.ts` faqat YOZADI, o'qish uchun esa butun ZIP
// o'qigich kerak bo'lardi. Fayl baribir shifrlangani uchun ZIP mosligidan
// foyda yo'q, siqishdan ham: ichidagining katta qismi JPEG, u siqilmaydi.
//
// Shuning uchun eng oddiy format — har fayl uchun:
//   nom uzunligi (4 bayt) | nom (utf8) | ma'lumot uzunligi (4 bayt) | ma'lumot

export type BundleFile = { name: string; data: Uint8Array };

export function bundle(files: BundleFile[]): Uint8Array<ArrayBuffer> {
  const parts: Buffer[] = [];
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const sizes = Buffer.alloc(8);
    sizes.writeUInt32BE(name.length, 0);
    sizes.writeUInt32BE(file.data.length, 4);
    parts.push(sizes.subarray(0, 4), name, sizes.subarray(4), Buffer.from(file.data));
  }
  return new Uint8Array(Buffer.concat(parts)) as Uint8Array<ArrayBuffer>;
}

export function unbundle(data: Uint8Array): BundleFile[] {
  const buffer = Buffer.from(data);
  const files: BundleFile[] = [];
  let at = 0;

  while (at < buffer.length) {
    if (at + 4 > buffer.length) throw new BackupError("Zaxira buzilgan (nom).");
    const nameLength = buffer.readUInt32BE(at);
    at += 4;

    if (at + nameLength + 4 > buffer.length) {
      throw new BackupError("Zaxira buzilgan (nom uzunligi).");
    }
    const name = buffer.subarray(at, at + nameLength).toString("utf8");
    at += nameLength;

    const size = buffer.readUInt32BE(at);
    at += 4;
    if (at + size > buffer.length) {
      throw new BackupError(`Zaxira buzilgan (${name}).`);
    }
    files.push({ name, data: new Uint8Array(buffer.subarray(at, at + size)) });
    at += size;
  }

  return files;
}

/**
 * Tiklashda yo'lni tekshiradi: zaxira ichidagi nom papkadan tashqariga
 * chiqmasin. Zaxira o'zimiz yaratgan bo'lsa ham, fayl boshqa odamdan
 * kelgan bo'lishi mumkin.
 */
export function safeName(name: string): string {
  const clean = name.replace(/\\/g, "/");
  if (
    clean.startsWith("/") ||
    /^[a-zA-Z]:/.test(clean) ||
    clean.split("/").includes("..")
  ) {
    throw new BackupError(`Zaxirada xavfli yo'l: ${name}`);
  }
  return clean;
}

/** Parol yetarlicha kuchlimi. Zaxirada pasport ma'lumoti bor. */
export function checkPassword(password: string): string | null {
  if (password.length < 8) return "Parol kamida 8 belgi bo'lishi kerak.";
  if (!/[^0-9]/.test(password)) return "Parolda harf ham bo'lsin.";
  return null;
}
