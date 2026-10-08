/**
 * Excel (.xlsx) fayl tuzish.
 *
 * `write-excel-file` ishlatiladi. Mashhur `xlsx` (SheetJS) paketi ataylab
 * ishlatilmaydi — unda ma'lum zaifliklar bor.
 *
 * Fayl xodim uchun ISH QUROLI, shuning uchun shunchaki ma'lumot to'kib
 * qo'yilmaydi: pasport muddati yetmaydigan qatorlar rangi bilan ajralib
 * turadi va oxirgi ustunda nima qilish kerakligi yoziladi.
 */

import writeXlsxFile from "write-excel-file/node";
import type { Cell as XlsxCell } from "write-excel-file";
import { config } from "./config.ts";
import type { Pilgrim } from "./store.ts";
import { VISA_LABELS, type VisaType } from "./visa.ts";

/** Kutubxonaning katak tipi. */
type Cell = XlsxCell;

const COLUMNS: { header: string; width: number }[] = [
  { header: "№", width: 5 },
  { header: "Familiya", width: 22 },
  { header: "Ism", width: 24 },
  { header: "Hujjat turi", width: 20 },
  { header: "Davlat", width: 15 },
  { header: "Jinsi", width: 7 },
  { header: "Tug'ilgan sana", width: 14 },
  { header: "Fuqaroligi", width: 11 },
  { header: "Kod", width: 7 },
  { header: "Pasport raqami", width: 16 },
  { header: "Berilgan", width: 13 },
  { header: "Amal muddati", width: 14 },
  { header: "Qolgan (oy)", width: 12 },
  { header: "Viza", width: 20 },
  { header: "Viza raqami", width: 15 },
  { header: "Viza muddati", width: 14 },
  { header: "Viza manbasi", width: 13 },
  { header: "JSHSHIR", width: 18 },
  { header: "Tug'ilgan joy", width: 22 },
  { header: "Kim bergan", width: 18 },
  { header: "Qabul qilindi", width: 18 },
  { header: "Izoh", width: 30 },
];

const HEADER_BG = "#1E3A5F";
const EXPIRED_BG = "#FCE4E4";
const SOON_BG = "#FFF6DC";

/** Amal muddatiga necha to'liq oy qolgani. Sana buzuq bo'lsa null. */
export function monthsLeft(expiry: string, today: Date): number | null {
  const exp = new Date(`${expiry}T00:00:00Z`);
  if (Number.isNaN(exp.getTime())) return null;
  return Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

/** Pasport holati — rang va izoh shundan kelib chiqadi. */
export type PassportState = "ok" | "soon" | "expired" | "unknown";

export function passportState(
  expiry: string,
  today: Date,
  minMonths = config.minPassportMonths,
): PassportState {
  const left = monthsLeft(expiry, today);
  if (left === null) return "unknown";
  if (left < 0) return "expired";
  if (left < minMonths) return "soon";
  return "ok";
}

function note(state: PassportState, minMonths: number): string | null {
  switch (state) {
    case "expired":
      return "Pasport muddati tugagan — yangi pasport kerak";
    case "soon":
      return `Muddati ${minMonths} oydan kam — vizaga yetmasligi mumkin`;
    case "unknown":
      return "Amal muddati aniqlanmadi — qo'lda tekshiring";
    default:
      return null;
  }
}

/** Bo'sh katak: kutubxona `null` emas, `undefined` kutadi. */
const text = (value: string | null | undefined): Cell => ({
  value: value ?? undefined,
  type: String,
});

/**
 * Ro'yxatni xlsx bayt massiviga aylantiradi.
 *
 * Qizil qator — pasport muddati tugagan, sariq — ${MIN_PASSPORT_MONTHS} oydan
 * kam qolgan. Shunda xodim faylni ochishi bilan kimga qo'ng'iroq qilish
 * kerakligini ko'radi, 50 qatorni ko'zdan kechirmasdan.
 */
export async function buildWorkbook(
  rows: Pilgrim[],
  today = new Date(),
): Promise<Uint8Array<ArrayBuffer>> {
  const minMonths = config.minPassportMonths;

  const header: Cell[] = COLUMNS.map((c) => ({
    value: c.header,
    type: String,
    fontWeight: "bold",
    backgroundColor: HEADER_BG,
    color: "#FFFFFF",
    align: "center",
    wrap: true,
  }));

  const body: Cell[][] = rows.map((p, i) => {
    const state = passportState(p.expiry_date, today, minMonths);
    const bg =
      state === "expired" ? EXPIRED_BG : state === "soon" ? SOON_BG : undefined;
    // Rangni har katakka alohida berish kerak — qator darajasida fon yo'q
    const paint = (cell: Cell): Cell => (bg ? { ...cell, backgroundColor: bg } : cell);

    return [
      paint({ value: i + 1, type: Number, align: "center" }),
      paint(text(p.surname)),
      paint(text(p.given_names)),
      paint(text(p.doc_label)),
      paint(text(p.doc_country)),
      paint({ ...text(p.sex), align: "center" }),
      paint(text(p.birth_date)),
      paint({ ...text(p.nationality), align: "center" }),
      paint({ ...text(p.doc_code), align: "center" }),
      paint(text(p.doc_number)),
      paint(text(p.issue_date)),
      paint(text(p.expiry_date)),
      paint({
        value: monthsLeft(p.expiry_date, today) ?? undefined,
        type: Number,
        align: "center",
      }),
      // Viza: belgilanmagan bo'lsa bo'sh emas, "yo'q" — xodim farqni
      // ko'rishi kerak ("hali tekshirilmagan" va "vizasi yo'q" boshqa narsa)
      paint(
        text(
          p.visa_type
            ? (VISA_LABELS[p.visa_type as VisaType] ?? p.visa_type)
            : "— belgilanmagan",
        ),
      ),
      paint(text(p.visa_number)),
      paint(text(p.visa_expiry)),
      paint(
        text(
          p.visa_source === "mrz"
            ? "viza rasmi"
            : p.visa_source === "qolda"
              ? "qo'lda"
              : null,
        ),
      ),
      paint(text(p.personal_number)),
      paint(text(p.place_of_birth)),
      paint(text(p.authority)),
      paint(text(p.created_at)),
      paint({ ...text(note(state, minMonths)), wrap: true }),
    ];
  });

  const buffer = await writeXlsxFile([header, ...body], {
    columns: COLUMNS.map((c) => ({ width: c.width })),
    sheet: "Hujjatlar",
    buffer: true,
  });

  return new Uint8Array(buffer) as Uint8Array<ArrayBuffer>;
}

/** Fayl nomi: `umra-pasportlar-2026-09-29.xlsx` */
export function workbookName(today = new Date()): string {
  return `umra-pasportlar-${today.toISOString().slice(0, 10)}.xlsx`;
}

/** Xodimga yuboriladigan izoh: nechta kishi, nechtasida muammo bor. */
export function workbookCaption(rows: Pilgrim[], today = new Date()): string {
  const minMonths = config.minPassportMonths;
  let expired = 0;
  let soon = 0;
  for (const p of rows) {
    const state = passportState(p.expiry_date, today, minMonths);
    if (state === "expired") expired++;
    else if (state === "soon") soon++;
  }

  const parts = [`*${rows.length}* kishi`];
  if (expired > 0) parts.push(`🔴 ${expired} tasining pasporti tugagan`);
  if (soon > 0) parts.push(`🟡 ${soon} tasiga ${minMonths} oydan kam qolgan`);
  if (expired === 0 && soon === 0) parts.push("hammasining pasporti yetarli");

  return parts.join(" · ");
}
