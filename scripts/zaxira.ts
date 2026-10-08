/**
 * `npm run zaxira` — baza va rasmlarni bitta shifrlangan faylga yig'adi.
 *
 * Natija: `zaxira/umra-zaxira-2026-10-08.umz`
 * Shu faylni flesh-diskka yoki boshqa kompyuterga ko'chirib qo'yasiz.
 * Parolsiz uni hech kim o'qiy olmaydi — flesh yo'qolsa ham mijozlarning
 * pasport ma'lumoti tarqalmaydi.
 *
 * Tiklash: `npm run tiklash zaxira/umra-zaxira-2026-10-08.umz`
 */

import { argv, exit } from "node:process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnv } from "../src/env.ts";
import { bundle, encrypt, checkPassword, type BundleFile } from "../src/backup.ts";
import { day } from "../src/day.ts";
import { Asker, askPassword, AskError } from "../src/ask.ts";

/** Papkadagi hamma faylni yig'adi (ichki papkalar bilan). */
function filesIn(root: string, prefix: string): BundleFile[] {
  if (!existsSync(root)) return [];
  const out: BundleFile[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      const name = `${prefix}/${relative(root, full).split(sep).join("/")}`;
      out.push({ name, data: new Uint8Array(readFileSync(full)) });
    }
  };

  walk(root);
  return out;
}

function human(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

async function main() {
  loadEnv();

  const dbPath = process.env.DB_PATH || "./data/umra.db";
  const photosDir = process.env.PHOTOS_DIR || "./data/photos";

  const files: BundleFile[] = [];

  if (existsSync(dbPath)) {
    files.push({ name: "umra.db", data: new Uint8Array(readFileSync(dbPath)) });
  } else {
    console.log(`Baza topilmadi: ${dbPath}`);
  }

  const photos = filesIn(resolve(photosDir), "photos");
  files.push(...photos);

  if (files.length === 0) {
    console.error("\nZaxira qilishga hech narsa yo'q (baza ham, rasm ham yo'q).\n");
    exit(1);
  }

  const total = files.reduce((sum, f) => sum + f.data.length, 0);
  console.log("");
  console.log(`Baza:    ${existsSync(dbPath) ? "bor" : "yo'q"}`);
  console.log(`Rasmlar: ${photos.length} ta`);
  console.log(`Hajmi:   ${human(total)}`);
  console.log("");
  console.log("Zaxira parol bilan shifrlanadi. Parolni YO'QOTMANG —");
  console.log("parolsiz zaxirani ochib bo'lmaydi, meni ham qo'shib hech kim.");
  console.log("");

  const ask = new Asker();
  try {
    const password = await askPassword(ask, "Parol o'ylab toping: ");
    const problem = checkPassword(password);
    if (problem) {
      console.error(`\n${problem}\n`);
      exit(1);
    }

    // Muhitdan olingan parolni qayta so'rashdan ma'no yo'q
    if (!process.env.ZAXIRA_PAROL) {
      const again = await ask.question("Parolni qayta yozing:  ");
      if (password !== again) {
        console.error("\nParollar mos kelmadi — hech narsa yozilmadi.\n");
        exit(1);
      }
    }

    console.log("\nShifrlanmoqda...");
    const encrypted = encrypt(bundle(files), password);

    mkdirSync("zaxira", { recursive: true });
    const out = join("zaxira", `umra-zaxira-${day()}.umz`);
    writeFileSync(out, encrypted);

    console.log("");
    console.log(`✅ Tayyor: ${out}  (${human(encrypted.length)})`);
    console.log("");
    console.log("Shu faylni flesh-diskka yoki boshqa kompyuterga ko'chirib qo'ying.");
    console.log("Oyiga bir marta yangilab turing.");
    console.log("");
    console.log(`Tiklash kerak bo'lsa:  npm run tiklash ${out}`);
    console.log("");
  } finally {
    ask.close();
  }
}

// Faqat to'g'ridan-to'g'ri ishga tushirilganda (import qilinganda emas)
const runDirectly =
  argv[1] && import.meta.url === pathToFileURL(argv[1]).href;
if (runDirectly) {
  main().catch((err) => {
    if (err instanceof AskError) {
      console.error("");
      console.error("Parol kiritilmadi — zaxira olinmadi.");
      console.error("");
      console.error("Agar buyruqni avtomatik ishga tushirayotgan bo'lsangiz,");
      console.error("parolni muhit o'zgaruvchisida bering:");
      console.error("  Windows:  set ZAXIRA_PAROL=parolingiz && npm run zaxira");
      console.error("");
      exit(1);
    }
    console.error(`\nXato: ${err instanceof Error ? err.message : err}\n`);
    exit(1);
  });
}
