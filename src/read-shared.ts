/**
 * Rasm o'qishning PROVAYDERGA BOG'LIQ BO'LMAGAN qismi.
 *
 * Bot ikki provayderni qo'llab-quvvatlaydi (Anthropic va Gemini), lekin
 * ikkisi ham faqat bitta ish qiladi: rasmdan MRZ qatorlarini MATN qilib
 * beradi. Qolgan hammasi — JSON tahlili, MRZ'ni ajratish, tekshiruv
 * raqamlari — shu faylda va `mrz.ts` da, ya'ni BIR MARTA yozilgan.
 *
 * Shu tufayli provayderni almashtirish o'qish SIFATIGA ta'sir qiladi,
 * lekin ishonchlilikka emas: xato o'qilgan MRZ qaysi model o'qiganidan
 * qat'i nazar tekshiruv raqamida ushlanadi.
 */

import { z } from "zod";
import { parseMrz, MrzError, type Mrz } from "./mrz.ts";
import type { VisaType } from "./visa.ts";

export const ReadSchema = z.object({
  /** MRZ qatorlari — belgima-belgi, to'ldiruvchi '<' lar bilan */
  mrz_lines: z.array(z.string()),
  /** MRZ da yo'q, lekin vizaga kerak bo'ladigan maydonlar (ko'rinsa) */
  issue_date: z.string().nullable(),
  place_of_birth: z.string().nullable(),
  authority: z.string().nullable(),
  document_kind: z.enum(["passport", "id_card", "visa", "other", "not_a_document"]),
  mrz_readable: z.boolean(),
  problem: z.string().nullable(),
  /**
   * Viza yorlig'i bo'lsa — turi. MRZ'da standart maydon emas, vizaning
   * ko'rinadigan qismidan o'qiladi, shuning uchun TASDIQLANMAGAN.
   */
  visa_type: z
    .enum(["umra", "hajj", "single", "multiple", "tranzit", "ishchi", "boshqa"])
    .nullable()
    // Ixtiyoriy: model bu maydonni yozishni unutsa, pasportni o'qish
    // butunlay buzilib ketmasligi kerak
    .optional(),
});

export const SYSTEM = `Sen hujjatdagi mashina o'qiydigan zonani (MRZ) ko'chirib yozadigan vositasan.

MRZ — pasportning ma'lumot sahifasining pastidagi, ID kartaning orqasidagi
maxsus shriftdagi qatorlar: pasportda 2 qator x 44 belgi, ID kartada 3 qator x 30 belgi.

QAT'IY QOIDALAR:
1. MRZ qatorlarini AYNAN ko'chirib yoz — har bir belgi, har bir '<'.
2. HECH NARSANI TUZATMA. Xato ko'rinsa ham o'zgartirma: qatorlarda tekshiruv
   raqamlari bor, xatoni keyingi bosqich o'zi aniqlaydi.
3. HECH NARSANI O'YLAB TOPMA. Bitta belgi ko'rinmasa yoki shubhali bo'lsa,
   mrz_readable=false qilib, problem maydonida nimasi ko'rinmaganini yoz.
4. Qatorlarning uzunligini to'ldiruvchi '<' bilan aniq saqlab qol
   (pasportda 44, ID kartada 30 belgi).
5. 0 va O, 1 va I ni diqqat bilan ajrat: MRZ da raqam va harf farq qiladi.
6. Rasmda hujjat bo'lmasa — document_kind='not_a_document', mrz_lines=[].

VIZA YORLIG'I: pasportga yopishtirilgan vizada ham MRZ bor (2 qator).
Bunda document_kind='visa' va visa_type ni vizaning ko'rinadigan
qismidan o'qi:
  umra     — Umrah / عمرة
  hajj     — Hajj / حج
  single   — SINGLE ENTRY / bir martalik
  multiple — MULTIPLE ENTRY / ko'p martalik
  tranzit  — TRANSIT
  ishchi   — WORK / employment
Yozilmagan yoki ko'rinmasa visa_type=null. TAXMIN QILMA: viza turi
MRZ'da tekshirilmaydi, shuning uchun noto'g'ri taxmin aniqlanmaydi.

issue_date, place_of_birth va authority — MRZ da yo'q; ularni hujjatning
ko'rinadigan qismidan o'qi, ko'rinmasa null qoldir (taxmin qilma).
issue_date formati: yyyy-mm-dd.

JAVOB SHAKLI: faqat JSON obyekt, boshqa hech qanday matn yoki izohsiz:
{"mrz_lines":["...","..."],"issue_date":null,"place_of_birth":null,
"authority":null,"document_kind":"passport","mrz_readable":true,
"problem":null,"visa_type":null}`;

export const USER_PROMPT = "Bu hujjatning MRZ qatorlarini ko'chirib yoz.";

export type ReadResult =
  | {
      ok: true;
      mrz: Mrz;
      issueDate: string | null;
      placeOfBirth: string | null;
      authority: string | null;
      /** Viza yorlig'i bo'lsa — turi (tasdiqlanmagan, MRZ'da yo'q) */
      visaType: VisaType | null;
    }
  | { ok: false; reason: "unreadable" | "not_a_document" | "refused"; problem: string }
  | { ok: false; reason: "checks_failed"; problem: string; mrz: Mrz }
  /**
   * API'ning o'zi ishlamadi: kalit xato, hisobda mablag' yo'q, tarmoq uzildi.
   * Bu rasmning aybi emas — xodim buni bilishi kerak, aks holda 30 rasmni
   * qayta suratga olib vaqt yo'qotadi.
   */
  | { ok: false; reason: "api_error"; problem: string; retryable: boolean };

export const MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type Media = (typeof MEDIA)[number];

/** Noma'lum turni JPEG deb olamiz — Telegram deyarli har doim JPEG beradi. */
export function normalizeMime(mime: string): Media {
  return (MEDIA as readonly string[]).includes(mime) ? (mime as Media) : "image/jpeg";
}

/**
 * Javobdagi JSON'ni ajratib oladi. Model atrofiga matn qo'shib qo'ysa ham
 * birinchi '{' dan oxirgi '}' gacha olinadi, keyin zod bilan tekshiriladi.
 */
export function parseJson(
  text: string,
): z.SafeParseReturnType<unknown, z.infer<typeof ReadSchema>> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return ReadSchema.safeParse(undefined);
  }
  try {
    return ReadSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return ReadSchema.safeParse(undefined);
  }
}

/** Model bergan sanani ISO ga keltiradi; shubhali bo'lsa null (taxmin yo'q). */
export function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

/**
 * Model qaytargan MATNNI tekshirilgan natijaga aylantiradi.
 *
 * Bu funksiyadan keyin hech qanday model yo'q — faqat determinlashgan kod
 * va tekshiruv raqamlari. Ikkala provayder ham shu yerga keladi, shuning
 * uchun ishonchlilik qoidasi ikkisida ham bir xil.
 */
export function interpret(text: string, today: Date): ReadResult {
  const parsed = parseJson(text);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "unreadable",
      problem: "Javobni tahlil qilib bo'lmadi, qayta urinib ko'ring.",
    };
  }
  const out = parsed.data;

  if (out.document_kind === "not_a_document") {
    return {
      ok: false,
      reason: "not_a_document",
      problem: out.problem ?? "Rasmda hujjat ko'rinmadi.",
    };
  }

  if (!out.mrz_readable || out.mrz_lines.length === 0) {
    return {
      ok: false,
      reason: "unreadable",
      problem: out.problem ?? "MRZ qatorlari aniq ko'rinmadi.",
    };
  }

  let mrz: Mrz;
  try {
    mrz = parseMrz(out.mrz_lines.join("\n"), today);
  } catch (err) {
    if (err instanceof MrzError) {
      return { ok: false, reason: "unreadable", problem: err.message };
    }
    throw err;
  }

  if (!mrz.valid) {
    return {
      ok: false,
      reason: "checks_failed",
      problem: "Tekshiruv raqamlari mos kelmadi.",
      mrz,
    };
  }

  return {
    ok: true,
    mrz,
    issueDate: normalizeDate(out.issue_date),
    placeOfBirth: out.place_of_birth?.trim() || null,
    authority: out.authority?.trim() || null,
    visaType: out.visa_type ?? null,
  };
}
