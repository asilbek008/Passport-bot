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
| TD3 | Pasport (biometrik va zagran) | 2 qator × 44 belgi |
| TD1 | ID karta | 3 qator × 30 belgi |
| TD2 | Kamroq uchraydigan hujjatlar | 2 qator × 36 belgi |

## Hujjat turi va davlat

Bot har hujjatning **turini va davlatini MRZ'dan hisoblaydi** — model taxmin
qilmaydi:

- **tur** — hujjat kodidan: `P…` pasport, `I…`/`AC` ID karta, `V…` viza
  (ICAO 9303). Diplomatik (`PD`) va xizmat (`PS`) pasportlari ham belgilanadi;
- **davlat** — fuqarolik kodidan: `UZB`, `TJK`, `KGZ`, `KAZ`, `TKM` va boshqalar
  (ISO 3166-1). Ro'yxatda yo'q davlat uchun kodning o'zi qoldiriladi —
  o'ylab topilgan nom yozilmaydi.

Natijada: `O'zbek pasporti`, `Tojik ID kartasi`, `Qozoq pasporti (diplomatik)`.
Shu nom Excelda ustun bo'lib chiqadi va rasm faylining nomiga kiradi.

> **Muqova rangi haqida.** «Qizil pasport» — muqovaning rangi, u MRZ'da yo'q
> va rasmdan ishonchli aniqlab bo'lmaydi, shuning uchun bot bunday deb
> belgilamaydi. Buning o'rniga aniq bilinadigan narsa yoziladi: **pasportmi
> yoki ID kartami** va **qaysi davlatning** hujjati. Viza arizasi uchun aynan
> shu ikkisi talab qilinadi. Agar sizga eski/yangi pasportni ajratish kerak
> bo'lsa — ayting, berilgan sana bo'yicha qo'shamiz.

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
| **Rasm o'qish kaliti** | **Gemini:** [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (kalit `AIza` bilan boshlanadi) · **yoki Claude:** [console.anthropic.com](https://console.anthropic.com) → API Keys |

Rasm o'qish uchun **bittasi yetarli**. `PROVIDER=gemini` yoki
`PROVIDER=anthropic` bilan tanlanadi; bo'sh qoldirsangiz mavjud kalit
bo'yicha o'zi tanlaydi.

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
/zip                      ← rasmlar + jadval bitta arxivda
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
| `/zip` | Joriy guruh: rasmlar + Excel bitta arxivda |
| `/zip hammasi` | Barcha guruhlar arxivda (har biri o'z papkasida) |
| `/viza <pasport> <turi>` | Viza belgilaydi |
| `/vizalar` | Kimda qanday viza bor |
| `/vizasiz` | Vizasi belgilanmaganlar |
| `/vizani_ochir <pasport>` | Viza ma'lumotini olib tashlaydi |
| `/ogohlik` | Pasporti tez tugaydiganlar |
| `/ochir AB1234567` | Bitta yozuvni o'chiradi |
| `/guruhni_ochir Umra mart` | Butun guruhni o'chiradi |
| `/tozalash` | Saqlash muddati o'tganlarni o'chiradi |
| `/kod` | Yangi xodim uchun bir martalik kod |
| `/xodimlar` | Ruxsat berilganlar ro'yxati |
| `/xodim_ochir 123456789` | Ruxsatni olib tashlaydi |

### Excel faylda nima bo'ladi

Guruh, **Familiya**, **Ism**, **Hujjat turi**, **Davlat**, Jinsi, Tug'ilgan
sana, Fuqaroligi, Kod, Pasport raqami, Berilgan sana, Amal muddati,
**Qolgan (oy)**, **Viza**, **Viza raqami**, **Viza muddati**, **Viza manbasi**,
JSHSHIR, Tug'ilgan joy, Kim bergan, Qabul qilingan vaqt, Izoh.

**Qizil qator** — pasport muddati tugagan. **Sariq qator** — `MIN_PASSPORT_MONTHS`
(standart 6) oydan kam qolgan. Shunda faylni ochishingiz bilan kimga
qo'ng'iroq qilish kerakligini ko'rasiz, 50 qatorni ko'zdan kechirmasdan.

### Zip arxivda nima bo'ladi

`/zip` shunday arxiv beradi:

```
umra-mart/
  KARIMOV_AZIZ_uzb-pasport.jpg
  SALIMOVA_NARGIZA_uzb-id.jpg
  RAHMONOV_FIRUZ_tjk-pasport.jpg
  umra-hujjatlar-umra-mart-2026-10-01.xlsx
```

Har rasm fayli **familiya, ism va hujjat turi** bilan nomlanadi — konsullikka
yoki Nusuk tizimiga yuklashda qaysi fayl kimning hujjati ekani darhol ko'rinadi.
Nomlar faqat ASCII harflardan (`O'` → `O`, `G'` → `G`), shuning uchun har
qanday tizimda ochiladi.

Bir xil ism-familiyali ikki kishi bo'lsa, ikkinchisining nomiga pasport raqami
qo'shiladi — birining rasmi yo'qolib ketmaydi.

Arxiv `ZIP_MAX_MB` (standart 45) dan katta bo'lsa yuborilmaydi: Telegram
chegarasi 50 MB. Bunda guruhlarga bo'lib oling.

### Yaxshi rasm uchun

- yorug' joyda, soyasiz
- pasport tekis va to'liq ko'rinsin, burchaklari kesilmasin
- **pastdagi ikki qator aniq bo'lsin** — bot asosan shuni o'qiydi
- telefonni qiyshaytirmasdan, to'g'ri ushlab

---

## Provayder tanlovi: Gemini yoki Claude

Rasmdan MRZ o'qish — modelning yagona ishi. Qolgan hammasi (tekshiruv
raqamlari, Excel, zip, viza) provayderga bog'liq emas, shuning uchun
almashtirish bir qator sozlama:

```
PROVIDER=gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash
```

**Shuning uchun provayder tanlovi ishonchlilikka ta'sir qilmaydi.**
Xato o'qilgan MRZ qaysi model o'qiganidan qat'i nazar tekshiruv raqamida
ushlanadi va saqlanmaydi. Tanlov faqat **sifatga** ta'sir qiladi: nechta
rasmni qayta olish kerak bo'ladi.

Shu tufayli solishtirish ham oson: 20 pasportni bir model bilan o'qib
ko'rasiz, nechtasi `tekshiruvdan o'tmadi` bo'lganini bot o'zi aytadi.
Keyin modelni almashtirib qayta o'qiysiz. Bu haqiqiy o'lchov, taxmin emas.

### Gemini bepul tarifi haqida ogohlik

Google'ning narx jadvalida bepul tarif uchun **«Content used to improve
our products»**, pullik uchun **«Content not used to improve our
products»** deb yozilgan. Bepul tarifda yuborilgan ma'lumot model
o'qitishga ishlatiladi va odam ko'rib chiqishi mumkin.

Mijozlarning pasport skanlari uchun bu to'g'ri kelmaydi. Kod ikkisida
ham ishlaydi, lekin **pullik tarifni yoqishni tavsiya qilaman** —
Gemini Flash-Lite bilan 50 kishilik guruh bir-ikki tiyin turadi.

## Viza

Bot 50 kishilik guruhda **kimda viza bor, kimda yo'q** va **qaysi turi** ekanini
kuzatadi. Ma'lumot ikki yo'l bilan kiradi:

### 1. Viza yorlig'ining rasmi (tavsiya etiladi)

Pasportga yopishtirilgan vizada ham **MRZ bor** (ICAO 9303 7-qism, MRV-A 2×44
yoki MRV-B 2×36) va unda tekshiruv raqamlari bor. Viza sahifasining rasmini
yuborsangiz bot:

- **viza raqamini**, **egasining ismini**, **fuqaroligini** va **amal muddatini**
  MRZ'dan ishonchli o'qiydi — xuddi pasport kabi, tekshiruv raqami bilan;
- egasini ism va tug'ilgan sana bo'yicha ro'yxatdan topib, o'zi belgilaydi
  (viza MRZ'ida pasport raqami **yo'q**, shuning uchun moslashtirish shu
  uchlik bo'yicha);
- viza **turini** (umra / single / multiple) vizaning ko'rinadigan qismidan
  o'qiydi. Bu MRZ'da standart maydon emas, shuning uchun **tasdiqlanmagan**
  deb belgilanadi — tekshiruv raqami bilan himoyalangan ma'lumot bilan
  aralashtirilmaydi.

Egasi ro'yxatda bo'lmasa, bot ogohlantiradi va **yangi odam yaratmaydi** —
avval pasportini yuborish kerak.

### 2. Qo'lda kiritish

```
/viza AB1234567 umra
/viza AB1234567 umra 2027-03-15
/viza AB1234567 single 2027-03-15 1234567890
```

Turlari: `umra`, `hajj`, `single`, `multiple`, `tranzit`, `ishchi`, `boshqa`.
O'zbek, ingliz va rus atamalari qabul qilinadi (`Umrah`, `УМРА`, `SINGLE ENTRY`,
`ko'p`…). Tanilmagan so'z **rad etiladi** — xato viza turi safar hujjatlarini
buzadi, shuning uchun taxmin qilinmaydi.

| Buyruq | Nima qiladi |
|---|---|
| `/vizalar` | Kimda qanday viza bor (muddati tugaydiganlar belgilanadi) |
| `/vizasiz` | Vizasi hali belgilanmaganlar |
| `/vizani_ochir <pasport>` | Xato kiritilgan vizani olib tashlaydi |

Excelda to'rt ustun qo'shiladi: **Viza**, **Viza raqami**, **Viza muddati**,
**Viza manbasi** (`viza rasmi` yoki `qo'lda`) — oxirgisi qaysi ma'lumotga
qanchalik ishonish mumkinligini ko'rsatadi.

### visa.mofa.gov.sa haqida — nega avtomatlashtirilmagan

Saudiya MOFA saytidagi so'rov formasida **CAPTCHA** bor va
[rasmiy tavsifda](https://my.gov.sa/en/services/375108) uning maqsadi aniq
yozilgan: avtomatik murojaatlarning oldini olish. Ochiq API ham yo'q.

Shuning uchun bot u saytga **o'zi kirmaydi**. Buning ikki sababi bor:

1. CAPTCHA'ni chetlab o'tish — sayt egasi ataylab qo'ygan himoyani buzish;
2. bunday yechim ishonchsiz: sayt har o'zgarganda buzilib turadi, va 50
   kishilik guruhni avtomatik so'rov qilish bloklanishga olib keladi.

Amalda bu sizga qulaysizlik tug'dirmaydi: siz MOFA saytida **o'zingiz**
tekshirasiz (odatdagi ishingiz), natijani botga bir buyruq bilan yozasiz —
va keyin butun guruhni bot kuzatadi. Yoki viza chiqqach uning rasmini
yuborasiz, bot qolganini o'zi qiladi.

Agar siz **litsenziyali umra operatori** bo'lsangiz, Nusuk Masar / eHaj
tizimida operator hisobingiz bor — guruh holatini rasmiy ravishda **o'sha
yerdan** olish eng ishonchli yo'l, chunki u MOFA ma'lumotining asl manbasi.

## Maxfiylik

Bu mijozlarning shaxsiy hujjatlari. Bot shunga qarab qurilgan:

> **O'zgargan qoida.** Boshida bot rasmni ataylab **saqlamasdi**. Egasining
> talabi bo'yicha endi **saqlaydi** — chunki viza arizasiga pasport skanini
> ilova qilish kerak. Demak `PHOTOS_DIR` papkasida mijozlarning pasport
> skanlari turadi va u himoyaga muhtoj (pastda).

| | |
|---|---|
| **Rasm** | `PHOTOS_DIR` da saqlanadi. Yozuv o'chirilganda rasmi ham o'chadi; `RETENTION_DAYS` o'tgach ikkisi ham avtomatik ketadi |
| **Kim ko'radi** | Faqat ruxsat berilgan xodimlar. Bot ochiq emas |
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
- **Baza va rasm papkasini himoyalash.** `data/umra.db` ichida pasport
  ma'lumotlari, `data/photos/` ichida **pasport skanlari** bor. Umumiy
  kompyuterda qoldirmang, zaxira nusxasini ochiq joyga (Google Drive, Telegram
  «Saqlanganlar») yuklamang. Noutbukni diskini shifrlab qo'ying
  (Windows BitLocker, macOS FileVault).
- **Safar tugagach o'chirish.** `/guruhni_ochir <nom>` — ma'lumot kerak
  bo'lmasa, saqlab turishning ma'nosi yo'q.
- **`.env` ni sir tutish.** Ichida bot tokeni va API kaliti bor.

---

## Loyiha tuzilishi

```
src/
  mrz.ts        MRZ o'qish va tekshiruv raqamlari (toza kod, testlar shu yerda)
  read.ts       Provayder tanlovi (yagona kirish nuqtasi)
  read-shared.ts  Ikki provayder uchun umumiy: so'rov matni, JSON tahlili, MRZ
  vision.ts     Anthropic (Claude) bilan o'qish
  vision-gemini.ts  Gemini bilan o'qish
  store.ts      SQLite (node:sqlite — tashqi kutubxonasiz)
  excel.ts      .xlsx tuzish
  document-type.ts  Hujjat turi va davlat (MRZ'dan, determinlashgan)
  photos.ts     Rasm fayllarini saqlash/o'chirish
  zip.ts        ZIP arxiv tuzish (zlib bilan, kutubxonasiz)
  visa.ts       Viza turi va holatini kuzatish
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
  tekshir.ts    `npm run tekshir` — sozlamalar tashxisi
```

Tekshirish:

```bash
npm test         # 147 test
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

## Nimadir ishlamasa — birinchi navbatda

```bash
npm run tekshir
```

Bu buyruq hammasini tekshiradi va nima xato ekanini aytadi: `npm install`
qilinganmi, `.env` topildimi, token shakli to'g'rimi, Telegram javob
beradimi, API kaliti ishlaydimi va **hisobda mablag' bormi** (buning uchun
bitta juda kichik so'rov yuboradi — bir tiyinning ulushi). **Tokenni ekranga chiqarmaydi**
(faqat oxirgi 4 belgi), shuning uchun natijani bemalol boshqaga ko'rsatasiz.

Namuna:

```
BOT_TOKEN
  Uzunligi: 13 belgi
  Ko'rinishi: •••••••••otim
  ✗ ichida ':' yo'q — bu bot tokeni emas
    → Token shunday: 8123456789:AAH-xxxxxxxxxxxxxxxxxxxxx
    → Bot NOMINI (@...bot) ko'chirib qo'ymadingizmi?
```

## Tez-tez uchraydigan holatlar

**«Bu bot tashkilotning ichki vositasi»** — sizda hali ruxsat yo'q. Terminalda
chiqqan kodni botga yuboring. Kod eskirgan bo'lsa (60 daqiqa), botni `Ctrl+C`
bilan to'xtatib qayta ishga tushirsangiz yangi kod chiqadi.

**«Telegramga ulanib bo'lmadi — tarmoq muammosi»** — token emas, internet yoki
faervol. Ish joyidagi tarmoq Telegramni to'sayotgan bo'lishi mumkin; mobil
internet yoki VPN bilan sinab ko'ring.

**«Telegram getMe: Not Found»** yoki **«BOT_TOKEN xato (404)»** — Telegram bunday
botni topmadi, ya'ni token yaroqsiz. Eng ko'p uchraydigan sabablar:

- token yarim ko'chirilgan (boshidan oxirigacha belgilang);
- bot **nomi** (`@...bot`) ko'chirilgan, token o'rniga;
- tirnoq qo'shilgan: `BOT_TOKEN="123:abc"` — tirnoq **kerak emas**;
- token oldin `/revoke` qilingan — @BotFather dan yangisini oling.

`npm run tekshir` shularning qaysi biri ekanini aytib beradi.

**«BOT_TOKEN bekor qilingan (401)»** — token o'chirilgan. @BotFather →
`/mybots` → botingiz → *API Token* dan yangisini oling.

**Ko'p rasm «o'qilmadi» bo'lyapti** — MRZ qatorlari xira. Rasmni yorug'roq
joyda, pasportni tekis qo'yib oling. Skanerdan o'tkazilgan nusxa eng yaxshi
natija beradi.

**«Tekshiruvdan o'tmadi»** — bu xato emas, himoya: bot bitta belgini noto'g'ri
o'qiganini o'zi aniqladi va ishonchsiz ma'lumotni saqlamadi. Qaytadan suratga oling.

**Qimmatga tushyapti** — `.env` da `MODEL=claude-haiku-4-5` qilib ko'ring,
lekin avval 10–15 pasportda sinab, natijalarni qo'lda tekshirib chiqing.

**Bot to'xtab qoldi** — `npm start` ni qaytadan ishga tushiring. Uzilish
vaqtida kelgan xabarlar Telegram serverida turadi va bot qaytgach o'qiladi.
