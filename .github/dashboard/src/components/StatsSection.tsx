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

function StatsContent({ stats }: { stats: StatValue[] }) {
  return (
    <>
      <StatRow items={stats.slice(0, 6)} />
      {stats.length > 6 && <StatRow items={stats.slice(6)} small />}
    </>
  );
}

const TAB_SCRIPT = `
(function(){
  document.querySelectorAll('[data-stats-tabs]').forEach(function(container){
    container.querySelectorAll('.tab').forEach(function(btn){
      btn.onclick=function(){
        container.querySelectorAll('.tab').forEach(function(b){b.classList.remove('active')});
        btn.classList.add('active');
        container.querySelectorAll('.tab-panel').forEach(function(p){p.style.display='none'});
        container.querySelector('[data-panel="'+btn.dataset.idx+'"]').style.display='';
      };
    });
  });
})();
`;

export default function StatsSection({
  stats,
  windowedStats,
}: {
  stats: StatValue[];
  windowedStats?: Record<string, StatValue[]>;
}) {
  if (!windowedStats || Object.keys(windowedStats).length === 0) {
    return <StatsContent stats={stats} />;
  }

  const tabs = ['All Time', ...Object.keys(windowedStats)];
  const allData: Record<string, StatValue[]> = { 'All Time': stats, ...windowedStats };

  return (
    <div data-stats-tabs="">
      <div className="tabs">
        {tabs.map((t, j) => (
          <button key={t} className={`tab${j === 0 ? ' active' : ''}`} data-idx={j}>
            {t}
          </button>
        ))}
      </div>
      {tabs.map((t, j) => (
        <div key={t} className="tab-panel" style={j > 0 ? { display: 'none' } : undefined} data-panel={j}>
          <StatsContent stats={allData[t] ?? []} />
        </div>
      ))}
      <script dangerouslySetInnerHTML={{ __html: TAB_SCRIPT }} />
    </div>
  );
}
