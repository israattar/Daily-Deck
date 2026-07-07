// Minimal dependency-free bar chart. Hover a bar for the exact value.
// data: [{ label, value, tip? }]
import React from 'react';

export default function BarChart({ data, height = 150, maxLabels = 14, format = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const labelEvery = Math.ceil(data.length / maxLabels);

  return (
    <div>
      <div className="chart" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={i}
            className="bar"
            style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
            data-tip={d.tip || `${d.label}: ${format(d.value)}`}
          />
        ))}
      </div>
      <div className="chart-labels">
        {data.map((d, i) => (
          <span key={i}>{i % labelEvery === 0 ? d.label : ''}</span>
        ))}
      </div>
    </div>
  );
}
