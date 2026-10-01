/**
 * API xatolarini tushunarli sababga aylantirish.
 *
 * Nega muhim: avval hamma API xatosi "texnik xato" bo'lib ko'rinardi va
 * sababini (kalit xatomi, mablag' tugaganmi, model nomi xatomi) topish
 * imkonsiz edi. Bu testlar har sabab o'z xabarini olishini qulflaydi.
 */

process.env.ANTHROPIC_API_KEY ??= "sk-ant-test";

import test from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { apiFailure } from "../src/vision.ts";

/** Natijadan sabab matnini oladi. */
function reason(err: unknown): { problem: string; retryable: boolean } {
  const result = apiFailure(err);
  assert.equal(result.ok, false);
  assert.ok("problem" in result && "retryable" in result);
  return result as { problem: string; retryable: boolean };
}

/**
 * SDK xato obyektini yasaydi.
 *
 * Diqqat: `generate` ning 4-argumenti (headers) `undefined` bo'lsa, SDK
 * buni ulanish xatosi deb hisoblab `APIConnectionError` qaytaradi —
 * shuning uchun bo'sh `Headers` berilishi SHART.
 */
function apiError(
  status: number,
  message: string,
): InstanceType<typeof Anthropic.APIError> {
  return Anthropic.APIError.generate(
    status,
    { type: "error", error: { type: "error", message } },
    message,
    new Headers(),
  );
}

test("yordamchi haqiqiy SDK xato turini yasaydi", () => {
  // Bu testning o'zi ishonchli bo'lishi uchun
  assert.ok(apiError(401, "x") instanceof Anthropic.AuthenticationError);
  assert.ok(apiError(400, "x") instanceof Anthropic.BadRequestError);
  assert.ok(apiError(404, "x") instanceof Anthropic.NotFoundError);
  assert.ok(apiError(429, "x") instanceof Anthropic.RateLimitError);
  assert.equal(apiError(401, "x").status, 401);
});

test("401 — kalit xato, qayta urinish yordam bermaydi", () => {
  const r = reason(apiError(401, "invalid x-api-key"));
  assert.match(r.problem, /API kaliti qabul qilinmadi/);
  assert.match(r.problem, /ANTHROPIC_API_KEY/);
  assert.equal(r.retryable, false);
});

test("mablag' tugagani alohida aytiladi", () => {
  const r = reason(
    apiError(400, "Your credit balance is too low to access the Anthropic API"),
  );
  assert.match(r.problem, /mablag' yo'q/);
  assert.match(r.problem, /Billing/);
  assert.equal(r.retryable, false);
});

test("404 — model nomi xato, .env ga ishora qiladi", () => {
  const r = reason(apiError(404, "model not found"));
  assert.match(r.problem, /model topilmadi/);
  assert.match(r.problem, /MODEL/);
  assert.equal(r.retryable, false);
});

test("429 — vaqtincha, qayta urinish mumkin", () => {
  const r = reason(apiError(429, "rate limit exceeded"));
  assert.match(r.problem, /cheklov/);
  assert.equal(r.retryable, true, "qayta urinish mumkin bo'lishi kerak");
});

test("server xatosi (5xx) qayta urinishga arziydi", () => {
  const r = reason(apiError(529, "overloaded"));
  assert.equal(r.retryable, true);
  assert.match(r.problem, /529/);
});

test("boshqa 400 xatosi asl matni bilan ko'rsatiladi", () => {
  const r = reason(apiError(400, "image exceeds 5 MB maximum"));
  assert.match(r.problem, /image exceeds 5 MB/);
  assert.equal(r.retryable, false);
});

test("uzun xato matni qisqartiriladi", () => {
  const r = reason(apiError(400, "x".repeat(500)));
  assert.ok(r.problem.length < 200, `juda uzun: ${r.problem.length}`);
});

test("noma'lum xatoning faqat TURI aytiladi, matni emas", () => {
  // Ehtiyot uchun: noma'lum xato matnida hujjat ma'lumoti bo'lishi mumkin
  const r = reason(new Error("BOYQOBILOV ASILBEK AB1234567"));
  assert.match(r.problem, /kutilmagan xato/);
  assert.ok(!r.problem.includes("BOYQOBILOV"), "ism chiqmasligi kerak");
  assert.ok(!r.problem.includes("AB1234567"), "pasport raqami chiqmasligi kerak");
  assert.equal(r.retryable, true);
});

test("xato bo'lmagan qiymat ham yiqitmaydi", () => {
  const r = reason("shunchaki matn");
  assert.match(r.problem, /kutilmagan xato/);
});
