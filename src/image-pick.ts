/**
 * Telegramdan qaysi rasmni olish kerakligini tanlash.
 *
 * MUAMMO: README da "sifat buzilmasligi uchun faylni *File* sifatida
 * yuboring" deb yozilgan edi. Lekin telefon rasmi 4 MB bo'ladi, base64 ga
 * aylanganda ~5.3 MB — bu API'ning bir rasmga chegarasidan oshadi va
 * tushunarsiz xato beradi. Ustiga ortiqcha token sarflanadi.
 *
 * YECHIM (rasm kutubxonasisiz): Telegram oddiy rasmni bir necha o'lchamda
 * beradi va har birining hajmini aytadi. Shunda chegaradan OSHMAYDIGAN
 * eng kattasini tanlaymiz. Fayl sifatida yuborilgan va juda katta rasmni
 * esa rad etamiz — xodimga "oddiy rasm sifatida yuboring" deyiladi, bu
 * tushunarsiz API xatosidan yaxshiroq.
 *
 * MRZ uchun bu yetarli: Telegramning eng katta oddiy nusxasi ~1280px,
 * MRZ qatorlari esa shunda ham o'qiladi.
 */

export type PhotoSize = {
  file_id: string;
  file_size?: number;
  width: number;
  height: number;
};

export type Pick =
  | { kind: "ok"; fileId: string; width: number; bytes: number | null }
  /** Hamma nusxa chegaradan katta — rasmni qayta yuborish kerak */
  | { kind: "too_big"; bytes: number };

/**
 * Chegaradan oshmaydigan eng katta nusxani tanlaydi.
 *
 * Hajmi noma'lum bo'lsa eng KATTASI olinadi. Nega: Telegram oddiy rasmni
 * allaqachon siqib, ~1280px gacha kichraytirib beradi (bir necha yuz KB),
 * ya'ni chegaraga sig'adi. Ehtiyot yuzasidan kichikrog'ini olish esa
 * 90px miniatyurani tanlab qo'yishi mumkin — unda MRZ umuman o'qilmaydi.
 *
 * Hajm chegarasi asosan FAYL sifatida yuborilgan (siqilmagan) rasm uchun
 * muhim — u `documentFits` da tekshiriladi.
 */
export function pickPhoto(variants: PhotoSize[], maxBytes: number): Pick | null {
  if (variants.length === 0) return null;

  // Kattadan kichikka
  const sorted = [...variants].sort((a, b) => b.width - a.width);

  // Hajmi ma'lum va sig'adigan eng kattasi
  const fits = sorted.find(
    (v) => typeof v.file_size === "number" && v.file_size <= maxBytes,
  );
  if (fits) {
    return {
      kind: "ok",
      fileId: fits.file_id,
      width: fits.width,
      bytes: fits.file_size ?? null,
    };
  }

  // Hech birining hajmi aytilmagan — eng kattasini olamiz
  if (sorted.every((v) => typeof v.file_size !== "number")) {
    const largest = sorted[0];
    return { kind: "ok", fileId: largest.file_id, width: largest.width, bytes: null };
  }

  // Hajmi ma'lum bo'lganlarning hammasi katta: hajmi aytilmagani bo'lsa,
  // o'shani olamiz (sig'ishi ehtimoli bor), aks holda rad etamiz
  const unknown = sorted.find((v) => typeof v.file_size !== "number");
  if (unknown) {
    return { kind: "ok", fileId: unknown.file_id, width: unknown.width, bytes: null };
  }

  const smallest = sorted[sorted.length - 1];
  return { kind: "too_big", bytes: smallest.file_size ?? 0 };
}

/**
 * Fayl sifatida yuborilgan rasm chegaraga sig'adimi.
 * `file_size` berilmasa, yuklab olgandan keyin baribir tekshiriladi.
 */
export function documentFits(
  doc: { file_size?: number },
  maxBytes: number,
): { ok: true } | { ok: false; bytes: number } {
  if (typeof doc.file_size !== "number") return { ok: true };
  return doc.file_size <= maxBytes ? { ok: true } : { ok: false, bytes: doc.file_size };
}

/** Baytlarni odam o'qiydigan ko'rinishga keltiradi. */
export function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
