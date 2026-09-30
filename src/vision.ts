/**
 * Rasmdan hujjat ma'lumotini o'qish.
 *
 * ME'MORIY QAROR: model bu yerda FAQAT KO'CHIRIB YOZADI — pasportning
 * pastidagi MRZ qatorlarini belgima-belgi o'qib beradi, xolos. Ma'lumotni
 * ajratish, sanani hisoblash va TEKSHIRISH `mrz.ts` dagi oddiy kodda,
 * tekshiruv raqamlari bilan bo'ladi.
 *
 * Nega shunday: model bitta belgini xato o'qishi mumkin, lekin MRZ dagi
 * tekshiruv raqami buni ochib beradi. Agar modelga "pasport raqamini top"
 * deb aytsak, u ishonch bilan xato raqam berishi mumkin va biz bilmay
 * qolamiz. Vizaga xato pasport raqami ketishi esa — safar buzilishi.
 *
 * Javob JSON ko'rinishida so'raladi va `zod` bilan tekshiriladi. SDK'ning
 * `messages.parse()` yordamchisi hozirgi nashrda (0.70) yo'q, shuning uchun
 * faqat barqaror `messages.create` ishlatiladi.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "./config.ts";
import { parseMrz, MrzError, type Mrz } from "./mrz.ts";

const ReadSchema = z.object({
  /** MRZ qatorlari — belgima-belgi, to'ldiruvchi '<' lar bilan */
  mrz_lines: z.array(z.string()),
  /** MRZ da yo'q, lekin vizaga kerak bo'ladigan maydonlar (ko'rinsa) */
  issue_date: z.string().nullable(),
  place_of_birth: z.string().nullable(),
  authority: z.string().nullable(),
  document_kind: z.enum(["passport", "id_card", "other", "not_a_document"]),
  mrz_readable: z.boolean(),
  problem: z.string().nullable(),
});

const SYSTEM = `Sen hujjatdagi mashina o'qiydigan zonani (MRZ) ko'chirib yozadigan vositasan.

MRZ — pasportning ma'lumot sahifasining pastidagi, ID kartaning orqasidagi
maxsus shriftdagi qatorlar: pasportda 2 qator x 44 belgi, ID kartada 3 qator x 30 belgi.

QAT'IY QOIDALAR:
1. MRZ qatorlarini AYNAN ko'chirib yoz — har bir belgi, har bir '<'.
2. HECH NARSANI TUZATMA. Xato ko'rinsa ham o'zgartirma: qatorlarda tekshiruv
   raqamlari bor, xatoni keyingi bosqich o'zi aniqlaydi.
3. HECH NARSANI O'YLAB TOPMA. Bitta belgi ko'rinmasa yoki shubhali bo'lsa,
   mrz_readable=false qilib, problem maydonida nimasi ko'rinmaganini yoz.
4. Qatorlarning uzunligini to'ldiruvchi '<' bilan aniq saqlab qol
   (pasportda 44, ID kartada 30 belgi).
5. 0 va O, 1 va I ni diqqat bilan ajrat: MRZ da raqam va harf farq qiladi.
6. Rasmda hujjat bo'lmasa — document_kind='not_a_document', mrz_lines=[].

issue_date, place_of_birth va authority — MRZ da yo'q; ularni hujjatning
ko'rinadigan qismidan o'qi, ko'rinmasa null qoldir (taxmin qilma).
issue_date formati: yyyy-mm-dd.

JAVOB SHAKLI: faqat JSON obyekt, boshqa hech qanday matn yoki izohsiz:
{"mrz_lines":["...","..."],"issue_date":null,"place_of_birth":null,
"authority":null,"document_kind":"passport","mrz_readable":true,"problem":null}`;

export type ReadResult =
  | {
      ok: true;
      mrz: Mrz;
      issueDate: string | null;
      placeOfBirth: string | null;
      authority: string | null;
    }
  | { ok: false; reason: "unreadable" | "not_a_document" | "refused"; problem: string }
  | { ok: false; reason: "checks_failed"; problem: string; mrz: Mrz };

/**
 * Klient kerak bo'lganda yaratiladi. Modul yuklanganda yaratilsa, kalitsiz
 * muhitda (masalan testda) bu faylni import qilishning o'zi xato berardi.
 */
let client: Anthropic | null = null;
function getClient(): Anthropic {
  return (client ??= new Anthropic({ apiKey: config.anthropicKey }));
}

const MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type Media = (typeof MEDIA)[number];

export async function readDocument(
  image: { bytes: Uint8Array<ArrayBuffer>; mime: string },
  today = new Date(),
): Promise<ReadResult> {
  const mime: Media = (MEDIA as readonly string[]).includes(image.mime)
    ? (image.mime as Media)
    : "image/jpeg";

  const response = await getClient().messages.create({
    model: config.model,
    max_tokens: 2048,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mime,
              data: Buffer.from(image.bytes).toString("base64"),
            },
          },
          { type: "text", text: "Bu hujjatning MRZ qatorlarini ko'chirib yoz." },
        ],
      },
    ],
  });

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

  const parsed = parseJson(text);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "unreadable",
      problem: "Javobni tahlil qilib bo'lmadi, qayta urinib ko'ring.",
    };
  }
  const out = parsed.data;

  if (out.document_kind === "not_a_document") {
    return {
      ok: false,
      reason: "not_a_document",
      problem: out.problem ?? "Rasmda hujjat ko'rinmadi.",
    };
  }

  if (!out.mrz_readable || out.mrz_lines.length === 0) {
    return {
      ok: false,
      reason: "unreadable",
      problem: out.problem ?? "MRZ qatorlari aniq ko'rinmadi.",
    };
  }

  // Bu yerdan keyin — hech qanday model yo'q, faqat determinlashgan kod
  let mrz: Mrz;
  try {
    mrz = parseMrz(out.mrz_lines.join("\n"), today);
  } catch (err) {
    if (err instanceof MrzError) {
      return { ok: false, reason: "unreadable", problem: err.message };
    }
    throw err;
  }

  if (!mrz.valid) {
    return {
      ok: false,
      reason: "checks_failed",
      problem: "Tekshiruv raqamlari mos kelmadi.",
      mrz,
    };
  }

  return {
    ok: true,
    mrz,
    issueDate: normalizeDate(out.issue_date),
    placeOfBirth: out.place_of_birth?.trim() || null,
    authority: out.authority?.trim() || null,
  };
}

/**
 * Javobdagi JSON'ni ajratib oladi. Model atrofiga matn qo'shib qo'ysa ham
 * birinchi '{' dan oxirgi '}' gacha olinadi, keyin zod bilan tekshiriladi.
 */
export function parseJson(text: string): z.SafeParseReturnType<unknown, z.infer<typeof ReadSchema>> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return ReadSchema.safeParse(undefined);
  }
  try {
    return ReadSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return ReadSchema.safeParse(undefined);
  }
}

/** Model bergan sanani ISO ga keltiradi; shubhali bo'lsa null (taxmin yo'q). */
export function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}
