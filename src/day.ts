/**
 * Kun — O'zbekiston vaqti bo'yicha.
 *
 * MUAMMO: hamma joyda `toISOString().slice(0, 10)` ishlatilardi, u esa
 * UTC beradi. O'zbekiston UTC+5, shuning uchun tunda — 00:00 dan 05:00
 * gacha — UTC hali KECHAGI kunda bo'ladi. Natijada:
 *
 *   • tungi smenada tayyorlangan faylga kechagi sana yozilardi
 *     (`umra-pasportlar-2026-10-07.xlsx`, aslida 8-oktabr);
 *   • kunlik chegara yarim kechada emas, ertalab soat 5 da yangilanardi.
 *
 * Yechim: kunni `Intl` orqali `Asia/Tashkent` mintaqasida olamiz. Bu
 * qo'lda "+5 soat" qo'shishdan ishonchliroq — mintaqa qoidasi o'zgarsa
 * (yoki bot boshqa mamlakatdagi serverda ishlasa) baribir to'g'ri bo'ladi.
 */

/** Soat mintaqasi. Kerak bo'lsa `TZ_NAME` bilan almashtiriladi. */
export const TIMEZONE = process.env.TZ_NAME?.trim() || "Asia/Tashkent";

// `en-CA` aynan `2026-10-08` ko'rinishida beradi — qo'lda yig'ish shart emas
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Sanani `2026-10-08` qilib qaytaradi (O'zbekiston kuni bo'yicha). */
export function day(at: Date = new Date()): string {
  return dayFormat.format(at);
}
