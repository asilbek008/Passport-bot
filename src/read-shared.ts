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
import {
  parseBox,
  parseQuad,
  parseRotation,
  type Box,
  type Quad,
  type Rotation,
} from "./crop.ts";
import type { VisaType } from "./visa.ts";

export const ReadSchema = z.object({
  /** MRZ qatorlari — belgima-belgi, to'ldiruvchi '<' lar bilan */
  mrz_lines: z.array(z.string()),
  /** MRZ da yo'q, lekin vizaga kerak bo'ladigan maydonlar (ko'rinsa) */
  issue_date: z.string().nullable(),
  place_of_birth: z.string().nullable(),
  authority: z.string().nullable(),
  document_kind: z.enum(["passport", "id_card", "visa", "other", "not_a_document"]),
  /**
   * ID karta bo'lsa — qaysi tomoni ko'rinayapti.
   *
   * MRZ faqat ORQA tomonda bo'ladi. Old tomonini yuborgan xodimga
   * "kartani teskari qilib oling" deyish kerak, orqa tomonini
   * yuborgan-u rasm xira bo'lsa — "yaqinroqdan, yorug'da oling".
   * Ikkisining yechimi boshqacha, shuning uchun modeldan aniq so'raymiz.
   */
  id_side: z.enum(["front", "back"]).nullable().optional(),
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
  /**
   * Hujjatning kadrdagi chegarasi: `[y0, x0, y1, x1]`, 0–1000 oralig'ida.
   * Rasmni pasportning o'ziga qirqish uchun (`crop.ts`).
   *
   * Ixtiyoriy va ishonchsiz: bo'lmasa yoki shubhali bo'lsa rasm asl
   * holida saqlanadi. MRZ o'qishga hech qanday ta'siri yo'q.
   */
  document_box: z.array(z.number()).nullable().optional(),
  /**
   * Hujjatning TO'RT BURCHAGI: `[[y,x],[y,x],[y,x],[y,x]]`, 0–1000.
   *
   * Tartib — hujjatning O'ZIGA nisbatan: chap-yuqori, o'ng-yuqori,
   * o'ng-past, chap-past. Qo'lda ushlangan pasport kadrda trapetsiya
   * bo'lib ko'rinadi; shu to'rt nuqta bo'yicha rasm skanerdek tekis
   * to'rtburchakka to'g'rilanadi (`crop.ts` `warpQuad`).
   *
   * Ixtiyoriy va ishonchsiz: shubha bo'lsa `document_box` ishlatiladi.
   */
  document_quad: z.array(z.array(z.number())).nullable().optional(),
  /**
   * Hujjat kadrda qanchaga burilgan: 0, 90, 180 yoki 270 daraja.
   *
   * Telefonni yonboshlab olsa, arxivdagi pasport ham yonboshlab turadi —
   * konsullikka bunday yuklash noqulay. Shu raqam bo'yicha rasm to'g'ri
   * holatga buriladi (`crop.ts`). Ishonchsiz bo'lsa 0 yoki yo'q.
   */
  rotation: z.number().nullable().optional(),
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
7. ID KARTA — bu shaxsni tasdiqlovchi KARTA (bank kartasi o'lchamida).
   O'zbekistonda uning nomi "SHAXS GUVOHNOMASI" / "ID CARD"; boshqa
   davlatlarda "IDENTITY CARD", "удостоверение личности" va hokazo.
   Bunday hujjatda HAR DOIM document_kind='id_card' bo'ladi — qaysi
   tomoni ko'rinayotganidan qat'i nazar. Uni 'passport' yoki 'other'
   deb belgilama: pasport — kitobcha, karta emas.

   ID KARTA bo'lsa, QAYSI TOMONI ekanini ayt:
   • id_side='front' — old tomoni: surat, ism, karta raqami ko'rinadi,
     lekin MRZ qatorlari YO'Q. Bunda document_kind='id_card',
     mrz_readable=false, mrz_lines=[]. MRZ ID kartaning ORQA tomonida
     bo'ladi — uni old tomondan topishga urinma va o'ylab topma;
   • id_side='back' — orqa tomoni: pastida 3 qator x 30 belgili MRZ bor
     (xira bo'lsa ham, qatorlarning o'zi ko'rinib tursa shu).
   Pasportda bu maydon kerak emas: id_side=null.

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

document_box — HUJJATNING kadrdagi chegarasi: [y0, x0, y1, x1], har biri
0 dan 1000 gacha (rasm o'lchamidan qat'i nazar). Bu chegara bo'yicha rasm
qirqiladi, shuning uchun:
  • hujjatning HAMMASI ichida bo'lsin — to'rt burchagi ham, MRZ qatorlari
    ham, chetlari ham. Shubha bo'lsa kengroq ko'rsat;
  • hujjatdagi SURATNI yoki MRZ ni emas, hujjatning o'zini ko'rsat;
  • pasport ochiq bo'lsa — faqat MRZ bor ma'lumot sahifasini;
  • chegarani aniq ko'rsatolmasang document_box=null qoldir. Yarmi
    kesilgan rasm qirqilmagan rasmdan yomonroq.

document_quad — hujjatning TO'RT BURCHAGI, eng muhim maydon:
[[y,x],[y,x],[y,x],[y,x]], har biri 0 dan 1000 gacha. Tartib hujjatning
O'ZIGA nisbatan: chap-yuqori, o'ng-yuqori, o'ng-past, chap-past —
ya'ni hujjatdagi YOZUV to'g'ri o'qiladigan holatdagi burchaklar.
  • Xodim pasportni ko'pincha QO'LIDA ushlab, naridan suratga oladi:
    kadrda hujjat to'rtburchak emas, trapetsiya bo'lib ko'rinadi. Shu
    to'rt nuqta bo'yicha rasm tekis to'rtburchakka to'g'rilanadi va
    arxivda faqat hujjatning o'zi qoladi — qo'l va stol chiqib ketadi;
  • barmoq hujjatning burchagini to'sib turgan bo'lsa, o'sha burchakni
    hujjat QIRRALARI bo'yicha hisoblab ko'rsat: hujjat to'g'ri
    to'rtburchak, demak bu geometriya, taxmin emas;
  • hujjatning qirrasi kadrdan chiqib ketgan bo'lsa (to'liq
    ko'rinmasa) — document_quad=null;
  • hujjatdagi SURATNING yoki MRZ ning burchaklarini emas, hujjatning
    o'zini ko'rsat;
  • burchaklarni aniq ayta olmasang document_quad=null qoldir va
    document_box ni ber. Yarmi kesilgan rasm qirqilmagan rasmdan yomonroq.

rotation — hujjat kadrda qanchaga burilgan, SOAT YO'NALISHIDA to'g'rilash
uchun kerakli daraja: 0, 90, 180 yoki 270. Ya'ni hujjatning yozuvlari
to'g'ri o'qilishi uchun rasmni soat yo'nalishida necha daraja burish
kerak. Hujjat to'g'ri turgan bo'lsa 0. Ishonchingiz bo'lmasa 0 qoldir.

JAVOB SHAKLI: faqat JSON obyekt, boshqa hech qanday matn yoki izohsiz:
{"mrz_lines":["...","..."],"issue_date":null,"place_of_birth":null,
"authority":null,"document_kind":"passport","mrz_readable":true,
"problem":null,"id_side":null,"visa_type":null,"document_box":[120,80,890,960],
"document_quad":[[130,95],[118,955],[885,962],[892,82]],"rotation":0}`;

export const USER_PROMPT = "Bu hujjatning MRZ qatorlarini ko'chirib yoz.";

/** Qaysi ko'rinishdagi rasm yuborilayotgani. */
export type ReadHint = "mrz_strip" | undefined;

/**
 * MRZ ZONASINING yaqin surati uchun topshiriq.
 *
 * Nega alohida: tasmada hujjatning o'zi ko'rinmaydi — faqat ikki-uch
 * qator yozuv. Oddiy topshiriq bilan model buni "hujjat emas" deb
 * belgilab qo'yishi mumkin va javob yo'qoladi.
 */
export const USER_PROMPT_STRIP = [
  "Bu rasm — hujjatning PASTKI QISMI, ya'ni MRZ zonasining yaqin surati.",
  "Hujjatning o'zi (surat, gerb) bu yerda ko'rinmaydi — bu normal holat.",
  "",
  "Faqat shu qatorlarni belgima-belgi ko'chirib yoz. document_kind ni",
  "qatorlarning shakli bo'yicha belgila: 2 qator x 44 belgi — 'passport',",
  "3 qator x 30 belgi — 'id_card'. 'not_a_document' DEMA.",
  "document_box, document_quad va rotation kerak emas (null yoki 0).",
].join("\n");

/**
 * IKKI RASM yuborilganda qo'shiladigan izoh.
 *
 * Nega: ochiq pasportda MRZ kadrning 5 foizi bo'ladi va model rasmni
 * o'z o'lchamiga kichraytirganda qatorlar o'qilmay qoladi. Shuning
 * uchun BIRINCHI so'rovdayoq pastki qismning yaqin surati ham
 * yuboriladi — qayta urinish kerak bo'lmaydi.
 */
const PAIR_NOTE = [
  "",
  "DIQQAT: ikkita rasm berilgan. Birinchisi — butun kadr, ikkinchisi —",
  "o'sha kadrning PASTKI qismi (MRZ odatda shu yerda, yaqindan ko'rinadi).",
  "Ikkalasi BITTA hujjat. MRZ qatorlarini ikkinchi rasmdan o'qi — u",
  "aniqroq; hujjat chegarasi (document_box, document_quad) va burilishni",
  "esa BIRINCHI rasm bo'yicha, butun kadrga nisbatan ber.",
].join("\n");

/** Topshiriq matnini tanlaydi. */
export function promptFor(hint: ReadHint, images = 1): string {
  const base = hint === "mrz_strip" ? USER_PROMPT_STRIP : USER_PROMPT;
  return images > 1 ? `${base}\n${PAIR_NOTE}` : base;
}

export type ReadResult =
  | {
      ok: true;
      mrz: Mrz;
      issueDate: string | null;
      placeOfBirth: string | null;
      authority: string | null;
      /** Viza yorlig'i bo'lsa — turi (tasdiqlanmagan, MRZ'da yo'q) */
      visaType: VisaType | null;
      /** Hujjatning kadrdagi chegarasi — rasmni qirqish uchun; yo'q bo'lsa null */
      box: Box | null;
      /**
       * Hujjatning to'rt burchagi — qo'lda ushlangan qiyshiq rasmni
       * skanerdek tekis qilish uchun; ishonchsiz bo'lsa null
       */
      quad: Quad | null;
      /** Rasmni to'g'ri holatga keltirish uchun burish: 0 | 90 | 180 | 270 */
      rotation: Rotation;
    }
  /**
   * `id_front` — ID kartaning OLD tomoni yuborilgan: MRZ u yerda emas,
   * kartaning orqasida. Alohida sabab, chunki yechimi boshqa: rasmni
   * yaxshilash emas, kartani teskari qilib olish kerak.
   */
  | {
      ok: false;
      /**
       * Hujjatning kadrdagi joyi — MODEL o'qiy olmagan bo'lsa ham
       * ko'pincha aytadi. Shu bo'yicha rasmni hujjatga kesib, YAQINDAN
       * qayta o'qishga urinamiz (`bot.ts` `readOne`).
       */
      box?: Box | null;
      quad?: Quad | null;
      /**
       * Tashxis: model hujjatni qanday belgilagani va nechta MRZ qatori
       * bergani. Hujjat ma'lumoti YO'Q — faqat turi va soni, shuning
       * uchun xodimga ham ko'rsatiladi va menga yetib keladi.
       */
      diag?: string;
      /** MRZ qatorlari umuman ko'rinmadi — ehtimol kartaning old tomoni */
      noMrz?: boolean;
      reason:
        | "unreadable"
        | "not_a_document"
        | "refused"
        | "id_front"
        /** ID kartaning orqa tomoni, lekin MRZ aniq chiqmagan */
        | "id_back_unclear"
        /** MRZ topildi-yu, qatorlarning shakli to'g'ri kelmadi */
        | "mrz_shape";
      problem: string;
    }
  | { ok: false; reason: "checks_failed"; problem: string; mrz: Mrz }
  /**
   * API'ning o'zi ishlamadi: kalit xato, hisobda mablag' yo'q, tarmoq uzildi.
   * Bu rasmning aybi emas — xodim buni bilishi kerak, aks holda 30 rasmni
   * qayta suratga olib vaqt yo'qotadi.
   */
  | {
      ok: false;
      /**
       * Hujjatning kadrdagi joyi — MODEL o'qiy olmagan bo'lsa ham
       * ko'pincha aytadi. Shu bo'yicha rasmni hujjatga kesib, YAQINDAN
       * qayta o'qishga urinamiz (`bot.ts` `readOne`).
       */
      box?: Box | null;
      quad?: Quad | null;
      /**
       * Tashxis: model hujjatni qanday belgilagani va nechta MRZ qatori
       * bergani. Hujjat ma'lumoti YO'Q — faqat turi va soni, shuning
       * uchun xodimga ham ko'rsatiladi va menga yetib keladi.
       */
      diag?: string;
      /** MRZ qatorlari umuman ko'rinmadi — ehtimol kartaning old tomoni */
      noMrz?: boolean;
      reason: "api_error";
      problem: string;
      retryable: boolean;
      /**
       * Provayderning ASL xato xabari — faqat terminal jurnaliga.
       * Telegramga chiqmaydi: xodimga tushunarli `problem` yetarli,
       * tashxis uchun esa asl matn kerak bo'ladi.
       */
      detail?: string;
    };

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
    // ID KARTA: old tomoni yuborilgan bo'lsa yechim boshqacha — rasmni
    // yaxshilash emas, kartani TESKARI qilib olish kerak.
    //
    // Lekin ORQA tomonini yuborib, rasm xira bo'lganda ham shuni aytsak,
    // xodim kartani aylantirib yuraveradi. Shuning uchun qaror modelning
    // `id_side` javobiga qarab qabul qilinadi; u aytilmagan bo'lsa,
    // MRZ qatorlari umuman ko'rinmagani (mrz_lines bo'sh) — old tomoni
    // bo'lishining belgisi.
    // Tashxis uchun: model hujjatni qanday belgiladi va nechta qator
    // berdi. Bu yerda hujjat MA'LUMOTI yo'q — faqat turi va soni
    const diag = `turi: ${out.document_kind}` +
      (out.id_side ? `/${out.id_side}` : "") +
      `, MRZ qatori: ${out.mrz_lines.length}`;

    const front =
      out.document_kind === "id_card" &&
      (out.id_side === "front" ||
        (out.id_side == null && out.mrz_lines.length === 0));
    return {
      ok: false,
      box: parseBox(out.document_box),
      quad: parseQuad(out.document_quad),
      reason: front
        ? "id_front"
        : out.document_kind === "id_card"
          ? // Orqa tomonini yuborgan, lekin MRZ aniq chiqmagan:
            // yechimi — kartani aylantirish emas, rasmni yaxshilash
            "id_back_unclear"
          : "unreadable",
      problem: out.problem ?? "MRZ qatorlari aniq ko'rinmadi.",
      diag,
      /** MRZ qatorlari umuman ko'rinmadimi (old tomoni belgisi) */
      noMrz: out.mrz_lines.length === 0,
    };
  }

  let mrz: Mrz;
  try {
    mrz = parseMrz(out.mrz_lines.join("\n"), today);
  } catch (err) {
    if (err instanceof MrzError) {
      // Bu xabarni O'ZIMIZNING kodimiz yozadi (model emas) va unda
      // hujjat ma'lumoti yo'q — faqat qatorlar soni va uzunligi.
      // Shuning uchun xodimga ko'rsatish xavfsiz va foydali: "xira yoki
      // kesilgan" degan umumiy javobdan ko'ra nima bo'lgani aniq bo'ladi.
      return {
        ok: false,
        reason: "mrz_shape",
        problem: err.message,
        box: parseBox(out.document_box),
        quad: parseQuad(out.document_quad),
      };
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
    box: parseBox(out.document_box),
    quad: parseQuad(out.document_quad),
    rotation: parseRotation(out.rotation),
  };
}
