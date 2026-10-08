/**
 * Bot bir vaqtda FAQAT BITTA bo'lib ishlashi.
 *
 * NEGA KERAK: avtomatik ishga tushirish yoqilgandan keyin bot orqa fonda
 * ishlab turadi. Xodim buni bilmasdan `2-boshlash.bat` ni ham bossa,
 * ikkita bot bitta tokenga ulanadi. Telegram bunda `getUpdates` ni rad
 * etadi:
 *
 *   409 Conflict: terminated by other getUpdates request
 *
 * Natijada ikkisi ham to'liq ishlamaydi: xabarlar yo'qoladi, rasm yarim
 * o'qiladi — va xato matni buning sababini umuman tushuntirmaydi.
 *
 * Yechim: ishga tushganda qulf fayliga o'z raqamini (pid) yozamiz.
 * Fayl allaqachon bor va o'sha dastur hali ishlayotgan bo'lsa — jim
 * chiqamiz va NIMA bo'lganini o'zbekcha aytamiz.
 *
 * Kompyuter to'satdan o'chsa qulf fayli qolib ketadi. Bu muammo emas:
 * fayldagi pid bilan hech qanday dastur ishlamayotgani tekshiriladi va
 * eski qulf olib tashlanadi.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type LockResult =
  | { ok: true; release: () => void }
  /** Boshqa nusxa ishlayapti */
  | { ok: false; pid: number };

/** Shu raqamli dastur hozir ishlayaptimi. */
function alive(pid: number): boolean {
  try {
    // 0 — hech qanday signal yubormaydi, faqat borligini tekshiradi
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM — dastur bor, lekin boshqa foydalanuvchining: ya'ni ishlayapti
    return (err as { code?: string }).code === "EPERM";
  }
}

/**
 * Qulfni oladi. Muvaffaqiyatli bo'lsa `release()` qaytaradi — uni
 * to'xtashda chaqirish kerak.
 */
export function lock(path: string): LockResult {
  if (existsSync(path)) {
    const text = (() => {
      try {
        return readFileSync(path, "utf8").trim();
      } catch {
        return "";
      }
    })();
    const pid = Number(text);

    if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && alive(pid)) {
      return { ok: false, pid };
    }
    // Eski qulf: kompyuter o'chib ketgan yoki dastur majburan to'xtatilgan
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, String(process.pid));

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      // Faqat O'Z qulfimizni olib tashlaymiz
      const current = Number(readFileSync(path, "utf8").trim());
      if (current === process.pid) rmSync(path, { force: true });
    } catch {
      // Fayl allaqachon yo'q — muammo emas
    }
  };

  return { ok: true, release };
}
