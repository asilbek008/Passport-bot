/**
 * Excel (.xlsx) fayl tuzish.
 *
 * `write-excel-file` ishlatiladi. Mashhur `xlsx` (SheetJS) paketi ataylab
 * ishlatilmaydi — unda ma'lum zaifliklar bor.
 *
 * Jadvalda faqat FAMILIYA va ISM (egasining talabi) — u konsullikka
 * ro'yxat topshirish uchun kerak. Pasport muddati haqidagi ogohlantirish
 * jadvalda emas: u to'plam hisobotida va `/ogohlik` da chiqadi.
 */

import writeXlsxFile from "write-excel-file/node";
import type { Cell as XlsxCell } from "write-excel-file";
import { config } from "./config.ts";
import { day } from "./day.ts";
import type { Pilgrim } from "./store.ts";
import { VISA_LABELS, type VisaType } from "./visa.ts";

/** Kutubxonaning katak tipi. */
type Cell = XlsxCell;

/**
 * USTUNLAR: faqat Familiya va Ism.
 *
 * Avval 22 ta ustun bor edi (hujjat turi, davlat, JSHSHIR, viza...).
 * Egasining talabi — "Familiya | Ism yetarli": jadval konsullikka
 * ro'yxat topshirish uchun kerak, qolgan hammasi ortiqcha.
 *
 * Ma'lumotning o'zi bazada turaveradi — kerak bo'lsa ustun qaytariladi.
 */
const COLUMNS: { header: string; width: number }[] = [
  { header: "Familiya", width: 28 },
  { header: "Ism", width: 28 },
];

const HEADER_BG = "#1E3A5F";

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

/**
 * Excel fayl tuzadi: Familiya va Ism.
 */
export async function buildWorkbook(
  rows: Pilgrim[],
  _today = new Date(),
): Promise<Uint8Array<ArrayBuffer>> {
  const header: Cell[] = COLUMNS.map((c) => ({
    value: c.header,
    type: String,
    fontWeight: "bold",
    backgroundColor: HEADER_BG,
    color: "#FFFFFF",
    align: "center",
  }));

  const body: Cell[][] = rows.map((p) => [
    { value: p.surname || undefined, type: String },
    { value: p.given_names || undefined, type: String },
  ]);

  const buffer = await writeXlsxFile([header, ...body], {
    columns: COLUMNS.map((c) => ({ width: c.width })),
    sheet: "Ro'yxat",
    buffer: true,
  });

  return new Uint8Array(buffer) as Uint8Array<ArrayBuffer>;
}

/** Fayl nomi: `umra-pasportlar-2026-09-29.xlsx` (O'zbekiston kuni) */
export function workbookName(today = new Date()): string {
  return `umra-pasportlar-${day(today)}.xlsx`;
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
