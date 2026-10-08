/**
 * Bir vaqtda bitta bot.
 *
 * Avtomatik ishga tushirish yoqilgandan keyin bot orqa fonda ishlaydi.
 * Xodim buni bilmasdan yana ishga tushirsa, Telegram ikkisini ham rad
 * etardi (409) va xabarlar yo'qolardi.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lock } from "../src/lock.ts";

const dir = mkdtempSync(join(tmpdir(), "umra-lock-"));
let n = 0;
const fresh = () => join(dir, `bot-${n++}.lock`);

test("birinchi nusxa qulfni oladi", () => {
  const path = fresh();
  const held = lock(path);
  assert.equal(held.ok, true);
  assert.ok(existsSync(path), "qulf fayli yaratilishi kerak");
  assert.equal(readFileSync(path, "utf8").trim(), String(process.pid));
  assert.ok(held.ok && typeof held.release === "function");
  held.ok && held.release();
});

test("qulf bo'shatilgach fayl yo'qoladi", () => {
  const path = fresh();
  const held = lock(path);
  assert.ok(held.ok);
  held.ok && held.release();
  assert.ok(!existsSync(path));
});

test("ikki marta bo'shatish xato bermaydi", () => {
  const path = fresh();
  const held = lock(path);
  assert.ok(held.ok);
  if (held.ok) {
    held.release();
    held.release();
  }
});

test("ISHLAYOTGAN nusxa bo'lsa ikkinchisi to'xtaydi", () => {
  const path = fresh();
  // Shu test jarayonining o'zi "ishlayotgan boshqa nusxa" bo'ladi:
  // pid haqiqatan mavjud, lekin bizning pid'imiz emas deb ko'rsatamiz.
  // Buning uchun ota-jarayon pid'ini yozamiz (u ham ishlab turadi).
  writeFileSync(path, String(process.ppid));

  const held = lock(path);
  assert.equal(held.ok, false, "ikkinchi nusxa qulfni olmasligi kerak");
  assert.equal(held.ok === false && held.pid, process.ppid);
  // Qulf faylini o'zgartirmagan bo'lishi kerak
  assert.equal(readFileSync(path, "utf8").trim(), String(process.ppid));
});

test("eski qulf (dastur o'chgan) olib tashlanadi", () => {
  const path = fresh();
  // Hech qanday dastur ishlamayotgan raqam. Katta pid — band bo'lish
  // ehtimoli juda kam; band bo'lsa test o'zi aytadi.
  const dead = 4_000_000;
  writeFileSync(path, String(dead));

  const held = lock(path);
  assert.equal(held.ok, true, "o'chgan dasturning qulfi to'sib qo'ymasligi kerak");
  assert.equal(readFileSync(path, "utf8").trim(), String(process.pid));
  held.ok && held.release();
});

test("buzuq qulf fayli to'sib qo'ymaydi", () => {
  const path = fresh();
  writeFileSync(path, "allaqanday matn");
  const held = lock(path);
  assert.equal(held.ok, true);
  held.ok && held.release();
});

test("bo'sh qulf fayli to'sib qo'ymaydi", () => {
  const path = fresh();
  writeFileSync(path, "");
  const held = lock(path);
  assert.equal(held.ok, true);
  held.ok && held.release();
});

test("o'z pid'i yozilgan qulf to'sib qo'ymaydi", () => {
  // Qayta ishga tushirishda shunday bo'lishi mumkin
  const path = fresh();
  writeFileSync(path, String(process.pid));
  const held = lock(path);
  assert.equal(held.ok, true);
  held.ok && held.release();
});

test("boshqa nusxaning qulfini bo'shatmaydi", () => {
  const path = fresh();
  const held = lock(path);
  assert.ok(held.ok);
  // Boshqa nusxa qulfni egalladi deb tasavvur qilamiz
  writeFileSync(path, String(process.ppid));
  held.ok && held.release();
  assert.ok(existsSync(path), "boshqaning qulfi o'chirilmasligi kerak");
  assert.equal(readFileSync(path, "utf8").trim(), String(process.ppid));
});

test("papka yo'q bo'lsa yaratiladi", () => {
  const path = join(dir, "yangi", "ichki", "bot.lock");
  const held = lock(path);
  assert.equal(held.ok, true);
  assert.ok(existsSync(path));
  held.ok && held.release();
});
