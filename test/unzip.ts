/**
 * Arxivni BEGONA dastur bilan ochish — testlar uchun.
 *
 * ZIP formatini o'zimiz yozganimiz uchun "baytlar to'g'ri ko'rinadi"
 * degan tekshiruv yetarli emas: arxivni boshqa dastur ocha olishi kerak.
 *
 * Linux va macOS'da `unzip` bor. Windows'da u yo'q — avval testlar shu
 * yerda XATO berardi. Windows'da PowerShell'ning `Expand-Archive` si
 * ishlatiladi: u .NET ning o'z ZIP o'quvchisi, ya'ni xodim arxivni
 * Explorer'da ikki marta bosib ochganida ishlatiladigan kod. Shuning
 * uchun bu hatto yaxshiroq tekshiruv — biz aynan shu yo'lni sinaymiz.
 */

import { execFileSync } from "node:child_process";
import { inflateRawSync, crc32 } from "node:zlib";

function works(file: string, args: string[]): boolean {
  try {
    execFileSync(file, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Birinchi ishlaydigan PowerShell: `pwsh` yangi, `powershell` — Windows'da bor. */
const PS = ["powershell", "pwsh"].find((exe) =>
  works(exe, ["-NoProfile", "-Command", "exit 0"]),
);

/**
 * Shu kompyuterda arxivni ocha oladigan dastur nomi (yo'q bo'lsa `null`).
 * Testlar shu nomni xato matnida ko'rsatadi.
 */
export const UNZIP: string | null = works("unzip", ["-v"]) ? "unzip" : (PS ?? null);

/** PowerShell buyrug'i uchun bitta qo'shtirnoqli matn. */
const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * `zipPath` dagi arxivni `outDir` ga chiqaradi.
 *
 * Arxiv buzuq bo'lsa (CRC, uzunlik, sarlavha) xato tashlanadi —
 * test aynan shuni kutadi.
 *
 * DIQQAT: `Expand-Archive` fayl nomi `.zip` bilan tugashini talab
 * qiladi, shuning uchun testlar arxivni `a.zip` deb saqlaydi.
 */
export function unzipTo(zipPath: string, outDir: string): void {
  if (UNZIP === "unzip") {
    // -t: butunligini tekshiradi (CRC ham)
    execFileSync("unzip", ["-t", zipPath], { stdio: "pipe" });
    execFileSync("unzip", ["-qq", "-o", zipPath, "-d", outDir], { stdio: "pipe" });
    return;
  }
  if (UNZIP !== null) {
    execFileSync(
      UNZIP,
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(outDir)} -Force`,
      ],
      { stdio: "pipe" },
    );
    return;
  }
  throw new Error("arxivni ochadigan dastur topilmadi");
}

let warned = false;

/**
 * `unzipTo` ni urinib ko'radi; dasturning o'zi ishlamasa `false`.
 *
 * Nega shunday: asosiy tekshiruv `readZip` — u hamma joyda ishlaydi va
 * CRC ni solishtiradi. Begona dastur esa QO'SHIMCHA dalil. Agar o'sha
 * dastur shu kompyuterda ishlamasa (yo'q, ruxsat berilmagan, siyosat
 * bloklagan), bu arxivning nuqsoni emas — testni yiqitmaydi, shunchaki
 * ogohlantirish yoziladi. Natija farq qilsa esa test yiqiladi.
 */
export function tryUnzipTo(zipPath: string, outDir: string): boolean {
  if (UNZIP === null) return false;
  try {
    unzipTo(zipPath, outDir);
    return true;
  } catch (error) {
    if (!warned) {
      warned = true;
      const why = error instanceof Error ? error.message.split("\n")[0] : "xato";
      console.warn(
        `  ! "${UNZIP}" bu kompyuterda arxivni ocholmadi (${why}).\n` +
          "    Arxiv o'zimizning o'quvchimiz bilan tekshirildi (CRC bilan).",
      );
    }
    return false;
  }
}

/**
 * Arxivni O'ZIMIZ o'qiymiz — hech qanday dastur kerak emas.
 *
 * `unzipTo` begona dasturga ishonadi, lekin u har kompyuterda bo'lmaydi
 * (Windows'da `unzip` yo'q). Shuning uchun asosiy tekshiruv shu: arxiv
 * MARKAZIY KATALOG bo'yicha o'qiladi (dasturlar ham shundan boshlaydi),
 * har faylning CRC'si solishtiriladi. Bitta bayt o'rni almashsa ham
 * xato chiqadi.
 *
 * Yo'l nomlari UTF-8 deb o'qiladi — arxivda bayroq (bit 11) shunday
 * qo'yilgani ham shu yerda tekshiriladi.
 */
export function readZip(zip: Uint8Array): Record<string, Uint8Array> {
  const buf = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);

  // EOCD oxirida turadi (izoh bo'lsa undan oldin) — orqadan qidiramiz
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("EOCD topilmadi — arxiv buzuq");

  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const files: Record<string, Uint8Array> = {};

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) {
      throw new Error(`${n + 1}-yozuvning sarlavhasi noto'g'ri`);
    }
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const checksum = buf.readUInt32LE(at + 16);
    const packed = buf.readUInt32LE(at + 20);
    const plain = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString("utf8");

    if (/[^\x20-\x7e]/.test(name) && (flags & 0x0800) === 0) {
      throw new Error(`"${name}" — UTF-8 bayrog'i qo'yilmagan`);
    }
    if (buf.readUInt32LE(localAt) !== 0x04034b50) {
      throw new Error(`"${name}" — local sarlavha noto'g'ri joyda`);
    }

    // Ma'lumot local sarlavhadan keyin: 30 bayt + nom + qo'shimcha
    const dataAt =
      localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
    const body = buf.subarray(dataAt, dataAt + packed);
    const out = method === 8 ? inflateRawSync(body) : Buffer.from(body);

    if (out.length !== plain) {
      throw new Error(`"${name}" — uzunlik mos emas: ${out.length} ≠ ${plain}`);
    }
    if (crc32(out) !== checksum) throw new Error(`"${name}" — CRC mos emas`);

    files[name] = new Uint8Array(out);
    at += 46 + nameLen + extraLen + commentLen;
  }

  if (Object.keys(files).length !== count) {
    throw new Error("arxivda takrorlangan nom bor — bittasi yo'qoladi");
  }
  return files;
}
