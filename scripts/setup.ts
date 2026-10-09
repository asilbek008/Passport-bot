/**
 * Sozlash: `npm run setup`
 *
 * `.env` faylini savol-javob bilan to'ldiradi, shunda faylni qo'lda
 * tahrirlash kerak bo'lmaydi. Node'da yozilgan — Windows, macOS va
 * Linuxda bir xil ishlaydi (bash skript Windowsda ishlamaydi).
 *
 * O'qish uchun `src/env.ts` dagi `parseEnv` ishlatiladi — ikkinchi parser
 * yozilmaydi, chunki u testdan o'tgan va bir joyda turishi kerak.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { Asker, AskError } from "../src/ask.ts";
import { stdin } from "node:process";
import { pathToFileURL } from "node:url";
import { parseEnv } from "../src/env.ts";

const ENV = ".env";
const EXAMPLE = ".env.example";

const line = "─".repeat(58);
const say = (s = "") => console.log(s);

/**
 * `.env` dagi kalitni yangilaydi (bo'lmasa oxiriga qo'shadi).
 *
 * Diqqat: `\s` yangi qatorni ham yutadi, shuning uchun faqat gorizontal
 * bo'shliq (`[ \t]`) ishlatiladi — aks holda bo'sh `KEY=` dan keyingi
 * qator qiymat deb o'qilgan bo'lardi.
 */
export function setValue(text: string, key: string, value: string): string {
  const re = new RegExp(`^([ \\t]*${key}[ \\t]*=).*$`, "m");
  if (re.test(text)) return text.replace(re, `$1${value}`);
  return `${text.replace(/\s*$/, "")}\n${key}=${value}\n`;
}

type Question = {
  key: string;
  title: string;
  how: string[];
  check: (v: string) => boolean;
  warn: string;
};

const TOKEN_QUESTION: Question = {
  key: "BOT_TOKEN",
  title: "1) Telegram bot tokeni",
  how: [
    "   Telegramda @BotFather ni oching:  https://t.me/BotFather",
    "   /newbot  ->  botga nom bering  ->  foydalanuvchi nomi (...bot bilan tugaydi)",
    "   U sizga shunday token beradi:  8123456789:AAH-xxxxxxxxxxxxxxxxxxxxxxxxx",
  ],
  check: (v) => /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(v),
  warn: "Token shakli odatdagidan boshqacha (raqamlar:harflar). Xato bo'lsa bot ulanmaydi.",
};

/**
 * Rasm o'qish kaliti — PROVAYDERGA BOG'LIQ.
 *
 * Avval bu yerda faqat Anthropic turardi: Gemini qo'shilgandan keyin
 * sozlash hali ham `sk-ant-` so'rardi va Gemini kalitini ("AIza...")
 * rad qilardi. Ya'ni Gemini bilan ishlayotgan odam botni sozlay olmasdi.
 */
const KEY_QUESTIONS: Record<"gemini" | "anthropic", Question> = {
  gemini: {
    key: "GEMINI_API_KEY",
    title: "2) Gemini API kaliti (rasmni o'qish uchun)",
    how: [
      "   aistudio.google.com/apikey  ->  Create API key",
      "   Kalit AIza bilan boshlanadi.",
      "",
      "   DIQQAT: AQ. bilan boshlanadigan narsa OAuth tokeni — u ishlamaydi.",
      "   MAXFIYLIK: bepul tarifda yuborilgan ma'lumot model o'qitishga",
      "   ishlatiladi. Pasport skanlari uchun pullik tarifni yoqing.",
    ],
    check: (v) => v.startsWith("AIza") && v.length > 20,
    warn: "Kalit AIza bilan boshlanmadi. Xato bo'lsa rasm o'qilmaydi.",
  },
  anthropic: {
    key: "ANTHROPIC_API_KEY",
    title: "2) Anthropic (Claude) API kaliti (rasmni o'qish uchun)",
    how: [
      "   console.anthropic.com  ->  API Keys  ->  Create Key",
      "   Kalit sk-ant- bilan boshlanadi.",
    ],
    check: (v) => v.startsWith("sk-ant-") && v.length > 20,
    warn: "Kalit sk-ant- bilan boshlanmadi. Xato bo'lsa rasm o'qilmaydi.",
  },
};

async function main() {
  // --- Node versiyasi ---
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 6)) {
    say(`\nNode.js ${process.versions.node} juda eski.`);
    say("Kamida 22.6 kerak. nodejs.org dan yangi LTS nusxasini o'rnating.\n");
    process.exit(1);
  }

  // --- .env ni tayyorlash ---
  if (!existsSync(ENV)) {
    if (!existsSync(EXAMPLE)) {
      say(`\n${EXAMPLE} topilmadi — loyiha to'liq ko'chirilmaganga o'xshaydi.\n`);
      process.exit(1);
    }
    copyFileSync(EXAMPLE, ENV);
    say(`${ENV} yaratildi (${EXAMPLE} nusxasi).`);
  }

  let text = readFileSync(ENV, "utf8");
  const current = parseEnv(text);

  // Qaysi provayder: `.env` da tanlangan bo'lsa o'shanisi, kalit
  // bo'lsa kalitga qarab, aks holda pastda so'raladi
  const chosen =
    current.PROVIDER === "anthropic"
      ? "anthropic"
      : current.PROVIDER === "gemini"
        ? "gemini"
        : current.ANTHROPIC_API_KEY && !current.GEMINI_API_KEY
          ? "anthropic"
          : current.GEMINI_API_KEY
            ? "gemini"
            : null;

  const missing: Question[] = [];
  if (!current.BOT_TOKEN) missing.push(TOKEN_QUESTION);
  // Ikkisidan biri bo'lsa yetarli
  const hasKey = Boolean(current.GEMINI_API_KEY || current.ANTHROPIC_API_KEY);
  if (!hasKey) missing.push(KEY_QUESTIONS[chosen ?? "gemini"]);

  // Hammasi to'la bo'lsa — savol bermaymiz
  if (missing.length === 0) {
    say();
    say(line);
    say("  Sozlamalar to'liq. Botni ishga tushirish:  npm start");
    say(line);
    say();
    return;
  }

  // Terminal interaktiv bo'lmasa (masalan skript ichida) — qo'lda yo'l ko'rsatamiz
  if (!stdin.isTTY) {
    say();
    say(`${ENV} faylini oching va quyidagilarni to'ldiring:`);
    say();
    for (const q of missing) {
      say(`  ${q.key}`);
      for (const l of q.how) say(l);
      say();
    }
    process.exit(1);
  }

  const rl = new Asker();
  try {
    say();
    say(line);
    say("  UMRA BOTI — SOZLASH");
    say(line);

    // Kalit kerak, lekin provayder hali tanlanmagan — so'raymiz
    if (!hasKey && chosen === null) {
      say();
      say("Rasmni kim o'qiydi?");
      say();
      say("  1) Gemini (Google)  — arzon, tavsiya etiladi");
      say("  2) Claude (Anthropic)");
      say();
      const answer = (await rl.question("   Tanlang - 1 yoki 2 [1]: ")).trim();
      const provider = answer === "2" ? "anthropic" : "gemini";
      text = setValue(text, "PROVIDER", provider);
      // Savolni tanlangan provayderga moslaymiz
      missing[missing.length - 1] = KEY_QUESTIONS[provider];
    }

    for (const q of missing) {
      say(`\n${q.title}`);
      for (const l of q.how) say(l);

      let value = "";
      while (!value) {
        value = (await rl.question("\n   Qiymatni shu yerga qo'yib Enter bosing: ")).trim();
        if (!value) say("   Bo'sh qoldirib bo'lmaydi.");
      }
      if (!q.check(value)) say(`   ! ${q.warn}`);

      text = setValue(text, q.key, value);
    }

    writeFileSync(ENV, text);
    say(`\n${ENV} saqlandi.`);

    say();
    say(line);
    say("  TAYYOR");
    say();
    say("  Botni ishga tushirish:   npm start");
    say();
    say("  Birinchi ishga tushirganda terminalda KOD chiqadi —");
    say("  uni Telegramda botga yuborsangiz ruxsat olasiz.");
    say(line);
    say();
  } finally {
    rl.close();
  }
}

/**
 * Faqat to'g'ridan-to'g'ri ishga tushirilganda bajariladi.
 * Testdan `setValue` ni import qilganda skript ishlab ketmasligi kerak.
 */
const runDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (runDirectly) {
  try {
    await main();
  } catch (err) {
    // Ctrl+D / Ctrl+C bosilsa yoki terminal yopilsa — Node'ning xato izi
    // emas, oddiy xabar chiqsin
    if (err instanceof AskError) {
      say();
      say("Sozlash to'xtatildi — hech narsa o'zgarmadi.");
      say("Qaytadan boshlash:  npm run setup");
      say();
      process.exit(1);
    }
    throw err;
  }
}
