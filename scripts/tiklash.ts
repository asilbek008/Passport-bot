/**
 * `npm run tiklash <zaxira fayli>` — zaxiradan bazani va rasmlarni qaytaradi.
 *
 * MUHIM: tiklash hozirgi ma'lumot ustiga yozadi. Shuning uchun avval
 * nima borligi ko'rsatiladi va tasdiq so'raladi; hozirgi baza esa
 * o'chirilmasdan `umra.db.eski-<sana>` qilib saqlab qo'yiladi — tiklash
 * noto'g'ri faylga qilinsa, orqaga qaytarish mumkin bo'lsin.
 */

import { argv, exit } from "node:process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnv } from "../src/env.ts";
import { decrypt, unbundle, safeName, BackupError } from "../src/backup.ts";
import { day } from "../src/day.ts";
import { Asker, askPassword, AskError } from "../src/ask.ts";

async function main() {
  loadEnv();

  const file = argv[2];
  if (!file) {
    console.error("");
    console.error("Zaxira faylini ko'rsating:");
    console.error("  npm run tiklash zaxira/umra-zaxira-2026-10-08.umz");
    console.error("");
    exit(1);
  }

  if (!existsSync(file)) {
    console.error(`\nFayl topilmadi: ${file}\n`);
    exit(1);
  }

  const dbPath = process.env.DB_PATH || "./data/umra.db";
  const photosDir = process.env.PHOTOS_DIR || "./data/photos";

  const ask = new Asker();
  try {
    const password = await askPassword(ask, "Zaxira paroli: ");

    console.log("\nOchilmoqda...");
    const files = unbundle(decrypt(new Uint8Array(readFileSync(file)), password));

    const db = files.find((f) => f.name === "umra.db");
    const photos = files.filter((f) => f.name.startsWith("photos/"));

    console.log("");
    console.log(`Zaxirada: ${db ? "baza + " : ""}${photos.length} ta rasm`);
    console.log("");
    console.log("Hozirgi ma'lumot ustiga yoziladi:");
    console.log(`  baza:    ${dbPath}`);
    console.log(`  rasmlar: ${photosDir}`);
    if (existsSync(dbPath)) {
      console.log("");
      console.log("Hozirgi baza o'chirilmaydi — nusxasi saqlanib qoladi.");
    }
    console.log("");

    const yes = (
      process.env.TIKLASH_TASDIQ ?? (await ask.question("Davom etamizmi? (ha/yo'q): "))
    ).toLowerCase();
    if (!["ha", "h", "yes", "y"].includes(yes)) {
      console.log("\nTo'xtatildi — hech narsa o'zgarmadi.\n");
      return;
    }

    // Hozirgi bazani saqlab qo'yamiz: noto'g'ri zaxira tiklangan bo'lsa
    // orqaga qaytarish mumkin bo'lsin
    if (existsSync(dbPath)) {
      const kept = `${dbPath}.eski-${day()}`;
      copyFileSync(dbPath, kept);
      console.log(`\nHozirgi baza saqlandi: ${kept}`);
    }

    if (db) {
      mkdirSync(dirname(resolve(dbPath)), { recursive: true });
      writeFileSync(dbPath, db.data);
    }

    const photoRoot = resolve(photosDir);
    for (const photo of photos) {
      // `photos/` prefiksini olib tashlaymiz
      const inside = safeName(photo.name).slice("photos/".length);
      const target = join(photoRoot, inside);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, photo.data);
    }

    console.log("");
    console.log(`✅ Tiklandi: ${db ? "baza va " : ""}${photos.length} ta rasm`);
    console.log("");
    console.log("Endi botni ishga tushirsangiz bo'ladi:  npm start");
    console.log("");
  } catch (err) {
    if (err instanceof AskError) {
      console.error("\nParol kiritilmadi — hech narsa o'zgarmadi.\n");
      exit(1);
    }
    if (err instanceof BackupError) {
      console.error(`\n${err.message}\n`);
      exit(1);
    }
    throw err;
  } finally {
    ask.close();
  }
}

const runDirectly =
  argv[1] && import.meta.url === pathToFileURL(argv[1]).href;
if (runDirectly) {
  main().catch((err) => {
    console.error(`\nXato: ${err instanceof Error ? err.message : err}\n`);
    exit(1);
  });
}
