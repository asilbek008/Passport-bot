# Umra hujjatlari boti

Tashkilot xodimi pasport rasmlarini Telegram botga yuboradi — bot ulardan viza
uchun kerakli ma'lumotni o'qib, **Excel jadval** qilib beradi.

Bot **ochiq emas**: faqat `OPERATORS` ro'yxatidagi xodimlar bilan ishlaydi.

---

## Nima uchun bu bot boshqacha: MRZ va tekshiruv raqamlari

Pasportning ma'lumot sahifasining pastida, ID kartaning orqasida maxsus
shriftdagi qatorlar bor — **MRZ** (Machine Readable Zone). U ICAO 9303
standarti bo'yicha yozilgan va ichida **tekshiruv raqamlari** bor.

Shuning uchun bot shunday qurilgan:

```
Rasm  →  [ Claude ]  →  MRZ qatorlari  →  [ oddiy kod ]  →  ma'lumot
             faqat        (matn)          tekshiruv raqamlari
          ko'chirib                       bilan tasdiqlanadi
           yozadi
```

Model **faqat ko'chirib yozadi**. Ma'lumotni ajratish, sanani hisoblash va
tekshirish — `src/mrz.ts` dagi oddiy, determinlashgan kodda.

**Nega bu muhim:** agar modelga «pasport raqamini top» deb aytilsa, u bitta
belgini xato o'qib, ishonch bilan xato raqam berishi mumkin va biz bilmay
qolamiz. Tekshiruv raqami esa xatoni ochib beradi — bot bunda ma'lumotni
**saqlamaydi** va xodimga «2-rasm o'qilmadi, qaytadan suratga oling» deydi.

Xato pasport raqami = xato viza = buzilgan safar. Shuning uchun bot
«taxminan o'qish»dan ko'ra «o'qilmadi» deyishni tanlaydi.

Qo'llab-quvvatlanadigan formatlar:

| Format | Hujjat | Tuzilishi |
|---|---|---|
| TD3 | Pasport (biometrik va qizil/zagran) | 2 qator × 44 belgi |
| TD1 | ID karta | 3 qator × 30 belgi |
| TD2 | Kamroq uchraydigan hujjatlar | 2 qator × 36 belgi |

---

## O'rnatish — uch buyruq

Node.js **22.6 yoki yuqori** kerak (`node:sqlite` va TypeScript'ni to'g'ridan-to'g'ri
ishga tushirish uchun). [nodejs.org](https://nodejs.org) dan LTS nusxasini oling.

```bash
npm install     # bog'liqliklarni o'rnatadi
npm run setup   # ikkita kalitni so'raydi va .env ni o'zi to'ldiradi
npm start       # ishga tushadi
```

`npm run setup` sizdan faqat **ikki narsa** so'raydi — ularni men olib bera
olmayman, ikkisi ham sizning hisobingizga tegishli:

| Nima | Qayerdan |
|---|---|
| **Bot tokeni** | Telegramda [@BotFather](https://t.me/BotFather) → `/newbot` → nom bering → token beradi |
| **Anthropic API kaliti** | [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key |

Qolgan sozlamalarning hammasi standart qiymati bilan ishlaydi — tegmasangiz ham bo'ladi.

### Birinchi ishga tushirish: ruxsat olish

`npm start` dan keyin terminalda shunday chiqadi:

```
──────────────────────────────────────────────────────────
  BIRINCHI ISHGA TUSHIRISH

  1. Telegramda botni oching:  https://t.me/sizning_botingiz
  2. Unga quyidagi kodni yuboring:

        K7M2QP

  Shundan keyin botdan foydalanishingiz mumkin.
──────────────────────────────────────────────────────────
```

Kodni botga yuborsangiz — tamom, ruxsat oldingiz. Chat raqamini qo'lda
topish, `.env` ni tahrirlash va botni qayta ishga tushirish **kerak emas**:
ruxsat bazada saqlanadi.

Kod faqat terminalda ko'rinadi, ya'ni uni serverga/kompyuterga kirish huquqi
bor odam — ya'ni siz — ko'radi. Shuning uchun bu xavfsiz.

### Hamkasbni qo'shish

Botda `/kod` yozasiz — bir martalik kod beradi. Hamkasbingiz botni ochib shu
kodni yuborsa, u ham ruxsat oladi. `/xodimlar` — ro'yxat, `/xodim_ochir <raqam>`
— ruxsatni olib tashlash.

---

## Ishlatish

```
/guruh Umra mart          ← qaysi safar guruhi bilan ishlayotganingiz
<pasport rasmlarini yuborasiz>
/excel                    ← tayyor jadval
```

Rasmlarni **bittalab yoki albom qilib** (bir necha o'nlab) yuborish mumkin.
Bot ularni yig'ib, birga o'qiydi va **bitta hisobot** beradi:

```
Natija: 28 / 30 o'qildi · guruh: Umra mart

✅ KARIMOV AZIZ — AB1234567
✅ SALIMOVA NARGIZA — AB7654321
♻️ TOSHEV BOBUR — AB1112223 (yangilandi)
...

Diqqat:
🟡 ALIYEV SARDOR — pasportga 4 oy qoldi (kamida 6 kerak)
🔴 USMONOV JAHON — pasport muddati tugagan

O'qilmadi (2) — qaytadan suratga oling:
❌ 7-rasm — MRZ qatorlari o'qilmadi (xira yoki kesilgan)
❌ 19-rasm — tekshiruvdan o'tmadi (hujjat raqami) — saqlanmadi
```

### Barcha buyruqlar

| Buyruq | Nima qiladi |
|---|---|
| `/guruh <nom>` | Joriy safar guruhini belgilaydi |
| `/guruh` | Joriy guruhni ko'rsatadi |
| `/guruh -` | Guruhni olib tashlaydi |
| `/guruhlar` | Hamma guruh va kishilar soni |
| `/royxat` | Joriy guruhdagi kishilar |
| `/excel` | Joriy guruhni Excel qilib beradi |
| `/excel hammasi` | Barcha guruhlarni bitta faylda |
| `/ogohlik` | Pasporti tez tugaydiganlar |
| `/ochir AB1234567` | Bitta yozuvni o'chiradi |
| `/guruhni_ochir Umra mart` | Butun guruhni o'chiradi |
| `/tozalash` | Saqlash muddati o'tganlarni o'chiradi |
| `/kod` | Yangi xodim uchun bir martalik kod |
| `/xodimlar` | Ruxsat berilganlar ro'yxati |
| `/xodim_ochir 123456789` | Ruxsatni olib tashlaydi |

### Excel faylda nima bo'ladi

Familiya, Ism, Jinsi, Tug'ilgan sana, Fuqaroligi, Hujjat turi, Pasport
raqami, Berilgan sana, Amal muddati, **Qolgan (oy)**, JSHSHIR, Tug'ilgan joy,
Kim bergan, Qabul qilingan vaqt, Izoh.

**Qizil qator** — pasport muddati tugagan. **Sariq qator** — `MIN_PASSPORT_MONTHS`
(standart 6) oydan kam qolgan. Shunda faylni ochishingiz bilan kimga
qo'ng'iroq qilish kerakligini ko'rasiz, 50 qatorni ko'zdan kechirmasdan.

### Yaxshi rasm uchun

- yorug' joyda, soyasiz
- pasport tekis va to'liq ko'rinsin, burchaklari kesilmasin
- **pastdagi ikki qator aniq bo'lsin** — bot asosan shuni o'qiydi
- telefonni qiyshaytirmasdan, to'g'ri ushlab

---

## Maxfiylik

Bu mijozlarning shaxsiy hujjatlari. Bot shunga qarab qurilgan:

| | |
|---|---|
| **Rasm** | Saqlanmaydi. O'qilgach xotiradan ham tozalanadi (`bytes.fill(0)`), diskka hech qachon yozilmaydi |
| **Kim ko'radi** | Faqat `OPERATORS` dagi xodimlar. Bot ochiq emas |
| **Jurnal** | Faqat chat raqami. Ism, pasport raqami, xato matni — **yozilmaydi** |
| **Saqlanmaydi** | Telegram ismi, username, telefon raqami |
| **Muddat** | `RETENTION_DAYS` (standart 180) kundan keyin avtomatik o'chadi, kuniga bir marta tekshiriladi |
| **Baza** | Bitta fayl (`data/umra.db`), tashqi serverga chiqmaydi |
| **Eksport jurnali** | Kim qachon nechta yozuvni Excel qilib olgani qayd etiladi |

Nimalar sizning zimmangizda:

- **Mijozdan rozilik.** Bot mijoz bilan gaplashmaydi — hujjatni siz olasiz.
  Mijoz pasportini viza uchun berganini va u shu maqsadda ishlatilishini
  bilishi kerak. Ma'lumotni boshqa maqsadda ishlatish yoki uchinchi shaxsga
  berish — bu botning ishi emas va qonunga ham tegishli.
- **Baza faylini himoyalash.** `data/umra.db` ichida mijozlarning pasport
  ma'lumoti bor. Umumiy kompyuterda qoldirmang, zaxira nusxasini ochiq joyga
  yuklamang.
- **Safar tugagach o'chirish.** `/guruhni_ochir <nom>` — ma'lumot kerak
  bo'lmasa, saqlab turishning ma'nosi yo'q.
- **`.env` ni sir tutish.** Ichida bot tokeni va API kaliti bor.

---

## Loyiha tuzilishi

```
src/
  mrz.ts        MRZ o'qish va tekshiruv raqamlari (toza kod, testlar shu yerda)
  vision.ts     Claude'ga rasm yuborib, MRZ qatorlarini matn qilib olish
  store.ts      SQLite (node:sqlite — tashqi kutubxonasiz)
  excel.ts      .xlsx tuzish
  batch.ts      Albomdagi rasmlarni yig'ib, birga o'qish
  bot.ts        Suhbat mantig'i (bog'liqliklar tashqaridan — testdan o'tadi)
  telegram.ts   Bot API (faqat fetch, SDK'siz)
  invites.ts    Xodimni qo'shish uchun bir martalik kodlar
  env.ts        .env faylini o'qish (dotenv paketisiz)
  text.ts       Barcha o'zbekcha matnlar
  config.ts     Muhit o'zgaruvchilari
  index.ts      Ishga tushirish, uzun so'rov tsikli
scripts/
  setup.ts      `npm run setup` — .env ni savol-javob bilan to'ldiradi
```

Tekshirish:

```bash
npm test         # 77 test
npm run typecheck
```

### Texnik qarorlar

- **Uzun so'rov (long polling), webhook emas** — ochiq domen, HTTPS sertifikat
  va server kerak emas. Oddiy kompyuterda `npm start` bilan ishlaydi.
- **`node:sqlite`** — Node'ning o'zida bor. Baza uchun tashqi kutubxona ham,
  server ham o'rnatilmaydi.
- **`write-excel-file`**, `xlsx` (SheetJS) emas — oxirgisida ma'lum zaifliklar bor.
- **Rasmlar ketma-ket o'qiladi**, parallel emas: API chekloviga urilmaslik va
  xato rasmni aniq topish uchun.
- **`messages.create`, `messages.parse` emas** — SDK'ning hozirgi nashrida
  (`0.70`) `parse()` yordamchisi yo'q. Model javobi `zod` bilan tekshiriladi.
- **Bir pasport bir marta**: `(doc_number, birth_date)` unikal. Xodim 50 rasmni
  ikki marta tashlasa ham ro'yxat ikkilanmaydi — eski yozuv yangilanadi.

---

## Tez-tez uchraydigan holatlar

**«Bu bot tashkilotning ichki vositasi»** — sizda hali ruxsat yo'q. Terminalda
chiqqan kodni botga yuboring. Kod eskirgan bo'lsa (60 daqiqa), botni `Ctrl+C`
bilan to'xtatib qayta ishga tushirsangiz yangi kod chiqadi.

**«Telegramga ulanib bo'lmadi — tarmoq muammosi»** — token emas, internet yoki
faervol. Ish joyidagi tarmoq Telegramni to'sayotgan bo'lishi mumkin; mobil
internet yoki VPN bilan sinab ko'ring.

**«BOT_TOKEN qabul qilinmadi (401)»** — token xato ko'chirilgan. @BotFather →
`/mybots` → botingiz → *API Token* dan qayta ko'chiring.

**Ko'p rasm «o'qilmadi» bo'lyapti** — MRZ qatorlari xira. Rasmni yorug'roq
joyda, pasportni tekis qo'yib oling. Skanerdan o'tkazilgan nusxa eng yaxshi
natija beradi.

**«Tekshiruvdan o'tmadi»** — bu xato emas, himoya: bot bitta belgini noto'g'ri
o'qiganini o'zi aniqladi va ishonchsiz ma'lumotni saqlamadi. Qaytadan suratga oling.

**Qimmatga tushyapti** — `.env` da `MODEL=claude-haiku-4-5` qilib ko'ring,
lekin avval 10–15 pasportda sinab, natijalarni qo'lda tekshirib chiqing.

**Bot to'xtab qoldi** — `npm start` ni qaytadan ishga tushiring. Uzilish
vaqtida kelgan xabarlar Telegram serverida turadi va bot qaytgach o'qiladi.
