import { GUILD_JOIN_MODE_TEXT } from '../../../../features/guild/model/guild';
import type { GuildInvitePreview, InviteDialogView } from '../../../../features/guild/model/guild';
import Button from '../../../ui/Button';
import Inset from '../../../ui/Inset';

// 길드 요약 칸과 그 아래 안내 한 줄, 확정 버튼 — 길드가 없을 때의 코드 찾기와 초대 링크 확인 창이 함께 쓴다.
// 요약 칸은 비어 있을 때도 같은 높이를 차지해, 찾기 전후로 아래 요소가 움직이지 않는다.
export default function GuildInviteSummary({ preview, view, busy, onConfirm, actionSlot }: {
  preview: GuildInvitePreview | null;
  /** 안내 문장과 확정 버튼. null이면 아직 찾지 않았다 */
  view: InviteDialogView | null;
  busy: boolean;
  onConfirm: () => void;
  /** true면 확정 버튼을 그리지 않는다. 창이 GuildInviteAction을 카드의 확정 자리에 둔다 */
  actionSlot?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Inset className="flex flex-col justify-center min-h-28 px-3 py-2 text-sm">
        {preview ? (
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className="text-text-dim">길드</dt><dd className="m-0 text-right font-bold truncate">{preview.name}</dd>
            <dt className="text-text-dim">레벨</dt><dd className="m-0 text-right pf-accent">Lv.{preview.level}</dd>
            <dt className="text-text-dim">인원</dt><dd className="m-0 text-right pf-accent">{preview.members}/{preview.cap}</dd>
            <dt className="text-text-dim">가입 방식</dt><dd className="m-0 text-right">{GUILD_JOIN_MODE_TEXT[preview.joinMode].name}</dd>
          </dl>
        ) : (
          <p className="m-0 text-center text-text-dim whitespace-pre-line">{view ? view.text : '길드 코드를 넣고 찾기를 누르면 길드가 보여요.'}</p>
        )}
      </Inset>
      {preview && view && <p className="m-0 text-sm text-text-dim whitespace-pre-line" role="status">{view.text}</p>}
      {preview && view && !actionSlot && <GuildInviteAction view={view} busy={busy} onConfirm={onConfirm} />}
    </div>
  );
}

/** 요약 아래의 확정 버튼 — 길드 없음 탭은 요약 안에 그대로 두고, 초대 창은 카드의 확정 자리에 둔다 */
export function GuildInviteAction({ view, busy, onConfirm }: { view: InviteDialogView; busy: boolean; onConfirm: () => void }) {
  return (
    <Button full variant={view.action ? 'primary' : 'default'} disabled={busy || !view.action} onClick={onConfirm}>
      {view.action?.label ?? (view.state === 'closed' ? '받지 않음' : '들어가기')}
    </Button>
  );
}
