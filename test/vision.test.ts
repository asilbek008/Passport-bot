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
