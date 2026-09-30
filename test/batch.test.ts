import test from "node:test";
import assert from "node:assert/strict";
import { Batcher, splitMessage } from "../src/batch.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("albomdagi rasmlar BITTA to'plam bo'lib o'qiladi", async () => {
  const batches: string[][] = [];
  const b = new Batcher(40, async (_chat, ids) => {
    batches.push(ids);
  });

  // Telegram albomni ketma-ket alohida xabar qilib yuboradi
  b.add(1, "a");
  b.add(1, "b");
  b.add(1, "c");
  assert.equal(b.pending(1), 3);

  await sleep(120);
  assert.equal(batches.length, 1, "bitta to'plam bo'lishi kerak");
  assert.deepEqual(batches[0], ["a", "b", "c"]);
});

test("har chat o'z navbatiga ega", async () => {
  const seen: Record<number, string[]> = {};
  const b = new Batcher(30, async (chat, ids) => {
    seen[chat] = [...(seen[chat] ?? []), ...ids];
  });

  b.add(1, "a");
  b.add(2, "x");
  b.add(1, "b");
  b.add(2, "y");

  await sleep(120);
  assert.deepEqual(seen[1], ["a", "b"]);
  assert.deepEqual(seen[2], ["x", "y"]);
});

test("qayta ishlash vaqtida kelgan rasm ham olinadi", async () => {
  const batches: string[][] = [];
  let first = true;
  const b = new Batcher(20, async (chat, ids) => {
    batches.push(ids);
    if (first) {
      first = false;
      // Xodim birinchi to'plam o'qilayotganda yana rasm tashladi
      b.add(chat, "late");
      await sleep(30);
    }
  });

  b.add(1, "a");
  await sleep(200);

  assert.equal(batches.length, 2, "keyin kelgan rasm ham o'qilishi kerak");
  assert.deepEqual(batches[0], ["a"]);
  assert.deepEqual(batches[1], ["late"]);
});

test("bir vaqtda ikki marta boshlanmaydi", async () => {
  let active = 0;
  let maxActive = 0;
  const b = new Batcher(10, async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await sleep(40);
    active--;
  });

  b.add(1, "a");
  await sleep(20);
  // Taymer ishlayotganda qo'lda ham chaqiramiz
  await Promise.all([b.flush(1), b.flush(1), b.flush(1)]);
  await sleep(80);

  assert.equal(maxActive, 1, "bitta chat uchun bir vaqtda bitta ishlov");
});

test("handler xatosi botni yiqitmaydi", async () => {
  const b = new Batcher(10, async () => {
    throw new Error("sinov xatosi");
  });
  b.add(1, "a");
  // flush xatoni tashlaydi, lekin ichki holat tozalanishi kerak
  await assert.rejects(() => b.flush(1));
  assert.equal(b.pending(1), 0);
  // Keyingi to'plam ishlashi kerak
  const ok: string[][] = [];
  const b2 = new Batcher(10, async (_c, ids) => void ok.push(ids));
  b2.add(1, "b");
  await sleep(60);
  assert.deepEqual(ok, [["b"]]);
});

test("stop() kutayotgan taymerlarni bekor qiladi", async () => {
  let called = false;
  const b = new Batcher(30, async () => {
    called = true;
  });
  b.add(1, "a");
  b.stop();
  await sleep(80);
  assert.equal(called, false);
});

// --- splitMessage ---

test("qisqa matn bo'linmaydi", () => {
  assert.deepEqual(splitMessage("salom"), ["salom"]);
});

test("uzun matn qator oxiridan bo'linadi", () => {
  const line = "x".repeat(100);
  const text = Array.from({ length: 50 }, () => line).join("\n");
  const parts = splitMessage(text, 1000);

  assert.ok(parts.length > 1, "bo'linishi kerak");
  for (const part of parts) {
    assert.ok(part.length <= 1000, `bo'lak juda uzun: ${part.length}`);
  }
  // Hech bir qator kesilmagan: har bo'lakdagi qatorlar to'liq 100 belgi
  for (const part of parts) {
    for (const l of part.split("\n")) assert.equal(l.length, 100);
  }
  // Hamma qator saqlangan
  assert.equal(parts.join("\n").split("\n").length, 50);
});

test("chegaradan uzun bitta qator majburan kesiladi", () => {
  const parts = splitMessage("y".repeat(2500), 1000);
  assert.equal(parts.length, 3);
  assert.equal(parts.join("").length, 2500);
});
