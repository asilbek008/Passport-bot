/**
 * Botning barcha matnlari. O'zbekcha, lotin yozuvida.
 *
 * Bot OCHIQ EMAS: u tashkilotning ichki vositasi, faqat `OPERATORS`
 * ro'yxatidagi xodimlar bilan gaplashadi. Shuning uchun matnlar ham
 * mijozga emas, xodimga qaratilgan.
 */

import { config } from "./config.ts";
import type { Pilgrim } from "./store.ts";
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

  start: (group: string) =>
    [
      "Assalomu alaykum. Bu bot pasport rasmlaridan viza uchun kerakli",
      "ma'lumotni o'qib, Excel jadval qilib beradi.",
      "",
      "*Qanday ishlatiladi:*",
      "1. `/guruh Umra mart` — qaysi safar guruhi bilan ishlayotganingizni belgilaysiz",
      "2. Pasport rasmlarini yuborasiz — bittalab yoki bir necha o'nlab, albom qilib",
      "3. `/excel` — tayyor jadvalni olasiz",
      "",
      group
        ? `Joriy guruh: *${esc(group)}*`
        : "_Guruh belgilanmagan — rasmlar guruhsiz saqlanadi._",
      "",
      "Buyruqlar ro'yxati: /yordam",
      "",
      "*Eslatma:* bu mijozlarning shaxsiy hujjatlari. Rasmlar saqlanmaydi,",
      "lekin o'qilgan ma'lumot bazada turadi — faqat ish uchun ishlatilsin.",
    ].join("\n"),

  help: [
    "*Buyruqlar:*",
    "",
    "`/guruh <nom>` — joriy safar guruhini belgilash",
    "`/guruh` — joriy guruhni ko'rish",
    "`/guruhlar` — hamma guruh va kishilar soni",
    "`/royxat` — joriy guruhdagi kishilar",
    "`/excel` — joriy guruhni Excel qilib olish",
    "`/excel hammasi` — barcha guruhlarni bitta faylda",
    "`/zip` — rasmlar + Excel bitta arxivda",
    "`/zip hammasi` — barcha guruhlar arxivda",
    "",
    "*Viza:*",
    "`/viza <pasport> <turi>` — viza belgilash (yoki viza rasmini yuboring)",
    "`/vizalar` — kimda qanday viza bor",
    "`/vizasiz` — vizasi yo'qlar",
    "`/vizani_ochir <pasport>` — viza ma'lumotini olib tashlash",
    "`/ogohlik` — pasporti tez tugaydiganlar",
    "`/ochir <pasport raqami>` — bitta yozuvni o'chirish",
    "`/guruhni_ochir <nom>` — butun guruhni o'chirish",
    "`/tozalash` — saqlash muddati o'tgan yozuvlarni o'chirish",
    "",
    "*Xodimlar:*",
    "`/kod` — yangi xodim uchun bir martalik kod",
    "`/xodimlar` — ruxsat berilganlar ro'yxati",
    "`/xodim_ochir <raqam>` — ruxsatni olib tashlash",
    "",
    "Pasport rasmini yuborsangiz — o'qiladi va joriy guruhga qo'shiladi.",
  ].join("\n"),

  // --- Guruh ---

  groupSet: (label: string) =>
    `Joriy guruh: *${esc(label)}*\n\nEndi yuborilgan rasmlar shu guruhga qo'shiladi.`,

  groupCleared: "Guruh olib tashlandi — rasmlar guruhsiz saqlanadi.",

  groupCurrent: (label: string, count: number) =>
    label
      ? `Joriy guruh: *${esc(label)}* (${count} kishi)\n\nO'zgartirish: \`/guruh <yangi nom>\``
      : "Guruh belgilanmagan.\n\nBelgilash: `/guruh Umra mart`",

  groupList: (groups: { label: string; count: number }[]) =>
    groups.length === 0
      ? "Hozircha bitta ham yozuv yo'q."
      : "*Guruhlar:*\n\n" +
        groups
          .map((g) => `• ${esc(g.label || "(guruhsiz)")} — ${g.count} kishi`)
          .join("\n"),

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
      "• guruhlarga bo'lib oling — `/zip` joriy guruhni beradi",
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
    group: string;
    total: number;
  }) => {
    const out: string[] = [];
    const visaOk = parts.visaOk ?? [];
    const visaProblems = parts.visaProblems ?? [];
    const read = parts.ok.length + visaOk.length;

    out.push(
      `*Natija:* ${read} / ${parts.total} o'qildi` +
        (parts.group ? ` · guruh: *${esc(parts.group)}*` : ""),
    );

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

    out.push("", "Jadvalni olish: /excel");
    return out.join("\n");
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

  emptyList: (group: string) =>
    group
      ? `*${esc(group)}* guruhida hozircha yozuv yo'q.`
      : "Hozircha bitta ham hujjat qabul qilinmagan.",

  listHeader: (group: string, n: number) =>
    `*${esc(group || "Guruhsiz")}* — ${n} kishi\n`,

  listTruncated: (shown: number, total: number) =>
    `\n_...va yana ${total - shown} kishi. To'liq ro'yxat Excelda._`,

  noWarnings: "Hammaning pasporti yetarli muddatga amal qiladi. 👍",

  warningsHeader: (n: number) => `*Pasporti yetmaydiganlar (${n}):*\n`,

  deleted: (docNumber: string) => `\`${docNumber}\` o'chirildi.`,
  notFound: (docNumber: string) => `\`${docNumber}\` topilmadi.`,
  needDocNumber: "Pasport raqamini yozing: `/ochir AB1234567`",
  needGroupName: "Guruh nomini yozing: `/guruhni_ochir Umra mart`",
  groupDeleted: (label: string, n: number) =>
    `*${esc(label)}* guruhi o'chirildi (${n} yozuv).`,

  purged: (n: number) =>
    n === 0
      ? `Muddati o'tgan yozuv yo'q (saqlash muddati ${config.retentionDays} kun).`
      : `${n} ta yozuv o'chirildi (${config.retentionDays} kundan eski).`,
};
