import type { DailyFortune, FortuneKind } from '../../../../game/rules/fortune';
import {
  FORTUNE_INDEX_LABEL,
  FORTUNE_KIND,
  FORTUNE_PIPS,
  FORTUNE_RESET_NOTE,
  fortuneEffectNote,
  fortunePhrase,
  fortuneSummaryRows,
} from '../../../../features/fortune/model/fortune';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';

/** 종류별 모티프: 풍어운은 금빛 물고기, 재물운은 금화, 그림자 운은 어두운 물고기 */
const MOTIF: Record<FortuneKind, { glyph: GlyphId; tone: string }> = {
  fish: { glyph: 'fish', tone: 'text-gold' },
  gold: { glyph: 'coin', tone: 'text-gold' },
  shadow: { glyph: 'fish', tone: 'text-text-dim' },
};

/** 지수 칸: 최댓값만큼 칸을 그리고 지수만큼 채운다 */
function IndexPips({ index }: { index: number }) {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: FORTUNE_PIPS }, (_, i) => (
        <span key={i} className={cx('inline-block w-2.5 h-2.5', i < index ? 'bg-gold' : 'bg-line')} />
      ))}
    </span>
  );
}

// 오늘의 운세 창: 그 게임 날짜의 첫 접속에 고정된 운세의 종류, 문구, 지수, 적용 대상, 운 배율을 한 번 보여 준다.
export default function FortuneModal({ fortune, onClose }: { fortune: DailyFortune; onClose: () => void }) {
  const kind = FORTUNE_KIND[fortune.kind];
  const motif = MOTIF[fortune.kind];
  const indexLabel = FORTUNE_INDEX_LABEL[fortune.index];
  return (
    <Modal layer="stage" onClose={onClose}>
      <ModalCard title="오늘의 운세" onClose={onClose} centered
                 confirm={<Button variant="primary" full onClick={onClose}>확인</Button>}>
        <div className="flex flex-col items-center gap-2.5 text-center">
          <Inset className="w-full flex items-center justify-center h-[82px]">
            <PixelIcon glyph={motif.glyph} size={56} className={motif.tone} />
          </Inset>
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-lg font-bold text-gold">{kind.name}</span>
            <p className="text-xs text-text-dim">{fortunePhrase(fortune)}</p>
          </div>
          <span className="flex items-center justify-center gap-2 text-sm" aria-label={`지수 ${fortune.index}, ${indexLabel}`}>
            <span className="text-text-dim">지수</span>
            <IndexPips index={fortune.index} />
            <span className="pf-accent text-gold">{fortune.index}</span>
            <span className="text-xs text-text-dim">{indexLabel}</span>
          </span>
          <Inset divided aria-label="오늘의 보너스" className="w-full text-left">
            {fortuneSummaryRows(fortune).map(row => (
              <KeyValueRow
                key={row.label}
                label={row.label}
                value={row.value}
                valueEnd
                valueClassName={row.accent ? 'pf-accent text-accent' : undefined}
              />
            ))}
          </Inset>
          <p className="text-2xs text-text-dim text-center">
            {fortuneEffectNote(fortune)}
            <br />
            {FORTUNE_RESET_NOTE}
          </p>
        </div>
      </ModalCard>
    </Modal>
  );
}
