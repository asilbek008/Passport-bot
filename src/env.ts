/**
 * `.env` faylini o'qish.
 *
 * Nega o'z parseri: `dotenv` paketini qo'shmaslik uchun (loyihada bog'liqlik
 * qancha kam bo'lsa, shuncha yaxshi), va Node'ning `--env-file` bayrog'iga
 * tayanmaslik uchun — u faqat 20.6+ da bor, `--env-file-if-exists` esa 22.9+
 * da. Bu funksiya har qanday Node'da ishlaydi.
 *
 * Muhitda allaqachon bor qiymat USTUN turadi: serverda `BOT_TOKEN` ni
 * muhit o'zgaruvchisi qilib bersa, `.env` uni bosmaydi.
 */

import { readFileSync, existsSync } from "node:fs";

/**
 * Bir qatorni ajratadi. Qo'llab-quvvatlanadi:
 *   KALIT=qiymat
 *   KALIT="qiymat"        (qo'shtirnoq ichida \n haqiqiy qator bo'ladi)
 *   KALIT='qiymat'        (bir tirnoqda hech narsa o'girilmaydi)
 *   export KALIT=qiymat
 *   # izoh                (tashlab yuboriladi)
 */
export function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const withoutExport = trimmed.startsWith("export ")
    ? trimmed.slice(7).trim()
    : trimmed;

  const eq = withoutExport.indexOf("=");
  if (eq <= 0) return null;

  const key = withoutExport.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = withoutExport.slice(eq + 1).trim();

  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    value = value.slice(1, -1);
  } else {
    // Tirnoqsiz qiymatdan keyingi izohni olib tashlaymiz: `KEY=abc # izoh`
    const hash = value.indexOf(" #");
    if (hash !== -1) value = value.slice(0, hash).trim();
  }

  return [key, value];
}

/** Matnni kalit-qiymat juftliklariga ajratadi. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const pair = parseEnvLine(line);
    if (pair) out[pair[0]] = pair[1];
  }
  return out;
}

/**
 * `.env` ni o'qib `process.env` ga qo'shadi. Fayl bo'lmasa — jim qaytadi
 * (serverda sozlamalar muhit o'zgaruvchisi bilan berilishi mumkin).
 * Nechta qiymat qo'shilganini qaytaradi.
 */
export function loadEnv(path = ".env"): number {
  if (!existsSync(path)) return 0;

  let added = 0;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) {
    // Muhitda bor qiymat ustun
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
      added++;
    }
  }
  return added;
}
