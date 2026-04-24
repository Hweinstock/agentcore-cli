import type { SectionData } from '../types.js';
import CISection from './CISection.js';
import ChartSection from './ChartSection.js';
import StatsSection from './StatsSection.js';
import TableSectionComponent from './TableSection.js';
import TermFrequencySection from './TermFrequencySection.js';
import React from 'react';

function sectionTitle(s: SectionData): string {
  const c = s.config;
  switch (c.type) {
    case 'stats':
      return '📊 Overview';
    case 'timeline':
      return '📈 Activity Over Time';
    case 'distribution': {
      const map: Record<string, string> = {
        labels: '🏷️ Issues by Label',
        age: '📅 Open Issue Age',
        sizeLabel: '📏 PR Size Distribution',
        author: '👥 Top Authors',
        bucket: '📊 Open PR Status',
        linkedIssuePriority: '🎯 PR Priority (from linked issues)',
      };
      return map[c.field] ?? `📊 ${c.field}`;
    }
    case 'histogram':
      return c.title ? `⏱️ ${c.title}` : `⏱️ ${c.field}`;
    case 'table':
      return `${c.id === 'stale' ? '🧊' : c.id === 'engagement' ? '💬' : '📋'} ${c.title}`;
    case 'termFrequency':
      return c.title ?? '🔍 Common Terms in Unlabeled Issues';
    case 'ci':
      return '🧪 CI / Test Health';
  }
}

const WIDE_TYPES = new Set(['stats', 'timeline', 'table', 'termFrequency', 'ci']);

function SectionContent({ sectionData, index, repo }: { sectionData: SectionData; index: number; repo: string }) {
  const type = sectionData.config.type;
  if (type === 'stats' && sectionData.stats) {
    return <StatsSection stats={sectionData.stats} windowedStats={sectionData.windowedStats} />;
  }
  if (type === 'timeline' || type === 'distribution' || type === 'histogram') {
    return <ChartSection sectionData={sectionData} index={index} />;
  }
  if (type === 'table' && sectionData.table && sectionData.config.type === 'table') {
    return <TableSectionComponent config={sectionData.config} table={sectionData.table} repo={repo} />;
  }
  if (type === 'ci' && sectionData.ci) {
    return <CISection ci={sectionData.ci} />;
  }
  if (type === 'termFrequency') {
    return <TermFrequencySection terms={sectionData.terms ?? []} unusedLabels={sectionData.unusedLabels ?? []} />;
  }
  return null;
}

export default function Section({
  sectionData,
  index,
  repo,
}: {
  sectionData: SectionData;
  index: number;
  repo: string;
}) {
  const wide = WIDE_TYPES.has(sectionData.config.type);
  const title = sectionTitle(sectionData);
  return (
    <div className={`card${wide ? ' wide' : ''}`}>
      <h2>
        {title}
        <button className="copy-btn">📋</button>
      </h2>
      <SectionContent sectionData={sectionData} index={index} repo={repo} />
    </div>
  );
}
