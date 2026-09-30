/**
 * Tashxis: `npm run tekshir`
 *
 * Sozlamalarni tekshiradi va nima xato ekanini aytadi. Tokenning o'zini
 * ekranga chiqarmaydi — faqat uzunligi, shakli va oxirgi belgilari,
 * shunda natijani boshqaga ko'rsatish xavfsiz.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadEnv, parseEnv } from "../src/env.ts";

const line = "─".repeat(60);
const say = (s = "") => console.log(s);

/**
 * Sirni yashirib ko'rsatadi: boshidan `head`, oxiridan `tail` belgi qoladi,
 * o'rtasi nuqtalarga aylanadi. Qiymat qisqa bo'lsa hammasi yashiriladi —
 * aks holda niqob qiymatdan uzun bo'lib, takrorlanib ko'rinardi.
 */
export function mask(value: string, head: number, tail: number): string {
  if (value.length <= head + tail) return "•".repeat(value.length);
  return (
    value.slice(0, head) +
    "•".repeat(value.length - head - tail) +
    value.slice(value.length - tail)
  );
}

/** Tokenning shaklidagi muammolarni topadi (tarmoqqa chiqmasdan). */
export function checkTokenShape(token: string): string[] {
  const found: string[] = [];
  if (/\s/.test(token)) found.push("bo'shliq");
  if (/^["']|["']$/.test(token)) found.push("tirnoq");

  const colon = token.indexOf(":");
  if (colon === -1) {
    found.push("ikki nuqta yo'q");
    return found;
  }
  if (!/^\d{6,}$/.test(token.slice(0, colon))) found.push("bot raqami xato");
  const secret = token.slice(colon + 1);
  if (secret.length < 30) found.push("juda qisqa");
  if (/[^A-Za-z0-9_-]/.test(secret)) found.push("begona belgi");
  return found;
}

async function main(): Promise<number> {
  let problems = 0;
  const problem = (s: string) => {
    problems++;
    say(`  ✗ ${s}`);
  };
  const ok = (s: string) => say(`  ✓ ${s}`);
  const hint = (s: string) => say(`    → ${s}`);

  say();
  say(line);
  say("  UMRA BOTI — TASHXIS");
  say(line);

  // --- Node ---

  say("\nNode.js");
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 6)) {
    problem(`${process.versions.node} — juda eski, kamida 22.6 kerak`);
    hint("nodejs.org dan yangi LTS nusxasini o'rnating");
  } else {
    ok(`${process.versions.node}`);
  }

  // --- Bog'liqliklar ---
  // Bu skript tashqi kutubxonaga bog'liq emas, shuning uchun `npm install`
  // qilinmagan papkada ham ishlaydi — va buni aytib berishi kerak.

  say("\nBog'liqliklar");
  if (!existsSync("node_modules")) {
    problem("node_modules yo'q — kutubxonalar o'rnatilmagan");
    hint("npm install");
  } else if (!existsSync("node_modules/@anthropic-ai/sdk")) {
    problem("kutubxonalar to'liq o'rnatilmagan");
    hint("npm install");
  } else {
    ok("o'rnatilgan");
  }

  // --- .env fayli ---

  say("\n.env fayli");
  say(`  Papka: ${process.cwd()}`);

  if (!existsSync(".env")) {
    problem(".env topilmadi");
    hint("npm run setup — faylni o'zi yaratadi va to'ldiradi");
    if (existsSync(".env.txt")) {
      hint(".env.txt bor! Windows kengaytmani yashiradi — nomini .env qiling");
    }
  } else {
    ok(`topildi (${statSync(".env").size} bayt)`);

    const raw = readFileSync(".env", "utf8");
    if (raw.charCodeAt(0) === 0xfeff) {
      problem("fayl BOM belgisi bilan boshlanadi (Notepad shunday saqlaydi)");
      hint("Notepad: Save As → Encoding: UTF-8 (BOM'siz)");
    }

    const keys = Object.keys(parseEnv(raw));
    say(`  O'qilgan kalitlar: ${keys.length > 0 ? keys.join(", ") : "(hech narsa)"}`);

    // Bir kalit ikki marta yozilganmi
    const seen = new Map<string, number>();
    for (const l of raw.split(/\r?\n/)) {
      const m = l.match(/^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/);
      if (m) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
    }
    for (const [key, count] of seen) {
      if (count > 1) {
        problem(`${key} ${count} marta yozilgan — oxirgisi ishlatiladi`);
        hint("keraksizlarini o'chiring");
      }
    }
  }

  loadEnv();

  // --- BOT_TOKEN ---

  say("\nBOT_TOKEN");
  const token = process.env.BOT_TOKEN ?? "";

  if (!token) {
    problem("yo'q yoki bo'sh");
    hint("@BotFather → /mybots → botingiz → API Token");
  } else {
    const colon = token.indexOf(":");
    say(`  Uzunligi: ${token.length} belgi`);
    say(
      `  Ko'rinishi: ${
        colon > 0
          ? token.slice(0, colon + 1) + mask(token.slice(colon + 1), 0, 4)
          : mask(token, 0, 4)
      }`,
    );

    const issues = checkTokenShape(token);
    if (issues.length === 0) {
      ok("shakli to'g'ri");
    } else {
      if (issues.includes("bo'shliq")) {
        problem("ichida bo'shliq yoki qator uzilishi bor");
        hint("tokenni bir qatorga, bo'shliqsiz yozing");
      }
      if (issues.includes("tirnoq")) {
        problem("tirnoq ichida — tirnoq kerak emas");
        hint("BOT_TOKEN=8123456789:AAH-xxx   (tirnoqsiz)");
      }
      if (issues.includes("ikki nuqta yo'q")) {
        problem("ichida ':' yo'q — bu bot tokeni emas");
        hint("Token shunday: 8123456789:AAH-xxxxxxxxxxxxxxxxxxxxx");
        hint("Bot NOMINI (@...bot) ko'chirib qo'ymadingizmi?");
      }
      if (issues.includes("bot raqami xato")) {
        problem("':' dan oldingi qism raqam emas");
        hint("Token boshida bot raqami turadi: 8123456789:...");
      }
      if (issues.includes("juda qisqa")) {
        problem("':' dan keyingi qism juda qisqa (~35 belgi bo'lishi kerak)");
        hint("Token to'liq ko'chirilmagan — boshidan oxirigacha belgilang");
      }
      if (issues.includes("begona belgi")) {
        problem("':' dan keyin begona belgilar bor");
        hint("Faqat harf, raqam, '-' va '_' bo'lishi kerak");
      }
    }
  }

  // --- ANTHROPIC_API_KEY ---

  say("\nANTHROPIC_API_KEY");
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  if (!key) {
    problem("yo'q yoki bo'sh");
    hint("console.anthropic.com → API Keys → Create Key");
  } else {
    say(`  Uzunligi: ${key.length} belgi`);
    say(`  Ko'rinishi: ${mask(key, 11, 4)}`);
    if (/\s/.test(key)) {
      problem("ichida bo'shliq bor");
    } else if (!key.startsWith("sk-ant-")) {
      problem("'sk-ant-' bilan boshlanmaydi");
      hint("Boshqa narsani ko'chirib qo'ymadingizmi?");
    } else if (key.length < 40) {
      problem("juda qisqa — to'liq ko'chirilmagan");
    } else {
      ok("shakli to'g'ri");
    }
  }

  // --- Telegramga haqiqiy so'rov ---

  say("\nTelegramga ulanish");
  if (!token) {
    say("  (token yo'q — o'tkazib yuborildi)");
  } else {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const text = await res.text();
      say(`  HTTP ${res.status}`);

      let body: { ok?: boolean; result?: { username?: string }; description?: string } = {};
      try {
        body = JSON.parse(text);
      } catch {
        problem("javob JSON emas — faervol yoki proksi to'sgan");
        say(`  Javob: ${text.slice(0, 200)}`);
      }

      if (body.ok && body.result?.username) {
        ok(`bot topildi: @${body.result.username}`);
      } else if (body.description) {
        problem(`Telegram: ${body.description}`);
        if (res.status === 404) {
          hint("404 = bunday bot yo'q. Token XATO yoki to'liq emas.");
          hint("@BotFather → /mybots → botingiz → API Token → QAYTA ko'chiring");
          hint("Token yo'qolgan bo'lsa: /revoke → yangi token beradi");
        } else if (res.status === 401) {
          hint("401 = token bekor qilingan. @BotFather dan yangisini oling.");
        }
      }
    } catch (err) {
      problem(`ulanib bo'lmadi: ${err instanceof Error ? err.message : err}`);
      hint("Internet ishlayaptimi? Faervol yoki VPN to'smayaptimi?");
    }
  }

  // --- Xulosa ---

  say();
  say(line);
  if (problems === 0) {
    say("  Hammasi joyida. Ishga tushirish:  npm start");
  } else {
    say(`  ${problems} ta muammo topildi — yuqorida ✗ bilan belgilangan.`);
  }
  say(line);
  say();

  return problems;
}

/** Faqat to'g'ridan-to'g'ri ishga tushirilganda bajariladi (testda emas). */
const runDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (runDirectly) process.exit((await main()) === 0 ? 0 : 1);
