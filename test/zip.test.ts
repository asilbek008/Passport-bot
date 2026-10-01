/**
 * ZIP tuzgich. Format o'zimiz yozganimiz uchun, testlar arxivni HAQIQIY
 * `unzip` dasturi bilan ochib tekshiradi — "baytlar to'g'ri ko'rinadi"
 * yetarli emas, arxiv ochilishi kerak.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeZip, safeZipPath } from "../src/zip.ts";

const enc = (s: string) => new TextEncoder().encode(s);

/** `unzip` bor-yo'qligini bir marta aniqlaymiz. */
function hasUnzip(): boolean {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const UNZIP = hasUnzip();

/** Arxivni vaqtinchalik papkaga chiqaradi va fayllarni qaytaradi. */
function extract(zip: Uint8Array): { dir: string; files: Record<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), "ziptest-"));
  const path = join(dir, "a.zip");
  writeFileSync(path, zip);

  // -t: arxivni butunligini tekshiradi (CRC ham)
  execFileSync("unzip", ["-t", path], { stdio: "pipe" });
  execFileSync("unzip", ["-qq", "-o", path, "-d", join(dir, "out")], { stdio: "pipe" });

  const files: Record<string, string> = {};
  const walk = (base: string, prefix = "") => {
    for (const name of readdirSync(base, { withFileTypes: true })) {
      const full = join(base, name.name);
      const rel = prefix ? `${prefix}/${name.name}` : name.name;
      if (name.isDirectory()) walk(full, rel);
      else files[rel] = readFileSync(full, "utf8");
    }
  };
  walk(join(dir, "out"));
  return { dir, files };
}

test("arxiv haqiqiy unzip bilan ochiladi va CRC to'g'ri", { skip: !UNZIP }, () => {
  const zip = makeZip([
    { path: "umra-mart/KARIMOV_AZIZ_uzb-pasport.txt", data: enc("birinchi") },
    { path: "umra-mart/SALIMOVA_NARGIZA_uzb-id.txt", data: enc("ikkinchi") },
  ]);

  const { files } = extract(zip);
  assert.equal(files["umra-mart/KARIMOV_AZIZ_uzb-pasport.txt"], "birinchi");
  assert.equal(files["umra-mart/SALIMOVA_NARGIZA_uzb-id.txt"], "ikkinchi");
  assert.equal(Object.keys(files).length, 2);
});

test("katta va takrorlanuvchi matn siqiladi", { skip: !UNZIP }, () => {
  // Deflate foyda beradigan ma'lumot
  const big = "A".repeat(50_000);
  const zip = makeZip([{ path: "katta.txt", data: enc(big) }]);

  assert.ok(zip.length < 5_000, `siqilmagan: ${zip.length} bayt`);
  const { files } = extract(zip);
  assert.equal(files["katta.txt"], big, "siqilgandan keyin ham o'zi qaytishi kerak");
});

test("JPEG qayta siqilmaydi, lekin buzilmaydi", { skip: !UNZIP }, () => {
  // Tasodifiy baytlar — siqilgan rasm shunday ko'rinadi
  const bytes = new Uint8Array(3000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + 13) % 256;

  const zip = makeZip([{ path: "rasm.jpg", data: bytes }]);
  const dir = mkdtempSync(join(tmpdir(), "ziptest-"));
  const path = join(dir, "a.zip");
  writeFileSync(path, zip);
  execFileSync("unzip", ["-t", path], { stdio: "pipe" });
  execFileSync("unzip", ["-qq", "-o", path, "-d", dir], { stdio: "pipe" });

  const back = readFileSync(join(dir, "rasm.jpg"));
  assert.deepEqual(new Uint8Array(back), bytes, "baytlar aynan qaytishi kerak");
});

test("takrorlangan nom yo'qolmaydi", { skip: !UNZIP }, () => {
  // Ikki xil odam bir xil nomli bo'lsa
  const zip = makeZip([
    { path: "g/ALIYEV_SARDOR_uzb-pasport.txt", data: enc("birinchi") },
    { path: "g/ALIYEV_SARDOR_uzb-pasport.txt", data: enc("ikkinchi") },
  ]);
  const { files } = extract(zip);

  assert.equal(Object.keys(files).length, 2, "ikkalasi ham saqlanishi kerak");
  assert.equal(files["g/ALIYEV_SARDOR_uzb-pasport.txt"], "birinchi");
  assert.equal(files["g/ALIYEV_SARDOR_uzb-pasport-2.txt"], "ikkinchi");
});

test("bo'sh fayl va bo'sh arxiv ham to'g'ri", { skip: !UNZIP }, () => {
  const { files } = extract(makeZip([{ path: "bosh.txt", data: new Uint8Array(0) }]));
  assert.equal(files["bosh.txt"], "");

  // Bo'sh arxivni unzip "empty" deb qaytaradi (xato kodi bilan) —
  // shuning uchun faqat tuzilishini tekshiramiz
  const empty = makeZip([]);
  assert.equal(empty.length, 22, "faqat EOCD qolishi kerak");
});

test("UTF-8 nomlar saqlanadi", { skip: !UNZIP }, () => {
  const { files } = extract(
    makeZip([{ path: "umra-mart/o'zbek_hujjati.txt", data: enc("ok") }]),
  );
  assert.equal(files["umra-mart/o'zbek_hujjati.txt"], "ok");
});

test("ko'p fayl bilan ham ishlaydi", { skip: !UNZIP }, () => {
  const entries = Array.from({ length: 60 }, (_, i) => ({
    path: `guruh/odam-${i}.txt`,
    data: enc(`ma'lumot ${i}`),
  }));
  const { files } = extract(makeZip(entries));
  assert.equal(Object.keys(files).length, 60);
  assert.equal(files["guruh/odam-59.txt"], "ma'lumot 59");
});

// --- safeZipPath (tarmoqsiz, unzip kerak emas) ---

test("arxivdan chiqib ketadigan yo'llar tozalanadi", () => {
  // "zip slip" hujumi: ../../ bilan papkadan chiqib ketish
  assert.equal(safeZipPath("../../etc/passwd"), "etc/passwd");
  assert.equal(safeZipPath("/mutlaq/yol.txt"), "mutlaq/yol.txt");
  assert.equal(safeZipPath("a/./b/../c.txt"), "a/b/c.txt");
  assert.equal(safeZipPath("papka\\fayl.txt"), "papka/fayl.txt");
  assert.equal(safeZipPath("oddiy/yol.txt"), "oddiy/yol.txt");
});
