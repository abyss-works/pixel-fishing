import { useQueryClient } from '@tanstack/react-query';
import type { AdminNoticeRequest } from '../../../platform/api';
import { writeAdminNotice } from './queries';
import { adminKeys } from './queryKeys';

/** 기간제 상시 공지 작성·수정·즉시 마감·삭제. 변경 후 공지 목록을 다시 읽는다 */
export function useAdminNotices() {
  const client = useQueryClient();
  return async (request: AdminNoticeRequest) => {
    const result = await writeAdminNotice(request);
    await client.invalidateQueries({ queryKey: adminKeys.notices });
    return result;
  };
}
