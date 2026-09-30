/**
 * Rasmlarni to'plab, birga qayta ishlash.
 *
 * Muammo: xodim 30 pasportni albom qilib yuborsa, Telegram ularni 30 ta
 * ALOHIDA xabar qilib beradi. Har biriga alohida javob yozilsa, suhbat
 * o'qib bo'lmas holga keladi va xodim qaysi rasm o'tmaganini topa olmaydi.
 *
 * Yechim: rasmlar navbatga yig'iladi va xodim `waitMs` davomida yangi rasm
 * yubormasa, hammasi birga o'qilib, BITTA hisobot beriladi.
 *
 * Bu modul Telegram va bazani bilmaydi — shuning uchun testdan o'tadi.
 */

export type BatchHandler = (chatId: number, fileIds: string[]) => Promise<void>;

export class Batcher {
  private readonly waitMs: number;
  private readonly handler: BatchHandler;
  /** Har chat uchun kutayotgan rasmlar */
  private readonly queues = new Map<number, string[]>();
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  /** Hozir qayta ishlanayotgan chatlar — ikki marta boshlanmasligi uchun */
  private readonly running = new Set<number>();

  constructor(waitMs: number, handler: BatchHandler) {
    this.waitMs = waitMs;
    this.handler = handler;
  }

  /** Rasmni navbatga qo'yadi va "jimlik" taymerini qaytadan boshlaydi. */
  add(chatId: number, fileId: string): void {
    const queue = this.queues.get(chatId);
    if (queue) queue.push(fileId);
    else this.queues.set(chatId, [fileId]);

    const existing = this.timers.get(chatId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.timers.delete(chatId);
      // Xato bo'lsa ham tsikl to'xtamasligi kerak
      void this.flush(chatId);
    }, this.waitMs);
    // Taymer tufayli protsess ushlanib turmasin
    timer.unref?.();
    this.timers.set(chatId, timer);
  }

  /** Navbatda nechta rasm turgani (test va tashxis uchun). */
  pending(chatId: number): number {
    return this.queues.get(chatId)?.length ?? 0;
  }

  /**
   * Navbatni hozir qayta ishlaydi.
   *
   * Qayta ishlash davomida yangi rasm kelsa (xodim davom etayotgan bo'lsa),
   * tsikl uni ham oladi — shuning uchun `while`. Ayni chat uchun ikkinchi
   * chaqiruv darhol qaytadi: ishni birinchi chaqiruv oxiriga yetkazadi.
   */
  async flush(chatId: number): Promise<void> {
    if (this.running.has(chatId)) return;

    const timer = this.timers.get(chatId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(chatId);
    }

    this.running.add(chatId);
    try {
      while (true) {
        const queue = this.queues.get(chatId);
        if (!queue || queue.length === 0) break;
        // Navbatni bo'shatib olamiz: qayta ishlash vaqtida kelgan rasmlar
        // keyingi aylanishga tushadi
        this.queues.set(chatId, []);
        await this.handler(chatId, queue);
      }
    } finally {
      this.queues.delete(chatId);
      this.running.delete(chatId);
    }
  }

  /** Bot to'xtaganda kutayotgan taymerlarni bekor qiladi. */
  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}

/**
 * Uzun xabarni Telegram chegarasiga (4096 belgi) sig'adigan bo'laklarga
 * bo'ladi. Qatorlar o'rtasidan kesilmaydi — 50 kishilik hisobot o'qilishi
 * kerak, shuning uchun bo'linish joyi qator oxiri bo'ladi.
 */
export function splitMessage(text: string, limit = 3900): string[] {
  if (text.length <= limit) return [text];

  const parts: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    // Bitta qatorning o'zi chegaradan uzun bo'lsa — majburan kesamiz
    if (line.length > limit) {
      if (current) {
        parts.push(current);
        current = "";
      }
      for (let i = 0; i < line.length; i += limit) {
        parts.push(line.slice(i, i + limit));
      }
      continue;
    }

    if (current.length + line.length + 1 > limit) {
      parts.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }

  if (current) parts.push(current);
  return parts;
}
