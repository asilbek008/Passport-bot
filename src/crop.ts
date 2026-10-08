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

/** Rasmni to'g'ri holatga keltirish uchun burish (soat yo'nalishida). */
export type Rotation = 0 | 90 | 180 | 270;

/** Qirqilgan rasm sifati. 90 — MRZ qatorlari aniq qoladi. */
const QUALITY = 90;

/** Hujjat kadrning kamida shuncha qismini egallashi kerak. */
const MIN_WIDTH = 0.25;
const MIN_HEIGHT = 0.15;
const MIN_AREA = 0.08;

/**
 * Burilish chorakdan (90°) shuncha darajadan ko'p farq qilsa, burilmaydi.
 * Model holatni aniq bilmagan degani.
 */
const TURN_TOLERANCE = 20;

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
 * Model aytgan burilishni o'qiydi.
 *
 * Faqat 0/90/180/270 qabul qilinadi: pasport odatda shu to'rt holatdan
 * birida bo'ladi, oraliq burchakka burish esa rasmni cho'zib, MRZ ni
 * buzib qo'yardi. Noma'lum qiymat — 0, ya'ni burilmaydi.
 */
export function parseRotation(raw: unknown): Rotation {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;

  // Manfiy va 360 dan oshgan qiymatni to'g'rilaymiz (-90 → 270)
  const angle = ((n % 360) + 360) % 360;
  const nearest = Math.round(angle / 90) * 90;

  // Chorakdan uzoq bo'lsa — burmaymiz. 45° kabi qiymat ikki tomonga teng,
  // ya'ni model holatni aniq bilmagan. Qirqishdagi qoida bilan bir xil:
  // shubha bo'lsa rasmga tegmaymiz.
  if (Math.abs(angle - nearest) > TURN_TOLERANCE) return 0;

  const normal = nearest % 360;
  return normal === 90 || normal === 180 || normal === 270 ? normal : 0;
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

/**
 * RGBA piksellarni soat yo'nalishida buradi.
 *
 * Faqat 90° ga karrali burilish, shuning uchun piksellar aralashtirilmaydi
 * — joyi almashadi, xolos. Rasm sifatiga ta'sir qilmaydi.
 */
function rotatePixels(
  data: Uint8Array,
  width: number,
  height: number,
  degrees: Rotation,
): { data: Uint8Array; width: number; height: number } {
  if (degrees === 0) return { data, width, height };

  const turned = degrees === 180 ? { w: width, h: height } : { w: height, h: width };
  const out = new Uint8Array(turned.w * turned.h * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Yangi joyi: soat yo'nalishida burilganda
      const to =
        degrees === 90
          ? { x: height - 1 - y, y: x }
          : degrees === 180
            ? { x: width - 1 - x, y: height - 1 - y }
            : { x: y, y: width - 1 - x };
      const from = (y * width + x) * 4;
      const into = (to.y * turned.w + to.x) * 4;
      out[into] = data[from];
      out[into + 1] = data[from + 1];
      out[into + 2] = data[from + 2];
      out[into + 3] = data[from + 3];
    }
  }

  return { data: out, width: turned.w, height: turned.h };
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
  /** Qancha burildi (0 — burilmadi) */
  turned: Rotation;
};

/**
 * Rasmni hujjatning o'ziga qirqadi va to'g'ri holatga buradi.
 *
 * Ikkisi BIRGA bajariladi — rasm bir marta dekodlanib, bir marta qayta
 * siqiladi. Alohida qilinsa sifat ikki marta yo'qolardi.
 *
 * Hech qachon xato tashlamaydi: nimadir ishlamasa asl rasmni qaytaradi.
 * Rasmni saqlash qirqishdan muhimroq — pasport qo'lga kirgan, uni
 * yo'qotib qo'ymaymiz.
 */
export function cropToDocument(
  image: { bytes: Uint8Array<ArrayBuffer>; mime: string },
  box: Box | null,
  marginPct: number,
  rotation: Rotation = 0,
): CropResult {
  const keep: CropResult = { bytes: image.bytes, cropped: false, turned: 0 };

  const willCrop = Boolean(box && plausible(box));
  // Ikkisi ham kerak bo'lmasa, rasmga umuman tegmaymiz
  if (!willCrop && rotation === 0) return keep;
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

    let pixels: Uint8Array = raw.data;
    let width = raw.width;
    let height = raw.height;
    let cropped = false;

    // AVVAL qirqamiz: chegara asl kadrga nisbatan aytilgan, burilgandan
    // keyin u boshqa joyni ko'rsatib qolardi
    if (willCrop && box) {
      const rect = toPixels(expand(box, marginPct), width, height);
      const tooSmall = rect.w < MIN_PIXELS || rect.h < MIN_PIXELS;
      const wholeFrame = rect.w >= width && rect.h >= height;
      if (!tooSmall && !wholeFrame) {
        pixels = cutPixels(pixels, width, rect);
        width = rect.w;
        height = rect.h;
        cropped = true;
      }
    }

    // Ikkisi ham bajarilmasa, qayta siqishdan ma'no yo'q
    if (!cropped && rotation === 0) return keep;

    const turnedImage = rotatePixels(pixels, width, height, rotation);
    const jpeg = encode(
      {
        data: turnedImage.data,
        width: turnedImage.width,
        height: turnedImage.height,
      },
      QUALITY,
    );
    // Hajm bu yerda tekshirilmaydi: ataylab. Qirqilgan rasm asl faylga
    // teng yoki kattaroq chiqishi mumkin (siqish darajasi boshqacha),
    // lekin MAZMUNI to'g'ri — kerak bo'lgani ham shu.
    return {
      bytes: new Uint8Array(jpeg.data) as Uint8Array<ArrayBuffer>,
      cropped,
      turned: rotation,
    };
  } catch {
    // Dekodlash/kodlash xatosi — rasm baribir saqlanadi
    return keep;
  }
}
