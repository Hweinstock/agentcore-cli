import type { TableRow, TableSection as TableSectionConfig } from '../types.js';
import React from 'react';

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'b-red',
  P1: 'b-yellow',
  P2: 'b-blue',
  bug: 'b-red',
  enhancement: 'b-blue',
};

const BUCKET_COLORS: Record<string, string> = {
  'needs-re-review': 'b-red',
  'needs-initial-review': 'b-yellow',
  'waiting-on-author': 'b-dim',
  approved: 'b-green',
  closed: 'b-dim',
};

function CellValue({ col, value, repo, isPR }: { col: string; value: unknown; repo: string; isPR: boolean }) {
  const str = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  if (col === 'number') {
    const url = `https://github.com/${repo}/${isPR ? 'pull' : 'issues'}/${str}`;
    return <a href={url}>#{String(value)}</a>;
  }
  if (col === 'labels' && Array.isArray(value)) {
    if (value.length === 0) return <span className="b b-red">unlabeled</span>;
    return (
      <>
        {value.map((l: string) => (
          <span key={l} className="b b-blue" style={{ marginRight: 4 }}>
            {l}
          </span>
        ))}
      </>
    );
  }
  if (col === 'state') {
    const cls = value === 'open' ? 'b-green' : 'b-dim';
    return <span className={`b ${cls}`}>{str}</span>;
  }
  if (col === 'draft') {
    return value ? <span className="b b-purple">draft</span> : null;
  }
  if (col === 'priority') {
    if (!value) return <span className="b b-dim">—</span>;
    const cls = PRIORITY_COLORS[str] ?? 'b-dim';
    return <span className={`b ${cls}`}>{str}</span>;
  }
  if (col === 'bucket') {
    const cls = BUCKET_COLORS[str] ?? 'b-dim';
    return <span className={`b ${cls}`}>{str}</span>;
  }
  if (col === 'age') return <>{String(value)}d</>;
  return <>{str}</>;
}

export default function TableSection({
  config,
  table,
  repo,
}: {
  config: TableSectionConfig;
  table: TableRow[];
  repo: string;
}) {
  const isPR = config.columns.includes('draft');
  return (
    <div className="tbl">
      <table>
        <thead>
          <tr>
            {config.columns.map(c => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.map((row, i) => (
            <tr key={i}>
              {config.columns.map(col => (
                <td key={col}>
                  <CellValue col={col} value={row[col]} repo={repo} isPR={isPR} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
