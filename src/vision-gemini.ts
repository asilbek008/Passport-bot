/**
 * Rasmni Gemini bilan o'qish.
 *
 * `vision.ts` (Anthropic) bilan AYNI SHARTNOMA: kirish — rasm, chiqish —
 * `ReadResult`. Shuning uchun provayderni almashtirish botning qolgan
 * qismiga umuman ta'sir qilmaydi.
 *
 * Model faqat MRZ qatorlarini ko'chirib yozadi; tekshirish `read-shared.ts`
 * va `mrz.ts` da, tekshiruv raqamlari bilan.
 *
 * MAXFIYLIK OGOHLIGI: Google'ning BEPUL tarifida yuborilgan ma'lumot model
 * o'qitishga ishlatiladi va odam ko'rib chiqishi mumkin. Pasport skanlari
 * uchun bu to'g'ri kelmaydi — PULLIK tarifni yoqing (u "content not used
 * to improve our products" deb belgilangan). Bu kod ikkisida ham ishlaydi,
 * lekin tanlov sizda.
 */

import { GoogleGenAI } from "@google/genai";
import { config } from "./config.ts";
import {
  SYSTEM,
  USER_PROMPT,
  interpret,
  normalizeMime,
  type ReadResult,
} from "./read-shared.ts";

/**
 * Klient kerak bo'lganda yaratiladi — modul yuklanganda kalit talab
 * qilinmasligi uchun (testda bu faylni import qilish xato bermasin).
 */
let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  return (client ??= new GoogleGenAI({ apiKey: config.geminiKey }));
}

export async function readWithGemini(
  image: { bytes: Uint8Array<ArrayBuffer>; mime: string },
  today = new Date(),
): Promise<ReadResult> {
  let text: string;
  try {
    const response = await getClient().models.generateContent({
      model: config.geminiModel,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: normalizeMime(image.mime),
                data: Buffer.from(image.bytes).toString("base64"),
              },
            },
            { text: USER_PROMPT },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM,
        // JSON so'raymiz — model atrofiga izoh qo'shib qo'ymasligi uchun
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        // MRZ ko'chirish — ijod emas, aniqlik ishi
        temperature: 0,
      },
    });

    text = response.text ?? "";
  } catch (err) {
    return geminiFailure(err);
  }

  if (!text.trim()) {
    // Javob bo'sh bo'lishi mumkin: xavfsizlik filtri to'sgan yoki
    // maxOutputTokens tugagan
    return {
      ok: false,
      reason: "unreadable",
      problem: "Model bo'sh javob qaytardi — rasmni qayta yuboring.",
    };
  }

  return interpret(text, today);
}

/**
 * Gemini xatosini tushunarli sababga aylantiradi.
 *
 * Google SDK'si tipli xato klasslarini eksport qilmaydi, shuning uchun
 * HTTP kodi va xabardan aniqlanadi. Bu xabarlarda hujjat ma'lumoti yo'q
 * (ular API darajasidagi xatolar), shuning uchun ko'rsatish xavfsiz.
 */
export function geminiFailure(err: unknown): ReadResult {
  const fail = (problem: string, retryable: boolean): ReadResult => ({
    ok: false,
    reason: "api_error",
    problem,
    retryable,
  });

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  // HTTP kodini xabardan yoki obyektdan olamiz
  const status =
    (err as { status?: unknown })?.status ??
    (err as { code?: unknown })?.code ??
    Number(message.match(/\b(4\d\d|5\d\d)\b/)?.[1]);
  const code = typeof status === "number" ? status : undefined;

  if (code === 401 || code === 403 || lower.includes("api key not valid")) {
    return fail(
      "Gemini kaliti qabul qilinmadi — GEMINI_API_KEY ni tekshiring " +
        "(AI Studio kaliti `AIza` bilan boshlanadi)",
      false,
    );
  }
  if (code === 404 || lower.includes("not found") || lower.includes("is not supported")) {
    return fail(
      `model topilmadi — .env dagi GEMINI_MODEL xato ("${config.geminiModel}")`,
      false,
    );
  }
  if (code === 429 || lower.includes("quota") || lower.includes("rate limit")) {
    return fail(
      "Gemini chekloviga urildi — bepul tarifda daqiqada 10–15 so'rov. " +
        "Bir daqiqa kutib qayta yuboring yoki pullik tarifni yoqing",
      true,
    );
  }
  if (lower.includes("billing") || lower.includes("payment")) {
    return fail("Google hisobida to'lov sozlanmagan — Google AI Studio → Billing", false);
  }
  if (code !== undefined && code >= 500) {
    return fail(`Gemini serverida xato (${code}) — birozdan keyin qayta yuboring`, true);
  }
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("enotfound")) {
    return fail("Gemini'ga ulanib bo'lmadi — internetni tekshiring", true);
  }
  if (code === 400) {
    return fail(`so'rov qabul qilinmadi: ${message.slice(0, 120)}`, false);
  }

  // Noma'lum xato — turini aytamiz, to'liq matnini emas
  return fail(
    `kutilmagan xato (${err instanceof Error ? err.name : typeof err})`,
    true,
  );
}
