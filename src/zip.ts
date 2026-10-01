/**
 * ZIP arxiv tuzish — tashqi kutubxonasiz.
 *
 * Node'ning `zlib` ida `deflateRawSync` va `crc32` bor, ZIP formati esa
 * yaxshi hujjatlashtirilgan (PKWARE APPNOTE). Shuning uchun arxivni o'zimiz
 * yozamiz: loyihaga yana bitta bog'liqlik qo'shilmaydi.
 *
 * Qo'llanadigan imkoniyatlar: deflate va "store" (siqmasdan), papkalar,
 * UTF-8 nomlar. Shifr, ZIP64 va ko'p qismli arxiv yo'q — 50 ta pasport
 * rasmi uchun kerak emas (ZIP64 4 GB dan oshganda kerak bo'ladi).
 */

import { deflateRawSync, crc32 } from "node:zlib";

export type ZipEntry = {
  /** Arxiv ichidagi yo'l, masalan "umra-mart/KARIMOV_AZIZ_uzb-pasport.jpg" */
  path: string;
  data: Uint8Array;
  /** Sana (arxivda ko'rinadi). Berilmasa — hozirgi vaqt. */
  date?: Date;
};

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** UTF-8 nom ishlatilayotganini bildiruvchi bayroq (bit 11). */
const FLAG_UTF8 = 0x0800;

/**
 * Sana/vaqtni MS-DOS shakliga o'giradi (ZIP shuni kutadi).
 * DOS vaqti 1980-yildan boshlanadi va sekundni 2 ga bo'lib saqlaydi.
 */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (Math.floor(date.getSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Nomni arxiv ichidagi xavfsiz yo'lga keltiradi: `\` → `/`, boshidagi `/`
 * va `..` olib tashlanadi (arxivni ochganda papkadan chiqib ketmasligi uchun).
 */
export function safeZipPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== "" && part !== "." && part !== "..")
    .join("/");
}

/** JPEG/PNG allaqachon siqilgan — ularni qayta siqishdan foyda yo'q. */
function alreadyCompressed(path: string): boolean {
  return /\.(jpe?g|png|webp|gif|zip|pdf|mp4|mov|webm)$/i.test(path);
}

/**
 * ZIP arxivini yasaydi.
 *
 * Bir xil yo'l ikki marta kelsa, ikkinchisiga `-2`, `-3` … qo'shiladi:
 * arxivda takrorlangan nom ba'zi dasturlarda bittasini yo'q qilib yuboradi.
 */
export function makeZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  const used = new Set<string>();
  let offset = 0;

  for (const entry of entries) {
    const path = uniquePath(safeZipPath(entry.path) || "fayl", used);
    used.add(path.toLowerCase());

    const nameBytes = Buffer.from(path, "utf8");
    const raw = Buffer.from(entry.data);
    const checksum = crc32(raw);

    // Siqilgan fayllarni qayta siqmaymiz; siqish foyda bermasa ham tashlaymiz
    let method = METHOD_STORE;
    let body = raw;
    if (!alreadyCompressed(path) && raw.length > 0) {
      const deflated = deflateRawSync(raw, { level: 6 });
      if (deflated.length < raw.length) {
        method = METHOD_DEFLATE;
        body = deflated;
      }
    }

    const { time, date } = dosDateTime(entry.date ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4); // ochish uchun kerakli versiya (2.0)
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // qo'shimcha maydon yo'q

    locals.push(local, nameBytes, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4); // yaratgan versiya
    central.writeUInt16LE(20, 6); // kerakli versiya
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // qo'shimcha
    central.writeUInt16LE(0, 32); // izoh
    central.writeUInt16LE(0, 34); // disk raqami
    central.writeUInt16LE(0, 36); // ichki atributlar
    central.writeUInt32LE(0, 38); // tashqi atributlar
    central.writeUInt32LE(offset, 42); // local header qaerda

    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }

  const centralBytes = Buffer.concat(centrals);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // markaziy katalog qaysi diskda
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // izoh uzunligi

  const all = Buffer.concat([...locals, centralBytes, eocd]);
  return new Uint8Array(all.buffer, all.byteOffset, all.byteLength) as Uint8Array<ArrayBuffer>;
}

/** Takrorlangan yo'lga `-2`, `-3` … qo'shadi. */
function uniquePath(path: string, used: Set<string>): string {
  if (!used.has(path.toLowerCase())) return path;

  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  const hasExt = dot > slash;
  const base = hasExt ? path.slice(0, dot) : path;
  const ext = hasExt ? path.slice(dot) : "";

  for (let n = 2; n < 10000; n++) {
    const candidate = `${base}-${n}${ext}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}-${Date.now()}${ext}`;
}
