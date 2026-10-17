/**
 * Tarmoq qatlamini almashtiradi: botning KODI o'zgarmaydi, faqat
 * `api.telegram.org` va Gemini so'rovlari mahalliy soxta serverga boradi.
 *
 * `--import` bilan yuklanadi, ya'ni botning birorta moduli import
 * qilinmasidan oldin ishlaydi. Shu tufayli sinovda haqiqiy token ham,
 * haqiqiy kalit ham, internet ham kerak emas.
 */
const PORT = process.env.SINOV_PORT;
const real = globalThis.fetch;

function rewrite(url) {
  const file = url.match(/^https:\/\/api\.telegram\.org\/file\/bot[^/]+\/(.+)$/);
  if (file) return `http://127.0.0.1:${PORT}/file/${file[1]}`;
  const api = url.match(/^https:\/\/api\.telegram\.org\/bot[^/]+\/(.+)$/);
  if (api) return `http://127.0.0.1:${PORT}/tg/${api[1]}`;
  if (url.includes("generativelanguage.googleapis.com")) {
    return `http://127.0.0.1:${PORT}/gemini`;
  }
  // Boshqa manzil bo'lmasligi kerak. Bo'lsa — sinov haqiqiy tarmoqqa
  // chiqib ketmasin: xato beramiz, jimgina o'tib ketmasin.
  return null;
}

globalThis.fetch = (input, init) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const target = rewrite(url);
  if (!target) {
    return Promise.reject(
      new Error(`Sinovda ruxsat berilmagan manzil: ${url.slice(0, 80)}`),
    );
  }
  if (typeof input === "string" || input instanceof URL) return real(target, init);
  return real(new Request(target, input), init);
};
