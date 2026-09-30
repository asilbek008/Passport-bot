/**
 * MRZ (Machine Readable Zone) o'qish va tekshirish.
 *
 * Pasport va ID kartaning pastidagi mashina o'qiy oladigan zona ICAO 9303
 * standarti bo'yicha yozilgan va ichida TEKSHIRUV RAQAMLARI bor. Shuning
 * uchun bu modul ham o'qiydi, ham o'qilgan narsa to'g'ri ekanini tekshiradi:
 * OCR bitta harfni xato o'qisa, tekshiruv raqami mos kelmaydi va biz buni
 * bilamiz. Hujjat ma'lumotini taxmin qilish mumkin emas — shuning uchun bu
 * yerda hech qanday "tuzatish" yo'q, faqat "to'g'ri" yoki "xato".
 *
 * Bu fayl toza (pure): tarmoq, fayl, baza yo'q — shuning uchun test yoziladi.
 */

export type MrzFormat = "TD1" | "TD2" | "TD3";

export type MrzChecks = {
  documentNumber: boolean;
  birthDate: boolean;
  expiryDate: boolean;
  /** TD2/TD3 da shaxsiy raqam maydoni; TD1 da yo'q -> null */
  personalNumber: boolean | null;
  composite: boolean;
};

export type Mrz = {
  format: MrzFormat;
  /** 'P' — pasport, 'ID'/'I' — shaxsiy guvohnoma, 'AC' va boshqalar */
  documentCode: string;
  issuingState: string;
  surname: string;
  givenNames: string;
  documentNumber: string;
  nationality: string;
  /** ISO: yyyy-mm-dd */
  birthDate: string;
  sex: "M" | "F" | "X";
  /** ISO: yyyy-mm-dd */
  expiryDate: string;
  /** O'zbekistonda bu yerda JSHSHIR (PINFL) turadi */
  personalNumber: string;
  checks: MrzChecks;
  /** Hamma tekshiruv raqami mos keldimi */
  valid: boolean;
  lines: string[];
};

export class MrzError extends Error {}

const WEIGHTS = [7, 3, 1];

/** ICAO 9303 belgisining raqamli qiymati. Noto'g'ri belgi -> -1. */
function charValue(c: string): number {
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55; // A = 10 ... Z = 35
  if (c === "<") return 0;
  return -1;
}

/**
 * Tekshiruv raqamini hisoblaydi: har belgi 7,3,1 og'irliklariga ko'paytirilib
 * qo'shiladi, yig'indining 10 ga bo'lgandagi qoldig'i olinadi.
 * Noto'g'ri belgi uchrasa null qaytadi (ya'ni tekshirib bo'lmaydi).
 */
export function checkDigit(input: string): string | null {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const v = charValue(input[i]);
    if (v < 0) return null;
    sum += v * WEIGHTS[i % 3];
  }
  return String(sum % 10);
}

function verify(field: string, digit: string): boolean {
  const expected = checkDigit(field);
  return expected !== null && expected === digit;
}

/**
 * MRZ ismi maydoni: SURNAME<<GIVEN<NAMES<<<<<
 * '<<' familiya va ismni ajratadi, bitta '<' — bo'sh joy.
 */
export function parseNames(field: string): { surname: string; givenNames: string } {
  const clean = (s: string) => s.replace(/</g, " ").replace(/\s+/g, " ").trim();
  const sep = field.indexOf("<<");
  if (sep === -1) return { surname: clean(field), givenNames: "" };
  return {
    surname: clean(field.slice(0, sep)),
    givenNames: clean(field.slice(sep + 2)),
  };
}

/**
 * YYMMDD -> ISO sana. MRZ da asr ko'rsatilmaydi, shuning uchun:
 *  - tug'ilgan sana kelajakda bo'lolmaydi -> 20yy bo'lmasa 19yy;
 *  - amal muddati hozirgi yildan ±30 yil oralig'ida bo'ladi.
 * Noto'g'ri sana -> null (taxmin qilinmaydi).
 */
export function parseDate(
  yymmdd: string,
  kind: "birth" | "expiry",
  today = new Date(),
): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const thisYear = today.getUTCFullYear();
  let year: number;
  if (kind === "birth") {
    year = 2000 + yy <= thisYear ? 2000 + yy : 1900 + yy;
  } else {
    const candidate = 2000 + yy;
    year = candidate >= thisYear - 30 && candidate <= thisYear + 30 ? candidate : 1900 + yy;
  }

  // Kun oyga to'g'ri keladimi (31-fevral bo'lmasin)
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) {
    return null;
  }
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function parseSex(c: string): "M" | "F" | "X" {
  if (c === "M") return "M";
  if (c === "F") return "F";
  return "X"; // '<' yoki noaniq
}

/** Hujjat raqamidan to'ldiruvchi '<' larni olib tashlaydi. */
const trimFiller = (s: string) => s.replace(/</g, "").trim();

/**
 * Matndan MRZ qatorlarini ajratib oladi: faqat MRZ belgilaridan tashkil
 * topgan va uzunligi 30/36/44 ga teng qatorlar qoldiriladi.
 */
export function extractLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.toUpperCase().replace(/[^A-Z0-9<]/g, ""))
    .filter((l) => l.length === 30 || l.length === 36 || l.length === 44);
}

/** TD3 — biometrik pasport (2 × 44). Qizil (eski) pasportda ham shu format. */
function parseTd3(lines: string[], today: Date): Mrz {
  const [l1, l2] = lines;
  const names = parseNames(l1.slice(5, 44));

  const docNumRaw = l2.slice(0, 9);
  const docNumCheck = l2[9];
  const birthRaw = l2.slice(13, 19);
  const birthCheck = l2[19];
  const expiryRaw = l2.slice(21, 27);
  const expiryCheck = l2[27];
  const personalRaw = l2.slice(28, 42);
  const personalCheck = l2[42];
  const compositeCheck = l2[43];

  const birthDate = parseDate(birthRaw, "birth", today);
  const expiryDate = parseDate(expiryRaw, "expiry", today);

  const composite =
    l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);

  return {
    format: "TD3",
    documentCode: trimFiller(l1.slice(0, 2)),
    issuingState: trimFiller(l1.slice(2, 5)),
    surname: names.surname,
    givenNames: names.givenNames,
    documentNumber: trimFiller(docNumRaw),
    nationality: trimFiller(l2.slice(10, 13)),
    birthDate: birthDate ?? "",
    sex: parseSex(l2[20]),
    expiryDate: expiryDate ?? "",
    personalNumber: trimFiller(personalRaw),
    checks: {
      documentNumber: verify(docNumRaw, docNumCheck),
      birthDate: verify(birthRaw, birthCheck) && birthDate !== null,
      expiryDate: verify(expiryRaw, expiryCheck) && expiryDate !== null,
      // Shaxsiy raqam bo'sh bo'lsa tekshiruv raqami '<' yoki '0' bo'ladi
      personalNumber:
        personalRaw === "<".repeat(14)
          ? null
          : verify(personalRaw, personalCheck),
      composite: verify(composite, compositeCheck),
    },
    valid: false, // pastda hisoblanadi
    lines,
  };
}

/** TD2 — kamroq uchraydigan format (2 × 36). */
function parseTd2(lines: string[], today: Date): Mrz {
  const [l1, l2] = lines;
  const names = parseNames(l1.slice(5, 36));

  const docNumRaw = l2.slice(0, 9);
  const birthRaw = l2.slice(13, 19);
  const expiryRaw = l2.slice(21, 27);
  const optionalRaw = l2.slice(28, 35);

  const birthDate = parseDate(birthRaw, "birth", today);
  const expiryDate = parseDate(expiryRaw, "expiry", today);
  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 35);

  return {
    format: "TD2",
    documentCode: trimFiller(l1.slice(0, 2)),
    issuingState: trimFiller(l1.slice(2, 5)),
    surname: names.surname,
    givenNames: names.givenNames,
    documentNumber: trimFiller(docNumRaw),
    nationality: trimFiller(l2.slice(10, 13)),
    birthDate: birthDate ?? "",
    sex: parseSex(l2[20]),
    expiryDate: expiryDate ?? "",
    personalNumber: trimFiller(optionalRaw),
    checks: {
      documentNumber: verify(docNumRaw, l2[9]),
      birthDate: verify(birthRaw, l2[19]) && birthDate !== null,
      expiryDate: verify(expiryRaw, l2[27]) && expiryDate !== null,
      personalNumber: null,
      composite: verify(composite, l2[35]),
    },
    valid: false,
    lines,
  };
}

/** TD1 — ID karta (3 × 30). O'zbekistonning ID kartasi shu format. */
function parseTd1(lines: string[], today: Date): Mrz {
  const [l1, l2, l3] = lines;
  const names = parseNames(l3);

  const docNumRaw = l1.slice(5, 14);
  const optional1 = l1.slice(15, 30);
  const birthRaw = l2.slice(0, 6);
  const expiryRaw = l2.slice(8, 14);
  const optional2 = l2.slice(18, 29);

  const birthDate = parseDate(birthRaw, "birth", today);
  const expiryDate = parseDate(expiryRaw, "expiry", today);

  const composite =
    l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);

  return {
    format: "TD1",
    documentCode: trimFiller(l1.slice(0, 2)),
    issuingState: trimFiller(l1.slice(2, 5)),
    surname: names.surname,
    givenNames: names.givenNames,
    documentNumber: trimFiller(docNumRaw),
    nationality: trimFiller(l2.slice(15, 18)),
    birthDate: birthDate ?? "",
    sex: parseSex(l2[7]),
    expiryDate: expiryDate ?? "",
    // ID kartada JSHSHIR odatda optional maydonlarda turadi
    personalNumber: trimFiller(optional1) || trimFiller(optional2),
    checks: {
      documentNumber: verify(docNumRaw, l1[14]),
      birthDate: verify(birthRaw, l2[6]) && birthDate !== null,
      expiryDate: verify(expiryRaw, l2[14]) && expiryDate !== null,
      personalNumber: null,
      composite: verify(composite, l2[29]),
    },
    valid: false,
    lines,
  };
}

/**
 * MRZ matnini o'qiydi. Formatni qatorlar soni va uzunligidan aniqlaydi.
 * MRZ topilmasa yoki format tanilmasa MrzError tashlaydi — bu yerda
 * "yaqinlashtirib" o'qish yo'q, chunki xato pasport raqami xato vizadir.
 */
export function parseMrz(text: string, today = new Date()): Mrz {
  const lines = extractLines(text);

  let mrz: Mrz;
  if (lines.length >= 3 && lines.slice(-3).every((l) => l.length === 30)) {
    mrz = parseTd1(lines.slice(-3), today);
  } else if (lines.length >= 2 && lines.slice(-2).every((l) => l.length === 44)) {
    mrz = parseTd3(lines.slice(-2), today);
  } else if (lines.length >= 2 && lines.slice(-2).every((l) => l.length === 36)) {
    mrz = parseTd2(lines.slice(-2), today);
  } else {
    throw new MrzError(
      "MRZ topilmadi: 2×44 (pasport), 3×30 (ID karta) yoki 2×36 qator kutilgan.",
    );
  }

  const c = mrz.checks;
  mrz.valid =
    c.documentNumber &&
    c.birthDate &&
    c.expiryDate &&
    c.composite &&
    (c.personalNumber === null || c.personalNumber);
  return mrz;
}

/** Tekshiruvdan o'tmagan maydonlarning o'zbekcha nomlari — foydalanuvchiga. */
export function failedFields(mrz: Mrz): string[] {
  const out: string[] = [];
  if (!mrz.checks.documentNumber) out.push("hujjat raqami");
  if (!mrz.checks.birthDate) out.push("tug'ilgan sana");
  if (!mrz.checks.expiryDate) out.push("amal muddati");
  if (mrz.checks.personalNumber === false) out.push("JSHSHIR");
  if (!mrz.checks.composite) out.push("umumiy tekshiruv");
  return out;
}

/** Pasport amal muddati vizaga yetadimi (Umra uchun odatda 6 oy talab qilinadi). */
export function monthsUntilExpiry(mrz: Mrz, today = new Date()): number | null {
  if (!mrz.expiryDate) return null;
  const exp = new Date(`${mrz.expiryDate}T00:00:00Z`);
  if (Number.isNaN(exp.getTime())) return null;
  return (exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}
