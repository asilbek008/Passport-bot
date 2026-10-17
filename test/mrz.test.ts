import test from "node:test";
import assert from "node:assert/strict";
import {
  checkDigit,
  parseNames,
  parseDate,
  parseMrz,
  failedFields,
  monthsUntilExpiry,
  MrzError,
} from "../src/mrz.ts";

/** 44 belgiga to'ldirish (MRZ qatori aniq uzunlikda bo'lishi shart) */
const pad = (s: string, n: number) => s + "<".repeat(n - s.length);

// ICAO 9303 hujjatidagi rasmiy namuna (TD3, biometrik pasport)
const TD3_L1 = pad("P<UTOERIKSSON<<ANNA<MARIA", 44);
const TD3_L2 = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";

// ICAO 9303 namunasi (TD1, ID karta)
const TD1 = [
  pad("I<UTOD231458907", 30),
  "7408122F1204159UTO<<<<<<<<<<<6",
  pad("ERIKSSON<<ANNA<MARIA", 30),
];

const REF = new Date("2026-09-29T00:00:00Z");

test("checkDigit ICAO og'irliklarini to'g'ri qo'llaydi", () => {
  assert.equal(checkDigit("L898902C3"), "6");
  assert.equal(checkDigit("740812"), "2");
  assert.equal(checkDigit("120415"), "9");
  assert.equal(checkDigit("ZE184226B<<<<<"), "1");
  // Noto'g'ri belgi -> tekshirib bo'lmaydi
  assert.equal(checkDigit("ABC*123"), null);
});

test("parseNames familiya va ismni ajratadi", () => {
  assert.deepEqual(parseNames("ERIKSSON<<ANNA<MARIA<<<<"), {
    surname: "ERIKSSON",
    givenNames: "ANNA MARIA",
  });
  // Uzbekcha ko'p so'zli familiya
  assert.deepEqual(parseNames("BOYQOBILOV<<ASILBEK<AKMAL<O<G<LI<<"), {
    surname: "BOYQOBILOV",
    givenNames: "ASILBEK AKMAL O G LI",
  });
  // '<<' bo'lmasa — hammasi familiya
  assert.deepEqual(parseNames("KARIMOV"), { surname: "KARIMOV", givenNames: "" });
});

test("parseDate asrni to'g'ri tanlaydi", () => {
  // Tug'ilgan sana kelajakda bo'lolmaydi
  assert.equal(parseDate("900115", "birth", REF), "1990-01-15");
  assert.equal(parseDate("101231", "birth", REF), "2010-12-31");
  assert.equal(parseDate("260101", "birth", REF), "2026-01-01");
  assert.equal(parseDate("270101", "birth", REF), "1927-01-01"); // 2027 hali kelmagan
  // Amal muddati — hozirgi yildan ±30 yil
  assert.equal(parseDate("300615", "expiry", REF), "2030-06-15");
  assert.equal(parseDate("970615", "expiry", REF), "1997-06-15");
  // Mavjud bo'lmagan sanalar rad etiladi (taxmin qilinmaydi)
  assert.equal(parseDate("900230", "birth", REF), null); // 30-fevral
  assert.equal(parseDate("901301", "birth", REF), null); // 13-oy
  assert.equal(parseDate("9001", "birth", REF), null); // qisqa
  assert.equal(parseDate("90O115", "birth", REF), null); // raqam emas
});

test("TD3 pasport to'liq o'qiladi va tekshiruvdan o'tadi", () => {
  const mrz = parseMrz(`${TD3_L1}\n${TD3_L2}`, REF);
  assert.equal(mrz.format, "TD3");
  assert.equal(mrz.documentCode, "P");
  assert.equal(mrz.issuingState, "UTO");
  assert.equal(mrz.surname, "ERIKSSON");
  assert.equal(mrz.givenNames, "ANNA MARIA");
  assert.equal(mrz.documentNumber, "L898902C3");
  assert.equal(mrz.nationality, "UTO");
  assert.equal(mrz.birthDate, "1974-08-12");
  assert.equal(mrz.sex, "F");
  assert.equal(mrz.expiryDate, "2012-04-15");
  assert.equal(mrz.personalNumber, "ZE184226B");
  assert.equal(mrz.valid, true, `tekshiruvdan o'tmadi: ${failedFields(mrz).join(", ")}`);
  assert.deepEqual(failedFields(mrz), []);
});

test("TD1 ID karta to'liq o'qiladi va tekshiruvdan o'tadi", () => {
  const mrz = parseMrz(TD1.join("\n"), REF);
  assert.equal(mrz.format, "TD1");
  assert.equal(mrz.surname, "ERIKSSON");
  assert.equal(mrz.givenNames, "ANNA MARIA");
  assert.equal(mrz.documentNumber, "D23145890");
  assert.equal(mrz.nationality, "UTO");
  assert.equal(mrz.birthDate, "1974-08-12");
  assert.equal(mrz.sex, "F");
  assert.equal(mrz.expiryDate, "2012-04-15");
  assert.equal(mrz.valid, true, `tekshiruvdan o'tmadi: ${failedFields(mrz).join(", ")}`);
});

test("OCR xatosi tekshiruv raqami bilan ANIQLANADI", () => {
  // Pasport raqamidagi bitta belgi buzilgan: C3 -> C8
  const broken = TD3_L2.replace("L898902C36", "L898902C86");
  const mrz = parseMrz(`${TD3_L1}\n${broken}`, REF);
  assert.equal(mrz.checks.documentNumber, false);
  assert.equal(mrz.valid, false);
  assert.ok(failedFields(mrz).includes("hujjat raqami"));
});

test("tug'ilgan sanadagi xato ham aniqlanadi", () => {
  const broken = TD3_L2.replace("7408122", "7408132");
  const mrz = parseMrz(`${TD3_L1}\n${broken}`, REF);
  assert.equal(mrz.checks.birthDate, false);
  assert.equal(mrz.valid, false);
});

test("MRZ atrofidagi keraksiz matn tashlab yuboriladi", () => {
  const noisy = [
    "O'ZBEKISTON RESPUBLIKASI",
    "PASSPORT / PASPORT",
    TD3_L1,
    TD3_L2,
    "",
  ].join("\n");
  const mrz = parseMrz(noisy, REF);
  assert.equal(mrz.valid, true);
  assert.equal(mrz.documentNumber, "L898902C3");
});

test("MRZ bo'lmasa xato tashlanadi — taxmin qilinmaydi", () => {
  assert.throws(() => parseMrz("shunchaki matn", REF), MrzError);
  assert.throws(() => parseMrz("", REF), MrzError);
  // Bitta qator yetarli emas
  assert.throws(() => parseMrz(TD3_L1, REF), MrzError);
});

test("bo'sh shaxsiy raqam maydoni xato hisoblanmaydi", () => {
  // 14 ta '<' + tekshiruv raqami '0'
  const l2 = "L898902C36UTO7408122F1204159" + "<".repeat(14) + "0";
  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);
  const fixed = l2 + checkDigit(composite);
  const mrz = parseMrz(`${TD3_L1}\n${fixed}`, REF);
  assert.equal(mrz.personalNumber, "");
  assert.equal(mrz.checks.personalNumber, null);
  assert.equal(mrz.valid, true, failedFields(mrz).join(", "));
});

test("monthsUntilExpiry vizaga yetadimi-yo'qmi hisoblaydi", () => {
  const l2 = TD3_L2.replace("1204159", "2804152"); // 2028-04-15
  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);
  const fixed = l2.slice(0, 43) + checkDigit(composite);
  const mrz = parseMrz(`${TD3_L1}\n${fixed}`, REF);
  assert.equal(mrz.expiryDate, "2028-04-15");
  const months = monthsUntilExpiry(mrz, REF)!;
  assert.ok(months > 18 && months < 20, `kutilmagan qiymat: ${months}`);
  // Muddati o'tgan pasport — manfiy
  const old = parseMrz(`${TD3_L1}\n${TD3_L2}`, REF);
  assert.ok(monthsUntilExpiry(old, REF)! < 0);
});

// ───────────────── ID karta (TD1) va modelning to'ldiruvchi xatosi ─────────────────
//
// Modellar '<' larning SONINI tez-tez adashadi — ID kartada ular uzun
// qator bo'lib ketgani uchun ayniqsa. Avval bunday qator butunlay
// tashlab yuborilardi va xodim "MRZ o'qilmadi" degan javob olardi,
// holbuki hujjat ko'rinib turardi.

/** O'zbekiston ID kartasi ko'rinishidagi TD1 MRZ. */
function uzbekId(): string[] {
  const doc = "AB1234567";
  const pinfl = "31234567890123"; // JSHSHIR
  const l1 = `IDUZB${doc}${checkDigit(doc)}${pinfl}`.padEnd(30, "<");
  const birth = "900115";
  const expiry = "310820";
  let l2 = `${birth}${checkDigit(birth)}M${expiry}${checkDigit(expiry)}UZB${"<".repeat(11)}`;
  l2 += checkDigit(l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29));
  return [l1, l2, "BOYQOBILOV<<ASILBEK".padEnd(30, "<")];
}

test("O'zbekiston ID kartasi (TD1) to'liq o'qiladi", () => {
  const mrz = parseMrz(uzbekId().join("\n"), REF);
  assert.equal(mrz.format, "TD1");
  assert.equal(mrz.valid, true);
  assert.equal(mrz.surname, "BOYQOBILOV");
  assert.equal(mrz.givenNames, "ASILBEK");
  assert.equal(mrz.documentNumber, "AB1234567");
  assert.equal(mrz.nationality, "UZB");
  assert.equal(mrz.personalNumber, "31234567890123");
});

test("model to'ldiruvchi '<' ni kam o'qisa ham ID karta o'qiladi", () => {
  const lines = uzbekId();
  // Oxirgi qatordan bitta '<' tushib qolgan (29 belgi)
  const broken = [lines[0], lines[1], lines[2].slice(0, 29)];
  const mrz = parseMrz(broken.join("\n"), REF);
  assert.equal(mrz.valid, true, "to'ldiruvchi tiklanishi va tekshiruvdan o'tishi kerak");
  assert.equal(mrz.surname, "BOYQOBILOV");
});

test("model ortiqcha '<' qo'shsa ham o'qiladi", () => {
  const lines = uzbekId();
  const broken = [lines[0] + "<", lines[1], lines[2] + "<<"];
  const mrz = parseMrz(broken.join("\n"), REF);
  assert.equal(mrz.valid, true);
  assert.equal(mrz.documentNumber, "AB1234567");
});

test("2-qatordagi tekshiruv raqamiga tegilmaydi", () => {
  // Bu qatorning OXIRGI belgisi — umumiy tekshiruv raqami. To'ldiruvchi
  // uning oldidan qo'shilishi kerak, aks holda raqam joyidan siljib,
  // to'g'ri hujjat "tekshiruvdan o'tmadi" bo'lib qolardi
  const lines = uzbekId();
  const l2 = lines[1];
  const shortened = l2.slice(0, 18) + l2.slice(19); // bitta '<' tushdi
  assert.equal(shortened.length, 29);
  const mrz = parseMrz([lines[0], shortened, lines[2]].join("\n"), REF);
  assert.equal(mrz.valid, true);
  assert.equal(mrz.checks.composite, true, "umumiy tekshiruv raqami joyida qolsin");
});

test("ma'noli belgi yetishmasa tiklanmaydi — taxmin qilinmaydi", () => {
  const lines = uzbekId();
  // Hujjat raqamidan belgi tushgan (to'ldiruvchi emas): qator oxiri '<'
  // bo'lsa ham, bu yerda tiklash hujjat raqamini buzib qo'yardi.
  // Tekshiruv raqami buni ushlaydi
  const broken = [lines[0].slice(0, 8) + lines[0].slice(9), lines[1], lines[2]];
  const mrz = parseMrz(broken.join("\n"), REF);
  assert.equal(mrz.valid, false, "xato o'qilgan hujjat saqlanmasligi kerak");
});

test("qatorlar shakli to'g'ri kelmasa, nima bo'lgani aytiladi", () => {
  // Xabarda qatorlar SONI va UZUNLIGI bo'ladi — ism va raqam emas
  try {
    parseMrz("QISQA<<QATOR<<<<<<<<<<<<<<\nYANA<<BITTA<<QATOR<<<<<<<<", REF);
    assert.fail("xato kutilgan edi");
  } catch (err) {
    assert.ok(err instanceof MrzError);
    assert.match((err as Error).message, /2 qator/);
    assert.match((err as Error).message, /26/, "uzunliklari aytilsin");
    assert.doesNotMatch((err as Error).message, /QATOR/, "matn chiqmasin");
  }
});
