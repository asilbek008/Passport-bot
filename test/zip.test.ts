/**
 * ZIP tuzgich. Format o'zimiz yozganimiz uchun, "baytlar to'g'ri
 * ko'rinadi" degan tekshiruv yetarli emas — arxiv OCHILISHI kerak.
 *
 * Shuning uchun har test arxivni ikki yo'l bilan ochadi: markaziy
 * katalog bo'yicha o'zimiz (CRC bilan — har kompyuterda ishlaydi) va
 * shu kompyuterda arxiv ochadigan dastur bo'lsa, u ham. Tafsiloti:
 * `test/unzip.ts`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeZip, safeZipPath } from "../src/zip.ts";
import { UNZIP, tryUnzipTo, readZip } from "./unzip.ts";

const enc = (s: string) => new TextEncoder().encode(s);

/**
 * Arxivni ochib, fayllarni matn sifatida qaytaradi.
 *
 * O'zimizning o'quvchimiz asosiy: u hamma joyda ishlaydi va CRC ni ham
 * tekshiradi. Begona dastur bo'lsa — u ham ochadi va natija solishtiriladi
 * (bir xil chiqmasa, bizning o'quvchimiz xatoni yashirgan bo'lardi).
 */
function extract(zip: Uint8Array): { files: Record<string, string> } {
  const files: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(readZip(zip))) {
    files[name] = Buffer.from(bytes).toString("utf8");
  }
  const dir = mkdtempSync(join(tmpdir(), "ziptest-"));
  const path = join(dir, "a.zip");
  writeFileSync(path, zip);
  if (!tryUnzipTo(path, join(dir, "out"))) return { files };

  const byTool: Record<string, string> = {};
  const walk = (base: string, prefix = "") => {
    for (const name of readdirSync(base, { withFileTypes: true })) {
      const full = join(base, name.name);
      const rel = prefix ? `${prefix}/${name.name}` : name.name;
      if (name.isDirectory()) walk(full, rel);
      else byTool[rel] = readFileSync(full, "utf8");
    }
  };
  walk(join(dir, "out"));
  assert.deepEqual(byTool, files, `${UNZIP} boshqa natija berdi`);
  return { files };
}

test("arxiv begona dastur bilan ochiladi va CRC to'g'ri", () => {
  const zip = makeZip([
    { path: "umra-mart/KARIMOV_AZIZ_uzb-pasport.txt", data: enc("birinchi") },
    { path: "umra-mart/SALIMOVA_NARGIZA_uzb-id.txt", data: enc("ikkinchi") },
  ]);

  const { files } = extract(zip);
  assert.equal(files["umra-mart/KARIMOV_AZIZ_uzb-pasport.txt"], "birinchi");
  assert.equal(files["umra-mart/SALIMOVA_NARGIZA_uzb-id.txt"], "ikkinchi");
  assert.equal(Object.keys(files).length, 2);
});

test("katta va takrorlanuvchi matn siqiladi", () => {
  // Deflate foyda beradigan ma'lumot
  const big = "A".repeat(50_000);
  const zip = makeZip([{ path: "katta.txt", data: enc(big) }]);

  assert.ok(zip.length < 5_000, `siqilmagan: ${zip.length} bayt`);
  const { files } = extract(zip);
  assert.equal(files["katta.txt"], big, "siqilgandan keyin ham o'zi qaytishi kerak");
});

test("JPEG qayta siqilmaydi, lekin buzilmaydi", () => {
  // Tasodifiy baytlar — siqilgan rasm shunday ko'rinadi
  const bytes = new Uint8Array(3000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + 13) % 256;

  const zip = makeZip([{ path: "rasm.jpg", data: bytes }]);
  assert.deepEqual(readZip(zip)["rasm.jpg"], bytes, "baytlar aynan qaytishi kerak");

  const dir = mkdtempSync(join(tmpdir(), "ziptest-"));
  const path = join(dir, "a.zip");
  writeFileSync(path, zip);
  if (!tryUnzipTo(path, dir)) return;
  const back = readFileSync(join(dir, "rasm.jpg"));
  assert.deepEqual(new Uint8Array(back), bytes, `${UNZIP} boshqa bayt berdi`);
});

test("takrorlangan nom yo'qolmaydi", () => {
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

test("bo'sh fayl va bo'sh arxiv ham to'g'ri", () => {
  const { files } = extract(makeZip([{ path: "bosh.txt", data: new Uint8Array(0) }]));
  assert.equal(files["bosh.txt"], "");

  // Bo'sh arxivda ochadigan narsa yo'q — faqat tuzilishini tekshiramiz
  const empty = makeZip([]);
  assert.equal(empty.length, 22, "faqat EOCD qolishi kerak");
});

test("UTF-8 nomlar saqlanadi", () => {
  const { files } = extract(
    makeZip([{ path: "umra-mart/o'zbek_hujjati.txt", data: enc("ok") }]),
  );
  assert.equal(files["umra-mart/o'zbek_hujjati.txt"], "ok");
});

test("ko'p fayl bilan ham ishlaydi", () => {
  const entries = Array.from({ length: 60 }, (_, i) => ({
    path: `guruh/odam-${i}.txt`,
    data: enc(`ma'lumot ${i}`),
  }));
  const { files } = extract(makeZip(entries));
  assert.equal(Object.keys(files).length, 60);
  assert.equal(files["guruh/odam-59.txt"], "ma'lumot 59");
});

test("o'quvchining o'zi buzilgan arxivni ushlaydi", () => {
  // Bu test TEKSHIRUVNI tekshiradi: agar o'quvchimiz har narsani
  // "ok" desa, yuqoridagi testlarning hammasi bo'sh gap bo'lib qolardi
  const good = makeZip([{ path: "rasm.jpg", data: enc("salom-salom") }]);

  // JPEG siqilmaydi, ya'ni "salom-salom" arxiv ichida ochiq turadi —
  // bitta harfini almashtirsak CRC mos kelmay qoladi
  const broken = Uint8Array.from(good);
  const at = Buffer.from(broken).indexOf("salom-salom");
  assert.ok(at > 0, "ma'lumot arxivda topilishi kerak");
  broken[at] = "S".charCodeAt(0);
  assert.throws(() => readZip(broken), /CRC/);

  // Oxiridan qirqilgan arxivda EOCD qolmaydi
  assert.throws(() => readZip(good.slice(0, good.length - 10)), /EOCD/);
});

// --- safeZipPath (arxiv ochmaydi, hech qanday dastur kerak emas) ---

test("arxivdan chiqib ketadigan yo'llar tozalanadi", () => {
  // "zip slip" hujumi: ../../ bilan papkadan chiqib ketish
  assert.equal(safeZipPath("../../etc/passwd"), "etc/passwd");
  assert.equal(safeZipPath("/mutlaq/yol.txt"), "mutlaq/yol.txt");
  assert.equal(safeZipPath("a/./b/../c.txt"), "a/b/c.txt");
  assert.equal(safeZipPath("papka\\fayl.txt"), "papka/fayl.txt");
  assert.equal(safeZipPath("oddiy/yol.txt"), "oddiy/yol.txt");
});
