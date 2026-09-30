/**
 * Telegram bilan ishlashdagi xatolar. `fetch` soxta qilinadi —
 * test tarmoqqa chiqmaydi.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Telegram, TelegramError } from "../src/telegram.ts";

const realFetch = globalThis.fetch;

function mockFetch(handler: () => Response | Promise<Response> | never) {
  globalThis.fetch = (async () => handler()) as typeof fetch;
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("muvaffaqiyatli javob natijani qaytaradi", async () => {
  mockFetch(() => new Response(JSON.stringify({ ok: true, result: { username: "bot" } })));
  const tg = new Telegram("token");
  const me = await tg.call<{ username: string }>("getMe");
  assert.equal(me.username, "bot");
});

test("JSON bo'lmagan javob tushunarli xato beradi", async () => {
  // Faervol yoki proksi odatda HTML yoki oddiy matn qaytaradi
  mockFetch(
    () =>
      new Response("Host not in allowlist: api.telegram.org", {
        status: 403,
      }),
  );
  const tg = new Telegram("token");

  await assert.rejects(
    () => tg.call("getMe"),
    (err: unknown) => {
      assert.ok(err instanceof TelegramError);
      assert.equal(err.network, true, "tarmoq muammosi deb belgilanishi kerak");
      assert.match(err.message, /tushunarsiz/);
      assert.match(err.message, /HTTP 403/);
      assert.match(err.message, /Host not in allowlist/, "asl sabab ko'rinishi kerak");
      // "Unexpected token" kabi tushunarsiz xato CHIQMASLIGI kerak
      assert.ok(!/Unexpected token/.test(err.message));
      return true;
    },
  );
});

test("uzun tushunarsiz javob qisqartiriladi", async () => {
  mockFetch(() => new Response("x".repeat(5000), { status: 500 }));
  const tg = new Telegram("token");
  await assert.rejects(
    () => tg.call("getMe"),
    (err: unknown) => {
      assert.ok(err instanceof TelegramError);
      assert.ok(err.message.length < 300, `xabar juda uzun: ${err.message.length}`);
      assert.match(err.message, /…$/);
      return true;
    },
  );
});

test("ulanish uzilsa tarmoq xatosi deb belgilanadi", async () => {
  mockFetch(() => {
    throw new TypeError("fetch failed");
  });
  const tg = new Telegram("token");
  await assert.rejects(
    () => tg.call("getMe"),
    (err: unknown) => {
      assert.ok(err instanceof TelegramError);
      assert.equal(err.network, true);
      assert.match(err.message, /ulanib bo'lmadi/);
      return true;
    },
  );
});

test("xato token 401 kodi bilan ajratiladi", async () => {
  mockFetch(
    () =>
      new Response(
        JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" }),
        { status: 401 },
      ),
  );
  const tg = new Telegram("yaroqsiz");
  await assert.rejects(
    () => tg.call("getMe"),
    (err: unknown) => {
      assert.ok(err instanceof TelegramError);
      assert.equal(err.code, 401, "401 bo'lsa token xato degani");
      assert.equal(err.network, false, "bu tarmoq muammosi EMAS");
      assert.match(err.message, /Unauthorized/);
      return true;
    },
  );
});

test("Telegram xatosi tavsifi bilan qaytadi", async () => {
  mockFetch(
    () =>
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: "chat not found",
        }),
        { status: 400 },
      ),
  );
  const tg = new Telegram("token");
  await assert.rejects(
    () => tg.call("sendMessage", { chat_id: 1 }),
    (err: unknown) => {
      assert.ok(err instanceof TelegramError);
      assert.equal(err.code, 400);
      assert.match(err.message, /chat not found/);
      assert.match(err.message, /sendMessage/, "qaysi usul xato berganini ko'rsatadi");
      return true;
    },
  );
});

test("editMessage xatoni yutadi — progress ko'rsatgichi ishni to'xtatmaydi", async () => {
  mockFetch(
    () =>
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: "message is not modified",
        }),
        { status: 400 },
      ),
  );
  const tg = new Telegram("token");
  // Xato tashlanmasligi kerak
  await tg.editMessage(1, 2, "matn");
});
