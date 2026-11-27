// 서버가 쓰는 표의 Drizzle 선언 — 쿼리 작성용이다. 표의 정본은 번호 SQL 마이그레이션이며,
// 선언이 실제 표와 같은지는 스키마 테스트가 검사한다. RLS 정책·뷰·함수는 마이그레이션에만 있다.
// 시각 열은 Date로 읽고 쓴다(timestamptz라 시간대와 무관하게 같은 시점이 저장된다).
import { bigint, bigserial, boolean, date, doublePrecision, integer, jsonb, pgTable, primaryKey, real, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  lastSpot: text('last_spot'),
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
  hats: jsonb('hats').$type<string[]>().notNull().default([]),
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
  status409: bigint('status_409', { mode: 'number' }).notNull().default(0),
  status426: bigint('status_426', { mode: 'number' }).notNull().default(0),
  status429: bigint('status_429', { mode: 'number' }).notNull().default(0),
  status4xx: bigint('status_4xx', { mode: 'number' }).notNull().default(0),
  status5xx: bigint('status_5xx', { mode: 'number' }).notNull().default(0),
  latLe50: bigint('lat_le_50', { mode: 'number' }).notNull().default(0),
  latLe100: bigint('lat_le_100', { mode: 'number' }).notNull().default(0),
  latLe250: bigint('lat_le_250', { mode: 'number' }).notNull().default(0),
  latLe500: bigint('lat_le_500', { mode: 'number' }).notNull().default(0),
  latLe1000: bigint('lat_le_1000', { mode: 'number' }).notNull().default(0),
  latLe2500: bigint('lat_le_2500', { mode: 'number' }).notNull().default(0),
  latGt2500: bigint('lat_gt_2500', { mode: 'number' }).notNull().default(0),
  latSumMs: bigint('lat_sum_ms', { mode: 'number' }).notNull().default(0),
  rlCatchTooSoon: bigint('rl_catch_too_soon', { mode: 'number' }).notNull().default(0),
  rlLetterGap: bigint('rl_letter_gap', { mode: 'number' }).notNull().default(0),
  rlOther: bigint('rl_other', { mode: 'number' }).notNull().default(0),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.day, t.routeGroup] })]);

export const wsMetricsDaily = pgTable('ws_metrics_daily', {
  day: date('day', { mode: 'string' }).primaryKey(),
  upgradesOk: bigint('upgrades_ok', { mode: 'number' }).notNull().default(0),
  reject401: bigint('reject_401', { mode: 'number' }).notNull().default(0),
  reject403: bigint('reject_403', { mode: 'number' }).notNull().default(0),
  reject500: bigint('reject_500', { mode: 'number' }).notNull().default(0),
  closeNormal: bigint('close_normal', { mode: 'number' }).notNull().default(0),
  closeAbnormal: bigint('close_abnormal', { mode: 'number' }).notNull().default(0),
  closeIdleTimeout: bigint('close_idle_timeout', { mode: 'number' }).notNull().default(0),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

export const clientMetricsDaily = pgTable('client_metrics_daily', {
  day: date('day', { mode: 'string' }).primaryKey(),
  reports: bigint('reports', { mode: 'number' }).notNull().default(0),
  lcpLe1500: bigint('lcp_le_1500', { mode: 'number' }).notNull().default(0),
  lcpLe2500: bigint('lcp_le_2500', { mode: 'number' }).notNull().default(0),
  lcpLe4000: bigint('lcp_le_4000', { mode: 'number' }).notNull().default(0),
  lcpGt4000: bigint('lcp_gt_4000', { mode: 'number' }).notNull().default(0),
  lcpSumMs: bigint('lcp_sum_ms', { mode: 'number' }).notNull().default(0),
  lcpCount: bigint('lcp_count', { mode: 'number' }).notNull().default(0),
  inpLe100: bigint('inp_le_100', { mode: 'number' }).notNull().default(0),
  inpLe200: bigint('inp_le_200', { mode: 'number' }).notNull().default(0),
  inpLe500: bigint('inp_le_500', { mode: 'number' }).notNull().default(0),
  inpGt500: bigint('inp_gt_500', { mode: 'number' }).notNull().default(0),
  inpSumMs: bigint('inp_sum_ms', { mode: 'number' }).notNull().default(0),
  inpCount: bigint('inp_count', { mode: 'number' }).notNull().default(0),
  ttfbLe200: bigint('ttfb_le_200', { mode: 'number' }).notNull().default(0),
  ttfbLe500: bigint('ttfb_le_500', { mode: 'number' }).notNull().default(0),
  ttfbLe1000: bigint('ttfb_le_1000', { mode: 'number' }).notNull().default(0),
  ttfbGt1000: bigint('ttfb_gt_1000', { mode: 'number' }).notNull().default(0),
  ttfbSumMs: bigint('ttfb_sum_ms', { mode: 'number' }).notNull().default(0),
  ttfbCount: bigint('ttfb_count', { mode: 'number' }).notNull().default(0),
  clsSumX1000: bigint('cls_sum_x1000', { mode: 'number' }).notNull().default(0),
  clsCount: bigint('cls_count', { mode: 'number' }).notNull().default(0),
  actionRttLe100: bigint('action_rtt_le_100', { mode: 'number' }).notNull().default(0),
  actionRttLe250: bigint('action_rtt_le_250', { mode: 'number' }).notNull().default(0),
  actionRttLe500: bigint('action_rtt_le_500', { mode: 'number' }).notNull().default(0),
  actionRttLe1000: bigint('action_rtt_le_1000', { mode: 'number' }).notNull().default(0),
  actionRttGt1000: bigint('action_rtt_gt_1000', { mode: 'number' }).notNull().default(0),
  actionRttSumMs: bigint('action_rtt_sum_ms', { mode: 'number' }).notNull().default(0),
  actionRttCount: bigint('action_rtt_count', { mode: 'number' }).notNull().default(0),
  actionTimeouts: bigint('action_timeouts', { mode: 'number' }).notNull().default(0),
  actionConflicts409: bigint('action_conflicts_409', { mode: 'number' }).notNull().default(0),
  meRttLe100: bigint('me_rtt_le_100', { mode: 'number' }).notNull().default(0),
  meRttLe250: bigint('me_rtt_le_250', { mode: 'number' }).notNull().default(0),
  meRttLe500: bigint('me_rtt_le_500', { mode: 'number' }).notNull().default(0),
  meRttLe1000: bigint('me_rtt_le_1000', { mode: 'number' }).notNull().default(0),
  meRttGt1000: bigint('me_rtt_gt_1000', { mode: 'number' }).notNull().default(0),
  meRttSumMs: bigint('me_rtt_sum_ms', { mode: 'number' }).notNull().default(0),
  meRttCount: bigint('me_rtt_count', { mode: 'number' }).notNull().default(0),
  meTimeouts: bigint('me_timeouts', { mode: 'number' }).notNull().default(0),
  canvasFrames: bigint('canvas_frames', { mode: 'number' }).notNull().default(0),
  canvasLongFrames: bigint('canvas_long_frames', { mode: 'number' }).notNull().default(0),
  wsReconnects: bigint('ws_reconnects', { mode: 'number' }).notNull().default(0),
  wsAbnormalCloses: bigint('ws_abnormal_closes', { mode: 'number' }).notNull().default(0),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

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
  dex: jsonb('dex').$type<Record<string, { normal: number; variant: number }>>().notNull().default({}),
  hatsGranted: jsonb('hats_granted').$type<string[]>().notNull().default([]),
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
  rewardPin: text('reward_pin'),
  rewardExpiresAt: text('reward_expires_at'),
  mailId: bigint('mail_id', { mode: 'number' }),
  seed: text('seed').notNull().default(''),
  drawnBy: uuid('drawn_by'),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const widgetAuthCodes = pgTable('widget_auth_codes', {
  codeHash: text('code_hash').primaryKey(),
  userId: uuid('user_id').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  expiresAt: at('expires_at').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const widgetTokens = pgTable('widget_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull(),
  clientVersion: text('client_version').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
  lastSeenAt: at('last_seen_at').notNull().defaultNow(),
  expiresAt: at('expires_at').notNull(),
});
export const rankingWeeklyFame = pgTable('ranking_weekly_fame', {
  weekStart: date('week_start', { mode: 'string' }).notNull(),
  userId: uuid('user_id').notNull(),
  fameGained: bigint('fame_gained', { mode: 'number' }).notNull().default(0),
  reachedAt: at('reached_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.weekStart, t.userId] })]);

export const admins = pgTable('admins', {
  userId: uuid('user_id').primaryKey(),
  role: text('role').notNull().default('admin'),
  showStaffBadge: boolean('show_staff_badge').notNull().default(false),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  actorId: uuid('actor_id'),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  targetId: uuid('target_id'),
  reason: text('reason').notNull().default(''),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const integrityStates = pgTable('integrity_states', {
  userId: uuid('user_id').primaryKey(),
  pressure: doublePrecision('pressure').notNull().default(0),
  stage: smallint('stage').notNull().default(0),
  samples: jsonb('samples').notNull().default([]),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

export const integrityEvents = pgTable('integrity_events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull(),
  detector: text('detector').notNull(),
  signal: jsonb('signal').notNull(),
  pressureBefore: doublePrecision('pressure_before').notNull(),
  pressureAfter: doublePrecision('pressure_after').notNull(),
  stageBefore: smallint('stage_before').notNull(),
  stageAfter: smallint('stage_after').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});
