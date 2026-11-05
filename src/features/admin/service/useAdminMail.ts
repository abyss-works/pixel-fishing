import { useQueryClient } from '@tanstack/react-query';
import type { AdminMailRequest } from '../../../platform/api';
import { writeAdminLetterHandled, writeAdminMail } from './queries';
import { adminKeys } from './queryKeys';

/** 우편 미리보기·보내기. 보내면 보낸 우편 목록을 다시 읽는다 */
export function useAdminMailWriter() {
  const client = useQueryClient();
  return async (op: 'preview' | 'send', request: AdminMailRequest) => {
    const result = await writeAdminMail(op, request);
    if (op === 'send') await client.invalidateQueries({ queryKey: adminKeys.mails });
    return result;
  };
}

/** 편지 처리 표시·취소. 바꾸면 편지 목록을 다시 읽는다 */
export function useAdminLetterHandled() {
  const client = useQueryClient();
  return async (letterId: number, handled: boolean) => {
    const result = await writeAdminLetterHandled(letterId, handled);
    await client.invalidateQueries({ queryKey: adminKeys.letters });
    return result;
  };
}
