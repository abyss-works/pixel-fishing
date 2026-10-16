import type { GameState } from '../../../game/rules/logic';
import type { GameAction } from '../../../game/rules/actions';
import type { DispatchResult, MaybePromise } from '../../../features/gameplay/service/types';
import { saveGameCode } from '../../../features/account/service/accountActions';
import { when } from '../../../shared/lib/when';
import Button from '../../ui/Button';
import Note from '../../ui/Note';
import { useDialogs } from '../../ui/useDialogs';

// 이사 코드 — 유저 기능에서는 내렸다. 무검증 import가 변조 반입 통로로 실제 악용돼
// 서버가 소유자 계정·로컬만 받는다. 유저가 저장 실패·계정 전환 때 자동 백업으로 받은 코드를
// 보내 오면 여기서 불러와 이관한다. 기기 이동은 계정 연동으로 처리한다.
export default function MigrationCode({ game, dispatch, setToast }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
}) {
  const { input, notice, dialogs } = useDialogs();

  const exportSave = async () => {
    const code = saveGameCode(game);
    try {
      await navigator.clipboard.writeText(code);
      setToast('이사 코드를 클립보드에 복사했다.');
    } catch {
      void notice({ title: '이사 코드', body: '복사가 막혀 있어요. 아래 코드를 복사해서 보관하세요.', value: code });
    }
  };

  // 불러오기 = import 액션 — 서버가 소유자 계정·로컬만 받고, migrate 후 수입하며 events에 흔적을 남긴다
  const importSave = async () => {
    const code = await input({ title: '이사 코드 불러오기', label: '이사 코드', placeholder: '이사 코드를 붙여넣으세요', confirmLabel: '불러오기' });
    if (!code) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeURIComponent(atob(code.trim())));
    } catch {
      setToast('이사 코드가 올바르지 않다.');
      return;
    }
    when(dispatch({ type: 'import', save: parsed }), r => {
      if (r.status === 'ok') setToast('세이브를 불러왔다!');
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Note size="2xs" className="my-0">
        소유자 전용. 유저가 보내 온 코드(저장 실패·계정 전환 시 자동 백업)를 불러와 이관한다.
      </Note>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" onClick={exportSave}>이사 코드 내보내기</Button>
        <Button size="sm" onClick={() => void importSave()}>이사 코드 불러오기</Button>
      </div>
      {dialogs}
    </div>
  );
}
