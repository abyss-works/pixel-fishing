// 길드 함수 — 내 길드 조회, 만들기, 이름 바꾸기, 가입 방식 설정, 코드로 들어오기와 가입 신청, 신청 처리, 떠나기·내보내기, 길드장 위임,
// 보너스 기부 (Node 런타임)
// 계정 유저만 쓴다(게스트 제외). 권한과 인원 상한은 저장 모듈이 길드 행을 잠근 뒤 길드 규칙으로 판정한다.
//   GET    /api/guilds/me                  → { guild, request }       내 길드, 길드원(접속 여부·기여 포함), 고유 코드와 가입 방식,
//                                                                       가입 신청(길드장만), 성장(레벨), 보너스와 효과, 기부 순위, 항해일지.
//                                                                       길드가 없으면 guild는 null이고 request는 내가 넣어 둔 신청이다
//   POST   /api/guilds { name }            → 201 { id }               만들기. 만든 사람이 길드장이다
//   PATCH  /api/guilds/:id { joinMode?, pitch? }
//                                          → { joinMode, pitch }      가입 방식과 권유 문구 바꾸기(길드장)
//   PUT    /api/guilds/:id/name { name }   → { name, gold }           이름 바꾸기(길드장). 길드장의 골드를 내고 하루(게임 날짜)에 한 번이다.
//                                                                       gold는 바꾼 뒤 내 골드다
//   POST   /api/guild-memberships { code } → 201 { id, result: 'joined' } | 202 { id, result: 'requested' }
//                                                                       고유 코드로 들어오기. 승인 가입 길드면 가입 신청이 된다
//   DELETE /api/guild-requests/me          → { result: 'cancelled' }  내 가입 신청 거두기
//   POST   /api/guilds/:id/requests/:uid/approval
//                                          → 201 { result: 'approved' } 가입 신청 승인(길드장)
//   DELETE /api/guilds/:id/requests/:uid   → { result: 'rejected' }   가입 신청 거절(길드장)
//   DELETE /api/guilds/:id/members/:uid    → { result }               자기 자신이면 떠나기, 다른 길드원이면 내보내기(길드장)
//   PUT    /api/guilds/:id/leader { uid }  → { result }               길드장 위임(길드장)
//   POST   /api/guilds/:id/bonuses/:bonus/donations { amount }
//                                          → 201 { rank, pool, accepted, gold }  보너스 기부(길드원 누구나). 상한까지 필요한 골드만 받고
//                                                                       accepted만큼 내 골드에서 뺀다. gold는 기부 뒤 내 골드다
// 가입 신청이 들어오면 길드장에게, 신청을 처리하면 신청한 사람에게 접속 중일 때 실시간 알림을 보낸다.
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. 경로 변수는 Express가 req.params로 넘긴다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomInt } from 'node:crypto';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import {
  cancelJoinRequest, createGuild, decideJoinRequest, donateToBonus, handOver, joinByCode, myGuild, myJoinRequest, removeMember,
  renameGuild, setJoinSettings,
} from './_data/guilds.js';
import { notifyUser, presenceOf } from './_server/livePresence.js';
import {
  GUILD_BONUS_IDS, checkGuildName, guildCode, normalizeGuildCode, normalizeGuildPitch, parseJoinMode, validDonationAmount,
} from '../src/game/rules/guild.js';
import type { GuildBonusId, GuildJoinMode } from '../src/game/rules/guild.js';
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
  'already-in-guild': 409, 'name-taken': 409, 'guild-full': 409, 'handover-first': 409, 'guild-closed': 409,
  'not-leader': 403, 'not-member': 404, 'bad-code': 404, 'no-request': 404, self: 400,
  'not-enough-gold': 409, 'bonus-locked': 409, 'rank-maxed': 409, restricted: 403, 'renamed-today': 409,
};
const refuse = (error: string) => new ApiError(STATUS[error] ?? 400, error);

/** 같은 코드가 이미 있을 때 새 코드로 다시 만드는 횟수. 코드 공간이 31^8이라 한 번에 겹칠 일은 드물다 */
const CODE_RETRIES = 3;

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
const hasField = (req: Req, key: string): boolean =>
  typeof req.body === 'object' && req.body !== null && Object.prototype.hasOwnProperty.call(req.body, key);

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
    const now = new Date().toISOString();
    const guild = await run('db-read', () => myGuild(db, uid, now));
    const request = guild ? null : await run('db-read', () => myJoinRequest(db, uid, now));
    res.status(200).json({
      guild: guild && { ...guild, members: guild.members.map(m => ({ ...m, online: m.leftAt === null && presenceOf(m.uid) !== null })) },
      request,
    });
  });

  const create = handle(['POST'], async (req, res, uid) => {
    const raw = bodyField(req, 'name');
    const name = typeof raw === 'string' ? raw.trim() : raw;
    if (!checkGuildName(name).ok) throw new ApiError(400, 'bad-name');
    let r = await run('db-write', () => createGuild(database().withTransaction, uid, name as string, guildCode(n => randomInt(n)),
      new Date().toISOString()));
    for (let i = 1; !r.ok && r.error === 'code-taken' && i < CODE_RETRIES; i++) {
      r = await run('db-write', () => createGuild(database().withTransaction, uid, name as string, guildCode(n => randomInt(n)),
        new Date().toISOString()));
    }
    if (!r.ok) {
      if (r.error === 'code-taken') throw new ApiError(500, 'db-write', { uid }, { cause: new Error('guild code collision') });
      throw refuse(r.error);
    }
    changed(uid, r.id);
    res.status(201).json({ id: r.id });
  });

  const settings = handle(['PATCH'], async (req, res, uid) => {
    const id = uuidParam(req, 'id');
    const change: { joinMode?: GuildJoinMode; pitch?: string | null } = {};
    if (hasField(req, 'joinMode')) {
      const mode = parseJoinMode(bodyField(req, 'joinMode'));
      if (!mode) throw new ApiError(400, 'bad-join-mode');
      change.joinMode = mode;
    }
    if (hasField(req, 'pitch')) {
      const pitch = normalizeGuildPitch(bodyField(req, 'pitch'));
      if (!pitch.ok) throw new ApiError(400, 'bad-pitch');
      change.pitch = pitch.pitch;
    }
    if (change.joinMode === undefined && change.pitch === undefined) throw new ApiError(400, 'bad-settings');
    const r = await run('db-write', () => setJoinSettings(database().db, uid, id, change));
    if (!r.ok) throw refuse(r.error);
    res.status(200).json({ joinMode: r.joinMode, pitch: r.pitch });
  });

  const rename = handle(['PUT'], async (req, res, uid) => {
    const id = uuidParam(req, 'id');
    const raw = bodyField(req, 'name');
    const name = typeof raw === 'string' ? raw.trim() : raw;
    if (!checkGuildName(name).ok) throw new ApiError(400, 'bad-name');
    const r = await run('db-write', () => renameGuild(database().withTransaction, uid, id, name as string, new Date().toISOString()));
    if (!r.ok) throw refuse(r.error);
    res.status(200).json({ name: r.name, gold: r.gold });
  });

  const join = handle(['POST'], async (req, res, uid) => {
    const code = normalizeGuildCode(bodyField(req, 'code'));
    if (!code) throw new ApiError(400, 'bad-code');
    const r = await run('db-write', () => joinByCode(database().withTransaction, uid, code, new Date().toISOString()));
    if (!r.ok) throw refuse(r.error);
    if (r.result === 'joined') {
      changed(uid, r.id);
      res.status(201).json({ id: r.id, result: 'joined' });
      return;
    }
    if (r.leader) notifyUser(r.leader, { t: 'guild', kind: 'request', guild: r.guild, nick: r.nick });
    res.status(202).json({ id: r.id, result: 'requested' });
  });

  const cancel = handle(['DELETE'], async (_req, res, uid) => {
    await run('db-write', () => cancelJoinRequest(database().db, uid));
    res.status(200).json({ result: 'cancelled' });
  });

  const decide = (approve: boolean) => handle([approve ? 'POST' : 'DELETE'], async (req, res, uid) => {
    const id = uuidParam(req, 'id');
    const target = uuidParam(req, 'uid');
    const r = await run('db-write', () => decideJoinRequest(database().withTransaction, uid, id, target, approve,
      new Date().toISOString()));
    if (!r.ok) throw refuse(r.error);
    if (approve) changed(target, id);
    notifyUser(target, { t: 'guild', kind: approve ? 'approved' : 'rejected', guild: r.guild, nick: null });
    res.status(approve ? 201 : 200).json({ result: approve ? 'approved' : 'rejected' });
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

  const reject = decide(false);
  return {
    '/api/guilds/me': me,
    '/api/guilds/:id/bonuses/:bonus/donations': donate,
    '/api/guilds': create,
    '/api/guilds/:id': settings,
    '/api/guilds/:id/requests/:uid/approval': decide(true),
    '/api/guilds/:id/requests/:uid': reject,
    '/api/guilds/:id/members/:uid': member,
    '/api/guilds/:id/leader': leader,
    '/api/guilds/:id/name': rename,
    '/api/guild-memberships': join,
    '/api/guild-requests/me': cancel,
  };
}
