/**
 * Telegram Bot API bilan ishlash. Tashqi kutubxona yo'q — faqat fetch.
 * Bot uzun so'rov (long polling) bilan ishlaydi, shuning uchun ochiq
 * domen, webhook va HTTPS sertifikat kerak emas: oddiy kompyuterda ham turadi.
 */

export type TgUpdate = {
  update_id: number;
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

export class Telegram {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  private get base() {
    return `https://api.telegram.org/bot${this.token}`;
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
      });
    } catch (err) {
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
    );
    if (!res.ok) throw new Error(`Faylni yuklab bo'lmadi: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ext = file.file_path.split(".").pop()?.toLowerCase();
    const mime =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { bytes, mime };
  }

  /** Excel faylini yuboradi (multipart — SDK'siz). */
  async sendDocument(
    chatId: number,
    name: string,
    bytes: Uint8Array<ArrayBuffer>,
    caption = "",
  ) {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    if (caption) {
      form.set("caption", caption);
      form.set("parse_mode", "Markdown");
    }
    form.set(
      "document",
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      name,
    );
    const res = await fetch(`${this.base}/sendDocument`, { method: "POST", body: form });
    const body = (await res.json()) as { ok: boolean; description?: string };
    if (!body.ok) throw new Error(`sendDocument: ${body.description ?? res.status}`);
  }

  async setMyCommands(commands: { command: string; description: string }[]) {
    return this.call("setMyCommands", { commands });
  }

  /**
   * Uzun so'rov. Telegram yangilik bo'lmasa `timeout` soniya kutib turadi,
   * shuning uchun bu tsikl protsessorni yemaydi.
   */
  async getUpdates(offset: number, timeout = 30): Promise<TgUpdate[]> {
    return this.call<TgUpdate[]>("getUpdates", {
      offset,
      timeout,
      allowed_updates: ["message"],
    });
  }
}
