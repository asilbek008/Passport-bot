/**
 * Gemini provayderining xato tahlili va provayder tanlovi.
 * Tarmoqqa chiqmaydi — faqat xatolarni tarjima qilish tekshiriladi.
 */

process.env.GEMINI_API_KEY ??= "AIzaTest";

import test from "node:test";
import assert from "node:assert/strict";
import { geminiFailure } from "../src/vision-gemini.ts";
import { config } from "../src/config.ts";

/** Natijadan sabab matnini oladi. */
function reason(err: unknown): { problem: string; retryable: boolean } {
  const result = geminiFailure(err);
  assert.equal(result.ok, false);
  assert.ok("problem" in result && "retryable" in result);
  return result as { problem: string; retryable: boolean };
}

/** Google SDK xatosi: status maydoni bilan. */
function httpError(status: number, message: string): Error {
  const err = new Error(message);
  (err as unknown as { status: number }).status = status;
  return err;
}

test("401/403 — kalit xato, AIza haqida eslatadi", () => {
  for (const code of [401, 403]) {
    const r = reason(httpError(code, "API key not valid"));
    assert.match(r.problem, /kaliti qabul qilinmadi/);
    assert.match(r.problem, /AIza/, "to'g'ri kalit shakli aytilishi kerak");
    assert.equal(r.retryable, false);
  }
});

test("kalit xatosi xabardan ham taniladi", () => {
  // Status maydoni bo'lmasa, xabardan aniqlanadi
  const r = reason(new Error("API key not valid. Please pass a valid API key."));
  assert.match(r.problem, /kaliti qabul qilinmadi/);
  assert.equal(r.retryable, false);
});

test("404 — model nomi xato", () => {
  const r = reason(httpError(404, "models/yoq-model is not found"));
  assert.match(r.problem, /model topilmadi/);
  assert.match(r.problem, /GEMINI_MODEL/);
  assert.equal(r.retryable, false);
});

test("429 — kvota, bepul tarif chegarasi aytiladi", () => {
  const r = reason(httpError(429, "Resource has been exhausted (quota)"));
  assert.match(r.problem, /chekloviga urildi/);
  assert.match(r.problem, /10.?15/, "bepul tarif chegarasi aytilishi kerak");
  assert.equal(r.retryable, true, "kutib qayta urinish mumkin");
});

test("5xx — vaqtincha, qayta urinishga arziydi", () => {
  const r = reason(httpError(503, "The model is overloaded"));
  assert.match(r.problem, /serverida xato/);
  assert.equal(r.retryable, true);
});

test("tarmoq uzilishi ajratiladi", () => {
  const r = reason(new TypeError("fetch failed"));
  assert.match(r.problem, /ulanib bo'lmadi/);
  assert.equal(r.retryable, true);
});

test("to'lov sozlanmagani alohida aytiladi", () => {
  const r = reason(httpError(400, "Billing account not configured for project"));
  assert.match(r.problem, /to'lov sozlanmagan/);
  assert.equal(r.retryable, false);
});

test("noma'lum xatoning faqat TURI aytiladi, matni emas", () => {
  // Ehtiyot uchun: noma'lum xato matnida hujjat ma'lumoti bo'lishi mumkin
  const r = reason(new Error("BOYQOBILOV ASILBEK AB1234567"));
  assert.match(r.problem, /kutilmagan xato/);
  assert.ok(!r.problem.includes("BOYQOBILOV"), "ism chiqmasligi kerak");
  assert.ok(!r.problem.includes("AB1234567"), "pasport raqami chiqmasligi kerak");
});

// --- Provayder tanlovi ---

test("PROVIDER berilmasa mavjud kalit bo'yicha tanlanadi", () => {
  const saved = { ...process.env };
  try {
    delete process.env.PROVIDER;

    process.env.GEMINI_API_KEY = "AIzaTest";
    assert.equal(config.provider, "gemini", "Gemini kaliti bor — Gemini");

    delete process.env.GEMINI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    assert.equal(config.provider, "anthropic", "faqat Anthropic kaliti bor");
  } finally {
    process.env = saved;
  }
});

test("PROVIDER aniq berilsa o'sha ishlatiladi", () => {
  const saved = { ...process.env };
  try {
    process.env.GEMINI_API_KEY = "AIzaTest";
    process.env.PROVIDER = "anthropic";
    assert.equal(config.provider, "anthropic", "aniq ko'rsatilgani ustun");

    process.env.PROVIDER = "GEMINI";
    assert.equal(config.provider, "gemini", "katta harf ham qabul qilinadi");

    // Tanilmagan qiymat — avtomatik tanlovga qaytadi
    process.env.PROVIDER = "nimadir";
    assert.equal(config.provider, "gemini");
  } finally {
    process.env = saved;
  }
});

test("Gemini modelining standarti bor", () => {
  const saved = process.env.GEMINI_MODEL;
  try {
    delete process.env.GEMINI_MODEL;
    assert.ok(config.geminiModel.startsWith("gemini-"), config.geminiModel);
    process.env.GEMINI_MODEL = "gemini-3-flash";
    assert.equal(config.geminiModel, "gemini-3-flash");
  } finally {
    if (saved === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = saved;
  }
});
