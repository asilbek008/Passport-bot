/**
 * Hujjat turini va davlatini aniqlash.
 *
 * Hammasi MRZ'dan DETERMINLASHGAN holda olinadi — model taxmin qilmaydi:
 *   • hujjat kodi (`P…` = pasport, `I…`/`AC` = ID karta) — ICAO 9303;
 *   • davlat kodi (UZB, TJK, KGZ, KAZ…) — ISO 3166-1 alpha-3.
 *
 * MUHIM: muqovaning RANGI MRZ'da yo'q va uni rasmdan ishonchli aniqlab
 * bo'lmaydi. Shuning uchun "qizil pasport" deb belgilanmaydi — buning
 * o'rniga aniq bilinadigan narsa yoziladi: pasportmi yoki ID kartami,
 * va qaysi davlatning hujjati. Viza uchun aynan shu ikkisi kerak.
 */

import type { Mrz } from "./mrz.ts";

/** Hujjatning turi. */
export type DocKind =
  /** Chet elga chiqish pasporti (xalqaro sayohat hujjati) */
  | "pasport"
  /** Shaxsiy guvohnoma / ID karta */
  | "id"
  /** Viza yorlig'i */
  | "viza"
  /** Tanilmagan */
  | "boshqa";

/** Pasportning kichik turi — MRZ dagi hujjat kodining 2-harfidan. */
export type DocSubtype = "oddiy" | "diplomatik" | "xizmat" | "boshqa";

export type DocumentType = {
  kind: DocKind;
  subtype: DocSubtype;
  /** Hujjatni bergan davlat kodi, masalan "UZB" */
  countryCode: string;
  /** Davlat nomi o'zbekcha, masalan "O'zbekiston" */
  country: string;
  /** Sifat shaklida, masalan "O'zbek" */
  countryAdjective: string;
  /** To'liq nom: "O'zbek pasporti" */
  label: string;
  /**
   * Fayl nomidagi so'z: `qizil`, `id`, `tojik_pasport`.
   *
   * O'zbek hujjatlari uchun egasining so'zlari ishlatiladi: chet elga
   * chiqish pasporti kundalik tilda "qizil pasport" deyiladi. Boshqa
   * davlatlarda muqova rangini TAXMIN QILMAYMIZ (rang MRZ'da yo'q),
   * shuning uchun davlat nomi + hujjat turi yoziladi.
   */
  fileWord: string;
};

const KIND_LABEL: Record<DocKind, string> = {
  pasport: "pasporti",
  id: "ID kartasi",
  viza: "vizasi",
  boshqa: "hujjati",
};

const KIND_SLUG: Record<DocKind, string> = {
  pasport: "pasport",
  id: "id",
  viza: "viza",
  boshqa: "hujjat",
};

/**
 * Fayl nomidagi so'zni yasaydi.
 *
 * O'zbekistonniki — qisqa: `qizil` (chet elga chiqish pasporti) yoki `id`.
 * Egasining talabi shunday: `asilbek_boyqobilov_qizil.jpg`.
 *
 * Boshqa davlatniki — davlat nomi bilan: `tojik_pasport`, `qirgiz_id`.
 * Shunda tojik va o'zbek pasportlari bir xil nomli odamda ham
 * aralashmaydi, muqova rangi esa taxmin qilinmaydi.
 */
function fileWordFor(kind: DocKind, code: string, adjective: string): string {
  const uzbek = code === "UZB";
  if (uzbek && kind === "pasport") return "qizil";
  if (uzbek) return KIND_SLUG[kind];

  const country = toAscii(adjective).toLowerCase();
  return country ? `${country}_${KIND_SLUG[kind]}` : KIND_SLUG[kind];
}

/**
 * Davlatlar: Markaziy Osiyo va qo'shnilar. Ro'yxatda yo'q bo'lsa kodning
 * o'zi ishlatiladi — o'ylab topilgan nom yozilmaydi.
 */
const COUNTRIES: Record<string, { name: string; adjective: string }> = {
  UZB: { name: "O'zbekiston", adjective: "O'zbek" },
  TJK: { name: "Tojikiston", adjective: "Tojik" },
  KGZ: { name: "Qirg'iziston", adjective: "Qirg'iz" },
  KAZ: { name: "Qozog'iston", adjective: "Qozoq" },
  TKM: { name: "Turkmaniston", adjective: "Turkman" },
  RUS: { name: "Rossiya", adjective: "Rus" },
  AZE: { name: "Ozarbayjon", adjective: "Ozarbayjon" },
  AFG: { name: "Afg'oniston", adjective: "Afg'on" },
  TUR: { name: "Turkiya", adjective: "Turk" },
  SAU: { name: "Saudiya Arabistoni", adjective: "Saudiya" },
  ARE: { name: "BAA", adjective: "BAA" },
  UKR: { name: "Ukraina", adjective: "Ukrain" },
  BLR: { name: "Belarus", adjective: "Belarus" },
  GEO: { name: "Gruziya", adjective: "Gruzin" },
  ARM: { name: "Armaniston", adjective: "Arman" },
  PAK: { name: "Pokiston", adjective: "Pokiston" },
  IND: { name: "Hindiston", adjective: "Hind" },
  CHN: { name: "Xitoy", adjective: "Xitoy" },
  IRN: { name: "Iran", adjective: "Iran" },
};

/**
 * Hujjat kodidan turini aniqlaydi (ICAO 9303 § 4.2.2.2).
 * TD1 formati har doim ID-karta o'lchamidagi hujjat.
 */
export function docKind(documentCode: string, format: Mrz["format"]): DocKind {
  const code = documentCode.toUpperCase().replace(/[^A-Z]/g, "");
  const first = code[0] ?? "";

  if (first === "P") return "pasport";
  if (first === "V") return "viza";
  // I, A, C — guvohnoma/ID oilasi (ID, IP, IR, AC…)
  if (first === "I" || first === "A" || first === "C") return "id";

  // Kod tanilmasa formatga qaraymiz: TD1 — ID karta o'lchami
  if (format === "TD1") return "id";
  if (format === "TD3") return "pasport";
  return "boshqa";
}

/** Hujjat kodining 2-harfi: diplomatik yoki xizmat pasportini ko'rsatadi. */
export function docSubtype(documentCode: string): DocSubtype {
  const code = documentCode.toUpperCase().replace(/[^A-Z]/g, "");
  if (code[0] !== "P") return "oddiy";
  switch (code[1]) {
    case "D":
      return "diplomatik";
    case "S":
      return "xizmat";
    case undefined:
      return "oddiy";
    default:
      return "oddiy";
  }
}

/** Davlat kodini o'zbekcha nomga aylantiradi. */
export function countryOf(code: string): { name: string; adjective: string } {
  const key = code.toUpperCase().replace(/[^A-Z]/g, "");
  return COUNTRIES[key] ?? { name: key || "noma'lum", adjective: key || "noma'lum" };
}

/**
 * MRZ'dan hujjat turini to'liq aniqlaydi.
 *
 * Davlat uchun `nationality` (fuqarolik) olinadi, `issuingState` emas:
 * viza arizasida ahamiyatlisi — odam qaysi davlat fuqarosi. Ikkisi deyarli
 * har doim bir xil; farq qilsa (masalan ko'chib yurganlar) fuqarolik
 * to'g'ri javob bo'ladi.
 */
export function documentType(mrz: Mrz): DocumentType {
  const kind = docKind(mrz.documentCode, mrz.format);
  const subtype = docSubtype(mrz.documentCode);
  const code = (mrz.nationality || mrz.issuingState).toUpperCase();
  const { name, adjective } = countryOf(code);

  const extra =
    subtype === "diplomatik" ? " (diplomatik)" : subtype === "xizmat" ? " (xizmat)" : "";

  return {
    kind,
    subtype,
    countryCode: code.replace(/[^A-Z]/g, ""),
    country: name,
    countryAdjective: adjective,
    label: `${adjective} ${KIND_LABEL[kind]}${extra}`,
    fileWord: fileWordFor(kind, code.replace(/[^A-Z]/g, ""), adjective),
  };
}

// --- Fayl nomi ---

/** O'zbek lotin harflarini fayl nomi uchun xavfsiz ASCII'ga o'giradi. */
function toAscii(text: string): string {
  return text
    .replace(/[Oo][‘’'`‘’]/g, (m) => (m[0] === "O" ? "O" : "o"))
    .replace(/[Gg][‘’'`‘’]/g, (m) => (m[0] === "G" ? "G" : "g"))
    .replace(/[‘’'`‘’]/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Windowsda ishlatib bo'lmaydigan nomlar. */
const RESERVED = new Set([
  "CON", "PRN", "AUX", "NUL",
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
]);

/**
 * Rasm fayli uchun nom: `asilbek_boyqobilov_qizil`.
 *
 * Tartib — ISM, keyin FAMILIYA (egasining talabi). MRZ'da aksincha
 * yozilgan bo'ladi, shuning uchun bu yerda almashtiriladi.
 * Hammasi kichik harfda: Windows fayl nomlarida registrni farqlamaydi,
 * zip esa farqlaydi — kichik harf ikkisida ham bir xil ishlaydi.
 *
 * Faqat ASCII harf, raqam va `_` qoldiriladi, shunda Windows, macOS va
 * har qanday zip dasturi ocha oladi. Kengaytma qo'shilmaydi — chaqiruvchi
 * qo'shadi.
 */
export function photoBaseName(
  mrz: Pick<Mrz, "surname" | "givenNames"> & { type: Pick<DocumentType, "fileWord"> },
): string {
  // Bo'sh qismlar tashlanadi — aks holda nom oxirida ortiqcha "_" qolib,
  // Windowsning band nomlari tekshiruvi ("CON_" ≠ "CON") ishlamay qolardi
  let name = [
    toAscii(mrz.givenNames),
    toAscii(mrz.surname) || "nomaalum",
    mrz.type.fileWord,
  ]
    .filter(Boolean)
    .join("_")
    .toLowerCase();

  // Juda uzun nom ba'zi tizimlarda muammo beradi
  if (name.length > 120) name = name.slice(0, 120).replace(/_+$/, "");
  if (RESERVED.has(name.toUpperCase())) name = `_${name}`;
  return name;
}
