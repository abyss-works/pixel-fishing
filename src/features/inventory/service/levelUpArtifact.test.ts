import { describe, expect, it, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import type { DispatchResult } from '../../gameplay/service/types';
import { levelUpArtifact } from './levelUpArtifact';

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const ready = seed({ artifacts: ['wreck-compass'], items: { 'mat-wreck-compass': 5 } });
const okResult = (state: GameState): DispatchResult => ({ status: 'ok', state, result: { type: 'none' } });

describe('유물 강화 보내기', () => {
  it('보낼 수 있으면 levelUpArtifact를 보내고 새 레벨의 토스트를 돌려준다', async () => {
    const dispatch = vi.fn(() => okResult(ready));
    const out = await levelUpArtifact(dispatch, ready, 'wreck-compass');
    expect(dispatch).toHaveBeenCalledWith({ type: 'levelUpArtifact', artifact: 'wreck-compass' });
    expect(out).toEqual({ ok: true, toast: '침선의 나침반의 레벨이 Lv.2까지 올랐어요!' });
  });

  it('비동기 dispatch도 같다', async () => {
    const out = await levelUpArtifact(() => Promise.resolve(okResult(ready)), ready, 'wreck-compass');
    expect(out.ok).toBe(true);
  });

  it.each([
    ['갖지 않은 유물', seed(), 'wreck-compass', '아직 가지지 않은 유물이에요. 먼저 교환해 주세요.'],
    ['전설 유물', seed({ artifacts: ['mami-wata-mirror'] }), 'mami-wata-mirror', '전설 유물은 레벨이 없어요. 가지고만 있어도 효과가 계속돼요.'],
    ['최고 레벨', seed({ artifacts: ['wreck-compass'], artifactLevels: { 'wreck-compass': 5 } }), 'wreck-compass', '이미 최고 레벨이에요.'],
    ['재료 부족', seed({ artifacts: ['wreck-compass'] }), 'wreck-compass', '교환 재료가 부족해요. 네임드를 토벌해 보세요.'],
  ])('%s는 보내지 않고 문구를 돌려준다', async (_name, game, id, notice) => {
    const dispatch = vi.fn();
    expect(await levelUpArtifact(dispatch, game, id)).toEqual({ ok: false, notice });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('없는 유물 id는 보내지 않고 처리할 수 없는 요청 문구를 돌려준다', async () => {
    const dispatch = vi.fn();
    expect(await levelUpArtifact(dispatch, ready, 'nope')).toEqual({ ok: false, notice: '처리할 수 없는 요청이에요.' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('서버가 재료 부족으로 거부하면(상태가 어긋난 경우) 강화 문안으로 돌려준다', async () => {
    const out = await levelUpArtifact(() => ({ status: 'rejected', error: 'material-missing' }), ready, 'wreck-compass');
    expect(out).toEqual({ ok: false, notice: '교환 재료가 부족해요. 네임드를 토벌해 보세요.' });
  });

  it('그 밖의 거부는 공용 거부 문구를 쓴다', async () => {
    const out = await levelUpArtifact(() => ({ status: 'rejected', error: 'bad-request' }), ready, 'wreck-compass');
    expect(out).toEqual({ ok: false, notice: '처리할 수 없는 요청이에요.' });
  });
});
