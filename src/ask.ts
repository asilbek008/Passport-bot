/**
 * Terminalda savol so'rash.
 *
 * NEGA ALOHIDA MODUL: Node'ning `readline/promises` da nozik xato bor —
 * stdin yopilgan bo'lsa (masalan buyruq quvur bilan berilgan yoki
 * Task Scheduler orqali ishga tushgan bo'lsa) `question()` javobni
 * KUTIB QOLADI va hech narsa bo'lmaydi: dastur jim turib, keyin
 * xatosiz chiqib ketadi. Zaxira skriptida bu eng yomoni edi —
 * "zaxira olindi" degan taassurot qoladi, aslida fayl yozilmagan.
 *
 * Shuning uchun bu yerda savol stdin yopilishini ham kuzatadi va
 * tushunarli xato beradi.
 */

import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export class AskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskError";
  }
}

export class Asker {
  private readonly rl: Interface;
  private closed = false;

  constructor() {
    this.rl = createInterface({ input: stdin, output: stdout });
    this.rl.on("close", () => {
      this.closed = true;
    });
  }

  /**
   * Savol beradi. Stdin yopilgan bo'lsa kutib qolmaydi — xato tashlaydi.
   */
  async question(prompt: string): Promise<string> {
    if (this.closed) {
      throw new AskError("Javob kutilmoqda edi, lekin kiritish yopilgan.");
    }

    const answer = await Promise.race([
      this.rl.question(prompt),
      new Promise<never>((_, reject) => {
        this.rl.once("close", () =>
          reject(new AskError("Javob kutilmoqda edi, lekin kiritish yopilgan.")),
        );
      }),
    ]);

    return answer.trim();
  }

  close() {
    this.rl.close();
  }
}

/**
 * Parolni oladi: avval muhit o'zgaruvchisidan, bo'lmasa so'raydi.
 *
 * Muhit o'zgaruvchisi avtomatik zaxira uchun kerak (Windows Task
 * Scheduler hech kimdan parol so'ramaydi). Terminalda ishlatganda esa
 * parol ekranga yozilmaydi va hech qayerda saqlanmaydi.
 */
export async function askPassword(
  asker: Asker,
  prompt: string,
  envName = "ZAXIRA_PAROL",
): Promise<string> {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  return asker.question(prompt);
}
