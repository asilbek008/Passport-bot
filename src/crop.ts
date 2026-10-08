/**
 * Rasmni hujjatning o'ziga qirqish.
 *
 * NEGA KERAK: xodim pasportni stol ustida suratga oladi — kadrda stol,
 * qo'l, boshqa qog'ozlar ham tushadi. Viza arizasiga esa pasportning
 * O'ZI, to'liq va chetlarisiz ilova qilinadi. Avval arxivdagi rasmlarni
 * qo'lda qirqib chiqish kerak edi.
 *
 * QANDAY: model MRZ ni o'qiyotganda hujjatning chegara to'rtburchagini ham
 * aytadi (0–1000 oralig'ida, rasm o'lchamidan qat'i nazar). Qirqishning
 * o'zi shu yerda, oddiy kod bilan bajariladi — modeldan faqat RAQAM
 * keladi, rasmni u o'zgartirmaydi.
 *
 * ENG MUHIM QOIDA: shubha bo'lsa — QIRQMAYMIZ.
 * Yarmi kesilgan pasport butun kadrdan yomonroq: ma'lumot yo'qoladi va
 * buni xodim darhol sezmaydi ham. Shuning uchun chegara ishonchsiz
 * bo'lsa (juda kichik, teskari, kadrdan chiqib ketgan) rasm asl holida
 * saqlanadi. Qirqilmagan rasm — kamchilik, kesilgan pasport — xato.
 *
 * Chetiga ozgina bo'sh joy (`CROP_MARGIN_PCT`) qo'shiladi: model chegarani
 * bir-ikki foiz ichkaridan ko'rsatsa ham pasportning qirrasi kesilmaydi.
 */

import { decode, encode } from "jpeg-js";

/** Hujjat chegarasi, rasm o'lchamidan qat'i nazar 0–1000 oralig'ida. */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Qirqilgan rasm sifati. 90 — MRZ qatorlari aniq qoladi. */
const QUALITY = 90;

/** Hujjat kadrning kamida shuncha qismini egallashi kerak. */
const MIN_WIDTH = 0.25;
const MIN_HEIGHT = 0.15;
const MIN_AREA = 0.08;

/** Qirqilgan rasm shundan kichik bo'lmasin (piksel) — MRZ o'qilmay qoladi. */
const MIN_PIXELS = 200;

/**
 * Chegara deyarli butun kadr bo'lsa qirqishdan ma'no yo'q: faqat
 * qayta siqilib, sifati bir oz yo'qoladi.
 */
const ALREADY_TIGHT = 0.97;

/**
 * Model bergan ro'yxatni chegaraga aylantiradi.
 *
 * Tartib — `[y0, x0, y1, x1]`: bu Gemini'ning o'z formati, shuning uchun
 * model aynan shu tartibda javob berishga o'rgatilgan. Tartibni
 * o'zgartirmang, aks holda rasm ko'ndalang qirqiladi.
 */
export function parseBox(raw: unknown): Box | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const nums = raw.map((v) => (typeof v === "number" ? v : Number(v)));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [y0, x0, y1, x1] = nums;
  return { x0, y0, x1, y1 };
}

/**
 * Chegaraga ishonish mumkinmi.
 *
 * Eng ko'p uchraydigan xato: model hujjatning chegarasi o'rniga undagi
 * SURATNI ko'rsatadi. U kadrning kichik qismi bo'ladi — shu tekshiruv
 * aynan buni ushlaydi.
 */
export function plausible(box: Box): boolean {
  const { x0, y0, x1, y1 } = box;
  if ([x0, y0, x1, y1].some((n) => !Number.isFinite(n) || n < 0 || n > 1000)) {
    return false;
  }
  if (x1 <= x0 || y1 <= y0) return false;

  const w = (x1 - x0) / 1000;
  const h = (y1 - y0) / 1000;
  if (w < MIN_WIDTH || h < MIN_HEIGHT) return false;
  if (w * h < MIN_AREA) return false;

  // Butun kadrni "qirqish" — bekorga qayta siqish
  if (w >= ALREADY_TIGHT && h >= ALREADY_TIGHT) return false;

  return true;
}

/** Chegarani har tomondan `marginPct` foizga kengaytiradi (kadrdan chiqmasdan). */
export function expand(box: Box, marginPct: number): Box {
  const pad = Math.max(0, marginPct) * 10; // foiz → 0–1000 shkalasi
  return {
    x0: Math.max(0, box.x0 - pad),
    y0: Math.max(0, box.y0 - pad),
    x1: Math.min(1000, box.x1 + pad),
    y1: Math.min(1000, box.y1 + pad),
  };
}

/** 0–1000 chegarasini piksellarga aylantiradi. */
export function toPixels(
  box: Box,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  const x = Math.round((box.x0 / 1000) * width);
  const y = Math.round((box.y0 / 1000) * height);
  // Chetga chiqib ketmasin: kenglik qolgan joyga qarab cheklanadi
  const w = Math.min(width - x, Math.round(((box.x1 - box.x0) / 1000) * width));
  const h = Math.min(height - y, Math.round(((box.y1 - box.y0) / 1000) * height));
  return { x, y, w, h };
}

/** RGBA piksellardan to'rtburchakni ko'chirib oladi. */
function cutPixels(
  data: Uint8Array,
  width: number,
  rect: { x: number; y: number; w: number; h: number },
): Uint8Array {
  const out = new Uint8Array(rect.w * rect.h * 4);
  for (let row = 0; row < rect.h; row++) {
    const from = ((rect.y + row) * width + rect.x) * 4;
    out.set(data.subarray(from, from + rect.w * 4), row * rect.w * 4);
  }
  return out;
}

export type CropResult = {
  bytes: Uint8Array<ArrayBuffer>;
  /** Qirqildimi. `false` — rasm asl holida qaytdi */
  cropped: boolean;
};

/**
 * Rasmni chegara bo'yicha qirqadi.
 *
 * Hech qachon xato tashlamaydi: nimadir ishlamasa asl rasmni qaytaradi.
 * Rasmni saqlash qirqishdan muhimroq — pasport qo'lga kirgan, uni
 * yo'qotib qo'ymaymiz.
 */
export function cropToDocument(
  image: { bytes: Uint8Array<ArrayBuffer>; mime: string },
  box: Box | null,
  marginPct: number,
): CropResult {
  const keep: CropResult = { bytes: image.bytes, cropped: false };

  if (!box || !plausible(box)) return keep;
  // jpeg-js faqat JPEG biladi. Telegram oddiy rasmni JPEG qilib beradi,
  // shuning uchun bu deyarli har doim bajariladi.
  if (image.mime !== "image/jpeg") return keep;

  try {
    const raw = decode(image.bytes, {
      useTArray: true,
      formatAsRGBA: true,
      // Buzilgan yoki g'ayrioddiy JPEG butun botni to'xtatmasin
      tolerantDecoding: true,
      maxMemoryUsageInMB: 512,
    });

    const rect = toPixels(expand(box, marginPct), raw.width, raw.height);
    if (rect.w < MIN_PIXELS || rect.h < MIN_PIXELS) return keep;
    if (rect.w >= raw.width && rect.h >= raw.height) return keep;

    const cut = cutPixels(raw.data, raw.width, rect);
    const jpeg = encode({ data: cut, width: rect.w, height: rect.h }, QUALITY);
    // Hajm bu yerda tekshirilmaydi: ataylab. Qirqilgan rasm asl faylga
    // teng yoki kattaroq chiqishi mumkin (siqish darajasi boshqacha),
    // lekin MAZMUNI to'g'ri — kerak bo'lgani ham shu.
    return { bytes: new Uint8Array(jpeg.data) as Uint8Array<ArrayBuffer>, cropped: true };
  } catch {
    // Dekodlash/kodlash xatosi — rasm baribir saqlanadi
    return keep;
  }
}
