import { useState } from 'react';
import { parseDevArgs } from '../../../features/devtools/model/commands';
import type { DevCommand } from '../../../features/devtools/model/commands';
import TextInput from '../../ui/TextInput';
import Select from '../../ui/Select';
import Button from '../../ui/Button';
import Note from '../../ui/Note';

// 명령 한 줄 — 명령 목록의 정의(인자 종류·선택지)대로 입력칸을 그리고 실행 버튼 하나를 둔다.
// 인자 없는 명령은 버튼만 보인다. placeholder로 현재 값을 보여 줄 수 있다.
export default function CommandForm({ command, placeholders, busy, onRun }: {
  command: DevCommand;
  placeholders?: Record<string, string>;
  busy: boolean;
  onRun: (args: Record<string, unknown>) => void;
}) {
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [bad, setBad] = useState(false);
  const set = (key: string, value: string) => setRaw(prev => ({ ...prev, [key]: value }));

  const run = () => {
    const parsed = parseDevArgs(command, raw);
    setBad(!parsed.ok);
    if (parsed.ok) onRun(parsed.args);
  };

  return (
    <div className="flex flex-col gap-1">
      {command.params.length > 0 && (
        <div className="grid grid-cols-2 gap-1 text-xs">
          {command.params.map(param => (
            <label key={param.key} className="flex flex-col gap-0.5">
              <span className="text-text-dim">{param.label}</span>
              {param.kind === 'select' ? (
                <Select compact value={raw[param.key] ?? ''} aria-label={`${command.label} ${param.label}`}
                        onChange={e => set(param.key, e.target.value)}>
                  <option value="">{placeholders?.[param.key] ?? '선택'}</option>
                  {param.options().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : (
                <TextInput compact type="number" value={raw[param.key] ?? ''} placeholder={placeholders?.[param.key]}
                           aria-label={`${command.label} ${param.label}`}
                           onChange={e => set(param.key, e.target.value)} />
              )}
            </label>
          ))}
        </div>
      )}
      <Button size="sm" disabled={busy} onClick={run} title={command.hint}>{command.label}</Button>
      {bad && <Note size="2xs" className="my-0">숫자를 올바르게 입력하세요.</Note>}
    </div>
  );
}
