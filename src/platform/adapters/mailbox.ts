// 우편함 읽기 — 서버 함수(/api/mail)를 부른다. 우편 표를 브라우저에서 직접 읽지 않는다.
// supabase 미설정(로컬 dev·테스트)이면 null — 우편함이 없다. 세션이 아직 없으면 실패로 던진다(조회가 다시 시도한다).
import { AppError } from '../../core/errors';
import { supabase } from './auth';
import type { MailItem } from '../api/types';

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase!.auth.getSession();
  if (!session) throw new AppError('unauthorized', 'mail read before session');
  return { authorization: `Bearer ${session.access_token}` };
}

/** 본인 우편 목록(최근 순) */
export async function readMails(): Promise<MailItem[] | null> {
  if (!supabase) return null;
  const res = await fetch('/api/mail', { headers: await authHeader() });
  if (!res.ok) throw new AppError('network', 'mail read failed', { status: res.status });
  return (await res.json() as { mails: MailItem[] }).mails;
}

/** 처음 열어 본 시각을 남긴다 */
export async function markMailRead(id: number): Promise<void> {
  if (!supabase) return;
  const res = await fetch('/api/mail', {
    method: 'POST',
    headers: { ...await authHeader(), 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new AppError('network', 'mail read mark failed', { status: res.status });
}
