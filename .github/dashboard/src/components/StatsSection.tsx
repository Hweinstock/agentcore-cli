import { PALETTE } from '../palette.js';
import type { StatValue } from '../types.js';
import React from 'react';

const COLOR_MAP: Record<string, string> = {
  green: PALETTE.green,
  red: PALETTE.red,
  yellow: PALETTE.yellow,
  accent: PALETTE.accent,
  purple: PALETTE.purple,
  dim: PALETTE.dim,
};

function StatRow({ items, small }: { items: StatValue[]; small?: boolean }) {
  return (
    <div className={`row${small ? ' sm' : ''}`}>
      {items.map(st => (
        <div key={st.key} className="st">
          <div className="v" style={{ color: st.color ? (COLOR_MAP[st.color] ?? 'var(--text)') : 'var(--text)' }}>
            {st.value}
          </div>
          <div className="l">
            {st.key}
            {st.sublabel ? ` (${st.sublabel})` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StatsSection({ stats }: { stats: StatValue[] }) {
  return (
    <>
      <StatRow items={stats.slice(0, 6)} />
      {stats.length > 6 && <StatRow items={stats.slice(6)} small />}
    </>
  );
}
