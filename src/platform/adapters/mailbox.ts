// 우편함 읽기 — 서버 함수(/api/mail)를 부른다. 우편 표를 브라우저에서 직접 읽지 않는다.
// 클라우드 미설정(로컬 dev·테스트)이면 null — 우편함이 없다. 세션이 아직 없으면 실패로 던진다(조회가 다시 시도한다).
import { AppError } from '../../core/errors';
import { isCloud } from './auth';
import type { MailItem } from '../api/types';

/** 본인 우편 목록(최근 순) */
export async function readMails(): Promise<MailItem[] | null> {
  if (!isCloud) return null;
  const res = await fetch('/api/mail');
  if (res.status === 401) throw new AppError('unauthorized', 'mail read before session');
  if (!res.ok) throw new AppError('network', 'mail read failed', { status: res.status });
  return (await res.json() as { mails: MailItem[] }).mails;
}

/** 처음 열어 본 시각을 남긴다 */
export async function markMailRead(id: number): Promise<void> {
  if (!isCloud) return;
  const res = await fetch('/api/mail', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (res.status === 401) throw new AppError('unauthorized', 'mail read mark before session');
  if (!res.ok) throw new AppError('network', 'mail read mark failed', { status: res.status });
}
