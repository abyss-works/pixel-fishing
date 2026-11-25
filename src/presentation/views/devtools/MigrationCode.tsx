import type { GameState } from '../../../game/rules/logic';
import type { GameAction } from '../../../game/rules/actions';
import type { DispatchResult, MaybePromise } from '../../../features/gameplay/service/types';
import { saveGameCode } from '../../../features/account/service/accountActions';
import { sendNotice } from '../../../features/display/model/toastPolicy';
import { when } from '../../../shared/lib/when';
import Button from '../../ui/Button';
import Note from '../../ui/Note';
import { useDialogs } from '../../ui/useDialogs';
import type { Notify } from '../../ui/hud/messageFeed';

// 이사 코드 — 세이브 문자열을 내보내고 불러온다.
// 불러오기 허용 여부는 서버가 배포 환경과 관리자 명부 기준으로 판정한다(운영 거부, 스테이징 관리자 허용, 로컬 허용).
// 저장 실패나 거부 시 자동 백업으로 받은 코드를 허용된 환경에서 불러오는 관리자 전용 도구다.
export default function MigrationCode({ game, dispatch, setToast }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
}) {
  const { input, notice, dialogs } = useDialogs();

  const exportSave = async () => {
    const code = saveGameCode(game);
    try {
      await navigator.clipboard.writeText(code);
      sendNotice(setToast, {
        kind: 'system.modalConfirmUtility',
        text: '이사 코드를 클립보드에 복사했어요.',
        tone: 'accent',
      });
    } catch {
      void notice({
        layer: 'devtools',
        title: '이사 코드',
        body: '복사가 막혀 있어요. 아래 코드를 복사해서 보관하세요.',
        value: code,
      });
    }
  };

  // 불러오기 = import 액션 — 서버의 판정을 통과하면 세이브를 불러오고 감사 기록을 남긴다
  const importSave = async () => {
    const code = await input({
      layer: 'devtools',
      title: '이사 코드 불러오기',
      label: '이사 코드',
      placeholder: '이사 코드를 붙여넣으세요',
      confirmLabel: '불러오기',
    });
    if (!code) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeURIComponent(atob(code.trim())));
    } catch {
      sendNotice(setToast, { kind: 'system.modalRejected', text: '이사 코드가 올바르지 않아요.' });
      return;
    }
    when(dispatch({ type: 'import', save: parsed }), r => {
      if (r.status === 'ok') {
        sendNotice(setToast, {
          kind: 'system.modalConfirmUtility',
          text: '세이브를 불러왔어요.',
          tone: 'accent',
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Note size="2xs" className="my-0">
        관리자 전용. 유저가 보내 온 코드(저장 실패나 거부 시 자동 백업)를 불러와 이관한다.
      </Note>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" onClick={exportSave}>이사 코드 내보내기</Button>
        <Button size="sm" onClick={() => void importSave()}>이사 코드 불러오기</Button>
      </div>
      {dialogs}
    </div>
  );
}
