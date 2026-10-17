/**
 * `vision.ts` ning tarmoqqa bog'liq bo'lmagan qismlari.
 * Model javobi ishonchsiz kanal — shuning uchun uni qanday tekshirishimiz
 * testdan o'tishi kerak.
 */
process.env.BOT_TOKEN ??= "test";
process.env.ANTHROPIC_API_KEY ??= "test";

import test from "node:test";
import assert from "node:assert/strict";
import { parseJson, normalizeDate } from "../src/vision.ts";
import { interpret } from "../src/read-shared.ts";

const good = {
  mrz_lines: ["P<UZB...", "AB..."],
  issue_date: "2020-03-15",
  place_of_birth: "QIZIRIQ",
  authority: null,
  document_kind: "passport",
  mrz_readable: true,
  problem: null,
};

test("to'g'ri JSON qabul qilinadi", () => {
  const r = parseJson(JSON.stringify(good));
  assert.equal(r.success, true);
  assert.equal(r.data!.document_kind, "passport");
  assert.equal(r.data!.mrz_lines.length, 2);
});

test("JSON atrofidagi ortiqcha matn tashlab yuboriladi", () => {
  const r = parseJson(`Mana natija:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\`\nTayyor.`);
  assert.equal(r.success, true);
  assert.equal(r.data!.place_of_birth, "QIZIRIQ");
});

test("viza turi yozilmasa ham pasport o'qiladi", () => {
  // Model bu maydonni unutsa, butun o'qish buzilmasligi kerak
  const r = parseJson(JSON.stringify(good));
  assert.equal(r.success, true);
  assert.equal(r.data!.visa_type ?? null, null);

  // Viza bo'lsa — turi bilan
  const visa = { ...good, document_kind: "visa", visa_type: "umra" };
  const v = parseJson(JSON.stringify(visa));
  assert.equal(v.success, true);
  assert.equal(v.data!.document_kind, "visa");
  assert.equal(v.data!.visa_type, "umra");
});

test("noto'g'ri viza turi rad etiladi", () => {
  const bad = { ...good, document_kind: "visa", visa_type: "nimadir" };
  assert.equal(parseJson(JSON.stringify(bad)).success, false);
});

test("buzilgan yoki yetishmayotgan javob rad etiladi", () => {
  assert.equal(parseJson("shunchaki matn").success, false);
  assert.equal(parseJson("").success, false);
  assert.equal(parseJson("{buzilgan json").success, false);
  // Majburiy maydon yo'q
  assert.equal(parseJson(JSON.stringify({ mrz_lines: [] })).success, false);
  // Noto'g'ri tur
  const wrong = { ...good, mrz_readable: "ha" };
  assert.equal(parseJson(JSON.stringify(wrong)).success, false);
  // Kutilmagan document_kind
  const kind = { ...good, document_kind: "haydovchilik_guvohnomasi" };
  assert.equal(parseJson(JSON.stringify(kind)).success, false);
});

test("normalizeDate faqat haqiqiy ISO sanani o'tkazadi", () => {
  assert.equal(normalizeDate("2020-03-15"), "2020-03-15");
  assert.equal(normalizeDate("  2020-03-15  "), "2020-03-15");
  assert.equal(normalizeDate(null), null);
  assert.equal(normalizeDate(""), null);
  assert.equal(normalizeDate("15.03.2020"), null); // boshqa format — taxmin qilinmaydi
  assert.equal(normalizeDate("2020-02-30"), null); // mavjud bo'lmagan kun
  assert.equal(normalizeDate("2020-13-01"), null); // 13-oy
  assert.equal(normalizeDate("taxminan 2020"), null);
});

// --- ID kartaning old tomoni ---
//
// ID kartada MRZ faqat ORQA tomonda. Old tomoni yuborilsa, "xira yoki
// kesilgan" deb aytish xodimni shu tomonni qayta-qayta suratga olishga
// majbur qilardi — shuning uchun bu alohida sabab.

test("ID karta ko'rinib MRZ yo'q bo'lsa — old tomoni deb aytiladi", () => {
  const r = interpret(
    JSON.stringify({
      ...good,
      document_kind: "id_card",
      mrz_readable: false,
      mrz_lines: [],
      problem: "old tomoni",
    }),
    new Date("2026-10-17T00:00:00Z"),
  );
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "id_front");
});

test("pasportda MRZ o'qilmasa — sabab oddiy 'unreadable' qoladi", () => {
  // Pasportda MRZ surat bor sahifada: boshqa tomonini olish yechim emas,
  // shuning uchun bu yerda ID karta maslahati berilmasligi kerak
  const r = interpret(
    JSON.stringify({ ...good, mrz_readable: false, mrz_lines: [] }),
    new Date("2026-10-17T00:00:00Z"),
  );
  assert.equal(r.ok === false && r.reason, "unreadable");
});

test("ID kartaning ORQA tomoni (TD1) odatdagidek o'qiladi", () => {
  // Haqiqiy TD1 — ICAO 9303 namunasi, tekshiruv raqamlari bilan
  const lines = [
    "I<UTOD231458907<<<<<<<<<<<<<<<",
    "7408122F1204159UTO<<<<<<<<<<<6",
    "ERIKSSON<<ANNA<MARIA<<<<<<<<<<",
  ];
  const r = interpret(
    JSON.stringify({
      ...good,
      document_kind: "id_card",
      mrz_readable: true,
      mrz_lines: lines,
    }),
    new Date("2011-01-01T00:00:00Z"),
  );
  assert.equal(r.ok, true, "orqa tomon o'qilishi kerak");
  assert.equal(r.ok === true && r.mrz.format, "TD1");
  assert.equal(r.ok === true && r.mrz.surname, "ERIKSSON");
});

test("ID kartaning ORQA tomoni xira bo'lsa — 'teskari qiling' DEYILMAYDI", () => {
  // Eng chalg'ituvchi holat: xodim to'g'ri tomonini yuborgan, lekin rasm
  // xira. Unga "old tomonini yubordingiz" desak, kartani aylantirib
  // yuraveradi va muammo hech qachon hal bo'lmaydi
  const r = interpret(
    JSON.stringify({
      ...good,
      document_kind: "id_card",
      id_side: "back",
      mrz_readable: false,
      mrz_lines: ["IDUZBAB1234567<<<<<<<<<<<<<<<<"],
      problem: "qatorlar xira",
    }),
    new Date("2026-10-17T00:00:00Z"),
  );
  assert.equal(r.ok === false && r.reason, "id_back_unclear");
});

test("ID kartaning old tomoni modelning so'ziga ko'ra aniqlanadi", () => {
  const r = interpret(
    JSON.stringify({
      ...good,
      document_kind: "id_card",
      id_side: "front",
      mrz_readable: false,
      mrz_lines: [],
    }),
    new Date("2026-10-17T00:00:00Z"),
  );
  assert.equal(r.ok === false && r.reason, "id_front");
});

test("MRZ qatorlari shakli to'g'ri kelmasa, sabab alohida va aniq", () => {
  // Model qatorlarni berdi, lekin ular na 3×30, na 2×44. Xodimga
  // "xira yoki kesilgan" deyish noto'g'ri yo'l ko'rsatish bo'lardi
  const r = interpret(
    JSON.stringify({
      ...good,
      document_kind: "id_card",
      id_side: "back",
      mrz_readable: true,
      mrz_lines: ["IDUZBAB1234567<<<<<<<<<<<<", "9001158M3108206UZB<<<<<<<<"],
    }),
    new Date("2026-10-17T00:00:00Z"),
  );
  assert.equal(r.ok === false && r.reason, "mrz_shape");
  assert.match(r.ok === false ? r.problem : "", /qator/);
});
