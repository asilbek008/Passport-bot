/**
 * Zaxira: shifrlash, ochish va buzilganini aniqlash.
 *
 * Zaxirada mijozlarning pasport skanlari bo'ladi, shuning uchun bu
 * yerda ikki narsa muhim: parolsiz OCHILMASLIGI va buzilgan faylni
 * jim qabul qilib, buzuq ma'lumot bermasligi.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  encrypt,
  decrypt,
  bundle,
  unbundle,
  safeName,
  checkPassword,
  BackupError,
  MAGIC,
} from "../src/backup.ts";

const PASSWORD = "umra-2026-parol";

test("shifrlangan va ochilgan ma'lumot aynan bir xil", () => {
  const data = new Uint8Array([1, 2, 3, 250, 0, 128, 77]);
  const out = decrypt(encrypt(data, PASSWORD), PASSWORD);
  assert.deepEqual(out, data);
});

test("shifrlangan faylda asl ma'lumot ko'rinmaydi", () => {
  // Pasport raqami shifrlangan faylda ochiq yotmasligi kerak
  const secret = "AB1234567 KARIMOV AZIZ";
  const file = encrypt(new Uint8Array(Buffer.from(secret, "utf8")), PASSWORD);
  const asText = Buffer.from(file).toString("latin1");
  assert.ok(!asText.includes("AB1234567"), "pasport raqami ochiq qolgan!");
  assert.ok(!asText.includes("KARIMOV"), "ism ochiq qolgan!");
});

test("xato parol bilan ochilmaydi", () => {
  const file = encrypt(new Uint8Array([1, 2, 3]), PASSWORD);
  assert.throws(
    () => decrypt(file, "boshqa-parol"),
    (err: unknown) => {
      assert.ok(err instanceof BackupError);
      assert.match(err.message, /Parol xato/);
      return true;
    },
  );
});

test("buzilgan fayl ANIQLANADI — jim o'tib ketmaydi", () => {
  const file = encrypt(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), PASSWORD);
  // Bitta baytni o'zgartiramiz (ko'chirishda buzilgan fayl)
  const broken = new Uint8Array(file);
  broken[broken.length - 20] ^= 0xff;
  assert.throws(() => decrypt(broken, PASSWORD), BackupError);
});

test("yarim ko'chirilgan fayl aniqlanadi", () => {
  const file = encrypt(new Uint8Array(100), PASSWORD);
  const half = file.subarray(0, Math.floor(file.length / 2));
  assert.throws(
    () => decrypt(half, PASSWORD),
    (err: unknown) => err instanceof BackupError,
  );
});

test("zaxira bo'lmagan fayl tushunarli xato beradi", () => {
  const notBackup = new Uint8Array(Buffer.from("bu oddiy matn fayli", "utf8"));
  assert.throws(
    () => decrypt(notBackup, PASSWORD),
    (err: unknown) => {
      assert.ok(err instanceof BackupError);
      assert.match(err.message, /zaxira fayli emas/);
      return true;
    },
  );
});

test("har zaxira boshqacha chiqadi — bir xil parol bilan ham", () => {
  const data = new Uint8Array([1, 2, 3]);
  const a = encrypt(data, PASSWORD);
  const b = encrypt(data, PASSWORD);
  assert.notDeepEqual(a, b, "tuz va iv har safar yangi bo'lishi kerak");
  // Lekin ikkisi ham ochiladi
  assert.deepEqual(decrypt(a, PASSWORD), data);
  assert.deepEqual(decrypt(b, PASSWORD), data);
});

test("fayl boshida belgi turadi", () => {
  const file = encrypt(new Uint8Array([1]), PASSWORD);
  assert.equal(Buffer.from(file.subarray(0, MAGIC.length)).toString("ascii"), MAGIC);
});

// --- Fayllarni yig'ish ---

test("fayllar yig'ilib, aynan qaytadi", () => {
  const files = [
    { name: "umra.db", data: new Uint8Array([1, 2, 3]) },
    { name: "photos/KARIMOV_AZIZ_uzb-pasport.jpg", data: new Uint8Array([255, 216, 255]) },
    { name: "photos/bo'sh.jpg", data: new Uint8Array(0) },
  ];
  assert.deepEqual(unbundle(bundle(files)), files);
});

test("o'zbekcha va uzun nomlar saqlanadi", () => {
  const name = "photos/O'ROZOV_G'AYRAT_uzb-pasport.jpg";
  const [out] = unbundle(bundle([{ name, data: new Uint8Array([7]) }]));
  assert.equal(out.name, name);
});

test("katta fayl ham to'g'ri qaytadi", () => {
  // 2 MB — haqiqiy pasport rasmi shu atrofda
  const big = new Uint8Array(2 * 1024 * 1024);
  for (let i = 0; i < big.length; i++) big[i] = i % 256;
  const [out] = unbundle(bundle([{ name: "katta.jpg", data: big }]));
  assert.deepEqual(out.data, big);
});

test("bo'sh ro'yxat ham ishlaydi", () => {
  assert.deepEqual(unbundle(bundle([])), []);
});

test("buzilgan yig'ma aniqlanadi", () => {
  const good = bundle([{ name: "a", data: new Uint8Array([1, 2, 3]) }]);
  assert.throws(() => unbundle(good.subarray(0, good.length - 2)), BackupError);
});

// --- Xavfli yo'llar ---

test("papkadan chiqib ketadigan yo'l rad etiladi", () => {
  assert.throws(() => safeName("../../etc/passwd"), BackupError);
  assert.throws(() => safeName("photos/../../x.jpg"), BackupError);
  assert.throws(() => safeName("/etc/passwd"), BackupError);
  assert.throws(() => safeName("C:/Windows/x.dll"), BackupError);
  assert.throws(() => safeName("..\\..\\x.dll"), BackupError);
});

test("oddiy yo'l o'tadi", () => {
  assert.equal(safeName("photos/KARIMOV_AZIZ.jpg"), "photos/KARIMOV_AZIZ.jpg");
  assert.equal(safeName("photos\\KARIMOV.jpg"), "photos/KARIMOV.jpg");
});

// --- Parol talabi ---

test("kuchsiz parol rad etiladi", () => {
  assert.match(checkPassword("1234") ?? "", /8 belgi/);
  assert.match(checkPassword("12345678") ?? "", /harf/);
  assert.equal(checkPassword("umra-2026-parol"), null);
});
