/**
 * Telegram Bot API bilan ishlash. Tashqi kutubxona yo'q — faqat fetch.
 * Bot uzun so'rov (long polling) bilan ishlaydi, shuning uchun ochiq
 * domen, webhook va HTTPS sertifikat kerak emas: oddiy kompyuterda ham turadi.
 */

/** Xabar ostidagi tugma. `data` bosilganda qaytib keladi (64 baytgacha). */
export type Button = { text: string; data: string };

export type TgUpdate = {
  update_id: number;
  /**
   * Tugma bosilgani. Telegram buni alohida yangilik qilib yuboradi,
   * shuning uchun `getUpdates` da ham alohida so'raladi.
   */
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number; type: string };
    };
  };
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number };
    text?: string;
    caption?: string;
    /** Albom bo'lsa — bir albomdagi rasmlarda bu qiymat bir xil */
    media_group_id?: string;
    photo?: { file_id: string; file_size?: number; width: number; height: number }[];
    document?: { file_id: string; mime_type?: string; file_size?: number };
  };
};

/**
 * Telegram xatosi. `network` — ulanish/proksi muammosi (token emas),
 * `code` — Telegram qaytargan xato kodi (401 = token xato).
 */
export class TelegramError extends Error {
  readonly network: boolean;
  readonly code: number | undefined;

  constructor(message: string, info: { network?: boolean; code?: number } = {}) {
    super(message);
    this.name = "TelegramError";
    this.network = info.network ?? false;
    this.code = info.code;
  }
}

/** Telegramning fayl izohi chegarasi. */
export const CAPTION_LIMIT = 1024;

/**
 * Izohni chegaraga sig'diradi.
 *
 * Qator o'rtasidan kesmaslikka harakat qiladi, va Markdown belgisi
 * yarmida uzilib qolmasligi uchun oxirida toq qolgan `*` ni olib
 * tashlaydi (aks holda Telegram butun xabarni rad etardi).
 */
export function clipCaption(caption: string, limit = CAPTION_LIMIT): string {
  if (caption.length <= limit) return caption;

  const room = limit - 1; // oxiridagi "…" uchun joy
  let cut = caption.slice(0, room);

  // Qatorning o'rtasida uzmaymiz, agar yaqin orada qator oxiri bo'lsa
  const lastBreak = cut.lastIndexOf("\n");
  if (lastBreak > room * 0.6) cut = cut.slice(0, lastBreak);

  // Toq qolgan Markdown belgilarini olib tashlaymiz
  for (const mark of ["*", "_", "`"]) {
    const count = cut.split(mark).length - 1;
    if (count % 2 === 1) cut = cut.slice(0, cut.lastIndexOf(mark));
  }

  return `${cut.trimEnd()}…`;
}

/**
 * Har so'rovning muddati. Bo'lmasa, ulanish osilib qolganda bot
 * cheksiz kutadi va xodim "o'qilmoqda..." da qotib qoladi.
 *
 * `getUpdates` bundan mustasno: u ataylab uzoq kutadi (long polling),
 * shuning uchun unga alohida, kattaroq muddat beriladi.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

export class Telegram {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  private get base() {
    return `https://api.telegram.org/bot${this.token}`;
  }

  async call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Muddat tugadi — ulanib bo'lmaganidan ajratib aytamiz
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new TelegramError(
          `Telegram ${Math.round(timeoutMs / 1000)} soniyada javob bermadi (${method})`,
          { network: true },
        );
      }
      // Internet yo'q, DNS ishlamadi, proksi/faervol to'sdi
      throw new TelegramError(
        `Telegramga ulanib bo'lmadi (${method}): ${err instanceof Error ? err.message : err}`,
        { network: true },
      );
    }

    // Javob JSON bo'lmasligi mumkin: faervol yoki proksi HTML/matn qaytaradi.
    // `res.json()` bunda "Unexpected token" deb tushunarsiz xato berardi.
    const text = await res.text();
    let body: { ok: boolean; result?: T; description?: string; error_code?: number };
    try {
      body = JSON.parse(text);
    } catch {
      throw new TelegramError(
        `Telegram javobi tushunarsiz (${method}, HTTP ${res.status}): ` +
          `${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`,
        { network: true },
      );
    }

    if (!body.ok) {
      throw new TelegramError(
        `Telegram ${method}: ${body.description ?? `HTTP ${res.status}`}`,
        { code: body.error_code ?? res.status },
      );
    }
    return body.result as T;
  }

  /**
   * Pastdagi DOIMIY tugmalar (klaviatura o'rnida turadi).
   *
   * Inline tugmalardan farqi: bular xabarga biriktirilmaydi, ekran
   * pastida doim turadi va bosilganda oddiy MATN yuboradi. Shuning
   * uchun ular qaysi to'plam haqida ekanini bilmaydi — bot o'zi
   * oxirgi to'plamni topadi.
   *
   * `is_persistent` — menyu yopilmasin; `resize_keyboard` — tugmalar
   * baland bo'lib ekranni egallamasin.
   */
  /**
   * Pastdagi doimiy tugmalarni OLIB TASHLAYDI.
   *
   * Egasining talabi: tugmalar bo'sh suhbatda turmasin — ular faqat
   * rasm o'qilgandan keyin, aynan o'sha to'plam uchun kerak. Telegram
   * klaviaturani o'zi yashirmaydi, shuning uchun aniq aytish kerak.
   */
  static hideKeyboard() {
    return { remove_keyboard: true };
  }

  static replyKeyboard(rows: string[][]) {
    return {
      keyboard: rows.map((row) => row.map((text) => ({ text }))),
      resize_keyboard: true,
      is_persistent: true,
    };
  }

  /**
   * Tugmalarni Telegram kutgan shaklga keltiradi.
   * Har tugma alohida qatorda — telefonda matni kesilmaydi.
   */
  static keyboard(buttons: Button[]) {
    return {
      inline_keyboard: buttons.map((b) => [
        { text: b.text, callback_data: b.data },
      ]),
    };
  }

  sendMessage(chatId: number, text: string, extra: Record<string, unknown> = {}) {
    return this.call<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
      ...extra,
    });
  }

  /**
   * Yuborilgan xabarni o'zgartiradi — 30 ta rasm o'qilayotganda har biriga
   * yangi xabar yubormasdan, bitta xabarda "12 / 30" ko'rsatish uchun.
   *
   * Matn o'zgarmasa Telegram xato beradi ("message is not modified"), bu
   * kutilgan holat — shuning uchun xato yutib yuboriladi.
   */
  async editMessage(chatId: number, messageId: number, text: string): Promise<void> {
    try {
      await this.call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      // Progress ko'rsatgichi — buzilsa ish to'xtamaydi
    }
  }

  /** Faylni Telegram serveridan yuklab oladi (xotiraga, diskka yozmasdan). */
  async download(
    fileId: string,
  ): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }> {
    const file = await this.call<{ file_path: string }>("getFile", { file_id: fileId });
    const res = await fetch(
      `https://api.telegram.org/file/bot${this.token}/${file.file_path}`,
      { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) },
    );
    if (!res.ok) throw new Error(`Faylni yuklab bo'lmadi: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ext = file.file_path.split(".").pop()?.toLowerCase();
    const mime =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { bytes, mime };
  }

  /**
   * Excel yoki zip faylini yuboradi (multipart — SDK'siz).
   *
   * Izoh 1024 belgidan uzun bo'lsa Telegram butun so'rovni rad etadi —
   * ya'ni FAYL HAM yuborilmaydi. Shuning uchun izoh qisqartiriladi:
   * fayl izohdan muhimroq.
   */
  async sendDocument(
    chatId: number,
    name: string,
    bytes: Uint8Array<ArrayBuffer>,
    caption = "",
  ) {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    if (caption) {
      form.set("caption", clipCaption(caption));
      form.set("parse_mode", "Markdown");
    }
    form.set(
      "document",
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      name,
    );
    // Fayl yuborish uzoqroq: 45 MB arxiv sekin ketadi
    const res = await fetch(`${this.base}/sendDocument`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS * 6),
    });
    const body = (await res.json()) as { ok: boolean; description?: string };
    if (!body.ok) throw new Error(`sendDocument: ${body.description ?? res.status}`);
  }

  /**
   * Tugma bosilganiga javob beradi — bu SHART.
   *
   * Javob bermasa Telegram tugmada aylanuvchi belgini ~30 soniya
   * ko'rsatib turadi va xodim bosilmadi deb o'ylab qayta bosadi.
   * Xato bo'lsa ham ish to'xtamasligi kerak, shuning uchun yutiladi.
   */
  async answerCallback(id: string, text = ""): Promise<void> {
    try {
      await this.call("answerCallbackQuery", {
        callback_query_id: id,
        ...(text ? { text } : {}),
      });
    } catch {
      // Javob eskirgan bo'lishi mumkin (30 soniyadan oshsa) — muhim emas
    }
  }

  /**
   * Xabardagi tugmalarni olib tashlaydi yoki almashtiradi.
   * Matnga tegmaydi — hisobot joyida qoladi.
   */
  async setButtons(
    chatId: number,
    messageId: number,
    buttons: Button[] = [],
  ): Promise<void> {
    try {
      await this.call("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup:
          buttons.length > 0 ? Telegram.keyboard(buttons) : { inline_keyboard: [] },
      });
    } catch {
      // Tugmalar — qulaylik, ish to'xtamasin
    }
  }

  async setMyCommands(commands: { command: string; description: string }[]) {
    return this.call("setMyCommands", { commands });
  }

  /**
   * Bot tavsifi — xodim botni BIRINCHI marta ochganda, hali bitta ham
   * xabar yo'q paytda, katta START tugmasi ustida ko'rinadi.
   *
   * `description` (512 belgigacha) — bo'sh suhbatda; `short_description`
   * (120 belgigacha) — bot profilida. Ikkisi ham ixtiyoriy: o'rnatilmasa
   * bot baribir ishlaydi, shuning uchun xato yutib yuboriladi.
   */
  async setDescriptions(description: string, shortDescription: string) {
    try {
      await this.call("setMyDescription", { description });
      await this.call("setMyShortDescription", {
        short_description: shortDescription,
      });
    } catch {
      // Tavsif — qulaylik, ish emas
    }
  }

  /**
   * Uzun so'rov. Telegram yangilik bo'lmasa `timeout` soniya kutib turadi,
   * shuning uchun bu tsikl protsessorni yemaydi.
   */
  async getUpdates(offset: number, timeout = 30): Promise<TgUpdate[]> {
    return this.call<TgUpdate[]>(
      "getUpdates",
      {
        offset,
        timeout,
        // Tugma bosilgani alohida tur — so'ralmasa umuman kelmaydi
        allowed_updates: ["message", "callback_query"],
      },
      // Long polling: Telegram `timeout` soniya kutadi, biz undan
      // ko'proq kutamiz — aks holda har safar o'zimiz uzib yuborardik
      (timeout + 15) * 1000,
    );
  }
}
