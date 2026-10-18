/**
 * Suhbat mantig'i. Bog'liqliklar (Telegram, baza, rasm o'qigich) tashqaridan
 * beriladi, shuning uchun bu funksiyani testda ham ishga tushirish mumkin.
 *
 * Qoidalar:
 *  - bot OCHIQ EMAS: `OPERATORS` da bo'lmagan chat hech narsa qilolmaydi;
 *  - faqat shaxsiy suhbat: hujjat guruhga yuborilmaydi;
 *  - rasm hech qachon diskka yozilmaydi va saqlanmaydi;
 *  - tekshiruvdan o'tmagan ma'lumot saqlanmaydi;
 *  - jurnalga ism, pasport raqami va xato matni yozilmaydi.
 */

import { t, esc } from "./text.ts";
import { config, isOperator, isSuperadmin } from "./config.ts";
import { day } from "./day.ts";
import { monthsUntilExpiry, failedFields } from "./mrz.ts";
import { splitMessage } from "./batch.ts";
import { buildWorkbook, workbookName, workbookCaption, passportState } from "./excel.ts";
import { documentType, photoBaseName } from "./document-type.ts";
import { parseVisaType, type VisaType } from "./visa.ts";
import { withRetry } from "./throttle.ts";
import { pickPhoto, documentFits } from "./image-pick.ts";
import { makeZip, type ZipEntry } from "./zip.ts";
import {
  cropToDocument,
  quadBounds,
  type Box,
  type Quad,
  type Rotation,
} from "./crop.ts";
import {
  savePhoto,
  deletePhoto,
  deletePhotos,
  readPhoto,
  photoPath,
} from "./photos.ts";
import type { Store, Pilgrim } from "./store.ts";
import { Telegram, type TgUpdate, type Button } from "./telegram.ts";
import type { readDocument } from "./vision.ts";
import { providerInfo } from "./read.ts";
import type { ReadResult } from "./read-shared.ts";

export type Deps = {
  tg: Telegram;
  store: Store;
  read: typeof readDocument;
  /** Rasmni navbatga qo'yish — `index.ts` dagi `Batcher` beradi */
  enqueue: (chatId: number, fileId: string) => void;
  /**
   * Birinchi xodimni ro'yxatga qo'shish: terminalda chiqqan bir martalik
   * kodni yuborsa `true` qaytaradi. `index.ts` beradi.
   */
  tryClaim?: (chatId: number, text: string) => boolean;
  /** Hamkasb uchun yangi bir martalik kod yaratadi. `index.ts` beradi. */
  newCode?: () => { code: string; minutes: number };
  /** So'rovlarni taqsimlaydi (API chegarasiga urilmaslik uchun) */
  throttle?: { wait: () => Promise<void> };
  /** Qayta urinishlar orasida kutish — testda soxta qilinadi */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Botni qayta ishga tushirish (`/restart`).
   *
   * `index.ts` beradi: u protsessni maxsus kod bilan to'xtatadi va
   * Windows'dagi oyna uni bir necha soniyada qaytadan ko'taradi.
   * Testda soxta qilinadi — test protsessi o'chib qolmasligi kerak.
   */
  restart?: () => void | Promise<void>;
  now?: () => Date;
};

/**
 * Bu chat botdan foydalanishi mumkinmi.
 * Ikki manba: `.env` dagi `OPERATORS` va bazaga kod bilan qo'shilganlar.
 */
/**
 * Bot egasimi — statistikani ko'radimi.
 *
 * `.env` da SUPERADMIN bo'lsa, faqat o'sha. Bo'lmasa — eng birinchi
 * ro'yxatga olingan xodim: botni o'rnatgan va birinchi kodni ishlatgan
 * odam. Shu tufayli sozlamaga qo'l tekkizmasdan ham ishlaydi.
 */
function owner(chatId: number, store: Store): boolean {
  if (config.superadmins.length > 0) return isSuperadmin(chatId);
  return store.firstOperator() === chatId;
}

function allowed(chatId: number, store: Store): boolean {
  // Egasi har doim ichkarida: `OPERATORS` ga qo'shishni unutsa ham
  // o'z botidan tashqarida qolmasin
  return isSuperadmin(chatId) || isOperator(chatId) || store.isOperator(chatId);
}

/**
 * Telegram menyusidagi buyruqlar (`setMyCommands`).
 *
 * Egasining talabi: menyuda FAQAT `/start` qolsin. Asosiy ish buyruqsiz
 * bajariladi — rasm yuboriladi, keyin tugmalar bosiladi; uzun menyu esa
 * xodimni chalg'itardi.
 *
 * Qolgan buyruqlar (`/royxat`, `/excel`, `/zip`, `/profil`, `/restart`...)
 * YO'QOLMAGAN — qo'lda yozilsa ishlaydi va hammasi `/yordam` da turadi.
 */
export const COMMANDS = [
  { command: "start", description: "Boshlash va qisqa yo'riqnoma" },
];

/** Arxiv ichidagi papka nomi — xodim zip'ni ochganda shu ko'rinadi. */
const ARCHIVE_FOLDER = "umra-pasportlar";

/** `/royxat` da nechta kishi ko'rsatiladi. Qolgani Excelda. */
const LIST_LIMIT = 40;

/**
 * To'plam ostidagi tugmalar.
 *
 * Egasining talabi: fayllar o'zi kelmasin — xodim nima kerakligini
 * O'ZI tanlasin. Avval Excel ham, arxiv ham avtomatik yuborilardi;
 * ko'pincha ikkalasi ham kerak bo'lmaydi va suhbat keraksiz fayl
 * bilan to'lib ketardi.
 *
 * `data` — 64 baytgacha. Shuning uchun u yerda faqat amal nomi va
 * to'plam raqami turadi, pasport raqamlari esa bazada (`batches`).
 */
/**
 * Pastdagi DOIMIY tugmalar — ekran ostida turadi.
 *
 * Inline tugmalardan farqi: bosilganda oddiy matn yuboradi, ya'ni
 * qaysi to'plam haqida ekanini bilmaydi. Shuning uchun ular ENG
 * OXIRGI to'plam bo'yicha ishlaydi (`store.lastBatch`).
 *
 * Ikkisi ham qoldi, chunki ikkisi ikki xil qulaylik beradi:
 * inline — aniq o'sha to'plam; pastdagi — doim qo'l ostida.
 */
const KEYBOARD_ROWS = (): string[][] => [
  [t.buttons.zip, t.buttons.excel],
  [t.buttons.kinds],
];

/** Pastdagi tugma matni qaysi amalga to'g'ri keladi. */
function keyboardAction(text: string): "zip" | "excel" | "farq" | null {
  // Emojisiz yozilgan bo'lsa ham tushunamiz — xodim qo'lda yozishi mumkin
  const clean = text.replace(/[^\p{L}\s]/gu, "").trim().toLowerCase();
  const match = (label: string) =>
    label.replace(/[^\p{L}\s]/gu, "").trim().toLowerCase() === clean;

  if (match(t.buttons.zip)) return "zip";
  if (match(t.buttons.excel)) return "excel";
  if (match(t.buttons.kinds)) return "farq";
  return null;
}

function batchButtons(batchId: number): Button[] {
  return [
    { text: t.buttons.zip, data: `zip:${batchId}` },
    { text: t.buttons.excel, data: `excel:${batchId}` },
    { text: t.buttons.kinds, data: `farq:${batchId}` },
  ];
}

/**
 * Botning hozirgi holati — `/restart` dan oldin ko'rsatiladi.
 *
 * Ko'pincha "bot ishlamayapti" degani — API kaliti tugagan yoki
 * sozlama buzilgan. Shuning uchun qayta ishga tushirishdan oldin
 * nima ishlayotgani aytiladi.
 */
function botState(store: Store): {
  documents: number;
  provider: string;
  model: string;
  uptime: number;
  crop: boolean;
} {
  const info = providerInfo();
  return {
    documents: store.count(),
    provider: info.name,
    model: info.model,
    uptime: Math.round(process.uptime()),
    crop: config.crop,
  };
}

/** Telegram xabar chegarasini hisobga olib yuboradi. */
async function reply(tg: Telegram, chatId: number, text: string): Promise<void> {
  for (const part of splitMessage(text)) {
    await tg.sendMessage(chatId, part);
  }
}

export async function handleUpdate(update: TgUpdate, deps: Deps): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query, deps);
    return;
  }

  const msg = update.message;
  if (!msg) return;

  const chatId = msg.chat.id;

  // Guruh/kanal — hujjat u yerda ishlanmaydi
  if (msg.chat.type !== "private") {
    if ((msg.text ?? "").startsWith("/")) {
      await deps.tg.sendMessage(chatId, t.groupsNotAllowed);
    }
    return;
  }

  const raw = (msg.text ?? msg.caption ?? "").trim();

  // Oq ro'yxat: birinchi va eng muhim tekshiruv
  if (!allowed(chatId, deps.store)) {
    // Birinchi ishga tushirishda terminalda bir martalik kod chiqadi.
    // Uni faqat serverga/kompyuterga kirish huquqi bor odam ko'radi,
    // shuning uchun kodni yuborgan kishi — egasining o'zi.
    if (raw && deps.tryClaim?.(chatId, raw)) {
      await reply(deps.tg, chatId, t.claimed(chatId));
      return;
    }
    await deps.tg.sendMessage(chatId, t.notOperator);
    return;
  }

  // Pastdagi doimiy tugma bosilgan bo'lsa — oxirgi to'plam bo'yicha
  const pressed = raw ? keyboardAction(raw) : null;
  if (pressed) {
    await runBatchAction(pressed, chatId, deps.store.lastBatch(chatId), deps);
    return;
  }

  if (raw.startsWith("/")) {
    const [head, ...rest] = raw.split(/\s+/);
    const command = head.slice(1).split("@")[0].toLowerCase();
    await handleCommand(command, rest.join(" ").trim(), chatId, deps);
    // Rasm izohida buyruq bo'lsa, rasm ham navbatga tushishi kerak
    if (!hasPhoto(msg)) return;
  }

  if (hasPhoto(msg)) {
    const chosen = chooseImage(msg);
    if ("problem" in chosen) {
      // Katta rasmni navbatga qo'yishdan ma'no yo'q — darhol aytamiz
      await reply(deps.tg, chatId, chosen.problem);
      return;
    }
    deps.enqueue(chatId, chosen.fileId);
    return;
  }

  if (!raw.startsWith("/")) {
    await deps.tg.sendMessage(chatId, t.sendPhoto);
  }
}

/**
 * Tugma bosilgandagi ish — inline va pastdagi tugma uchun BIR XIL.
 *
 * Ikkisi bir xil ishni qilishi kerak, shuning uchun mantiq bitta
 * joyda: aks holda bittasini tuzatib, ikkinchisini unutish oson.
 */
async function runBatchAction(
  action: string,
  chatId: number,
  batchId: number | null,
  deps: Deps,
): Promise<void> {
  const docNumbers = batchId === null ? null : deps.store.batch(batchId, chatId);
  if (!docNumbers) {
    await reply(deps.tg, chatId, t.batchExpired);
    return;
  }

  const rows = deps.store.byDocNumbers(docNumbers);
  if (rows.length === 0) {
    await reply(deps.tg, chatId, t.batchExpired);
    return;
  }

  const now = deps.now?.() ?? new Date();

  try {
    switch (action) {
      case "zip":
        await sendArchive(chatId, rows, deps, now);
        return;
      case "excel":
        await sendWorkbook(chatId, rows, deps, now);
        return;
      case "farq":
        await reply(deps.tg, chatId, t.docKinds(rows));
        return;
    }
  } catch (err) {
    // Ma'lumot joyida, faqat fayl ketmadi. Tugmalar qolgani uchun
    // xodim qayta bosa oladi — shuni aytamiz.
    console.error(
      `[tugma] ${action} bajarilmadi: ${err instanceof Error ? err.message : "noma'lum"}`,
    );
    await reply(deps.tg, chatId, t.filesFailed);
  }
}

/**
 * Tugma bosilganda.
 *
 * Telegram tugmani bosgan odamni alohida yuboradi, ya'ni oq ro'yxat
 * BU YERDA HAM tekshirilishi kerak: tugmali xabar boshqa odamga
 * ko'chirilsa, u ham bosa oladi.
 */
async function handleCallback(
  query: NonNullable<TgUpdate["callback_query"]>,
  deps: Deps,
): Promise<void> {
  const chatId = query.message?.chat.id ?? query.from.id;

  // Aylanuvchi belgini darhol to'xtatamiz — ish uzoq davom etishi mumkin
  await deps.tg.answerCallback(query.id);

  if (!allowed(chatId, deps.store)) {
    await deps.tg.sendMessage(chatId, t.notOperator);
    return;
  }

  const [action, raw] = (query.data ?? "").split(":");
  if (!action) return;

  // Qayta ishga tushirish — tasdiqlangandan keyin
  if (action === "qayta") {
    await deps.tg.sendMessage(chatId, t.restartNow(Boolean(deps.restart) && config.autoRestart));
    // Xabar yetib borishi uchun avval yuboriladi, keyin to'xtatiladi
    await deps.restart?.();
    return;
  }

  // Sinov tugmasi: to'plam ham, fayl ham yo'q — faqat javob
  if (action === "sinov") {
    const labels: Record<string, string> = {
      zip: t.buttons.zip,
      excel: t.buttons.excel,
      farq: t.buttons.kinds,
    };
    await reply(deps.tg, chatId, t.sinovOk(labels[raw] ?? raw));
    return;
  }

  const batchId = Number(raw);
  if (!Number.isInteger(batchId)) return;

  // Ish pastdagi tugma bilan bir xil — mantiq bitta joyda
  await runBatchAction(action, chatId, batchId, deps);
}

function hasPhoto(msg: NonNullable<TgUpdate["message"]>): boolean {
  return Boolean(
    msg.photo?.length || msg.document?.mime_type?.startsWith("image/"),
  );
}

/**
 * Qaysi rasmni olish kerakligini aniqlaydi.
 *
 * Eng kattasini emas, chegaraga SIG'ADIGAN eng kattasini oladi: base64 ga
 * aylanganda hajm ~1.33 barobar oshadi va juda katta rasm API'da
 * tushunarsiz xato beradi.
 */
function chooseImage(
  msg: NonNullable<TgUpdate["message"]>,
): { fileId: string } | { problem: string } {
  const limit = config.imageMaxBytes;

  if (msg.photo?.length) {
    const picked = pickPhoto(msg.photo, limit);
    if (!picked) return { problem: t.imageUnavailable };
    if (picked.kind === "too_big") {
      return { problem: t.imageTooBig(picked.bytes, limit) };
    }
    return { fileId: picked.fileId };
  }

  const doc = msg.document!;
  const fits = documentFits(doc, limit);
  if (!fits.ok) return { problem: t.imageTooBig(fits.bytes, limit) };
  return { fileId: doc.file_id };
}

// --- Buyruqlar ---

async function handleCommand(
  command: string,
  argument: string,
  chatId: number,
  deps: Deps,
): Promise<void> {
  const { tg, store } = deps;
  const now = deps.now?.() ?? new Date();

  switch (command) {
    case "start": {
      // Pastdagi doimiy tugmalar shu yerda o'rnatiladi — bir marta
      // qo'yilsa, keyin suhbatda doim turadi
      const parts = splitMessage(t.start(store.count()));
      for (const [i, part] of parts.entries()) {
        await tg.sendMessage(
          chatId,
          part,
          // Klaviatura oxirgi xabar bilan beriladi
          i === parts.length - 1
            ? { reply_markup: Telegram.replyKeyboard(KEYBOARD_ROWS()) }
            : {},
        );
      }
      return;
    }

    case "yordam":
    case "help":
      await reply(tg, chatId, t.help);
      return;

    // Tugmalar haqiqiy Telegramda ishlayotganini tekshirish.
    // Testlar soxta Telegram bilan ishlaydi — ular tugmaning
    // CHIZILISHINI tekshira olmaydi, bu buyruq esa tekshiradi.
    case "sinov":
      await tg.sendMessage(chatId, t.sinov, {
        reply_markup: Telegram.keyboard([
          { text: t.buttons.zip, data: "sinov:zip" },
          { text: t.buttons.excel, data: "sinov:excel" },
          { text: t.buttons.kinds, data: "sinov:farq" },
        ]),
      });
      return;

    case "royxat": {
      const rows = store.all();
      if (rows.length === 0) {
        await tg.sendMessage(chatId, t.emptyList());
        return;
      }
      // 300 kishilik ro'yxat 6 ta xabarga bo'linib ketardi — telefonda
      // uni aylantirib chiqish qiyin. Birinchi 40 tasi ko'rsatiladi,
      // qolgani Excelda (jadval baribir shu buyruqdan qulayroq).
      const shown = rows.slice(0, LIST_LIMIT);
      const lines = shown.map(
        (p, i) =>
          `${i + 1}. ${esc(p.surname)} ${esc(p.given_names)} — \`${p.doc_number}\`` +
          ` · ${p.expiry_date}`,
      );
      const tail =
        rows.length > shown.length
          ? t.listTruncated(shown.length, rows.length)
          : "";
      await reply(
        tg,
        chatId,
        t.listHeader(rows.length) + lines.join("\n") + tail,
      );
      return;
    }

    case "excel": {
      const rows = store.all();
      if (rows.length === 0) {
        await tg.sendMessage(chatId, t.emptyList());
        return;
      }
      await sendWorkbook(chatId, rows, deps, now);
      return;
    }

    // --- Qayta ishga tushirish ---

    case "restart":
    case "qayta": {
      // Avval holatni ko'rsatamiz: ko'pincha muammo botda emas, sozlamada
      await tg.sendMessage(chatId, t.restartAsk(botState(store)), {
        reply_markup: Telegram.keyboard([
          { text: t.buttons.restart, data: "qayta:ha" },
        ]),
      });
      return;
    }

    // --- Profil va statistika ---

    case "profil": {
      const profile = store.profile(chatId);
      await tg.sendMessage(
        chatId,
        t.profile({
          ...profile,
          limit: config.dailyLimit,
          superadmin: owner(chatId, store),
        }),
      );
      return;
    }

    case "statistika": {
      // Butun bot bo'yicha sonlar faqat egasiga: oddiy xodim
      // hamkasblarining ishini ko'rmasligi kerak
      if (!owner(chatId, store)) {
        await tg.sendMessage(chatId, t.statsDenied);
        return;
      }
      await reply(
        tg,
        chatId,
        t.stats({
          ...store.stats(),
          me: chatId,
          months: config.minPassportMonths,
        }),
      );
      return;
    }

    case "ogohlik": {
      const risky = store
        .all()
        .map((p) => ({ p, state: passportState(p.expiry_date, now) }))
        .filter(({ state }) => state !== "ok");
      if (risky.length === 0) {
        await tg.sendMessage(chatId, t.noWarnings);
        return;
      }
      const lines = risky.map(({ p, state }) => {
        const icon = state === "expired" ? "🔴" : state === "soon" ? "🟡" : "⚪";
        return `${icon} ${esc(p.surname)} ${esc(p.given_names)} — ${p.expiry_date}`;
      });
      await reply(
        tg,
        chatId,
        t.warningsHeader(risky.length) + lines.join("\n"),
      );
      return;
    }

    // --- Viza ---

    case "viza": {
      // `/viza AB1234567 umra 2027-03-15`
      const [doc, typeWord, ...rest] = argument.split(/\s+/).filter(Boolean);
      if (!doc || !typeWord) {
        await reply(tg, chatId, t.visaUsage());
        return;
      }

      const type = parseVisaType(typeWord);
      if (!type) {
        await reply(tg, chatId, t.visaUnknownType(typeWord));
        return;
      }

      // Ixtiyoriy: muddat va raqam
      let expiry: string | null = null;
      let number: string | null = null;
      for (const word of rest) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(word)) expiry = word;
        else number = word;
      }

      const updated = store.setVisaByDocNumber(doc.toUpperCase().replace(/\s+/g, ""), {
        type,
        number,
        expiry,
        source: "qolda",
      });
      if (!updated) {
        await tg.sendMessage(chatId, t.notFound(doc.toUpperCase()));
        return;
      }
      await reply(tg, chatId, t.visaSet(updated, now));
      return;
    }

    case "vizani_ochir": {
      if (!argument) {
        await tg.sendMessage(chatId, t.needDocNumber);
        return;
      }
      const doc = argument.toUpperCase().replace(/\s+/g, "");
      const changed = store.clearVisa(doc);
      await tg.sendMessage(
        chatId,
        changed > 0 ? t.visaCleared(doc) : t.notFound(doc),
      );
      return;
    }

    case "vizasiz": {
      const missing = store.withoutVisa();
      const total = store.count();
      if (missing.length === 0) {
        await tg.sendMessage(chatId, t.allHaveVisa(total));
        return;
      }
      await reply(
        tg,
        chatId,
        t.withoutVisa(
          missing.map((p) => `${esc(p.surname)} ${esc(p.given_names)} — \`${p.doc_number}\``),
          total,
        ),
      );
      return;
    }

    case "vizalar": {
      const rows = store.all();
      if (rows.length === 0) {
        await tg.sendMessage(chatId, t.emptyList());
        return;
      }
      await reply(tg, chatId, t.visaList(rows, now));
      return;
    }

    case "zip": {
      const rows = store.all();
      if (rows.length === 0) {
        await tg.sendMessage(chatId, t.emptyList());
        return;
      }
      await sendArchive(chatId, rows, deps, now);
      return;
    }

    case "ochir": {
      if (!argument) {
        await tg.sendMessage(chatId, t.needDocNumber);
        return;
      }
      const doc = argument.toUpperCase().replace(/\s+/g, "");
      const removed = store.deleteByDocNumber(doc);
      // Yozuv bilan birga rasmi ham o'chadi
      deletePhotos(removed.photos);
      await tg.sendMessage(
        chatId,
        removed.count > 0 ? t.deleted(doc) : t.notFound(doc),
      );
      return;
    }

    case "tozalash": {
      const removed = store.purge();
      deletePhotos(removed.photos);
      await tg.sendMessage(chatId, t.purged(removed.count));
      return;
    }

    // --- Xodimlarni boshqarish ---

    case "kod": {
      if (!deps.newCode) {
        await tg.sendMessage(chatId, "Kod yaratish bu yerda mavjud emas.");
        return;
      }
      const { code, minutes } = deps.newCode();
      await reply(tg, chatId, t.inviteCode(code, minutes));
      return;
    }

    case "xodimlar":
      await reply(
        tg,
        chatId,
        t.operatorList(store.listOperators(), config.operators, chatId),
      );
      return;

    case "xodim_ochir": {
      const id = Number(argument.replace(/\s+/g, ""));
      if (!argument || !Number.isInteger(id)) {
        await tg.sendMessage(chatId, t.needChatId);
        return;
      }
      if (id === chatId) {
        await tg.sendMessage(chatId, t.cannotRemoveSelf);
        return;
      }
      const removed = store.removeOperator(id);
      await tg.sendMessage(
        chatId,
        removed > 0 ? t.operatorRemoved(id) : t.operatorNotFound(id),
      );
      return;
    }

    default:
      await reply(tg, chatId, t.help);
  }
}

// --- Fayl yuborish ---
//
// Ikki joydan chaqiriladi: xodim `/excel` yoki `/zip` yozganda, va rasmlar
// o'qib bo'lingach AVTOMATIK. Egasining talabi: "/start va senga rasmlar
// yuboradi, sen ularni xlsx qilib va .zip papka qilib tashlab berasan" —
// ya'ni fayl so'ralmasdan keladi.

/** Excel jadvalni yuboradi. */
async function sendWorkbook(
  chatId: number,
  rows: Pilgrim[],
  deps: Deps,
  now: Date,
): Promise<void> {
  const bytes = await buildWorkbook(rows, now);
  await deps.tg.sendDocument(
    chatId,
    workbookName(now),
    bytes,
    workbookCaption(rows, now),
  );
  deps.store.logExport(chatId, rows.length);
}

/**
 * Rasmlar + Excel'ni bitta arxiv qilib yuboradi.
 *
 * Arxiv ichida bitta papka bo'ladi (`umra-pasportlar/`), har rasm
 * `FAMILIYA_ISM_turi.jpg` nomi bilan — xodim zip'ni ochib, hujjatlarni
 * qidirmasdan ko'radi.
 */
async function sendArchive(
  chatId: number,
  rows: Pilgrim[],
  deps: Deps,
  now: Date,
): Promise<void> {
  const { tg, store } = deps;
  const entries: ZipEntry[] = [];
  const missing: string[] = [];

  for (const p of rows) {
    const file = p.photo_file;
    const bytes = file ? readPhoto(file) : null;
    if (!file || !bytes) {
      // Rasmi diskda yo'q (qo'lda o'chirilgan yoki saqlanmagan)
      missing.push(`${esc(p.surname)} ${esc(p.given_names)}`);
      continue;
    }
    // Eski yozuvlarda yo'lda guruh papkasi bo'lishi mumkin — faqat nomini olamiz
    const name = file.includes("/") ? file.slice(file.lastIndexOf("/") + 1) : file;
    entries.push({ path: `${ARCHIVE_FOLDER}/${name}`, data: bytes });
  }

  // Excel ham arxivga kiradi — bitta faylda hammasi
  entries.push({
    path: `${ARCHIVE_FOLDER}/${workbookName(now)}`,
    data: await buildWorkbook(rows, now),
  });

  const zip = makeZip(entries);
  const sizeMb = zip.length / (1024 * 1024);
  if (sizeMb > config.zipMaxMb) {
    await reply(tg, chatId, t.zipTooBig(sizeMb, config.zipMaxMb));
    return;
  }

  await tg.sendDocument(
    chatId,
    `${ARCHIVE_FOLDER}-${day(now)}.zip`,
    zip,
    t.zipCaption({
      photos: entries.length - 1,
      people: rows.length,
      missing,
      sizeMb,
    }),
  );
  store.logExport(chatId, rows.length);
}

// --- Rasmlarni to'plam bo'lib o'qish ---

/**
 * Bitta to'plamni o'qiydi va bitta hisobot yuboradi.
 *
 * Rasmlar KETMA-KET o'qiladi: bir vaqtda o'nlab so'rov yuborilsa API
 * cheklovga urilardi va xato bo'lgan rasmni topish qiyinlashardi.
 */
export async function processBatch(
  chatId: number,
  fileIds: string[],
  deps: Deps,
): Promise<void> {
  const { tg, store, read } = deps;
  const now = deps.now?.() ?? new Date();

  if (!store.countAttempt(chatId, fileIds.length)) {
    await tg.sendMessage(chatId, t.dailyLimit);
    return;
  }

  const progress = await tg.sendMessage(chatId, t.photoQueued(fileIds.length));

  const ok: string[] = [];
  /** Nosozliklar: raqami, sababi, kodi va tashxisi bilan */
  const fails: { index: number; why: string; code?: string; diag?: string }[] = [];
  const warnings: string[] = [];
  /** Allaqachon egallangan rasm nomlari (bir xil ismlilar uchun) */
  const takenPaths = new Set(store.photoPaths());
  let photoProblems = 0;
  /** Nechta rasm hujjatning o'ziga qirqildi */
  let croppedCount = 0;
  /** Nechta rasm perspektivasi to'g'rilandi (skanerdek tekis bo'ldi) */
  let flattenedCount = 0;
  /** Nechtasi birinchi urinishda o'qilmay, kesilgan rasmdan o'qildi */
  let zoomedCount = 0;
  /** Nechta rasm to'g'ri holatga burildi */
  let turnedCount = 0;
  /**
   * Qirqilgan, lekin hujjat baribir kichik qolgan rasmlar — xodim
   * yaqinroq turib olishi kerak, aks holda konsullik o'qiy olmaydi
   */
  let lowResCount = 0;
  /**
   * Qirqilmagan rasmlarning RAQAMI: xodim arxivdagi qaysi rasmni
   * qo'lda qirqishini bilishi kerak
   */
  const notCropped: number[] = [];
  /** Viza yorliqlari — pasportlardan alohida hisobot beriladi */
  const visaOk: string[] = [];
  const visaProblems: string[] = [];
  /**
   * Shu to'plamda saqlangan pasportlar. Oxirida aynan shularning
   * Excel'i va arxivi yuboriladi — butun baza emas, hozir yuborilganlar.
   */
  const savedDocs: string[] = [];

  for (let i = 0; i < fileIds.length; i++) {
    // Nima bo'layotgani KO'RINIB tursin.
    //
    // Avval progress faqat 3 rasmdan ko'p bo'lganda va har 3-tasida
    // yangilanardi. Bitta rasm yuborilganda esa "o'qilmoqda..." yozuvi
    // boshdan oxirigacha o'zgarmasdi — ishlayotgan bot ham qotgandek
    // ko'rinardi. Endi kichik to'plamda har rasmda yangilanadi
    // (Telegram chekloviga urilmaydi: 3-5 ta yangilanish arzimas).
    if (i > 0 && (fileIds.length <= 5 || i % 3 === 0)) {
      await tg.editMessage(
        chatId,
        progress.message_id,
        t.progress(i, fileIds.length),
      );
    }

    // So'rovlarni taqsimlaymiz — API chegarasiga urilmaslik uchun
    await deps.throttle?.wait();

    // Vaqtincha xato (chegara, server band) bo'lsa qayta urinamiz:
    // 30 rasmlik to'plam bitta "band" javobidan to'xtamasligi kerak
    const attempt = await withRetry(
      () => readOne(fileIds[i], deps, now),
      (result) => result.kind === "api" && result.retryable,
      {
        tries: 3,
        baseMs: 2000,
        sleep: deps.sleep,
        // Qayta urinish 90 soniyagacha cho'zilishi mumkin — jim
        // turmaymiz, aks holda qotib qolgandek ko'rinadi
        onRetry: (attemptNo, tries) =>
          tg.editMessage(
            chatId,
            progress.message_id,
            t.retrying(i + 1, fileIds.length, attemptNo, tries),
          ),
      },
    );
    const outcome = attempt.value;

    // API ishlamasa to'plamni to'xtatamiz: qolgan 29 rasmni o'qishga
    // urinish ham shu xato bilan tugaydi, faqat pul va vaqt ketadi
    if (outcome.kind === "api") {
      await tg.editMessage(
        chatId,
        progress.message_id,
        t.apiStopped({
          why: outcome.why,
          done: ok.length,
          total: fileIds.length,
          retryable: outcome.retryable,
        }),
      );
      return;
    }

    if (outcome.kind === "failed") {
      fails.push({
        index: i + 1,
        why: outcome.why,
        code: outcome.code,
        diag: outcome.diag,
      });
      continue;
    }

    const { mrz, extra, image } = outcome;
    if (outcome.zoomed) zoomedCount++;

    // Hujjat turi va davlati MRZ'dan — taxmin yo'q
    const type = documentType(mrz);

    // VIZA YORLIG'I: pasport emas, alohida ishlanadi.
    // Viza MRZ'ida pasport raqami yo'q, shuning uchun odamga ism,
    // tug'ilgan sana bo'yicha bog'lanadi.
    if (type.kind === "viza") {
      const found = store.setVisaByIdentity(
        {
          surname: mrz.surname,
          givenNames: mrz.givenNames,
          birthDate: mrz.birthDate,
        },
        {
          // Turi vizaning ko'rinadigan qismida — tekshiruv raqami yo'q
          type: extra.visaType,
          number: mrz.documentNumber,
          expiry: mrz.expiryDate,
          source: "mrz",
        },
      );

      if (found.length === 1 && found[0].visa_source === "mrz") {
        visaOk.push(
          t.visaAttached({
            surname: mrz.surname,
            givenNames: mrz.givenNames,
            number: mrz.documentNumber,
            expiry: mrz.expiryDate,
            type: extra.visaType,
          }),
        );
      } else if (found.length === 0) {
        visaProblems.push(
          t.visaNoOwner(i + 1, `${esc(mrz.surname)} ${esc(mrz.givenNames)}`),
        );
      } else {
        visaProblems.push(
          t.visaAmbiguous(i + 1, `${esc(mrz.surname)} ${esc(mrz.givenNames)}`),
        );
      }
      continue;
    }

    // Rasm hujjatning o'ziga qirqiladi: kadrdagi stol, qo'l va boshqa
    // qog'ozlar olib tashlanadi — viza arizasiga pasportning o'zi ilova
    // qilinadi. Chegara ishonchsiz bo'lsa qirqilmaydi (`crop.ts`).
    // Yonboshlagan rasm ham shu yerda to'g'rilanadi: qirqish va burish
    // birga bajariladi, shunda rasm bir marta qayta siqiladi
    const shot = config.crop
      ? cropToDocument(image, {
          // Burchaklar birinchi: qo'lda ushlangan qiyshiq pasport
          // shular bilan tekis to'rtburchakka to'g'rilanadi
          quad: outcome.quad,
          box: outcome.box,
          marginPct: config.cropMarginPct,
          rotation: outcome.rotation,
        })
      : {
          bytes: image.bytes,
          cropped: false,
          turned: 0 as Rotation,
          mode: "none" as const,
          lowRes: false,
        };
    if (shot.cropped) croppedCount++;
    else notCropped.push(i + 1);
    if (shot.mode === "quad") flattenedCount++;
    if (shot.turned !== 0) turnedCount++;
    if (shot.lowRes) lowResCount++;

    // Rasm fayli odam o'qiydigan nom bilan saqlanadi.
    // Bir xil ismli ikki kishi bo'lsa, ikkinchisiga pasport raqami qo'shiladi.
    const relative = photoPath({
      baseName: photoBaseName({ ...mrz, type }),
      docNumber: mrz.documentNumber,
      mime: image.mime,
      taken: takenPaths,
    });

    let saved: string | null = relative;
    try {
      savePhoto(relative, shot.bytes);
      takenPaths.add(relative);
    } catch (err) {
      // Rasm saqlanmasa ham MA'LUMOT saqlanadi — xodim qo'lda qo'shadi
      console.error(
        `[rasm] saqlanmadi: ${err instanceof Error ? err.message : "noma'lum"}`,
      );
      saved = null;
      photoProblems++;
    }

    const result = store.save({
      added_by: chatId,
      // Guruh tushunchasi olib tashlandi — ustun bazada qoldi (eski yozuvlar)
      group_label: "",
      surname: mrz.surname,
      given_names: mrz.givenNames,
      doc_code: mrz.documentCode,
      doc_number: mrz.documentNumber,
      nationality: mrz.nationality,
      birth_date: mrz.birthDate,
      sex: mrz.sex,
      expiry_date: mrz.expiryDate,
      personal_number: mrz.personalNumber,
      issue_date: extra.issueDate,
      place_of_birth: extra.placeOfBirth,
      authority: extra.authority,
      mrz_format: mrz.format,
      doc_kind: type.kind,
      doc_country: type.country,
      doc_label: type.label,
      photo_file: saved,
    });

    // Ism o'zgargan bo'lsa eski rasm yetim qolmasin
    deletePhoto(result.previousPhoto);
    savedDocs.push(mrz.documentNumber);

    ok.push(
      t.okLine({
        surname: mrz.surname,
        givenNames: mrz.givenNames,
        documentNumber: mrz.documentNumber,
        expiryDate: mrz.expiryDate,
        docLabel: type.label,
        fresh: result.state === "inserted",
      }),
    );

    // Umra talabi: pasport kamida 6 oy amal qilishi kerak
    const left = monthsUntilExpiry(mrz, now);
    if (left !== null) {
      if (left < 0) {
        warnings.push(
          `🔴 ${esc(mrz.surname)} ${esc(mrz.givenNames)} — pasport muddati tugagan`,
        );
      } else if (left < config.minPassportMonths) {
        warnings.push(
          t.warnSoon(
            { surname: mrz.surname, givenNames: mrz.givenNames },
            Math.floor(left),
          ),
        );
      }
    }
  }

  // Shu to'plamda saqlangan pasportlar — fayllar aynan shular bo'yicha
  const batchRows = store.byDocNumbers(savedDocs);

  /**
   * ID KARTANING IKKI TOMONI — bitta hujjat.
   *
   * Xodim kartaning old tomonini ham, orqasini ham yuboradi (konsullikka
   * ikkalasi kerak). Old tomonida MRZ yo'q, shuning uchun u "o'qilmadi"
   * bo'lib chiqardi va xodim nimadir buzilgan deb o'ylardi. Agar shu
   * to'plamda ID KARTA o'qilgan bo'lsa, MRZ ko'rinmagan rasmlar xato
   * emas — ular o'sha kartaning old tomoni.
   */
  const idRead = batchRows.some((row) => row.doc_kind === "id");
  const notes: string[] = [];
  const failed: string[] = [];
  for (const fail of fails) {
    if (idRead && fail.code === "no_mrz") {
      notes.push(t.idOtherSide(fail.index));
      continue;
    }
    failed.push(t.failLine(fail.index, fail.why));
  }
  // Tashxis: model nimani ko'rgan. Hujjat ma'lumoti yo'q — faqat turi
  // va qatorlar soni, shuning uchun ko'rsatish xavfsiz
  const diagnostics = fails
    .filter((f) => failed.length > 0 && f.diag)
    .map((f) => `${f.index}-rasm — ${f.diag}`);

  const report = t.batchReport({
    ok,
    failed,
    notes,
    diagnostics,
    warnings,
    visaOk,
    visaProblems,
    total: fileIds.length,
    files: batchRows.length > 0,
    cropped: croppedCount,
    flattened: flattenedCount,
    zoomed: zoomedCount,
    turned: turnedCount,
    lowRes: lowResCount,
    notCropped,
    photoProblems,
  });

  const parts = splitMessage(report);
  // Birinchi bo'lakni progress xabarining o'rniga yozamiz — suhbat toza qoladi
  await tg.editMessage(chatId, progress.message_id, parts[0]);
  for (const part of parts.slice(1)) {
    await tg.sendMessage(chatId, part);
  }

  if (batchRows.length === 0) return;

  // Fayllar AVTOMATIK yuborilmaydi: xodim tugmalardan o'zi tanlaydi.
  // To'plam bazaga yoziladi, chunki tugmaning `data` si 64 baytgacha va
  // 30 ta pasport raqami u yerga sig'maydi.
  const batchId = store.saveBatch(
    chatId,
    batchRows.map((p) => p.doc_number),
  );

  // Tugmalar hisobotning OXIRGI bo'lagi ostida turadi — uzun hisobot
  // bo'linganda ular ko'rinmay qolmasligi uchun
  await tg.sendMessage(chatId, t.pickAction(batchRows.length), {
    reply_markup: Telegram.keyboard(batchButtons(batchId)),
  });

  // Pastdagi doimiy tugmalar ham turgan bo'lsin: xodim /start
  // bosmagan bo'lsa ham ular paydo bo'ladi
  await tg.sendMessage(chatId, t.keyboardHint, {
    reply_markup: Telegram.replyKeyboard(KEYBOARD_ROWS()),
  });
}

type Outcome =
  | {
      kind: "ok";
      mrz: NonNullable<Awaited<ReturnType<typeof readDocument>> & { ok: true }>["mrz"];
      extra: {
        issueDate: string | null;
        placeOfBirth: string | null;
        authority: string | null;
        /** Viza yorlig'i bo'lsa — turi (MRZ'da yo'q, tasdiqlanmagan) */
        visaType: VisaType | null;
      };
      /** Rasmning o'zi — diskka saqlash uchun kerak */
      image: { bytes: Uint8Array<ArrayBuffer>; mime: string };
      /** Hujjatning kadrdagi chegarasi — qirqish uchun; yo'q bo'lsa null */
      box: Box | null;
      /** Hujjatning to'rt burchagi — perspektivani to'g'rilash uchun */
      quad: Quad | null;
      /** Rasmni to'g'rilash uchun burish: 0 | 90 | 180 | 270 */
      rotation: Rotation;
      /** Birinchi urinishda o'qilmay, kesilgan rasmdan o'qildimi */
      zoomed: boolean;
    }
  | {
      kind: "failed";
      why: string;
      /** `no_mrz` — MRZ umuman ko'rinmadi (ehtimol ID kartaning old tomoni) */
      code?: "no_mrz";
      /** Model nimani ko'rgani: turi va qatorlar soni (ma'lumotsiz) */
      diag?: string;
    }
  /** API'ning o'zi ishlamadi — qolgan rasmlarni o'qishdan ma'no yo'q */
  | { kind: "api"; why: string; retryable: boolean };

/**
 * Birinchi urinishda o'qilmagan rasmni HUJJATGA KESIB qayta o'qiydi.
 *
 * NEGA KERAK: modellar rasmni o'z o'lchamiga kichraytirib oladi. Xodim
 * ID kartani kadrning uchdan birida suratga olsa, kichraytirishdan keyin
 * MRZ qatorlari bir necha pikselga tushib qoladi va o'qilmaydi — hujjat
 * esa odam ko'ziga aniq ko'rinib turadi. Pasportda bu kamroq uchraydi
 * (u kattaroq, MRZ ham yirikroq), ID kartada esa doimiy muammo.
 *
 * Shuning uchun model "o'qiy olmadim" desa, u AYTGAN chegara bo'yicha
 * rasmni hujjatga kesib, bir marta qayta so'raymiz: endi hujjat butun
 * kadrni egallaydi va MRZ bir necha barobar yirik bo'ladi.
 *
 * Ikkinchi urinish ham ishlamasa — BIRINCHI natija qaytadi: uning sababi
 * aniqroq bo'ladi (masalan "ID kartaning old tomoni").
 */
async function closerLook(
  first: ReadResult,
  image: { bytes: Uint8Array<ArrayBuffer>; mime: string },
  deps: Deps,
  now: Date,
): Promise<{
  result: ReadResult;
  zoomed: boolean;
  box: Box | null;
  quad: Quad | null;
}> {
  // Chegara nafaqat o'qilgan natijada, nosozlikda ham bo'lishi mumkin
  const boxOf = (r: ReadResult): Box | null =>
    r.ok ? r.box : "box" in r ? (r.box ?? null) : null;
  const quadOf = (r: ReadResult): Quad | null =>
    r.ok ? r.quad : "quad" in r ? (r.quad ?? null) : null;

  const keep = {
    result: first,
    zoomed: false,
    box: boxOf(first),
    quad: quadOf(first),
  };
  if (first.ok) return keep;

  // Faqat "ko'rinmadi" turidagi sabablar. "Old tomoni" yoki "hujjat emas"
  // bo'lsa yaqindan qarash yordam bermaydi — bekorga pul ketadi
  const worthRetry =
    first.reason === "unreadable" ||
    first.reason === "id_back_unclear" ||
    first.reason === "mrz_shape";
  if (!worthRetry) return keep;

  const box = keep.box;
  const quad = keep.quad;

  // ── 2-urinish: hujjatning o'zi.
  // Model hujjat qayerdaligini aytmagan bo'lsa, bu urinish o'tkazib
  // yuboriladi — lekin MRZ tasmasi (3-urinish) baribir sinab ko'riladi:
  // MRZ deyarli har doim kadrning pastki qismida bo'ladi.
  // Chet kengroq (6%): MRZ hujjatning eng chetida, kesib qo'ymaylik
  const closer =
    box || quad
      ? cropToDocument(image, { box, quad, marginPct: 6 })
      : { cropped: false as const, bytes: image.bytes };
  if (closer.cropped) {
    // Chegara shu yerda ham hisoblanadi: ikkinchi so'rov ham API
    // chegarasiga kiradi
    await deps.throttle?.wait();
    const second = await deps.read({ bytes: closer.bytes, mime: "image/jpeg" }, now);
    if (second.ok) return { result: second, zoomed: true, box, quad };
  }

  // ── 3-urinish: FAQAT MRZ TASMASI
  //
  // Pasport OCHIQ holda suratga olinsa (ikki sahifa ko'rinib tursa),
  // hujjatning o'zi kadrning yarmi bo'ladi, MRZ esa uning pastki 5-10
  // foizi. Hujjatga kesganda ham MRZ kichik qolaveradi — model rasmni
  // o'z o'lchamiga kichraytirganda qatorlar o'qilmay qoladi.
  //
  // Shuning uchun oxirgi urinishda FAQAT MRZ zonasi — hujjatning pastki
  // qismi — kesib yuboriladi: endi qatorlar butun rasmni egallaydi.
  const strip = mrzStrip(box ?? (quad ? quadBounds(quad) : null), rotationOf(first));
  if (!strip) return keep;

  const cut = cropToDocument(image, {
    box: strip.box,
    rotation: strip.rotation,
    marginPct: 2,
    // Tasma keng va past: hujjat shakliga o'xshamaydi, shuning uchun
    // odatdagi tekshiruvlarsiz kesiladi. Bu rasm faqat O'QISH uchun,
    // arxivga tushmaydi
    exact: true,
  });
  if (!cut.cropped) return keep;

  await deps.throttle?.wait();
  const third = await deps.read(
    { bytes: cut.bytes, mime: "image/jpeg" },
    now,
    "mrz_strip",
  );
  return third.ok ? { result: third, zoomed: true, box, quad } : keep;
}

/** Model aytgan burilish (nosozlikda ko'rsatilmaydi — 0 bo'ladi). */
function rotationOf(result: ReadResult): Rotation {
  return result.ok ? result.rotation : 0;
}

/**
 * MRZ zonasi — hujjatning pastki qismi.
 *
 * MRZ har doim ma'lumot sahifasining ENG PASTIDA bo'ladi, shuning uchun
 * chegaraning pastki 45 foizi olinadi (sahifa qiyshiq tursa ham sig'adi).
 * Hujjat teskari turgan bo'lsa (180°) — yuqori qismi.
 *
 * Yonboshlagan rasmda (90/270) MRZ yon tomonda bo'ladi va bu oddiy
 * hisob ishlamaydi: unda tasma olinmaydi.
 */
function mrzStrip(
  box: Box | null,
  rotation: Rotation,
): { box: Box; rotation: Rotation } | null {
  if (rotation === 90 || rotation === 270) return null;
  // Chegara yo'q bo'lsa butun kadrni olamiz: MRZ odatda pastda
  const area = box ?? { x0: 0, y0: 0, x1: 1000, y1: 1000 };
  const height = area.y1 - area.y0;
  if (height < 100) return null;

  const cut = height * 0.45;
  return {
    box:
      rotation === 180
        ? { ...area, y1: area.y0 + cut }
        : { ...area, y0: area.y1 - cut },
    rotation,
  };
}

/**
 * Bitta rasmni yuklab, o'qib, natijasini qaytaradi.
 *
 * Avval rasm o'qilgandan keyin xotirada tozalanardi (`bytes.fill(0)`),
 * chunki saqlanmasligi kerak edi. Endi rasm ataylab diskka saqlanadi
 * (viza arizasiga ilova qilish uchun), shuning uchun tozalashning ma'nosi
 * yo'q — o'qilmagan rasm esa baribir hech qayerga yozilmaydi.
 */
async function readOne(fileId: string, deps: Deps, now: Date): Promise<Outcome> {
  let image: { bytes: Uint8Array<ArrayBuffer>; mime: string };
  try {
    image = await deps.tg.download(fileId);
  } catch {
    return { kind: "failed", why: "faylni yuklab bo'lmadi" };
  }

  try {
    const first = await deps.read(image, now);
    // O'qilmagan bo'lsa — rasmni hujjatga kesib, YAQINDAN qayta o'qiymiz
    const { result, zoomed, box, quad } = await closerLook(first, image, deps, now);

    if (result.ok) {
      return {
        kind: "ok",
        mrz: result.mrz,
        extra: {
          issueDate: result.issueDate,
          placeOfBirth: result.placeOfBirth,
          authority: result.authority,
          visaType: result.visaType,
        },
        image,
        // DIQQAT: ikkinchi urinish KESILGAN rasmda bajarilgan bo'lsa,
        // uning chegarasi o'sha kesilgan kadrga nisbatan bo'ladi va asl
        // rasmga to'g'ri kelmaydi. Shuning uchun arxiv uchun birinchi
        // urinishning chegarasi olinadi.
        box,
        quad,
        rotation: result.rotation,
        zoomed,
      };
    }

    switch (result.reason) {
      case "checks_failed":
        return { kind: "failed", why: t.reasonChecks(failedFields(result.mrz)) };
      case "not_a_document":
        return { kind: "failed", why: t.reasonNotDocument };
      // ID kartaning old tomoni — MRZ orqa tomonda. Yechimi rasmni
      // yaxshilash emas, boshqa tomonini olish
      case "id_front":
        return {
          kind: "failed",
          why: t.reasonIdBack,
          code: "no_mrz",
          diag: result.diag,
        };
      case "id_back_unclear":
        return { kind: "failed", why: t.reasonIdUnclear, diag: result.diag };
      // MRZ ko'rindi, lekin qatorlar shakli to'g'ri kelmadi.
      // Sabab O'ZIMIZNING kodimizdan (qatorlar soni va uzunligi),
      // ichida hujjat ma'lumoti yo'q — xodimga aytamiz, chunki
      // "xira yoki kesilgan" bu yerda noto'g'ri maslahat bo'lardi
      case "mrz_shape":
        return { kind: "failed", why: result.problem };
      case "refused":
        return { kind: "failed", why: t.reasonRefused };
      case "api_error":
        // Sabab API darajasida — hujjat ma'lumoti yo'q, yozish xavfsiz.
        // Asl xabar ham yoziladi: tarjima qilingan matn tashxisga
        // yetarli emas, Google nima deganini bilish kerak.
        console.error(`[api] ${result.problem}`);
        if (result.detail) console.error(`[api] asl xabar: ${result.detail}`);
        return { kind: "api", why: result.problem, retryable: result.retryable };
      default:
        return {
          kind: "failed",
          why: t.reasonUnreadable,
          // MRZ umuman ko'rinmagan bo'lsa — bu ehtimol ID kartaning
          // old tomoni. Shu to'plamda uning orqa tomoni o'qilgan bo'lsa,
          // xato emas, izoh bo'lib chiqadi
          code: result.noMrz ? "no_mrz" : undefined,
          diag: result.diag,
        };
    }
  } catch (err) {
    // Xato MATNI jurnalga yozilmaydi — ichida hujjat ma'lumoti bo'lishi mumkin
    console.error(`[read] xato turi: ${err instanceof Error ? err.name : "noma'lum"}`);
    return { kind: "failed", why: t.reasonTechnical };
  }
}
