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
  findDocument,
  parseQuad,
  quadPlausible,
  homography,
  type Box,
  type Quad,
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

test("kichik chegara shakl bo'yicha o'tadi — qaror piksellarda bo'ladi", () => {
  // Uzoqdan olingan rasmda hujjat kadrning 6 foizi bo'lishi mumkin,
  // shuning uchun shakl tekshiruvi bunday chegarani rad etmaydi.
  // Hujjatdagi SURAT ham shu o'lchamda bo'ladi — ikkisini ajratish
  // `cropToDocument` ichida, piksellar bo'yicha hal qilinadi
  // (pastdagi "surat chegarasi" va "uzoqdan olingan" testlari).
  assert.equal(plausible(box(100, 200, 300, 500)), true);
});

test("juda kichik chegara baribir rad etiladi", () => {
  // Kadrning 1 foizidan kichigi — hujjat emas
  assert.equal(plausible(box(100, 100, 180, 160)), false);
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

test("faqat MRZ tasmasi (yassi chegara) rad etiladi", () => {
  // Keng va juda past — hujjat shunday bo'lmaydi. Qirqilsa, arxivda
  // pasport o'rniga faqat ikki qator qolardi
  assert.equal(plausible(box(50, 850, 950, 950)), false);
  // Ingichka ustun ham
  assert.equal(plausible(box(450, 50, 550, 950)), false);
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

/**
 * Sinov rasmi: oq fon, ichida "hujjat" (qizil to'rtburchak).
 * `doc` — hujjatning kadrdagi o'rni, 0–1 ulushda.
 */
function docJpeg(
  width: number,
  height: number,
  doc = { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 },
  /** Fon: oq stol (standart) yoki to'q stol */
  back: [number, number, number] = [255, 255, 255],
) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inside =
        x > width * doc.x0 &&
        x < width * doc.x1 &&
        y > height * doc.y0 &&
        y < height * doc.y1;
      data[i] = inside ? 220 : back[0];
      data[i + 1] = inside ? 30 : back[1];
      data[i + 2] = inside ? 30 : back[2];
      data[i + 3] = 255;
    }
  }
  const jpeg = encode({ data, width, height }, 92);
  return {
    bytes: new Uint8Array(jpeg.data) as Uint8Array<ArrayBuffer>,
    mime: "image/jpeg",
  };
}

/** Eski testlar uchun: hujjat kadrning 10%–90% ida. */
function testJpeg(width: number, height: number) {
  return docJpeg(width, height);
}

/** Rasmning necha ulushi "hujjat" rangida (qizil). */
function documentShare(bytes: Uint8Array): number {
  const img = decode(bytes, { useTArray: true });
  let red = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] > 150 && img.data[i + 1] < 110) red++;
  }
  return red / (img.width * img.height);
}

test("haqiqiy JPEG chegara bo'yicha qirqiladi", () => {
  const image = testJpeg(1280, 960);
  const result = cropToDocument(image, { box: box(100, 100, 900, 900), marginPct: 0 });

  assert.equal(result.cropped, true);
  const out = decode(result.bytes, { useTArray: true });
  // Chegara piksellar bo'yicha bir-ikki piksel aniqlashtiriladi
  // (sinov rasmida hujjat 10%–90% da), shuning uchun 1% dan kichik farq
  // kutiladi — muhimi mazmun, keyingi testda tekshiriladi
  assert.ok(
    Math.abs(out.width - 1280 * 0.8) < 1280 * 0.01,
    `kenglik ~1024 bo'lishi kerak: ${out.width}`,
  );
  assert.ok(
    Math.abs(out.height - 960 * 0.8) < 960 * 0.01,
    `bo'yi ~768 bo'lishi kerak: ${out.height}`,
  );
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

  const result = cropToDocument(image, { box: box(100, 100, 900, 900), marginPct: 0 });
  assert.equal(result.cropped, true);

  const after = documentShare(result.bytes);
  assert.ok(
    after > 0.95,
    `qirqilgandan keyin deyarli butun kadr hujjat bo'lishi kerak: ${after}`,
  );
});

test("chegara yo'q bo'lsa rasm asl holida qoladi", () => {
  const image = testJpeg(800, 600);
  const result = cropToDocument(image, { marginPct: 2 });
  assert.equal(result.cropped, false);
  assert.equal(result.bytes, image.bytes, "aynan o'sha baytlar qaytishi kerak");
});

test("hujjat ichidagi kichik chegara hujjatni kesmaydi", () => {
  // Hujjatdagi surat o'lchamidagi chegara. Ikki to'g'ri javob bor:
  // qirqmaslik yoki hujjatning BUTUNINI qirqish — bo'lagini emas
  const image = testJpeg(800, 600);
  const result = cropToDocument(image, { box: box(100, 200, 300, 500), marginPct: 2 });

  if (!result.cropped) {
    assert.equal(result.bytes, image.bytes, "tegilmasa aynan o'sha baytlar");
    return;
  }
  const out = decode(result.bytes, { useTArray: true });
  // Hujjat 640×480 piksel (kadrning 10%–90% i)
  assert.ok(
    out.width > 600 && out.height > 450,
    `hujjatning bo'lagi emas, butuni qolishi kerak: ${out.width}×${out.height}`,
  );
});

test("JPEG bo'lmagan rasm qirqilmaydi", () => {
  // jpeg-js faqat JPEG biladi; PNG asl holida saqlanadi
  const image = {
    bytes: new Uint8Array([137, 80, 78, 71]) as Uint8Array<ArrayBuffer>,
    mime: "image/png",
  };
  const result = cropToDocument(image, { box: box(100, 100, 900, 900), marginPct: 2 });
  assert.equal(result.cropped, false);
});

test("buzuq JPEG xato tashlamaydi — rasm saqlanadi", () => {
  const image = {
    bytes: new Uint8Array([255, 216, 255, 0, 1, 2, 3]) as Uint8Array<ArrayBuffer>,
    mime: "image/jpeg",
  };
  const result = cropToDocument(image, { box: box(100, 100, 900, 900), marginPct: 2 });
  assert.equal(result.cropped, false, "xato bo'lsa asl rasm qaytadi");
});

test("juda kichik natija qirqilmaydi — MRZ o'qilmay qoladi", () => {
  // Kichik rasmda kichik hujjat: qirqilsa 60px chiqadi, bunda MRZ ni
  // na odam, na model o'qiydi — asl rasm qolgani yaxshiroq
  const image = docJpeg(300, 300, { x0: 0.3, y0: 0.35, x1: 0.5, y1: 0.5 });
  const result = cropToDocument(image, {
    box: box(300, 350, 500, 500),
    marginPct: 0,
  });
  assert.equal(result.cropped, false);
  assert.equal(result.mode, "none");
});

test("chetiga bo'sh joy qo'shilgani natijada ko'rinadi", () => {
  // Hujjat aynan chegara joyida: 20%–80%. (Chegara hujjat ICHIDA bo'lsa,
  // aniqlashtirish uni hujjat chetigacha kengaytiradi — bu alohida testda.)
  const image = docJpeg(1000, 1000, { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 });
  const tight = cropToDocument(image, { box: box(200, 200, 800, 800), marginPct: 0 });
  const padded = cropToDocument(image, { box: box(200, 200, 800, 800), marginPct: 5 });

  const a = decode(tight.bytes, { useTArray: true });
  const b = decode(padded.bytes, { useTArray: true });
  assert.ok(Math.abs(a.width - 600) <= 10, `ixcham: ${a.width}`);
  // Bo'sh joy HUJJAT o'lchamiga nisbatan: 600px ning 5% i = har
  // tomondan 30px (kadrga nisbatan bo'lsa, uzoqdan olingan rasmda
  // chet hujjatning chorakiga teng bo'lib ketardi)
  assert.ok(
    Math.abs(b.width - a.width - 60) <= 12,
    `har tomondan 5% (30px) qo'shilishi kerak: ${a.width} → ${b.width}`,
  );
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
  const result = cropToDocument(image, { marginPct: 0, rotation: 90 });

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
  const result = cropToDocument(image, { marginPct: 0, rotation: 180 });

  const c = corners(result.bytes);
  assert.equal(c.width, 600, "180° da o'lcham o'zgarmaydi");
  assert.ok(c.bottomRight < 100, `belgi o'ng pastda: ${c.bottomRight}`);
  assert.ok(c.topLeft > 200);
});

test("270° ga burilganda belgi pastga o'tadi", () => {
  const image = cornerMarked(800, 400);
  const result = cropToDocument(image, { marginPct: 0, rotation: 270 });

  const c = corners(result.bytes);
  assert.equal(c.width, 400);
  assert.ok(c.bottomLeft < 100, `belgi chap pastda: ${c.bottomLeft}`);
  assert.ok(c.topLeft > 200);
});

test("burish 0 bo'lsa va qirqish ham bo'lmasa rasmga tegilmaydi", () => {
  const image = cornerMarked(400, 400);
  const result = cropToDocument(image, { marginPct: 0 });
  assert.equal(result.bytes, image.bytes, "qayta siqilmasligi kerak");
  assert.equal(result.turned, 0);
  assert.equal(result.cropped, false);
});

test("qirqish va burish birga — rasm BIR MARTA qayta siqiladi", () => {
  // Hujjat kadrning 10%–90% ida, uning chap-yuqori chorakida qora belgi.
  // Qirqilgandan keyin burilsa, belgi O'NG-YUQORIGA o'tishi kerak —
  // ya'ni ikkisi to'g'ri tartibda bajarilgan
  const width = 1000;
  const height = 1000;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inDoc =
        x > width * 0.1 && x < width * 0.9 && y > height * 0.1 && y < height * 0.9;
      const mark = inDoc && x < width * 0.4 && y < height * 0.4;
      const value = mark ? 10 : inDoc ? 250 : 70;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  const image = {
    bytes: new Uint8Array(encode({ data, width, height }, 95).data) as Uint8Array<ArrayBuffer>,
    mime: "image/jpeg",
  };

  const result = cropToDocument(image, {
    box: { x0: 100, y0: 100, x1: 900, y1: 900 },
    marginPct: 0,
    rotation: 90,
  });

  assert.equal(result.cropped, true);
  assert.equal(result.turned, 90);
  const c = corners(result.bytes);
  // ~800×800 qirqildi, keyin burildi (kvadrat — o'lcham bir xil)
  assert.ok(Math.abs(c.width - 800) <= 12, `kenglik: ${c.width}`);
  assert.ok(Math.abs(c.height - 800) <= 12, `bo'yi: ${c.height}`);
  assert.ok(c.topRight < 90, `belgi o'ng-yuqorida bo'lishi kerak: ${c.topRight}`);
  assert.ok(c.topLeft > 160, `chap-yuqori oqarishi kerak: ${c.topLeft}`);
});

test("burilgan JPEG bo'lmasa, burilmaydi ham", () => {
  const image = {
    bytes: new Uint8Array([137, 80, 78, 71]) as Uint8Array<ArrayBuffer>,
    mime: "image/png",
  };
  const result = cropToDocument(image, { marginPct: 0, rotation: 90 });
  assert.equal(result.turned, 0);
  assert.equal(result.bytes, image.bytes);
});

// ───────────────────────── to'rt burchak (perspektiva) ─────────────────────────
//
// Xodim pasportni QO'LIDA ushlab, naridan suratga oladi: kadrda hujjat
// to'rtburchak emas, trapetsiya bo'lib ko'rinadi. Shu burchaklar bo'yicha
// rasm skanerdek tekis holatga keltiriladi.

test("to'rt burchak [y,x] tartibida o'qiladi", () => {
  const quad = parseQuad([
    [100, 200],
    [120, 800],
    [850, 820],
    [870, 180],
  ]);
  assert.ok(quad);
  assert.deepEqual(quad![0], { x: 200, y: 100 });
  assert.deepEqual(quad![2], { x: 820, y: 850 });
});

test("yaroqsiz burchaklar null bo'ladi", () => {
  assert.equal(parseQuad(null), null);
  assert.equal(parseQuad([[1, 2], [3, 4], [5, 6]]), null, "4 ta nuqta kerak");
  assert.equal(parseQuad([[1, 2], [3, 4], [5, 6], [7]]), null);
  assert.equal(parseQuad([[1, 2], [3, 4], [5, 6], ["a", 8]]), null);
  // Kadrdan uzoqda — model adashgan, taxmin qilmaymiz
  assert.equal(parseQuad([[0, 0], [0, 1000], [5000, 1000], [1000, 0]]), null);
});

/** Soat yo'nalishida: chap-yuqori → o'ng-yuqori → o'ng-past → chap-past */
const quad = (pts: [number, number][]): Quad =>
  pts.map(([x, y]) => ({ x, y })) as Quad;

test("odatdagi qiyshiq hujjat burchaklari qabul qilinadi", () => {
  // Qo'lda ushlangan pasport: yuqori tomoni kamroq, past tomoni kengroq
  assert.equal(
    quadPlausible(
      quad([
        [200, 150],
        [800, 190],
        [850, 650],
        [150, 620],
      ]),
    ),
    true,
  );
});

test("teskari tartibdagi burchaklar rad etiladi — rasm ko'zguga tushardi", () => {
  // Soat yo'nalishiga TESKARI: natija ko'zgudagidek chiqardi va xodim
  // buni sezmasligi mumkin — shuning uchun qirqmaymiz
  assert.equal(
    quadPlausible(
      quad([
        [200, 150],
        [150, 620],
        [850, 650],
        [800, 190],
      ]),
    ),
    false,
  );
});

test("hujjatdagi surat shaklidagi to'rtburchak rad etiladi", () => {
  // Surat bo'yi balandroq: to'g'rilangan natija "tik" bo'lib chiqardi,
  // hujjat esa har doim keng (125×88 mm yoki 85.6×54 mm)
  assert.equal(
    quadPlausible(
      quad([
        [300, 200],
        [500, 200],
        [500, 600],
        [300, 600],
      ]),
    ),
    false,
  );
});

test("qavariq bo'lmagan va o'ta qiyshiq to'rtburchak rad etiladi", () => {
  // Botiq (bir burchagi ichkariga kirgan) — hujjat qattiq, bunday bo'lmaydi
  assert.equal(
    quadPlausible(
      quad([
        [100, 100],
        [900, 100],
        [500, 400],
        [100, 700],
      ]),
    ),
    false,
  );
  // Burchagi 90° dan juda uzoq (deyarli yassi)
  assert.equal(
    quadPlausible(
      quad([
        [100, 400],
        [900, 100],
        [900, 150],
        [100, 450],
      ]),
    ),
    false,
  );
});

test("proyektiv almashtirish burchaklarni aynan joyiga qo'yadi", () => {
  // Matematikaning o'zi: natijaning to'rt burchagi manbadagi to'rt
  // burchakka tushishi kerak, aks holda rasm siljib chiqadi
  const src = [
    { x: 120, y: 90 },
    { x: 880, y: 140 },
    { x: 910, y: 640 },
    { x: 80, y: 600 },
  ];
  const h = homography({ w: 400, h: 300 }, src);
  assert.ok(h, "yechim bo'lishi kerak");

  const map = (u: number, v: number) => {
    const [a, b, c, d, e, f, g, i] = h!;
    const denom = g * u + i * v + 1;
    return { x: (a * u + b * v + c) / denom, y: (d * u + e * v + f) / denom };
  };

  const corners = [
    [0, 0],
    [400, 0],
    [400, 300],
    [0, 300],
  ] as const;
  corners.forEach(([u, v], index) => {
    const got = map(u, v);
    assert.ok(
      Math.abs(got.x - src[index].x) < 0.01 && Math.abs(got.y - src[index].y) < 0.01,
      `${index}-burchak: ${JSON.stringify(got)} ≠ ${JSON.stringify(src[index])}`,
    );
  });
});

/**
 * Qiyshiq turgan "hujjat" rasmi: to'rtburchak ichi qizil, yuqori chetida
 * oq tasma (= yozuv tomoni), pastida qora tasma (= MRZ). Tasmalar
 * bo'yicha natijaning TO'G'RI tomoni yuqoridami, shuni tekshiramiz.
 */
function skewedJpeg(width: number, height: number, corners: Quad) {
  const data = new Uint8Array(width * height * 4);
  const px = corners.map((p) => ({
    x: (p.x / 1000) * width,
    y: (p.y / 1000) * height,
  }));

  /** Nuqta qavariq to'rtburchak ichidami (hamma tomoni bir yo'nalishda) */
  const inside = (x: number, y: number) => {
    for (let i = 0; i < 4; i++) {
      const a = px[i];
      const b = px[(i + 1) % 4];
      if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
    }
    return true;
  };

  /** Nuqtaning hujjat bo'ylab qanchaga tushgani (0 — yuqori, 1 — past) */
  const depth = (x: number, y: number) => {
    const top = (px[0].y + px[1].y) / 2;
    const bottom = (px[2].y + px[3].y) / 2;
    return (y - top) / (bottom - top);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!inside(x + 0.5, y + 0.5)) {
        // Fon: to'q kulrang stol
        data[i] = 70;
        data[i + 1] = 72;
        data[i + 2] = 75;
        data[i + 3] = 255;
        continue;
      }
      const d = depth(x + 0.5, y + 0.5);
      const band = d < 0.15 ? "top" : d > 0.85 ? "mrz" : "body";
      data[i] = band === "top" ? 250 : band === "mrz" ? 20 : 220;
      data[i + 1] = band === "top" ? 250 : band === "mrz" ? 20 : 30;
      data[i + 2] = band === "top" ? 250 : band === "mrz" ? 20 : 30;
      data[i + 3] = 255;
    }
  }

  const jpeg = encode({ data, width, height }, 92);
  return {
    bytes: new Uint8Array(jpeg.data) as Uint8Array<ArrayBuffer>,
    mime: "image/jpeg",
  };
}

test("qo'lda ushlangan qiyshiq pasport tekis holatga keltiriladi", () => {
  // Trapetsiya: yuqori tomoni torroq (narida), past tomoni kengroq (yaqinda)
  const corners = quad([
    [240, 160],
    [760, 210],
    [880, 760],
    [120, 700],
  ]);
  const image = skewedJpeg(1200, 900, corners);

  const result = cropToDocument(image, { quad: corners, marginPct: 0 });
  assert.equal(result.cropped, true);
  assert.equal(result.mode, "quad", "perspektiva usuli ishlashi kerak");

  const out = decode(result.bytes, { useTArray: true });

  // 1) Stol chiqib ketdi: natijada fon rangi deyarli qolmasin
  let background = 0;
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i] < 110 && out.data[i + 1] < 110 && out.data[i + 2] < 110) {
      // MRZ tasmasi ham qora — faqat yuqori yarmini hisoblaymiz
      const pixel = i / 4;
      if (Math.floor(pixel / out.width) < out.height * 0.8) background++;
    }
  }
  assert.ok(
    background / (out.width * out.height) < 0.02,
    `stol qolmasligi kerak: ${(background / (out.width * out.height)).toFixed(3)}`,
  );

  // 2) Hujjat TO'G'RI tomoni bilan: oq tasma yuqorida, MRZ pastda
  const rowBrightness = (row: number) => {
    let sum = 0;
    for (let x = 0; x < out.width; x++) {
      sum += out.data[(row * out.width + x) * 4 + 1];
    }
    return sum / out.width;
  };
  assert.ok(
    rowBrightness(Math.round(out.height * 0.05)) > 180,
    "yuqori chetida oq tasma bo'lishi kerak",
  );
  assert.ok(
    rowBrightness(Math.round(out.height * 0.95)) < 90,
    "past chetida MRZ tasmasi bo'lishi kerak",
  );

  // 3) Tomonlar nisbati hujjatga o'xshash
  const ratio = out.width / out.height;
  assert.ok(ratio > 1.05 && ratio < 2.6, `nisbat: ${ratio.toFixed(2)}`);
});

test("burchaklar ishonchsiz bo'lsa to'rtburchak usuliga qaytadi", () => {
  const image = testJpeg(1000, 800);
  // Teskari tartib — qabul qilinmaydi, lekin o'rami chegara bo'lib ishlaydi
  const bad = quad([
    [100, 100],
    [100, 900],
    [900, 900],
    [900, 100],
  ]);
  const result = cropToDocument(image, { quad: bad, marginPct: 0 });
  assert.equal(result.mode, "box", "zaxira usul ishlashi kerak");
  assert.ok(documentShare(result.bytes) > 0.95);
});

// ───────────────────────── qo'l, uzoqlik va chegarani aniqlashtirish ─────────────────────────

test("model chegarani kesib qo'ysa, hujjat chetigacha kengaytiriladi", () => {
  // Model hujjatning o'ng va past qismini tashlab ketgan
  const image = docJpeg(1000, 800, { x0: 0.1, y0: 0.15, x1: 0.9, y1: 0.85 });
  const result = cropToDocument(image, { box: box(100, 150, 600, 500), marginPct: 0 });

  assert.equal(result.cropped, true);
  const out = decode(result.bytes, { useTArray: true });
  // Hujjat 800×560 piksel; kesilgan chegara 500×280 edi
  assert.ok(out.width > 700, `kenglik hujjatgacha o'sishi kerak: ${out.width}`);
  assert.ok(out.height > 480, `bo'yi hujjatgacha o'sishi kerak: ${out.height}`);
  assert.ok(documentShare(result.bytes) > 0.93, "natijada deyarli faqat hujjat");
});

test("hujjat ICHIDAGI chegara (surat) hujjat chetigacha ochiladi", () => {
  // Model hujjat o'rniga undagi SURATNI ko'rsatgan — eng ko'p uchraydigan
  // xato. Avval bunday chegara shunchaki rad etilardi (rasm qirqilmasdi).
  // Endi chegara hujjatning haqiqiy chetigacha ochiladi: natijada
  // hujjatning YARMI emas, BUTUNI qoladi.
  const image = docJpeg(1200, 900, { x0: 0.12, y0: 0.15, x1: 0.88, y1: 0.85 });
  const result = cropToDocument(image, { box: box(450, 420, 560, 520), marginPct: 0 });

  if (result.cropped) {
    const out = decode(result.bytes, { useTArray: true });
    // Hujjat 912×630 piksel. Natija undan sezilarli kichik bo'lsa —
    // bu hujjatning bo'lagi, ya'ni eng xavfli holat
    assert.ok(
      out.width > 860 && out.height > 590,
      `hujjatning bo'lagi emas, butuni qolishi kerak: ${out.width}×${out.height}`,
    );
    assert.ok(documentShare(result.bytes) > 0.93);
  }
  // Qirqilmagani ham to'g'ri javob: hujjat cheti topilmasa tegilmaydi
});

test("qo'l hujjat chetini to'sib turgani qirqishni buzmaydi", () => {
  // Barmoq: hujjatning chap chetida, bo'yining 30 foizini to'sadi.
  // Qator bo'ylab ko'pchilik piksel baribir hujjat — shuning uchun
  // chegara barmoq joyidan kesilmasligi kerak
  const width = 1200;
  const height = 900;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inDoc =
        x > width * 0.15 && x < width * 0.85 && y > height * 0.2 && y < height * 0.8;
      // Barmoq: chap chetda, bo'yining 35%–65% i
      const inFinger =
        x > width * 0.12 &&
        x < width * 0.22 &&
        y > height * 0.35 &&
        y < height * 0.65;
      const [r, g, b] = inFinger
        ? [190, 140, 110] // teri rangi
        : inDoc
          ? [220, 30, 30]
          : [70, 72, 75];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const jpeg = encode({ data, width, height }, 92);
  const image = {
    bytes: new Uint8Array(jpeg.data) as Uint8Array<ArrayBuffer>,
    mime: "image/jpeg",
  };

  const result = cropToDocument(image, { box: box(150, 200, 850, 800), marginPct: 0 });
  assert.equal(result.cropped, true);
  const out = decode(result.bytes, { useTArray: true });
  // Hujjat 840×540: barmoq tufayli kenglik keskin kamaymasligi kerak
  assert.ok(out.width > 800, `barmoq hujjatni kesmasligi kerak: ${out.width}`);
});

test("uzoqdan olingan rasm ham qirqiladi va ogohlantiriladi", () => {
  // Hujjat kadrning ~10 foizi — eski kod bunday rasmni umuman
  // qirqmasdi, aynan eng kerakli holat chetda qolardi
  const image = docJpeg(1600, 1200, { x0: 0.35, y0: 0.4, x1: 0.68, y1: 0.63 });
  const result = cropToDocument(image, { box: box(350, 400, 680, 630), marginPct: 0 });

  assert.equal(result.cropped, true, "uzoqdan olingan rasm ham qirqilsin");
  assert.ok(documentShare(result.bytes) > 0.93);
  const out = decode(result.bytes, { useTArray: true });
  assert.ok(out.width < 600, `natija kichik bo'ladi: ${out.width}`);
  assert.equal(result.lowRes, true, "xodimga 'yaqinroq turib oling' deyilsin");
});

test("bir xil fonda (chegara ko'rinmasa) kichik chegara bilan qirqilmaydi", () => {
  // Kadr bir tekis: aytilgan joyda hech qanday narsa chegarasi yo'q,
  // ya'ni model adashgan. Ikki dalil qoidasi: qirqmaymiz
  const width = 1000;
  const height = 800;
  const data = new Uint8Array(width * height * 4).fill(200);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const jpeg = encode({ data, width, height }, 92);
  const image = {
    bytes: new Uint8Array(jpeg.data) as Uint8Array<ArrayBuffer>,
    mime: "image/jpeg",
  };

  const result = cropToDocument(image, { box: box(300, 300, 500, 450), marginPct: 0 });
  assert.equal(result.cropped, false);
});

// ───────────────────────── eng muhim da'vo ─────────────────────────
//
// "Hujjat hech qachon kesilmaydi" — butun qirqish kodining asosiy
// kafolati. Bitta-ikkita misol buni isbotlamaydi, shuning uchun ko'p
// holat tekshiriladi: hujjat kadrning turli joyida, turli o'lchamda,
// model chegarasi esa turlicha xato qilgan holda.

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Takrorlanadigan tasodif: har ishga tushirishda bir xil holatlar. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

test("hujjat hech qachon kesilmaydi (60 ta tasodifiy holat)", () => {
  const random = seeded(20261017);
  const width = 1200;
  const height = 900;
  let croppedCount = 0;
  // Qizil pasport oq stol ustida ham, to'q stol ustida ham sinaladi:
  // to'q stolda kulrang farq deyarli yo'q (87 va 72), rang farqi esa aniq
  const tables: [number, number, number][] = [
    [255, 255, 255],
    [70, 72, 75],
  ];

  for (let round = 0; round < 60; round++) {
    // Hujjat: kadrning 15%–80% i, tasodifiy joyda
    const docW = 0.15 + random() * 0.6;
    const docH = 0.15 + random() * 0.6;
    const docX = random() * (1 - docW);
    const docY = random() * (1 - docH);
    const doc = { x0: docX, y0: docY, x1: docX + docW, y1: docY + docH };
    const image = docJpeg(width, height, doc, tables[round % tables.length]);

    // Model chegarasi: hujjatdan ±12% ga xato qilgan (ba'zida ichkaridan
    // kesib, ba'zida stolni qo'shib)
    const err = () => (random() - 0.5) * 0.24;
    const guess = {
      x0: clamp01(doc.x0 + err()),
      y0: clamp01(doc.y0 + err()),
      x1: clamp01(doc.x1 + err()),
      y1: clamp01(doc.y1 + err()),
    };
    if (guess.x1 - guess.x0 < 0.05 || guess.y1 - guess.y0 < 0.05) continue;

    const result = cropToDocument(image, {
      box: {
        x0: guess.x0 * 1000,
        y0: guess.y0 * 1000,
        x1: guess.x1 * 1000,
        y1: guess.y1 * 1000,
      },
      marginPct: 2,
    });

    if (!result.cropped) continue; // qirqmaslik — har doim xavfsiz javob
    croppedCount++;

    // Hujjatning HAMMA pikseli natijada qolishi kerak
    const out = decode(result.bytes, { useTArray: true });
    let red = 0;
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i] > 150 && out.data[i + 1] < 110) red++;
    }
    const truePixels =
      Math.round((doc.x1 - doc.x0) * width) * Math.round((doc.y1 - doc.y0) * height);
    assert.ok(
      red >= truePixels * 0.95,
      `${round}-holat: hujjatning bo'lagi kesildi — ${red} / ${truePixels} piksel ` +
        `(hujjat ${JSON.stringify(doc)}, chegara ${JSON.stringify(guess)})`,
    );
  }

  // Kod umuman qirqmaydigan bo'lib qolmaganiga ishonch
  assert.ok(croppedCount >= 40, `juda kam holat qirqildi: ${croppedCount} / 60`);
});

// ───────────────────────── borib-qaytish sinovi ─────────────────────────
//
// Eng ishonchli tekshiruv: MA'LUM naqshni qiyshaytirib kadrga joylaymiz,
// keyin to'g'rilab, asl naqsh bilan solishtiramiz. Agar perspektiva
// matematikasi xato bo'lsa, natija siljigan yoki cho'zilgan bo'ladi va
// bu darhol ko'rinadi.

/** Ma'lum naqsh: to'rt choragi har xil rangda, ustida chiziqlar. */
function pattern(w: number, h: number) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const left = x < w / 2;
      const top = y < h / 2;
      const stripe = Math.floor((y / h) * 12) % 2 === 0 && x > w * 0.55;
      const color = stripe
        ? [40, 40, 40]
        : top
          ? left
            ? [240, 60, 60]
            : [60, 200, 90]
          : left
            ? [70, 110, 240]
            : [245, 230, 140];
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  return { data, w, h };
}

test("qiyshaytirilgan naqsh to'g'rilangach asliga qaytadi", () => {
  const width = 1400;
  const height = 1050;
  const src = pattern(600, 420);

  // Hujjat kadrda shu to'rt burchakda turadi (qo'lda ushlangandek)
  const corners = quad([
    [240, 300],
    [700, 330],
    [760, 640],
    [180, 620],
  ]);
  const px = corners.map((p) => ({
    x: (p.x / 1000) * width,
    y: (p.y / 1000) * height,
  }));

  // Naqshni kadrga qiyshaytirib joylaymiz (ikki barobar namuna bilan,
  // teshik qolmasligi uchun)
  const frame = new Uint8Array(width * height * 4);
  for (let i = 0; i < frame.length; i += 4) {
    frame[i] = 72;
    frame[i + 1] = 74;
    frame[i + 2] = 78;
    frame[i + 3] = 255;
  }
  const h = homography({ w: src.w, h: src.h }, px);
  assert.ok(h);
  const [a, b, c, d, e, f, g, k] = h!;
  for (let v = 0; v < src.h * 2; v++) {
    for (let u = 0; u < src.w * 2; u++) {
      const uu = u / 2;
      const vv = v / 2;
      const denom = g * uu + k * vv + 1;
      const x = Math.round((a * uu + b * vv + c) / denom);
      const y = Math.round((d * uu + e * vv + f) / denom);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const from = (Math.floor(vv) * src.w + Math.floor(uu)) * 4;
      const to = (y * width + x) * 4;
      frame[to] = src.data[from];
      frame[to + 1] = src.data[from + 1];
      frame[to + 2] = src.data[from + 2];
      frame[to + 3] = 255;
    }
  }

  const image = {
    bytes: new Uint8Array(encode({ data: frame, width, height }, 95).data) as Uint8Array<ArrayBuffer>,
    mime: "image/jpeg",
  };

  // Chetsiz to'g'rilaymiz — asl naqsh bilan solishtirish uchun
  const result = cropToDocument(image, { quad: corners, marginPct: 0 });
  assert.equal(result.mode, "quad");
  const out = decode(result.bytes, { useTArray: true });

  // Asl naqsh bilan solishtiramiz: nisbiy nuqtalarda rang mos kelsinmi
  let checked = 0;
  let close = 0;
  for (let ry = 0.08; ry < 0.95; ry += 0.06) {
    for (let rx = 0.08; rx < 0.95; rx += 0.04) {
      const o = (Math.round(ry * (out.height - 1)) * out.width + Math.round(rx * (out.width - 1))) * 4;
      const s = (Math.round(ry * (src.h - 1)) * src.w + Math.round(rx * (src.w - 1))) * 4;
      const diff =
        Math.abs(out.data[o] - src.data[s]) +
        Math.abs(out.data[o + 1] - src.data[s + 1]) +
        Math.abs(out.data[o + 2] - src.data[s + 2]);
      checked++;
      if (diff < 150) close++;
    }
  }
  assert.ok(
    close / checked > 0.9,
    `naqsh asliga qaytmadi: ${close} / ${checked} nuqta mos keldi`,
  );
});

// ───────── Hujjatni O'ZIMIZ topish (model chegarani aytmaganda) ─────────
//
// Model "o'qiy olmadim" deganda chegarani ham tez-tez bermaydi — ya'ni
// yaqinlashtirish aynan eng kerakli holatda (hujjat kadrda kichik)
// ishlamasdi. Fon rangiga qarab hujjatni o'zimiz topamiz.

/**
 * Haqiqiyroq kadr: hujjatda surat, yozuv va MRZ tasmasi bor.
 *
 * Naqsh MUHIM: hujjatning ichi bir xil rangda emas. Avval markazdan
 * "o'stirish" usuli sinab ko'rilgan edi va u MRZ tasmasining o'zida
 * to'xtab qolardi — qora qatorlar qog'oz rangiga o'xshamaydi. Shuning
 * uchun bu testlarda hujjat ataylab naqshli.
 */
function documentScene(
  width: number,
  height: number,
  doc: Box,
  options: { finger?: boolean; gradient?: boolean; paper?: [number, number, number] } = {},
) {
  const paper = options.paper ?? [235, 232, 222];
  const data = new Uint8Array(width * height * 4);
  const dx0 = (doc.x0 / 1000) * width;
  const dx1 = (doc.x1 / 1000) * width;
  const dy0 = (doc.y0 / 1000) * height;
  const dy1 = (doc.y1 / 1000) * height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let color: [number, number, number];
      if (x >= dx0 && x < dx1 && y >= dy0 && y < dy1) {
        const ry = (y - dy0) / (dy1 - dy0);
        const rx = (x - dx0) / (dx1 - dx0);
        color = paper;
        if (ry > 0.82 && (x >> 1) % 3 === 0) color = [40, 40, 40]; // MRZ
        else if (rx < 0.3 && ry > 0.2 && ry < 0.7) color = [180, 165, 150]; // surat
        else if (ry > 0.25 && ry < 0.75 && (y >> 2) % 3 === 0 && rx > 0.35) {
          color = [90, 90, 95]; // yozuv
        }
      } else {
        const light = options.gradient ? Math.round(40 * (x / width)) : 0;
        color = [72 + light, 74 + light, 78 + light]; // stol
        if (
          options.finger &&
          x > width * 0.18 &&
          x < width * 0.3 &&
          y > height * 0.55 &&
          y < height * 0.75
        ) {
          color = [190, 140, 110]; // barmoq
        }
      }
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  return {
    bytes: new Uint8Array(encode({ data, width, height }, 88).data) as Uint8Array<ArrayBuffer>,
    mime: "image/jpeg",
  };
}

/** Topilgan chegara haqiqiysidan qancha uzoq (0–1000 shkalasida). */
function boxError(found: Box, want: Box): number {
  return Math.max(
    Math.abs(found.x0 - want.x0),
    Math.abs(found.x1 - want.x1),
    Math.abs(found.y0 - want.y0),
    Math.abs(found.y1 - want.y1),
  );
}

test("hujjat kadrda kichik bo'lsa ham topiladi", () => {
  const want: Box = { x0: 380, y0: 400, x1: 620, y1: 600 };
  const found = findDocument(documentScene(1280, 960, want));
  assert.ok(found, "topilishi kerak");
  assert.ok(boxError(found, want) < 40, `xato katta: ${JSON.stringify(found)}`);
});

test("MRZ tasmasi chegara ichida qoladi", () => {
  // ENG MUHIM: MRZ hujjatning eng pastida. Agar pastki chet MRZ'dan
  // yuqorida topilsa, qirqilgan rasmda MRZ bo'lmaydi va bot uni hech
  // qachon o'qiy olmaydi. Markazdan "o'stirish" usuli aynan shunday
  // xato qilardi (y1 671 o'rniga 608 chiqardi)
  const want: Box = { x0: 300, y0: 330, x1: 700, y1: 670 };
  const found = findDocument(documentScene(1280, 960, want));
  assert.ok(found, "topilishi kerak");
  assert.ok(
    found.y1 >= want.y1 - 15,
    `pastki chet MRZ'ni kesib qo'ydi: ${found.y1} < ${want.y1}`,
  );
});

test("barmoq va notekis yorug'lik xalaqit bermaydi", () => {
  const want: Box = { x0: 300, y0: 330, x1: 700, y1: 670 };
  const found = findDocument(
    documentScene(1280, 960, want, { finger: true, gradient: true }),
  );
  assert.ok(found, "topilishi kerak");
  assert.ok(boxError(found, want) < 60, `xato katta: ${JSON.stringify(found)}`);
});

test("qizil pasport to'q kulrang stolda topiladi", () => {
  // Kulrangga aylantirilsa qizil pasport (150,30,35) stoldan (70,72,75)
  // deyarli farq qilmaydi — shuning uchun RANG bo'yicha solishtiriladi
  const want: Box = { x0: 300, y0: 330, x1: 700, y1: 670 };
  const found = findDocument(
    documentScene(1280, 960, want, { paper: [150, 30, 35] }),
  );
  assert.ok(found, "topilishi kerak");
  assert.ok(boxError(found, want) < 40, `xato katta: ${JSON.stringify(found)}`);
});

test("hujjat yo'q bo'lsa — null (bo'sh joy qirqilmaydi)", () => {
  const width = 900;
  const height = 700;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 88;
    data[i + 1] = 90;
    data[i + 2] = 94;
    data[i + 3] = 255;
  }
  const bytes = new Uint8Array(encode({ data, width, height }, 92).data);
  assert.equal(
    findDocument({ bytes: bytes as Uint8Array<ArrayBuffer>, mime: "image/jpeg" }),
    null,
  );
});

test("hujjat kadrni to'ldirgan bo'lsa — null (qirqishdan foyda yo'q)", () => {
  const found = findDocument(
    documentScene(1280, 960, { x0: 5, y0: 5, x1: 995, y1: 995 }),
  );
  assert.equal(found, null);
});

test("hujjatga o'xshamagan shakl — null", () => {
  // Juda keng va past: bu hujjat emas (MRZ tasmasi yoki soya chizig'i)
  const found = findDocument(
    documentScene(1280, 960, { x0: 100, y0: 470, x1: 980, y1: 530 }),
  );
  assert.equal(found, null);
});

test("JPEG bo'lmagan rasm va buzuq bayt — null", () => {
  const junk = new Uint8Array([1, 2, 3, 4, 5]) as Uint8Array<ArrayBuffer>;
  assert.equal(findDocument({ bytes: junk, mime: "image/png" }), null);
  assert.equal(findDocument({ bytes: junk, mime: "image/jpeg" }), null);
});

test("topilgan chegara bilan qirqilgan rasmda MRZ joyi saqlanadi", () => {
  // Yo'lning oxirigacha: topish → qirqish → natijada MRZ bormi.
  // Qirqilgan rasmning pastki qismida qora qatorlar bo'lishi kerak
  const want: Box = { x0: 330, y0: 350, x1: 670, y1: 650 };
  const image = documentScene(1280, 960, want);
  const found = findDocument(image);
  assert.ok(found);

  const cut = cropToDocument(image, { box: found, marginPct: 6 });
  assert.equal(cut.cropped, true, "qirqilishi kerak");

  const out = decode(cut.bytes, { useTArray: true, formatAsRGBA: true });
  assert.ok(out.width < 1280 * 0.45, `yaqinlashmadi: ${out.width}`);

  // Pastki 25% da qora piksellar (MRZ) bormi
  let dark = 0;
  for (let y = Math.floor(out.height * 0.75); y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const i = (y * out.width + x) * 4;
      if (out.data[i] < 90 && out.data[i + 1] < 90) dark++;
    }
  }
  assert.ok(dark > out.width * 2, `qirqilgan rasmda MRZ qolmadi: ${dark} piksel`);
});
