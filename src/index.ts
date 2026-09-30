/**
 * Kirish nuqtasi. Bot uzun so'rov (long polling) bilan ishlaydi:
 * ochiq domen, webhook va HTTPS sertifikat kerak emas — oddiy kompyuterda
 * yoki arzon serverda `npm start` bilan turadi.
 */

import { config } from "./config.ts";
import { Telegram } from "./telegram.ts";
import { Store } from "./store.ts";
import { readDocument } from "./vision.ts";
import { Batcher } from "./batch.ts";
import { handleUpdate, processBatch, COMMANDS, type Deps } from "./bot.ts";

const tg = new Telegram(config.botToken);
const store = new Store();

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

async function main() {
  await tg.setMyCommands(COMMANDS);

  const me = await tg.call<{ username: string }>("getMe");
  console.log(`Bot ishga tushdi: @${me.username}`);
  console.log(`Model: ${config.model}`);
  console.log(`Ruxsat berilgan xodimlar: ${config.operators.length}`);
  console.log(`Saqlash muddati: ${config.retentionDays} kun`);
  console.log(`Bazadagi yozuvlar: ${store.count()}`);

  if (config.operators.length === 0) {
    console.warn(
      "\nOGOHLIK: OPERATORS bo'sh — bot hech kim bilan ishlamaydi.\n" +
        "Botga /start yozing, pastda chat id ko'rinadi, uni .env dagi\n" +
        "OPERATORS ga qo'shib botni qaytadan ishga tushiring.\n",
    );
  }

  schedulePurge();

  while (running) {
    try {
      const updates = await tg.getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;

        // Chat id'ni yozamiz — xodimni .env ga qo'shish uchun kerak.
        // Xabar MAZMUNI (ism, pasport, rasm) hech qachon yozilmaydi.
        const chat = update.message?.chat;
        if (chat?.type === "private") {
          const known = config.operators.includes(String(chat.id));
          console.log(`[xabar] chat ${chat.id}${known ? "" : " — ro'yxatda YO'Q"}`);
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
