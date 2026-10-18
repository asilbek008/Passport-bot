# CLAUDE.md

Bu fayl — loyihaning **o'zgarmas talablari**. Kod o'zgaradi, bular o'zgarmaydi.
Yangi ish boshlashdan oldin shuni o'qing.

## Botdan nima kutiladi (egasining talabi)

Pasportdan **ikki narsa** kerak, boshqasi emas:

1. **Ism va Familiya** — Excel jadvalda faqat shu ikki ustun
   (`src/excel.ts` `COLUMNS`). Jadvalga yangi ustun qo'shmang.
2. **Pasportning iloji boricha TO'LIQ holda kesilgan rasmi** — arxivdagi
   har rasm hujjatning o'zi bo'lishi kerak: stol va qo'l chiqib ketgan,
   lekin hujjatning **birorta cheti kesilmagan**.

Shuning uchun ikkitasi orasida tanlov bo'lsa: **to'liqlik ustun**.
Chetda ingichka stol tasmasi qolishi — kamchilik; pasportning qirrasi
yoki MRZ qatorining bir qismi kesilib ketishi — **xato**. Qirqish
sozlamalari (`CROP_MARGIN_PCT`, `plausible`, `refineBox` ning `capped`
va `collapsed` belgilari) shu qoida bo'yicha tanlangan.

Bu `src/crop.ts` dagi eski qoidaning davomi: **shubha bo'lsa —
qirqmaymiz**. Yarmi kesilgan pasport qirqilmagan kadrdan yomonroq:
ma'lumot yo'qoladi va xodim buni darhol sezmaydi.

Tekshiruvi: `test/crop.test.ts` — "hujjat hech qachon kesilmaydi"
(tasodifiy holatlar; model chegarasi ±12% xato qilgan holatlarda ham
hujjatning hamma pikseli natijada qolishi tekshiriladi).

## Qolgan ma'lumot nega bazada bor

Pasport raqami, tug'ilgan sana, amal qilish muddati va viza jadvalga
chiqmaydi, lekin bazada saqlanadi — ularsiz egasining o'zi so'ragan
ishlar bo'lmaydi:

- MRZ **tekshiruv raqamlari** (xato o'qishni ushlash) pasport raqami,
  sana va muddat ustida ishlaydi;
- `/ogohlik` — pasporti tez tugaydiganlar;
- `/viza`, `/vizalar`, `/vizasiz` — viza holati;
- `/ochir AB1234567` — bitta yozuvni raqami bo'yicha o'chirish.

Ya'ni bu ma'lumot **ichki ish uchun**, chiqib ketadigan jadval uchun emas.

## Maxfiylik (o'zgarmas)

- `data/photos/` da mijozlarning pasport skanlari, `data/umra.db` da
  pasport ma'lumoti turadi. Ochiq joyga zaxira qilinmaydi.
- Jurnalga (`console.*`) faqat chat raqami va xato **turi** yoziladi —
  ism, pasport raqami, MRZ matni va xato matnining o'zi hech qachon.
- Hisobotdagi "Tashxis" qatorida ham hujjat ma'lumoti yo'q: faqat
  hujjat turi, qatorlar soni, chegara bor-yo'qligi va urinishlar izi.
- Kalit va token kodda bo'lmaydi — faqat `.env` da. Repo ochiq.
- Xodimlarning Telegram chat raqamlari repoga yozilmaydi.
