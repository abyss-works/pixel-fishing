import { GUILD_JOIN_MODE_TEXT } from '../../../../features/guild/model/guild';
import type { GuildInvitePreview, InviteDialogView } from '../../../../features/guild/model/guild';
import Button from '../../../ui/Button';
import Inset from '../../../ui/Inset';

// 길드 요약 칸과 그 아래 안내 한 줄, 확정 버튼 — 길드가 없을 때의 코드 찾기와 초대 링크 확인 창이 함께 쓴다.
// 요약 칸은 비어 있을 때도 같은 높이를 차지해, 찾기 전후로 아래 요소가 움직이지 않는다.
export default function GuildInviteSummary({ preview, view, busy, onConfirm }: {
  preview: GuildInvitePreview | null;
  /** 안내 문장과 확정 버튼. null이면 아직 찾지 않았다 */
  view: InviteDialogView | null;
  busy: boolean;
  onConfirm: () => void;
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
          <p className="m-0 text-center text-text-dim">{view ? view.text : '길드 코드를 넣고 찾기를 누르면 길드가 보여요.'}</p>
        )}
      </Inset>
      {preview && view && <p className="m-0 text-sm text-text-dim" role="status">{view.text}</p>}
      {preview && view && (
        <Button full variant={view.action ? 'primary' : 'default'} disabled={busy || !view.action} onClick={onConfirm}>
          {view.action?.label ?? (view.state === 'closed' ? '받지 않음' : '들어가기')}
        </Button>
      )}
    </div>
  );
}
