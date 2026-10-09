/**
 * `npm run modellar` — kalitingizga RUXSAT BERILGAN modellarni ko'rsatadi.
 *
 * NEGA KERAK: "model topilmadi" xatosi eng chalkash xatolardan biri.
 * Model nomi to'g'ri yozilgan bo'lishi mumkin, lekin:
 *   • o'sha model sizning hisobingizda yo'q bo'lishi mumkin;
 *   • nomi o'zgargan bo'lishi mumkin (Google versiyalarni almashtiradi);
 *   • bepul va pullik tarifda ro'yxat boshqacha bo'ladi.
 *
 * Taxmin qilib o'tirmasdan Google'ning o'zidan so'raymiz va rasm o'qiy
 * oladigan modellarni ajratib ko'rsatamiz.
 */

import { argv, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { loadEnv } from "../src/env.ts";

type Model = {
  name?: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  supportedActions?: string[];
  supportedGenerationMethods?: string[];
};

const line = "─".repeat(60);

/** Nomdan `models/` prefiksini olib tashlaydi — `.env` ga shunday yoziladi. */
function shortName(name: string): string {
  return name.startsWith("models/") ? name.slice("models/".length) : name;
}

function canGenerate(model: Model): boolean {
  const actions = model.supportedActions ?? model.supportedGenerationMethods ?? [];
  return actions.includes("generateContent");
}

async function main() {
  loadEnv();

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    console.error("");
    console.error("GEMINI_API_KEY yo'q. Avval sozlang:  npm run setup");
    console.error("");
    exit(1);
  }

  console.log("");
  console.log("Google'dan modellar ro'yxati so'ralmoqda...");

  // SDK orqali emas, to'g'ridan-to'g'ri REST: SDK ro'yxatni sahifalab
  // beradi va bu yerda shunchaki bitta so'rov yetarli
  let res: Response;
  try {
    res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
      { headers: { "x-goog-api-key": key } },
    );
  } catch (err) {
    console.error("");
    console.error(
      `Google'ga ulanib bo'lmadi: ${err instanceof Error ? err.message : err}`,
    );
    console.error("Internet yoki faervolni tekshiring.");
    console.error("");
    exit(1);
  }

  const text = await res.text();
  if (!res.ok) {
    console.error("");
    console.error(`Google rad etdi (HTTP ${res.status}):`);
    console.error(text.slice(0, 500));
    console.error("");
    if (res.status === 400 && text.includes("location")) {
      console.error("Bu joylashuv xatosi: Gemini bu mamlakatdan ishlamaydi.");
      console.error("Yechim: PROVIDER=anthropic, yoki boshqa mamlakatdagi server.");
    } else if (res.status === 400 || res.status === 403) {
      console.error("Kalit qabul qilinmadi. aistudio.google.com/apikey da");
      console.error("yangi kalit oling — kalit `AIza` bilan boshlanadi.");
    }
    console.error("");
    exit(1);
  }

  const models: Model[] = (JSON.parse(text).models ?? []) as Model[];
  const usable = models.filter(canGenerate).map((m) => shortName(m.name ?? ""));

  if (usable.length === 0) {
    console.log("");
    console.log("Rasm o'qiy oladigan model topilmadi.");
    console.log("Google AI Studio'da hisobingizni tekshiring.");
    console.log("");
    exit(1);
  }

  // MRZ — mayda shriftdagi aniqlik ishi. Flash yetarli va arzon;
  // Flash-Lite belgilarni ko'proq xato o'qiydi.
  const preferred = usable
    .filter((n) => n.includes("flash") && !n.includes("lite") && !n.includes("image"))
    .sort();

  console.log("");
  console.log(line);
  console.log("  KALITINGIZGA RUXSAT BERILGAN MODELLAR");
  console.log(line);
  console.log("");

  if (preferred.length > 0) {
    console.log("Bot uchun mos (tavsiya etilgan tartibda):");
    console.log("");
    for (const name of preferred) console.log(`  ${name}`);
    console.log("");
    console.log(`.env fayliga shunday yozasiz:   GEMINI_MODEL=${preferred[0]}`);
    console.log("");
  }

  console.log(`Hammasi (${usable.length} ta):`);
  console.log("");
  for (const name of usable.sort()) console.log(`  ${name}`);
  console.log("");

  const current = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  if (usable.includes(current)) {
    console.log(`✓ Hozirgi sozlama ("${current}") ro'yxatda bor.`);
  } else {
    console.log(`✗ Hozirgi sozlama ("${current}") ro'yxatda YO'Q —`);
    console.log("  xato aynan shundan. Yuqoridagilardan birini yozasiz.");
  }
  console.log("");
}

const runDirectly = argv[1] && import.meta.url === pathToFileURL(argv[1]).href;
if (runDirectly) {
  main().catch((err) => {
    console.error(`\nXato: ${err instanceof Error ? err.message : err}\n`);
    exit(1);
  });
}
