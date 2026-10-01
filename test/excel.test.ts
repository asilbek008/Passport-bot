import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkbook,
  monthsLeft,
  passportState,
  workbookName,
  workbookCaption,
} from "../src/excel.ts";
import type { Pilgrim } from "../src/store.ts";

const REF = new Date("2026-09-29T00:00:00Z");

function row(over: Partial<Pilgrim> = {}): Pilgrim {
  return {
    id: 1,
    added_by: 111,
    group_label: "Umra mart",
    surname: "KARIMOV",
    given_names: "AZIZ",
    doc_code: "P",
    doc_number: "AB1234567",
    nationality: "UZB",
    birth_date: "1985-04-12",
    sex: "M",
    expiry_date: "2030-01-01",
    personal_number: "31204855620017",
    issue_date: "2020-01-02",
    place_of_birth: "QIZIRIQ",
    authority: "IIB",
    mrz_format: "TD3",
    doc_kind: "pasport",
    doc_country: "O'zbekiston",
    doc_label: "O'zbek pasporti",
    photo_file: "umra-mart/KARIMOV_AZIZ_uzb-pasport.jpg",
    created_at: "2026-09-29 10:00:00",
    ...over,
  };
}

test("monthsLeft qolgan oyni hisoblaydi", () => {
  assert.equal(monthsLeft("2026-09-29", REF), 0);
  assert.equal(monthsLeft("2027-09-29", REF), 11); // 30.44 kunlik oy bilan
  assert.ok(monthsLeft("2025-09-29", REF)! < 0);
  assert.equal(monthsLeft("buzuq-sana", REF), null);
});

test("passportState Umra talabini qo'llaydi", () => {
  // 6 oydan ko'p — yaxshi
  assert.equal(passportState("2027-06-01", REF, 6), "ok");
  // 6 oydan kam, lekin tugamagan — ogohlik
  assert.equal(passportState("2026-12-01", REF, 6), "soon");
  // Tugagan
  assert.equal(passportState("2026-01-01", REF, 6), "expired");
  // Aniqlanmagan
  assert.equal(passportState("", REF, 6), "unknown");
});

test("workbookName sana va guruhni oladi", () => {
  assert.equal(workbookName(REF), "umra-hujjatlar-2026-09-29.xlsx");
  assert.match(workbookName(REF, "Umra mart"), /^umra-hujjatlar-umra-mart-2026-09-29\.xlsx$/);
  // Xavfli belgilar fayl nomiga tushmaydi
  const name = workbookName(REF, "a/b\\c:*?\"<>|");
  assert.ok(!/[\/\\:*?"<>|]/.test(name), `fayl nomida xavfli belgi: ${name}`);
});

test("workbookCaption muammolarni sanaydi", () => {
  const caption = workbookCaption(
    [
      row({ expiry_date: "2030-01-01" }),
      row({ expiry_date: "2026-01-01" }), // tugagan
      row({ expiry_date: "2026-11-15" }), // tez tugaydi
    ],
    REF,
  );
  assert.match(caption, /\*3\* kishi/);
  assert.match(caption, /🔴 1/);
  assert.match(caption, /🟡 1/);

  const clean = workbookCaption([row()], REF);
  assert.match(clean, /hammasining pasporti yetarli/);
});

test("buildWorkbook haqiqiy xlsx fayl chiqaradi", async () => {
  const bytes = await buildWorkbook([row(), row({ doc_number: "CD7654321" })], REF);

  // xlsx — zip arxiv, "PK" bilan boshlanadi
  assert.equal(bytes[0], 0x50, "PK imzosi kutilgan");
  assert.equal(bytes[1], 0x4b);
  assert.ok(bytes.length > 2000, `fayl juda kichik: ${bytes.length} bayt`);
});

test("bo'sh maydonlar fayl tuzilishini buzmaydi", async () => {
  const bytes = await buildWorkbook(
    [
      row({
        issue_date: null,
        place_of_birth: null,
        authority: null,
        personal_number: "",
        group_label: "",
        expiry_date: "buzuq",
      }),
    ],
    REF,
  );
  assert.equal(bytes[0], 0x50);
  assert.ok(bytes.length > 2000);
});

test("bo'sh ro'yxatdan ham fayl chiqadi (faqat sarlavha)", async () => {
  const bytes = await buildWorkbook([], REF);
  assert.equal(bytes[0], 0x50);
  assert.ok(bytes.length > 1000);
});
