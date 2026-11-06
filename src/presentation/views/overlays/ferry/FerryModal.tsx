import { fastTravelTargets } from '../../../../game/rules/rules';
import type { GameState } from '../../../../game/rules/logic';
import { zoneById } from '../../../../game/content/zones';
import { BASE_PACKS } from '../../../../game/world';
import type { BaseId } from '../../../../game/world';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';

// 여객선 빠른 이동 창 — 게임 스테이지 안에 뜬다. 지금 있는 항구를 뺀 항구를 바다 이름과 함께 늘어놓고,
// 배가 그 바다에 들어설 수 없는 항구는 필요한 배를 회색으로 보이며 잠근다. 확인과 이동은 호출부가 맡는다.
export default function FerryModal({ game, from, onPick, onClose }: {
  game: GameState;
  from: BaseId;
  onPick: (port: BaseId) => void;
  onClose: () => void;
}) {
  return (
    <Modal layer="stage" onClose={onClose}>
      <ModalCard title="여객선 · 빠른 이동" onClose={onClose}>
        <Note className="my-0">다른 항구로 바로 건너가요.<br />그 항구가 있는 바다에 들어설 수 있는 배가 있어야 해요.</Note>
        <div className="flex flex-col gap-2">
          {fastTravelTargets(game, from).map(t => {
            const name = BASE_PACKS[t.port].name;
            return (
              <Button key={t.port} type="button" full aria-label={name} disabled={t.locked !== null}
                      onClick={() => onPick(t.port)}
                      className="flex items-center justify-between gap-2 text-left">
                <span className="flex flex-col">
                  <span className={cx('pf-accent text-sm', t.locked ? 'text-text-dim' : 'text-gold')}>{name}</span>
                  <span className="text-xs text-text-dim">{zoneById(t.zone)?.name}</span>
                </span>
                {t.locked && <span className="text-xs text-text-dim">{t.locked}</span>}
              </Button>
            );
          })}
        </div>
      </ModalCard>
    </Modal>
  );
}
