/**
 * Bir martalik kodlar — xodimni botga qo'shish uchun.
 *
 * Nega kod: chat id'ni qo'lda topib `.env` ga yozish va botni qayta ishga
 * tushirish noqulay. Kod bilan: terminalda (yoki xodimning suhbatida) kod
 * chiqadi, yangi xodim uni botga yuboradi va ro'yxatga tushadi.
 *
 * Nega xavfsiz: birinchi kod FAQAT terminalda ko'rinadi, ya'ni uni
 * serverga/kompyuterga kirish huquqi bor odam — egasining o'zi — ko'radi.
 * Keyingi kodlarni esa allaqachon ruxsati bor xodim yaratadi.
 *
 * Kodlar xotirada turadi: bot to'xtasa hammasi yo'qoladi. Bu ataylab —
 * eskirgan kod diskda qolib ketmaydi.
 */

/** O'qishda chalkashmaydigan belgilar: 0/O, 1/I/L yo'q. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function randomCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

type Invite = { expiresAt: number };

export class Invites {
  private readonly codes = new Map<string, Invite>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  /** @param ttlMinutes Kod shuncha daqiqadan keyin eskiradi. */
  constructor(ttlMinutes = 60, now: () => number = Date.now) {
    this.ttlMs = ttlMinutes * 60 * 1000;
    this.now = now;
  }

  /** Yangi kod yaratadi va qaytaradi. */
  create(): string {
    this.sweep();
    let code = randomCode();
    // Takrorlanib qolmasin (ehtimoli juda kichik, lekin tekshirish arzon)
    while (this.codes.has(code)) code = randomCode();
    this.codes.set(code, { expiresAt: this.now() + this.ttlMs });
    return code;
  }

  /**
   * Kodni ishlatadi. To'g'ri va eskirmagan bo'lsa `true` qaytaradi va kod
   * o'chadi (bir martalik). Katta-kichik harf va bo'sh joy farq qilmaydi.
   */
  claim(text: string): boolean {
    this.sweep();
    const code = text.trim().toUpperCase().replace(/\s+/g, "");
    if (!this.codes.has(code)) return false;
    this.codes.delete(code);
    return true;
  }

  /** Kutayotgan kodlar soni. */
  get size(): number {
    this.sweep();
    return this.codes.size;
  }

  /** Eskirgan kodlarni olib tashlaydi. */
  private sweep(): void {
    const now = this.now();
    for (const [code, invite] of this.codes) {
      if (invite.expiresAt <= now) this.codes.delete(code);
    }
  }
}
