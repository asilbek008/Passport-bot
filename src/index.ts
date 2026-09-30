/**
 * Kirish nuqtasi. Bot uzun so'rov (long polling) bilan ishlaydi:
 * ochiq domen, webhook va HTTPS sertifikat kerak emas — oddiy kompyuterda
 * yoki arzon serverda `npm start` bilan turadi.
 */

// `.env` BIRINCHI yuklanadi — config undan keyin o'qiydi
import { loadEnv } from "./env.ts";
loadEnv();

import { config, isOperator } from "./config.ts";
import { Telegram, TelegramError } from "./telegram.ts";
import { Store } from "./store.ts";
import { readDocument } from "./vision.ts";
import { Batcher } from "./batch.ts";
import { Invites } from "./invites.ts";
import { handleUpdate, processBatch, COMMANDS, type Deps } from "./bot.ts";

const CODE_TTL_MINUTES = 60;

/** Sozlamalar to'liqmi — to'liq bo'lmasa o'zbekcha tushuntirib to'xtaydi. */
function checkSettings(): string[] {
  const problems: string[] = [];
  if (!process.env.BOT_TOKEN) {
    problems.push(
      "BOT_TOKEN yo'q.\n" +
        "   Telegramda @BotFather ga kiring → /newbot → bot nomini yozing →\n" +
        "   u sizga token beradi. Uni .env fayliga BOT_TOKEN= dan keyin qo'yasiz.",
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    problems.push(
      "ANTHROPIC_API_KEY yo'q.\n" +
        "   console.anthropic.com → API Keys → Create Key.\n" +
        "   Uni .env fayliga ANTHROPIC_API_KEY= dan keyin qo'yasiz.",
    );
  }
  return problems;
}

const problems = checkSettings();
if (problems.length > 0) {
  console.error("\nBot ishga tushmadi — sozlamalar to'liq emas:\n");
  for (const p of problems) console.error(` • ${p}\n`);
  console.error("Namuna fayl: .env.example (nusxasini .env deb saqlang)\n");
  process.exit(1);
}

const tg = new Telegram(config.botToken);
const store = new Store();
const invites = new Invites(CODE_TTL_MINUTES);

// To'plam: rasmlar yig'iladi, keyin birga o'qiladi.
// `deps` ni ichida ishlatgani uchun pastda e'lon qilinadi.
const batcher = new Batcher(config.batchWaitMs, (chatId, fileIds) =>
  processBatch(chatId, fileIds, deps),
);

const deps: Deps = {
  tg,
  store,
  read: readDocument,
  enqueue: (chatId, fileId) => batcher.add(chatId, fileId),
  tryClaim: (chatId, text) => {
    if (!invites.claim(text)) return false;
    store.addOperator(chatId);
    console.log(`[ruxsat] chat ${chatId} xodimlar ro'yxatiga qo'shildi`);
    return true;
  },
  newCode: () => ({ code: invites.create(), minutes: CODE_TTL_MINUTES }),
};

let running = true;
let offset = 0;

function stop(signal: string) {
  console.log(`\n${signal} — to'xtatilmoqda...`);
  running = false;
  batcher.stop();
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

/** Kuniga bir marta muddati o'tgan yozuvlarni o'chiradi. */
function schedulePurge() {
  const run = () => {
    try {
      const removed = store.purge();
      if (removed > 0) console.log(`[tozalash] ${removed} ta eski yozuv o'chirildi`);
    } catch (err) {
      console.error("[tozalash] xato:", err instanceof Error ? err.message : err);
    }
  };
  run();
  const timer = setInterval(run, 24 * 60 * 60 * 1000);
  timer.unref();
}

/** Birinchi ishga tushirish: hech kim ruxsatga ega bo'lmasa, kod chiqaramiz. */
function announceFirstRun(botUsername: string) {
  const total = store.operatorCount() + config.operators.length;
  if (total > 0) {
    console.log(`Ruxsat berilgan xodimlar: ${total}`);
    return;
  }

  const code = invites.create();
  console.log(
    [
      "",
      "─".repeat(58),
      "  BIRINCHI ISHGA TUSHIRISH",
      "",
      `  1. Telegramda botni oching:  https://t.me/${botUsername}`,
      "  2. Unga quyidagi kodni yuboring:",
      "",
      `        ${code}`,
      "",
      `  Shundan keyin botdan foydalanishingiz mumkin.`,
      `  Kod ${CODE_TTL_MINUTES} daqiqa amal qiladi va bir marta ishlatiladi.`,
      "─".repeat(58),
      "",
    ].join("\n"),
  );
}

async function main() {
  // Token va kalit haqiqatan ishlaydimi — darhol tekshiramiz
  let me: { username: string };
  try {
    me = await tg.call<{ username: string }>("getMe");
  } catch (err) {
    // Tarmoq muammosi va xato tokenni ajratamiz — yechimi butunlay boshqacha
    if (err instanceof TelegramError && err.network) {
      console.error(
        [
          "",
          "Telegramga ulanib bo'lmadi — bu token muammosi emas, tarmoq muammosi.",
          "",
          "Tekshirib ko'ring:",
          "  • internet ishlayaptimi;",
          "  • Telegram shu tarmoqda ochiqmi (ish joyidagi faervol to'smayaptimi);",
          "  • VPN yoqilgan bo'lsa, o'chirib ko'ring yoki aksincha yoqib ko'ring.",
          "",
          `Tafsilot: ${err.message}`,
          "",
        ].join("\n"),
      );
    } else if (
      err instanceof TelegramError &&
      (err.code === 401 || err.code === 404)
    ) {
      // 404 = "bunday bot yo'q" -> token xato/to'liq emas
      // 401 = token bekor qilingan
      console.error(
        [
          "",
          err.code === 404
            ? "BOT_TOKEN xato: Telegram bunday botni topmadi (404)."
            : "BOT_TOKEN bekor qilingan (401).",
          "",
          "Tokenni qayta ko'chirib qo'yish kerak:",
          "  1. Telegramda @BotFather ni ochasiz",
          "  2. /mybots → botingizni tanlaysiz → API Token",
          "  3. Tokenni BOSHIDAN OXIRIGACHA belgilab ko'chirasiz",
          "  4. .env faylida:  BOT_TOKEN=8123456789:AAH-xxxxxxxxxxxxx",
          "",
          "Diqqat: tirnoq qo'yilmaydi, bo'shliq qolmaydi, bir qatorda turadi.",
          "",
          "Batafsil tekshirish:  npm run tekshir",
          "",
        ].join("\n"),
      );
    } else {
      console.error(
        `\nTelegram botga ulanib bo'lmadi.\nXato: ${err instanceof Error ? err.message : err}\n`,
      );
    }
    process.exit(1);
  }

  await tg.setMyCommands(COMMANDS);

  console.log(`Bot ishga tushdi: @${me.username}`);
  console.log(`Model: ${config.model}`);
  console.log(`Saqlash muddati: ${config.retentionDays} kun`);
  console.log(`Bazadagi yozuvlar: ${store.count()}`);

  announceFirstRun(me.username);
  schedulePurge();

  while (running) {
    try {
      const updates = await tg.getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;

        // Chat id'ni yozamiz — tashxis uchun kerak.
        // Xabar MAZMUNI (ism, pasport, rasm) hech qachon yozilmaydi.
        const chat = update.message?.chat;
        if (chat?.type === "private") {
          const known = isOperator(chat.id) || store.isOperator(chat.id);
          console.log(`[xabar] chat ${chat.id}${known ? "" : " — ruxsatsiz"}`);
        }

        try {
          await handleUpdate(update, deps);
        } catch (err) {
          // Bitta xabardagi xato botni to'xtatmaydi
          console.error(
            `[xabar] ishlov xatosi: ${err instanceof Error ? err.message : "noma'lum"}`,
          );
        }
      }
    } catch (err) {
      console.error(
        `[polling] xato: ${err instanceof Error ? err.message : "noma'lum"} — 5s kutib qayta urinaman`,
      );
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  store.close();
  console.log("To'xtatildi.");
}

main().catch((err) => {
  console.error("Ishga tushmadi:", err instanceof Error ? err.message : err);
  process.exit(1);
});
