import type { Day } from './types';

export function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span className="muted small">{label}</span>
      {children}
    </label>
  );
}

export function NumInput({
  value,
  onChange,
  step = 1,
  className,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  className?: string;
  label?: string;
}) {
  return (
    <input
      className={className}
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      aria-label={label}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
    />
  );
}

export const short = (place: string) =>
  place.replace(/,?\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)$/i, '').replace(/,\s*(Australia|New Zealand)$/i, '');
export const leg = (d: Day) => (d.from === d.to ? `${short(d.from)} 周边` : `${short(d.from)} → ${short(d.to)}`);

/** 车程分色：3 小时内 / 3–5 / 5–6 / 6 小时以上 */
export const hoursClass = (h: number) => (h > 6 ? 'h4' : h > 5 ? 'h3' : h > 3 ? 'h2' : h > 0.5 ? 'h1' : 'h0');

/** 出发倒计时（天），按本地日期算 */
export function daysUntil(iso: string, now = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((start - today) / 86_400_000);
}

/** 开销标题去掉括号里的说明，用在列表和提醒里 */
export const shortTitle = (t: string) => t.replace(/\s*[（(].*$/, '').trim() || t;

/** 小孩年龄（平台搜索要用）；没填时按 8 岁 */
export function childAges(trip: { children: number; childAges?: number[] }): number[] {
  return Array.from({ length: trip.children }, (_, i) => trip.childAges?.[i] ?? 8);
}
