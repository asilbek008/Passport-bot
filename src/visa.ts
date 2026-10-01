/**
 * Viza holatini kuzatish.
 *
 * NEGA MOFA SAYTI AVTOMATLASHTIRILMAGAN:
 * visa.mofa.gov.sa dagi so'rov formasida CAPTCHA bor va uning maqsadi
 * rasmiy tavsifda aniq yozilgan — avtomatik murojaatlarning oldini olish.
 * Ochiq API ham yo'q. Shuning uchun bot u saytga o'zi kirmaydi: bu
 * himoyani chetlab o'tish bo'lardi, ustiga har o'zgarishda buzilib turardi.
 *
 * Buning o'rniga ikki yo'l bor va ikkisi ham ishonchli:
 *
 *   1. VIZA YORLIG'INI O'QISH. Pasportga yopishtirilgan vizada ham MRZ
 *      bor (ICAO 9303 7-qism, MRV-A 2x44 / MRV-B 2x36) va unda tekshiruv
 *      raqamlari bor. Ya'ni viza raqami, egasining ismi, fuqaroligi va
 *      amal muddati RASMDAN ISHONCHLI o'qiladi — xuddi pasport kabi.
 *
 *   2. QO'LDA KIRITISH. Xodim MOFA saytida o'zi tekshiradi (odatdagi ishi)
 *      va natijani botga bir buyruq bilan yozadi. Bot esa 50 kishilik
 *      ro'yxatni kuzatadi: kimda viza bor, kimda yo'q, qaysi turi.
 *
 * Viza TURI (single/multiple/umra) MRZ'da standart maydon emas — u
 * vizaning ko'rinadigan qismida yozilgan. Shuning uchun u "tasdiqlanmagan"
 * deb belgilanadi: tekshiruv raqami bilan himoyalangan ma'lumot bilan
 * aralashtirilmaydi.
 */

/** Viza turi. */
export type VisaType =
  | "umra"
  | "hajj"
  | "single"
  | "multiple"
  | "tranzit"
  | "ishchi"
  | "boshqa";

/** Ma'lumot qaydan olingani — ishonch darajasi shunga bog'liq. */
export type VisaSource =
  /** Viza yorlig'ining MRZ'idan, tekshiruv raqamlari bilan tasdiqlangan */
  | "mrz"
  /** Xodim qo'lda kiritgan (masalan MOFA saytida ko'rib) */
  | "qolda";

export const VISA_LABELS: Record<VisaType, string> = {
  umra: "Umra vizasi",
  hajj: "Haj vizasi",
  single: "Bir martalik (single)",
  multiple: "Ko'p martalik (multiple)",
  tranzit: "Tranzit",
  ishchi: "Ishchi vizasi",
  boshqa: "Boshqa",
};

/** Qisqa belgi — hisobotlarda joy tejash uchun. */
export const VISA_ICON: Record<VisaType, string> = {
  umra: "🕋",
  hajj: "🕋",
  single: "1️⃣",
  multiple: "🔁",
  tranzit: "✈️",
  ishchi: "🛠",
  boshqa: "📄",
};

/**
 * Xodim yozgan matndan viza turini aniqlaydi.
 * O'zbek, ingliz va ruscha atamalar qabul qilinadi; tanilmasa `null` —
 * taxmin qilinmaydi, xodimdan qayta so'raladi.
 */
export function parseVisaType(text: string): VisaType | null {
  const value = text.trim().toLowerCase().replace(/['`‘’]/g, "");
  if (!value) return null;

  /**
   * Qisqa va noaniq so'zlar FAQAT to'liq mos kelsa qabul qilinadi.
   * Aks holda viza raqami ("1234567890") "1" ga mos kelib, "single"
   * deb o'qilib ketardi.
   */
  const exact: Record<string, VisaType> = {
    "1": "single",
    bir: "single",
    haj: "hajj",
    kop: "multiple",
    multi: "multiple",
    mult: "multiple",
    sing: "single",
  };
  if (value in exact) return exact[value];

  // Uzun va o'ziga xos so'zlar boshidan mos kelishi yetarli
  // ("SINGLE ENTRY", "MULTIPLE ENTRY" kabi yozuvlar uchun)
  if (/^(umrah?|умра|омра)/.test(value)) return "umra";
  if (/^(hajj|хадж|хаж)/.test(value)) return "hajj";
  if (/^(single|одно)/.test(value)) return "single";
  if (/^(multiple|много)/.test(value)) return "multiple";
  if (/^(tranzit|transit|транзит)/.test(value)) return "tranzit";
  if (/^(ishchi|work|рабоч)/.test(value)) return "ishchi";
  if (/^(boshqa|other|друго)/.test(value)) return "boshqa";
  return null;
}

/** Barcha turlarning nomlari — xodimga yordam ko'rsatish uchun. */
export function visaTypeHelp(): string {
  return (Object.keys(VISA_LABELS) as VisaType[])
    .map((key) => `\`${key}\``)
    .join(", ");
}

/**
 * Viza amal muddati tugaganmi yoki tez tugaydimi.
 * Safar sanasidan oldin tugab qolgan viza — eng og'riqli xato.
 */
export function visaState(
  expiry: string | null,
  today = new Date(),
): "ok" | "soon" | "expired" | "unknown" {
  if (!expiry) return "unknown";
  const date = new Date(`${expiry}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "unknown";

  const days = (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (days < 0) return "expired";
  if (days < 30) return "soon";
  return "ok";
}

/**
 * Viza MRZ'i (MRV-A / MRV-B) pasport MRZ'idan farq qiladi:
 * ikkinchi qatorda PASPORT raqami emas, VIZA raqami turadi, va pasport
 * raqami umuman yo'q. Shuning uchun vizani odamga bog'lash ism, tug'ilgan
 * sana va fuqarolik bo'yicha qilinadi — bu uchligi yetarli aniq.
 */
export type VisaMatch = {
  surname: string;
  givenNames: string;
  birthDate: string;
  nationality: string;
};

/** Vizani yozuvga bog'lash uchun kalit. */
export function matchKey(p: VisaMatch): string {
  return [
    p.surname.trim().toUpperCase(),
    p.givenNames.trim().toUpperCase(),
    p.birthDate,
  ].join("|");
}
