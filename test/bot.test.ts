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

// Rasmlar vaqtinchalik papkaga yozilsin — loyiha papkasi toza qolsin
import {
  mkdtempSync,
  existsSync,
  readdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const PHOTOS = mkdtempSync(join(tmpdir(), "umra-photos-"));
process.env.PHOTOS_DIR = PHOTOS;

const { handleUpdate, processBatch } = await import("../src/bot.ts");
const { Store } = await import("../src/store.ts");
const { checkDigit, parseMrz } = await import("../src/mrz.ts");
const { splitMessage } = await import("../src/batch.ts");
const { Invites } = await import("../src/invites.ts");
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
  /** Hujjatni bergan davlat (standarti UZB) */
  state?: string;
  /** Fuqarolik (berilmasa `state` olinadi) */
  nation?: string;
}): string {
  const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);
  const state = pad(o.state ?? "UZB", 3);
  const l1 = pad(`P<${state}${o.surname}<<${o.given.replace(/ /g, "<")}`, 44);

  const doc = pad(o.docNumber, 9);
  const personal = "<".repeat(14);
  const head =
    doc +
    checkDigit(doc) +
    pad(o.nation ?? o.state ?? "UZB", 3) +
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

/** TD1 (ID karta) MRZ — to'g'ri tekshiruv raqamlari bilan. */
function td1Id(): string {
  const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);
  const doc = "D23145890";
  const l1 = pad(`IDUZB${doc}${checkDigit(doc)}`, 30);
  const head =
    "850412" + checkDigit("850412") + "M" +
    "310101" + checkDigit("310101") + "UZB" + "<".repeat(11);
  const composite =
    l1.slice(5, 30) + head.slice(0, 7) + head.slice(8, 15) + head.slice(18, 29);
  const l3 = pad("ISMOILOV<<DAVRON", 30);
  return [l1, head + checkDigit(composite), l3].join("\n");
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
    visaType: null,
    // Chegara yo'q — rasm qirqilmaydi (qirqish alohida testda)
    box: null,
  };
}

// --- Soxta bog'liqliklar ---

type Sent = { chatId: number; text: string };

/**
 * Bitta rasm uchun javob. Massiv berilsa — har chaqiruvda keyingisi
 * qaytadi (qayta urinishni sinash uchun), oxirgisi takrorlanadi.
 */
type Reply = ReadResult | "throw";

function makeDeps(
  reads: Record<string, Reply | Reply[]>,
  /** Telegram qaytaradigan rasm baytlari — qirqishni sinash uchun */
  imageBytes?: Uint8Array,
) {
  const sent: Sent[] = [];
  const edits: Sent[] = [];
  const documents: {
    name: string;
    caption: string;
    size: number;
    bytes?: Uint8Array;
  }[] = [];
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
      documents.push({ name, caption, size: bytes.length, bytes });
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
    return { bytes: imageBytes ?? new Uint8Array(8), mime: "image/jpeg" };
  };
  /** Har rasm bo'yicha nechta so'rov ketdi — qayta urinishni sanash uchun */
  const calls: Record<string, number> = {};
  deps.read = (async () => {
    const setting = reads[currentFile];
    if (!setting) throw new Error(`test sozlanmagan: ${currentFile}`);
    const seen = calls[currentFile] ?? 0;
    calls[currentFile] = seen + 1;
    const r = Array.isArray(setting)
      ? setting[Math.min(seen, setting.length - 1)]
      : setting;
    if (r === "throw") throw new Error("sinov xatosi");
    return r;
  }) as never;

  // Bir martalik kodlar — birinchi xodimni ro'yxatga qo'shish uchun
  const invites = new Invites(60);
  (deps as Record<string, unknown>).tryClaim = (chatId: number, text: string) => {
    if (!invites.claim(text)) return false;
    store.addOperator(chatId);
    return true;
  };
  (deps as Record<string, unknown>).newCode = () => ({
    code: invites.create(),
    minutes: 60,
  });

  return { deps, sent, edits, documents, queued, store, invites, calls };
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

test("yuborilgan pasport bazaga tushadi", async () => {
  const mrz = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1234567",
    birth: "850412", sex: "M", expiry: "300101",
  });
  const { deps, store } = makeDeps({ f1: okResult(mrz) });

  await processBatch(OPERATOR, ["f1"], deps as never);

  const rows = store.all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].group_label, "", "guruh tushunchasi olib tashlandi");
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

test("/excel hammasini qayta jadval qilib beradi", async () => {
  const mrz = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1234567",
    birth: "850412", sex: "M", expiry: "300101",
  });
  const { deps, documents, sent, store } = makeDeps({ f1: okResult(mrz) });

  await processBatch(OPERATOR, ["f1"], deps as never);
  // To'plamdan keyin Excel va arxiv AVTOMATIK ketadi
  assert.equal(documents.length, 2, "jadval va arxiv o'zi yuborilishi kerak");

  await handleUpdate(textUpdate(OPERATOR, "/excel"), deps as never);

  assert.equal(documents.length, 3);
  const excel = documents.at(-1)!;
  assert.equal(excel.name, "umra-pasportlar-2026-09-29.xlsx");
  assert.match(excel.caption, /\*1\* kishi/);
  assert.ok(excel.size > 2000, "haqiqiy xlsx bo'lishi kerak");
  store.close();
});

test("yozuv bo'lmasa /excel fayl yubormaydi", async () => {
  const { deps, documents, sent, store } = makeDeps({});
  await handleUpdate(textUpdate(OPERATOR, "/excel"), deps as never);
  assert.equal(documents.length, 0);
  assert.match(sent.at(-1)!.text, /qabul qilinmagan/);
  store.close();
});

// --- Ruxsat olish (birinchi ishga tushirish) ---

test("to'g'ri kod bilan begona odam xodimga aylanadi", async () => {
  const { deps, sent, store, invites } = makeDeps({});
  const code = invites.create();

  // Kodni bilmasa — rad etiladi
  await handleUpdate(textUpdate(STRANGER, "ABC999"), deps as never);
  assert.match(sent.at(-1)!.text, /faqat xodimlar uchun/);
  assert.equal(store.isOperator(STRANGER), false);

  // To'g'ri kod bilan — ruxsat oladi
  await handleUpdate(textUpdate(STRANGER, code), deps as never);
  assert.match(sent.at(-1)!.text, /Ruxsat berildi/);
  assert.equal(store.isOperator(STRANGER), true);

  // Endi buyruq ishlaydi
  await handleUpdate(textUpdate(STRANGER, "/royxat"), deps as never);
  assert.match(sent.at(-1)!.text, /qabul qilinmagan/);
  store.close();
});

test("kod bir marta ishlaydi — ikkinchi odam o'ta olmaydi", async () => {
  const { deps, sent, store, invites } = makeDeps({});
  const code = invites.create();

  await handleUpdate(textUpdate(STRANGER, code), deps as never);
  assert.equal(store.isOperator(STRANGER), true);

  // Boshqa odam o'sha kod bilan
  await handleUpdate(textUpdate(555, code), deps as never);
  assert.match(sent.at(-1)!.text, /faqat xodimlar uchun/);
  assert.equal(store.isOperator(555), false);
  store.close();
});

test("kod rasm bilan emas, faqat matn bilan ishlaydi", async () => {
  const { deps, queued, store, invites } = makeDeps({});
  invites.create();
  // Ruxsatsiz odam rasm yuborsa — navbatga tushmaydi
  await handleUpdate(photoUpdate(STRANGER, "f1"), deps as never);
  assert.equal(queued.length, 0);
  assert.equal(store.isOperator(STRANGER), false);
  store.close();
});

test("/kod yangi xodim uchun kod beradi", async () => {
  const { deps, sent, store } = makeDeps({});
  await handleUpdate(textUpdate(OPERATOR, "/kod"), deps as never);

  const text = sent.at(-1)!.text;
  assert.match(text, /Yangi xodim uchun kod/);
  const match = text.match(/`([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6})`/);
  assert.ok(match, `kod topilmadi: ${text}`);

  // Hamkasb shu kod bilan ruxsat oladi
  await handleUpdate(textUpdate(777, match![1]), deps as never);
  assert.equal(store.isOperator(777), true);
  store.close();
});

test("/xodimlar .env va bazadagilarni birga ko'rsatadi", async () => {
  const { deps, sent, store } = makeDeps({});
  store.addOperator(333);
  await handleUpdate(textUpdate(OPERATOR, "/xodimlar"), deps as never);

  const text = sent.at(-1)!.text;
  assert.match(text, /333/, "bazadagi xodim");
  assert.match(text, /111/, ".env dagi xodim");
  assert.match(text, /\.env/, "manbasi ko'rsatilishi kerak");
  assert.match(text, /← siz/, "o'zi belgilanishi kerak");
  store.close();
});

test("/xodim_ochir ruxsatni olib tashlaydi, o'zini emas", async () => {
  const { deps, sent, store } = makeDeps({});
  store.addOperator(333);

  await handleUpdate(textUpdate(OPERATOR, "/xodim_ochir 333"), deps as never);
  assert.match(sent.at(-1)!.text, /chiqarildi/);
  assert.equal(store.isOperator(333), false);

  // O'zini chiqarib bo'lmaydi
  store.addOperator(OPERATOR);
  await handleUpdate(textUpdate(OPERATOR, `/xodim_ochir ${OPERATOR}`), deps as never);
  assert.match(sent.at(-1)!.text, /O'zingizni/);
  assert.equal(store.isOperator(OPERATOR), true);

  // Raqamsiz
  await handleUpdate(textUpdate(OPERATOR, "/xodim_ochir"), deps as never);
  assert.match(sent.at(-1)!.text, /Chat raqamini yozing/);
  store.close();
});

test("bazadagi xodim .env siz ham ishlaydi", async () => {
  const { deps, queued, store } = makeDeps({});
  // 444 .env da yo'q, faqat bazada
  store.addOperator(444);
  await handleUpdate(photoUpdate(444, "f1"), deps as never);
  assert.deepEqual(queued, [{ chatId: 444, fileId: "f1" }]);
  store.close();
});

// --- Rasm saqlash va zip arxiv ---

test("rasm familiya_ism_turi nomi bilan saqlanadi", async () => {
  const uzb = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1111111",
    birth: "850412", sex: "M", expiry: "310101",
  });
  const { deps, store } = makeDeps({ f1: okResult(uzb) });

  await processBatch(OPERATOR, ["f1"], deps as never);

  const row = store.all()[0];
  assert.equal(row.photo_file, "KARIMOV_AZIZ_uzb-pasport.jpg");
  assert.ok(existsSync(join(PHOTOS, row.photo_file!)), "fayl diskda bo'lishi kerak");

  // Hujjat turi ham yozilgan
  assert.equal(row.doc_kind, "pasport");
  assert.equal(row.doc_country, "O'zbekiston");
  assert.equal(row.doc_label, "O'zbek pasporti");
  store.close();
});

test("tojik/qirg'iz/qozoq hujjatlari ajratiladi", async () => {
  const reads: Record<string, ReturnType<typeof okResult>> = {};
  const expected: [string, string, string][] = [
    ["TJK", "Tojik pasporti", "tjk-pasport"],
    ["KGZ", "Qirg'iz pasporti", "kgz-pasport"],
    ["KAZ", "Qozoq pasporti", "kaz-pasport"],
  ];
  expected.forEach(([code], i) => {
    reads[`f${i}`] = okResult(
      td3({
        surname: `FAMILIYA${i}`, given: "ISM", docNumber: `AB222222${i}`,
        birth: "850412", sex: "M", expiry: "310101", state: code, nation: code,
      }),
    );
  });

  const { deps, store } = makeDeps(reads);
  await processBatch(OPERATOR, ["f0", "f1", "f2"], deps as never);

  const rows = store.all().sort((a, b) => a.surname.localeCompare(b.surname));
  assert.equal(rows.length, 3);
  expected.forEach(([, label, slug], i) => {
    assert.equal(rows[i].doc_label, label);
    assert.ok(rows[i].photo_file!.endsWith(`_${slug}.jpg`), rows[i].photo_file!);
  });
  store.close();
});

test("ID karta pasportdan ajratiladi", async () => {
  const { deps, store } = makeDeps({ f1: okResult(td1Id()) });
  await processBatch(OPERATOR, ["f1"], deps as never);

  const row = store.all()[0];
  assert.equal(row.doc_kind, "id");
  assert.equal(row.doc_label, "O'zbek ID kartasi");
  assert.ok(row.photo_file!.includes("uzb-id"), row.photo_file!);
  store.close();
});

test("/zip rasmlar va Excel bilan haqiqiy arxiv beradi", async () => {
  const a = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB3333333",
    birth: "850412", sex: "M", expiry: "310101",
  });
  const b = td3({
    surname: "SALIMOVA", given: "NARGIZA", docNumber: "AB4444444",
    birth: "900707", sex: "F", expiry: "320202",
  });
  const { deps, documents, store } = makeDeps({ f1: okResult(a), f2: okResult(b) });

  await processBatch(OPERATOR, ["f1", "f2"], deps as never);
  await handleUpdate(textUpdate(OPERATOR, "/zip"), deps as never);

  // 1-2: to'plamdan keyin avtomatik, 3: qo'lda so'ralgan
  assert.equal(documents.length, 3);
  const doc = documents.at(-1)!;
  assert.match(doc.name, /^umra-pasportlar-\d{4}-\d{2}-\d{2}\.zip$/);
  assert.match(doc.caption, /\*2\* rasm/);
  assert.match(doc.caption, /\*2\* kishi/);

  // Arxivni HAQIQIY unzip bilan ochib tekshiramiz
  const dir = mkdtempSync(join(tmpdir(), "umra-zip-"));
  const path = join(dir, "a.zip");
  writeFileSync(path, doc.bytes!);
  execFileSync("unzip", ["-t", path], { stdio: "pipe" });
  execFileSync("unzip", ["-qq", "-o", path, "-d", join(dir, "out")], { stdio: "pipe" });

  // Arxiv ichida BITTA papka: rasmlar va Excel shunda
  const inside = readdirSync(join(dir, "out", "umra-pasportlar")).sort();
  assert.deepEqual(inside, [
    "KARIMOV_AZIZ_uzb-pasport.jpg",
    "SALIMOVA_NARGIZA_uzb-pasport.jpg",
    "umra-pasportlar-2026-09-29.xlsx",
  ]);
  store.close();
});

test("yozuv o'chirilsa rasmi ham o'chadi", async () => {
  const mrz = td3({
    surname: "TOSHEV", given: "BOBUR", docNumber: "AB5555555",
    birth: "880101", sex: "M", expiry: "310101",
  });
  const { deps, store } = makeDeps({ f1: okResult(mrz) });

  await processBatch(OPERATOR, ["f1"], deps as never);

  const file = store.all()[0].photo_file!;
  assert.ok(existsSync(join(PHOTOS, file)));

  await handleUpdate(textUpdate(OPERATOR, "/ochir AB5555555"), deps as never);
  assert.equal(store.count(), 0);
  assert.ok(!existsSync(join(PHOTOS, file)), "rasm ham o'chishi kerak");
  store.close();
});

test("rasm guruh papkasisiz, to'g'ri nom bilan saqlanadi", async () => {
  const mrz = td3({
    surname: "USMONOV", given: "JAHON", docNumber: "AB6666666",
    birth: "880101", sex: "M", expiry: "310101",
  });
  const { deps, store } = makeDeps({ f1: okResult(mrz) });

  await processBatch(OPERATOR, ["f1"], deps as never);

  const file = store.all()[0].photo_file!;
  assert.equal(file, "USMONOV_JAHON_uzb-pasport.jpg");
  assert.ok(!file.includes("/"), "guruh papkasi bo'lmasligi kerak");
  assert.ok(existsSync(join(PHOTOS, file)));
  store.close();
});

test("bir xil ismli ikki kishining rasmi almashmaydi", async () => {
  // Ikki xil pasport, bir xil ism-familiya
  const first = td3({
    surname: "ALIYEV", given: "SARDOR", docNumber: "AB7777777",
    birth: "800101", sex: "M", expiry: "310101",
  });
  const second = td3({
    surname: "ALIYEV", given: "SARDOR", docNumber: "AB8888888",
    birth: "850505", sex: "M", expiry: "310101",
  });
  const { deps, store } = makeDeps({ f1: okResult(first), f2: okResult(second) });

  await processBatch(OPERATOR, ["f1"], deps as never);
  await processBatch(OPERATOR, ["f2"], deps as never);

  const files = store.all().map((r) => r.photo_file);
  assert.equal(new Set(files).size, 2, `yo'llar bir xil bo'lib qoldi: ${files}`);
  for (const f of files) assert.ok(existsSync(join(PHOTOS, f!)), `yo'q: ${f}`);
  store.close();
});

test("yozuv bo'lmasa /zip arxiv yubormaydi", async () => {
  const { deps, documents, sent, store } = makeDeps({});
  await handleUpdate(textUpdate(OPERATOR, "/zip"), deps as never);
  assert.equal(documents.length, 0);
  assert.match(sent.at(-1)!.text, /qabul qilinmagan/);
  store.close();
});

// --- Viza ---

/** Viza yorlig'ining MRZ'i (MRV-A, 2×44). Pasport raqami yo'q — viza raqami. */
function visaMrz(o: {
  surname: string;
  given: string;
  visaNumber: string;
  birth: string;
  expiry: string;
  nation?: string;
}): string {
  const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);
  const l1 = pad(`V<SAU${o.surname}<<${o.given.replace(/ /g, "<")}`, 44);
  const num = pad(o.visaNumber, 9);
  const head =
    num + checkDigit(num) + pad(o.nation ?? "UZB", 3) +
    o.birth + checkDigit(o.birth) + "M" +
    o.expiry + checkDigit(o.expiry) + "<".repeat(14) + "0";
  const composite = head.slice(0, 10) + head.slice(13, 20) + head.slice(21, 43);
  return `${l1}\n${head}${checkDigit(composite)}`;
}

function visaResult(mrzText: string, type: string | null) {
  const result = okResult(mrzText) as Record<string, unknown>;
  result.visaType = type;
  return result as never;
}

test("/viza qo'lda belgilaydi va turini tekshiradi", async () => {
  const mrz = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1234567",
    birth: "850412", sex: "M", expiry: "310101",
  });
  const { deps, sent, store } = makeDeps({ f1: okResult(mrz) });
  await processBatch(OPERATOR, ["f1"], deps as never);

  // Tanilmagan tur — rad etiladi, taxmin qilinmaydi
  await handleUpdate(textUpdate(OPERATOR, "/viza AB1234567 nimadir"), deps as never);
  assert.match(sent.at(-1)!.text, /tanilmadi/);
  assert.equal(store.all()[0].visa_type, null);

  // To'g'ri tur
  await handleUpdate(
    textUpdate(OPERATOR, "/viza AB1234567 umra 2027-03-15"),
    deps as never,
  );
  const row = store.all()[0];
  assert.equal(row.visa_type, "umra");
  assert.equal(row.visa_expiry, "2027-03-15");
  assert.equal(row.visa_source, "qolda");
  assert.match(sent.at(-1)!.text, /Umra vizasi/);
  store.close();
});

test("/viza topilmagan pasportga yozmaydi", async () => {
  const { deps, sent, store } = makeDeps({});
  await handleUpdate(textUpdate(OPERATOR, "/viza XX9999999 umra"), deps as never);
  assert.match(sent.at(-1)!.text, /topilmadi/);
  store.close();
});

test("viza rasmi egasiga o'zi bog'lanadi", async () => {
  const passport = td3({
    surname: "SALIMOVA", given: "NARGIZA", docNumber: "AB7654321",
    birth: "900707", sex: "F", expiry: "320202",
  });
  const visa = visaMrz({
    surname: "SALIMOVA", given: "NARGIZA", visaNumber: "V1234567",
    birth: "900707", expiry: "270315",
  });

  const { deps, edits, store } = makeDeps({
    f1: okResult(passport),
    f2: visaResult(visa, "umra"),
  });

  await processBatch(OPERATOR, ["f1"], deps as never);
  await processBatch(OPERATOR, ["f2"], deps as never);

  const row = store.all()[0];
  assert.equal(row.visa_number, "V1234567");
  assert.equal(row.visa_expiry, "2027-03-15");
  assert.equal(row.visa_type, "umra");
  assert.equal(row.visa_source, "mrz", "MRZ'dan o'qilgani belgilanishi kerak");
  // Faqat bitta yozuv — viza alohida odam bo'lib qo'shilmasligi kerak
  assert.equal(store.count(), 1);
  assert.match(edits.at(-1)!.text, /Vizalar/);
  store.close();
});

test("egasi topilmagan viza ogohlantiradi, yozuv yaratmaydi", async () => {
  const visa = visaMrz({
    surname: "NOTANISH", given: "ODAM", visaNumber: "V7777777",
    birth: "800101", expiry: "270101",
  });
  const { deps, edits, store } = makeDeps({ f1: visaResult(visa, "umra") });

  await processBatch(OPERATOR, ["f1"], deps as never);

  assert.equal(store.count(), 0, "viza o'zi odam yaratmasligi kerak");
  assert.match(edits.at(-1)!.text, /ro'yxatda yo'q/);
  store.close();
});

test("/vizasiz va /vizalar ro'yxat beradi", async () => {
  const a = td3({
    surname: "BORVIZA", given: "ODAM", docNumber: "AB1111111",
    birth: "850412", sex: "M", expiry: "310101",
  });
  const b = td3({
    surname: "YOQVIZA", given: "ODAM", docNumber: "AB2222222",
    birth: "900707", sex: "F", expiry: "320202",
  });
  const { deps, sent, store } = makeDeps({ f1: okResult(a), f2: okResult(b) });

  await processBatch(OPERATOR, ["f1", "f2"], deps as never);
  await handleUpdate(textUpdate(OPERATOR, "/viza AB1111111 umra"), deps as never);

  await handleUpdate(textUpdate(OPERATOR, "/vizasiz"), deps as never);
  const missing = sent.at(-1)!.text;
  assert.match(missing, /1 \/ 2/);
  assert.match(missing, /YOQVIZA/);
  assert.ok(!missing.includes("BORVIZA"), "vizasi borlar ro'yxatda bo'lmasligi kerak");

  await handleUpdate(textUpdate(OPERATOR, "/vizalar"), deps as never);
  const all = sent.at(-1)!.text;
  assert.match(all, /Vizalar: 1 \/ 2/);
  assert.match(all, /BORVIZA[^\n]*Umra vizasi/);
  assert.match(all, /YOQVIZA[^\n]*viza yo'q/);
  store.close();
});

test("pasport qayta yuborilsa viza ma'lumoti saqlanadi", async () => {
  const mrz = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1234567",
    birth: "850412", sex: "M", expiry: "310101",
  });
  const { deps, store } = makeDeps({ f1: okResult(mrz), f2: okResult(mrz) });

  await processBatch(OPERATOR, ["f1"], deps as never);
  await handleUpdate(textUpdate(OPERATOR, "/viza AB1234567 umra"), deps as never);
  // Aniqroq rasm bilan qayta yuborildi
  await processBatch(OPERATOR, ["f2"], deps as never);

  assert.equal(store.all()[0].visa_type, "umra", "viza o'chib ketmasligi kerak");
  store.close();
});

test("/vizani_ochir xato kiritilganni olib tashlaydi", async () => {
  const mrz = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1234567",
    birth: "850412", sex: "M", expiry: "310101",
  });
  const { deps, sent, store } = makeDeps({ f1: okResult(mrz) });
  await processBatch(OPERATOR, ["f1"], deps as never);
  await handleUpdate(textUpdate(OPERATOR, "/viza AB1234567 single"), deps as never);
  assert.equal(store.all()[0].visa_type, "single");

  await handleUpdate(textUpdate(OPERATOR, "/vizani_ochir AB1234567"), deps as never);
  assert.equal(store.all()[0].visa_type, null);
  assert.match(sent.at(-1)!.text, /olib tashlandi/);
  store.close();
});

test("uzun hisobot Telegram chegarasiga bo'linadi", () => {
  // 60 kishilik hisobot bitta xabarga sig'maydi
  const lines = Array.from({ length: 60 }, (_, i) => `✅ FAMILIYA${i} ISM${i} — \`AB123456${i}\``);
  const parts = splitMessage(lines.join("\n"));
  for (const p of parts) assert.ok(p.length <= 3900);
  assert.equal(parts.join("\n").split("\n").length, 60);
});

// --- Juda katta rasm ---
//
// Fayl (File) sifatida yuborilgan telefon rasmi 5–9 MB bo'ladi. Avval u
// navbatga tushib, API'da tushunarsiz xato berardi. Endi darhol aytiladi.

test("juda katta fayl navbatga tushmaydi, tushuntirib aytiladi", async () => {
  const { deps, sent, queued } = makeDeps({});
  await handleUpdate(
    {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: OPERATOR, type: "private" },
        document: { file_id: "huge", mime_type: "image/jpeg", file_size: 9 * 1024 * 1024 },
      },
    },
    deps as never,
  );
  assert.equal(queued.length, 0, "katta rasmni o'qishga urinmaymiz");
  assert.match(sent.at(-1)!.text, /juda katta/);
  assert.match(sent.at(-1)!.text, /9\.0 MB/, "hajmi aytilishi kerak");
  assert.match(sent.at(-1)!.text, /oddiy rasm/, "yechimi aytilishi kerak");
  deps.store.close();
});

test("sig'adigan fayl odatdagidek navbatga tushadi", async () => {
  const { deps, queued } = makeDeps({});
  await handleUpdate(
    {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: OPERATOR, type: "private" },
        document: { file_id: "ok", mime_type: "image/jpeg", file_size: 2 * 1024 * 1024 },
      },
    },
    deps as never,
  );
  assert.deepEqual(queued, [{ chatId: OPERATOR, fileId: "ok" }]);
  deps.store.close();
});

test("hamma nusxasi katta bo'lgan rasm rad etiladi", async () => {
  const { deps, sent, queued } = makeDeps({});
  await handleUpdate(
    {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: OPERATOR, type: "private" },
        photo: [
          { file_id: "a", width: 2000, height: 1500, file_size: 5 * 1024 * 1024 },
          { file_id: "b", width: 4000, height: 3000, file_size: 9 * 1024 * 1024 },
        ],
      },
    },
    deps as never,
  );
  assert.equal(queued.length, 0);
  assert.match(sent.at(-1)!.text, /juda katta/);
  deps.store.close();
});

// --- Taqsimlash va qayta urinish ---

test("har rasmdan oldin navbat kutiladi — API chegarasiga urilmaslik uchun", async () => {
  const mrz = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1234567",
    birth: "850412", sex: "M", expiry: "310101",
  });
  const mrz2 = td3({
    surname: "ISMOILOV", given: "DAVRON", docNumber: "AB7654321",
    birth: "900101", sex: "M", expiry: "320202",
  });
  const { deps, store } = makeDeps({ f1: okResult(mrz), f2: okResult(mrz2) });

  let waits = 0;
  (deps as Record<string, unknown>).throttle = {
    wait: async () => {
      waits++;
    },
  };

  await processBatch(OPERATOR, ["f1", "f2"], deps as never);
  assert.equal(waits, 2, "har rasmga bitta navbat");
  assert.equal(store.count(), 2);
  store.close();
});

test("vaqtincha API xatosi qayta urinib ko'riladi va to'plam davom etadi", async () => {
  const mrz = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1234567",
    birth: "850412", sex: "M", expiry: "310101",
  });
  const busy: ReadResult = {
    ok: false,
    reason: "api_error",
    problem: "Server band (429)",
    retryable: true,
  };
  const { deps, store, calls, edits } = makeDeps({
    // Birinchi urinish — "band", ikkinchisi muvaffaqiyatli
    f1: [busy, okResult(mrz)],
  });

  const slept: number[] = [];
  (deps as Record<string, unknown>).sleep = async (ms: number) => {
    slept.push(ms);
  };

  await processBatch(OPERATOR, ["f1"], deps as never);

  assert.equal(calls.f1, 2, "bir marta qayta urinish bo'lishi kerak");
  assert.deepEqual(slept, [2000], "qayta urinishdan oldin kutiladi");
  assert.equal(store.count(), 1, "ikkinchi urinish natijasi saqlanadi");
  assert.match(edits.at(-1)!.text, /KARIMOV/, "hisobot odatdagidek chiqadi");
  store.close();
});

test("tuzalmaydigan API xatosi qayta urinmaydi va darhol to'xtaydi", async () => {
  const badKey: ReadResult = {
    ok: false,
    reason: "api_error",
    problem: "API kaliti qabul qilinmadi",
    retryable: false,
  };
  const { deps, store, calls, edits } = makeDeps({ f1: badKey, f2: badKey });

  const slept: number[] = [];
  (deps as Record<string, unknown>).sleep = async (ms: number) => {
    slept.push(ms);
  };

  await processBatch(OPERATOR, ["f1", "f2"], deps as never);

  assert.equal(calls.f1, 1, "kalit xato bo'lsa qayta urinishdan ma'no yo'q");
  assert.equal(calls.f2, undefined, "qolgan rasmlarga umuman urinilmaydi");
  assert.deepEqual(slept, [], "bekorga kutilmaydi");
  assert.equal(store.count(), 0);
  assert.match(edits.at(-1)!.text, /To'xtatildi/);
  assert.match(edits.at(-1)!.text, /kaliti qabul qilinmadi/, "sabab aytiladi");
  assert.match(edits.at(-1)!.text, /qayta yuborish yordam bermaydi/);
  store.close();
});

test("qayta urinishlar tugasa to'plam to'xtaydi, vaqtincha deb aytiladi", async () => {
  const busy: ReadResult = {
    ok: false,
    reason: "api_error",
    problem: "Kunlik chegara tugadi (429)",
    retryable: true,
  };
  const { deps, store, calls, edits } = makeDeps({ f1: busy });

  const slept: number[] = [];
  (deps as Record<string, unknown>).sleep = async (ms: number) => {
    slept.push(ms);
  };

  await processBatch(OPERATOR, ["f1"], deps as never);

  assert.equal(calls.f1, 3, "3 marta urinib ko'riladi");
  assert.deepEqual(slept, [2000, 4000], "kutish vaqti ikki barobar oshadi");
  assert.equal(store.count(), 0);
  assert.match(edits.at(-1)!.text, /bir-ikki daqiqadan keyin qayta yuboring/);
  store.close();
});

// --- Yangi oqim: /start → rasm → fayllar ---
//
// Egasining talabi: "1-marta kirganda buyruqlar /start chiqish kerak,
// /guruh kerak emas, /start va senga rasmlar yuboradi — sen ularni xlsx
// va .zip qilib tashlab berasan".

test("menyuda /start birinchi turadi, /guruh yo'q", async () => {
  const { COMMANDS } = await import("../src/bot.ts");
  const names = COMMANDS.map((c) => c.command);
  assert.equal(names[0], "start", "Telegram birinchisini START tugmasi qiladi");
  assert.ok(!names.includes("guruh"), "guruh buyrug'i olib tashlandi");
  assert.ok(names.includes("excel") && names.includes("zip"));
});

test("/start qisqa yo'riqnoma beradi, guruh haqida gapirmaydi", async () => {
  const { deps, sent, store } = makeDeps({});
  await handleUpdate(textUpdate(OPERATOR, "/start"), deps as never);

  const text = sent.map((m) => m.text).join("\n");
  assert.match(text, /rasmlarini shu yerga yuboring/);
  assert.match(text, /Excel/);
  assert.match(text, /zip|Arxiv/);
  assert.ok(!/\/guruh/.test(text), `guruh haqida yozilib qolgan:\n${text}`);
  store.close();
});

test("rasmlar o'qilgach Excel va arxiv SO'RALMASDAN yuboriladi", async () => {
  const a = td3({
    surname: "KARIMOV", given: "AZIZ", docNumber: "AB1234567",
    birth: "850412", sex: "M", expiry: "310101",
  });
  const b = td3({
    surname: "SALIMOVA", given: "NARGIZA", docNumber: "AB7654321",
    birth: "900707", sex: "F", expiry: "320202",
  });
  const { deps, documents, edits, store } = makeDeps({
    f1: okResult(a),
    f2: okResult(b),
  });

  await processBatch(OPERATOR, ["f1", "f2"], deps as never);

  assert.equal(documents.length, 2, "ikkita fayl: jadval va arxiv");
  const [excel, zip] = documents;
  assert.match(excel.name, /\.xlsx$/);
  assert.match(zip.name, /\.zip$/);
  assert.match(excel.caption, /\*2\* kishi/);
  assert.match(zip.caption, /\*2\* rasm/);
  // Hisobotda ham fayllar haqida aytiladi
  assert.match(edits.at(-1)!.text, /Excel/);
  store.close();
});

test("faqat shu to'plamdagi pasportlar fayllarga tushadi", async () => {
  const old = td3({
    surname: "ESKIYEV", given: "OLD", docNumber: "AB1111111",
    birth: "800101", sex: "M", expiry: "310101",
  });
  const fresh = td3({
    surname: "YANGIYEV", given: "NEW", docNumber: "AB2222222",
    birth: "850101", sex: "M", expiry: "310101",
  });
  const { deps, documents, store } = makeDeps({
    f1: okResult(old),
    f2: okResult(fresh),
  });

  await processBatch(OPERATOR, ["f1"], deps as never);
  await processBatch(OPERATOR, ["f2"], deps as never);

  // Ikkinchi to'plamning fayli faqat 1 kishi bo'lishi kerak
  const secondExcel = documents[2];
  assert.match(secondExcel.name, /\.xlsx$/);
  assert.match(
    secondExcel.caption,
    /\*1\* kishi/,
    "butun baza emas, hozir yuborilganlar",
  );
  // Lekin bazada ikkisi ham bor, /excel hammasini beradi
  assert.equal(store.count(), 2);
  await handleUpdate(textUpdate(OPERATOR, "/excel"), deps as never);
  assert.match(documents.at(-1)!.caption, /\*2\* kishi/);
  store.close();
});

test("hech narsa o'qilmasa fayl yuborilmaydi", async () => {
  const { deps, documents, edits, store } = makeDeps({ f1: "throw" });
  await processBatch(OPERATOR, ["f1"], deps as never);
  assert.equal(documents.length, 0, "bo'sh jadval yuborishdan ma'no yo'q");
  assert.match(edits.at(-1)!.text, /O'qilmadi/);
  store.close();
});

test("saqlangan rasm hujjatning o'ziga qirqiladi", async () => {
  const { encode, decode } = await import("jpeg-js");
  const mrz = td3({
    surname: "QIRQIMOV", given: "SANJAR", docNumber: "AB9999999",
    birth: "850412", sex: "M", expiry: "310101",
  });

  // Hujjat kadrning o'rtasidagi 20%–80% qismida
  const width = 1200;
  const height = 900;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inside =
        x > width * 0.2 && x < width * 0.8 && y > height * 0.2 && y < height * 0.8;
      pixels[i] = inside ? 210 : 250;
      pixels[i + 1] = inside ? 40 : 250;
      pixels[i + 2] = inside ? 40 : 250;
      pixels[i + 3] = 255;
    }
  }
  const source = new Uint8Array(encode({ data: pixels, width, height }, 92).data);

  const result = okResult(mrz);
  assert.ok(result.ok);
  // Model hujjat chegarasini aytadi: [y0, x0, y1, x1]
  result.box = { x0: 200, y0: 200, x1: 800, y1: 800 };

  const { deps, store } = makeDeps({ f1: result }, source);

  await processBatch(OPERATOR, ["f1"], deps as never);

  const file = store.all()[0].photo_file!;
  const saved = readFileSync(join(PHOTOS, file));
  const img = decode(new Uint8Array(saved), { useTArray: true });

  assert.ok(
    img.width < width && img.height < height,
    `rasm qirqilmagan: ${img.width}x${img.height}`,
  );
  // 2% bo'sh joy bilan: 60% + 4% = 64%
  assert.ok(
    Math.abs(img.width - width * 0.64) < 20,
    `kenglik kutilgandan farq qiladi: ${img.width}`,
  );
  store.close();
});

test("chegara ishonchsiz bo'lsa rasm asl holida saqlanadi", async () => {
  const mrz = td3({
    surname: "BUTUNOV", given: "AKMAL", docNumber: "AB8181818",
    birth: "850412", sex: "M", expiry: "310101",
  });
  const result = okResult(mrz);
  assert.ok(result.ok);
  // Hujjatdagi surat o'lchamidagi chegara — qirqilmasligi kerak
  result.box = { x0: 100, y0: 200, x1: 300, y1: 500 };

  const source = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const { deps, store } = makeDeps({ f1: result }, source);

  await processBatch(OPERATOR, ["f1"], deps as never);

  const file = store.all()[0].photo_file!;
  const saved = readFileSync(join(PHOTOS, file));
  assert.deepEqual(
    new Uint8Array(saved),
    source,
    "shubhali chegarada asl rasm saqlanishi kerak",
  );
  store.close();
});
