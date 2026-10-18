/**
 * Rasmdan HUJJATNING O'ZINI ajratib olish.
 *
 * NEGA KERAK: xodim pasportni ko'pincha QO'LIDA ushlab, bir-ikki qadam
 * naridan suratga oladi. Kadrda stol, qo'l, boshqa qog'ozlar va devor
 * tushadi; pasportning o'zi esa qiyshiq va kadrning kichik qismida
 * bo'ladi. Konsullikka va viza arizasiga esa pasportning O'ZI — to'liq,
 * to'g'ri burchakli va chetlarisiz — kerak. Avval buni qo'lda, har bir
 * rasmni Paint'da qirqib qilish kerak edi.
 *
 * UCH USUL, shu tartibda:
 *
 *   1. QUAD — model hujjatning TO'RT BURCHAGINI aytadi. Qo'lda ushlangan
 *      pasport kadrda to'rtburchak emas, trapetsiya bo'lib ko'rinadi
 *      (perspektiva). To'rt burchak bo'yicha proyektiv almashtirish
 *      hisoblanadi va rasm skanerdan o'tgandek tekis to'rtburchakka
 *      yoziladi: qiyshiqligi ham, burilishi ham bir yo'la to'g'rilanadi.
 *      Natijada kadrda faqat hujjat qoladi — qo'l va stol butunlay chiqib
 *      ketadi, chunki ular to'rtburchakdan tashqarida.
 *
 *   2. BOX — burchaklar ishonchsiz bo'lsa, to'rtburchak chegara bilan
 *      qirqiladi (eski usul). Chegara PIKSEL bo'yicha aniqlashtiriladi:
 *      model hujjatning bir chetini kesib qo'ygan bo'lsa, haqiqiy chetiga
 *      qarab kengaytiriladi; stolni ham qo'shib yuborgan bo'lsa,
 *      toraytiriladi.
 *
 *   3. HECH NARSA — ikkisi ham ishonchsiz bo'lsa, rasm asl holida
 *      saqlanadi.
 *
 * ENG MUHIM QOIDA O'ZGARMADI: shubha bo'lsa — QIRQMAYMIZ.
 * Yarmi kesilgan pasport butun kadrdan yomonroq: ma'lumot yo'qoladi va
 * buni xodim darhol sezmaydi ham. Qirqilmagan rasm — kamchilik,
 * kesilgan pasport — xato.
 *
 * UZOQDAN OLINGAN RASM: hujjat kadrning 8 foizidan kichik bo'lsa, eski
 * kod umuman qirqmasdi — aynan eng kerakli holat chetda qolardi. Endi
 * qirqiladi, lekin IKKI DALIL talab qiladi: model aytgan joyda haqiqatan
 * chegara (yorqinlik sakrashi) borligi piksellardan tekshiriladi. Shunda
 * ham hujjat kadrda juda kichik bo'lsa, arxivdagi rasm past sifatda
 * bo'ladi — xodimga "yaqinroq turib oling" deb aytiladi.
 */

import { decode, encode } from "jpeg-js";

/** Hujjat chegarasi, rasm o'lchamidan qat'i nazar 0–1000 oralig'ida. */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Nuqta — 0–1000 shkalasida (rasm o'lchamidan qat'i nazar). */
export type Point = { x: number; y: number };

/**
 * Hujjatning to'rt burchagi, HUJJATNING O'Z tartibida:
 * chap-yuqori → o'ng-yuqori → o'ng-past → chap-past.
 *
 * "Yuqori" — hujjatdagi yozuvning yuqorisi, kadrning emas. Shu tufayli
 * to'g'rilashda burilish ham o'zi hal bo'ladi.
 */
export type Quad = [Point, Point, Point, Point];

/** Rasmni to'g'ri holatga keltirish uchun burish (soat yo'nalishida). */
export type Rotation = 0 | 90 | 180 | 270;

/** Qirqilgan rasm sifati. 90 — MRZ qatorlari aniq qoladi. */
const QUALITY = 90;

/**
 * Hujjat kadrning kamida shuncha qismini egallashi kerak.
 *
 * Eski qiymatlar (0.25 / 0.15 / 0.08) uzoqdan olingan rasmni rad etardi:
 * ikki qadam naridan olingan pasport kadrning 10–15 foizi bo'ladi.
 * Endi chegara pastroq, lekin kichik hujjat uchun piksel tasdig'i
 * ham talab qilinadi (`EDGES_NEEDED`).
 */
const MIN_WIDTH = 0.1;
const MIN_HEIGHT = 0.07;
const MIN_AREA = 0.012;

/**
 * Shu maydondan kichik hujjat "uzoqdan olingan" hisoblanadi va
 * qirqilishi uchun piksel tasdig'i kerak bo'ladi.
 */
const CONFIRM_BELOW_AREA = 0.08;

/** Kichik hujjatni qirqish uchun nechta chetda yorqinlik sakrashi topilsin. */
const EDGES_NEEDED = 3;

/**
 * Burilish chorakdan (90°) shuncha darajadan ko'p farq qilsa, burilmaydi.
 * Model holatni aniq bilmagan degani.
 */
const TURN_TOLERANCE = 20;

/** Qirqilgan rasm shundan kichik bo'lmasin (piksel) — MRZ o'qilmay qoladi. */
const MIN_PIXELS = 200;

/**
 * Arxivdagi rasmning uzun tomoni shundan kichik bo'lsa, xodimga
 * "yaqinroq turib oling" deyiladi: bunday rasmdan MRZ ni odam ham,
 * konsullik xodimi ham o'qiy olmaydi.
 */
const LOW_RES_PIXELS = 700;

/**
 * Chegara deyarli butun kadr bo'lsa qirqishdan ma'no yo'q: faqat
 * qayta siqilib, sifati bir oz yo'qoladi.
 */
const ALREADY_TIGHT = 0.97;

/**
 * Hujjatning tomonlar nisbati (kengligi / bo'yi, to'g'ri qo'yilganda).
 *
 * Pasportning ma'lumot sahifasi 125×88 mm → 1.42; ID karta 85.6×54 mm
 * → 1.59. Shuning uchun to'g'rilangan hujjat ENKO'P holda shu oraliqda
 * bo'ladi. Oraliq ataylab keng: model chetidan ozgina ko'p yoki kam
 * olishi mumkin. Bu tekshiruv ikki xatoni ushlaydi:
 *   • model burchaklarni teskari tartibda aytsa (natija yonboshlab
 *     chiqardi) — nisbat 1 dan kichik bo'ladi;
 *   • hujjat o'rniga undagi SURATNI ko'rsatsa — surat bo'yi balandroq.
 */
const MIN_RATIO = 1.05;
const MAX_RATIO = 2.6;

/**
 * To'rtburchak chegara uchun nisbat chegarasi — ancha bo'shroq, chunki
 * chegara hujjat burilgan holatda ham beriladi (nisbat teskari bo'ladi).
 * Faqat hujjatga umuman o'xshamaydigan shakllarni rad etadi: masalan
 * faqat MRZ tasmasi (nisbat 9) yoki ingichka ustun.
 */
const MAX_BOX_RATIO = 3.4;

/** Burchak 90° dan shuncha darajadan ko'p farq qilmasin (perspektiva chegarasi). */
const MIN_ANGLE = 50;
const MAX_ANGLE = 130;

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
 * Model bergan to'rt burchakni o'qiydi.
 *
 * Har burchak — `[y, x]` (chegara bilan bir xil tartib), 0–1000. Kadrdan
 * bir oz chiqib ketishiga yo'l qo'yiladi (model chetini taxmin qilgan
 * bo'lishi mumkin) va keyin kadrga qaytariladi: burchak kadrdan tashqarida
 * bo'lsa ham hujjatning o'zi kadr ichida.
 */
export function parseQuad(raw: unknown): Quad | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;

  const points: Point[] = [];
  for (const item of raw) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const y = typeof item[0] === "number" ? item[0] : Number(item[0]);
    const x = typeof item[1] === "number" ? item[1] : Number(item[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    // Kadrdan uzoq nuqta — model adashgan, taxmin qilmaymiz
    if (x < -50 || x > 1050 || y < -50 || y > 1050) return null;
    points.push({ x: clamp(x, 0, 1000), y: clamp(y, 0, 1000) });
  }

  return points as Quad;
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

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Chegaraga ishonish mumkinmi.
 *
 * Eng ko'p uchraydigan xato: model hujjatning chegarasi o'rniga undagi
 * SURATNI ko'rsatadi. Surat kadrning kichik qismi bo'ladi — shuning
 * uchun kichik chegara uchun piksel tasdig'i talab qilinadi
 * (`cropToDocument` ichida).
 */
/**
 * Chegara umuman ma'noli sonlardanmi.
 *
 * Bu — ANIQLASHTIRISHDAN OLDINGI arzon tekshiruv. Shakl va o'lcham
 * bo'yicha qaror keyin, aniqlashtirilgan chegara ustida qabul qilinadi
 * (`plausible`): aks holda modelning kichik yoki yassi chegarasi
 * piksellar bo'yicha to'g'rilanish imkonini olmay rad etilardi — aynan
 * uni qutqaradigan kod hech qachon ishlamasdi.
 */
export function sane(box: Box): boolean {
  const { x0, y0, x1, y1 } = box;
  if ([x0, y0, x1, y1].some((n) => !Number.isFinite(n) || n < 0 || n > 1000)) {
    return false;
  }
  if (x1 <= x0 || y1 <= y0) return false;
  // Kadrning 3 foizidan ingichka narsa hujjat ham, uning bo'lagi ham emas
  if ((x1 - x0) / 1000 < 0.03 || (y1 - y0) / 1000 < 0.03) return false;
  return true;
}

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

  // Hujjatga o'xshamaydigan shakl: masalan faqat MRZ tasmasi (keng va
  // juda past) yoki ingichka ustun. Oraliq keng, chunki hujjat kadrda
  // yonboshlagan bo'lishi mumkin (nisbat teskari bo'ladi) va model
  // chetidan ozgina ko'p olishi mumkin
  const ratio = w / h;
  if (ratio < 1 / MAX_BOX_RATIO || ratio > MAX_BOX_RATIO) return false;

  // Butun kadrni "qirqish" — bekorga qayta siqish
  if (w >= ALREADY_TIGHT && h >= ALREADY_TIGHT) return false;

  return true;
}

// ───────────────────────── to'rt burchak geometriyasi ─────────────────────────

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Ikki vektorning ko'paytmasi (z komponenti). Burilish yo'nalishini beradi. */
function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Uchburchak burchagi (daraja) — `b` uchidagi. */
function angleAt(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const len = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (len === 0) return 0;
  const cos = clamp((v1.x * v2.x + v1.y * v2.y) / len, -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * To'rt burchakka ishonish mumkinmi.
 *
 * Shartlar — hammasi hujjatning o'zidan kelib chiqadi: hujjat qattiq,
 * tekis to'rtburchak, shuning uchun kadrda qavariq to'rtburchak bo'lib
 * ko'rinadi, burchaklari 90° dan uncha farq qilmaydi va tomonlar nisbati
 * ma'lum oraliqda bo'ladi.
 */
export function quadPlausible(
  quad: Quad,
  frame: { width: number; height: number } = { width: 1000, height: 1000 },
): boolean {
  // Tomonlari yo'qolib ketgan (bir nuqtaga tushgan) to'rtburchak
  for (let i = 0; i < 4; i++) {
    if (dist(quad[i], quad[(i + 1) % 4]) < 20) return false;
  }

  // QAVARIQ va SOAT YO'NALISHIDA (kadr koordinatasida y pastga qaraydi).
  // Teskari tartib bo'lsa natija ko'zguga tushgandek chiqardi — bunday
  // rasmni xodim sezmasligi ham mumkin, shuning uchun rad etiladi.
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    if (cross(b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y) <= 0) return false;
    const angle = angleAt(a, b, c);
    if (angle < MIN_ANGLE || angle > MAX_ANGLE) return false;
  }

  // Maydoni: kadrning juda kichik qismi bo'lsa, hujjat emas (yoki
  // hujjatdagi surat) — piksel tasdig'i bilan birga tekshiriladi
  if (quadArea(quad) / (1000 * 1000) < MIN_AREA) return false;

  // Tomonlar nisbati — hujjatga o'xshashlik va burchaklar tartibi
  const size = quadSize(quad, frame.width, frame.height);
  const ratio = size.w / size.h;
  if (!Number.isFinite(ratio) || ratio < MIN_RATIO || ratio > MAX_RATIO) return false;

  return true;
}

/** To'rtburchakning yuzasi (0–1000 shkalasida, musbat). */
export function quadArea(quad: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * To'g'rilangan rasmning o'lchami: qarama-qarshi tomonlarning o'rtacha
 * uzunligi (piksel). Asl rasmdan KATTA qilinmaydi — yo'q pikselni
 * o'ylab topish sifatni oshirmaydi.
 */
export function quadSize(
  quad: Quad,
  width: number,
  height: number,
): { w: number; h: number } {
  const px = quad.map((p) => ({ x: (p.x / 1000) * width, y: (p.y / 1000) * height }));
  const top = dist(px[0], px[1]);
  const bottom = dist(px[3], px[2]);
  const left = dist(px[0], px[3]);
  const right = dist(px[1], px[2]);
  return {
    w: Math.min(width, Math.round((top + bottom) / 2)),
    h: Math.min(height, Math.round((left + right) / 2)),
  };
}

/** To'rtburchakni markazidan `marginPct` foizga kengaytiradi. */
export function scaleQuad(quad: Quad, marginPct: number): Quad {
  const factor = 1 + Math.max(0, marginPct) / 50; // 2% → 1.04
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
  return quad.map((p) => ({
    x: clamp(cx + (p.x - cx) * factor, 0, 1000),
    y: clamp(cy + (p.y - cy) * factor, 0, 1000),
  })) as Quad;
}

/** To'rtburchakni o'rab turgan to'g'ri to'rtburchak (zaxira usul uchun). */
export function quadBounds(quad: Quad): Box {
  return {
    x0: Math.min(...quad.map((p) => p.x)),
    y0: Math.min(...quad.map((p) => p.y)),
    x1: Math.max(...quad.map((p) => p.x)),
    y1: Math.max(...quad.map((p) => p.y)),
  };
}

/**
 * Chegarani HUJJAT o'lchamiga nisbatan kengaytiradi.
 *
 * Nega kadrga nisbatan emas: uzoqdan olingan rasmda hujjat kadrning 8
 * foizi bo'ladi — unda kadrning 2 foizi hujjatning chorakiga teng va
 * natijada stol yarmi qolib ketardi. Hujjatga nisbatan hisoblansa,
 * chet har doim bir xil ko'rinadi. To'rt burchak usuli ham shunday
 * ishlaydi (`scaleQuad`), ikkisi bir xil bo'lsin.
 */
export function expandRelative(box: Box, marginPct: number): Box {
  const pct = Math.max(0, marginPct) / 100;
  const padX = (box.x1 - box.x0) * pct;
  const padY = (box.y1 - box.y0) * pct;
  return {
    x0: Math.max(0, box.x0 - padX),
    y0: Math.max(0, box.y0 - padY),
    x1: Math.min(1000, box.x1 + padX),
    y1: Math.min(1000, box.y1 + padY),
  };
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

// ───────────────────────── proyektiv to'g'rilash ─────────────────────────

/**
 * 8 ta noma'lumli chiziqli tenglamani yechadi (Gauss usuli).
 * Yechim bo'lmasa (nuqtalar bir to'g'ri chiziqda) `null`.
 */
function solve8(matrix: number[][], rhs: number[]): number[] | null {
  const n = 8;
  const a = matrix.map((row, i) => [...row, rhs[i]]);

  for (let col = 0; col < n; col++) {
    // Eng katta elementni tanlaymiz — aks holda kichik sonlarga bo'lib
    // aniqlik yo'qoladi
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col] / a[col][col];
      if (factor === 0) continue;
      for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k];
    }
  }

  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = a[i][n] / a[i][i];
  return out.every((v) => Number.isFinite(v)) ? out : null;
}

/**
 * To'g'ri to'rtburchakdan (0,0)–(w,h) manbadagi to'rt burchakka
 * o'tkazuvchi proyektiv almashtirishni hisoblaydi.
 *
 * Teskari yo'nalish ataylab: natijaning HAR PIKSELI uchun manbadagi
 * joyi hisoblanadi, shunda natijada bo'sh nuqta qolmaydi.
 */
export function homography(
  dst: { w: number; h: number },
  src: Point[],
): number[] | null {
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: dst.w, y: 0 },
    { x: dst.w, y: dst.h },
    { x: 0, y: dst.h },
  ];

  const matrix: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = corners[i];
    const { x, y } = src[i];
    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    rhs.push(x);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    rhs.push(y);
  }
  return solve8(matrix, rhs);
}

/**
 * Rasmni to'rt burchak bo'yicha tekis to'rtburchakka yozadi.
 *
 * Har piksel atrofidagi to'rt pikseldan o'rtalanadi (bilinear), shuning
 * uchun chiziqlar tishli bo'lib qolmaydi — MRZ qatorlari o'qiladigan
 * holatda qoladi.
 */
export function warpQuad(
  data: Uint8Array,
  width: number,
  height: number,
  quadPx: Point[],
  out: { w: number; h: number },
): Uint8Array | null {
  const h = homography(out, quadPx);
  if (!h) return null;

  const result = new Uint8Array(out.w * out.h * 4);
  const [h0, h1, h2, h3, h4, h5, h6, h7] = h;

  for (let v = 0; v < out.h; v++) {
    for (let u = 0; u < out.w; u++) {
      // Piksel markazi — chetga yarim piksel surilib ketmasligi uchun
      const uu = u + 0.5;
      const vv = v + 0.5;
      const denom = h6 * uu + h7 * vv + 1;
      if (denom === 0) return null;
      const sx = (h0 * uu + h1 * vv + h2) / denom;
      const sy = (h3 * uu + h4 * vv + h5) / denom;

      const x0 = Math.floor(clamp(sx, 0, width - 1));
      const y0 = Math.floor(clamp(sy, 0, height - 1));
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const fx = clamp(sx, 0, width - 1) - x0;
      const fy = clamp(sy, 0, height - 1) - y0;

      const i00 = (y0 * width + x0) * 4;
      const i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;
      const into = (v * out.w + u) * 4;

      for (let c = 0; c < 3; c++) {
        const top = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
        const bottom = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
        result[into + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
      result[into + 3] = 255;
    }
  }

  return result;
}

// ───────────────────────── piksel bo'yicha tekshirish ─────────────────────────

/** Kichraytirilgan RANGLI nusxa: har piksel uchun R,G,B. */
type Small = { data: Uint8Array; w: number; h: number };

/**
 * Kichraytirilgan nusxa. Chegarani tekshirish uchun aniqlik kerak emas,
 * tezlik kerak: 320 piksel yetarli.
 *
 * NEGA KULRANG EMAS: qizil pasport (220,30,30) to'q kulrang stol
 * (70,72,75) ustida kulrangga aylantirilsa 87 va 72 bo'ladi — ya'ni
 * deyarli bir xil, chegara ko'rinmaydi. RANG bo'yicha farq esa 79 —
 * aniq ko'rinadi. Hujjatning muqovasi qizil, ko'k yoki yashil bo'lishi
 * mumkin, stol ham har xil — shuning uchun rang bo'yicha solishtiramiz.
 */
export function toSmallColor(
  data: Uint8Array,
  width: number,
  height: number,
  max = 320,
): Small {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / max));
  const w = Math.max(1, Math.floor(width / step));
  const h = Math.max(1, Math.floor(height / step));
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * step * width + x * step) * 4;
      const o = (y * w + x) * 3;
      out[o] = data[i];
      out[o + 1] = data[i + 1];
      out[o + 2] = data[i + 2];
    }
  }
  return { data: out, w, h };
}

/** Pikselning rangi. */
function pixelAt(small: Small, x: number, y: number): [number, number, number] {
  const i = (clamp(y, 0, small.h - 1) * small.w + clamp(x, 0, small.w - 1)) * 3;
  return [small.data[i], small.data[i + 1], small.data[i + 2]];
}

/** Ikki rang orasidagi farq (0–255): kanallar bo'yicha o'rtacha. */
function colorDiff(a: [number, number, number], b: [number, number, number]): number {
  return (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Chegaraning har to'rt tomonida YORQINLIK SAKRASHI bormi.
 *
 * Nega kerak: model "mana shu yerda hujjat bor" deydi, lekin bu shunchaki
 * raqam. Agar aytilgan joyning ichi va tashqarisi bir xil ko'rinsa, u
 * yerda hech qanday narsa chegarasi yo'q — demak model adashgan va
 * hujjat kadrda kichik bo'lsa qirqib yuborish xavfli.
 *
 * Qaytaradi: nechta tomonda sakrash topilgani (0–4).
 */
export function edgeContrast(small: Small, box: Box, minStep = 12): number {
  const x0 = clamp(Math.round((box.x0 / 1000) * small.w), 0, small.w - 1);
  const x1 = clamp(Math.round((box.x1 / 1000) * small.w), 0, small.w - 1);
  const y0 = clamp(Math.round((box.y0 / 1000) * small.h), 0, small.h - 1);
  const y1 = clamp(Math.round((box.y1 / 1000) * small.h), 0, small.h - 1);
  const band = Math.max(1, Math.round(Math.min(small.w, small.h) * 0.02));

  /** Tasmaning o'rtacha rangi */
  const strip = (
    from: number,
    to: number,
    fixed: number,
    offset: number,
    horizontal: boolean,
  ): [number, number, number] => {
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = from; i <= to; i++) {
      const [pr, pg, pb] = horizontal
        ? pixelAt(small, i, fixed + offset)
        : pixelAt(small, fixed + offset, i);
      r += pr;
      g += pg;
      b += pb;
      count++;
    }
    return count === 0 ? [0, 0, 0] : [r / count, g / count, b / count];
  };

  let found = 0;
  // Yuqori va past
  for (const [edge, dir] of [
    [y0, -1],
    [y1, 1],
  ] as const) {
    const inside = strip(x0, x1, edge, -dir * band, true);
    const outside = strip(x0, x1, edge, dir * band, true);
    if (colorDiff(inside, outside) >= minStep) found++;
  }
  // Chap va o'ng
  for (const [edge, dir] of [
    [x0, -1],
    [x1, 1],
  ] as const) {
    const inside = strip(y0, y1, edge, -dir * band, false);
    const outside = strip(y0, y1, edge, dir * band, false);
    if (colorDiff(inside, outside) >= minStep) found++;
  }

  return found;
}

/** Qatorning (yoki ustunning) hujjatga o'xshashlik ulushi. */
function likeness(
  small: Small,
  from: number,
  to: number,
  fixed: number,
  horizontal: boolean,
  level: [number, number, number],
  tol: number,
): number {
  let hits = 0;
  let total = 0;
  for (let i = from; i <= to; i++) {
    const color = horizontal ? pixelAt(small, i, fixed) : pixelAt(small, fixed, i);
    if (colorDiff(color, level) <= tol) hits++;
    total++;
  }
  return total === 0 ? 0 : hits / total;
}

/**
 * Chegarani piksellarga qarab aniqlashtiradi.
 *
 * IKKI XATONI tuzatadi:
 *   • model hujjatning bir chetini kesib qo'ygan — chegara hujjat davom
 *     etayotgan tomonga KENGAYTIRILADI (eng muhimi shu: kesilgan pasport
 *     xato, ortiqcha joy — kamchilik);
 *   • model stolni ham qo'shib yuborgan — chet TORAYTIRILADI.
 *
 * QO'L ushlab turgan bo'lsa: barmoq hujjat chetining bir qismini to'sadi,
 * lekin qator bo'ylab ko'pchilik piksel baribir hujjat bo'ladi. Shuning
 * uchun qator "hujjat" deb hisoblanishi uchun 70 foiz yetarli — barmoq
 * tufayli hujjatning o'zi kesilib ketmaydi.
 *
 * Harakat `LIMIT` bilan cheklangan: model butunlay adashgan bo'lsa ham
 * chegara kadr bo'ylab qochib ketmaydi.
 */
export type Refined = {
  box: Box;
  /**
   * Kengaytirish O'Z CHEGARASIGA urildi — ya'ni hujjat o'sha tomonga
   * DAVOM etayotgan edi, biz esa qarashni to'xtatdik.
   *
   * Bu holatda qirqib bo'lmaydi: hujjatning qolgan qismi kesilib ketadi.
   * Model hujjat o'rniga undagi SURATNI ko'rsatganda aynan shu bo'ladi —
   * surat chetidan boshlab kengaytirsak, hujjat tugaganini topolmaymiz.
   */
  capped: boolean;
  /**
   * Chegara shubhali ravishda KICHRAYIB ketdi (modelning chegarasining
   * uchdan biridan kam qoldi). Bunday natija hujjatning bo'lagi bo'lishi
   * mumkin — qirqilmaydi.
   */
  collapsed: boolean;
};

export function refineBox(small: Small, box: Box): Refined {
  // Qanchagacha surilishi mumkin. Saxiy qo'yilgan: model hujjatning
  // yarmini tashlab ketgan bo'lsa ham haqiqiy chetini topa olsin.
  // Xavfsizligi `capped` bilan: chet TOPILMASA qirqilmaydi, ya'ni
  // chegara "qochib ketishi" natijaga chiqmaydi.
  const LIMIT = 0.45;
  const NEED = 0.7; // qatorning shuncha ulushi hujjatga o'xshasin
  const GONE = 0.35; // shundan kam bo'lsa — bu qator hujjat emas
  const PASSES = 3;

  const toX = (v: number) => clamp(Math.round((v / 1000) * small.w), 0, small.w - 1);
  const toY = (v: number) => clamp(Math.round((v / 1000) * small.h), 0, small.h - 1);

  let x0 = toX(box.x0);
  let x1 = toX(box.x1);
  let y0 = toY(box.y0);
  let y1 = toY(box.y1);
  if (x1 - x0 < 4 || y1 - y0 < 4) return { box, capped: false, collapsed: false };

  const maxX = Math.round(small.w * LIMIT);
  const maxY = Math.round(small.h * LIMIT);
  let capped = false;

  /** Hujjatning "rangi": hozirgi chegara o'rtasidagi maydon bo'yicha. */
  const docColor = (): { level: [number, number, number]; tol: number } => {
    const mid: [number, number, number][] = [];
    for (let y = y0 + Math.round((y1 - y0) * 0.3); y <= y0 + Math.round((y1 - y0) * 0.7); y++) {
      for (let x = x0 + Math.round((x1 - x0) * 0.3); x <= x0 + Math.round((x1 - x0) * 0.7); x++) {
        mid.push(pixelAt(small, x, y));
      }
    }
    const level: [number, number, number] = [
      mean(mid.map((c) => c[0])),
      mean(mid.map((c) => c[1])),
      mean(mid.map((c) => c[2])),
    ];
    // Tarqoqlik: hujjatda yozuv, muhr va surat bor — qat'iy bir rang emas
    const spread = mean(mid.map((c) => colorDiff(c, level)));
    return { level, tol: clamp(spread * 2.5, 20, 70) };
  };

  /** Hujjat davom etayotgan tomonga suradi. Chegaraga urilsa — belgilaydi. */
  const grow = (
    get: () => number,
    set: (v: number) => void,
    step: -1 | 1,
    stop: number,
    limit: number,
    rowOf: (pos: number) => number,
  ) => {
    let moved = 0;
    while (moved < limit) {
      const next = get() + step;
      if (step < 0 ? next < stop : next > stop) return; // kadr cheti — hujjat ham shu yerda tugaydi
      if (rowOf(next) < NEED) return; // haqiqiy chegara topildi
      set(next);
      moved++;
    }
    // Chegaraga urildik, lekin hujjat davom etayotgan edi
    capped = true;
  };

  /** Hujjat emas qatorlarni ichkariga tashlaydi (stolni olib tashlash). */
  const shrink = (
    get: () => number,
    set: (v: number) => void,
    step: -1 | 1,
    stop: () => number,
    limit: number,
    rowOf: (pos: number) => number,
  ) => {
    let moved = 0;
    while (moved < limit) {
      if (step > 0 ? get() >= stop() : get() <= stop()) return;
      if (rowOf(get()) >= GONE) return;
      set(get() + step);
      moved++;
    }
  };

  /**
   * BIR NECHA O'TISH kerak, chunki chetlar bir-biriga bog'liq: pastki
   * chetni tekshirayotganda qator CHAP va O'NG chetlar orasidan olinadi.
   * Chap chet hali stolda turgan bo'lsa, qatorning yarmi stol bo'ladi va
   * pastki chet "topildi" deb xato hisoblanadi — hujjatning bir bo'lagi
   * kesilib ketardi (tasodifiy holatlar testi aynan shuni ushladi).
   * Shuning uchun chetlar to'xtaguncha qayta-qayta o'tiladi.
   */
  for (let pass = 0; pass < PASSES; pass++) {
    const before = [x0, y0, x1, y1].join(",");
    const { level, tol } = docColor();
    capped = false;

    const row = (y: number) => likeness(small, x0, x1, y, true, level, tol);
    const col = (x: number) => likeness(small, y0, y1, x, false, level, tol);

    // Avval stolni tashlaymiz (toraytirish), keyin hujjat tomonga ochamiz:
    // shu tartibda qator/ustun o'rtachasi hujjatning o'ziga tegishli bo'ladi
    shrink(() => x0, (v) => (x0 = v), 1, () => x1 - 4, maxX, col);
    shrink(() => x1, (v) => (x1 = v), -1, () => x0 + 4, maxX, col);
    shrink(() => y0, (v) => (y0 = v), 1, () => y1 - 4, maxY, row);
    shrink(() => y1, (v) => (y1 = v), -1, () => y0 + 4, maxY, row);

    grow(() => y0, (v) => (y0 = v), -1, 0, maxY, row);
    grow(() => y1, (v) => (y1 = v), 1, small.h - 1, maxY, row);
    grow(() => x0, (v) => (x0 = v), -1, 0, maxX, col);
    grow(() => x1, (v) => (x1 = v), 1, small.w - 1, maxX, col);

    if ([x0, y0, x1, y1].join(",") === before) break; // qo'zg'almadi — tayyor
  }

  const refined: Box = {
    x0: (x0 / small.w) * 1000,
    y0: (y0 / small.h) * 1000,
    x1: (x1 / small.w) * 1000,
    y1: (y1 / small.h) * 1000,
  };

  // ALWAYS aniqlashtirilgan chegara qaytadi — modelning eskisi emas.
  //
  // Avval shubhali natijada modelning chegarasi qaytarilardi va chaqiruvchi
  // ANIQLASHTIRILMAGAN chegara bo'yicha qaror qabul qilardi: hujjat yassi
  // bo'lgan bir holatda aynan shu tufayli kesilgan chegara qirqilib ketdi
  // (tasodifiy holatlar testi ushladi). Endi qaror piksellar bergan
  // chegara ustida: shakli hujjatga o'xshamasa — qirqilmaydi.
  const area = (b: Box) => (b.x1 - b.x0) * (b.y1 - b.y0);
  return {
    box: refined,
    capped,
    collapsed: area(refined) < area(box) * 0.35,
  };
}

// ───────────────────────── piksellarni ko'chirish ─────────────────────────

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
  /**
   * Qanday usul ishlatilgani:
   *   `quad` — perspektiva to'g'rilandi (eng yaxshisi),
   *   `box`  — to'rtburchak qirqildi,
   *   `none` — rasmga tegilmadi.
   */
  mode: "quad" | "box" | "none";
  /**
   * Hujjat arxivdagi rasmda ham kichik qoldi (uzun tomoni
   * `LOW_RES_PIXELS` dan kam) — xodim yaqinroq turib olishi kerak.
   */
  lowRes: boolean;
};

/**
 * Kadrning PASTKI qismini kesib beradi — MRZ odatda shu yerda.
 *
 * Bu rasm modelga ASOSIY rasm bilan BIRGA yuboriladi: model ikkalasini
 * ko'radi — umumiy ko'rinish va MRZ qatorlarining yaqin surati. Shu
 * tufayli ochiq pasport (MRZ kadrning 5 foizi) birinchi so'rovdayoq
 * o'qiladi va qayta urinish kerak bo'lmaydi: ham tezroq, ham arzonroq.
 */
export function bottomStrip(
  image: { bytes: Uint8Array<ArrayBuffer>; mime: string },
  share = 0.5,
): Uint8Array<ArrayBuffer> | null {
  const part = clamp(share, 0.2, 0.9);
  const cut = cropToDocument(image, {
    box: { x0: 0, y0: (1 - part) * 1000, x1: 1000, y1: 1000 },
    exact: true,
  });
  return cut.cropped ? cut.bytes : null;
}

/**
 * Kadrning FONI (stol) rangi — to'rt burchakdan.
 *
 * Hujjat deyarli har doim kadrning o'rtasida bo'ladi, burchaklarda esa
 * stol yoki devor turadi. Shuning uchun fon rangini burchaklardan
 * olamiz. `spread` — burchaklarning o'zaro farqi: yorug'lik bir tomondan
 * tushsa fon notekis bo'ladi va "hujjat" deb hisoblash chegarasi
 * oshirilishi kerak.
 */
function backgroundColor(small: Small): {
  level: [number, number, number];
  spread: number;
} {
  const patch = Math.max(2, Math.round(Math.min(small.w, small.h) * 0.06));
  const corners: [number, number][] = [
    [0, 0],
    [small.w - patch, 0],
    [0, small.h - patch],
    [small.w - patch, small.h - patch],
  ];
  const means = corners.map(([cx, cy]) => {
    const px: [number, number, number][] = [];
    for (let y = cy; y < cy + patch; y++) {
      for (let x = cx; x < cx + patch; x++) px.push(pixelAt(small, x, y));
    }
    return [
      mean(px.map((c) => c[0])),
      mean(px.map((c) => c[1])),
      mean(px.map((c) => c[2])),
    ] as [number, number, number];
  });
  const level: [number, number, number] = [
    median(means.map((c) => c[0])),
    median(means.map((c) => c[1])),
    median(means.map((c) => c[2])),
  ];
  return { level, spread: mean(means.map((c) => colorDiff(c, level))) };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Hujjatni O'ZIMIZ topish — model chegarani aytmaganda.
 *
 * NEGA KERAK: yaqindan qayta o'qish butunlay modelning `document_box`
 * iga bog'liq edi. Model "o'qiy olmadim" deganda chegarani ham tez-tez
 * bermaydi — ya'ni ENG KERAKLI holatda (hujjat kadrda kichik, MRZ mayda)
 * yaqinlashtirish umuman ishlamasdi.
 *
 * QANDAY ISHLAYDI: fon (stol) rangi burchaklardan olinadi, keyin
 * fondan FARQ QILADIGAN piksellarning eng katta bir-biriga tutashgan
 * bo'lagi topiladi (hujjat kadrdagi eng katta "begona" narsa) va shu
 * bo'lakning chegarasi qaytariladi.
 *
 * NEGA MARKAZDAN "O'STIRISH" EMAS: avval `refineBox` bilan kadr
 * markazidan boshlab hujjat tomonga surib ko'rildi. Tekis rangli
 * hujjatda ishladi, YOZUVLI hujjatda esa MRZ tasmasining o'zida
 * to'xtab qoldi — qora qatorlar qog'oz rangiga o'xshamaydi va "hujjat
 * tugadi" deb hisoblandi. Ya'ni aynan MRZ kesilib ketardi. Fon bo'yicha
 * ajratishda yozuv ham, surat ham, MRZ ham baribir "fon emas" — hammasi
 * hujjatning ichida qoladi.
 *
 * TEKSHIRUVLAR: topilgan narsa hujjat shaklida bo'lishi (`plausible`),
 * kadrni to'ldirib yubormasligi (unda qirqishdan foyda yo'q) va to'rt
 * tomonning kamida uchtasida chegara ko'rinishi kerak.
 *
 * Bu faqat O'QISH uchun: arxivga tushadigan rasm hech qachon shu
 * usulda qirqilmaydi — u yerda modelning chegarasi ishlatiladi.
 */
export function findDocument(image: {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
}): Box | null {
  if (image.mime !== "image/jpeg") return null;
  try {
    const raw = decode(image.bytes, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: true,
      maxMemoryUsageInMB: 512,
    });
    const small = toSmallColor(raw.data, raw.width, raw.height);
    const { level, spread } = backgroundColor(small);

    // Fondan shuncha farq qilsa — "fon emas". Notekis yorug'likda
    // chegara oshadi, aks holda stolning o'zi hujjat bo'lib ko'rinadi
    const limit = clamp(spread * 2 + 18, 20, 70);
    const total = small.w * small.h;
    const foreign = new Uint8Array(total);
    for (let y = 0; y < small.h; y++) {
      for (let x = 0; x < small.w; x++) {
        const i = y * small.w + x;
        foreign[i] = colorDiff(pixelAt(small, x, y), level) > limit ? 1 : 0;
      }
    }

    const found = largestBlob(foreign, small.w, small.h);
    if (!found) return null;
    // Juda kichik — hujjat emas, dog' yoki soya; juda katta — kadrni
    // to'ldirgan, qirqishning foydasi yo'q. Pastdagi chegara ataylab
    // past: hujjat kadrning 1 foizi bo'lgan holat ENG kerakli holat,
    // shakl bo'yicha qarorni `plausible` beradi (u 1.2 foizdan boshlaydi)
    if (found.area < total * 0.01 || found.area > total * 0.9) return null;

    const box: Box = {
      x0: (found.x0 / small.w) * 1000,
      y0: (found.y0 / small.h) * 1000,
      x1: ((found.x1 + 1) / small.w) * 1000,
      y1: ((found.y1 + 1) / small.h) * 1000,
    };
    if (!plausible(box)) return null;
    if (edgeContrast(small, box) < 3) return null;
    return box;
  } catch {
    return null;
  }
}

/**
 * Eng katta bir-biriga tutashgan "fon emas" bo'lagi va uning chegarasi.
 *
 * Oddiy to'lg'azish (flood fill), stack bilan — rekursiyasiz, chunki
 * 320×240 rasmda rekursiya chuqurligi stack'ni to'ldirib yuborishi
 * mumkin.
 */
function largestBlob(
  mask: Uint8Array,
  w: number,
  h: number,
): { x0: number; y0: number; x1: number; y1: number; area: number } | null {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  let best: { x0: number; y0: number; x1: number; y1: number; area: number } | null =
    null;

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || seen[start] === 1) continue;
    seen[start] = 1;
    stack.push(start);
    let area = 0;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;

    while (stack.length > 0) {
      const at = stack.pop()!;
      const x = at % w;
      const y = (at - x) / w;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;

      if (x > 0 && mask[at - 1] === 1 && seen[at - 1] === 0) {
        seen[at - 1] = 1;
        stack.push(at - 1);
      }
      if (x < w - 1 && mask[at + 1] === 1 && seen[at + 1] === 0) {
        seen[at + 1] = 1;
        stack.push(at + 1);
      }
      if (y > 0 && mask[at - w] === 1 && seen[at - w] === 0) {
        seen[at - w] = 1;
        stack.push(at - w);
      }
      if (y < h - 1 && mask[at + w] === 1 && seen[at + w] === 0) {
        seen[at + w] = 1;
        stack.push(at + w);
      }
    }

    if (!best || area > best.area) best = { x0, y0, x1, y1, area };
  }

  return best;
}

export type CropOptions = {
  /**
   * Berilgan chegarani AYNAN kesadi: shakl tekshiruvlari, piksel
   * aniqlashtirishi va "ikki dalil" qoidasi ishlatilmaydi.
   *
   * Faqat ICHKI maqsad uchun: MRZ tasmasini (keng va past) modelga
   * yaqindan ko'rsatish. Arxivga tushadigan rasm hech qachon shu
   * usulda kesilmaydi — u yerda hujjatning butunligi kafolati kerak.
   */
  exact?: boolean;
  /** Hujjatning to'rt burchagi — bo'lsa shu ishlatiladi */
  quad?: Quad | null;
  /** To'rtburchak chegara — burchaklar bo'lmaganda yoki ishonchsiz bo'lganda */
  box?: Box | null;
  /** Chetga qo'shiladigan bo'sh joy (kadr kengligining foizi) */
  marginPct?: number;
  /** Model aytgan burilish (faqat `box` usulida kerak) */
  rotation?: Rotation;
};

/**
 * Rasmdan hujjatning o'zini ajratib oladi.
 *
 * Hech qachon xato tashlamaydi: nimadir ishlamasa asl rasmni qaytaradi.
 * Rasmni saqlash qirqishdan muhimroq — pasport qo'lga kirgan, uni
 * yo'qotib qo'ymaymiz.
 */
export function cropToDocument(
  image: { bytes: Uint8Array<ArrayBuffer>; mime: string },
  options: CropOptions = {},
): CropResult {
  const {
    quad = null,
    box = null,
    marginPct = 0,
    rotation = 0,
    exact = false,
  } = options;
  const keep: CropResult = {
    bytes: image.bytes,
    cropped: false,
    turned: 0,
    mode: "none",
    lowRes: false,
  };

  // Hech narsa qilish kerak bo'lmasa, rasmga umuman tegmaymiz
  if (!quad && !box && rotation === 0) return keep;
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

    const width = raw.width;
    const height = raw.height;

    // AYNAN kesish: tekshiruvsiz. Faqat o'qish uchun ishlatiladi
    if (exact && box) {
      const rect = toPixels(expandRelative(box, marginPct), width, height);
      // MRZ tasmasi past bo'ladi, shuning uchun chegara kichikroq
      if (rect.w < 60 || rect.h < 24) return keep;
      const cut = cutPixels(raw.data, width, rect);
      const turned = rotatePixels(cut, rect.w, rect.h, rotation);
      const jpeg = encode(
        { data: turned.data, width: turned.width, height: turned.height },
        QUALITY,
      );
      return {
        bytes: new Uint8Array(jpeg.data) as Uint8Array<ArrayBuffer>,
        cropped: true,
        turned: rotation,
        mode: "box",
        lowRes: false,
      };
    }

    const small = toSmallColor(raw.data, width, height);

    // ── 1-usul: perspektiva to'g'rilash (qo'lda ushlangan, qiyshiq rasm)
    if (quad && quadPlausible(quad, { width, height })) {
      const padded = scaleQuad(quad, marginPct);
      const size = quadSize(padded, width, height);
      const share = quadArea(padded) / (1000 * 1000);
      const confirmed =
        share >= CONFIRM_BELOW_AREA ||
        edgeContrast(small, quadBounds(padded)) >= EDGES_NEEDED;

      if (size.w >= MIN_PIXELS && size.h >= MIN_PIXELS && confirmed) {
        const px = padded.map((p) => ({
          x: (p.x / 1000) * width,
          y: (p.y / 1000) * height,
        }));
        const warped = warpQuad(raw.data, width, height, px, size);
        if (warped) {
          const jpeg = encode({ data: warped, width: size.w, height: size.h }, QUALITY);
          return {
            bytes: new Uint8Array(jpeg.data) as Uint8Array<ArrayBuffer>,
            cropped: true,
            // Burilish to'rt burchakning tartibida hal bo'ldi
            turned: 0,
            mode: "quad",
            lowRes: Math.max(size.w, size.h) < LOW_RES_PIXELS,
          };
        }
      }
    }

    // ── 2-usul: to'rtburchak chegara (burchaklarsiz yoki ular ishonchsiz)
    // Burchaklar bor-u ishonchsiz bo'lsa, ularning o'ramidan foydalanamiz:
    // model hujjatni ko'rgan, faqat burchaklarni aniq aytolmagan
    const base = box ?? (quad ? quadBounds(quad) : null);
    let cropped = false;
    let pixels: Uint8Array = raw.data;
    let outW = width;
    let outH = height;

    if (base && sane(base)) {
      // AVVAL piksellar bo'yicha aniqlashtiramiz: model chegarani kesib
      // qo'ygan yoki hujjat o'rniga undagi suratni ko'rsatgan bo'lsa,
      // hujjatning haqiqiy cheti shu yerda topiladi
      const { box: refined, capped, collapsed } = refineBox(small, base);
      const share =
        (((refined.x1 - refined.x0) / 1000) * (refined.y1 - refined.y0)) / 1000;
      // Kichik hujjat (uzoqdan olingan) uchun ikkinchi dalil: aytilgan
      // joyda haqiqatan narsa chegarasi bormi
      const confirmed =
        share >= CONFIRM_BELOW_AREA || edgeContrast(small, refined) >= EDGES_NEEDED;

      // Qaror aniqlashtirilgan chegara ustida: shakli hujjatga
      // o'xshaydimi, chetlari topildimi (`capped` — topilmadi, ya'ni
      // hujjat davom etayotgan edi; qirqsak yarmi kesiladi).
      if (plausible(refined) && confirmed && !capped && !collapsed) {
        const rect = toPixels(expandRelative(refined, marginPct), width, height);
        const tooSmall = rect.w < MIN_PIXELS || rect.h < MIN_PIXELS;
        const wholeFrame = rect.w >= width && rect.h >= height;
        if (!tooSmall && !wholeFrame) {
          pixels = cutPixels(pixels, width, rect);
          outW = rect.w;
          outH = rect.h;
          cropped = true;
        }
      }
    }

    // Ikkisi ham bajarilmasa, qayta siqishdan ma'no yo'q
    if (!cropped && rotation === 0) return keep;

    const turnedImage = rotatePixels(pixels, outW, outH, rotation);
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
      mode: cropped ? "box" : "none",
      lowRes:
        cropped && Math.max(turnedImage.width, turnedImage.height) < LOW_RES_PIXELS,
    };
  } catch {
    // Dekodlash/kodlash xatosi — rasm baribir saqlanadi
    return keep;
  }
}
