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

  /**
   * Rasmni kim o'qiydi: `gemini` yoki `anthropic`.
   * Berilmasa — qaysi kalit mavjud bo'lsa, o'shanisi tanlanadi.
   */
  get provider(): "gemini" | "anthropic" {
    const value = (process.env.PROVIDER ?? "").trim().toLowerCase();
    if (value === "gemini" || value === "anthropic") return value;
    // Avtomatik: Gemini kaliti bo'lsa Gemini, aks holda Anthropic
    if (process.env.GEMINI_API_KEY) return "gemini";
    return "anthropic";
  },

  /** Anthropic API kaliti — rasmni o'qish uchun */
  get anthropicKey(): string {
    return need("ANTHROPIC_API_KEY");
  },

  /** Model. Arzonroq variant: claude-sonnet-5-5 yoki claude-haiku-4-5 */
  get model(): string {
    return process.env.MODEL ?? "claude-opus-5-5";
  },

  /** Gemini API kaliti (Google AI Studio). `AIza` bilan boshlanadi. */
  get geminiKey(): string {
    return need("GEMINI_API_KEY");
  },

  /**
   * Gemini modeli. Aniq nomini aistudio.google.com da ko'rasiz.
   * MRZ — mayda shriftdagi aniqlik ishi, shuning uchun Flash tavsiya
   * etiladi; Flash-Lite arzonroq, lekin belgilarni ko'proq xato o'qadi
   * (tekshiruv raqamlari buni ushlaydi, lekin qayta surat olish kerak).
   */
  get geminiModel(): string {
    return process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
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

  /**
   * SUPERADMIN — bot egasi: umumiy statistikani ko'radi.
   *
   * Oddiy xodim faqat O'ZINING ishini ko'radi (`/profil`), egasi esa
   * butun bot bo'yicha sonlarni (`/statistika`): kim qancha hujjat
   * o'qigan, bugun nechta, qaysi turdagi hujjatlar va hokazo.
   *
   * Bir nechta bo'lsa vergul bilan. Bo'sh qoldirilsa — statistika
   * hech kimga ko'rinmaydi (bot shundayam ishlaydi).
   */
  get superadmins(): string[] {
    return (process.env.SUPERADMIN ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },

  /**
   * Botni ishga tushirgan oyna uni o'zi qaytaradimi.
   *
   * `windows\2-boshlash.bat` buni 1 qilib qo'yadi: u tsiklda ishlaydi va
   * bot to'xtasa qaytadan ko'taradi. Shu tufayli `/restart` dan keyin
   * xodimga "bir necha soniyada o'zi qaytadi" deb aytish mumkin;
   * oddiy `npm start` bo'lsa — "kompyuterda qaytadan oching" deyiladi.
   */
  get autoRestart(): boolean {
    return process.env.UMRA_AUTORESTART === "1";
  },

  /**
   * Bir vaqtda nechta rasm o'qiladi.
   *
   * Eng sekin qism — API javobi (3-8 soniya). Ketma-ket kutilganda
   * 11 rasm bir necha daqiqa olardi. Bir nechtasi birga yuborilsa,
   * vaqt shuncha barobar qisqaradi.
   *
   * 3 — ehtiyotkor standart: bepul tarifdagi chegarani portlatmaydi
   * (taqsimlagich baribir oraliq saqlaydi), lekin sezilarli tez.
   * Pullik tarifda 5-8 qilsa bo'ladi.
   */
  /**
   * O'qilmagan rasm uchun KUCHLIROQ model.
   *
   * Oddiy rasmlar tez va arzon model bilan o'qiladi. O'qilmagani esa
   * oxirgi urinishda shu modelga beriladi — unga faqat muammoli
   * rasmlar tushadi, shuning uchun narx deyarli oshmaydi, sifat esa
   * sezilarli yaxshilanadi (mayda MRZ qatorlarida farq katta).
   *
   * Bo'sh qoldirilsa, Gemini'da `gemini-2.5-pro` ishlatiladi. Bu model
   * kalitingizda bo'lmasa, oddiygina o'tkazib yuboriladi — bot
   * buzilmaydi. Butunlay o'chirish: FALLBACK_MODEL=off
   */
  get fallbackModel(): string {
    const given = (process.env.FALLBACK_MODEL ?? "").trim();
    if (given === "off") return "";
    if (given) return given;
    return this.provider === "gemini" ? "gemini-2.5-pro" : "";
  },

  get concurrency(): number {
    return Math.max(1, Math.min(12, num("CONCURRENCY", 3)));
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

  /**
   * Daqiqada API'ga shuncha so'rovdan ko'p yuborilmaydi.
   *
   * Gemini BEPUL tarifida chegara daqiqada 10–15, shuning uchun standarti
   * 10: 30 rasm 3 daqiqada o'qiladi, lekin TO'XTAB QOLMAYDI. Pullik
   * tarifda yoki Anthropic'da bu chegara ancha baland — o'shanda
   * REQUESTS_PER_MINUTE ni oshirsangiz tezroq ishlaydi.
   * 0 — taqsimlashni butunlay o'chiradi.
   */
  get requestsPerMinute(): number {
    const given = process.env.REQUESTS_PER_MINUTE;
    if (given !== undefined) return num("REQUESTS_PER_MINUTE", 30);
    // Berilmasa: tarifni oldindan bilmaymiz, shuning uchun TEZROQ
    // boshlanadi va chegaraga urilsa taqsimlagich o'zi sekinlashadi
    // (`Throttle.slowDown`). Avval bu yerda 10 turardi — ya'ni har
    // so'rov orasida 6 soniya, 11 rasm bir necha daqiqa olardi.
    return this.provider === "gemini" ? 30 : 60;
  },

  /**
   * Bitta rasmning eng katta hajmi (MB).
   *
   * Nega 3.5: rasm API'ga base64 bo'lib yuboriladi va hajmi ~1.33 barobar
   * oshadi, ya'ni 3.5 MB → ~4.7 MB. Anthropic'ning bir rasmga chegarasi
   * 5 MB, shuning uchun bu xavfsiz. Oshsa — tushunarsiz API xatosi
   * o'rniga xodimga "oddiy rasm sifatida yuboring" deyiladi.
   */
  get imageMaxBytes(): number {
    return Math.round(num("IMAGE_MAX_MB", 3.5) * 1024 * 1024);
  },

  /**
   * Bitta so'rov shuncha soniyadan uzoq cho'zilsa — to'xtatiladi.
   *
   * NEGA KERAK: avval hech qayerda muddat yo'q edi. Agar Google'ga
   * yoki Telegramga ulanish osilib qolsa (sekin tarmoq, proksi,
   * faervol), bot CHEKSIZ kutardi va xodim "o'qilmoqda..." yozuviga
   * tikilib o'tirardi — xato ham chiqmasdi, hisobot ham kelmasdi.
   *
   * 90 soniya: rasm o'qish odatda 3-10 soniya oladi, sekin tarmoqda
   * 30 gacha chiqishi mumkin. 90 dan oshsa — bu sekinlik emas, osilib
   * qolish.
   */
  get requestTimeoutMs(): number {
    return Math.round(num("REQUEST_TIMEOUT_SECONDS", 90) * 1000);
  },

  /**
   * Rasmni hujjatning o'ziga qirqish (standart — yoqilgan).
   *
   * O'chirish kerak bo'lsa: `CROP=off`. Shunda rasm xodim yuborgan holida
   * saqlanadi — qirqish natijasi yoqmasa, meni kutmasdan o'chirib qo'yish
   * uchun shu kalit bor.
   */
  get crop(): boolean {
    const value = (process.env.CROP ?? "").trim().toLowerCase();
    return !["off", "0", "no", "yoq", "false"].includes(value);
  },

  /**
   * Qirqishda hujjat chetiga qo'shiladigan bo'sh joy (kadr kengligining %).
   *
   * Model chegarani bir-ikki foiz ichkaridan ko'rsatishi mumkin, bu esa
   * pasportning qirrasini kesib qo'yardi. 2% — qirrasi butun qoladi,
   * lekin atrofdagi stol ham ko'rinmaydi.
   */
  get cropMarginPct(): number {
    return num("CROP_MARGIN_PCT", 2);
  },
};

export function isOperator(chatId: number | string): boolean {
  return config.operators.includes(String(chatId));
}

/**
 * Bot egasimi (umumiy statistikani ko'radi).
 *
 * Superadmin avtomatik ravishda xodim ham hisoblanadi: egasi botdan
 * foydalana olmay qolmasin deb (`OPERATORS` ga qo'shishni unutsa ham).
 */
export function isSuperadmin(chatId: number | string): boolean {
  return config.superadmins.includes(String(chatId));
}
