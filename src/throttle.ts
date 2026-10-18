/**
 * So'rovlarni vaqt bo'yicha taqsimlash va qayta urinish.
 *
 * NEGA KERAK: Gemini bepul tarifida daqiqada 10–15 so'rov chegarasi bor.
 * Xodim 30 rasm tashlasa, bot ularni ketma-ket, to'xtamasdan yuborardi va
 * 11-rasmda chekloviga urilardi — keyin butun to'plam to'xtardi. Ya'ni
 * 30 kishilik guruhni qabul qilib bo'lmasdi.
 *
 * Yechim ikki qismdan:
 *   1. TAQSIMLASH — so'rovlar orasida eng kam oraliq saqlanadi, shunda
 *      chegaraga umuman urilmaydi;
 *   2. QAYTA URINISH — baribir urilsa (boshqa xodim ham ishlayotgan
 *      bo'lsa), kutib qayta yuboriladi, to'plam to'xtamaydi.
 *
 * Soat va kutish tashqaridan beriladi, shuning uchun test tez ishlaydi.
 */

export type Clock = () => number;
export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * So'rovlarni daqiqada `perMinute` dan oshmaydigan qilib taqsimlaydi.
 *
 * Oddiy va bashorat qilinadigan usul: har so'rovdan keyingi so'rov
 * kamida `60000 / perMinute` ms kutadi. "Portlash" (burst) ruxsat
 * etilmaydi — chunki bizda tezlik emas, ishonchlilik muhim: 30 rasm
 * 3 daqiqada o'qilsa ham bo'ladi, lekin to'xtab qolmasligi kerak.
 */
export class Throttle {
  /** Hozirgi oraliq. Chegaraga urilsa KATTALASHADI, keyin asta tiklanadi. */
  private intervalMs: number;
  /** Sozlamada berilgan oraliq — tiklanish shu darajagacha boradi. */
  private readonly baseMs: number;
  private readonly now: Clock;
  private readonly sleep: Sleep;
  private nextAllowedAt = 0;
  /** Navbat: chaqiruvlar kelgan tartibda o'tadi */
  private chain: Promise<void> = Promise.resolve();

  constructor(perMinute: number, now: Clock = Date.now, sleep: Sleep = realSleep) {
    this.intervalMs = perMinute > 0 ? Math.ceil(60_000 / perMinute) : 0;
    this.baseMs = this.intervalMs;
    this.now = now;
    this.sleep = sleep;
  }

  /**
   * API chegarasiga urildik — sekinlashamiz.
   *
   * Nega kerak: xodimning tarifi qanday ekanini oldindan bilmaymiz.
   * Sozlamada tezroq qiymat turadi (ish tez bo'lsin), chegaraga urilsa
   * esa bot O'ZI sekinlashadi va to'plam to'xtamaydi.
   */
  slowDown(): void {
    if (this.intervalMs === 0) this.intervalMs = 1000;
    this.intervalMs = Math.min(this.intervalMs * 2, 15_000);
  }

  /** Muvaffaqiyatli so'rovdan keyin asta-sekin tezlashamiz. */
  speedUp(): void {
    if (this.intervalMs <= this.baseMs) return;
    this.intervalMs = Math.max(this.baseMs, Math.round(this.intervalMs * 0.8));
  }

  /** Navbat kelguncha kutadi. */
  async wait(): Promise<void> {
    if (this.intervalMs === 0) return;

    // Navbatga qo'shamiz: bir vaqtda kelgan chaqiruvlar ham
    // bir-birining ustiga tushmasligi kerak
    const mine = this.chain.then(async () => {
      const current = this.now();
      const waitFor = Math.max(0, this.nextAllowedAt - current);
      if (waitFor > 0) await this.sleep(waitFor);
      this.nextAllowedAt = Math.max(current, this.nextAllowedAt) + this.intervalMs;
    });
    this.chain = mine.catch(() => {});
    return mine;
  }

  /** Taqsimlash oralig'i (ms) — tashxis va test uchun. */
  get interval(): number {
    return this.intervalMs;
  }
}

export type RetryOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; value: T; attempts: number };

/**
 * `run` ni qayta urinib ko'radi, agar natija vaqtincha xato bo'lsa.
 *
 * `isRetryable` natijani ko'rib, qayta urinishga arziydimi deb aytadi —
 * shunda "kalit xato" kabi tuzalmaydigan xatoga bekorga urinilmaydi.
 * Kutish vaqti ikki barobar oshib boradi (1s, 2s, 4s…).
 */
export async function withRetry<T>(
  run: () => Promise<T>,
  isRetryable: (result: T) => boolean,
  options: {
    tries?: number;
    baseMs?: number;
    sleep?: Sleep;
    /**
     * Qayta urinishdan oldin chaqiriladi.
     *
     * Kerak, chunki qayta urinish uzoq cho'zilishi mumkin (muddat
     * tugashi 90 soniya). Xodimga xabar berilmasa, u "o'qilmoqda..."
     * yozuviga tikilib, bot qotib qoldi deb o'ylaydi.
     */
    onRetry?: (attempt: number, tries: number) => void | Promise<void>;
  } = {},
): Promise<RetryOutcome<T>> {
  const tries = options.tries ?? 3;
  const baseMs = options.baseMs ?? 1000;
  const sleep = options.sleep ?? realSleep;

  let last = await run();
  for (let attempt = 1; attempt < tries; attempt++) {
    if (!isRetryable(last)) return { ok: true, value: last };
    await options.onRetry?.(attempt + 1, tries);
    await sleep(baseMs * 2 ** (attempt - 1));
    last = await run();
  }

  return isRetryable(last)
    ? { ok: false, value: last, attempts: tries }
    : { ok: true, value: last };
}
