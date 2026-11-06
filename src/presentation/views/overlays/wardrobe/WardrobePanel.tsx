import { useState } from 'react';
import { HATS, LOOK_PRESETS, PANTS_COLORS, SHIRT_COLORS, hatById } from '../../../../game/content/wardrobe';
import type { Look } from '../../../../game/content/wardrobe';
import type { GameState } from '../../../../game/rules/logic';
import { clothesChanged, hatCountText, hatDetail, outfitName } from '../../../../features/wardrobe/model/wardrobe';
import Button from '../../../ui/Button';
import ColorSwatch from '../../../ui/ColorSwatch';
import Inset from '../../../ui/Inset';
import ModalCard from '../../../ui/ModalCard';
import PersonSprite from '../../../ui/PersonSprite';
import SlotCell from '../../../ui/SlotCell';
import Subheading from '../../../ui/Subheading';
import TabBar from '../../../ui/TabBar';
import Tip from '../../../ui/Tip';
import { fmtGold } from '../../../ui/format';

type Screen = 'clothes' | 'hats';

// 옷장 창 — 680 폭, 높이 고정. 제목 아래 미리보기 줄(확대 그림, 배 위 필드 크기 그림, 이름)은 어느 탭에서나 같은 자리에 두고,
// 그 아래 탭 둘(옷, 모자 가진 수/전체)을 둔다.
// 옷 탭은 고르면 미리보기에만 반영하고 아래 줄의 [입기]로 확정한다. 모자 탭은 칸을 고르면 미리보기에 씌워 보이고, 상세 칸의 버튼으로 사거나 쓴다.
export default function WardrobePanel({ game, busy, onChangeClothes, onBuyHat, onWearHat, onClose }: {
  game: GameState;
  busy: boolean;
  onChangeClothes: (shirt: number, pants: number) => void;
  onBuyHat: (hatId: string) => void;
  onWearHat: (hatId: string | null) => void;
  onClose: () => void;
}) {
  const [screen, setScreen] = useState<Screen>('clothes');
  const [pick, setPick] = useState({ shirt: game.look.shirt, pants: game.look.pants });
  const [hatId, setHatId] = useState(game.look.hat ?? HATS[0].id);
  const changed = clothesChanged(game.look, pick);
  const hatOnPreview = screen === 'hats' ? hatId : game.look.hat;
  const preview: Look = { shirt: pick.shirt, pants: pick.pants, hat: hatOnPreview };
  const caption = screen === 'hats' ? '써 본 모습' : changed ? '고른 모습' : '지금 입은 모습';

  return (
    <ModalCard title="옷장" onClose={onClose} className="flex-1">
      <Inset className="flex items-center gap-4 h-[108px] px-3 shrink-0">
        <PersonSprite look={preview} scale={4} ariaLabel="확대한 미리보기" />
        <PersonSprite look={preview} scale={2} onBoat ariaLabel="배 위 미리보기" />
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-2xs text-text-dim">{caption}</span>
          <b className="text-base text-text truncate">{outfitName(pick)}, {hatById(hatOnPreview)?.name ?? '모자 없음'}</b>
          <span className="text-2xs text-text-dim">다른 플레이어에게도 이렇게 보여요.</span>
        </div>
      </Inset>
      <TabBar
        tabs={[
          { key: 'clothes' as Screen, label: '옷' },
          { key: 'hats' as Screen, label: `모자 ${hatCountText(game)}` },
        ]}
        activeKey={screen}
        onSelect={setScreen}
      />
      {screen === 'clothes' ? (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto pf-scroll">
            <div>
              <Subheading>프리셋</Subheading>
              <div className="grid grid-cols-6 gap-2">
                {LOOK_PRESETS.map(p => (
                  <SlotCell key={p.name} ariaLabel={`${p.name} 옷 고르기`}
                            picked={pick.shirt === p.shirt && pick.pants === p.pants}
                            onSelect={() => setPick({ shirt: p.shirt, pants: p.pants })}
                            className="flex flex-col items-center gap-0.5 py-1.5">
                    <PersonSprite look={{ shirt: p.shirt, pants: p.pants, hat: null }} scale={3} />
                    <span className="text-xs">{p.name}</span>
                  </SlotCell>
                ))}
              </div>
            </div>
            <ColorRow title="웃옷" colors={SHIRT_COLORS} picked={pick.shirt} onPick={shirt => setPick(v => ({ ...v, shirt }))} />
            <ColorRow title="바지" colors={PANTS_COLORS} picked={pick.pants} onPick={pants => setPick(v => ({ ...v, pants }))} />
          </div>
          <div className="flex justify-end gap-2 shrink-0">
            <Button variant="ghost" disabled={!changed || busy}
                    onClick={() => setPick({ shirt: game.look.shirt, pants: game.look.pants })}>되돌리기</Button>
            <Button variant="primary" disabled={!changed || busy}
                    onClick={() => onChangeClothes(pick.shirt, pick.pants)}>입기</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="grid grid-cols-5 gap-2 flex-1 min-h-0 content-start overflow-y-auto pf-scroll">
            {HATS.map(h => {
              const owned = game.hats.includes(h.id);
              const worn = game.look.hat === h.id;
              return (
                <SlotCell key={h.id} ariaLabel={`${h.name}${worn ? ', 쓰는 중' : owned ? '' : ', 아직 없음'}`}
                          form={worn ? 'pressed' : owned ? 'raised' : 'sunken'} picked={hatId === h.id}
                          onSelect={() => setHatId(h.id)}
                          className="flex flex-col items-center gap-0.5 py-1.5">
                  <PersonSprite look={{ shirt: pick.shirt, pants: pick.pants, hat: h.id }} scale={3} />
                  <span className="text-xs">{h.name}</span>
                </SlotCell>
              );
            })}
          </div>
          <HatDetailBox game={game} hatId={hatId} busy={busy} onBuy={onBuyHat} onWear={onWearHat} />
        </div>
      )}
    </ModalCard>
  );
}

/** 색 칸 한 줄 — 팔레트 색마다 고르는 칸이다 */
function ColorRow({ title, colors, picked, onPick }: {
  title: string; colors: readonly string[]; picked: number; onPick: (index: number) => void;
}) {
  return (
    <div>
      <Subheading>{title}</Subheading>
      <div className="grid grid-cols-12 gap-1.5">
        {colors.map((c, i) => (
          <SlotCell key={c} ariaLabel={`${title} ${i + 1}번 색`} picked={picked === i} onSelect={() => onPick(i)}
                    className="flex items-center justify-center p-1.5">
            <ColorSwatch color={c} big />
          </SlotCell>
        ))}
      </div>
    </div>
  );
}

/** 고른 모자의 상세 칸 — 높이를 고정해 버튼이 바뀌어도 배치가 흔들리지 않는다 */
function HatDetailBox({ game, hatId, busy, onBuy, onWear }: {
  game: GameState; hatId: string; busy: boolean;
  onBuy: (hatId: string) => void; onWear: (hatId: string | null) => void;
}) {
  const d = hatDetail(game, hatId);
  const state = d.worn ? '쓰고 있어요.' : d.owned ? '가지고 있어요.' : '아직 없어요.';
  const button = d.action === 'buy'
    ? <Button variant="primary" disabled={busy || d.buyBlock !== null} onClick={() => onBuy(hatId)}>사기 {fmtGold(d.price)}</Button>
    : d.action === 'wear'
      ? <Button variant="primary" disabled={busy} onClick={() => onWear(hatId)}>쓰기</Button>
      : <Button disabled={busy} onClick={() => onWear(null)}>벗기</Button>;
  return (
    <Inset className="flex items-center justify-between gap-3 h-[84px] px-3 shrink-0">
      <div className="flex flex-col gap-1 min-w-0">
        <b className="pf-accent text-base text-gold">{d.name}</b>
        <span className="text-xs text-text-dim">가격 <span className="pf-accent text-text">{fmtGold(d.price)}</span></span>
        <span className="text-xs text-text-dim">{state}</span>
      </div>
      {d.buyBlock ? <Tip wraps text={d.buyBlock} className="block">{button}</Tip> : button}
    </Inset>
  );
}
