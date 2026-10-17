/**
 * Telegram bilan ishlashdagi xatolar. `fetch` soxta qilinadi —
 * test tarmoqqa chiqmaydi.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Telegram, TelegramError, clipCaption, CAPTION_LIMIT } from "../src/telegram.ts";

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

// --- Fayl izohi (caption) ---
//
// Bu haqiqiy xato edi: 10 ta pasport bilan izoh 1024 belgidan oshib ketardi,
// Telegram esa butun so'rovni rad etadi — ya'ni ZIP FAYL HAM yuborilmaydi.

test("qisqa izoh o'zgarmaydi", () => {
  assert.equal(clipCaption("Tayyor: 3 ta hujjat"), "Tayyor: 3 ta hujjat");
});

test("chegaraning o'zi o'zgarmaydi", () => {
  const exact = "a".repeat(CAPTION_LIMIT);
  assert.equal(clipCaption(exact), exact);
});

test("uzun izoh chegaraga sig'diriladi", () => {
  const long = "a".repeat(CAPTION_LIMIT + 500);
  const clipped = clipCaption(long);
  assert.ok(
    clipped.length <= CAPTION_LIMIT,
    `${clipped.length} belgi — chegaradan oshdi`,
  );
  assert.match(clipped, /…$/, "qisqartirilgani ko'rinishi kerak");
});

test("qator o'rtasidan emas, qator oxiridan kesiladi", () => {
  const line = `${"ALIYEV ALI".padEnd(40, " ")}\n`;
  const long = line.repeat(40); // ~1640 belgi
  const clipped = clipCaption(long);
  assert.ok(clipped.length <= CAPTION_LIMIT);
  // Oxirgi qator yarmida uzilib qolmasligi kerak
  assert.equal(clipped.replace(/…$/, "").includes("ALIYE\n"), false);
  assert.match(clipped, /ALIYEV ALI/);
});

test("toq qolgan Markdown belgisi olib tashlanadi", () => {
  // *qalin* ning yarmida uzilsa, Telegram butun xabarni rad etadi
  const long = `${"x".repeat(CAPTION_LIMIT - 5)}*ALIYEV ALI* qolgani`;
  const clipped = clipCaption(long);
  assert.ok(clipped.length <= CAPTION_LIMIT);
  const stars = clipped.split("*").length - 1;
  assert.equal(stars % 2, 0, `toq son yulduzcha qoldi: ${stars}`);
});

test("sendDocument izohni o'zi qisqartiradi — fayl izohdan muhimroq", async () => {
  let sentCaption: string | null = null;
  globalThis.fetch = (async (_url: string, init: { body: FormData }) => {
    sentCaption = String(init.body.get("caption"));
    return new Response(JSON.stringify({ ok: true, result: {} }));
  }) as unknown as typeof fetch;

  const tg = new Telegram("token");
  await tg.sendDocument(
    1,
    "hujjatlar.zip",
    new Uint8Array([1, 2, 3]) as Uint8Array<ArrayBuffer>,
    "ALIYEV ALI\n".repeat(200),
  );

  assert.ok(sentCaption !== null, "izoh yuborilishi kerak");
  assert.ok(
    (sentCaption as unknown as string).length <= CAPTION_LIMIT,
    "Telegramga chegaradan uzun izoh yuborilmasligi kerak",
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

// --- Bot tavsifi (birinchi kirish) ---

test("tavsif Telegram chegaralariga sig'adi", async () => {
  const { t } = await import("../src/text.ts");
  assert.ok(
    t.botDescription.length <= 512,
    `tavsif ${t.botDescription.length} belgi — chegara 512`,
  );
  assert.ok(
    t.botShortDescription.length <= 120,
    `qisqa tavsif ${t.botShortDescription.length} belgi — chegara 120`,
  );
});

test("tavsif o'rnatilmasa ham bot ishga tushadi", async () => {
  // Eski bot API yoki tarmoq xatosi botni to'xtatmasligi kerak
  mockFetch(
    () =>
      new Response(
        JSON.stringify({ ok: false, error_code: 400, description: "nope" }),
        { status: 400 },
      ),
  );
  const tg = new Telegram("token");
  await tg.setDescriptions("tavsif", "qisqa");
});

// --- Muddat: so'rov cheksiz osilib qolmasin ---
//
// Bu haqiqiy nosozlik edi: hech qayerda muddat yo'q edi, shuning uchun
// ulanish osilib qolganda bot CHEKSIZ kutardi va xodim "o'qilmoqda..."
// yozuviga tikilib o'tirardi — xato ham chiqmasdi, hisobot ham kelmasdi.

test("so'rovga muddat qo'yiladi", async () => {
  let signal: AbortSignal | undefined;
  globalThis.fetch = (async (_url: string, init: { signal?: AbortSignal }) => {
    signal = init.signal;
    return new Response(JSON.stringify({ ok: true, result: {} }));
  }) as unknown as typeof fetch;

  const tg = new Telegram("token");
  await tg.call("getMe");

  assert.ok(signal, "signal berilishi kerak — aks holda cheksiz kutiladi");
  assert.equal(signal!.aborted, false);
});

test("muddat tugasa tushunarli xato beriladi", async () => {
  mockFetch(() => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    throw err;
  });

  const tg = new Telegram("token");
  await assert.rejects(
    () => tg.call("getMe"),
    (err: unknown) => {
      assert.ok(err instanceof TelegramError);
      assert.match(err.message, /soniyada javob bermadi/);
      assert.equal(err.network, true, "bu tarmoq muammosi");
      return true;
    },
  );
});

test("getUpdates uzunroq kutadi — long polling uzilib qolmasin", async () => {
  // Telegram 30 soniya kutadi; biz undan oldin uzsak, har safar
  // o'zimiz so'rovni buzgan bo'lardik
  let shortSignal: AbortSignal | undefined;
  let longSignal: AbortSignal | undefined;

  globalThis.fetch = (async (url: string, init: { signal?: AbortSignal }) => {
    if (String(url).includes("getUpdates")) longSignal = init.signal;
    else shortSignal = init.signal;
    return new Response(JSON.stringify({ ok: true, result: [] }));
  }) as unknown as typeof fetch;

  const tg = new Telegram("token");
  await tg.call("getMe");
  await tg.getUpdates(0, 30);

  assert.ok(shortSignal && longSignal);
  // Ikkisi ham signal bilan, lekin getUpdates'niki uzunroq bo'lishi kerak.
  // To'g'ridan-to'g'ri o'lchab bo'lmaydi, shuning uchun ikkisi ham
  // mavjudligini va hali uzilmaganini tekshiramiz.
  assert.equal(longSignal!.aborted, false);
});
