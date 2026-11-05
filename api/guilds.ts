// 길드 함수 — 내 길드 조회, 만들기, 초대 코드 발급, 가입, 떠나기·내보내기, 길드장 위임, 보너스 기부 (Node 런타임)
// 계정 유저만 쓴다(게스트 제외). 권한과 인원 상한은 저장 모듈이 길드 행을 잠근 뒤 길드 규칙으로 판정한다.
//   GET    /api/guilds/me                  → { guild }                내 길드, 길드원(접속 여부·기여 포함), 성장(레벨), 보너스(단계·모인 골드·
//                                                                       다음 비용·내 기부)와 효과, 전체 기부 순위, 항해일지. 없으면 null
//   POST   /api/guilds { name }            → 201 { id }               만들기. 만든 사람이 길드장이다
//   POST   /api/guilds/:id/invites         → 201 { code, expiresAt }  초대 코드 발급(길드장). 이전 코드는 사라진다
//   POST   /api/guild-memberships { code } → 201 { id }               초대 코드로 가입
//   DELETE /api/guilds/:id/members/:uid    → { result }               자기 자신이면 떠나기, 다른 길드원이면 내보내기(길드장)
//   PUT    /api/guilds/:id/leader { uid }  → { result }               길드장 위임(길드장)
//   POST   /api/guilds/:id/bonuses/:bonus/donations { amount }
//                                          → 201 { rank, pool, accepted, gold }  보너스 기부(길드원 누구나). 상한까지 필요한 골드만 받고
//                                                                       accepted만큼 내 골드에서 뺀다. gold는 기부 뒤 내 골드다
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. 경로 변수는 Express가 req.params로 넘긴다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomInt } from 'node:crypto';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import { createGuild, donateToBonus, handOver, issueInvite, joinGuild, myGuild, removeMember } from './_data/guilds.js';
import { presenceOf } from './_server/livePresence.js';
import { GUILD_BONUS_IDS, checkGuildName, inviteCode, normalizeInviteCode, validDonationAmount } from '../src/game/rules/guild.js';
import type { GuildBonusId } from '../src/game/rules/guild.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { body?: unknown; params?: Record<string, string | undefined> };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };
type NodeHandler = (req: Req, res: Res) => Promise<void>;

/** 소속 길드가 바뀐 뒤 부른다. 실시간 채널이 그 사용자의 길드 채팅 방을 바꾼다. null은 길드 없음이다 */
export type GuildChanged = (uid: string, guildId: string | null) => void;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 거부 코드의 응답 상태 */
const STATUS: Record<string, number> = {
  'already-in-guild': 409, 'name-taken': 409, 'guild-full': 409, 'handover-first': 409,
  'not-leader': 403, 'not-member': 404, 'bad-code': 404, self: 400,
  'not-enough-gold': 409, 'bonus-locked': 409, 'rank-maxed': 409, restricted: 403,
};
const refuse = (error: string) => new ApiError(STATUS[error] ?? 400, error);

function handle(methods: readonly string[], route: (req: Req, res: Res, me: string) => Promise<void>): NodeHandler {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      if (!methods.includes(req.method ?? '')) throw new ApiError(405, 'method-not-allowed');
      if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
      const session = await sessionOf(req.headers);
      if (!session) throw new ApiError(401, 'unauthorized');
      if (session.email === null) throw new ApiError(403, 'account-only');
      await route(req, res, session.id);
    } catch (e) {
      const err = toApiError(e);
      if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
      res.status(err.status).json({ error: err.code });
    }
  };
}

/** 경로의 uuid 변수. 형식이 틀리면 400 */
function uuidParam(req: Req, name: string): string {
  const v = req.params?.[name] ?? '';
  if (!UUID.test(v)) throw new ApiError(400, `bad-${name === 'id' ? 'guild' : 'user'}`);
  return v.toLowerCase();
}

const bodyField = (req: Req, key: string): unknown => (req.body as Record<string, unknown> | null | undefined)?.[key];

async function run<T>(code: 'db-read' | 'db-write', work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw new ApiError(500, code, {}, { cause: e });
  }
}

/** 길드 경로와 핸들러. 소속이 바뀌면 changed로 알린다 */
export function guildRoutes(changed: GuildChanged): Record<string, NodeHandler> {
  const me = handle(['GET'], async (_req, res, uid) => {
    const { db } = database();
    const guild = await run('db-read', () => myGuild(db, uid, new Date().toISOString()));
    res.status(200).json({
      guild: guild && { ...guild, members: guild.members.map(m => ({ ...m, online: m.leftAt === null && presenceOf(m.uid) !== null })) },
    });
  });

  const create = handle(['POST'], async (req, res, uid) => {
    const raw = bodyField(req, 'name');
    const name = typeof raw === 'string' ? raw.trim() : raw;
    if (!checkGuildName(name).ok) throw new ApiError(400, 'bad-name');
    const r = await run('db-write', () => createGuild(database().withTransaction, uid, name as string, new Date().toISOString()));
    if (!r.ok) throw refuse(r.error);
    changed(uid, r.id);
    res.status(201).json({ id: r.id });
  });

  const invites = handle(['POST'], async (req, res, uid) => {
    const id = uuidParam(req, 'id');
    const code = inviteCode(n => randomInt(n));
    const r = await run('db-write', () => issueInvite(database().db, uid, id, code, new Date().toISOString()));
    if (!r.ok) throw refuse(r.error);
    res.status(201).json({ code: r.code, expiresAt: r.expiresAt });
  });

  const join = handle(['POST'], async (req, res, uid) => {
    const code = normalizeInviteCode(bodyField(req, 'code'));
    if (!code) throw new ApiError(400, 'bad-code');
    const r = await run('db-write', () => joinGuild(database().withTransaction, uid, code, new Date().toISOString()));
    if (!r.ok) throw refuse(r.error);
    changed(uid, r.id);
    res.status(201).json({ id: r.id });
  });

  const member = handle(['DELETE'], async (req, res, uid) => {
    const id = uuidParam(req, 'id');
    const target = uuidParam(req, 'uid');
    const r = await run('db-write', () => removeMember(database().withTransaction, uid, id, target, new Date().toISOString()));
    if (!r.ok) throw refuse(r.error);
    changed(target, null);
    res.status(200).json({ result: r.result });
  });

  const leader = handle(['PUT'], async (req, res, uid) => {
    const id = uuidParam(req, 'id');
    const raw = bodyField(req, 'uid');
    if (typeof raw !== 'string' || !UUID.test(raw)) throw new ApiError(400, 'bad-user');
    const r = await run('db-write', () => handOver(database().withTransaction, uid, id, raw.toLowerCase()));
    if (!r.ok) throw refuse(r.error);
    res.status(200).json({ result: 'handed-over' });
  });

  const donate = handle(['POST'], async (req, res, uid) => {
    const id = uuidParam(req, 'id');
    const bonus = req.params?.bonus ?? '';
    if (!(GUILD_BONUS_IDS as readonly string[]).includes(bonus)) throw new ApiError(400, 'bad-bonus');
    const amount = bodyField(req, 'amount');
    if (!validDonationAmount(amount)) throw new ApiError(400, 'bad-amount');
    const r = await run('db-write', () => donateToBonus(database().withTransaction, uid, id, bonus as GuildBonusId, amount,
      new Date().toISOString()));
    if (!r.ok) throw refuse(r.error);
    res.status(201).json({ rank: r.rank, pool: r.pool, accepted: r.accepted, gold: r.gold });
  });

  return {
    '/api/guilds/me': me,
    '/api/guilds/:id/bonuses/:bonus/donations': donate,
    '/api/guilds': create,
    '/api/guilds/:id/invites': invites,
    '/api/guilds/:id/members/:uid': member,
    '/api/guilds/:id/leader': leader,
    '/api/guild-memberships': join,
  };
}
