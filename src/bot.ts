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
import { config, isOperator } from "./config.ts";
import { monthsUntilExpiry, failedFields } from "./mrz.ts";
import { splitMessage } from "./batch.ts";
import { buildWorkbook, workbookName, workbookCaption, passportState } from "./excel.ts";
import { documentType, photoBaseName } from "./document-type.ts";
import { parseVisaType, type VisaType } from "./visa.ts";
import { withRetry } from "./throttle.ts";
import { pickPhoto, documentFits } from "./image-pick.ts";
import { makeZip, type ZipEntry } from "./zip.ts";
import {
  savePhoto,
  deletePhoto,
  deletePhotos,
  readPhoto,
  photoPath,
  groupFolder,
  removeGroupFolder,
} from "./photos.ts";
import type { Store } from "./store.ts";
import type { Telegram, TgUpdate } from "./telegram.ts";
import type { readDocument } from "./vision.ts";

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
  now?: () => Date;
};

/**
 * Bu chat botdan foydalanishi mumkinmi.
 * Ikki manba: `.env` dagi `OPERATORS` va bazaga kod bilan qo'shilganlar.
 */
function allowed(chatId: number, store: Store): boolean {
  return isOperator(chatId) || store.isOperator(chatId);
}

export const COMMANDS = [
  { command: "guruh", description: "Joriy safar guruhini belgilash" },
  { command: "royxat", description: "Guruhdagi kishilar" },
  { command: "excel", description: "Excel jadvalni olish" },
  { command: "ogohlik", description: "Pasporti tez tugaydiganlar" },
  { command: "yordam", description: "Buyruqlar ro'yxati" },
];

/** Telegram xabar chegarasini hisobga olib yuboradi. */
async function reply(tg: Telegram, chatId: number, text: string): Promise<void> {
  for (const part of splitMessage(text)) {
    await tg.sendMessage(chatId, part);
  }
}

export async function handleUpdate(update: TgUpdate, deps: Deps): Promise<void> {
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
  const group = store.currentGroup(chatId);

  switch (command) {
    case "start":
      await reply(tg, chatId, t.start(group));
      return;

    case "yordam":
    case "help":
      await reply(tg, chatId, t.help);
      return;

    case "guruh": {
      if (!argument) {
        await tg.sendMessage(chatId, t.groupCurrent(group, store.count(group)));
        return;
      }
      // "-" yoki "yoq" — guruhni olib tashlash
      if (argument === "-" || argument.toLowerCase() === "yoq") {
        store.setCurrentGroup(chatId, "");
        await tg.sendMessage(chatId, t.groupCleared);
        return;
      }
      const label = argument.slice(0, 60);
      store.setCurrentGroup(chatId, label);
      await tg.sendMessage(chatId, t.groupSet(label));
      return;
    }

    case "guruhlar":
      await reply(tg, chatId, t.groupList(store.groups()));
      return;

    case "royxat": {
      const rows = store.all(group || undefined);
      if (rows.length === 0) {
        await tg.sendMessage(chatId, t.emptyList(group));
        return;
      }
      const lines = rows.map(
        (p, i) =>
          `${i + 1}. ${esc(p.surname)} ${esc(p.given_names)} — \`${p.doc_number}\`` +
          ` · ${p.expiry_date}`,
      );
      await reply(tg, chatId, t.listHeader(group, rows.length) + lines.join("\n"));
      return;
    }

    case "excel": {
      const wantAll = /^(hammasi|all|barcha)$/i.test(argument);
      const scope = wantAll ? undefined : group || undefined;
      const rows = store.all(scope);
      if (rows.length === 0) {
        await tg.sendMessage(chatId, t.emptyList(wantAll ? "" : group));
        return;
      }
      const bytes = await buildWorkbook(rows, now);
      await tg.sendDocument(
        chatId,
        workbookName(now, wantAll ? undefined : group || undefined),
        bytes,
        workbookCaption(rows, now),
      );
      store.logExport(chatId, rows.length);
      return;
    }

    case "ogohlik": {
      const risky = store
        .all(group || undefined)
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
      const missing = store.withoutVisa(group || undefined);
      const total = store.count(group || undefined);
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
      const rows = store.all(group || undefined);
      if (rows.length === 0) {
        await tg.sendMessage(chatId, t.emptyList(group));
        return;
      }
      await reply(tg, chatId, t.visaList(rows, now));
      return;
    }

    case "zip": {
      const wantAll = /^(hammasi|all|barcha)$/i.test(argument);
      const scope = wantAll ? undefined : group || undefined;
      const rows = store.all(scope);
      if (rows.length === 0) {
        await tg.sendMessage(chatId, t.emptyList(wantAll ? "" : group));
        return;
      }

      const folder = wantAll ? "umra-hujjatlar" : groupFolder(group);
      const entries: ZipEntry[] = [];
      const missing: string[] = [];

      for (const p of rows) {
        const file = p.photo_file;
        const bytes = file ? readPhoto(file) : null;
        if (!file || !bytes) {
          missing.push(`${esc(p.surname)} ${esc(p.given_names)}`);
          continue;
        }
        // Arxiv ichida: <papka>/<FAMILIYA_ISM_turi>.jpg
        const name = file.includes("/") ? file.slice(file.lastIndexOf("/") + 1) : file;
        entries.push({
          path: `${folder}/${wantAll ? `${groupFolder(p.group_label)}/` : ""}${name}`,
          data: bytes,
        });
      }

      // Excel ham arxivga qo'shiladi — bitta faylda hammasi
      entries.push({
        path: `${folder}/${workbookName(now, wantAll ? undefined : group || undefined)}`,
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
        `${folder}-${now.toISOString().slice(0, 10)}.zip`,
        zip,
        t.zipCaption({
          photos: entries.length - 1,
          people: rows.length,
          missing,
          sizeMb,
        }),
      );
      store.logExport(chatId, rows.length);
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

    case "guruhni_ochir": {
      if (!argument) {
        await tg.sendMessage(chatId, t.needGroupName);
        return;
      }
      const removed = store.deleteGroup(argument);
      deletePhotos(removed.photos);
      removeGroupFolder(argument);
      await tg.sendMessage(chatId, t.groupDeleted(argument, removed.count));
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
  const group = store.currentGroup(chatId);

  if (!store.countAttempt(chatId, fileIds.length)) {
    await tg.sendMessage(chatId, t.dailyLimit);
    return;
  }

  const progress = await tg.sendMessage(chatId, t.photoQueued(fileIds.length));

  const ok: string[] = [];
  const failed: string[] = [];
  const warnings: string[] = [];
  /** Shu guruhda allaqachon egallangan rasm yo'llari (nom to'qnashuvi uchun) */
  const takenPaths = new Set(store.photoPaths(group || undefined));
  let photoProblems = 0;
  /** Viza yorliqlari — pasportlardan alohida hisobot beriladi */
  const visaOk: string[] = [];
  const visaProblems: string[] = [];

  for (let i = 0; i < fileIds.length; i++) {
    // Progressni har 3 rasmda yangilaymiz — har birida yangilash
    // Telegram chekloviga urilardi
    if (fileIds.length > 3 && i > 0 && i % 3 === 0) {
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
      { tries: 3, baseMs: 2000, sleep: deps.sleep },
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
      failed.push(t.failLine(i + 1, outcome.why));
      continue;
    }

    const { mrz, extra, image } = outcome;

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

    // Rasm fayli odam o'qiydigan nom bilan saqlanadi.
    // Bir xil ismli ikki kishi bo'lsa, ikkinchisiga pasport raqami qo'shiladi.
    const relative = photoPath({
      group,
      baseName: photoBaseName({ ...mrz, type }),
      docNumber: mrz.documentNumber,
      mime: image.mime,
      taken: takenPaths,
    });

    let saved: string | null = relative;
    try {
      savePhoto(relative, image.bytes);
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
      group_label: group,
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

    // Ism yoki guruh o'zgargan bo'lsa eski rasm yetim qolmasin
    deletePhoto(result.previousPhoto);

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

  const report = t.batchReport({
    ok,
    failed,
    warnings,
    visaOk,
    visaProblems,
    group,
    total: fileIds.length,
  });

  const parts = splitMessage(report);
  // Birinchi bo'lakni progress xabarining o'rniga yozamiz — suhbat toza qoladi
  await tg.editMessage(chatId, progress.message_id, parts[0]);
  for (const part of parts.slice(1)) {
    await tg.sendMessage(chatId, part);
  }
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
    }
  | { kind: "failed"; why: string }
  /** API'ning o'zi ishlamadi — qolgan rasmlarni o'qishdan ma'no yo'q */
  | { kind: "api"; why: string; retryable: boolean };

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
    const result = await deps.read(image, now);

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
      };
    }

    switch (result.reason) {
      case "checks_failed":
        return { kind: "failed", why: t.reasonChecks(failedFields(result.mrz)) };
      case "not_a_document":
        return { kind: "failed", why: t.reasonNotDocument };
      case "refused":
        return { kind: "failed", why: t.reasonRefused };
      case "api_error":
        // Sabab API darajasida — hujjat ma'lumoti yo'q, yozish xavfsiz
        console.error(`[api] ${result.problem}`);
        return { kind: "api", why: result.problem, retryable: result.retryable };
      default:
        return { kind: "failed", why: t.reasonUnreadable };
    }
  } catch (err) {
    // Xato MATNI jurnalga yozilmaydi — ichida hujjat ma'lumoti bo'lishi mumkin
    console.error(`[read] xato turi: ${err instanceof Error ? err.name : "noma'lum"}`);
    return { kind: "failed", why: t.reasonTechnical };
  }
}
