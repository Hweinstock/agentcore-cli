import type { TermCount } from '../types.js';
import React from 'react';

export default function TermFrequencySection({ terms, unusedLabels }: { terms: TermCount[]; unusedLabels: string[] }) {
  return (
    <>
      {terms.length > 0 && (
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Term</th>
                <th>Occurrences in Unlabeled Issues</th>
              </tr>
            </thead>
            <tbody>
              {terms.map(t => (
                <tr key={t.term}>
                  <td>
                    <span className="b b-blue">{t.term}</span>
                  </td>
                  <td>{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unusedLabels.length > 0 && (
        <div className="extra">
          <h4>Defined but Unused Labels</h4>
          <div>
            {unusedLabels.map(l => (
              <span key={l} className="b b-yellow" style={{ margin: 2 }}>
                {l}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
