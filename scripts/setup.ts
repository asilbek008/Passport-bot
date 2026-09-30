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
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
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

const QUESTIONS: Question[] = [
  {
    key: "BOT_TOKEN",
    title: "1) Telegram bot tokeni",
    how: [
      "   Telegramda @BotFather ni oching:  https://t.me/BotFather",
      "   /newbot  ->  botga nom bering  ->  foydalanuvchi nomi (...bot bilan tugaydi)",
      "   U sizga shunday token beradi:  8123456789:AAH-xxxxxxxxxxxxxxxxxxxxxxxxx",
    ],
    check: (v) => /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(v),
    warn: "Token shakli odatdagidan boshqacha (raqamlar:harflar). Xato bo'lsa bot ulanmaydi.",
  },
  {
    key: "ANTHROPIC_API_KEY",
    title: "2) Anthropic API kaliti (rasmni o'qish uchun)",
    how: [
      "   console.anthropic.com  ->  API Keys  ->  Create Key",
      "   Kalit sk-ant- bilan boshlanadi.",
    ],
    check: (v) => v.startsWith("sk-ant-") && v.length > 20,
    warn: "Kalit sk-ant- bilan boshlanmadi. Xato bo'lsa rasm o'qilmaydi.",
  },
];

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
  const missing = QUESTIONS.filter((q) => !parseEnv(text)[q.key]);

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

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    say();
    say(line);
    say("  UMRA BOTI — SOZLASH");
    say(line);

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

if (runDirectly) await main();
