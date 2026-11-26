import type { DailyFortune } from '../../../../game/rules/fortune';
import {
  fortuneModalRows,
  fortuneName,
  fortunePhrase,
} from '../../../../features/fortune/model/fortune';
import { cx } from '../../../ui/cx';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import { HighlightRarityText } from '../../../ui/fish/RarityTag';
import { FortuneMotifIcon, FortuneStrength } from './fortuneParts';
import { fortuneToneOf } from './fortuneTone';

// 오늘의 운세 창: 첫 접속에 고정된 운세의 이름, 강도, 로어, 단일·복합 효과 배수를 보여 주고 우상단 X로 닫는다.
export default function FortuneModal({ fortune, onClose }: { fortune: DailyFortune; onClose: () => void }) {
  const rows = fortuneModalRows(fortune);
  return (
    <Modal layer="stage" sm onClose={onClose}>
      <ModalCard title="오늘의 운세" onClose={onClose}>
        <div className="flex flex-col gap-3 text-left">
          <Inset tone="light" className="px-3.5 py-3 flex items-center gap-3">
            <Inset tone="deep" className="size-11 shrink-0 flex items-center justify-center">
              <FortuneMotifIcon kind={fortune.kind} index={fortune.index} size={26} />
            </Inset>
            <div className="flex flex-col gap-1 min-w-0 text-left">
              <span className={cx('text-base font-bold leading-tight', fortuneToneOf(fortune.kind))}>
                {fortuneName(fortune)}
              </span>
              <FortuneStrength index={fortune.index} />
            </div>
          </Inset>
          <p className="m-0 text-sm text-text-dim leading-[1.68] text-left min-h-[66px]">
            {fortunePhrase(fortune)}
          </p>
          <Inset divided aria-label="오늘의 행운 효과" className="w-full text-left">
            {rows.map(row => (
              <KeyValueRow
                key={row.label}
                label={<HighlightRarityText text={row.label} />}
                value={row.accent ? row.value : <HighlightRarityText text={row.value} />}
                valueEnd
                valueClassName={row.accent ? 'pf-accent text-accent' : undefined}
              />
            ))}
          </Inset>
        </div>
      </ModalCard>
    </Modal>
  );
}
