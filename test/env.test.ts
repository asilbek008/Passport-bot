import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseEnvLine, parseEnv, loadEnv } from "../src/env.ts";

test("oddiy qatorlar o'qiladi", () => {
  assert.deepEqual(parseEnvLine("BOT_TOKEN=abc123"), ["BOT_TOKEN", "abc123"]);
  assert.deepEqual(parseEnvLine("  KEY = value  "), ["KEY", "value"]);
  assert.deepEqual(parseEnvLine("export KEY=value"), ["KEY", "value"]);
});

test("izohlar va bo'sh qatorlar tashlanadi", () => {
  assert.equal(parseEnvLine("# izoh"), null);
  assert.equal(parseEnvLine("   "), null);
  assert.equal(parseEnvLine(""), null);
  assert.equal(parseEnvLine("KEYsiz qator"), null);
  assert.equal(parseEnvLine("=qiymat"), null);
  // Noto'g'ri kalit nomi
  assert.equal(parseEnvLine("2KEY=x"), null);
  assert.equal(parseEnvLine("MY-KEY=x"), null);
});

test("tirnoqlar to'g'ri ishlanadi", () => {
  assert.deepEqual(parseEnvLine('KEY="a b c"'), ["KEY", "a b c"]);
  assert.deepEqual(parseEnvLine("KEY='a b c'"), ["KEY", "a b c"]);
  // Qo'shtirnoqda \n haqiqiy qatorga aylanadi
  assert.deepEqual(parseEnvLine('KEY="bir\\nikki"'), ["KEY", "bir\nikki"]);
  // Bir tirnoqda o'girilmaydi
  assert.deepEqual(parseEnvLine("KEY='bir\\nikki'"), ["KEY", "bir\\nikki"]);
});

test("tirnoqsiz qiymatdan keyingi izoh olib tashlanadi", () => {
  assert.deepEqual(parseEnvLine("KEY=value # izoh"), ["KEY", "value"]);
  // Lekin qiymat ichidagi # qolishi kerak (token ichida bo'lishi mumkin)
  assert.deepEqual(parseEnvLine("KEY=va#lue"), ["KEY", "va#lue"]);
});

test("haqiqiy token shakli buzilmaydi", () => {
  const token = "8123456789:AAH-abcDEF_ghi123JKL456mno789PQR";
  assert.deepEqual(parseEnvLine(`BOT_TOKEN=${token}`), ["BOT_TOKEN", token]);
  const key = "sk-ant-api03-AbCdEf_123-456789";
  assert.deepEqual(parseEnvLine(`ANTHROPIC_API_KEY=${key}`), ["ANTHROPIC_API_KEY", key]);
});

test("parseEnv butun faylni o'qiydi", () => {
  const text = [
    "# Sozlamalar",
    "BOT_TOKEN=aaa",
    "",
    "ANTHROPIC_API_KEY=bbb   # kalit",
    "MODEL='claude-opus-5-5'",
    "buzuq qator",
  ].join("\n");
  assert.deepEqual(parseEnv(text), {
    BOT_TOKEN: "aaa",
    ANTHROPIC_API_KEY: "bbb",
    MODEL: "claude-opus-5-5",
  });
});

test("loadEnv faylni process.env ga qo'shadi", () => {
  const dir = mkdtempSync(join(tmpdir(), "envtest-"));
  const path = join(dir, ".env");
  writeFileSync(path, "TEST_YANGI_KALIT=qiymat\nTEST_BOR_KALIT=fayldan\n");

  // Muhitda allaqachon bor qiymat USTUN turishi kerak
  process.env.TEST_BOR_KALIT = "muhitdan";
  delete process.env.TEST_YANGI_KALIT;

  const added = loadEnv(path);

  assert.equal(process.env.TEST_YANGI_KALIT, "qiymat", "yangi kalit qo'shiladi");
  assert.equal(process.env.TEST_BOR_KALIT, "muhitdan", "mavjud qiymat bosilmaydi");
  assert.equal(added, 1);

  delete process.env.TEST_YANGI_KALIT;
  delete process.env.TEST_BOR_KALIT;
});

test("fayl bo'lmasa loadEnv jim qaytadi", () => {
  assert.equal(loadEnv(join(tmpdir(), "yoq-bunday-fayl-12345.env")), 0);
});

// --- Sozlash skriptidagi yozish ---

test("setValue bo'sh kalitni to'ldiradi, keyingi qatorga tegmaydi", async () => {
  const { setValue } = await import("../scripts/setup.ts");

  // Aynan shu holat xato bergan edi: bo'sh KEY= dan keyin izoh qatori
  const text = [
    "# @BotFather bergan bot tokeni",
    "BOT_TOKEN=",
    "",
    "# Anthropic kaliti (console.anthropic.com)",
    "ANTHROPIC_API_KEY=",
    "",
    "MODEL=claude-opus-5-5",
  ].join("\n");

  const after = setValue(text, "BOT_TOKEN", "123:abc");

  assert.match(after, /^BOT_TOKEN=123:abc$/m);
  // Keyingi qatorlar buzilmagan
  assert.match(after, /^ANTHROPIC_API_KEY=$/m);
  assert.match(after, /^MODEL=claude-opus-5-5$/m);
  assert.match(after, /console\.anthropic\.com/);
  // Izoh qatori qiymatga aylanib ketmagan
  assert.ok(!/BOT_TOKEN=#/.test(after));
});

test("setValue mavjud qiymatni almashtiradi", async () => {
  const { setValue } = await import("../scripts/setup.ts");
  const after = setValue("BOT_TOKEN=eski\nMODEL=x", "BOT_TOKEN", "yangi");
  assert.match(after, /^BOT_TOKEN=yangi$/m);
  assert.ok(!after.includes("eski"));
  assert.match(after, /^MODEL=x$/m);
});

test("setValue yo'q kalitni oxiriga qo'shadi", async () => {
  const { setValue } = await import("../scripts/setup.ts");
  const after = setValue("MODEL=x\n", "YANGI_KALIT", "qiymat");
  assert.match(after, /^YANGI_KALIT=qiymat$/m);
  assert.match(after, /^MODEL=x$/m);
});

test("setValue va parseEnv birga to'g'ri ishlaydi", async () => {
  const { setValue } = await import("../scripts/setup.ts");
  const token = "8123456789:AAH-abcDEF_ghi123JKL456mno789PQR";
  const key = "sk-ant-api03-AbCdEf_123456789012345";

  let text = "BOT_TOKEN=\nANTHROPIC_API_KEY=\n";
  text = setValue(text, "BOT_TOKEN", token);
  text = setValue(text, "ANTHROPIC_API_KEY", key);

  const parsed = parseEnv(text);
  assert.equal(parsed.BOT_TOKEN, token);
  assert.equal(parsed.ANTHROPIC_API_KEY, key);
});
