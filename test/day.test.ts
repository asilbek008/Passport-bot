/**
 * Kun O'zbekiston vaqti bo'yicha hisoblanadi.
 *
 * Bu haqiqiy xato edi: UTC ishlatilgani uchun tunda (00:00–05:00)
 * faylga kechagi sana yozilardi va kunlik chegara soat 5 da yangilanardi.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { day, TIMEZONE } from "../src/day.ts";
import { workbookName } from "../src/excel.ts";

test("mintaqa — Toshkent", () => {
  assert.equal(TIMEZONE, "Asia/Tashkent");
});

test("tunda UTC kechagi kunda, bot esa bugungi kunda", () => {
  // UTC 2026-10-07 21:00 = Toshkent 2026-10-08 02:00
  const at = new Date("2026-10-07T21:00:00Z");
  assert.equal(at.toISOString().slice(0, 10), "2026-10-07", "UTC kechagi kun");
  assert.equal(day(at), "2026-10-08", "Toshkentda allaqachon yangi kun");
});

test("ertalab farq yo'q", () => {
  const at = new Date("2026-10-08T06:00:00Z"); // Toshkent 11:00
  assert.equal(day(at), "2026-10-08");
});

test("kun chegarasi: Toshkent 00:00", () => {
  // UTC 18:59 = Toshkent 23:59 — hali eski kun
  assert.equal(day(new Date("2026-10-07T18:59:00Z")), "2026-10-07");
  // UTC 19:00 = Toshkent 00:00 — yangi kun boshlandi
  assert.equal(day(new Date("2026-10-07T19:00:00Z")), "2026-10-08");
});

test("fayl nomida Toshkent sanasi bo'ladi", () => {
  const at = new Date("2026-10-07T21:30:00Z");
  assert.equal(workbookName(at), "umra-pasportlar-2026-10-08.xlsx");
});
