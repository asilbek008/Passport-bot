/**
 * Rasmni hujjatning o'ziga qirqish.
 *
 * Eng muhim qoida bu yerda sinaladi: SHUBHA BO'LSA QIRQMAYMIZ.
 * Yarmi kesilgan pasport qirqilmagan kadrdan yomonroq — ma'lumot
 * yo'qoladi va xodim buni sezmasligi mumkin.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { encode, decode } from "jpeg-js";
import {
  parseBox,
  parseRotation,
  plausible,
  expand,
  toPixels,
  cropToDocument,
  type Box,
} from "../src/crop.ts";

// --- Chegarani o'qish ---

test("Gemini tartibi [y0, x0, y1, x1] bo'yicha o'qiladi", () => {
  // Tartib muhim: aralashtirilsa rasm ko'ndalang qirqiladi
  assert.deepEqual(parseBox([100, 200, 800, 900]), {
    y0: 100,
    x0: 200,
    y1: 800,
    x1: 900,
  });
});

test("yaroqsiz chegara null bo'ladi", () => {
  assert.equal(parseBox(null), null);
  assert.equal(parseBox([1, 2, 3]), null, "4 ta son kerak");
  assert.equal(parseBox("120,80,890,960"), null);
  assert.equal(parseBox([1, 2, 3, "a"]), null);
  assert.equal(parseBox([]), null);
});

test("matn ko'rinishidagi sonlar ham o'qiladi", () => {
  // Model ba'zan "120" deb yozadi — bu buzilish emas
  assert.deepEqual(parseBox(["120", "80", "890", "960"]), {
    y0: 120,
    x0: 80,
    y1: 890,
    x1: 960,
  });
});

// --- Ishonish mumkinmi ---

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({
  x0,
  y0,
  x1,
  y1,
});

test("odatdagi pasport chegarasi qabul qilinadi", () => {
  assert.equal(plausible(box(80, 120, 960, 890)), true);
});

test("hujjatdagi SURAT chegarasi rad etiladi", () => {
  // Eng ko'p uchraydigan xato: model hujjat o'rniga undagi suratni ko'rsatadi.
  // Kadrning ~8% i — qirqilsa MRZ ham, ma'lumot ham yo'qoladi.
  assert.equal(plausible(box(100, 200, 300, 500)), false);
});

test("teskari va chegaradan tashqari qiymatlar rad etiladi", () => {
  assert.equal(plausible(box(900, 100, 100, 900)), false, "x1 < x0");
  assert.equal(plausible(box(100, 900, 900, 100)), false, "y1 < y0");
  assert.equal(plausible(box(-50, 100, 900, 900)), false);
  assert.equal(plausible(box(100, 100, 1200, 900)), false);
  assert.equal(plausible(box(100, 100, 100, 900)), false, "kengligi nol");
});

test("butun kadr qirqilmaydi — bekorga qayta siqishdan ma'no yo'q", () => {
  assert.equal(plausible(box(0, 0, 1000, 1000)), false);
  assert.equal(plausible(box(5, 5, 995, 995)), false);
  // Lekin bir tomoni sezilarli kesilsa — qirqamiz
  assert.equal(plausible(box(0, 200, 1000, 800)), true);
});

test("juda yassi chegara rad etiladi", () => {
  // Faqat MRZ qatorlari: keng, lekin juda past
  assert.equal(plausible(box(50, 850, 950, 950)), false);
});

// --- Chetiga bo'sh joy ---

test("chegara har tomondan kengayadi", () => {
  assert.deepEqual(expand(box(100, 200, 800, 900), 2), {
    x0: 80,
    y0: 180,
    x1: 820,
    y1: 920,
  });
});

test("kengayish kadrdan chiqib ketmaydi", () => {
  assert.deepEqual(expand(box(10, 10, 990, 990), 5), {
    x0: 0,
    y0: 0,
    x1: 1000,
    y1: 1000,
  });
});

// --- Piksellarga aylantirish ---

test("chegara piksellarga to'g'ri aylanadi", () => {
  assert.deepEqual(toPixels(box(100, 200, 900, 800), 1000, 1000), {
    x: 100,
    y: 200,
    w: 800,
    h: 600,
  });
});

test("piksel to'rtburchagi rasmdan chiqib ketmaydi", () => {
  const rect = toPixels(box(900, 900, 1000, 1000), 1280, 960);
  assert.ok(rect.x + rect.w <= 1280, `o'ngdan chiqdi: ${rect.x + rect.w}`);
  assert.ok(rect.y + rect.h <= 960, `pastdan chiqdi: ${rect.y + rect.h}`);
});

// --- Haqiqiy JPEG bilan ---

/** Sinov rasmi: oq fon, o'rtasida qizil to'rtburchak (= "hujjat"). */
function testJpeg(width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Hujjat: kadrning 10%–90% i
      const inside =
        x > width * 0.1 && x < width * 0.9 && y > height * 0.1 && y < height * 0.9;
      data[i] = inside ? 220 : 255;
      data[i + 1] = inside ? 30 : 255;
      data[i + 2] = inside ? 30 : 255;
      data[i + 3] = 255;
    }
  }
  const jpeg = encode({ data, width, height }, 92);
  return {
    bytes: new Uint8Array(jpeg.data) as Uint8Array<ArrayBuffer>,
    mime: "image/jpeg",
  };
}

test("haqiqiy JPEG chegara bo'yicha qirqiladi", () => {
  const image = testJpeg(1280, 960);
  const result = cropToDocument(image, box(100, 100, 900, 900), 0);

  assert.equal(result.cropped, true);
  const out = decode(result.bytes, { useTArray: true });
  assert.equal(out.width, Math.round(1280 * 0.8));
  assert.equal(out.height, Math.round(960 * 0.8));
});

test("qirqilgan rasmda hujjat qoladi, oq chetlari ketadi", () => {
  /** Rasmning necha foizi "hujjat" rangida (qizil). */
  const documentShare = (bytes: Uint8Array) => {
    const img = decode(bytes, { useTArray: true });
    let red = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] > 150 && img.data[i + 1] < 110) red++;
    }
    return red / (img.width * img.height);
  };

  const image = testJpeg(1200, 900);
  // Sinov rasmida hujjat kadrning 10%–90% ida, ya'ni ~64% maydonda
  const before = documentShare(image.bytes);
  assert.ok(before > 0.6 && before < 0.7, `sinov rasmi noto'g'ri: ${before}`);

  const result = cropToDocument(image, box(100, 100, 900, 900), 0);
  assert.equal(result.cropped, true);

  const after = documentShare(result.bytes);
  assert.ok(
    after > 0.95,
    `qirqilgandan keyin deyarli butun kadr hujjat bo'lishi kerak: ${after}`,
  );
});

test("chegara yo'q bo'lsa rasm asl holida qoladi", () => {
  const image = testJpeg(800, 600);
  const result = cropToDocument(image, null, 2);
  assert.equal(result.cropped, false);
  assert.equal(result.bytes, image.bytes, "aynan o'sha baytlar qaytishi kerak");
});

test("ishonchsiz chegarada rasm qirqilmaydi", () => {
  const image = testJpeg(800, 600);
  // Hujjatdagi surat o'lchamidagi chegara
  const result = cropToDocument(image, box(100, 200, 300, 500), 2);
  assert.equal(result.cropped, false);
  assert.equal(result.bytes, image.bytes);
});

test("JPEG bo'lmagan rasm qirqilmaydi", () => {
  // jpeg-js faqat JPEG biladi; PNG asl holida saqlanadi
  const image = {
    bytes: new Uint8Array([137, 80, 78, 71]) as Uint8Array<ArrayBuffer>,
    mime: "image/png",
  };
  const result = cropToDocument(image, box(100, 100, 900, 900), 2);
  assert.equal(result.cropped, false);
});

test("buzuq JPEG xato tashlamaydi — rasm saqlanadi", () => {
  const image = {
    bytes: new Uint8Array([255, 216, 255, 0, 1, 2, 3]) as Uint8Array<ArrayBuffer>,
    mime: "image/jpeg",
  };
  const result = cropToDocument(image, box(100, 100, 900, 900), 2);
  assert.equal(result.cropped, false, "xato bo'lsa asl rasm qaytadi");
});

test("juda kichik natija qirqilmaydi — MRZ o'qilmay qoladi", () => {
  // 300x300 rasmning 30% i = 90px: MRZ bunda o'qilmaydi
  const image = testJpeg(300, 300);
  const result = cropToDocument(image, box(300, 300, 650, 650), 0);
  assert.equal(result.cropped, false);
});

test("chetiga bo'sh joy qo'shilgani natijada ko'rinadi", () => {
  const image = testJpeg(1000, 1000);
  const tight = cropToDocument(image, box(200, 200, 800, 800), 0);
  const padded = cropToDocument(image, box(200, 200, 800, 800), 5);

  const a = decode(tight.bytes, { useTArray: true });
  const b = decode(padded.bytes, { useTArray: true });
  assert.equal(a.width, 600);
  assert.equal(b.width, 700, "har tomondan 5% (50px) qo'shilishi kerak");
});

// --- Burish ---
//
// Telefonni yonboshlab olsa, arxivdagi pasport ham yonboshlab turardi.
// Konsullikka bunday yuklash noqulay.

test("burilish darajasi faqat 0/90/180/270 bo'ladi", () => {
  assert.equal(parseRotation(0), 0);
  assert.equal(parseRotation(90), 90);
  assert.equal(parseRotation(180), 180);
  assert.equal(parseRotation(270), 270);
});

test("oraliq va g'alati burchaklar to'g'rilanadi", () => {
  // 87° — model aniq o'lchamaydi, eng yaqin chorakka yaxlitlanadi
  assert.equal(parseRotation(87), 90);
  assert.equal(parseRotation(-90), 270, "manfiy ham to'g'ri o'qiladi");
  assert.equal(parseRotation(450), 90, "360 dan oshgani ham");
  assert.equal(parseRotation(360), 0);
  // Oraliq burchakka burish rasmni cho'zib, MRZ ni buzardi — rad etiladi
  assert.equal(parseRotation(45), 0, "45° ikki tomonga teng — burmaymiz");
});

test("yaroqsiz burilish 0 bo'ladi", () => {
  assert.equal(parseRotation(null), 0);
  assert.equal(parseRotation("yonboshlagan"), 0);
  assert.equal(parseRotation(undefined), 0);
  assert.equal(parseRotation(NaN), 0);
});

/** Chap yuqori burchagi qora, qolgani oq — burilishni ko'rish uchun. */
function cornerMarked(width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Chap yuqori chorak — qora belgi
      const mark = x < width * 0.25 && y < height * 0.25;
      data[i] = mark ? 10 : 250;
      data[i + 1] = mark ? 10 : 250;
      data[i + 2] = mark ? 10 : 250;
      data[i + 3] = 255;
    }
  }
  const jpeg = encode({ data, width, height }, 95);
  return {
    bytes: new Uint8Array(jpeg.data) as Uint8Array<ArrayBuffer>,
    mime: "image/jpeg",
  };
}

/** Rasmning to'rt burchagidagi rang (o'rtachasi, JPEG shovqinisiz). */
function corners(bytes: Uint8Array) {
  const img = decode(bytes, { useTArray: true });
  const at = (x: number, y: number) => img.data[(y * img.width + x) * 4];
  const inset = 8;
  return {
    width: img.width,
    height: img.height,
    topLeft: at(inset, inset),
    topRight: at(img.width - 1 - inset, inset),
    bottomRight: at(img.width - 1 - inset, img.height - 1 - inset),
    bottomLeft: at(inset, img.height - 1 - inset),
  };
}

test("90° ga burilganda belgi chapdan o'ngga o'tadi", () => {
  const image = cornerMarked(800, 400);
  const result = cropToDocument(image, null, 0, 90);

  assert.equal(result.turned, 90);
  assert.equal(result.cropped, false, "faqat burildi, qirqilmadi");

  const c = corners(result.bytes);
  assert.equal(c.width, 400, "soat yo'nalishida burilganda o'lcham almashadi");
  assert.equal(c.height, 800);
  assert.ok(c.topRight < 100, `belgi o'ng yuqorida bo'lishi kerak: ${c.topRight}`);
  assert.ok(c.topLeft > 200, "chap yuqori endi oq");
});

test("180° ga burilganda belgi qarshi burchakka o'tadi", () => {
  const image = cornerMarked(600, 600);
  const result = cropToDocument(image, null, 0, 180);

  const c = corners(result.bytes);
  assert.equal(c.width, 600, "180° da o'lcham o'zgarmaydi");
  assert.ok(c.bottomRight < 100, `belgi o'ng pastda: ${c.bottomRight}`);
  assert.ok(c.topLeft > 200);
});

test("270° ga burilganda belgi pastga o'tadi", () => {
  const image = cornerMarked(800, 400);
  const result = cropToDocument(image, null, 0, 270);

  const c = corners(result.bytes);
  assert.equal(c.width, 400);
  assert.ok(c.bottomLeft < 100, `belgi chap pastda: ${c.bottomLeft}`);
  assert.ok(c.topLeft > 200);
});

test("burish 0 bo'lsa va qirqish ham bo'lmasa rasmga tegilmaydi", () => {
  const image = cornerMarked(400, 400);
  const result = cropToDocument(image, null, 0, 0);
  assert.equal(result.bytes, image.bytes, "qayta siqilmasligi kerak");
  assert.equal(result.turned, 0);
  assert.equal(result.cropped, false);
});

test("qirqish va burish birga — rasm BIR MARTA qayta siqiladi", () => {
  const image = cornerMarked(1000, 1000);
  const result = cropToDocument(image, { x0: 100, y0: 100, x1: 900, y1: 900 }, 0, 90);

  assert.equal(result.cropped, true);
  assert.equal(result.turned, 90);
  const c = corners(result.bytes);
  // 800x800 qirqildi, keyin burildi — kvadrat bo'lgani uchun o'lcham bir xil
  assert.equal(c.width, 800);
  assert.equal(c.height, 800);
});

test("burilgan JPEG bo'lmasa, burilmaydi ham", () => {
  const image = {
    bytes: new Uint8Array([137, 80, 78, 71]) as Uint8Array<ArrayBuffer>,
    mime: "image/png",
  };
  const result = cropToDocument(image, null, 0, 90);
  assert.equal(result.turned, 0);
  assert.equal(result.bytes, image.bytes);
});
