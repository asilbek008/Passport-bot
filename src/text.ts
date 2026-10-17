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
    lines.push("", "Qo'shish: /kod — yangi xodimga beriladigan kod");
    lines.push("O'chirish: `/xodim_ochir <raqam>`");
    return lines.join("\n");
  },

  operatorRemoved: (chatId: number) => `\`${chatId}\` ruxsatdan chiqarildi.`,
  operatorNotFound: (chatId: number) =>
    `\`${chatId}\` bazada yo'q. _(.env dagi xodimni faqat .env dan o'chirasiz.)_`,
  cannotRemoveSelf: "O'zingizni ruxsatdan chiqara olmaysiz.",
  needChatId: "Chat raqamini yozing: `/xodim_ochir 123456789`",

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
      saved > 0 ? `_Bazada ${saved} ta pasport bor._\n` : "",
      "Buyruqlar: /yordam",
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
    "*Tozalash:*",
    "`/ochir <pasport raqami>` — bitta yozuvni va rasmini o'chirish",
    "`/tozalash` — saqlash muddati o'tgan yozuvlarni o'chirish",
    "",
    "*Xodimlar:*",
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

  failLine: (index: number, why: string) => `❌ ${index}-rasm — ${why}`,

  // --- To'plam hisoboti ---

  batchReport: (parts: {
    ok: string[];
    failed: string[];
    warnings: string[];
    visaOk?: string[];
    visaProblems?: string[];
    total: number;
    /** Hisobotdan keyin Excel va arxiv yuboriladimi */
    files?: boolean;
    /** Nechta rasm hujjatning o'ziga qirqildi */
    cropped?: number;
    /** Nechta rasm to'g'ri holatga burildi */
    turned?: number;
    /** Nechta rasm diskka saqlanmadi */
    photoProblems?: number;
  }) => {
    const out: string[] = [];
    const visaOk = parts.visaOk ?? [];
    const visaProblems = parts.visaProblems ?? [];
    const read = parts.ok.length + visaOk.length;

    out.push(`*Natija:* ${read} / ${parts.total} o'qildi`);

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
      const turned = parts.turned ?? 0;
      // Rasmga nima qilinganini aytamiz: xodim arxivni ochganda
      // rasm o'zgarganini ko'rib hayron bo'lmasin
      const done = [
        cropped > 0 ? `${cropped} ta rasm hujjatning o'ziga qirqildi` : "",
        turned > 0 ? `${turned} tasi to'g'ri holatga burildi` : "",
      ].filter(Boolean);
      out.push(
        "",
        done.length > 0 ? `_${done.join(", ")}._` : "",
      );
    }

    return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  },

  /** Sabablar — qisqa, chunki to'plam hisobotida bitta qatorga sig'ishi kerak. */
  reasonUnreadable: "MRZ qatorlari o'qilmadi (xira yoki kesilgan)",
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

  buttons: {
    zip: "🗂 Zip qilib olish",
    excel: "📊 Excel qilib olish",
    kinds: "🔍 Pasport farqlash",
  },

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
