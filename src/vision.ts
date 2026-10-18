/**
 * Rasmni Anthropic (Claude) bilan o'qish.
 *
 * ME'MORIY QAROR: model bu yerda FAQAT KO'CHIRIB YOZADI — pasportning
 * pastidagi MRZ qatorlarini belgima-belgi o'qib beradi, xolos. Ma'lumotni
 * ajratish, sanani hisoblash va TEKSHIRISH `read-shared.ts` va `mrz.ts`
 * dagi oddiy kodda, tekshiruv raqamlari bilan bo'ladi.
 *
 * Nega shunday: model bitta belgini xato o'qishi mumkin, lekin MRZ dagi
 * tekshiruv raqami buni ochib beradi. Agar modelga "pasport raqamini top"
 * deb aytsak, u ishonch bilan xato raqam berishi mumkin va biz bilmay
 * qolamiz. Vizaga xato pasport raqami ketishi esa — safar buzilishi.
 *
 * Gemini provayderi `vision-gemini.ts` da, tanlov `read.ts` da.
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.ts";
import {
  SYSTEM,
  promptFor,
  interpret,
  normalizeMime,
  type ReadHint,
} from "./read-shared.ts";
import type { Image } from "./read.ts";
import type { ReadResult } from "./read-shared.ts";

// Eski import yo'llari buzilmasligi uchun qayta eksport qilinadi
export type { ReadResult } from "./read-shared.ts";
export { parseJson, normalizeDate } from "./read-shared.ts";

/**
 * Klient kerak bo'lganda yaratiladi. Modul yuklanganda yaratilsa, kalitsiz
 * muhitda (masalan testda) bu faylni import qilishning o'zi xato berardi.
 */
let client: Anthropic | null = null;
function getClient(): Anthropic {
  return (client ??= new Anthropic({ apiKey: config.anthropicKey }));
}

export async function readDocument(
  image: Image | Image[],
  today = new Date(),
  hint?: ReadHint,
): Promise<ReadResult> {
  const images = Array.isArray(image) ? image : [image];
  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model: config.model,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            // Rasmlar: asosiysi, keyin (bo'lsa) MRZ zonasining yaqin surati
            ...images.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: normalizeMime(img.mime),
                data: Buffer.from(img.bytes).toString("base64"),
              },
            })),
            { type: "text" as const, text: promptFor(hint, images.length) },
          ],
        },
      ],
    });
  } catch (err) {
    // API'ning o'zi ishlamadi — rasmning aybi emas. Xodimga aniq sabab
    // aytiladi, aks holda u 30 rasmni bekorga qayta suratga olardi.
    return apiFailure(err);
  }

  // Xavfsizlik klassifikatori rad etishi mumkin — content'dan oldin tekshiramiz
  if (response.stop_reason === "refusal") {
    return {
      ok: false,
      reason: "refused",
      problem: "Rasmni o'qish rad etildi. Boshqa rasm bilan urinib ko'ring.",
    };
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return interpret(text, today);
}

/**
 * API xatosini tushunarli sababga aylantiradi.
 *
 * Bu xabarlarda hujjat ma'lumoti YO'Q — ular API darajasidagi xatolar
 * ("kalit xato", "hisobda mablag' yo'q"), shuning uchun ularni xodimga
 * ko'rsatish va jurnalga yozish xavfsiz. Aks holda hamma narsa "texnik
 * xato" bo'lib qolar edi va sababini topish imkonsiz bo'lardi.
 */
export function apiFailure(err: unknown): ReadResult {
  const fail = (problem: string, retryable: boolean): ReadResult => ({
    ok: false,
    reason: "api_error",
    problem,
    retryable,
  });

  /**
   * SDK `error.message` ga butun JSON javobni qo'yadi
   * (`400 {"type":"error","error":{"message":"..."}}`), shuning uchun
   * odam o'qiydigan qismini ajratib olamiz.
   */
  const humanMessage = (e: InstanceType<typeof Anthropic.APIError>): string => {
    const body = e.error as { error?: { message?: unknown } } | undefined;
    const inner = body?.error?.message;
    return typeof inner === "string" && inner.length > 0 ? inner : e.message;
  };

  // MUDDAT TUGADI — birinchi tekshiramiz: xato matni tushunarsiz
  // bo'ladi va boshqa shartlarga tushib ketishi mumkin
  const name = err instanceof Error ? err.name : "";
  if (name === "APIConnectionTimeoutError" || name === "TimeoutError") {
    return fail(
      `Claude ${Math.round(config.requestTimeoutMs / 1000)} soniyada javob bermadi. ` +
        "Internet sekin yoki ulanish to'silgan bo'lishi mumkin",
      true,
    );
  }

  // Eng aniq turdan boshlab tekshiramiz
  if (err instanceof Anthropic.AuthenticationError) {
    return fail("API kaliti qabul qilinmadi — ANTHROPIC_API_KEY ni tekshiring", false);
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return fail("API kalitiga ruxsat yo'q (hisob bloklangan bo'lishi mumkin)", false);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return fail(`model topilmadi — .env dagi MODEL xato ("${config.model}")`, false);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return fail("API chekloviga urildi — bir daqiqa kutib qayta yuboring", true);
  }
  if (err instanceof Anthropic.BadRequestError) {
    const message = humanMessage(err);
    const lower = message.toLowerCase();
    // Mablag' tugaganda Anthropic 400 qaytaradi va sababini yozadi
    if (lower.includes("credit") || lower.includes("balance")) {
      return fail(
        "Anthropic hisobida mablag' yo'q — console.anthropic.com → Billing",
        false,
      );
    }
    return fail(`so'rov qabul qilinmadi: ${message.slice(0, 120)}`, false);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return fail("API'ga ulanib bo'lmadi — internetni tekshiring", true);
  }
  if (err instanceof Anthropic.APIError) {
    const retryable = err.status === undefined || err.status >= 500;
    return fail(
      `API xatosi ${err.status ?? ""}: ${humanMessage(err).slice(0, 120)}`.trim(),
      retryable,
    );
  }
  // Noma'lum xato — turini aytamiz, matnini emas (ehtiyot uchun)
  return fail(
    `kutilmagan xato (${err instanceof Error ? err.name : typeof err})`,
    true,
  );
}
