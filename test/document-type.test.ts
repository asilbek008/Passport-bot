/**
 * Hujjat turi va davlatni MRZ'dan aniqlash. Hammasi determinlashgan —
 * model ishtirok etmaydi, shuning uchun to'liq testdan o'tadi.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  docKind,
  docSubtype,
  countryOf,
  documentType,
  photoBaseName,
} from "../src/document-type.ts";
import { checkDigit, parseMrz, type Mrz } from "../src/mrz.ts";

const REF = new Date("2026-10-01T00:00:00Z");

/** Tekshiruv raqamlari to'g'ri TD3 (pasport) MRZ yasaydi. */
function td3(o: {
  code?: string;
  state?: string;
  nation?: string;
  surname: string;
  given: string;
  docNumber?: string;
}): Mrz {
  const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);
  const code = pad(o.code ?? "P<", 2);
  const state = pad(o.state ?? "UZB", 3);
  const l1 = pad(`${code}${state}${o.surname}<<${o.given.replace(/ /g, "<")}`, 44);

  const doc = pad(o.docNumber ?? "AB1234567", 9);
  const head =
    doc +
    checkDigit(doc) +
    pad(o.nation ?? o.state ?? "UZB", 3) +
    "850412" + checkDigit("850412") +
    "M" +
    "310101" + checkDigit("310101") +
    "<".repeat(14) + "0";
  const composite = head.slice(0, 10) + head.slice(13, 20) + head.slice(21, 43);
  return parseMrz(`${l1}\n${head}${checkDigit(composite)}`, REF);
}

/** TD1 (ID karta) MRZ yasaydi. */
function td1(o: { code?: string; state?: string; surname: string; given: string }): Mrz {
  const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);
  const doc = "D23145890";
  const l1 = pad(
    `${pad(o.code ?? "ID", 2)}${pad(o.state ?? "UZB", 3)}${doc}${checkDigit(doc)}`,
    30,
  );
  const birth = "850412";
  const expiry = "310101";
  const l2head =
    birth + checkDigit(birth) + "M" + expiry + checkDigit(expiry) +
    pad(o.state ?? "UZB", 3) + "<".repeat(11);
  const composite =
    l1.slice(5, 30) + l2head.slice(0, 7) + l2head.slice(8, 15) + l2head.slice(18, 29);
  const l2 = l2head + checkDigit(composite);
  const l3 = pad(`${o.surname}<<${o.given.replace(/ /g, "<")}`, 30);
  return parseMrz([l1, l2, l3].join("\n"), REF);
}

// --- docKind ---

test("hujjat kodi turini aniqlaydi", () => {
  assert.equal(docKind("P", "TD3"), "pasport");
  assert.equal(docKind("P<", "TD3"), "pasport");
  assert.equal(docKind("PD", "TD3"), "pasport"); // diplomatik
  assert.equal(docKind("ID", "TD1"), "id");
  assert.equal(docKind("I<", "TD1"), "id");
  assert.equal(docKind("IR", "TD1"), "id"); // yashash guvohnomasi
  assert.equal(docKind("AC", "TD1"), "id"); // ekipaj a'zosi
  assert.equal(docKind("V", "TD3"), "viza");
});

test("kod tanilmasa format bo'yicha hal qilinadi", () => {
  assert.equal(docKind("XX", "TD1"), "id", "TD1 — ID karta o'lchami");
  assert.equal(docKind("XX", "TD3"), "pasport", "TD3 — pasport o'lchami");
  assert.equal(docKind("", "TD2"), "boshqa");
});

test("diplomatik va xizmat pasportlari ajratiladi", () => {
  assert.equal(docSubtype("PD"), "diplomatik");
  assert.equal(docSubtype("PS"), "xizmat");
  assert.equal(docSubtype("P"), "oddiy");
  assert.equal(docSubtype("P<"), "oddiy");
  assert.equal(docSubtype("ID"), "oddiy", "ID kartada kichik tur yo'q");
});

// --- Davlatlar ---

test("Markaziy Osiyo davlatlari o'zbekcha nomlanadi", () => {
  assert.deepEqual(countryOf("UZB"), { name: "O'zbekiston", adjective: "O'zbek" });
  assert.deepEqual(countryOf("TJK"), { name: "Tojikiston", adjective: "Tojik" });
  assert.deepEqual(countryOf("KGZ"), { name: "Qirg'iziston", adjective: "Qirg'iz" });
  assert.deepEqual(countryOf("KAZ"), { name: "Qozog'iston", adjective: "Qozoq" });
  assert.deepEqual(countryOf("TKM"), { name: "Turkmaniston", adjective: "Turkman" });
});

test("ro'yxatda yo'q davlat uchun kod qoldiriladi, nom O'YLAB TOPILMAYDI", () => {
  assert.deepEqual(countryOf("XYZ"), { name: "XYZ", adjective: "XYZ" });
  assert.deepEqual(countryOf("<<<"), { name: "noma'lum", adjective: "noma'lum" });
});

// --- To'liq aniqlash ---

test("o'zbek pasporti", () => {
  const type = documentType(td3({ surname: "KARIMOV", given: "AZIZ" }));
  assert.equal(type.kind, "pasport");
  assert.equal(type.countryCode, "UZB");
  assert.equal(type.country, "O'zbekiston");
  assert.equal(type.label, "O'zbek pasporti");
  assert.equal(type.slug, "uzb-pasport");
});

test("o'zbek ID kartasi", () => {
  const type = documentType(td1({ surname: "SALIMOVA", given: "NARGIZA" }));
  assert.equal(type.kind, "id");
  assert.equal(type.label, "O'zbek ID kartasi");
  assert.equal(type.slug, "uzb-id");
});

test("tojik, qirg'iz va qozoq pasportlari", () => {
  for (const [code, label, slug] of [
    ["TJK", "Tojik pasporti", "tjk-pasport"],
    ["KGZ", "Qirg'iz pasporti", "kgz-pasport"],
    ["KAZ", "Qozoq pasporti", "kaz-pasport"],
  ] as const) {
    const type = documentType(
      td3({ state: code, nation: code, surname: "FAMILIYA", given: "ISM" }),
    );
    assert.equal(type.countryCode, code);
    assert.equal(type.label, label);
    assert.equal(type.slug, slug);
  }
});

test("diplomatik pasport nomida ko'rinadi", () => {
  const type = documentType(td3({ code: "PD", surname: "ELCHI", given: "VAKIL" }));
  assert.equal(type.subtype, "diplomatik");
  assert.match(type.label, /diplomatik/);
});

test("fuqarolik hujjat bergan davlatdan ustun turadi", () => {
  // Hujjatni O'zbekiston bergan, lekin fuqaroligi tojik
  const type = documentType(
    td3({ state: "UZB", nation: "TJK", surname: "X", given: "Y" }),
  );
  assert.equal(type.countryCode, "TJK", "viza uchun fuqarolik muhim");
});

// --- Fayl nomi ---

test("fayl nomi familiya_ism_turi shaklida", () => {
  const mrz = td3({ surname: "KARIMOV", given: "AZIZ BEK" });
  const name = photoBaseName({ ...mrz, type: documentType(mrz) });
  assert.equal(name, "KARIMOV_AZIZ_BEK_uzb-pasport");
});

test("o'zbek apostroflari fayl nomida yo'qoladi", () => {
  const name = photoBaseName({
    surname: "G'ULOMOV",
    givenNames: "O'KTAM",
    type: { slug: "uzb-pasport" },
  });
  assert.equal(name, "GULOMOV_OKTAM_uzb-pasport");
  assert.ok(/^[A-Za-z0-9_-]+$/.test(name), `faqat ASCII bo'lishi kerak: ${name}`);
});

test("fayl nomida Windows taqiqlagan belgilar qolmaydi", () => {
  const name = photoBaseName({
    surname: 'A<B>C:D"E/F\\G|H?I*J',
    givenNames: "ISM",
    type: { slug: "uzb-pasport" },
  });
  assert.ok(!/[<>:"/\\|?*]/.test(name), `taqiqlangan belgi bor: ${name}`);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(name));
});

test("Windows band qilgan nomlar himoyalanadi", () => {
  // CON, NUL kabi nomlarni Windows fayl deb qabul qilmaydi
  const name = photoBaseName({
    surname: "CON",
    givenNames: "",
    type: { slug: "" },
  });
  assert.ok(name.startsWith("_"), `band nom himoyalanmagan: ${name}`);
});

test("bo'sh familiya ham nom beradi", () => {
  const name = photoBaseName({
    surname: "",
    givenNames: "",
    type: { slug: "uzb-pasport" },
  });
  assert.equal(name, "NOMAALUM_uzb-pasport");
});

test("juda uzun ism qisqartiriladi", () => {
  const name = photoBaseName({
    surname: "A".repeat(200),
    givenNames: "B".repeat(200),
    type: { slug: "uzb-pasport" },
  });
  assert.ok(name.length <= 120, `juda uzun: ${name.length}`);
});
