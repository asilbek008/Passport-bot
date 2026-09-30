/**
 * Botning oqimi: kim nima qilishi mumkin va to'plam hisoboti to'g'ri chiqadimi.
 * Telegram va rasm o'qigich o'rniga soxta (fake) bog'liqliklar beriladi,
 * shuning uchun test tarmoqqa chiqmaydi va API hisobini yemaydi.
 */

import test from "node:test";
import assert from "node:assert/strict";

// config muhitni KERAK BO'LGANDA o'qiydi, shuning uchun bu yerda o'rnatsa bo'ladi
process.env.OPERATORS = "111,222";
process.env.MIN_PASSPORT_MONTHS = "6";
process.env.DAILY_LIMIT = "10";

const { handleUpdate, processBatch } = await import("../src/bot.ts");
const { Store } = await import("../src/store.ts");
const { checkDigit, parseMrz } = await import("../src/mrz.ts");
const { splitMessage } = await import("../src/batch.ts");
import type { Telegram, TgUpdate } from "../src/telegram.ts";
import type { ReadResult } from "../src/vision.ts";

const REF = new Date("2026-09-29T00:00:00Z");
const OPERATOR = 111;
const STRANGER = 999;

// --- To'g'ri tekshiruv raqamlari bilan MRZ tuzuvchi ---

function td3(o: {
  surname: string;
  given: string;
  docNumber: string;
  birth: string;
  sex: "M" | "F";
  expiry: string;
}): string {
  const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);
  const l1 = pad(`P<UZB${o.surname}<<${o.given.replace(/ /g, "<")}`, 44);

  const doc = pad(o.docNumber, 9);
  const personal = "<".repeat(14);
  const head =
    doc +
    checkDigit(doc) +
    "UZB" +
    o.birth +
    checkDigit(o.birth) +
    o.sex +
    o.expiry +
    checkDigit(o.expiry) +
    personal +
    "0";
  const composite = head.slice(0, 10) + head.slice(13, 20) + head.slice(21, 43);
  return `${l1}\n${head}${checkDigit(composite)}`;
}

function okResult(mrzText: string): ReadResult {
  const mrz = parseMrz(mrzText, REF);
  assert.equal(mrz.valid, true, "test namunasi o'zi to'g'ri bo'lishi kerak");
  return {
    ok: true,
    mrz,
    issueDate: "2020-01-02",
    placeOfBirth: "QIZIRIQ",
    authority: "IIB",
  };
}

// --- Soxta bog'liqliklar ---

type Sent = { chatId: number; text: string };

function makeDeps(reads: Record<string, ReadResult | "throw">) {
  const sent: Sent[] = [];
  const edits: Sent[] = [];
  const documents: { name: string; caption: string; size: number }[] = [];
  const queued: { chatId: number; fileId: string }[] = [];
  let nextId = 1;

  const tg = {
    async sendMessage(chatId: number, text: string) {
      sent.push({ chatId, text });
      return { message_id: nextId++ };
    },
    async editMessage(chatId: number, _messageId: number, text: string) {
      edits.push({ chatId, text });
    },
    async sendDocument(
      _chatId: number,
      name: string,
      bytes: Uint8Array<ArrayBuffer>,
      caption = "",
    ) {
      documents.push({ name, caption, size: bytes.length });
    },
    async download(fileId: string) {
      return { bytes: new Uint8Array(8) as Uint8Array<ArrayBuffer>, mime: "image/jpeg" };
    },
  } as unknown as Telegram;

  const store = new Store(":memory:");

  const deps = {
    tg,
    store,
    read: (async (image: unknown, _today?: Date) => {
      void image;
      throw new Error("fileId bo'yicha aniqlanadi");
    }) as never,
    enqueue: (chatId: number, fileId: string) => queued.push({ chatId, fileId }),
    now: () => REF,
  };

  // `read` fileId'ni bilmaydi, shuning uchun download orqali uzatamiz
  let currentFile = "";
  (tg as unknown as { download: (id: string) => Promise<unknown> }).download = async (
    id: string,
  ) => {
    currentFile = id;
    return { bytes: new Uint8Array(8), mime: "image/jpeg" };
  };
  deps.read = (async () => {
    const r = reads[currentFile];
    if (r === "throw") throw new Error("sinov xatosi");
    if (!r) throw new Error(`test sozlanmagan: ${currentFile}`);
    return r;
  }) as never;

  return { deps, sent, edits, documents, queued, store };
}

const photoUpdate = (chatId: number, fileId: string): TgUpdate => ({
  update_id: 1,
  message: {
    message_id: 1,
    chat: { id: chatId, type: "private" },
    photo: [
      { file_id: `${fileId}-small`, width: 90, height: 60 },
      { file_id: fileId, width: 1280, height: 960 },
    ],
  },
});

const textUpdate = (chatId: number, text: string, type = "private"): TgUpdate => ({
  update_id: 1,
  message: { message_id: 1, chat: { id: chatId, type }, text },
});

// --- Oq ro'yxat ---

test("ro'yxatda yo'q odam hech narsa qilolmaydi", async () => {
  const { deps, sent, queued } = makeDeps({});

  await handleUpdate(textUpdate(STRANGER, "/excel"), deps as never);
  await handleUpdate(photoUpdate(STRANGER, "f1"), deps as never);

  assert.equal(queued.length, 0, "rasm navbatga tushmasligi kerak");
  assert.equal(sent.length, 2);
  for (const m of sent) assert.match(m.text, /faqat xodimlar uchun/);
  deps.store.close();
});

test("guruhga yuborilgan hujjat ishlanmaydi", async () => {
  const { deps, sent, queued } = makeDeps({});
  await handleUpdate(
    { update_id: 1, message: { message_id: 1, chat: { id: -100, type: "supergroup" }, photo: [{ file_id: "f1", width: 10, height: 10 }] } },
    deps as never,
  );
  assert.equal(queued.length, 0);
  assert.equal(sent.length, 0, "guruhda rasmga javob ham berilmaydi");
  deps.store.close();
});

test("xodimning rasmi navbatga tushadi — eng katta o'lcham", async () => {
  const { deps, queued } = makeDeps({});
  await handleUpdate(photoUpdate(OPERATOR, "big"), deps as never);
  assert.deepEqual(queued, [{ chatId: OPERATOR, fileId: "big" }]);
  deps.store.close();
});

// --- Guruh ---

test("/guruh joriy guruhni belgilaydi va yozuvga tushadi", async () => {
  const mrz = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1234567",
    birth: "850412", sex: "M", expiry: "300101",
  });
  const { deps, sent, store } = makeDeps({ f1: okResult(mrz) });

  await handleUpdate(textUpdate(OPERATOR, "/guruh Umra mart"), deps as never);
  assert.match(sent.at(-1)!.text, /Umra mart/);

  await processBatch(OPERATOR, ["f1"], deps as never);

  const rows = store.all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].group_label, "Umra mart");
  assert.equal(rows[0].added_by, OPERATOR);
  assert.equal(rows[0].surname, "KARIMOV");
  assert.equal(rows[0].doc_number, "AB1234567");
  assert.equal(rows[0].issue_date, "2020-01-02");
  store.close();
});

// --- To'plam hisoboti ---

test("to'plam: yaxshi va yomon rasmlar bitta hisobotda ajratiladi", async () => {
  const good1 = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1111111",
    birth: "850412", sex: "M", expiry: "300101",
  });
  const good2 = td3({
    surname: "SALIMOVA", given: "NARGIZA", docNumber: "AB2222222",
    birth: "900707", sex: "F", expiry: "310202",
  });

  const { deps, edits, store } = makeDeps({
    f1: okResult(good1),
    f2: { ok: false, reason: "unreadable", problem: "xira" },
    f3: okResult(good2),
  });

  await processBatch(OPERATOR, ["f1", "f2", "f3"], deps as never);

  // Hisobot progress xabarining o'rniga yoziladi
  const report = edits.map((e) => e.text).join("\n");
  assert.match(report, /2 \/ 3 o'qildi/);
  assert.match(report, /KARIMOV/);
  assert.match(report, /SALIMOVA/);
  assert.match(report, /2-rasm/, "o'qilmagan rasmning RAQAMI ko'rsatilishi kerak");
  assert.match(report, /O'qilmadi \(1\)/);

  assert.equal(store.count(), 2, "faqat o'qilganlar saqlanadi");
  store.close();
});

test("tekshiruvdan o'tmagan pasport SAQLANMAYDI", async () => {
  const mrz = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1234567",
    birth: "850412", sex: "M", expiry: "300101",
  });
  // Pasport raqamini buzamiz — tekshiruv raqami mos kelmaydi
  const broken = parseMrz(mrz.replace("AB1234567", "AB1234568"), REF);
  assert.equal(broken.valid, false);

  const { deps, edits, store } = makeDeps({
    f1: { ok: false, reason: "checks_failed", problem: "mos kelmadi", mrz: broken },
  });

  await processBatch(OPERATOR, ["f1"], deps as never);

  assert.equal(store.count(), 0, "ishonchsiz ma'lumot bazaga tushmasligi shart");
  const report = edits.map((e) => e.text).join("\n");
  assert.match(report, /tekshiruvdan o'tmadi/);
  assert.match(report, /saqlanmadi/);
  store.close();
});

test("texnik xato butun to'plamni to'xtatmaydi", async () => {
  const good = td3({
    surname: "TOSHEV", given: "BOBUR", docNumber: "AB3333333",
    birth: "880101", sex: "M", expiry: "300101",
  });
  const { deps, edits, store } = makeDeps({ f1: "throw", f2: okResult(good) });

  await processBatch(OPERATOR, ["f1", "f2"], deps as never);

  assert.equal(store.count(), 1, "ikkinchi rasm baribir o'qilishi kerak");
  assert.match(edits.map((e) => e.text).join("\n"), /1 \/ 2 o'qildi/);
  store.close();
});

test("pasport muddati yetmasa ogohlik chiqadi", async () => {
  // 2026-12 — REF dan 6 oydan kam
  const soon = td3({
    surname: "ALIYEV", given: "SARDOR", docNumber: "AB4444444",
    birth: "800101", sex: "M", expiry: "261201",
  });
  const expired = td3({
    surname: "USMONOV", given: "JAHON", docNumber: "AB5555555",
    birth: "800101", sex: "M", expiry: "250101",
  });

  const { deps, edits, store } = makeDeps({
    f1: okResult(soon),
    f2: okResult(expired),
  });

  await processBatch(OPERATOR, ["f1", "f2"], deps as never);
  const report = edits.map((e) => e.text).join("\n");

  assert.match(report, /Diqqat/);
  assert.match(report, /ALIYEV[^\n]*qoldi/, "tez tugaydiganga ogohlik");
  assert.match(report, /USMONOV[^\n]*tugagan/, "tugaganga ogohlik");
  // Ikkisi ham SAQLANADI — xodim ko'rib, o'zi qaror qiladi
  assert.equal(store.count(), 2);
  store.close();
});

test("bir pasport ikki marta yuborilsa ro'yxat ikkilanmaydi", async () => {
  const mrz = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1234567",
    birth: "850412", sex: "M", expiry: "300101",
  });
  const { deps, edits, store } = makeDeps({ f1: okResult(mrz), f2: okResult(mrz) });

  await processBatch(OPERATOR, ["f1"], deps as never);
  await processBatch(OPERATOR, ["f2"], deps as never);

  assert.equal(store.count(), 1);
  assert.match(edits.at(-1)!.text, /yangilandi/);
  store.close();
});

// --- Kunlik cheklov ---

test("kunlik cheklovdan oshsa o'qilmaydi", async () => {
  const { deps, sent, store } = makeDeps({});
  // DAILY_LIMIT = 10
  await processBatch(OPERATOR, Array.from({ length: 11 }, (_, i) => `f${i}`), deps as never);
  assert.match(sent.at(-1)!.text, /chegaraga/);
  assert.equal(store.count(), 0);
  store.close();
});

// --- Excel ---

test("/excel faylni yuboradi va jurnalga yozadi", async () => {
  const mrz = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1234567",
    birth: "850412", sex: "M", expiry: "300101",
  });
  const { deps, documents, sent, store } = makeDeps({ f1: okResult(mrz) });

  await handleUpdate(textUpdate(OPERATOR, "/guruh Umra mart"), deps as never);
  await processBatch(OPERATOR, ["f1"], deps as never);
  await handleUpdate(textUpdate(OPERATOR, "/excel"), deps as never);

  assert.equal(documents.length, 1);
  assert.match(documents[0].name, /umra-hujjatlar-umra-mart-2026-09-29\.xlsx/);
  assert.match(documents[0].caption, /\*1\* kishi/);
  assert.ok(documents[0].size > 2000, "haqiqiy xlsx bo'lishi kerak");
  store.close();
});

test("bo'sh guruhda /excel fayl yubormaydi", async () => {
  const { deps, documents, sent, store } = makeDeps({});
  await handleUpdate(textUpdate(OPERATOR, "/excel"), deps as never);
  assert.equal(documents.length, 0);
  assert.match(sent.at(-1)!.text, /qabul qilinmagan/);
  store.close();
});

test("uzun hisobot Telegram chegarasiga bo'linadi", () => {
  // 60 kishilik hisobot bitta xabarga sig'maydi
  const lines = Array.from({ length: 60 }, (_, i) => `✅ FAMILIYA${i} ISM${i} — \`AB123456${i}\``);
  const parts = splitMessage(lines.join("\n"));
  for (const p of parts) assert.ok(p.length <= 3900);
  assert.equal(parts.join("\n").split("\n").length, 60);
});
