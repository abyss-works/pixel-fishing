import { useState } from 'react';
import { GUILD_ERROR_TEXT, splitMembers } from '../../../../features/guild/model/guild';
import type { GuildConfirm, GuildOp } from '../../../../features/guild/model/guild';
import { useGuild } from '../../../../features/guild/service/useGuild';
import ConfirmDialog from '../../../ui/ConfirmDialog';
import type { Notify } from '../../../ui/hud/messageFeed';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import SubTabs from '../../../ui/SubTabs';
import GuildBonusPanel from './GuildBonusPanel';
import GuildLogbookTab from './GuildLogbookTab';
import GuildMembersTab from './GuildMembersTab';
import GuildSidebar from './GuildSidebar';
import NoGuild from './NoGuild';
import type { GuildAsk, GuildPartProps } from './guildProps';

// 길드 창 — 게임 스테이지 안에 뜨는 넓은 창(플레이어 목록 창과 같은 폭)이다.
// 길드가 없으면 왼쪽은 길드 만들기, 오른쪽은 초대 코드로 들어가기다.
// 길드가 있으면 창 높이를 스테이지 안에 고정하고, 왼쪽 좁은 열에 길드 정보(레벨·진행 막대, 인원과 내 역할,
// 초대 코드(길드장), 받는 보너스, 떠나기), 오른쪽에 보조 탭 셋을 둔다. 탭을 바꿔도 왼쪽 정보는 그대로다.
// 길드원(접속 여부·기여, 길드장에게만 보이는 위임·내보내기 메뉴, 떠난 선원), 보너스(레벨 문턱, 스킬 트리와 기부), 항해일지.
// 기여가 쌓이는 방식은 진행 막대 아래 도움말로 둔다.
// 보너스는 서버가 판정해 적용한다. 이 창은 서버가 보낸 레벨과 보너스를 보여 주고 기부를 보내기만 한다.
// 이 창은 길드 정보를 읽고 요청과 확인 창을 맡으며, 길드 정보 열과 각 탭 본문은 따로 그린다.
// 창 자체는 스크롤하지 않는다 — 넘치는 내용은 탭 본문(또는 기부 순위 칸) 안에서만 굴린다.
const FAILED = '요청을 처리하지 못했어요. 잠시 뒤 다시 해 주세요.';
/** 길드가 있을 때의 창 높이 — 스테이지(16:9) 안에 들어가도록 고정한다. 좁은 화면에서는 내용 높이를 따른다 */
const FIXED_HEIGHT = 'h-[min(420px,calc(100%-32px))] max-[640px]:h-auto';

export default function GuildModal({ setToast, onGoldChanged, onClose }: {
  setToast: Notify;
  /** 기부로 골드가 바뀐 뒤 게임 상태를 다시 읽는다 */
  onGoldChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { guild, loading, failed, you, act } = useGuild(true, true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<GuildConfirm | null>(null);

  /** 요청 하나 — 거부는 안내 문장으로 돌려주고, 연결 실패는 알림으로 보인다 */
  const run = async (op: GuildOp): Promise<string | null> => {
    setBusy(true);
    try {
      const r = await act(op);
      return r.ok ? null : GUILD_ERROR_TEXT[r.error] ?? FAILED;
    } catch {
      return '길드 요청을 보내지 못했어요. 연결을 확인해 주세요.';
    } finally {
      setBusy(false);
    }
  };

  const inGuild = Boolean(guild && you);
  const body = guild && you
    ? <GuildView guild={guild} me={you} busy={busy} run={run} setToast={setToast} ask={setConfirm} onGoldChanged={onGoldChanged} />
    : guild === null && !loading && !failed
      ? <NoGuild busy={busy} run={run} setToast={setToast} />
      : (
        <div className="flex h-40 items-center justify-center">
          {failed ? <Note tone="warn">길드 정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</Note>
            : <Note>길드 정보를 불러오는 중이에요.</Note>}
        </div>
      );

  return (
    <Modal layer="stage" xl onClose={onClose} className={inGuild ? FIXED_HEIGHT : undefined}>
      <ModalCard title={guild ? `길드 · ${guild.name}` : '길드'} onClose={onClose} className={inGuild ? 'flex-1' : undefined}>
        {body}
      </ModalCard>
      {confirm && (
        <ConfirmDialog layer="stage" title={confirm.title} confirmLabel={confirm.label}
                       onCancel={() => setConfirm(null)}
                       onConfirm={() => {
                         const c = confirm;
                         setConfirm(null);
                         void run(c.op).then(error => setToast(error ?? c.done, error ? 'warn' : 'info'));
                       }}>
          <p className="text-sm">{confirm.text}</p>
        </ConfirmDialog>
      )}
    </Modal>
  );
}

type GuildTab = 'members' | 'bonus' | 'logbook';

/** 길드가 있을 때 — 왼쪽 길드 정보 열과 오른쪽 길드원·보너스·항해일지 탭 */
function GuildView({ ask, onGoldChanged, ...part }: GuildPartProps & { ask: GuildAsk; onGoldChanged: () => Promise<void> | void }) {
  const [tab, setTab] = useState<GuildTab>('members');
  const { guild } = part;

  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-3 flex-1 min-h-0 max-[640px]:grid-cols-1">
      <GuildSidebar {...part} ask={ask} />
      <div className="flex flex-col min-w-0 min-h-0">
        <SubTabs<GuildTab> activeKey={tab} onSelect={setTab} items={[
          { key: 'members', label: '길드원', sub: `${splitMembers(guild.members).active.length}명` },
          { key: 'bonus', label: '보너스' },
          { key: 'logbook', label: '항해일지', sub: `${guild.logbook.length}건` },
        ]} />
        <div className="pf-scroll-panel flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3">
          {tab === 'members' && <GuildMembersTab guild={guild} me={part.me} busy={part.busy} ask={ask} />}
          {tab === 'bonus' && <GuildBonusPanel {...part} onGoldChanged={onGoldChanged} />}
          {tab === 'logbook' && <GuildLogbookTab logbook={guild.logbook} />}
        </div>
      </div>
    </div>
  );
}
