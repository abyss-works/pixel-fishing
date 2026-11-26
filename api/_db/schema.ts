// 서버가 쓰는 표의 Drizzle 선언 — 쿼리 작성용이다. 표의 정본은 번호 SQL 마이그레이션이며,
// 선언이 실제 표와 같은지는 스키마 테스트가 검사한다. RLS 정책·뷰·함수는 마이그레이션에만 있다.
// 시각 열은 Date로 읽고 쓴다(timestamptz라 시간대와 무관하게 같은 시점이 저장된다).
import { bigint, bigserial, boolean, date, integer, jsonb, pgTable, primaryKey, real, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  lastCatchAt: at('last_catch_at'),
  activeClient: text('active_client'),
  guildEnhanceResetCount: integer('guild_enhance_reset_count').notNull().default(0),
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
  counted: boolean('counted').notNull().default(false),
});

export const letters = pgTable('letters', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull(),
  text: text('text').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
  handledAt: at('handled_at'),
});

/** 관리자 변경 기록 — 체인지로그 생성 도구의 SQL이 쓰고 서버는 읽기만 한다 */
export const changelogEntries = pgTable('changelog_entries', {
  id: text('id').primaryKey(),
  version: text('version').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  seq: integer('seq').notNull(),
  tier: text('tier').notNull(),
  tag: text('tag').notNull(),
  text: text('text').notNull(),
  withdrawnAt: at('withdrawn_at'),
  syncedAt: at('synced_at').notNull().defaultNow(),
});

export const coupons = pgTable('coupons', {
  code: text('code').primaryKey(),
  gold: integer('gold').notNull(),
  description: text('description').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: at('created_at').notNull().defaultNow(),
  items: jsonb('items').$type<{ id: string; qty: number }[]>().notNull().default([]),
  startsAt: at('starts_at'),
  endsAt: at('ends_at'),
  maxRedemptions: integer('max_redemptions'),
  perAccountLimit: integer('per_account_limit').notNull().default(1),
});

export const couponRedemptions = pgTable('coupon_redemptions', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  code: text('code').notNull(),
  userId: uuid('user_id').notNull(),
  redeemedAt: at('redeemed_at').notNull().defaultNow(),
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

export const mails = pgTable('mails', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull(),
  idempotencyKey: text('idempotency_key'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  gold: bigint('gold', { mode: 'number' }).notNull().default(0),
  items: jsonb('items').$type<{ id: string; qty: number }[]>().notNull().default([]),
  createdAt: at('created_at').notNull().defaultNow(),
  readAt: at('read_at'),
  claimedAt: at('claimed_at'),
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

export const bountyClears = pgTable('bounty_clears', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull(),
  kind: text('kind').notNull(),
  questId: text('quest_id').notNull(),
  clearedAt: at('cleared_at').notNull().defaultNow(),
});

export const achievementCounters = pgTable('achievement_counters', {
  userId: uuid('user_id').notNull(),
  key: text('key').notNull(),
  value: bigint('value', { mode: 'number' }).notNull().default(0),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.key] })]);

export const eventConsumerCutoffs = pgTable('event_consumer_cutoffs', {
  consumerKey: text('consumer_key').notNull(),
  ruleVersion: integer('rule_version').notNull(),
  liveSinceEventId: bigint('live_since_event_id', { mode: 'number' }),
  liveSinceAt: at('live_since_at'),
  backfilledThroughEventId: bigint('backfilled_through_event_id', { mode: 'number' }).notNull().default(0),
  backfillTargetEventId: bigint('backfill_target_event_id', { mode: 'number' }),
  backfillStatus: text('backfill_status').notNull().default('pending'),
  notes: jsonb('notes').notNull().default({}),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.consumerKey, t.ruleVersion] })]);

export const guildMemberEnhancements = pgTable('guild_member_enhancements', {
  guildId: uuid('guild_id').notNull(),
  userId: uuid('user_id').notNull(),
  bonus: text('bonus').notNull(),
  rank: integer('rank').notNull().default(0),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.guildId, t.userId, t.bonus] })]);

export const dailyFortunes = pgTable('daily_fortunes', {
  userId: uuid('user_id').notNull(),
  day: text('day').notNull(),
  kind: text('kind').notNull(),
  index: smallint('index').notNull(),
  score: smallint('score'),
  createdAt: at('created_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.day] })]);

export const httpMetricsDaily = pgTable('http_metrics_daily', {
  day: date('day', { mode: 'string' }).notNull(),
  routeGroup: text('route_group').notNull(),
  total: bigint('total', { mode: 'number' }).notNull().default(0),
  status426: bigint('status_426', { mode: 'number' }).notNull().default(0),
  status429: bigint('status_429', { mode: 'number' }).notNull().default(0),
  status5xx: bigint('status_5xx', { mode: 'number' }).notNull().default(0),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.day, t.routeGroup] })]);

export const notices = pgTable('notices', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  startsAt: at('starts_at').notNull(),
  endsAt: at('ends_at').notNull(),
  createdBy: uuid('created_by'),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

export const liveEvents = pgTable('live_events', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  startsAt: at('starts_at').notNull(),
  endsAt: at('ends_at').notNull(),
  active: boolean('active').notNull().default(true),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

export const eventTrioProgress = pgTable('event_trio_progress', {
  eventId: text('event_id').notNull(),
  userId: uuid('user_id').notNull(),
  counts: jsonb('counts').$type<Record<string, number>>().notNull().default({}),
  completedAt: at('completed_at'),
  claimedAt: at('claimed_at'),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.eventId, t.userId] })]);

export const eventChampionshipScores = pgTable('event_championship_scores', {
  eventId: text('event_id').notNull(),
  userId: uuid('user_id').notNull(),
  score: integer('score').notNull().default(0),
  bestFishId: text('best_fish_id'),
  bestFishScore: integer('best_fish_score').notNull().default(0),
  catches: integer('catches').notNull().default(0),
  pendingGold: integer('pending_gold').notNull().default(0),
  pendingFame: integer('pending_fame').notNull().default(0),
  settledAt: at('settled_at'),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.eventId, t.userId] })]);

export const eventDraws = pgTable('event_draws', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  eventId: text('event_id').notNull(),
  userId: uuid('user_id').notNull(),
  rewardKind: text('reward_kind').notNull(),
  rewardId: text('reward_id'),
  rewardQty: integer('reward_qty').notNull().default(0),
  gold: integer('gold').notNull().default(0),
  createdAt: at('created_at').notNull().defaultNow(),
});
