/**
 * Rasm o'qishning yagona kirish nuqtasi.
 *
 * Bot qaysi provayder ishlatilayotganini bilmaydi — u faqat shu funksiyani
 * chaqiradi. Provayder `.env` dagi `PROVIDER` bilan tanlanadi (yoki qaysi
 * kalit mavjud bo'lsa, o'shanisi).
 *
 * Nega shunday: MRZ tekshiruvi tekshiruv raqamlariga tayanadi, modelga
 * emas. Shuning uchun provayderni almashtirish o'qish SIFATIGA ta'sir
 * qiladi (nechta rasm qayta olinishi kerak), lekin ISHONCHLILIKKA emas:
 * xato o'qilgan MRZ qaysi model o'qiganidan qat'i nazar ushlanadi va
 * saqlanmaydi.
 */

import { config } from "./config.ts";
import type { ReadResult, ReadHint } from "./read-shared.ts";

/** Modelga yuboriladigan rasm. */
export type Image = { bytes: Uint8Array<ArrayBuffer>; mime: string };

export type { ReadResult, ReadHint } from "./read-shared.ts";

/** Rasmdan hujjat ma'lumotini o'qiydi. Provayder sozlamadan olinadi. */
export async function readDocument(
  /**
   * Bitta rasm yoki IKKITA: asosiy rasm va uning pastki qismi (MRZ
   * zonasi). Ikkinchisi bo'lsa, model mayda qatorlarni ham ko'radi va
   * birinchi so'rovdayoq o'qiydi — qayta urinish kerak bo'lmaydi.
   */
  image: Image | Image[],
  today = new Date(),
  /**
   * Rasm qanday ko'rinishda: `mrz_strip` — faqat MRZ zonasining yaqin
   * surati (hujjatning o'zi ko'rinmaydi), shuning uchun topshiriq boshqa.
   */
  hint?: ReadHint,
): Promise<ReadResult> {
  if (config.provider === "gemini") {
    const { readWithGemini } = await import("./vision-gemini.ts");
    return readWithGemini(image, today, hint);
  }
  const { readDocument: readWithAnthropic } = await import("./vision.ts");
  return readWithAnthropic(image, today, hint);
}

/** Hozirgi provayder haqida qisqa ma'lumot — ishga tushirishda ko'rsatiladi. */
export function providerInfo(): { name: string; model: string; keyVar: string } {
  return config.provider === "gemini"
    ? { name: "Gemini", model: config.geminiModel, keyVar: "GEMINI_API_KEY" }
    : { name: "Anthropic", model: config.model, keyVar: "ANTHROPIC_API_KEY" };
}
