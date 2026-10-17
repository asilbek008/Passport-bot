/**
 * TO'LIQ SINOV: botning O'ZINI ishga tushirib tekshiradi.
 *
 * `npm test` — bo'laklarni alohida tekshiradi (MRZ, zip, Excel, qirqish).
 * Bu sinov esa butun yo'lni boshidan oxirigacha o'tadi: bot ishga tushadi,
 * rasm "keladi", o'qiladi, qirqiladi, bazaga yoziladi, tugmalar chiqadi,
 * tugma bosiladi va Excel/zip qaytadi — aynan xodim ko'radigan tartibda.
 *
 * Telegram ham, Gemini ham SOXTA: mahalliy server ularning o'rnida javob
 * beradi (`shim.mjs` tarmoqni burib yuboradi). Shuning uchun:
 *   • haqiqiy bot tokeni kerak emas;
 *   • API kaliti kerak emas, pul ketmaydi;
 *   • internet kerak emas;
 *   • haqiqiy pasport ishlatilmaydi — rasmlar shu yerda chiziladi;
 *   • sizning `.env`, bazangiz va rasmlaringizga TEGMAYDI (hammasi
 *     vaqtinchalik papkada).
 *
 * Ishga tushirish:  npm run sinov
 *
 * Nimani tekshirmaydi: Telegramning O'ZI tugmalarni qanday chizishini.
 * Buning uchun botni haqiqiy token bilan ishga tushirib `/sinov` yozing.
 */

import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import jpeg from "jpeg-js";
import { checkDigit, parseMrz } from "../../src/mrz.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const CHAT = 555001;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── soxta pasport rasmlari ─────────────────────────

/**
 * Kadr ichida "hujjat" turgan rasm: kulrang stol ustida oq pasport.
 * Qirqish to'g'ri ishlaganini shundan bilamiz — chiqqan rasm aynan
 * oq to'rtburchak o'lchamida bo'lishi kerak.
 */
function passportImage(width, height) {
  const data = new Uint8Array(width * height * 4);
  const x0 = Math.round(width * 0.125);
  const x1 = Math.round(width * 0.875);
  const y0 = Math.round(height * 0.133);
  const y1 = Math.round(height * 0.867);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const doc = x >= x0 && x < x1 && y >= y0 && y < y1;
      data[i] = doc ? 238 : 96;
      data[i + 1] = doc ? 236 : 98;
      data[i + 2] = doc ? 230 : 102;
      data[i + 3] = 255;
    }
  }
  return {
    bytes: new Uint8Array(jpeg.encode({ data, width, height }, 92).data),
    box: [133, 125, 867, 875], // [y0,x0,y1,x1], 0..1000
    width,
    height,
  };
}

/** Haqiqiy tekshiruv raqamlari bilan TD3 (pasport) MRZ yasaydi. */
function td3({ surname, given, docNum, nat, birth, sex, expiry }) {
  const l1 = `P<${nat}${surname}<<${given.replace(/ /g, "<")}`
    .padEnd(44, "<")
    .slice(0, 44);
  const dn = docNum.padEnd(9, "<");
  const pn = "<".repeat(14);
  let l2 =
    dn +
    checkDigit(dn) +
    nat +
    birth +
    checkDigit(birth) +
    sex +
    expiry +
    checkDigit(expiry) +
    pn +
    checkDigit(pn);
  l2 += checkDigit(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43));
  return [l1, l2];
}

const people = [
  {
    file_id: "sinov-rasm-1",
    image: passportImage(800, 600),
    mrz: td3({
      surname: "BOYQOBILOV",
      given: "ASILBEK",
      docNum: "FA1234567",
      nat: "UZB",
      birth: "900115",
      sex: "M",
      expiry: "310820",
    }),
    file: "asilbek_boyqobilov_qizil.jpg",
  },
  {
    file_id: "sinov-rasm-2",
    image: passportImage(820, 620),
    mrz: td3({
      surname: "SALIMOVA",
      given: "NARGIZA",
      docNum: "FA7654321",
      nat: "UZB",
      birth: "950722",
      sex: "F",
      // Ataylab yaqin muddat — "pasporti yetmaydiganlar" ogohligi chiqishi kerak
      expiry: `${String((new Date().getFullYear() + 1) % 100).padStart(2, "0")}0115`,
    }),
    file: "nargiza_salimova_qizil.jpg",
  },
];

// Soxta ma'lumotning o'zi haqiqiy bo'lsin: yaroqsiz MRZ bilan sinov
// botni emas, o'zini aybdor qilardi
for (const p of people) {
  if (!parseMrz(p.mrz.join("\n"), new Date()).valid) {
    console.error("Sinovning MRZ'si xato:", p.mrz);
    process.exit(1);
  }
}

const byLength = new Map(people.map((p) => [p.image.bytes.length, p]));
const byFileId = new Map(people.map((p) => [p.file_id, p]));

// ───────────────────────── natijalar ─────────────────────────

const results = [];
function check(name, ok, note = "") {
  results.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${note ? ` — ${note}` : ""}`);
}

/** JPEG sarlavhasidan o'lcham — qirqish va burish ishlaganini tekshirish uchun */
function jpegSize(bytes) {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8],
      };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

// ───────────────────────── bitta sinov bosqichi ─────────────────────────

/**
 * Soxta Telegram + soxta Gemini serverini ko'taradi, botni ishga tushiradi
 * va `steps` ni bajaradi. Oxirida hammasini tozalaydi.
 */
async function withBot(mode, steps) {
  const calls = [];
  const geminiHits = [];
  let queue = [];
  let messageId = 100;
  let updateId = 1;
  const work = mkdtempSync(join(tmpdir(), "umra-sinov-"));

  const readBody = async (req) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return Buffer.concat(chunks);
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const send = (obj, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };

    if (url.pathname.startsWith("/file/")) {
      const id = url.pathname.replace("/file/photos/", "").replace(/\.jpg$/, "");
      const person = byFileId.get(id);
      if (!person) return send({ ok: false }, 404);
      res.writeHead(200, { "content-type": "image/jpeg" });
      return res.end(Buffer.from(person.image.bytes));
    }

    if (url.pathname === "/gemini") {
      const raw = await readBody(req);
      if (mode === "badkey") {
        geminiHits.push("403");
        return send(
          {
            error: {
              code: 403,
              message: "API key not valid. Please pass a valid API key.",
              status: "PERMISSION_DENIED",
            },
          },
          403,
        );
      }
      if (mode === "idfront") {
        geminiHits.push("id_front");
        return send({
          candidates: [
            {
              content: {
                role: "model",
                parts: [
                  {
                    text: JSON.stringify({
                      mrz_lines: [],
                      issue_date: null,
                      place_of_birth: null,
                      authority: null,
                      document_kind: "id_card",
                      mrz_readable: false,
                      problem: "old tomoni",
                      visa_type: null,
                      document_box: null,
                      rotation: 0,
                    }),
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
        });
      }
      let text = "{}";
      try {
        const body = JSON.parse(raw.toString("utf8"));
        const part = body.contents?.[0]?.parts?.find((p) => p.inlineData);
        const bytes = Buffer.from(part.inlineData.data, "base64");
        const person = byLength.get(bytes.length);
        geminiHits.push(person?.file_id ?? `noma'lum(${bytes.length})`);
        text = JSON.stringify({
          mrz_lines: person.mrz,
          issue_date: "2021-08-20",
          place_of_birth: "QIZIRIQ",
          authority: "IIB",
          document_kind: "passport",
          mrz_readable: true,
          problem: null,
          visa_type: null,
          document_box: person.image.box,
          rotation: mode === "rotate" ? 90 : 0,
        });
      } catch (err) {
        geminiHits.push(`xato: ${err.message}`);
      }
      return send({
        candidates: [
          { content: { role: "model", parts: [{ text }] }, finishReason: "STOP" },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
      });
    }

    const method = url.pathname.replace("/tg/", "");
    const raw = await readBody(req);

    if (method === "sendDocument") {
      const form = await new Response(raw, {
        headers: { "content-type": req.headers["content-type"] },
      }).formData();
      const doc = form.get("document");
      const bytes = Buffer.from(await doc.arrayBuffer());
      writeFileSync(join(work, doc.name), bytes);
      calls.push({
        method,
        body: { name: doc.name, size: bytes.length, caption: form.get("caption") },
      });
      return send({ ok: true, result: { message_id: ++messageId } });
    }

    const body = raw.length ? JSON.parse(raw.toString("utf8")) : {};

    if (method === "getUpdates") {
      const batch = queue;
      queue = [];
      if (batch.length === 0) {
        await sleep(150);
        return send({ ok: true, result: [] });
      }
      return send({ ok: true, result: batch });
    }

    calls.push({ method, body });

    switch (method) {
      case "getMe":
        return send({ ok: true, result: { id: 777, username: "sinov_umra_bot" } });
      case "getFile":
        return send({
          ok: true,
          result: { file_id: body.file_id, file_path: `photos/${body.file_id}.jpg` },
        });
      case "sendMessage":
      case "editMessageText":
        return send({ ok: true, result: { message_id: ++messageId } });
      default:
        return send({ ok: true, result: true });
    }
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  // MUHIM: `.env` ga TEGMAYMIZ. Sozlamalar muhit o'zgaruvchisi bilan
  // beriladi — `loadEnv()` muhitda bor qiymatni `.env` bilan bosmaydi,
  // shuning uchun xodimning haqiqiy tokeni va bazasi chetda qoladi.
  const bot = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings=ExperimentalWarning",
      "--import",
      join(HERE, "shim.mjs"),
      "src/index.ts",
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        SINOV_PORT: String(port),
        BOT_TOKEN: "777777:SINOV-SOXTA-TOKEN",
        GEMINI_API_KEY: "AIzaSINOV-SOXTA-KALIT",
        ANTHROPIC_API_KEY: "",
        PROVIDER: "gemini",
        OPERATORS: String(CHAT),
        DB_PATH: join(work, "umra.db"),
        PHOTOS_DIR: join(work, "photos"),
        REQUESTS_PER_MINUTE: "120",
        BATCH_WAIT_MS: "600",
        RETENTION_DAYS: "180",
      },
    },
  );

  const log = [];
  bot.stdout.on("data", (d) => log.push(d.toString()));
  bot.stderr.on("data", (d) => log.push(d.toString()));

  const api = {
    calls,
    geminiHits,
    log,
    work,
    file: (name) => new Uint8Array(readFileSync(join(work, name))),
    push(update) {
      queue.push({ update_id: updateId++, ...update });
    },
    photo(person, group) {
      api.push({
        message: {
          message_id: ++messageId,
          chat: { id: CHAT, type: "private" },
          from: { id: CHAT },
          media_group_id: group,
          photo: [
            {
              file_id: person.file_id,
              width: person.image.width,
              height: person.image.height,
              file_size: person.image.bytes.length,
            },
          ],
        },
      });
    },
    text(text) {
      api.push({
        message: {
          message_id: ++messageId,
          chat: { id: CHAT, type: "private" },
          from: { id: CHAT },
          text,
        },
      });
    },
    button(data) {
      api.push({
        callback_query: {
          id: `cb-${data}-${Date.now()}`,
          from: { id: CHAT },
          data,
          message: { message_id: messageId, chat: { id: CHAT, type: "private" } },
        },
      });
    },
    /** Shu paytdan keyin kelgan so'rovni kutadi */
    async wait(label, test, timeout = 40_000) {
      const from = calls.length;
      const started = Date.now();
      while (Date.now() - started < timeout) {
        const hit = calls.slice(from).find(test);
        if (hit) return hit;
        await sleep(100);
      }
      throw new Error(`"${label}" chiqmadi.\n--- bot jurnali ---\n${log.join("")}`);
    },
    /** Hisobot "o'qilmoqda..." xabarining ustiga yoziladi (editMessageText) */
    reports: () =>
      calls
        .filter((c) => c.method === "editMessageText")
        .map((c) => c.body.text ?? "")
        .join("\n"),
  };

  try {
    // Bot ko'tarilishini kutamiz
    await api.wait("ishga tushish", () => true, 20_000);
    for (let i = 0; i < 100 && !log.join("").includes("Bazadagi yozuvlar"); i++) {
      await sleep(100);
    }
    await steps(api);
  } finally {
    bot.kill("SIGINT");
    await sleep(600);
    bot.kill("SIGKILL");
    server.close();
    rmSync(work, { recursive: true, force: true });
  }
}

// ───────────────────────── 1. Asosiy yo'l ─────────────────────────

async function asosiy() {
  console.log("\n1) Asosiy yo'l: /start → 2 rasm → tugmalar → Excel va zip");
  await withBot("full", async (bot) => {
    check(
      "Bot ishga tushdi",
      bot.log.join("").includes("Bot ishga tushdi"),
      (bot.log.join("").match(/O'qish: (.+)/) ?? [])[1] ?? "?",
    );

    const cmds = bot.calls.find((c) => c.method === "setMyCommands").body.commands;
    check(
      "Menyuda /start birinchi turadi",
      cmds[0].command === "start",
      cmds.map((c) => `/${c.command}`).join(" "),
    );

    // /start — pastdagi doimiy tugmalar
    bot.text("/start");
    const start = await bot.wait(
      "/start javobi",
      (c) => c.method === "sendMessage" && c.body.reply_markup?.keyboard,
    );
    const rows = start.body.reply_markup.keyboard.map((r) => r.map((b) => b.text));
    check(
      "Pastdagi doimiy tugmalar chiqdi",
      rows.flat().length === 3 && start.body.reply_markup.is_persistent === true,
      rows.flat().join(" / "),
    );

    // Ikki pasport bitta albomda
    bot.photo(people[0], "albom-1");
    bot.photo(people[1], "albom-1");
    const picked = await bot.wait(
      "to'plam tugmalari",
      (c) =>
        c.method === "sendMessage" &&
        c.body.reply_markup?.inline_keyboard &&
        !String(c.body.reply_markup.inline_keyboard[0][0].callback_data).startsWith(
          "sinov",
        ),
    );
    const inline = picked.body.reply_markup.inline_keyboard.flat();
    check("Ikki rasm o'qildi va 3 ta tugma chiqdi", inline.length === 3,
      inline.map((b) => b.text).join(" / "));
    check("Ikkala rasm ham modelga ketdi", bot.geminiHits.length === 2);

    const report = bot.reports();
    check(
      "Hisobotda ikkala ism ham bor",
      /BOYQOBILOV/.test(report) && /SALIMOVA/.test(report),
    );
    check("Hisobotda rasm qirqilgani aytildi", /qirqildi/.test(report));

    const batchId = inline[0].callback_data.split(":")[1];

    // Excel tugmasi
    bot.button(`excel:${batchId}`);
    const xlsx = await bot.wait(
      "Excel fayli",
      (c) => c.method === "sendDocument" && c.body.name.endsWith(".xlsx"),
    );
    check("📊 tugmasi Excel fayl berdi", true, xlsx.body.name);

    // Zip tugmasi
    bot.button(`zip:${batchId}`);
    const zip = await bot.wait(
      "zip arxivi",
      (c) => c.method === "sendDocument" && c.body.name.endsWith(".zip"),
    );
    const archive = bot.file(zip.body.name);
    const names = zipNames(archive);
    check(
      "🗂 tugmasi arxiv berdi, nomlari ism_familiya_turi.jpg",
      people.every((p) => names.some((n) => n.endsWith(p.file))),
      names.map((n) => n.split("/").pop()).join(", "),
    );
    check("Arxiv ichida Excel ham bor", names.some((n) => n.endsWith(".xlsx")));

    const first = zipEntry(archive, people[0].file);
    const size = jpegSize(first);
    check(
      "Rasm hujjatning o'ziga qirqildi",
      size.width < people[0].image.width && size.width > people[0].image.width / 2,
      `${people[0].image.width}×${people[0].image.height} → ${size.width}×${size.height}`,
    );

    // Pastdagi doimiy tugma — oddiy matn sifatida keladi
    bot.text("🗂 Zip qilib olish");
    await bot.wait(
      "pastdagi tugmadan zip",
      (c) => c.method === "sendDocument" && c.body.name.endsWith(".zip"),
    );
    check("Pastdagi doimiy tugma ham ishlaydi", true);

    // Pasport farqlash
    bot.button(`farq:${batchId}`);
    const kinds = await bot.wait(
      "farqlash javobi",
      (c) => c.method === "sendMessage" && /pasport/i.test(c.body.text ?? ""),
    );
    check(
      "🔍 Pasport farqlash javob berdi",
      /BOYQOBILOV/.test(kinds.body.text),
      kinds.body.text.split("\n")[0],
    );

    // Buyruqlar
    bot.text("/royxat");
    const list = await bot.wait(
      "/royxat",
      (c) => c.method === "sendMessage" && /BOYQOBILOV/.test(c.body.text ?? ""),
    );
    check("/royxat ro'yxat berdi", true, list.body.text.split("\n")[0]);

    bot.text("/ogohlik");
    const warn = await bot.wait(
      "/ogohlik",
      (c) => c.method === "sendMessage" && /SALIMOVA/.test(c.body.text ?? ""),
    );
    check(
      "/ogohlik muddati yetmaydiganni topdi",
      !/BOYQOBILOV/.test(warn.body.text),
      warn.body.text.split("\n")[0],
    );

    // /sinov — tugmalarni haqiqiy Telegramda tekshirish buyrug'i
    bot.text("/sinov");
    const probe = await bot.wait(
      "/sinov tugmalari",
      (c) => c.method === "sendMessage" && c.body.reply_markup?.inline_keyboard,
    );
    check(
      "/sinov 3 ta tugma chiqardi",
      probe.body.reply_markup.inline_keyboard.flat().length === 3,
    );
    bot.button("sinov:zip");
    const answer = await bot.wait("/sinov javobi", (c) => c.method === "sendMessage");
    // Tugma bosilgani tasdiqlanmasa, Telegram tugmada aylanma belgini
    // 30 soniya ko'rsatib turadi va xodim qayta bosadi
    check(
      "Tugma bosilgani Telegramga tasdiqlandi",
      bot.calls.some((c) => c.method === "answerCallbackQuery"),
      (answer.body.text ?? "").split("\n")[0],
    );
  });
}

// ───────────────────────── 2. Yonboshlagan rasm ─────────────────────────

async function burish() {
  console.log("\n2) Yonboshlagan rasm to'g'rilanadi");
  await withBot("rotate", async (bot) => {
    bot.photo(people[0], "albom-b");
    const picked = await bot.wait(
      "to'plam tugmalari",
      (c) => c.method === "sendMessage" && c.body.reply_markup?.inline_keyboard,
    );
    check("Hisobotda burilgani aytildi", /burildi/.test(bot.reports()));

    bot.button(`zip:${picked.body.reply_markup.inline_keyboard[0][0].callback_data.split(":")[1]}`);
    const zip = await bot.wait(
      "zip arxivi",
      (c) => c.method === "sendDocument" && c.body.name.endsWith(".zip"),
    );
    const size = jpegSize(zipEntry(bot.file(zip.body.name), people[0].file));
    check(
      "Rasm 90° burilib saqlandi (bo'yi kengligidan katta)",
      size.height > size.width,
      `${size.width}×${size.height}`,
    );
  });
}

// ───────────────────────── 3. Kalit xato bo'lsa ─────────────────────────

async function kalitXato() {
  console.log("\n3) API kaliti xato bo'lsa — xodim tushunadi");
  await withBot("badkey", async (bot) => {
    bot.photo(people[0], "albom-k");
    const msg = await bot.wait(
      "xato xabari",
      (c) =>
        (c.method === "sendMessage" || c.method === "editMessageText") &&
        /kalit/i.test(c.body.text ?? ""),
    );
    check(
      "Xabar tushunarli (kalitni tekshirishni aytadi)",
      /GEMINI_API_KEY/.test(msg.body.text) && !/undefined|\[object/.test(msg.body.text),
      msg.body.text.split("\n").filter(Boolean)[1] ?? "",
    );
    check(
      "To'plam to'xtadi, bo'sh fayl yuborilmadi",
      !bot.calls.some((c) => c.method === "sendDocument"),
    );
  });
}

// ─────────────── 4. ID kartaning old tomoni ───────────────

async function idKartaOldTomoni() {
  console.log("\n4) ID kartaning old tomoni yuborilsa — orqa tomonini aytadi");
  await withBot("idfront", async (bot) => {
    bot.photo(people[0], "albom-id");
    await bot.wait(
      "hisobot",
      (c) => c.method === "editMessageText" && /O'qilmadi/.test(c.body.text ?? ""),
    );
    const report = bot.reports();
    check(
      "Xabar orqa tomonini olishni aytadi",
      /ORQA tomonida/.test(report),
      (report.match(/❌.*/) ?? [""])[0].slice(0, 90),
    );
    check(
      "\"Xira yoki kesilgan\" deb chalg'itmaydi",
      !/xira yoki kesilgan/.test(report),
    );
    check("Hech narsa saqlanmadi", !bot.calls.some((c) => c.method === "sendDocument"));
  });
}

// ───────────────────────── zip o'qish (kutubxonasiz) ─────────────────────────

/** Arxivdagi fayl nomlari. Markaziy katalogdan o'qiladi. */
function zipNames(bytes) {
  const out = [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < bytes.length - 4; i++) {
    if (dv.getUint32(i, true) !== 0x02014b50) continue;
    const nameLen = dv.getUint16(i + 28, true);
    out.push(new TextDecoder().decode(bytes.subarray(i + 46, i + 46 + nameLen)));
  }
  return out;
}

/**
 * Arxivdagi faylning MAZMUNI. `zip.ts` ikki usulda yozadi: siqmasdan
 * (store) yoki deflate — shuning uchun ikkisi ham qo'llanadi.
 */
function zipEntry(bytes, endsWith) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < bytes.length - 4; i++) {
    if (dv.getUint32(i, true) !== 0x04034b50) continue;
    const method = dv.getUint16(i + 8, true);
    const size = dv.getUint32(i + 18, true);
    const nameLen = dv.getUint16(i + 26, true);
    const extraLen = dv.getUint16(i + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(i + 30, i + 30 + nameLen));
    if (!name.endsWith(endsWith)) continue;
    const start = i + 30 + nameLen + extraLen;
    const raw = bytes.subarray(start, start + size);
    return method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw;
  }
  throw new Error(`Arxivda topilmadi: ${endsWith}`);
}

// ───────────────────────── ishga tushirish ─────────────────────────

console.log("═".repeat(62));
console.log("  TO'LIQ SINOV — bot ishga tushiriladi (soxta Telegram va Gemini)");
console.log("═".repeat(62));

try {
  await asosiy();
  await burish();
  await kalitXato();
  await idKartaOldTomoni();
} catch (err) {
  check("SINOV UZILDI", false, err.message);
}

const failed = results.filter((r) => !r.ok).length;
console.log("\n" + "─".repeat(62));
console.log(
  failed === 0
    ? `✅ Hammasi ishlayapti — ${results.length} tekshiruv o'tdi.`
    : `❌ ${failed} tekshiruv o'tmadi (${results.length} dan).`,
);
console.log("─".repeat(62));
process.exit(failed ? 1 : 0);
