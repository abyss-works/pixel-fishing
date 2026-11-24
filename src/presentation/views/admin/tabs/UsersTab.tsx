// 명부 구역 — 전체 유저 명부와, 행을 눌러 여는 드릴다운을 제공한다.
// 검색은 이메일·닉네임·uid 부분 일치. 진행이 없는 휴면 게스트는 기본으로 숨기고 토글로 함께 본다. 상세 모달이 해당 유저의 감사 정보와 관리 조치를 보여준다.
import { useMemo, useState } from 'react';
import CheckToggle from '../../../ui/CheckToggle';
import DataTable from '../../../ui/DataTable';
import TableBox from '../../../ui/TableBox';
import TextInput from '../../../ui/TextInput';
import { fmtNum, fmtDT } from '../../../../features/admin/model/metrics';
import { adminNumber, filterAdminUsers, splitDormantGuests } from '../../../../features/admin/model/adminViews';
import { fmtDuration } from '../../../../features/admin/model/dashboard';
import { formatAdminLocation } from '../../../../features/admin/model/regions';
import { readAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, TabState } from '../layout';
import UserIdentity from '../UserIdentity';
import { boatNameOf } from '../../../../game/content/boats';
import UserDetail from './UserDetail';

// 조회 전 골격 — 아래 파생 계산이 매 렌더 다시 돌지 않도록 같은 배열을 재사용한다
const NO_USERS: AdminUserRow[] = [];

export default function UsersTab({ onCompose }: {
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
}) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  // 유저 명부는 다른 탭과 같은 정규 키를 쓴다 — 한 번 받은 명부를 함께 본다
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const users = data ?? NO_USERS;
  const [query, setQuery] = useState('');
  const [showDormant, setShowDormant] = useState(false);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);

  const { active, dormant } = useMemo(() => splitDormantGuests(users), [users]);
  const filtered = useMemo(() =>
    filterAdminUsers(showDormant ? users : active, query), [users, active, showDormant, query]);
  // 조치 뒤 다시 읽은 명부의 행을 보인다 — 선택할 때의 행은 제재 여부가 낡을 수 있다
  const current = selected && (users.find(u => u.user_id === selected.user_id) ?? selected);

  return (
    <>
      <TabState loading={granted && loading} error={error} onRetry={refresh} />

      <Cell title="유저 명부" flush>
        {/* 툴바 — 검색과 결과 카운트를 한 행에 */}
        <div className="flex flex-wrap items-center gap-3 px-3 pt-3">
          <TextInput value={query} onChange={e => setQuery(e.target.value)}
                 placeholder="이메일, 닉네임, uid로 검색"
                 className="w-[240px]" aria-label="유저 검색" />
          <span className="text-2xs text-text-dim">{filtered.length}/{users.length}명</span>
          <CheckToggle checked={showDormant} onChange={setShowDormant}
                       label={`휴면 게스트 보기 (${dormant.length}명)`} />
        </div>

        <TableBox className="max-h-[640px] px-1 pb-1">
          <DataTable>
            <thead>
              <tr>
                <th className="text-left">식별</th><th className="text-left">상태</th>
                <th className="text-right">골드</th><th className="text-right">명성</th>
                <th className="text-left">배</th><th className="text-right">낚싯대</th>
                <th className="text-left">위치</th><th className="text-left">마지막 행동</th>
                <th className="text-left">마지막 세션</th><th className="text-right">누적 플레이</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.user_id} onClick={() => setSelected(u)}
                    className="cursor-pointer hover:bg-surface-2 transition">
                  <td><UserIdentity user={u} /></td>
                  <td>{u.restricted === true
                    ? <span className="text-danger text-2xs pf-accent">제재</span> : null}</td>
                  <td className="text-right">{fmtNum(adminNumber(u.gold))}</td>
                  <td className="text-right">{fmtNum(adminNumber(u.fame))}</td>
                  <td className="whitespace-nowrap text-xs">{boatNameOf(u.boat ?? 0)}</td>
                  <td className="text-right text-xs">{u.rod ?? '—'}</td>
                  <td className="whitespace-nowrap text-xs text-text-dim">
                    {formatAdminLocation({ kind: u.location_kind, id: u.location_id })}</td>
                  <td className="whitespace-nowrap text-2xs text-text-dim">{fmtDT(u.last_action_at)}</td>
                  <td className="whitespace-nowrap text-2xs text-text-dim">{fmtDT(u.last_session_at)}</td>
                  <td className="whitespace-nowrap text-right text-xs">{fmtDuration(u.total_session_sec)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="text-text-dim text-center py-4">
                  {granted ? '검색 결과가 없어요.' : '운영 DB에 연결하면 유저 명부가 채워져요.'}
                </td></tr>
              )}
            </tbody>
          </DataTable>
        </TableBox>
      </Cell>

      {/* 상세 모달은 칸 밖에 둔다 — 오목한 칸의 clip-path 안에서는 화면 전체를 덮는 모달이 잘린다 */}
      {current &&
        <UserDetail key={current.user_id} user={current} onClose={() => setSelected(null)} onCompose={onCompose} />}
    </>
  );
}
