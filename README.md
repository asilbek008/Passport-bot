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

## O'rnatish

Node.js **22.6 yoki yuqori** kerak (`node:sqlite` va TypeScript'ni to'g'ridan-to'g'ri
ishga tushirish uchun). [nodejs.org](https://nodejs.org) dan LTS nusxasini oling.

### Windows: ikki marta bosish kifoya

Terminal bilan ishlashni istamasangiz, `windows` papkasidagi fayllarni
tartib bilan ikki marta bosasiz:

| Fayl | Nima qiladi |
|---|---|
| **1-ornatish.bat** | Node.js borligini tekshiradi, paketlarni o'rnatadi, sozlamalarni so'raydi va tekshiradi |
| **2-boshlash.bat** | Botni ishga tushiradi. Bot to'xtab qolsa **o'zi qayta ishga tushadi** |
| **3-avtomatik.bat** | Kompyuterga kirganda bot o'zi ishga tushadigan qiladi (yoqish / o'chirish / holat) |
| **4-zaxira.bat** | Zaxira oladi |

Birinchi marta `1-ornatish.bat`, keyin `2-boshlash.bat`. Node.js
o'rnatilmagan bo'lsa birinchi fayl nima qilish kerakligini o'zi aytadi.

**Bot oyna yopiq turganda ishlamaydi.** `2-boshlash.bat` oynasini yopsangiz
bot to'xtaydi. Shuning uchun `3-avtomatik.bat` bilan avtomatik ishga
tushirishni yoqib qo'ying: shunda bot orqa fonda, oynasiz ishlaydi va
kompyuterga kirganingizda o'zi ko'tariladi.

Avtomatik ishga tushirish Windows'ning *Startup* papkasiga yorliq
qo'yadi (`Win+R` → `shell:startup`), ya'ni administrator huquqi kerak
emas va o'chirish uchun yorliqni o'chirish kifoya.

**Bot ikki marta ishga tushmaydi:** avtomatik ishga tushgan bot allaqachon
ishlayotgan bo'lsa, `2-boshlash.bat` buni aniqlaydi va to'xtaydi. Bu ataylab —
bitta tokenni ikki joyda ishlatsa Telegram ikkisini ham rad etadi (409) va
xabarlar yo'qoladi.

### Terminal bilan

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

Bot ishga tushganda menyudagi buyruqlarni va tavsifini o'zi o'rnatadi
(`setMyCommands`, `setMyDescription`), shuning uchun botni birinchi marta
ochgan xodim tavsifni va katta **START** tugmasini ko'radi — @BotFather da
qo'lda hech narsa sozlash kerak emas.

Kod faqat terminalda ko'rinadi, ya'ni uni serverga/kompyuterga kirish huquqi
bor odam — ya'ni siz — ko'radi. Shuning uchun bu xavfsiz.

### Hamkasbni qo'shish

Botda `/kod` yozasiz — bir martalik kod beradi. Hamkasbingiz botni ochib shu
kodni yuborsa, u ham ruxsat oladi. `/xodimlar` — ro'yxat, `/xodim_ochir <raqam>`
— ruxsatni olib tashlash.

---

## Ishlatish

Butun ish ikki qadam:

```
/start                            ← bir marta, botni ochganda
<pasport rasmlarini yuborasiz>    ← bittalab yoki albom qilib
```

Rasmlar o'qilgach hisobot va uning ostida **uchta tugma** chiqadi —
nima kerakligini o'zingiz tanlaysiz:

| Tugma | Nima beradi |
|---|---|
| 🗂 **Zip qilib olish** | Rasmlar + Excel bitta arxivda. Har rasm `ism_familiya_turi.jpg` nomi bilan, hujjatning o'ziga qirqilgan |
| 📊 **Excel qilib olish** | Ism, familiya va pasport ma'lumotlari jadvali |
| 🔍 **Pasport farqlash** | Qaysi biri qizil pasport, qaysi biri ID karta, qaysi davlatniki |

Tugmalar **ikki joyda** turadi:

- **xabar ostida** (inline) — aniq o'sha to'plam uchun;
- **ekran ostida** (doimiy klaviatura) — **oxirgi to'plam** bo'yicha
  ishlaydi.

Ikkalasi ham **rasm o'qilgandan keyin** paydo bo'ladi. Bo'sh suhbatda
pastdagi tugmalar turmaydi: hali hech narsa yuborilmagan paytda "Zip
qilib olish" ma'nosiz, `/start` esa aksincha eski klaviaturani yopadi.

Ikkisi bir xil ish qiladi. Doimiy tugmalar `/start` da qo'yiladi va
har to'plamdan keyin ham ko'rsatiladi. Ular oddiy matn yuboradi, ya'ni
qaysi to'plam haqida ekanini ayta olmaydi — shuning uchun bot eng
oxirgisini oladi. Emojisiz yozilsa ham tushunadi.

Inline tugmalar faqat **o'sha to'plamga** ta'sir qiladi — 10 ta rasm yuborsangiz,
tugma o'sha 10 tasini beradi, butun bazani emas. Hamma yozuv kerak bo'lsa
`/excel` va `/zip` buyruqlari bor.

Buyruq yozish kerak emas: bir necha o'nlab rasm tashlab, tugmani bosasiz.

Bot rasmlarni yig'ib, birga o'qiydi va **bitta hisobot** beradi:

```
Natija: 28 / 30 o'qildi

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

📊 Excel jadval va 🗂 arxiv yuborilmoqda...
28 ta rasm hujjatning o'ziga qirqildi.
```

### Profil va statistika

`/profil` — har bir xodim O'ZINING ishini ko'radi: bugun, oxirgi 30
kunda va jami nechta hujjat o'qigani, ro'yxatga qachon olingani va
kunlik rasm chegarasidan qanchasi ishlatilgani.

`/statistika` — faqat **bot egasiga**: butun bot bo'yicha sonlar —
bugun/hafta/oy/jami nechta hujjat, nechtasida rasm bor, nechtasiga viza
belgilangan, pasporti tez tugaydiganlar, hujjat turlari bo'yicha
taqsimot va **har bir xodim qancha hujjat o'qigani**.

Ikkalasida ham faqat **sonlar**: mijozlarning ismi va pasport raqami bu
bo'limlarda ko'rsatilmaydi.

Egasi `.env` dagi `SUPERADMIN` bilan belgilanadi:

```
SUPERADMIN=123456789
```

(o'z raqamingizni qo'yasiz — uni `/profil` da ko'rasiz)

Bo'sh qoldirilsa — **eng birinchi ro'yxatga olingan xodim** egasi
hisoblanadi (odatda botni o'rnatgan odam), ya'ni sozlamaga tegmasa ham
ishlaydi. Egasi `OPERATORS` ro'yxatida bo'lmasa ham botdan foydalana
oladi: o'z botidan tashqarida qolib ketmasin.

### Menyuda faqat `/start`

Telegram menyusida (pastdagi ☰ tugma) **faqat `/start`** turadi —
egasining talabi: asosiy ish buyruqsiz bajariladi (rasm yuboriladi,
keyin tugmalar bosiladi), uzun ro'yxat esa xodimni chalg'itardi.

Qolgan buyruqlar **yo'qolmagan**: qo'lda yozilsa ishlaydi va hammasi
`/yordam` ichida turadi.

### Nimadir ishlamasa: `/restart`

`/restart` avval **holatni** ko'rsatadi — bot qancha vaqtdan beri
ishlayapti, qaysi model bilan o'qiydi, bazada nechta hujjat bor. Ko'pincha
"bot ishlamayapti" degani boshqa narsa bo'ladi (kalit tugagan, rasm
noto'g'ri tomonidan olingan), shuning uchun qayta ishga tushirishdan
oldin shular ko'rsatiladi.

Pastdagi tugma bosilsa bot qayta ishga tushadi: protsess **7** kodi
bilan to'xtaydi, `2-boshlash.bat` oynasi esa uni 3 soniyada qaytaradi
(oddiy nosozlikda 10 soniya kutadi — bu ataylab farqli). Saqlangan
ma'lumotga va sozlamalarga tegilmaydi.

Bot **umuman javob bermasa**, bu buyruq ham yetib bormaydi: unda
kompyuterdagi `windows\2-boshlash.bat` oynasini qaytadan oching.

### Barcha buyruqlar

Buyruqlar Telegram menyusida ham turadi (`/` tugmasi). Birinchisi —
`/start`: xodim botni birinchi ochganda Telegram uni katta **START**
tugmasi qilib ko'rsatadi.

| Buyruq | Nima qiladi |
|---|---|
| `/start` | Boshlash va qisqa yo'riqnoma |
| `/royxat` | O'qilgan pasportlar ro'yxati |
| `/excel` | Hammasini bitta Excel jadval qilib beradi |
| `/zip` | Hammasini rasmlar bilan arxiv qilib beradi |
| `/viza <pasport> <turi>` | Viza belgilaydi |
| `/vizalar` | Kimda qanday viza bor |
| `/vizasiz` | Vizasi belgilanmaganlar |
| `/vizani_ochir <pasport>` | Viza ma'lumotini olib tashlaydi |
| `/ogohlik` | Pasporti tez tugaydiganlar |
| `/ochir AB1234567` | Bitta yozuvni va rasmini o'chiradi |
| `/tozalash` | Saqlash muddati o'tganlarni o'chiradi |
| `/kod` | Yangi xodim uchun bir martalik kod |
| `/xodimlar` | Ruxsat berilganlar ro'yxati |
| `/xodim_ochir 123456789` | Ruxsatni olib tashlaydi |
| `/sinov` | Tugmalar ishlayaptimi — tekshirish (hech narsa saqlanmaydi) |
| `/yordam` | Shu ro'yxat |

### Excel faylda nima bo'ladi

Faqat ikkita ustun: **Familiya** va **Ism**. Jadval konsullikka ro'yxat
topshirish uchun kerak, qolgani ortiqcha.

Pasport muddati haqidagi ogohlantirish jadvalda emas — u to'plam
hisobotida va `/ogohlik` da chiqadi. Ma'lumotning o'zi (pasport raqami,
sana, viza) bazada turadi; ustun kerak bo'lsa qaytariladi.

<details>
<summary>Eski ko'rinish (22 ustun)</summary>

**Familiya**, **Ism**, **Hujjat turi**, **Davlat**, Jinsi, Tug'ilgan
sana, Fuqaroligi, Kod, Pasport raqami, Berilgan sana, Amal muddati,
**Qolgan (oy)**, **Viza**, **Viza raqami**, **Viza muddati**, **Viza manbasi**,
JSHSHIR, Tug'ilgan joy, Kim bergan, Qabul qilingan vaqt, Izoh.

**Qizil qator** — pasport muddati tugagan. **Sariq qator** — `MIN_PASSPORT_MONTHS`
(standart 6) oydan kam qolgan.

</details>

### Zip arxivda nima bo'ladi

Arxiv ichida **bitta papka** bo'ladi:

```
umra-pasportlar/
  asilbek_boyqobilov_qizil.jpg
  nargiza_salimova_id.jpg
  firuz_rahmonov_tojik_pasport.jpg
  umra-pasportlar-2026-10-01.xlsx
```

Har rasm fayli **ism, familiya va hujjat turi** bilan nomlanadi —
konsullikka yoki Nusuk tizimiga yuklashda qaysi fayl kimning hujjati
ekani darhol ko'rinadi:

```
asilbek_boyqobilov_qizil.jpg     o'zbek chet el pasporti
nargiza_salimova_id.jpg          o'zbek ID kartasi
firuz_rahmonov_tojik_pasport.jpg chet el hujjati
```

O'zbek hujjatlari qisqa nom oladi (`qizil`, `id`) — kundalik tilda
shunday aytiladi. Chet el hujjatida muqova rangi **taxmin qilinmaydi**
(rang MRZ'da yo'q), shuning uchun davlat nomi yoziladi.

Nomlar kichik harfda va faqat ASCII dan (`O'` → `o`, `G'` → `g`),
shuning uchun Windows, macOS va har qanday zip dasturida ochiladi.

Bir xil ism-familiyali ikki kishi bo'lsa, ikkinchisining nomiga pasport raqami
qo'shiladi — birining rasmi yo'qolib ketmaydi.

Arxiv `ZIP_MAX_MB` (standart 45) dan katta bo'lsa yuborilmaydi: Telegram
chegarasi 50 MB. Bunda `/tozalash` yoki `/ochir` bilan keraksiz yozuvlarni
olib tashlang (to'plamdan keyin keladigan arxivda esa faqat o'sha
to'plamdagi pasportlar bo'ladi — u kichik).

### Rasmdan hujjatning O'ZI ajratib olinadi

Xodim pasportni ko'pincha **qo'lida ushlab**, bir-ikki qadam naridan
suratga oladi: kadrda stol, qo'l, devor tushadi; pasportning o'zi esa
qiyshiq va kadrning kichik qismida bo'ladi. Konsullikka va viza
arizasiga esa pasportning **o'zi** — to'liq, tekis va chetlarisiz —
kerak. Bot shuni o'zi qiladi (`src/crop.ts`, `jpeg-js` bilan; modeldan
faqat **raqam** keladi, rasmni model o'zgartirmaydi).

**1-usul: perspektiva to'g'rilash (asosiy).** Model hujjatning to'rt
burchagini aytadi (`document_quad` — hujjatning o'z tartibida:
chap-yuqori, o'ng-yuqori, o'ng-past, chap-past). Qo'lda ushlangan
pasport kadrda to'rtburchak emas, trapetsiya bo'lib ko'rinadi; shu
to'rt nuqta bo'yicha proyektiv almashtirish hisoblanadi va rasm
**skanerdan o'tgandek** tekis to'rtburchakka yoziladi. Qiyshiqligi ham,
burilishi ham bir yo'la to'g'rilanadi, qo'l va stol esa to'rtburchakdan
tashqarida qolib, butunlay chiqib ketadi.

**2-usul: to'rtburchak chegara.** Burchaklar ishonchsiz bo'lsa,
`document_box` bo'yicha qirqiladi. Chegara **piksellar bo'yicha
aniqlashtiriladi**: model hujjatning bir chetini kesib qo'ygan bo'lsa,
haqiqiy chetigacha kengaytiriladi; stolni ham qo'shib yuborgan bo'lsa,
toraytiriladi. Solishtirish **rang** bo'yicha, kulranglik bo'yicha emas:
qizil pasport to'q stol ustida kulrangga aylantirilsa deyarli bir xil
chiqadi (87 va 72), rang farqi esa aniq ko'rinadi.

**3-usul: hech narsa.** Ikkisi ham ishonchsiz bo'lsa, rasm asl holida
saqlanadi va hisobotda "qirqilmadi" deb aytiladi — xodim uni qo'lda
qirqadi yoki qayta suratga oladi.

**Eng muhim qoida: hujjat hech qachon kesilmaydi.** Yarmi kesilgan
pasport butun kadrdan yomonroq — ma'lumot yo'qoladi va xodim buni
sezmasligi ham mumkin. Shuning uchun qirqilmaydi, agar:

- hujjatning cheti **topilmasa** — ya'ni chegarani kengaytirganda hujjat
  davom etaverса (model hujjat o'rniga undagi **suratni** ko'rsatganda
  shunday bo'ladi);
- shakli hujjatga o'xshamasa (masalan faqat MRZ tasmasi — keng va past);
- burchaklar teskari tartibda bo'lsa (natija ko'zgudagidek chiqardi);
- natija 200 pikseldan kichik bo'lsa (MRZ o'qilmay qoladi);
- hujjat kadrning 8 foizidan kichik bo'lib, aytilgan joyda piksellar
  hech qanday chegara ko'rsatmasa (ikki dalil qoidasi).

Bu kafolat **60 ta tasodifiy holatda** tekshiriladi (`npm test`): hujjat
kadrning turli joyida va o'lchamida, model chegarasi esa ±12% xato
qilgan holda — har safar hujjatning hamma pikseli natijada qolishi shart.

**Uzoqdan olingan rasm.** Avval hujjat kadrning 8 foizidan kichik
bo'lsa umuman qirqilmasdi — aynan eng kerakli holat chetda qolardi.
Endi qirqiladi, lekin hujjat baribir kichik bo'lsa (uzun tomoni 700
pikseldan kam) xodimga **"yaqinroq turib oling"** deb aytiladi: bunday
rasmdan MRZ ni na konsullik xodimi, na model o'qiydi.

**Yonboshlagan rasm.** Perspektiva usulida burchaklar tartibining o'zi
holatni hal qiladi. To'rtburchak usulida model `rotation` ni aytadi
(0, 90, 180, 270) va rasm to'g'ri holatga buriladi. Burish va qirqish
**birga** bajariladi — rasm bir marta qayta siqiladi.

Chetiga `CROP_MARGIN_PCT` (standart 2%) bo'sh joy qo'shiladi — **hujjat
o'lchamiga nisbatan**, kadrga emas: uzoqdan olingan rasmda kadrning 2
foizi hujjatning chorakiga teng bo'lib ketardi.

JPEG bo'lmagan rasm qirqilmaydi (`jpeg-js` faqat JPEG biladi; Telegram
oddiy rasmni JPEG qilib beradi, shuning uchun bu kamdan-kam).

Butunlay o'chirish: `.env` da `CROP=off`.

### Qaysi tomonini suratga olish kerak

| Hujjat | Qaysi tomoni | Nega |
|---|---|---|
| Pasport (qizil) | Surat bor **ma'lumot sahifasi** | MRZ shu sahifaning pastida, 2 qator |
| ID karta | **ORQA** tomoni | MRZ kartaning orqasida, 3 qator. Old tomonida (surat, ism, karta raqami) MRZ **yo'q** |

ID karta uchun bot **uch holatni ajratadi** — ularning yechimi
butunlay boshqacha:

| Nima bo'lgan | Bot nima deydi |
|---|---|
| **Old tomoni** yuborilgan (surat va ism bor, MRZ yo'q) | «MRZ kartaning ORQA tomonida, o'sha tomonini suratga oling» |
| **Orqa tomoni**, lekin rasm xira | «pastdagi 3 qator aniq chiqmadi — kartani tekis qo'yib, yorug'da va yaqinroqdan oling» |
| MRZ ko'rindi, lekin qatorlar shakli to'g'ri kelmadi | «MRZ qatorlari to'g'ri chiqmadi (3 qator: 30, 27, 30 belgi)» — ya'ni nima bo'lgani aniq aytiladi |

**Ikkala tomonini birga yuborsangiz ham bo'ladi.** Konsullikka
ko'pincha ikkalasi kerak, shuning uchun xodim ikkalasini yuboradi.
Old tomonida MRZ yo'q, lekin shu to'plamda orqa tomoni o'qilgan bo'lsa,
bot old tomonini XATO deb ko'rsatmaydi — "ℹ️ 1-rasm — ID kartaning
ikkinchi tomoni" deb izoh qo'yadi. Avval u "o'qilmadi" ro'yxatiga
tushardi va xodim nimadir buzilgan deb o'ylardi.

Qaysi tomoni ekanini model aytadi (`id_side`). Bu muhim: orqa tomonini
yuborgan odamga «teskari qiling» desak, u kartani aylantirib
yuraveradi va muammo hech qachon hal bo'lmaydi.

### O'qilmasa: uch qadam, har biri yaqinroqdan

Modellar rasmni o'z o'lchamiga kichraytirib oladi. Xodim ID kartani
kadrning uchdan birida suratga olsa, kichraytirishdan keyin MRZ
qatorlari bir necha pikselga tushib qoladi va o'qilmaydi — hujjat esa
odam ko'ziga aniq ko'rinib turadi. Pasportda bu kamroq uchraydi (u
kattaroq, MRZ ham yirikroq), **ID kartada esa doimiy muammo**.

Shuning uchun o'qilmagan rasm bosqichma-bosqich yaqinlashtiriladi:

| Urinish | Modelga nima ketadi | Model |
|---|---|---|
| 1 | butun kadr | `GEMINI_MODEL` |
| 2 | **hujjatning o'zi** — kesilgan (chegarani model aytadi, aytmasa bot o'zi topadi) | `GEMINI_MODEL` |
| 3 | **hujjatning MRZ zonasi** — kesilgan hujjatning pastki 45% i | `FALLBACK_MODEL` |

Har qadamda MRZ bir necha barobar yiriklashadi. Hisobotda "N tasi
yaqindan qayta o'qildi" deb aytiladi — xodim keyingi safar hujjatni
kadrga to'ldirib oladi.

**MRZ tasmasi birinchi so'rovda yuborilmaydi.** Bir vaqtda kadr va
uning pastki yarmini birga yuborib ko'rildi — bitta so'rov bilan
tugaydi degan hisobda. **Natija yomonlashdi: 11 rasmdan 6 tasi
o'qilardi, 3 taga tushdi.** Sababi tushunarli: "pastki yarmi" ko'r
taxmin — ko'p rasmda u yerda MRZ emas, stol yoki fon bo'ladi, model
esa unga ishonib "o'qiy olmadim" deydi. Tasma faqat model hujjat
qayerdaligini aytgandan keyin, **aniq joydan** olinadi.

Uchinchi urinishda **kuchliroq model** ishlatiladi (`FALLBACK_MODEL`,
Geminida standart `gemini-2.5-pro`). Unga faqat muammoli rasmlar
tushadi — shuning uchun narx deyarli oshmaydi, mayda MRZ qatorlarida
esa farq katta. O'chirish: `FALLBACK_MODEL=off`.

### Hujjatni bot O'ZI topadi

Yaqinlashtirish butunlay modelning chegarasiga bog'liq edi. Muammo
shunda: model «o'qiy olmadim» deganda chegarani ham tez-tez bermaydi —
ya'ni yaqinlashtirish **aynan eng kerakli holatda** (hujjat kadrda
kichik, MRZ mayda) ishlamasdi. Bitta so'rovdan keyin to'xtardik va
xodim «MRZ topilmadi» degan javob olardi, holbuki hujjat rasmda
ko'rinib turardi.

Endi model chegarani aytmasa, bot hujjatni o'zi topadi: kadrning to'rt
burchagidan **fon (stol) rangi** olinadi, keyin fondan farq qiladigan
piksellarning eng katta tutashgan bo'lagi — hujjat — ajratiladi. Yozuv,
surat va MRZ ham «fon emas», shuning uchun hammasi hujjat ichida
qoladi.

Sinovda bu usul hujjat chegarasini **1 foiz aniqlik** bilan topadi:
kadrning oltidan biri bo'lgan hujjatda ham, barmoq va notekis
yorug'likda ham, qizil pasport to'q kulrang stolda ham. Hujjat yo'q
bo'lsa, kadrni to'ldirib yotgan bo'lsa yoki topilgan shakl hujjatga
o'xshamasa — qirqilmaydi (eski qoida o'zgarmadi: **shubha bo'lsa
qirqmaymiz**).

Avval boshqa usul sinab ko'rilgan edi — kadr markazidan boshlab hujjat
tomonga «o'stirish». Tekis rangli hujjatda ishladi, yozuvli hujjatda esa
**MRZ tasmasining o'zida to'xtab qoldi**: qora qatorlar qog'oz rangiga
o'xshamaydi va «hujjat tugadi» deb hisoblandi, ya'ni aynan MRZ kesilib
ketardi. Shu holat alohida test bo'lib qoldi.

Ikkisi ham bo'lmasa — butun kadr bir marta kuchliroq modelga beriladi.

Qayta urinish faqat "ko'rinmadi" turidagi sabablarda bo'ladi. ID
kartaning **old tomoni** yuborilgan bo'lsa yoki rasmda hujjat umuman
bo'lmasa, qayta so'ralmaydi — yaqindan qarash yordam bermaydi, bekorga
pul ketadi.

### Hisobotdagi "Tashxis"

O'qilmagan rasmlar ostida har biri uchun bitta qator chiqadi:

```
Tashxis (sifatni yaxshilash uchun):
2  turi: passport, MRZ qatori: 0, chegara: yo'q · urinish: kadr → hujjat (o'zim topdim) → tasma+kuchli · model: "MRZ qatorlari mayda chiqdi"
```

Ya'ni: model hujjatni qanday belgilagani, nechta MRZ qatori ko'rgani,
chegara bergan-bermagani, qanday urinishlar bo'lgani va modelning o'z
izohi. Ism, hujjat raqami va MRZ matni **chiqmaydi**.

Bu shunchaki qo'shimcha ma'lumot emas — sifatni yaxshilashning sharti.
"O'qilmadi" degan javob nima bo'lganini aytmaydi: bitta so'rovda
to'xtadimi, kesib ko'rildimi, kuchliroq model qaradimi. Shu bo'lmasa
har tuzatish taxminga aylanadi.

**To'ldiruvchi `<` lar.** Modellar MRZ dagi `<` larning sonini tez-tez
adashadi — ID kartada ular uzun qator bo'lib ketgani uchun ayniqsa.
Avval bitta `<` kam o'qilsa, qator (29 belgi) butunlay tashlab
yuborilardi va xodim «MRZ o'qilmadi» degan javob olardi, holbuki
hujjat ko'rinib turardi. Endi qator **±2 belgi** farq bilan
to'g'rilanadi — faqat to'ldiruvchi `<` hisobiga va **tekshiruv
raqamiga tegmasdan**. Ma'noli belgi yetishsa tiklanmaydi: u yerda
taxmin qilish hujjat raqamini buzib qo'yardi, tekshiruv raqami esa
buni ushlaydi.

**Bitta uzun satr.** Model qatorlarni ajratmasdan, hammasini qo'shib
yuborishi mumkin (90 belgi = 3×30). Bunday javob ham bo'linadi.

### Yaxshi rasm uchun

- yorug' joyda, soyasiz
- pasport tekis va to'liq ko'rinsin, burchaklari kesilmasin
- **pastdagi ikki qator aniq bo'lsin** — bot asosan shuni o'qiydi
- telefonni qiyshaytirmasdan, to'g'ri ushlab
- **oddiy rasm sifatida yuboring** (*File* emas) — Telegram o'zi siqadi,
  MRZ shunda ham o'qiladi

Fayl (*File*) sifatida yuborilgan telefon rasmi 5–9 MB bo'ladi va API'da
tushunarsiz xato berardi. Endi `IMAGE_MAX_MB` (standart 3.5) dan kattasi
darhol rad etiladi va nima qilish kerakligi aytiladi — 30 rasmni yuborib,
oxirida "bo'lmadi" degan javob olishdan yaxshiroq.

### Ko'p rasm yuborilganda: tezlik va chegara

Rasmlar **bir vaqtda** o'qiladi (`CONCURRENCY`, standart 3). Eng sekin
qism — API javobi (3-8 soniya); ketma-ket kutilganda 11 rasm bir necha
daqiqa olardi.

Bot API'ga **daqiqada `REQUESTS_PER_MINUTE` so'rov** yuboradi va so'rovlarni
teng taqsimlaydi. Tarifingizni bot bilmaydi, shuning uchun tezroq
boshlaydi (Gemini uchun 30) va **chegaraga urilsa o'zi sekinlashadi**,
keyin muvaffaqiyatli so'rovlardan keyin asta tiklanadi. Bepul tarifda
ham to'plam to'xtamaydi — shunchaki sekinroq bo'ladi.

| Provayder | Standart | Nega |
|---|---|---|
| Gemini | 30 / daqiqa | bepul tarifda chegara 10–15, lekin bot o'zi sekinlashadi |
| Anthropic | 60 / daqiqa | chegarasi balandroq |

Avval bot ataylab sekin boshlardi (Geminida daqiqada 10) — chegaraga
urilib **butun to'plam to'xtab qolmasligi** uchun. Endi to'xtash o'rniga
sekinlashish bor, shuning uchun tezroq boshlash xavfsiz: tarifi
baland bo'lsa to'plam bir necha barobar tez o'qiladi, bepul tarifda esa
baribir to'xtamaydi.

Baribir chegaraga urilsa (masalan ikki xodim bir vaqtda ishlayotgan bo'lsa),
bot kutib **3 marta qayta urinadi** (2s, 4s). Shundan keyin ham bo'lmasa —
to'plam to'xtaydi va "bu vaqtincha muammo, bir-ikki daqiqadan keyin qayta
yuboring" deb aytadi.

Rasmni Telegram'dan yuklash ham **3 marta urinadi** (0.4s, 0.8s). Bir
vaqtda bir nechta rasm yuklanganda Telegram fayl serveri ba'zan
ulanishni uzadi — bitta uzilishdan rasm yo'qolmasligi kerak.

Kalit xato yoki hisobda mablag' yo'q bo'lsa — qayta urinmaydi: bunday xato
o'zi tuzalmaydi, 30 so'rovni bekorga sarflashdan ma'no yo'q. Pullik tarifda
`REQUESTS_PER_MINUTE` ni oshirsangiz bo'ladi.

---

## Provayder tanlovi: Gemini yoki Claude

Rasmdan MRZ o'qish — modelning yagona ishi. Qolgan hammasi (tekshiruv
raqamlari, Excel, zip, viza) provayderga bog'liq emas, shuning uchun
almashtirish bir qator sozlama:

```
PROVIDER=gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash
FALLBACK_MODEL=gemini-2.5-pro
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

## Zaxira — ma'lumotni yo'qotmaslik uchun

`data/umra.db` bitta fayl, rasmlar bitta papka. Disk buzilsa yoki
kompyuter yo'qolsa — hamma pasport ma'lumoti ketadi va qaytarib
bo'lmaydi. Shuning uchun:

```bash
npm run zaxira     # yoki: windows\4-zaxira.bat
```

Baza va rasmlar **bitta shifrlangan faylga** yig'iladi:
`zaxira/umra-zaxira-2026-10-08.umz`. Shu faylni flesh-diskka yoki boshqa
kompyuterga ko'chirib qo'yasiz. Oyiga bir marta yangilab turish kifoya.

**Nega shifrlangan:** zaxirada mijozlarning pasport skanlari bor. Oddiy
zip'ni fleshga tashlab, o'sha fleshni yo'qotish — ma'lumot tarqalishi
bilan barobar. Shifr AES-256-GCM, kalit paroldan `scrypt` bilan olinadi.
Parolsiz faylni **hech kim** ocha olmaydi — men ham.

> **Parolni yozib qo'ying.** Parolsiz zaxira foydasiz. Parolni tiklash
> yo'li yo'q — bu shifrning kamchiligi emas, mohiyati.

GCM faqat shifrlamaydi, buzilganini ham **aniqlaydi**: fayl yarim
ko'chirilgan yoki o'zgargan bo'lsa, tiklashda xato beradi — jim turib
buzuq ma'lumot bermaydi.

Tiklash:

```bash
npm run tiklash zaxira/umra-zaxira-2026-10-08.umz
```

Tiklash hozirgi ma'lumot ustiga yozadi, lekin avval nima borligini
ko'rsatib tasdiq so'raydi, hozirgi bazani esa `umra.db.eski-<sana>`
qilib saqlab qo'yadi — noto'g'ri faylni tiklab yuborsangiz orqaga
qaytarish mumkin bo'lsin.

Avtomatik zaxira kerak bo'lsa, parolni muhitdan berasiz:

```bash
set ZAXIRA_PAROL=parolingiz
npm run zaxira
```

Bulutga yuklash **ataylab yo'q**: mijozlarning pasport skanlarini qayerga
saqlash — sizning qaroringiz, men ularni begona xizmatga yubormayman.

---

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
  crop.ts       Hujjatni ajratib olish: perspektiva to'g'rilash, chegarani
                piksellar bo'yicha aniqlashtirish, burish
  day.ts        Kun - O'zbekiston vaqti bo'yicha (UTC emas)
  lock.ts       Bot bir vaqtda bitta bo'lib ishlashi
  backup.ts     Zaxirani shifrlash va ochish
  ask.ts        Terminalda savol (stdin yopilsa qotib qolmaydi)
  throttle.ts   So'rovlarni taqsimlash va qayta urinish (API chegarasi)
  image-pick.ts Qaysi o'lchamdagi rasmni olish (chegaraga sig'adigan eng kattasi)
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
  zaxira.ts     `npm run zaxira` — shifrlangan zaxira
  tiklash.ts    `npm run tiklash <fayl>` — zaxiradan qaytarish
  modellar.ts   `npm run modellar` — kalitga ruxsat berilgan modellar
test/
  *.test.ts     bo'laklarning testlari (`npm test`)
  e2e/run.mjs   `npm run sinov` — botning o'zini ishga tushirib tekshirish
windows/
  1-ornatish.bat    o'rnatish (ikki marta bosiladi); papka eski nusxaning
                    ichiga olingan bo'lsa, .env va data'ni o'zi ko'chiradi
  2-boshlash.bat    ishga tushirish, o'zi qayta ko'tariladi
  3-avtomatik.bat   kompyuterga kirganda avtomatik ishga tushirish
  4-zaxira.bat      zaxira olish
  5-yangilash.bat   GitHub'dan yangilash; fayllar aralashsa - ishlaydigan
                    holatga qaytarish (.env va data tegilmaydi)
```

Tekshirish:

```bash
npm test         # 355 test — bo'laklar alohida
npm run sinov    # 50 tekshiruv — botning O'ZI ishga tushiriladi
npm run typecheck
```

Testlar Windows'da ham to'liq ishlaydi. Arxiv (ZIP) formatini o'zimiz
yozganimiz uchun testlar uni ochib ko'radi: markaziy katalog bo'yicha
o'zimiz o'qiymiz va CRC ni solishtiramiz (hamma joyda), ustiga shu
kompyuterdagi dastur ham ochadi — Linux'da `unzip`, Windows'da
PowerShell'ning `Expand-Archive` si (xodim arxivni Explorer'da
ochganida ishlatiladigan kod). Dastur yo'q yoki ishlamasa test
yiqilmaydi, ogohlantirish yoziladi: arxivning o'zi baribir
tekshirilgan.

### `npm run sinov` — o'zgarish kiritgandan keyin

`npm test` bo'laklarni alohida tekshiradi. `npm run sinov` esa butun yo'lni
boshidan oxirigacha o'tadi: bot ishga tushadi, rasm "keladi", o'qiladi,
qirqiladi, bazaga yoziladi, tugmalar chiqadi, tugma bosiladi va Excel/zip
qaytadi — aynan xodim ko'radigan tartibda. Telegram ham, Gemini ham soxta
(mahalliy server ularning o'rnida javob beradi), shuning uchun:

- haqiqiy bot tokeni kerak emas;
- API kaliti kerak emas — pul ketmaydi;
- internet kerak emas;
- haqiqiy pasport ishlatilmaydi (rasmlar shu yerda chiziladi);
- sizning `.env`, bazangiz va rasmlaringizga **tegmaydi** — hammasi
  vaqtinchalik papkada ishlaydi va o'chadi.

Tekshiriladigan o'n bir holat: oddiy yo'l (2 pasport → tugmalar → Excel va
zip, fayl nomlari `ism_familiya_turi.jpg`, rasm qirqilgani), yonboshlagan
rasm to'g'rilanishi, API kaliti xato bo'lganda xodimga tushunarli xabar
chiqishi, **qo'lda ushlangan qiyshiq pasport** (arxivda stol va qo'l
qolmasligi, hujjat tekis va to'g'ri tomoni bilan chiqishi), ID
kartaning old tomoni yuborilganda orqa tomonini olish aytilishi, orqa
tomoni xira bo'lganda «teskari qiling» deyilmasligi, va kadrda kichik
ID karta birinchi urinishda o'qilmay, kesilgandan keyin o'qilishi, va
ID kartaning ikkala tomoni birga yuborilganda bitta hujjat bo'lib,
xatosiz chiqishi, ochiq pasportda MRZ faqat tasma ko'rinishida
o'qilishi — tasma esa uchinchi urinishda, kuchliroq model bilan
ketishi, `/profil` bilan `/statistika` ishlashi (ichida mijoz
ismi yo'qligi ham tekshiriladi), va `/restart` bosilganda botning
haqiqatan 7 kodi bilan to'xtashi.

Nimani tekshirmaydi: Telegramning O'ZI tugmalarni qanday chizishini. Buning
uchun botni haqiqiy token bilan ishga tushirib `/sinov` yozing — bot uchta
tugma yuboradi, bosganingizda "Tugma ishladi" deb javob beradi.

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

## Fayllar aralashib ketgan bo'lsa

Kodni tahrirlab, nima o'zgarganini unutib qo'ysangiz yoki papkada
tushunarsiz xatolar chiqsa — **tuzatib o'tirish shart emas.** Ishlaydigan
kod GitHub'da turadi:

```
windows\5-yangilash.bat
```

U o'zgargan fayllarni ko'rsatadi, nusxasini `eski-nusxa` papkasiga
qo'yadi va hammasini GitHub'dagi holatga qaytaradi, keyin paketlarni
o'rnatib testlarni ishga tushiradi.

**Sozlamalaringiz (`.env`) va bazangiz (`data`) tegilmaydi** — ular
git'da yo'q, faqat shu kompyuterda turadi. (`git clean` e'tiborsiz
fayllarni o'chirmaydi; `eski-nusxa` ham shu sababdan `.gitignore` da.)

Terminal bilan xuddi shu ish:

```bash
git fetch origin && git reset --hard origin/main && git clean -fd
npm install
```

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

**«model topilmadi»** — `GEMINI_MODEL` dagi nom shu kalitda yo'q. Model
nomlari o'zgaradi va bepul/pullik tarifda ro'yxat boshqacha bo'ladi,
shuning uchun taxmin qilmasdan Google'ning o'zidan so'raysiz:

```bash
npm run modellar
```

U kalitingizga ruxsat berilgan modellarni ko'rsatadi va `.env` ga nima
yozish kerakligini aytadi.

**«Gemini bu mamlakatdan ishlamaydi»** — Google so'rovni *joylashuv*
bo'yicha rad etdi (`User location is not supported`). Model ham, kalit
ham aybdor emas. Yechimlari: `.env` da `PROVIDER=anthropic` qilib
Claude'ga o'tish, yoki botni Gemini ruxsat berilgan mamlakatdagi
serverda ishlatish.

**Ko'p rasm «o'qilmadi» bo'lyapti** — MRZ qatorlari xira. Rasmni yorug'roq
joyda, pasportni tekis qo'yib oling. Skanerdan o'tkazilgan nusxa eng yaxshi
natija beradi.

**«Tekshiruvdan o'tmadi»** — bu xato emas, himoya: bot bitta belgini noto'g'ri
o'qiganini o'zi aniqladi va ishonchsiz ma'lumotni saqlamadi. Qaytadan suratga oling.

**«Rasm juda katta»** — rasm *File* sifatida yuborilgan. Telegramda rasmni
qo'shishda *File* emas, oddiy **rasm** (galereya) sifatida yuboring — Telegram
o'zi siqib beradi va MRZ shunda ham o'qiladi.

**30 rasm sekin o'qilyapti** — bu ataylab: API chegarasiga urilmaslik uchun
so'rovlar daqiqada `REQUESTS_PER_MINUTE` (Geminida 30) qilib taqsimlanadi.
Pullik tarifda `.env` da oshirib qo'ying.

**«O'qilmoqda...» da qotib qoldi** — eski versiyada so'rovlarga muddat
qo'yilmagan edi, shuning uchun ulanish osilib qolsa bot cheksiz kutardi.
Hozirgi versiyada har so'rov `REQUEST_TIMEOUT_SECONDS` (standart 90) dan
oshsa to'xtatiladi va sabab aytiladi. Qayta urinilayotganda ham xabar
beriladi, ya'ni ekran o'zgarmay qolmaydi.

Shunga qaramay qotib qolsa: terminalda nima yozilganini qarang —
`[api]` bilan boshlangan qatorda Google'ning asl xabari turadi.

**«To'xtatildi — bu vaqtincha muammo»** — API chegarasiga urildi. Bot 3 marta
qayta urinib ko'rgan. Bir-ikki daqiqa kutib qayta yuboring; takrorlansa
`REQUESTS_PER_MINUTE` ni pasaytiring.

**Qimmatga tushyapti** — `.env` da `MODEL=claude-haiku-4-5` qilib ko'ring,
lekin avval 10–15 pasportda sinab, natijalarni qo'lda tekshirib chiqing.

**Kompyuter yonganda qora cmd oynasi chiqyapti** — avtomatik ishga
tushirish yoqilgan. `windows\3-avtomatik.bat` → `2` bosasiz: u Startup
papkasidagi yorliqni ham, Task Scheduler'dagi vazifani ham o'chiradi.
Holatni ko'rish — shu faylda `3`.

Oyna boshqa sababdan ham chiqishi mumkin: Windows 11 o'chirishdan oldin
ochiq turgan dasturlarni qayta ochadi. Uni o'chirish: *Settings →
Accounts → Sign-in options → «Automatically save my restartable apps»* → Off.

**«Bot allaqachon ishlayapti»** — bot avtomatik ishga tushgan va orqa
fonda ishlayapti, ikkinchi nusxa esa ataylab to'xtatildi. Holatni
tekshirish: `windows\3-avtomatik.bat` → 3. Bu xato emas — bot ishlayapti,
Telegramda tekshirib ko'ring.

**«Bu bot BOSHQA joyda ham ishlayapti» (409)** — bitta token ikki
kompyuterda yoki serverda ishlatilgan. Bittasini to'xtatasiz, yoki
@BotFather dan ikkinchi bot olib alohida token berasiz.

**Bot to'xtab qoldi** — `npm start` ni qaytadan ishga tushiring. Uzilish
vaqtida kelgan xabarlar Telegram serverida turadi va bot qaytgach o'qiladi.
