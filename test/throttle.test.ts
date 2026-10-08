/**
 * So'rovlarni taqsimlash va qayta urinish.
 * Soat va kutish soxta — test darhol tugaydi, haqiqiy vaqt kutilmaydi.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Throttle, withRetry } from "../src/throttle.ts";

/** Soxta soat: `sleep` vaqtni oldinga suradi. */
function fakeTime() {
  let now = 1_000_000;
  const slept: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      slept.push(ms);
      now += ms;
    },
    slept,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("birinchi so'rov kutmaydi", async () => {
  const t = fakeTime();
  const throttle = new Throttle(10, t.now, t.sleep);
  await throttle.wait();
  assert.deepEqual(t.slept, [], "darhol o'tishi kerak");
});

test("keyingi so'rovlar oraliq bilan o'tadi", async () => {
  const t = fakeTime();
  // Daqiqada 10 -> har 6 sekund
  const throttle = new Throttle(10, t.now, t.sleep);
  assert.equal(throttle.interval, 6000);

  await throttle.wait();
  await throttle.wait();
  await throttle.wait();

  assert.deepEqual(t.slept, [6000, 6000], "ikkinchi va uchinchisi kutadi");
});

test("vaqt o'tib ketgan bo'lsa kutilmaydi", async () => {
  const t = fakeTime();
  const throttle = new Throttle(10, t.now, t.sleep);

  await throttle.wait();
  // Xodim 10 sekund o'ylanib qoldi — navbat allaqachon keldi
  t.advance(10_000);
  await throttle.wait();

  assert.deepEqual(t.slept, [], "kutish kerak emas");
});

test("bir vaqtda kelgan so'rovlar ham taqsimlanadi", async () => {
  const t = fakeTime();
  const throttle = new Throttle(10, t.now, t.sleep);

  // Uchtasi birga chaqirildi (await qilinmasdan)
  await Promise.all([throttle.wait(), throttle.wait(), throttle.wait()]);

  assert.equal(t.slept.length, 2, "biri o'tadi, ikkitasi kutadi");
  assert.deepEqual(t.slept, [6000, 6000]);
});

test("perMinute 0 bo'lsa taqsimlash o'chadi", async () => {
  const t = fakeTime();
  const throttle = new Throttle(0, t.now, t.sleep);
  assert.equal(throttle.interval, 0);
  await throttle.wait();
  await throttle.wait();
  assert.deepEqual(t.slept, []);
});

test("daqiqadagi son oraliqqa to'g'ri aylanadi", () => {
  assert.equal(new Throttle(60).interval, 1000);
  assert.equal(new Throttle(15).interval, 4000);
  assert.equal(new Throttle(10).interval, 6000);
  assert.equal(new Throttle(1).interval, 60_000);
});

// --- withRetry ---

test("muvaffaqiyatli natija qayta urinilmaydi", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      return "yaxshi";
    },
    (v) => v !== "yaxshi",
    { sleep: async () => {} },
  );
  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: true, value: "yaxshi" });
});

test("vaqtincha xato qayta urinib tuziladi", async () => {
  const t = fakeTime();
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      return calls < 3 ? "band" : "yaxshi";
    },
    (v) => v === "band",
    { tries: 3, baseMs: 1000, sleep: t.sleep },
  );

  assert.equal(calls, 3);
  assert.equal(result.ok, true);
  assert.equal(result.value, "yaxshi");
  // Kutish ikki barobar oshib boradi
  assert.deepEqual(t.slept, [1000, 2000]);
});

test("tuzalmaydigan xatoga qayta urinilmaydi", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      return "kalit xato";
    },
    (v) => v === "band", // "kalit xato" qayta urinishga arzimaydi
    { tries: 5, sleep: async () => {} },
  );
  assert.equal(calls, 1, "bir marta urinib to'xtashi kerak");
  assert.equal(result.ok, true, "qayta urinilmasa 'ok' deb qaytadi");
});

test("urinishlar tugasa ok=false qaytadi", async () => {
  const t = fakeTime();
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      return "band";
    },
    (v) => v === "band",
    { tries: 3, baseMs: 500, sleep: t.sleep },
  );

  assert.equal(calls, 3);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.attempts, 3);
  assert.deepEqual(t.slept, [500, 1000]);
});
