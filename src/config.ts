/**
 * Sozlamalar faqat muhit o'zgaruvchilaridan olinadi — kod ichida kalit yo'q.
 *
 * Qiymatlar `get` orqali, ya'ni KERAK BO'LGANDA o'qiladi. Modul yuklanganda
 * xato tashlanmaydi: aks holda kalitsiz muhitda (masalan testda) bu faylni
 * import qilgan hech bir modulni ishga tushirib bo'lmas edi.
 */

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} o'rnatilmagan (.env.example fayliga qarang)`);
  return v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} son bo'lishi kerak`);
  return n;
}

export const config = {
  /** @BotFather bergan token */
  get botToken(): string {
    return need("BOT_TOKEN");
  },

  /** Anthropic API kaliti — rasmni o'qish uchun */
  get anthropicKey(): string {
    return need("ANTHROPIC_API_KEY");
  },

  /** Model. Arzonroq variant: claude-sonnet-5-5 yoki claude-haiku-4-5 */
  get model(): string {
    return process.env.MODEL ?? "claude-opus-5-5";
  },

  /**
   * Botdan foydalanishga ruxsat berilgan Telegram chat id'lari.
   * Bu ro'yxatda bo'lmagan hech kim botdan hech narsa olmaydi —
   * bot ochiq emas, tashkilotning ichki vositasi.
   */
  get operators(): string[] {
    return (process.env.OPERATORS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },

  get dbPath(): string {
    return process.env.DB_PATH ?? "./data/umra.db";
  },

  /**
   * Hujjat rasmlari saqlanadigan papka.
   *
   * DIQQAT: bu papkada mijozlarning pasport skanlari turadi. Umumiy
   * kompyuterda qoldirmang, zaxirasini ochiq joyga yuklamang.
   * `RETENTION_DAYS` o'tgach rasm ham yozuv bilan birga o'chadi.
   */
  get photosDir(): string {
    return process.env.PHOTOS_DIR ?? "./data/photos";
  },

  /**
   * Zip arxivining chegarasi (MB). Telegram bot 50 MB dan katta fayl
   * yubora olmaydi, shuning uchun undan pastda to'xtaymiz.
   */
  get zipMaxMb(): number {
    return num("ZIP_MAX_MB", 45);
  },

  /** Ma'lumot shu kundan keyin o'zi o'chadi (viza tugagach kerak emas) */
  get retentionDays(): number {
    return num("RETENTION_DAYS", 180);
  },

  /** Umra uchun pasport amal muddati kamida shuncha oy bo'lishi kerak */
  get minPassportMonths(): number {
    return num("MIN_PASSPORT_MONTHS", 6);
  },

  /**
   * Bir xodim kuniga shuncha rasmdan ko'p yubormaydi. Bir guruh 40–50 kishi
   * bo'lgani uchun chegara baland; maqsadi — xato bilan yuzlab rasm
   * yuborilib, API hisobini yeb qo'yishdan saqlash.
   */
  get dailyLimit(): number {
    return num("DAILY_LIMIT", 300);
  },

  /**
   * Telegram albomdagi rasmlarni alohida xabar qilib yuboradi. Shuncha
   * millisekund jim turgandan keyin to'plangan rasmlar birga o'qiladi —
   * shunda xodim 30 ta rasm tashlasa, 30 ta alohida javob emas, bitta
   * umumiy hisobot oladi.
   */
  get batchWaitMs(): number {
    return num("BATCH_WAIT_MS", 2500);
  },
};

export function isOperator(chatId: number | string): boolean {
  return config.operators.includes(String(chatId));
}
