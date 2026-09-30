import test from "node:test";
import assert from "node:assert/strict";
import { Invites, randomCode } from "../src/invites.ts";

test("kod chalkashadigan belgilardan iborat emas", () => {
  for (let i = 0; i < 200; i++) {
    const code = randomCode();
    assert.equal(code.length, 6);
    // 0, O, 1, I, L — telefonda aytishda chalkashadi
    assert.ok(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/.test(code), `yaroqsiz: ${code}`);
  }
});

test("kodlar takrorlanmaydi", () => {
  const codes = new Set(Array.from({ length: 300 }, () => randomCode()));
  // 31^6 ≈ 887 million variant — 300 tada takror bo'lmasligi kerak
  assert.equal(codes.size, 300);
});

test("to'g'ri kod bir marta ishlaydi", () => {
  const inv = new Invites();
  const code = inv.create();

  assert.equal(inv.claim(code), true, "birinchi marta o'tishi kerak");
  assert.equal(inv.claim(code), false, "ikkinchi marta o'tmasligi kerak");
});

test("katta-kichik harf va bo'sh joy farq qilmaydi", () => {
  const inv = new Invites();
  const code = inv.create();
  assert.equal(inv.claim(` ${code.toLowerCase()} `), true);
});

test("noto'g'ri kod o'tmaydi", () => {
  const inv = new Invites();
  inv.create();
  assert.equal(inv.claim("ABC123"), false);
  assert.equal(inv.claim(""), false);
  assert.equal(inv.claim("salom"), false);
});

test("eskirgan kod o'tmaydi", () => {
  let clock = 1_000_000;
  const inv = new Invites(10, () => clock); // 10 daqiqa
  const code = inv.create();

  clock += 9 * 60 * 1000;
  assert.equal(inv.size, 1, "9 daqiqada hali amal qiladi");

  clock += 2 * 60 * 1000; // jami 11 daqiqa
  assert.equal(inv.claim(code), false, "11 daqiqadan keyin o'tmasligi kerak");
  assert.equal(inv.size, 0, "eskirgan kod o'chirilishi kerak");
});

test("bir nechta kod bir vaqtda amal qiladi", () => {
  const inv = new Invites();
  const a = inv.create();
  const b = inv.create();
  assert.equal(inv.size, 2);

  assert.equal(inv.claim(b), true);
  assert.equal(inv.size, 1);
  assert.equal(inv.claim(a), true);
  assert.equal(inv.size, 0);
});
