/**
 * Ma'lumot saqlash. `node:sqlite` — Node'ning o'zida bor, tashqi kutubxona
 * va server kerak emas: butun baza bitta fayl.
 *
 * SAQLANMAYDIGAN narsalar (ataylab): hujjat rasmi, Telegram ismi/username'i,
 * telefon raqami. Faqat vizaga kerak bo'ladigan maydonlar turadi.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.ts";

export type Pilgrim = {
  id: number;
  /** Qaysi xodim kiritgan (Telegram chat id) */
  added_by: number;
  /** Safar guruhi nomi, masalan "Umra mart" */
  group_label: string;
  surname: string;
  given_names: string;
  doc_code: string;
  doc_number: string;
  nationality: string;
  birth_date: string;
  sex: string;
  expiry_date: string;
  personal_number: string;
  issue_date: string | null;
  place_of_birth: string | null;
  authority: string | null;
  mrz_format: string;
  /** "pasport" | "id" | "viza" | "boshqa" — MRZ dagi hujjat kodidan */
  doc_kind: string;
  /** Davlat nomi o'zbekcha, masalan "O'zbekiston" */
  doc_country: string;
  /** Hujjat turining to'liq nomi: "O'zbek pasporti" */
  doc_label: string;
  /** Rasm fayli: `<guruh>/<FAMILIYA_ISM_turi>.jpg`. Yo'q bo'lsa null. */
  photo_file: string | null;
  /** "umra" | "single" | "multiple" … Viza yo'q bo'lsa null. */
  visa_type: string | null;
  /** Viza raqami (MRZ'dan yoki qo'lda) */
  visa_number: string | null;
  /** Viza amal muddati, ISO sana */
  visa_expiry: string | null;
  /** "mrz" — tekshiruv raqamlari bilan tasdiqlangan; "qolda" — xodim yozgan */
  visa_source: string | null;
  /** Qachon belgilangani */
  visa_checked_at: string | null;
  created_at: string;
};

/**
 * Yangi yozuv. Viza maydonlari bu yerda yo'q: ular keyin, alohida
 * belgilanadi (`setVisa*`). Pasport rasmi qayta yuborilsa ham viza
 * ma'lumoti saqlanib qoladi — `save()` ularga tegmaydi.
 */
export type NewPilgrim = Omit<
  Pilgrim,
  | "id"
  | "created_at"
  | "visa_type"
  | "visa_number"
  | "visa_expiry"
  | "visa_source"
  | "visa_checked_at"
>;

/**
 * `save()` natijasi.
 * `previousPhoto` — oldingi rasm yo'li: nomi yoki guruhi o'zgargan bo'lsa,
 * chaqiruvchi eski faylni o'chiradi (aks holda yetim fayl qolib ketardi).
 */
export type SaveResult = {
  state: "inserted" | "updated";
  previousPhoto: string | null;
};

export class Store {
  private db: DatabaseSync;

  constructor(path = config.dbPath) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("pragma journal_mode = wal");
    this.db.exec("pragma foreign_keys = on");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      create table if not exists pilgrims (
        id integer primary key autoincrement,
        added_by integer not null,
        group_label text not null default '',
        surname text not null,
        given_names text not null,
        doc_code text not null,
        doc_number text not null,
        nationality text not null,
        birth_date text not null,
        sex text not null,
        expiry_date text not null,
        personal_number text not null default '',
        issue_date text,
        place_of_birth text,
        authority text,
        mrz_format text not null,
        doc_kind text not null default '',
        doc_country text not null default '',
        doc_label text not null default '',
        photo_file text,
        created_at text not null default (datetime('now'))
      );

      -- Bir pasport bir marta: qayta yuborilsa yangilanadi, takrorlanmaydi.
      -- Xodim 50 rasmni ikki marta tashlab yuborsa ham ro'yxat ikkilanmaydi.
      create unique index if not exists pilgrims_doc
        on pilgrims (doc_number, birth_date);

      create index if not exists pilgrims_group on pilgrims (group_label);

      -- Kunlik cheklov uchun: faqat sanoq, hech qanday mazmun yo'q
      create table if not exists attempts (
        chat_id integer not null,
        day text not null,
        count integer not null default 0,
        primary key (chat_id, day)
      );

      -- Xodim hozir qaysi guruh bilan ishlayotgani
      create table if not exists operator_state (
        chat_id integer primary key,
        group_label text not null default ''
      );

      -- Kim qachon eksport qilgani (ma'lumot kimga ketganini bilish uchun)
      create table if not exists exports (
        id integer primary key autoincrement,
        chat_id integer not null,
        rows integer not null,
        at text not null default (datetime('now'))
      );

      -- Ruxsat berilgan xodimlar. .env dagi OPERATORS ga qo'shimcha:
      -- birinchi xodim terminaldagi kod bilan o'zini shu yerga qo'shadi,
      -- shunda chat id'ni qo'lda topish va botni qayta ishga tushirish kerak emas.
      create table if not exists operators (
        chat_id integer primary key,
        added_at text not null default (datetime('now'))
      );
    `);

    this.addMissingColumns();
  }

  /**
   * Keyinroq qo'shilgan ustunlarni mavjud bazaga qo'shadi.
   * `create table if not exists` eski jadvalni o'zgartirmaydi, shuning uchun
   * yangi ustun qo'shilganda shu ro'yxatga yozib qo'yish kifoya — bot
   * yangilanganda baza o'zi moslashadi.
   */
  private addMissingColumns() {
    const existing = new Set(
      (
        this.db.prepare("select name from pragma_table_info('pilgrims')").all() as unknown as {
          name: string;
        }[]
      ).map((r) => r.name),
    );

    const wanted: Record<string, string> = {
      group_label: "text not null default ''",
      issue_date: "text",
      place_of_birth: "text",
      authority: "text",
      doc_kind: "text not null default ''",
      doc_country: "text not null default ''",
      doc_label: "text not null default ''",
      photo_file: "text",
      visa_type: "text",
      visa_number: "text",
      visa_expiry: "text",
      visa_source: "text",
      visa_checked_at: "text",
    };

    for (const [name, definition] of Object.entries(wanted)) {
      if (!existing.has(name)) {
        this.db.exec(`alter table pilgrims add column ${name} ${definition}`);
      }
    }
  }

  // --- Ruxsat berilgan xodimlar ---

  /** Bazaga qo'shilgan xodimmi (`.env` dagi OPERATORS dan alohida). */
  isOperator(chatId: number): boolean {
    return (
      this.db.prepare("select 1 from operators where chat_id = ?").get(chatId) !==
      undefined
    );
  }

  addOperator(chatId: number): void {
    this.db
      .prepare("insert or ignore into operators (chat_id) values (?)")
      .run(chatId);
  }

  removeOperator(chatId: number): number {
    const info = this.db.prepare("delete from operators where chat_id = ?").run(chatId);
    return Number(info.changes);
  }

  operatorCount(): number {
    const row = this.db.prepare("select count(*) as n from operators").get() as
      | { n: number }
      | undefined;
    return row?.n ?? 0;
  }

  listOperators(): number[] {
    return (
      this.db
        .prepare("select chat_id from operators order by added_at")
        .all() as unknown as { chat_id: number }[]
    ).map((r) => r.chat_id);
  }

  // --- Xodimning joriy guruhi ---

  currentGroup(chatId: number): string {
    const row = this.db
      .prepare("select group_label from operator_state where chat_id = ?")
      .get(chatId) as { group_label: string } | undefined;
    return row?.group_label ?? "";
  }

  setCurrentGroup(chatId: number, label: string) {
    this.db
      .prepare(
        `insert into operator_state (chat_id, group_label) values (?, ?)
         on conflict (chat_id) do update set group_label = excluded.group_label`,
      )
      .run(chatId, label);
  }

  // --- Cheklov ---

  /**
   * Kunlik cheklov. `true` — hali mumkin.
   * `cost` bir necha rasm birga kelganda ishlatiladi.
   */
  countAttempt(chatId: number, cost = 1, limit = config.dailyLimit): boolean {
    const day = new Date().toISOString().slice(0, 10);
    this.db
      .prepare(
        `insert into attempts (chat_id, day, count) values (?, ?, ?)
         on conflict (chat_id, day) do update set count = count + ?`,
      )
      .run(chatId, day, cost, cost);
    const row = this.db
      .prepare("select count from attempts where chat_id = ? and day = ?")
      .get(chatId, day) as { count: number } | undefined;
    return (row?.count ?? 0) <= limit;
  }

  // --- Yozuvlar ---

  /**
   * Yozuvni qo'shadi yoki (o'sha pasport allaqachon bo'lsa) yangilaydi.
   * `issue_date` / `place_of_birth` / `authority` — yangi rasmda ko'rinmasa,
   * eski qiymat saqlanib qoladi (`coalesce`): aniqroq rasm bir marta
   * tushgan bo'lsa, keyingi xiraroq rasm uni yo'q qilib qo'ymaydi.
   */
  save(p: NewPilgrim): SaveResult {
    const before = this.db
      .prepare("select photo_file from pilgrims where doc_number = ? and birth_date = ?")
      .get(p.doc_number, p.birth_date) as { photo_file: string | null } | undefined;

    this.db
      .prepare(
        `insert into pilgrims (
           added_by, group_label, surname, given_names, doc_code, doc_number,
           nationality, birth_date, sex, expiry_date, personal_number,
           issue_date, place_of_birth, authority, mrz_format,
           doc_kind, doc_country, doc_label, photo_file
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict (doc_number, birth_date) do update set
           added_by = excluded.added_by,
           group_label = case
             when excluded.group_label <> '' then excluded.group_label
             else group_label end,
           surname = excluded.surname,
           given_names = excluded.given_names,
           doc_code = excluded.doc_code,
           nationality = excluded.nationality,
           sex = excluded.sex,
           expiry_date = excluded.expiry_date,
           personal_number = excluded.personal_number,
           issue_date = coalesce(excluded.issue_date, issue_date),
           place_of_birth = coalesce(excluded.place_of_birth, place_of_birth),
           authority = coalesce(excluded.authority, authority),
           mrz_format = excluded.mrz_format,
           doc_kind = excluded.doc_kind,
           doc_country = excluded.doc_country,
           doc_label = excluded.doc_label,
           photo_file = coalesce(excluded.photo_file, photo_file),
           created_at = datetime('now')`,
      )
      .run(
        p.added_by, p.group_label, p.surname, p.given_names, p.doc_code,
        p.doc_number, p.nationality, p.birth_date, p.sex, p.expiry_date,
        p.personal_number, p.issue_date, p.place_of_birth, p.authority,
        p.mrz_format, p.doc_kind, p.doc_country, p.doc_label, p.photo_file,
      );

    // Rasm yo'li o'zgargan bo'lsa (ism yoki guruh boshqa bo'ldi) eski
    // faylni chaqiruvchi o'chiradi — yetim fayl qolmasligi uchun
    const previousPhoto =
      before?.photo_file && before.photo_file !== p.photo_file
        ? before.photo_file
        : null;

    return { state: before === undefined ? "inserted" : "updated", previousPhoto };
  }

  // --- Viza ---

  /**
   * Vizani pasport raqami bo'yicha belgilaydi.
   * `null` qaytsa — bunday pasport topilmadi.
   */
  setVisaByDocNumber(
    docNumber: string,
    visa: {
      type: string;
      number?: string | null;
      expiry?: string | null;
      source: string;
    },
  ): Pilgrim | null {
    const info = this.db
      .prepare(
        `update pilgrims set
           visa_type = ?, visa_number = ?, visa_expiry = ?,
           visa_source = ?, visa_checked_at = datetime('now')
         where doc_number = ?`,
      )
      .run(
        visa.type,
        visa.number ?? null,
        visa.expiry ?? null,
        visa.source,
        docNumber,
      );
    if (Number(info.changes) === 0) return null;
    return (this.db
      .prepare("select * from pilgrims where doc_number = ?")
      .get(docNumber) as unknown as Pilgrim) ?? null;
  }

  /**
   * Vizani ism va tug'ilgan sana bo'yicha belgilaydi — viza yorlig'ining
   * MRZ'ida pasport raqami YO'Q, shuning uchun moslashtirish shu uchlik
   * bo'yicha bo'ladi.
   */
  setVisaByIdentity(
    who: { surname: string; givenNames: string; birthDate: string },
    visa: {
      type: string | null;
      number?: string | null;
      expiry?: string | null;
      source: string;
    },
  ): Pilgrim[] {
    const matches = this.db
      .prepare(
        `select * from pilgrims
         where upper(surname) = upper(?) and upper(given_names) = upper(?)
           and birth_date = ?`,
      )
      .all(who.surname, who.givenNames, who.birthDate) as unknown as Pilgrim[];

    // Bir nechta mos kelsa hech narsa o'zgartirmaymiz — xodim hal qiladi
    if (matches.length !== 1) return matches;

    this.db
      .prepare(
        `update pilgrims set
           visa_type = coalesce(?, visa_type),
           visa_number = coalesce(?, visa_number),
           visa_expiry = coalesce(?, visa_expiry),
           visa_source = ?, visa_checked_at = datetime('now')
         where id = ?`,
      )
      .run(
        visa.type,
        visa.number ?? null,
        visa.expiry ?? null,
        visa.source,
        matches[0].id,
      );

    return [
      this.db
        .prepare("select * from pilgrims where id = ?")
        .get(matches[0].id) as unknown as Pilgrim,
    ];
  }

  /** Vizani olib tashlaydi (xato kiritilgan bo'lsa). */
  clearVisa(docNumber: string): number {
    const info = this.db
      .prepare(
        `update pilgrims set visa_type = null, visa_number = null,
           visa_expiry = null, visa_source = null, visa_checked_at = null
         where doc_number = ?`,
      )
      .run(docNumber);
    return Number(info.changes);
  }

  /** Vizasi belgilanmaganlar. */
  withoutVisa(group?: string): Pilgrim[] {
    return (
      group
        ? this.db
            .prepare(
              `select * from pilgrims where group_label = ? and visa_type is null
               order by surname, given_names`,
            )
            .all(group)
        : this.db
            .prepare(
              `select * from pilgrims where visa_type is null
               order by group_label, surname, given_names`,
            )
            .all()
    ) as unknown as Pilgrim[];
  }

  /** Guruhdagi (yoki hamma) yozuvlarning rasm yo'llari. */
  photoPaths(group?: string): string[] {
    const rows = (
      group
        ? this.db
            .prepare(
              "select photo_file from pilgrims where group_label = ? and photo_file is not null",
            )
            .all(group)
        : this.db
            .prepare("select photo_file from pilgrims where photo_file is not null")
            .all()
    ) as unknown as { photo_file: string }[];
    return rows.map((r) => r.photo_file);
  }

  /** Hamma yozuv, yoki faqat bitta guruh. */
  all(group?: string): Pilgrim[] {
    if (group) {
      return this.db
        .prepare(
          "select * from pilgrims where group_label = ? order by surname, given_names",
        )
        .all(group) as unknown as Pilgrim[];
    }
    return this.db
      .prepare("select * from pilgrims order by group_label, surname, given_names")
      .all() as unknown as Pilgrim[];
  }

  /** Guruhlar va ulardagi kishilar soni. */
  groups(): { label: string; count: number }[] {
    return this.db
      .prepare(
        `select group_label as label, count(*) as count
         from pilgrims group by group_label order by group_label`,
      )
      .all() as unknown as { label: string; count: number }[];
  }

  count(group?: string): number {
    const row = group
      ? (this.db
          .prepare("select count(*) as n from pilgrims where group_label = ?")
          .get(group) as { n: number } | undefined)
      : (this.db.prepare("select count(*) as n from pilgrims").get() as
          | { n: number }
          | undefined);
    return row?.n ?? 0;
  }

  /**
   * O'chirish amallari o'chirilgan yozuvlarning RASM YO'LLARINI qaytaradi.
   * Fayllarni chaqiruvchi o'chiradi — shunda bu modul faqat baza bilan
   * ishlaydi va diskni bilmaydi.
   */
  private removeWhere(where: string, ...args: unknown[]): { count: number; photos: string[] } {
    const photos = (
      this.db
        .prepare(`select photo_file from pilgrims where ${where} and photo_file is not null`)
        .all(...(args as never[])) as unknown as { photo_file: string }[]
    ).map((r) => r.photo_file);

    const info = this.db
      .prepare(`delete from pilgrims where ${where}`)
      .run(...(args as never[]));
    return { count: Number(info.changes), photos };
  }

  /** Pasport raqami bo'yicha bitta yozuvni o'chiradi. */
  deleteByDocNumber(docNumber: string): { count: number; photos: string[] } {
    return this.removeWhere("doc_number = ?", docNumber);
  }

  /** Butun guruhni o'chiradi (safar tugagach). */
  deleteGroup(group: string): { count: number; photos: string[] } {
    return this.removeWhere("group_label = ?", group);
  }

  /** Muddati o'tgan yozuvlarni o'chiradi (saqlash muddati siyosati). */
  purge(days = config.retentionDays): { count: number; photos: string[] } {
    return this.removeWhere(`created_at < datetime('now', ?)`, `-${days} days`);
  }

  logExport(chatId: number, rows: number) {
    this.db
      .prepare("insert into exports (chat_id, rows) values (?, ?)")
      .run(chatId, rows);
  }

  close() {
    this.db.close();
  }
}
