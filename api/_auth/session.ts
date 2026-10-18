// 세션 토큰 확인 — 서버 함수가 요청한 사용자를 정한다.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ApiError } from '../errors.js';

// 세션 토큰 로컬 검증 (HS256, 레거시 JWT secret) — Auth 서버 왕복(~수백 ms, 리전 원거리면 그 이상)을
// 제거하는 레이턴시 최적화. 검증에 성공하면 사용자 id(sub)를, 실패하면 null을 돌려준다.
export function verifyJwtLocal(token: string, secret: string): string | null {
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return null;
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    if (header.alg !== 'HS256') return null; // 알고리즘 고정 — alg 혼동 공격 차단
    const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Authorization 헤더의 Bearer 토큰. 없으면 빈 문자열 */
export const bearerToken = (authorization: string | undefined): string =>
  (authorization ?? '').replace(/^Bearer\s+/i, '');

/** 토큰의 사용자. JWT secret이 있으면 로컬 검증(왕복 0), 없으면 인증 서버 조회. 확인하지 못하면 null */
export async function userOf(token: string): Promise<string | null> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) return verifyJwtLocal(token, secret);
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new ApiError(500, 'server-config');
  const { data, error } = await createClient(url, serviceKey, { auth: { persistSession: false } }).auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}
