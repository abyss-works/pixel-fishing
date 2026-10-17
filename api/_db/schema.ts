// 서버가 쓰는 표의 Drizzle 선언 — 쿼리 작성용이다. 표의 정본은 번호 SQL 마이그레이션이며,
// 선언이 실제 표와 같은지는 스키마 테스트가 검사한다. RLS 정책·뷰·함수는 마이그레이션에만 있다.
// 시각 열은 Date로 읽고 쓴다(timestamptz라 시간대와 무관하게 같은 시점이 저장된다).
import { bigint, bigserial, boolean, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const savesCurrent = pgTable('saves_current', {
  userId: uuid('user_id').primaryKey(),
  data: jsonb('data').notNull(),
  version: bigint('version', { mode: 'number' }).notNull().default(1),
  updatedAt: at('updated_at').notNull().defaultNow(),
  gold: bigint('gold', { mode: 'number' }).notNull().default(0),
  fame: bigint('fame', { mode: 'number' }).notNull().default(0),
  boat: integer('boat').notNull().default(0),
  rod: integer('rod').notNull().default(1),
  restricted: boolean('restricted').notNull().default(false),
});

export const fishInstances = pgTable('fish_instances', {
  uid: uuid('uid').primaryKey(),
  userId: uuid('user_id').notNull(),
  fishId: text('fish_id').notNull(),
  form: text('form').notNull(),
  size: real('size'),
  caughtAt: at('caught_at'),
  spot: text('spot'),
  judgment: text('judgment'),
  slot: integer('slot'),
  locked: boolean('locked').notNull().default(false),
});

export const records = pgTable('records', {
  userId: uuid('user_id').notNull(),
  fishId: text('fish_id').notNull(),
  form: text('form').notNull(),
  count: bigint('count', { mode: 'number' }).notNull(),
  maxSize: real('max_size'),
  firstCaught: at('first_caught'),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.fishId, t.form] })]);

/** 스냅샷 아카이브(append-only) — 정규화 이전 세이브와 주기 스냅샷 */
export const saves = pgTable('saves', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull(),
  data: jsonb('data').notNull(),
  updatedAt: at('updated_at').notNull().defaultNow(),
  schemaVersion: integer('schema_version'),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey(),
  nickname: text('nickname').notNull(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

export const events = pgTable('events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const letters = pgTable('letters', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull(),
  text: text('text').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const coupons = pgTable('coupons', {
  code: text('code').primaryKey(),
  gold: integer('gold').notNull(),
  description: text('description').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const reliefs = pgTable('reliefs', {
  code: text('code').primaryKey(),
  gold: bigint('gold', { mode: 'number' }).notNull().default(0),
  fame: bigint('fame', { mode: 'number' }).notNull().default(0),
  rod: integer('rod').notNull().default(1),
  boat: integer('boat').notNull().default(0),
  dex: jsonb('dex').notNull().default({}),
  active: boolean('active').notNull().default(true),
  claimedBy: uuid('claimed_by'),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const bountyAccepts = pgTable('bounty_accepts', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull(),
  zone: text('zone').notNull(),
  port: text('port').notNull(),
  questId: text('quest_id').notNull(),
  acceptedAt: at('accepted_at').notNull().defaultNow(),
});

export const bountyProgress = pgTable('bounty_progress', {
  userId: uuid('user_id').notNull(),
  zone: text('zone').notNull(),
  questId: text('quest_id').notNull(),
  progress: integer('progress').notNull().default(0),
  startedAt: at('started_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.questId] })]);

export const bountyTickets = pgTable('bounty_tickets', {
  userId: uuid('user_id').notNull(),
  questId: text('quest_id').notNull(),
  issuedAt: at('issued_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.questId] })]);
