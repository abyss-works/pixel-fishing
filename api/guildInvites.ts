// 길드 초대 링크 — 로그인 없이 열리는 두 경로다 (Node 런타임)
//   GET /api/guild-invites/:code → { invite: { code, name, level, members, cap, joinMode } }  초대 확인 창이 쓰는 미리보기.
//                                   길드원 이름은 싣지 않는다. 형식이 틀리거나 없는 코드면 404 bad-code
//   GET /g/:code                 → index.html. 코드의 길드가 있으면 링크 미리보기 태그(제목, 설명, 주소, 그림)를 그 길드로 바꿔 낸다.
//                                   앱은 부팅 때 이 경로를 초대로 받아 확인 창을 띄운다
// 둘 다 상태를 바꾸지 않는다. 메신저 수집기가 링크를 열어도 가입되지 않는다. 코드 추측을 막으려고 접속 주소마다 요청 수를 제한한다.
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. 경로 변수는 Express가 req.params로 넘긴다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { database } from './_db/client.js';
import { guildPreview } from './_data/guilds.js';
import type { GuildPreview } from './_data/guilds.js';
import { withMeta } from './_server/ogMeta.js';
import { clientKey, createRateLimiter } from './_server/rateLimit.js';
import { guildLinkPath, normalizeGuildCode } from '../src/game/rules/guild.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { params?: Record<string, string | undefined> };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void; send: (body: string) => void };
type NodeHandler = (req: Req, res: Res) => Promise<void>;

/** 접속 주소 하나가 1분에 열 수 있는 미리보기 수(두 경로 합) */
const PER_MINUTE = 30;

/** 미리보기 글자. 제목은 길드 이름, 설명은 레벨과 인원이다 */
export function inviteMetaText(p: GuildPreview): { title: string; description: string } {
  return { title: `${p.name} 길드 초대`, description: `픽셀 낚시 길드 Lv.${p.level}, 길드원 ${p.members}/${p.cap}명` };
}

/**
 * 초대 링크 경로와 미리보기 API.
 * @param origin 서비스 주소의 origin. 미리보기 태그의 주소와 그림은 절대 주소여야 한다
 * @param indexHtml 빌드된 index.html을 읽는다(처음 한 번 읽고 기억한다)
 */
export function guildInviteRoutes(origin: string, indexHtml: () => Promise<string>): { api: NodeHandler; page: NodeHandler } {
  const limit = createRateLimiter({ windowMs: 60_000, max: PER_MINUTE });
  let html: Promise<string> | null = null;
  const page = () => (html ??= indexHtml().catch(e => { html = null; throw e; }));

  const lookup = async (raw: string | undefined): Promise<GuildPreview | null> => {
    const code = normalizeGuildCode(raw);
    if (!code) return null;
    return guildPreview(database().db, code);
  };

  const api: NodeHandler = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method !== 'GET') throw new ApiError(405, 'method-not-allowed');
      if (!limit.take(clientKey(req), Date.now())) throw new ApiError(429, 'rate-limited');
      if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
      let invite: GuildPreview | null;
      try {
        invite = await lookup(req.params?.code);
      } catch (e) {
        throw new ApiError(500, 'db-read', {}, { cause: e });
      }
      if (!invite) throw new ApiError(404, 'bad-code');
      res.status(200).json({ invite });
    } catch (e) {
      const err = toApiError(e);
      if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
      res.status(err.status).json({ error: err.code });
    }
  };

  // 미리보기를 만들지 못해도(요청 수 초과, 없는 코드, 읽기 실패) 게임은 열려야 하므로 기본 index.html을 낸다
  const pageHandler: NodeHandler = async (req, res) => {
    const base = await page();
    let preview: GuildPreview | null = null;
    if (limit.take(clientKey(req), Date.now())) {
      preview = await lookup(req.params?.code).catch(async (e: unknown) => {
        await reportServerIssue('초대 링크 미리보기 읽기 실패', e, { code: req.params?.code });
        return null;
      });
    }
    const body = preview
      ? withMeta(base, { ...inviteMetaText(preview), url: `${origin}${guildLinkPath(preview.code)}`, image: `${origin}/og.png` })
      : base;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(body);
  };

  return { api, page: pageHandler };
}

/** 빌드 산출물 폴더의 index.html을 읽는 함수 */
export const readIndexHtml = (staticDir: string) => () => readFile(`${staticDir}index.html`, 'utf8');
