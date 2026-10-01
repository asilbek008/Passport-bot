/**
 * Viza turini aniqlash va holatini hisoblash.
 *
 * Eslatma: MOFA sayti (visa.mofa.gov.sa) ataylab avtomatlashtirilmagan —
 * u CAPTCHA bilan himoyalangan. Shuning uchun bu yerda tarmoq so'rovi yo'q:
 * viza yoki yorliqning MRZ'idan o'qiladi, yoki xodim qo'lda kiritadi.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { parseVisaType, visaState, VISA_LABELS, matchKey } from "../src/visa.ts";

const REF = new Date("2026-10-01T00:00:00Z");

test("o'zbek, ingliz va rus atamalari taniladi", () => {
  assert.equal(parseVisaType("umra"), "umra");
  assert.equal(parseVisaType("Umrah"), "umra");
  assert.equal(parseVisaType("УМРА"), "umra");
  assert.equal(parseVisaType("hajj"), "hajj");
  assert.equal(parseVisaType("haj"), "hajj");
  assert.equal(parseVisaType("single"), "single");
  assert.equal(parseVisaType("SINGLE ENTRY"), "single");
  assert.equal(parseVisaType("bir"), "single");
  assert.equal(parseVisaType("multiple"), "multiple");
  assert.equal(parseVisaType("multi"), "multiple");
  assert.equal(parseVisaType("ko'p"), "multiple");
  assert.equal(parseVisaType("transit"), "tranzit");
  assert.equal(parseVisaType("ishchi"), "ishchi");
});

test("tanilmagan tur uchun null — TAXMIN QILINMAYDI", () => {
  // Xato viza turi safar hujjatlarini buzadi, shuning uchun taxmin yo'q
  assert.equal(parseVisaType("nimadir"), null);
  assert.equal(parseVisaType(""), null);
  assert.equal(parseVisaType("viza"), null);
});

test("viza RAQAMI tur deb o'qilmaydi", () => {
  // Bu haqiqiy xato edi: "1" naqshi "1234567890" ning boshiga mos kelib,
  // viza raqami "single" deb o'qilardi
  assert.equal(parseVisaType("1234567890"), null);
  assert.equal(parseVisaType("12345"), null);
  assert.equal(parseVisaType("1"), "single", "yolg'iz 1 esa single degani");

  // Qisqa so'zlar faqat to'liq mos kelsa
  assert.equal(parseVisaType("bir"), "single");
  assert.equal(parseVisaType("birov"), null);
  assert.equal(parseVisaType("multi"), "multiple");
  assert.equal(parseVisaType("multik"), null);
});

test("har turning o'zbekcha nomi bor", () => {
  for (const [key, label] of Object.entries(VISA_LABELS)) {
    assert.ok(label.length > 0, `${key} uchun nom yo'q`);
  }
  assert.equal(VISA_LABELS.umra, "Umra vizasi");
  assert.equal(VISA_LABELS.single, "Bir martalik (single)");
  assert.equal(VISA_LABELS.multiple, "Ko'p martalik (multiple)");
});

test("viza muddati holati to'g'ri hisoblanadi", () => {
  assert.equal(visaState("2027-01-01", REF), "ok");
  // 30 kundan kam qolgan
  assert.equal(visaState("2026-10-20", REF), "soon");
  assert.equal(visaState("2026-09-01", REF), "expired");
  assert.equal(visaState(null, REF), "unknown");
  assert.equal(visaState("buzuq", REF), "unknown");
});

test("moslashtirish kaliti katta-kichik harfga bog'liq emas", () => {
  const a = matchKey({
    surname: "karimov", givenNames: "aziz", birthDate: "1985-04-12",
    nationality: "UZB",
  });
  const b = matchKey({
    surname: "  KARIMOV ", givenNames: "AZIZ", birthDate: "1985-04-12",
    nationality: "UZB",
  });
  assert.equal(a, b);

  // Tug'ilgan sana farq qilsa — boshqa odam
  const c = matchKey({
    surname: "KARIMOV", givenNames: "AZIZ", birthDate: "1990-04-12",
    nationality: "UZB",
  });
  assert.notEqual(a, c);
});
