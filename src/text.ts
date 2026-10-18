/**
 * Botning barcha matnlari. O'zbekcha, lotin yozuvida.
 *
 * Bot OCHIQ EMAS: u tashkilotning ichki vositasi, faqat `OPERATORS`
 * ro'yxatidagi xodimlar bilan gaplashadi. Shuning uchun matnlar ham
 * mijozga emas, xodimga qaratilgan.
 */

import { config } from "./config.ts";
import type { Pilgrim } from "./store.ts";
import { humanSize } from "./image-pick.ts";
import { localDay } from "./day.ts";
import {
  VISA_LABELS,
  VISA_ICON,
  visaState,
  visaTypeHelp,
  type VisaType,
} from "./visa.ts";

/** Markdown'da maxsus belgilarni zararsizlantirish (ism ichida `_` bo'lishi mumkin). */
export function esc(s: string): string {
  return s.replace(/([_*`\[\]])/g, "\\$1");
}

/** Soniyani odam o'qiydigan ko'rinishga keltiradi: "3 soat 12 daqiqa". */
function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} soniya`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} daqiqa`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest > 0 ? `${hours} soat ${rest} daqiqa` : `${hours} soat`;
  const days = Math.floor(hours / 24);
  return `${days} kun ${hours % 24} soat`;
}

export const t = {
  /** Ro'yxatda yo'q odam — botdan hech narsa olmaydi. */
  notOperator: [
    "Bu bot tashkilotning ichki vositasi va faqat xodimlar uchun ishlaydi.",
    "",
    "Agar Umra safari haqida savolingiz bo'lsa, tashkilotga to'g'ridan-to'g'ri murojaat qiling.",
  ].join("\n"),

  /** Birinchi xodim kod bilan ro'yxatga tushdi. */
  claimed: (chatId: number) =>
    [
      "✅ Ruxsat berildi — endi botdan foydalanishingiz mumkin.",
      "",
      `Sizning chat raqamingiz: \`${chatId}\``,
      "",
      "Bu ruxsat bazada saqlandi, shuning uchun botni qayta ishga",
      "tushirsangiz ham qoladi.",
      "",
      "Boshlash: /start",
    ].join("\n"),

  /** Hamkasbni qo'shish uchun kod. */
  inviteCode: (code: string, minutes: number) =>
    [
      "*Yangi xodim uchun kod:*",
      "",
      `\`${code}\``,
      "",
      `Hamkasbingiz botni ochib shu kodni yuborsa, ruxsat oladi.`,
      `Kod ${minutes} daqiqa amal qiladi va faqat bir marta ishlatiladi.`,
    ].join("\n"),

  operatorList: (fromDb: number[], fromEnv: string[], me: number) => {
    const lines: string[] = ["*Ruxsat berilgan xodimlar:*", ""];
    for (const id of fromDb) {
      lines.push(`• \`${id}\`${id === me ? " ← siz" : ""}`);
    }
    for (const id of fromEnv) {
      lines.push(`• \`${id}\` _(.env)_${Number(id) === me ? " ← siz" : ""}`);
    }
    lines.push("", "Qo'shish: `/xodim <raqam>` yoki /kod — hamkasbga kod");
    lines.push("O'chirish: `/xodim_ochir <raqam>`");
    return lines.join("\n");
  },

  /**
   * Chat raqami bo'yicha qo'shildi.
   *
   * NEGA KERAK: /kod bilan qo'shish uchun hamkasb o'zi botga kod
   * yuborishi kerak. Egasi xodimning chat raqamini bilsa, shu ikki
   * qadamning hojati yo'q — darhol ruxsat beriladi.
   */
  operatorAdded: (chatId: number) =>
    [
      `✅ \`${chatId}\` ruxsat oldi.`,
      "",
      "Ruxsat bazada saqlandi — botni qayta ishga tushirsangiz ham qoladi.",
      "Xodim botni ochib /start yozsa, ishlatishi mumkin.",
    ].join("\n"),
  operatorAlready: (chatId: number) => `\`${chatId}\` allaqachon ruxsatli.`,
  /** Ruxsat berish — faqat egasiga. Qo'shib bo'lingan ruxsat tarqab ketmasin. */
  addDenied:
    "Yangi xodimni faqat bot egasi qo'shadi. Hamkasbga kod berish: /kod",
  badChatId:
    "Chat raqami — faqat sonlardan iborat bo'ladi (masalan `123456789`).\n" +
    "Xodim o'z raqamini @userinfobot dan biladi.",

  operatorRemoved: (chatId: number) => `\`${chatId}\` ruxsatdan chiqarildi.`,
  operatorNotFound: (chatId: number) =>
    `\`${chatId}\` bazada yo'q. _(.env dagi xodimni faqat .env dan o'chirasiz.)_`,
  cannotRemoveSelf: "O'zingizni ruxsatdan chiqara olmaysiz.",
  needChatId: "Chat raqamini yozing: `/xodim_ochir 123456789`",
  needChatIdAdd: "Chat raqamini yozing: `/xodim 123456789`",

  /**
   * Bot tavsifi — bo'sh suhbatda, START tugmasi ustida ko'rinadi.
   * Telegram chegarasi: 512 belgi.
   */
  botDescription: [
    "Umra safari uchun pasport ma'lumotlarini tayyorlovchi ichki bot.",
    "",
    "Pasport rasmlarini yuboring — ism-familiya va pasport ma'lumotlari",
    "o'qiladi, sizga Excel jadval va rasmlar arxivi qaytariladi.",
    "",
    "Bot faqat tashkilot xodimlari uchun ishlaydi.",
  ].join("\n"),

  /** Bot profilidagi qisqa tavsif. Telegram chegarasi: 120 belgi. */
  botShortDescription:
    "Pasport rasmlaridan Excel jadval va rasmlar arxivini tayyorlaydi. Faqat tashkilot xodimlari uchun.",

  /**
   * `/start` — xodim botni birinchi ochganda ko'radigan matn.
   *
   * Qisqa bo'lishi SHART: butun ish bitta qadam — rasm yuborish. Avval
   * bu yerda `/guruh` bilan boshlanadigan uch qadamli yo'riqnoma turardi;
   * egasining talabi bilan guruh tushunchasi butunlay olib tashlandi.
   */
  start: (saved: number) =>
    [
      "Assalomu alaykum. Pasport rasmlarini shu yerga yuboring.",
      "",
      "Men har biridan ism-familiya va pasport ma'lumotini o'qiyman,",
      "keyin siz tugmalardan kerakligini tanlaysiz:",
      "",
      "🗂 *Zip qilib olish* — har pasportning rasmi, hujjatning o'ziga",
      "qirqilgan, `ism_familiya_turi.jpg` nomi bilan",
      "📊 *Excel qilib olish* — ism, familiya va pasport ma'lumotlari",
      "🔍 *Pasport farqlash* — qaysi biri qizil pasport, qaysi biri ID",
      "",
      "Rasmlarni bittalab ham, bir necha o'nlabini birga (albom qilib)",
      "ham yuborishingiz mumkin.",
      "",
      "*ID karta bo'lsa — ORQA tomonini oling.* Mashina o'qiydigan",
      "qatorlar (MRZ) kartaning orqasida; old tomonida ular yo'q.",
      "Pasportda esa surat bor sahifaning pastida.",
      "",
      saved > 0 ? `_Bazada ${saved} ta pasport bor._\n` : "",
      "Buyruqlar: /yordam · Nimadir ishlamasa: /restart",
      "",
      "*Eslatma:* bu mijozlarning shaxsiy hujjatlari — rasmlar ham,",
      "o'qilgan ma'lumot ham faqat ish uchun ishlatilsin.",
    ]
      .join("\n")
      // Bazada yozuv bo'lmaganda qolgan bo'sh qatorni yig'ib tashlaymiz
      .replace(/\n{3,}/g, "\n\n"),

  help: [
    "*Asosiy ish:* pasport rasmlarini yuborasiz, keyin hisobot ostidagi",
    "tugmalardan kerakligini tanlaysiz. Buyruq kerak emas.",
    "",
    "*Hamma yozuv bo'yicha:*",
    "`/royxat` — o'qilgan pasportlar ro'yxati",
    "`/excel` — hammasini bitta Excel jadval qilib olish",
    "`/zip` — hammasini rasmlar bilan arxiv qilib olish",
    "",
    "*Viza:*",
    "`/viza <pasport> <turi>` — viza belgilash (yoki viza rasmini yuboring)",
    "`/vizalar` — kimda qanday viza bor",
    "`/vizasiz` — vizasi yo'qlar",
    "`/vizani_ochir <pasport>` — viza ma'lumotini olib tashlash",
    "`/ogohlik` — pasporti tez tugaydiganlar",
    "",
    "*O'z ishingiz:*",
    "`/profil` — nechta hujjat o'qigansiz, kunlik chegara",
    "`/statistika` — butun bot bo'yicha sonlar (faqat bot egasiga)",
    "",
    "*Nimadir ishlamasa:*",
    "`/restart` — bot holatini ko'rish va qayta ishga tushirish",
    "`/sinov` — tugmalar ishlayaptimi (hech narsa saqlanmaydi)",
    "",
    "*Tozalash:*",
    "`/ochir <pasport raqami>` — bitta yozuvni va rasmini o'chirish",
    "`/tozalash` — saqlash muddati o'tgan yozuvlarni o'chirish",
    "",
    "*Xodimlar:*",
    "`/xodim <raqam>` — chat raqami bo'yicha darhol ruxsat berish",
    "`/kod` — yangi xodim uchun bir martalik kod",
    "`/xodimlar` — ruxsat berilganlar ro'yxati",
    "`/xodim_ochir <raqam>` — ruxsatni olib tashlash",
  ].join("\n"),

  // --- Rasm qabul qilish ---

  photoQueued: (n: number) =>
    n === 1
      ? "Rasm qabul qilindi, o'qilmoqda..."
      : `${n} rasm qabul qilindi, o'qilmoqda...`,

  progress: (done: number, total: number) =>
    `O'qilmoqda: ${done} / ${total}`,

  /**
   * Qayta urinilmoqda. Muddat tugashi 90 soniya bo'lgani uchun
   * bu uzoq cho'zilishi mumkin — xodim qotib qoldi deb o'ylamasin.
   */
  retrying: (photo: number, total: number, attempt: number, tries: number) =>
    [
      total > 1
        ? `${photo} / ${total} — javob kelmadi, qayta urinilmoqda (${attempt}/${tries})`
        : `Javob kelmadi, qayta urinilmoqda (${attempt}/${tries})`,
      "",
      "_Internet sekin bo'lsa bu bir-ikki daqiqa olishi mumkin._",
    ].join("\n"),

  dailyLimit: `Bugungi chegaraga (${config.dailyLimit} rasm) yetdingiz. Ertaga davom etasiz yoki \`DAILY_LIMIT\` ni oshirasiz.`,

  groupsNotAllowed:
    "Bu bot faqat shaxsiy suhbatda ishlaydi — hujjatni guruhga yubormang.",

  /** Rasm chegaradan katta — tushunarsiz API xatosi o'rniga aniq maslahat. */
  imageTooBig: (bytes: number, limit: number) =>
    [
      `Rasm juda katta: ${humanSize(bytes)} (chegara ${humanSize(limit)}).`,
      "",
      "Fayl (File) sifatida yuborilgan rasm siqilmaydi, shuning uchun",
      "katta bo'lib qoladi. Ikki yechim:",
      "",
      "• rasmni *oddiy rasm* sifatida yuboring (Telegram o'zi siqadi) —",
      "  MRZ shunda ham o'qiladi;",
      "• yoki telefonda kamera sifatini pasaytiring.",
    ].join("\n"),

  imageUnavailable: "Rasmni olib bo'lmadi — qayta yuborib ko'ring.",

  sendPhoto: [
    "Pasport sahifasining *rasmini* yuboring.",
    "",
    "Yaxshi rasm uchun: yorug' joyda, pasport tekis va to'liq ko'rinsin,",
    "pastdagi ikki qator (mashina o'qiydigan zona) aniq bo'lsin.",
  ].join("\n"),

  // --- Bitta rasm natijasi (to'plam hisobotida ishlatiladi) ---

  okLine: (p: {
    surname: string;
    givenNames: string;
    documentNumber: string;
    expiryDate: string;
    docLabel: string;
    fresh: boolean;
  }) =>
    `${p.fresh ? "✅" : "♻️"} ${esc(p.surname)} ${esc(p.givenNames)} — \`${p.documentNumber}\`` +
    ` · ${esc(p.docLabel)}` +
    (p.fresh ? "" : " _(yangilandi)_"),

  // --- Viza ---

  visaUsage: () =>
    [
      "*Viza belgilash:*",
      "",
      "`/viza AB1234567 umra`",
      "`/viza AB1234567 umra 2027-03-15`  ← muddati bilan",
      "`/viza AB1234567 single 2027-03-15 1234567890`  ← raqami bilan",
      "",
      `Turlari: ${visaTypeHelp()}`,
      "",
      "Yoki *viza yopishtirilgan sahifaning rasmini* yuboring — bot uning",
      "MRZ'ini o'qib, egasini ism bo'yicha topadi va o'zi belgilaydi.",
      "",
      "Boshqa buyruqlar: /vizasiz · /vizalar · `/vizani_ochir <pasport>`",
    ].join("\n"),

  visaUnknownType: (word: string) =>
    [
      `\`${esc(word)}\` — bunday viza turi tanilmadi.`,
      "",
      `Mumkin bo'lganlari: ${visaTypeHelp()}`,
      "",
      "Taxmin qilmadim — xato tur safar hujjatlarini buzadi.",
    ].join("\n"),

  visaSet: (p: Pilgrim, today: Date) => {
    const lines = [
      `✅ Viza belgilandi: *${esc(p.surname)} ${esc(p.given_names)}*`,
      "",
      `Turi: ${VISA_LABELS[(p.visa_type ?? "boshqa") as VisaType]}`,
    ];
    if (p.visa_number) lines.push(`Raqami: \`${p.visa_number}\``);
    if (p.visa_expiry) {
      lines.push(`Muddati: ${p.visa_expiry}`);
      const state = visaState(p.visa_expiry, today);
      if (state === "expired") lines.push("", "🔴 *Diqqat:* viza muddati tugagan.");
      else if (state === "soon") lines.push("", "🟡 *Diqqat:* vizaga 30 kundan kam qoldi.");
    }
    lines.push("", "_Qo'lda kiritildi — manba: siz._");
    return lines.join("\n");
  },

  visaCleared: (doc: string) => `\`${doc}\` — viza ma'lumoti olib tashlandi.`,

  allHaveVisa: (total: number) =>
    `Hammaning vizasi belgilangan (${total} kishi). 👍`,

  withoutVisa: (lines: string[], total: number) =>
    [
      `*Vizasi belgilanmaganlar: ${lines.length} / ${total}*`,
      "",
      ...lines,
      "",
      "Belgilash: `/viza <pasport> <turi>` yoki viza sahifasining rasmini yuboring.",
    ].join("\n"),

  visaList: (rows: Pilgrim[], today: Date) => {
    const lines = rows.map((p) => {
      if (!p.visa_type) return `⬜️ ${esc(p.surname)} ${esc(p.given_names)} — viza yo'q`;
      const type = p.visa_type as VisaType;
      const state = visaState(p.visa_expiry, today);
      const mark = state === "expired" ? " 🔴" : state === "soon" ? " 🟡" : "";
      const source = p.visa_source === "mrz" ? "" : " _(qo'lda)_";
      return (
        `${VISA_ICON[type] ?? "📄"} ${esc(p.surname)} ${esc(p.given_names)} — ` +
        `${VISA_LABELS[type] ?? p.visa_type}` +
        (p.visa_expiry ? ` · ${p.visa_expiry}${mark}` : "") +
        source
      );
    });
    const withVisa = rows.filter((p) => p.visa_type).length;
    return [`*Vizalar: ${withVisa} / ${rows.length}*`, "", ...lines].join("\n");
  },

  /** Viza yorlig'i rasmdan o'qilib, egasiga bog'landi. */
  visaAttached: (p: {
    surname: string;
    givenNames: string;
    number: string;
    expiry: string;
    type: VisaType | null;
  }) =>
    `🛂 ${esc(p.surname)} ${esc(p.givenNames)} — viza \`${p.number}\`` +
    (p.expiry ? ` · ${p.expiry}` : "") +
    (p.type ? ` · ${VISA_LABELS[p.type]}` : " · _turi o'qilmadi_"),

  visaNoOwner: (index: number, who: string) =>
    `❓ ${index}-rasm — viza (${who}): bu odam ro'yxatda yo'q.` +
    " _Avval pasportini yuboring._",

  visaAmbiguous: (index: number, who: string) =>
    `❓ ${index}-rasm — viza (${who}): bir nechta odam mos keldi,` +
    " qo'lda belgilang (`/viza <pasport> <turi>`).",

  // --- Zip arxiv ---

  zipCaption: (p: {
    photos: number;
    people: number;
    missing: string[];
    sizeMb: number;
  }) => {
    const lines = [
      `*${p.photos}* rasm · *${p.people}* kishi · ${p.sizeMb.toFixed(1)} MB`,
      "",
      "Arxiv ichida: har bir hujjat rasmi (nomi — familiya, ism va hujjat turi)",
      "va Excel jadval.",
    ];
    if (p.missing.length > 0) {
      lines.push(
        "",
        `⚠️ Rasmi topilmaganlar (${p.missing.length}): ${p.missing.slice(0, 10).join(", ")}` +
          (p.missing.length > 10 ? "…" : ""),
        "_Ularning ma'lumoti jadvalda bor, faqat rasmi yo'q._",
      );
    }
    return lines.join("\n");
  },

  zipTooBig: (sizeMb: number, maxMb: number) =>
    [
      `Arxiv juda katta: ${sizeMb.toFixed(1)} MB (chegara ${maxMb} MB).`,
      "",
      "Telegram bot bundan kattasini yubora olmaydi. Yechimlari:",
      "• `/tozalash` yoki `/ochir` bilan keraksiz yozuvlarni olib tashlang",
      "• `.env` dagi `ZIP_MAX_MB` ni oshiring (Telegram chegarasi 50 MB)",
      "",
      `Rasm fayllari papkada ham turadi: \`${config.photosDir}\``,
    ].join("\n"),

  /**
   * ID kartaning ikkinchi tomoni — xato emas, izoh.
   *
   * Xodim kartaning ikkala tomonini yuboradi (konsullikka ikkalasi
   * kerak). Old tomonida MRZ yo'q, lekin ma'lumot orqasidan o'qilgan —
   * ya'ni hammasi joyida, qayta suratga olish shart emas.
   */
  idOtherSide: (index: number) =>
    `ℹ️ ${index}-rasm — ID kartaning ikkinchi tomoni (ma'lumot MRZ'dan o'qildi)`,

  failLine: (index: number, why: string) => `❌ ${index}-rasm — ${why}`,


  // --- Profil va statistika ---

  /**
   * Xodimning o'z profili.
   *
   * Hujjat ma'lumoti yo'q — faqat SONLAR: xodim o'z ishini ko'radi,
   * mijozlarning ismi bu yerda chiqmaydi.
   */
  profile: (p: {
    chatId: number;
    total: number;
    today: number;
    month: number;
    lastAt: string | null;
    joinedAt: string | null;
    usedToday: number;
    limit: number;
    superadmin: boolean;
  }) => {
    const out: (string | null)[] = [
      `*Profil*${p.superadmin ? " — bot egasi" : ""}`,
      "",
      `Telegram raqami: \`${p.chatId}\``,
      p.joinedAt ? `Ro'yxatga olingan: ${localDay(p.joinedAt)}` : null,
      "",
      "*Siz o'qigan hujjatlar*",
      `Bugun: *${p.today}*`,
      `Oxirgi 30 kunda: *${p.month}*`,
      `Jami: *${p.total}*`,
      p.lastAt ? `Oxirgi hujjat: ${localDay(p.lastAt)}` : null,
      "",
      `*Bugungi rasm chegarasi:* ${p.usedToday} / ${p.limit}`,
      p.usedToday >= p.limit
        ? "_Chegara tugadi — ertaga yangilanadi._"
        : `_Yana ${p.limit - p.usedToday} ta rasm yuborishingiz mumkin._`,
    ];
    if (p.superadmin) {
      out.push("", "Butun bot bo'yicha sonlar: /statistika");
    }
    return out.filter((line) => line !== null).join("\n");
  },

  /** Faqat egasi uchun: butun bot bo'yicha sonlar. */
  stats: (s: {
    documents: number;
    today: number;
    week: number;
    month: number;
    photos: number;
    withVisa: number;
    expiringSoon: number;
    firstAt: string | null;
    operators: number;
    byKind: { label: string; n: number }[];
    perOperator: { chatId: number; total: number; today: number; lastAt: string | null }[];
    me: number;
    months: number;
  }) => {
    const out: (string | null)[] = [
      "*Statistika* — butun bot bo'yicha",
      "",
      "*Hujjatlar*",
      `Bugun: *${s.today}*`,
      `Oxirgi 7 kunda: *${s.week}*`,
      `Oxirgi 30 kunda: *${s.month}*`,
      `Jami: *${s.documents}*`,
      s.firstAt ? `Birinchi hujjat: ${localDay(s.firstAt)}` : null,
      "",
      `Rasmi bor: *${s.photos}*`,
      `Vizasi belgilangan: *${s.withVisa}*`,
      `Pasporti ${s.months} oydan kam qolgan: *${s.expiringSoon}*`,
    ];

    if (s.byKind.length > 0) {
      out.push("", "*Hujjat turlari*");
      for (const kind of s.byKind.slice(0, 8)) {
        out.push(`• ${esc(kind.label)} — ${kind.n}`);
      }
    }

    out.push("", `*Xodimlar* (${s.operators} ta ro'yxatda)`);
    if (s.perOperator.length === 0) {
      out.push("_Hali hech kim hujjat o'qimagan._");
    } else {
      for (const worker of s.perOperator.slice(0, 15)) {
        const me = worker.chatId === s.me ? " (siz)" : "";
        const today = worker.today > 0 ? `, bugun ${worker.today}` : "";
        out.push(`• \`${worker.chatId}\`${me} — ${worker.total} ta${today}`);
      }
    }

    return out.filter((line) => line !== null).join("\n");
  },

  /** Statistika faqat egasiga. */
  statsDenied: [
    "Bu bo'lim faqat bot egasi uchun.",
    "",
    "O'z ishingizni ko'rish uchun: /profil",
  ].join("\n"),

  // --- To'plam hisoboti ---

  batchReport: (parts: {
    ok: string[];
    failed: string[];
    /** Xato emas, izoh: masalan ID kartaning ikkinchi tomoni */
    notes?: string[];
    /**
     * Tashxis qatorlari: model hujjatni qanday belgilagani va nechta MRZ
     * qatori bergani. Hujjat ma'lumoti yo'q — faqat turi va soni.
     */
    diagnostics?: string[];
    warnings: string[];
    visaOk?: string[];
    visaProblems?: string[];
    total: number;
    /** Hisobotdan keyin Excel va arxiv yuboriladimi */
    files?: boolean;
    /** Nechta rasm hujjatning o'ziga qirqildi */
    cropped?: number;
    /** Nechta rasmning perspektivasi to'g'rilandi (skanerdek tekis bo'ldi) */
    flattened?: number;
    /** Nechtasi kesilgan rasmdan, yaqindan qayta o'qildi */
    zoomed?: number;
    /** Nechta rasm to'g'ri holatga burildi */
    turned?: number;
    /** Qirqilgan, lekin hujjat baribir kichik qolgan rasmlar soni */
    lowRes?: number;
    /** Qirqilmagan rasmlarning raqami — xodim ularni qo'lda qirqadi */
    notCropped?: number[];
    /** Nechta rasm diskka saqlanmadi */
    photoProblems?: number;
  }) => {
    const out: string[] = [];
    const visaOk = parts.visaOk ?? [];
    const visaProblems = parts.visaProblems ?? [];
    const read = parts.ok.length + visaOk.length;

    out.push(`*Natija:* ${read} / ${parts.total} o'qildi`);

    // Yaqindan qayta o'qilganlar: xodim buni bilsa, keyingi safar
    // hujjatni kadrga to'ldirib oladi va bot tezroq ishlaydi
    if (parts.zoomed && parts.zoomed > 0) {
      out.push(
        `_${parts.zoomed} tasi birinchi urinishda o'qilmadi — hujjatga ` +
          "kesib, yaqindan qayta o'qildi. Hujjat kadrni to'ldirsa tezroq bo'ladi._",
      );
    }

    if (parts.ok.length > 0) {
      out.push("", ...parts.ok);
    }

    if (visaOk.length > 0) {
      out.push("", "*Vizalar:*", ...visaOk);
    }

    if (visaProblems.length > 0) {
      out.push("", ...visaProblems);
    }

    if (parts.warnings.length > 0) {
      out.push("", "*Diqqat:*", ...parts.warnings);
    }

    if (parts.failed.length > 0) {
      out.push(
        "",
        `*O'qilmadi (${parts.failed.length}) — qaytadan suratga oling:*`,
        ...parts.failed,
      );
      // Tashxis: nima bo'lganini aniq bilish uchun — har rasm alohida
      // qatorda. Ism va hujjat raqami chiqmaydi: faqat hujjat turi,
      // qatorlar soni, chegara va qanday urinishlar bo'lgani.
      //
      // Har qator alohida: avval hammasi bitta uzun qatorga qo'shilardi
      // va 8 rasmlik to'plamda o'qib bo'lmaydigan matn chiqardi.
      const diagnostics = parts.diagnostics ?? [];
      if (diagnostics.length > 0) {
        out.push("", "_Tashxis (sifatni yaxshilash uchun):_", ...diagnostics);
      }
    }

    // Izohlar: xato emas, lekin xodim bilishi kerak
    const notes = parts.notes ?? [];
    if (notes.length > 0) {
      out.push("", ...notes);
    }

    // Rasm saqlanmasa, arxivda ham bo'lmaydi — xodim buni bilishi kerak
    if (parts.photoProblems && parts.photoProblems > 0) {
      out.push(
        "",
        `⚠️ ${parts.photoProblems} ta rasm diskka saqlanmadi — ma'lumoti bor, rasmi yo'q.`,
      );
    }

    if (parts.files) {
      const cropped = parts.cropped ?? 0;
      const flattened = parts.flattened ?? 0;
      const turned = parts.turned ?? 0;
      const lowRes = parts.lowRes ?? 0;
      const notCropped = parts.notCropped ?? [];
      // Rasmga nima qilinganini aytamiz: xodim arxivni ochganda
      // rasm o'zgarganini ko'rib hayron bo'lmasin
      const done = [
        cropped > 0 ? `${cropped} ta rasm hujjatning o'ziga qirqildi` : "",
        flattened > 0 ? `${flattened} tasi tekis holatga keltirildi` : "",
        turned > 0 ? `${turned} tasi to'g'ri holatga burildi` : "",
      ].filter(Boolean);
      out.push(
        "",
        done.length > 0 ? `_${done.join(", ")}._` : "",
      );

      // Qirqilmagan rasm arxivda stol va qo'l bilan qoladi. Buni
      // aytmasak, xodim arxivni konsullikka o'sha holda yuboradi
      if (notCropped.length > 0) {
        out.push(
          `⚠️ ${notCropped.length} ta rasm qirqilmadi (${notCropped.join(", ")}-rasm) — ` +
            "arxivda asl holida. Hujjat kadrda to'liq va tekis ko'rinsa, " +
            "qayta yuborib ko'ring.",
        );
      }

      // Uzoqdan olingan rasm: qirqildi, lekin hujjat juda kichik —
      // bunday rasmdan MRZ ni odam o'qiy olmaydi
      if (lowRes > 0) {
        out.push(
          `⚠️ ${lowRes} ta rasmda hujjat kadrda juda kichik — yaqinroq turib, ` +
            "hujjat kadrni to'ldiradigan qilib oling (arxivdagi rasm past sifatda).",
        );
      }
    }

    return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  },

  /** Sabablar — qisqa, chunki to'plam hisobotida bitta qatorga sig'ishi kerak. */
  reasonUnreadable:
    "MRZ qatorlari topilmadi — ID karta bo'lsa ORQA tomonini oling, " +
    "pasportda esa surat bor sahifani (rasm xira yoki kesilgan bo'lishi ham mumkin)",
  /**
   * ID kartaning OLD tomoni yuborilgan.
   *
   * Alohida sabab, chunki yechimi butunlay boshqacha: rasmni yaxshilash
   * emas, BOSHQA TOMONINI olish kerak. Avval bunday rasmga ham
   * "xira yoki kesilgan" deyilardi va xodim shu tomonni qayta-qayta
   * suratga olib yurardi — MRZ u yerda hech qachon bo'lmaydi.
   */
  reasonIdBack:
    "ID kartaning old tomoni — MRZ kartaning ORQA tomonida, " +
    "o'sha tomonini suratga oling",
  /**
   * Orqa tomoni yuborilgan, lekin MRZ aniq chiqmagan.
   *
   * Bu yerda "teskari qilib oling" deyish XATO bo'lardi — xodim kartani
   * aylantirib yuraveradi. Yechimi rasmni yaxshilash.
   */
  reasonIdUnclear:
    "ID kartaning orqa tomoni ko'rindi, lekin pastdagi 3 qator aniq " +
    "chiqmadi — kartani tekis qo'yib, yorug'da va yaqinroqdan oling",
  reasonNotDocument: "rasmda hujjat ko'rinmadi",
  reasonRefused: "rasmni o'qish rad etildi",
  reasonTechnical: "texnik xato",
  reasonChecks: (fields: string[]) =>
    `tekshiruvdan o'tmadi (${fields.join(", ")}) — saqlanmadi`,

  /**
   * API ishlamadi — to'plam to'xtatildi. Bu rasmning aybi emas, shuning
   * uchun "qayta suratga oling" deyilmaydi: sabab va yechim aytiladi.
   */
  apiStopped: (p: { why: string; done: number; total: number; retryable: boolean }) =>
    [
      "⛔️ *To'xtatildi — rasmning aybi emas.*",
      "",
      `Sabab: ${p.why}`,
      "",
      p.done > 0
        ? `${p.done} ta rasm o'qilib saqlandi, qolgan ${p.total - p.done} tasi o'qilmadi.`
        : `Hech qaysi rasm o'qilmadi (${p.total} ta).`,
      "",
      p.retryable
        ? "Bu vaqtincha muammo — bir-ikki daqiqadan keyin qayta yuboring."
        : "Buni avval tuzatish kerak, qayta yuborish yordam bermaydi.",
      "",
      "Tekshirish: terminalda `npm run tekshir`",
    ].join("\n"),

  warnExpired: (p: Pilgrim | { surname: string; givenNames: string }) =>
    `🔴 ${esc("surname" in p ? p.surname : "")} ${esc(
      "givenNames" in p ? p.givenNames : "",
    )} — pasport muddati tugagan`,

  warnSoon: (
    p: { surname: string; givenNames: string },
    months: number,
  ) =>
    `🟡 ${esc(p.surname)} ${esc(p.givenNames)} — pasportga ${months} oy qoldi (kamida ${config.minPassportMonths} kerak)`,

  // --- Ro'yxat va eksport ---

  emptyList: () =>
    "Hozircha bitta ham hujjat qabul qilinmagan.\n\nPasport rasmini yuboring — o'qib, Excel va arxiv qilib beraman.",

  listHeader: (n: number) => `*O'qilgan pasportlar — ${n} kishi*\n`,

  listTruncated: (shown: number, total: number) =>
    `\n\n_...va yana ${total - shown} kishi._\nTo'liq ro'yxat: /excel`,

  noWarnings: "Hammaning pasporti yetarli muddatga amal qiladi. 👍",

  warningsHeader: (n: number) => `*Pasporti yetmaydiganlar (${n}):*\n`,

  deleted: (docNumber: string) => `\`${docNumber}\` o'chirildi.`,
  notFound: (docNumber: string) => `\`${docNumber}\` topilmadi.`,
  needDocNumber: "Pasport raqamini yozing: `/ochir AB1234567`",

  // --- Tugmalar ---

  /** Tugmalar ustidagi qisqa qator. */
  pickAction: (n: number) =>
    n === 1
      ? "*1 ta hujjat tayyor.* Nima kerak?"
      : `*${n} ta hujjat tayyor.* Nima kerak?`,

  /**
   * `/sinov` — tugmalar ishlayotganini tekshirish.
   *
   * Nega kerak: tugmalar Telegramda chizilishini va bosilgani botga
   * yetib kelishini faqat HAQIQIY Telegramda ko'rish mumkin. Testlar
   * soxta Telegram bilan ishlaydi — ular `reply_markup` to'g'ri
   * shaklda ketayotganini tekshiradi, chizilishini emas.
   */
  sinov: [
    "*Tugmalarni tekshirish*",
    "",
    "Quyida uchta tugma ko'rinishi kerak. Bittasini bosing —",
    "javob kelsa, hammasi ishlayapti.",
    "",
    "_Bu sinov: hech narsa saqlanmaydi, fayl ham yuborilmaydi._",
  ].join("\n"),

  sinovOk: (label: string) =>
    [
      `✅ *Tugma ishladi:* ${esc(label)}`,
      "",
      "Demak uchala narsa joyida:",
      "• tugmalar Telegramda chizilyapti",
      "• bosilgani botga yetib kelyapti",
      "• bot javob qaytaryapti",
      "",
      "Endi pasport rasmini yuborib ko'rsangiz bo'ladi.",
    ].join("\n"),

  /** Pastdagi doimiy tugmalar paydo bo'lganda, bir qatorlik izoh. */
  keyboardHint:
    "_Pastdagi tugmalar ham shu to'plam uchun. Keyingi rasmlarni " +
    "yuborsangiz, ular yangi to'plam bo'yicha ishlaydi._",

  buttons: {
    zip: "🗂 Zip qilib olish",
    excel: "📊 Excel qilib olish",
    kinds: "🔍 Pasport farqlash",
    restart: "🔄 Ha, qayta ishga tushir",
  },

  // --- Qayta ishga tushirish ---

  /**
   * `/restart` — avval HOLAT ko'rsatiladi.
   *
   * "Bot ishlamayapti" ko'pincha boshqa narsa bo'ladi: kalit tugagan,
   * internet uzilgan, rasm noto'g'ri tomonidan olingan. Shuning uchun
   * qayta ishga tushirishdan oldin nima ishlayotgani aytiladi — ko'pincha
   * shundan keyin qayta ishga tushirish kerak ham bo'lmaydi.
   */
  restartAsk: (s: {
    documents: number;
    provider: string;
    model: string;
    uptime: number;
    crop: boolean;
  }) =>
    [
      "*Bot holati*",
      "",
      "✅ Bot ishlayapti va sizni eshitayapti",
      `⏱ To'xtamasdan: ${duration(s.uptime)}`,
      `🤖 O'qish: ${esc(s.provider)} / \`${esc(s.model)}\``,
      `🗂 Bazada: ${s.documents} ta hujjat`,
      `✂️ Rasmni qirqish: ${s.crop ? "yoqilgan" : "o'chirilgan"}`,
      "",
      "Agar shunday bo'lsa-yu, baribir noto'g'ri ishlayotgan bo'lsa —",
      "pastdagi tugma bilan qayta ishga tushiring. Bu bir necha soniya",
      "oladi, saqlangan ma'lumotga va sozlamalarga tegmaydi.",
      "",
      "_Bot umuman javob bermasa, bu buyruq ham yetib bormaydi:_",
      "_unda kompyuterdagi `2-boshlash.bat` oynasini qaytadan oching._",
    ].join("\n"),

  /** Tugma bosilgandan keyin. */
  restartNow: (auto: boolean) =>
    [
      "🔄 *Qayta ishga tushirilmoqda...*",
      "",
      auto
        ? "Bir necha soniyadan keyin bot o'zi qaytadi. Shundan keyin"
        : "Bot to'xtatildi. Kompyuterda `2-boshlash.bat` ni oching, keyin",
      "`/start` yozib tekshirib ko'ring.",
    ].join("\n"),

  /** Tugma eskirgan: bot qayta ishga tushgan yoki to'plam o'chirilgan. */
  batchExpired: [
    "Bu to'plam endi mavjud emas.",
    "",
    "Hammasini olish uchun: /excel yoki /zip",
  ].join("\n"),

  /**
   * Hujjatlarni turi bo'yicha ajratib ko'rsatadi.
   *
   * Egasining so'rovi: "passport farqlash — id / zagran (qizil) /
   * o'zbek / tojik / qirg'iz / qozoq". Tur MRZ'dan determinlashgan
   * holda olingan, taxmin yo'q.
   */
  docKinds: (
    rows: { doc_label: string; surname: string; given_names: string }[],
  ) => {
    const groups = new Map<string, string[]>();
    for (const r of rows) {
      const label = r.doc_label || "Noma'lum hujjat";
      const list = groups.get(label) ?? [];
      list.push(`${esc(r.surname)} ${esc(r.given_names)}`);
      groups.set(label, list);
    }

    // Ko'p uchragani yuqorida — xodim asosiysini darhol ko'radi
    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

    const out: string[] = [`*Hujjat turlari* — ${rows.length} ta hujjat`, ""];
    for (const [label, names] of sorted) {
      out.push(`*${esc(label)}* — ${names.length} ta`);
      for (const name of names) out.push(`  • ${name}`);
      out.push("");
    }
    return out.join("\n").trimEnd();
  },

  /**
   * Ma'lumot saqlandi, lekin fayl ketmadi (Telegram xatosi).
   * Xodim ishini yo'qotmasligi uchun qo'lda olish yo'li aytiladi.
   */
  filesFailed: [
    "⚠️ Faylni yuborib bo'lmadi.",
    "",
    "Ma'lumot joyida — tugmani qayta bosib ko'ring,",
    "yoki /excel va /zip bilan hammasini oling.",
  ].join("\n"),

  purged: (n: number) =>
    n === 0
      ? `Muddati o'tgan yozuv yo'q (saqlash muddati ${config.retentionDays} kun).`
      : `${n} ta yozuv o'chirildi (${config.retentionDays} kundan eski).`,
};
