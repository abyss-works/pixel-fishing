// 변경 기록 칸 — 체인지로그의 public과 admin 항목을 최신 버전부터 버전별로 보인다. 읽기 전용이다.
// 철회된 항목(체인지로그에서 사라졌거나 다른 항목에 대체된 것)은 기본으로 숨기고 토글로 함께 본다.
import { useState } from 'react';
import Badge from '../../../ui/Badge';
import CheckToggle from '../../../ui/CheckToggle';
import Note from '../../../ui/Note';
import NoteTag from '../../../ui/NoteTag';
import { cx } from '../../../ui/cx';
import { SCROLL_Y_ROWS } from '../../../ui/scrollArea';
import Subheading from '../../../ui/Subheading';
import { groupChangelog } from '../../../../features/admin/model/changelog';
import { readAdminChangelog } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, TabState } from '../layout';

export default function ChangelogSection() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { data, loading, error, refresh } = useAdminQuery(adminKeys.changelog, readAdminChangelog, granted);
  const [showWithdrawn, setShowWithdrawn] = useState(false);

  const rows = data ?? [];
  const withdrawnCount = rows.filter(r => r.withdrawnAt !== null).length;
  const groups = groupChangelog(rows, showWithdrawn);

  return (
    <Cell title="변경 기록" className="xl:col-span-2" flush>
      <div className="flex flex-wrap items-center gap-3 px-3 pt-3">
        <Note size="2xs" className="my-0">public은 플레이어에게도 보이는 변경이고, admin은 관리자만 보는 변경이에요.</Note>
        <CheckToggle checked={showWithdrawn} onChange={setShowWithdrawn} label={`철회된 항목 보기 (${withdrawnCount}개)`} />
      </div>
      <div className="px-3">
        <TabState loading={loading && granted} error={error} onRetry={refresh} />
        {!granted && <Note className="my-0">운영 DB에 연결하거나 admins에 등록하면 채워져요.</Note>}
      </div>
      <div className="px-3 pb-3">
        <div className={`${SCROLL_Y_ROWS} max-h-[560px] flex flex-col gap-3`}>
          {groups.map(g => (
            <section key={g.version} aria-label={`v${g.version}`}>
              <Subheading className="flex items-baseline gap-2">
                <span className="pf-accent text-gold">v{g.version}</span>
                <span className="text-2xs">{g.date}</span>
              </Subheading>
              <ul className="list-none flex flex-col gap-1">
                {g.entries.map(e => (
                  <li key={e.id} className={cx('flex items-start gap-2 text-xs leading-[1.6]', e.withdrawnAt !== null && 'opacity-60')}>
                    <Badge>{e.tier}</Badge>
                    <NoteTag tag={e.tag} className="shrink-0 mt-[0.15em]" />
                    <span className="select-text">{e.text}</span>
                    {e.withdrawnAt !== null && <Badge>철회</Badge>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {granted && !loading && !error && groups.length === 0 && (
            <Note className="my-0">변경 기록이 없어요.</Note>
          )}
        </div>
      </div>
    </Cell>
  );
}
