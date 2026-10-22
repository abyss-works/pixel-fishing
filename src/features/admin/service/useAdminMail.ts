import { useQueryClient } from '@tanstack/react-query';
import type { AdminMailRequest } from '../../../platform/api';
import { writeAdminMail } from './queries';
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
