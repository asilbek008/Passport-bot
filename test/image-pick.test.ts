/**
 * Qaysi rasmni olish kerakligini tanlash.
 *
 * Bu yerdagi muhim muvozanat: chegaraga sig'ish KERAK, lekin shu bahonada
 * 90px miniatyurani tanlab qo'yish MUMKIN EMAS — unda MRZ o'qilmaydi.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { pickPhoto, documentFits, humanSize } from "../src/image-pick.ts";

const MB = 1024 * 1024;
const LIMIT = Math.round(3.5 * MB);

/** Telegram oddiy rasmni shunday beradi: bir necha o'lcham, hajmi bilan. */
const telegramPhoto = [
  { file_id: "thumb", width: 90, height: 67, file_size: 1_200 },
  { file_id: "medium", width: 320, height: 240, file_size: 18_000 },
  { file_id: "large", width: 800, height: 600, file_size: 75_000 },
  { file_id: "xl", width: 1280, height: 960, file_size: 180_000 },
];

test("oddiy rasmdan eng kattasi olinadi", () => {
  const picked = pickPhoto(telegramPhoto, LIMIT);
  assert.ok(picked && picked.kind === "ok");
  assert.equal(picked.fileId, "xl", "MRZ uchun eng katta nusxa kerak");
  assert.equal(picked.width, 1280);
});

test("juda katta nusxa tashlab, sig'adigan eng kattasi olinadi", () => {
  const withHuge = [
    ...telegramPhoto,
    { file_id: "huge", width: 4000, height: 3000, file_size: 6 * MB },
  ];
  const picked = pickPhoto(withHuge, LIMIT);
  assert.ok(picked && picked.kind === "ok");
  assert.equal(picked.fileId, "xl", "6 MB tashlanib, 1280px olinishi kerak");
});

test("hajmi aytilmasa eng kattasi olinadi, miniatyura EMAS", () => {
  // Bu haqiqiy xato edi: ehtiyot yuzasidan 90px tanlanib, MRZ o'qilmasdi
  const noSizes = [
    { file_id: "thumb", width: 90, height: 67 },
    { file_id: "xl", width: 1280, height: 960 },
  ];
  const picked = pickPhoto(noSizes, LIMIT);
  assert.ok(picked && picked.kind === "ok");
  assert.equal(picked.fileId, "xl");
  assert.equal(picked.bytes, null);
});

test("hammasi chegaradan katta bo'lsa rad etiladi", () => {
  const allHuge = [
    { file_id: "a", width: 2000, height: 1500, file_size: 5 * MB },
    { file_id: "b", width: 4000, height: 3000, file_size: 9 * MB },
  ];
  const picked = pickPhoto(allHuge, LIMIT);
  assert.ok(picked && picked.kind === "too_big");
  assert.equal(picked.bytes, 5 * MB, "eng kichigining hajmi aytilishi kerak");
});

test("hajmi noma'lum nusxa bo'lsa, u sinab ko'riladi", () => {
  const mixed = [
    { file_id: "huge", width: 4000, height: 3000, file_size: 9 * MB },
    { file_id: "unknown", width: 1280, height: 960 },
  ];
  const picked = pickPhoto(mixed, LIMIT);
  assert.ok(picked && picked.kind === "ok");
  assert.equal(picked.fileId, "unknown", "sig'ishi ehtimoli bor — sinaymiz");
});

test("bo'sh ro'yxat null qaytaradi", () => {
  assert.equal(pickPhoto([], LIMIT), null);
});

test("bitta nusxa bo'lsa ham ishlaydi", () => {
  const picked = pickPhoto([{ file_id: "a", width: 1280, height: 960, file_size: 200_000 }], LIMIT);
  assert.ok(picked && picked.kind === "ok");
  assert.equal(picked.fileId, "a");
});

// --- Fayl sifatida yuborilgan rasm ---

test("sig'adigan fayl o'tadi", () => {
  assert.deepEqual(documentFits({ file_size: 2 * MB }, LIMIT), { ok: true });
});

test("katta fayl rad etiladi va hajmi aytiladi", () => {
  const result = documentFits({ file_size: 5 * MB }, LIMIT);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.bytes, 5 * MB);
});

test("hajmi aytilmagan fayl o'tkaziladi", () => {
  // Telegram ba'zan aytmaydi — yuklab olgandan keyin baribir bilinadi
  assert.deepEqual(documentFits({}, LIMIT), { ok: true });
});

test("chegaraning o'zi o'tadi (< emas, <=)", () => {
  assert.deepEqual(documentFits({ file_size: LIMIT }, LIMIT), { ok: true });
  assert.equal(documentFits({ file_size: LIMIT + 1 }, LIMIT).ok, false);
});

// --- humanSize ---

test("hajm odam o'qiydigan ko'rinishda", () => {
  assert.equal(humanSize(500), "500 B");
  assert.equal(humanSize(2048), "2 KB");
  assert.equal(humanSize(1536 * 1024), "1.5 MB");
  assert.equal(humanSize(Math.round(3.5 * MB)), "3.5 MB");
});
