/* eslint-disable */
// @ts-nocheck
// Client-side dashboard rendering. Placeholders are injected at build time.

const D = __DATA__;
const REPO = __REPO__;
const CL = __CHART_COLORS__;
const COL = __PALETTE__;
Chart.defaults.color = COL.dim;
Chart.defaults.borderColor = '#30363d';

function rateColor(pct) {
  return pct >= 90 ? COL.green : pct >= 70 ? COL.yellow : COL.red;
}

function makeTabs(container, tabNames, renderFn) {
  var h = '<div class="tabs">';
  tabNames.forEach(function (t, j) {
    h += '<button class="tab' + (j === 0 ? ' active' : '') + '" data-idx="' + j + '">' + t + '</button>';
  });
  h += '</div>';
  tabNames.forEach(function (t, j) {
    h +=
      '<div class="tab-panel" style="' +
      (j > 0 ? 'display:none' : '') +
      '" data-panel="' +
      j +
      '">' +
      renderFn(t) +
      '</div>';
  });
  container.innerHTML = h;
  container.querySelectorAll('.tab').forEach(function (btn) {
    btn.onclick = function () {
      container.querySelectorAll('.tab').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      container.querySelectorAll('.tab-panel').forEach(function (p) {
        p.style.display = 'none';
      });
      container.querySelector('[data-panel="' + btn.dataset.idx + '"]').style.display = '';
    };
  });
}

function renderRow(items, cls) {
  return (
    '<div class="row' +
    (cls ? ' ' + cls : '') +
    '">' +
    items
      .map(function (st) {
        var col = st.color ? COL[st.color] || 'var(--text)' : 'var(--text)';
        return (
          '<div class="st"><div class="v" style="color:' +
          col +
          '">' +
          st.value +
          '</div><div class="l">' +
          st.key +
          (st.sublabel ? ' (' + st.sublabel + ')' : '') +
          '</div></div>'
        );
      })
      .join('') +
    '</div>'
  );
}

function renderStats(stats) {
  return renderRow(stats.slice(0, 6), '') + renderRow(stats.slice(6), 'sm');
}

D.forEach(function (s, i) {
  var el = document.getElementById('s' + i);
  if (!el) return;
  var c = s.config;

  if (c.type === 'stats' && s.stats) {
    var windows = s.windowedStats || {};
    var tabs = ['All Time'].concat(Object.keys(windows));
    var allData = Object.assign({ 'All Time': s.stats }, windows);
    makeTabs(el, tabs, function (t) {
      return renderStats(allData[t]);
    });
  }

  if (c.type === 'timeline' && s.timeline) {
    var labels = s.timeline.map(function (b) {
      return b.week;
    });
    var ds = c.series.map(function (k, j) {
      var cum = k.startsWith('cumulative');
      return {
        label: k.replace(/([A-Z])/g, ' $1').trim(),
        data: s.timeline.map(function (b) {
          return b[k] || 0;
        }),
        type: cum ? 'line' : 'bar',
        backgroundColor: cum ? 'transparent' : j === 0 ? 'rgba(210,153,34,0.7)' : 'rgba(63,185,80,0.7)',
        borderColor: cum ? COL.accent : undefined,
        borderWidth: cum ? 2 : 0,
        pointRadius: cum ? 2 : undefined,
        yAxisID: cum ? 'y1' : 'y',
        order: cum ? 0 : 1,
        borderRadius: cum ? 0 : 3,
      };
    });
    new Chart(el.querySelector('canvas'), {
      type: 'bar',
      data: { labels: labels, datasets: ds },
      options: {
        responsive: true,
        interaction: { mode: 'index' },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Weekly' } },
          y1: {
            position: 'right',
            beginAtZero: true,
            title: { display: true, text: 'Cumulative' },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  if (c.type === 'distribution' && s.chart) {
    if (c.chart === 'doughnut') {
      new Chart(el.querySelector('canvas'), {
        type: 'doughnut',
        data: {
          labels: s.chart.labels,
          datasets: [{ data: s.chart.values, backgroundColor: CL.slice(0, s.chart.labels.length) }],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'right', labels: { boxWidth: 10, padding: 8, font: { size: 11 } } } },
        },
      });
    } else {
      new Chart(el.querySelector('canvas'), {
        type: 'bar',
        data: {
          labels: s.chart.labels,
          datasets: [
            {
              data: s.chart.values,
              backgroundColor: s.chart.colors || CL.slice(0, s.chart.labels.length),
              borderRadius: 3,
            },
          ],
        },
        options: {
          indexAxis: c.orientation === 'horizontal' ? 'y' : 'x',
          responsive: true,
          plugins: { legend: { display: false } },
        },
      });
    }
  }

  if (c.type === 'histogram') {
    if (s.histogramGrouped) {
      var g = s.histogramGrouped;
      var keys = Object.keys(g);
      var hLabels = (g[keys[0]] || []).map(function (b) {
        return b.label;
      });
      new Chart(el.querySelector('canvas'), {
        type: 'bar',
        data: {
          labels: hLabels,
          datasets: keys.map(function (k, j) {
            return {
              label: k,
              data: g[k].map(function (b) {
                return b.count;
              }),
              backgroundColor: CL[j % CL.length],
              borderRadius: 2,
            };
          }),
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } },
          scales: { y: { beginAtZero: true } },
        },
      });
    } else if (s.histogram) {
      var n = s.histogram.length;
      var bg = s.histogram.map(function (_, j) {
        var t = n > 1 ? j / (n - 1) : 0;
        return t < 0.25
          ? 'rgba(63,185,80,0.7)'
          : t < 0.5
            ? 'rgba(88,166,255,0.7)'
            : t < 0.75
              ? 'rgba(210,153,34,0.7)'
              : 'rgba(248,81,73,0.7)';
      });
      new Chart(el.querySelector('canvas'), {
        type: 'bar',
        data: {
          labels: s.histogram.map(function (b) {
            return b.label;
          }),
          datasets: [
            {
              data: s.histogram.map(function (b) {
                return b.count;
              }),
              backgroundColor: bg,
              borderRadius: 3,
            },
          ],
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    }
  }

  if (c.type === 'table' && s.table) {
    var cols = c.columns;
    var isPR = cols.includes('draft');
    var h =
      '<table><thead><tr>' +
      cols
        .map(function (c) {
          return '<th>' + c + '</th>';
        })
        .join('') +
      '</tr></thead><tbody>';
    s.table.forEach(function (row) {
      h +=
        '<tr>' +
        cols
          .map(function (col) {
            var v = row[col];
            if (col === 'number') v = '<a href="' + REPO + (isPR ? '/pull/' : '/issues/') + v + '">#' + v + '</a>';
            else if (col === 'labels' && Array.isArray(v))
              v = v.length
                ? v
                    .map(function (l) {
                      return '<span class="b b-blue">' + l + '</span>';
                    })
                    .join(' ')
                : '<span class="b b-red">unlabeled</span>';
            else if (col === 'state')
              v = '<span class="b ' + (v === 'open' ? 'b-green' : 'b-dim') + '">' + v + '</span>';
            else if (col === 'draft') v = v ? '<span class="b b-purple">draft</span>' : '';
            else if (col === 'priority') {
              var pc = { P0: 'b-red', P1: 'b-yellow', P2: 'b-blue', bug: 'b-red', enhancement: 'b-blue' };
              v = v ? '<span class="b ' + (pc[v] || 'b-dim') + '">' + v + '</span>' : '<span class="b b-dim">—</span>';
            } else if (col === 'bucket') {
              var bc = {
                'needs-re-review': 'b-red',
                'needs-initial-review': 'b-yellow',
                'waiting-on-author': 'b-dim',
                approved: 'b-green',
                closed: 'b-dim',
              };
              v = '<span class="b ' + (bc[v] || 'b-dim') + '">' + v + '</span>';
            } else if (col === 'age') v = v + 'd';
            return '<td>' + v + '</td>';
          })
          .join('') +
        '</tr>';
    });
    el.querySelector('.tbl').innerHTML = h + '</tbody></table>';
  }

  if (c.type === 'termFrequency') {
    if (s.terms && s.terms.length) {
      var th = '<table><thead><tr><th>Term</th><th>Occurrences in Unlabeled Issues</th></tr></thead><tbody>';
      s.terms.forEach(function (t) {
        th += '<tr><td><span class="b b-blue">' + t.term + '</span></td><td>' + t.count + '</td></tr>';
      });
      el.querySelector('.tbl').innerHTML = th + '</tbody></table>';
    }
    if (s.unusedLabels && s.unusedLabels.length) {
      el.querySelector('.extra').innerHTML =
        '<h4>Defined but Unused Labels</h4><div>' +
        s.unusedLabels
          .map(function (l) {
            return '<span class="b b-yellow" style="margin:2px">' + l + '</span>';
          })
          .join(' ') +
        '</div>';
    }
  }

  if (c.type === 'ci' && s.ci) {
    var ci = s.ci;
    function renderCIStats(overall, perWf) {
      var h =
        '<div class="row"><div class="st"><div class="v" style="color:' +
        rateColor(overall) +
        '">' +
        overall +
        '%</div><div class="l">Overall Pass Rate</div></div>';
      Object.entries(perWf).forEach(function (e) {
        h +=
          '<div class="st"><div class="v" style="color:' +
          rateColor(e[1]) +
          '">' +
          e[1] +
          '%</div><div class="l">' +
          e[0] +
          '</div></div>';
      });
      return h + '</div>';
    }
    var ciWindows = ci.windows || {};
    var ciTabs = ['All Time'].concat(Object.keys(ciWindows));
    var ciAllData = Object.assign(
      { 'All Time': { overallPassRate: ci.overallPassRate, passRate: ci.passRate } },
      ciWindows
    );
    makeTabs(el.querySelector('.ci-stats'), ciTabs, function (t) {
      var d = ciAllData[t];
      return renderCIStats(d.overallPassRate, d.passRate);
    });

    new Chart(el.querySelector('.ci-timeline canvas'), {
      type: 'bar',
      data: {
        labels: ci.timeline.map(function (w) {
          return w.week;
        }),
        datasets: [
          {
            label: 'Pass',
            data: ci.timeline.map(function (w) {
              return w.pass;
            }),
            backgroundColor: 'rgba(63,185,80,0.7)',
            borderRadius: 3,
          },
          {
            label: 'Fail',
            data: ci.timeline.map(function (w) {
              return w.fail;
            }),
            backgroundColor: 'rgba(248,81,73,0.7)',
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
      },
    });

    if (ci.failingJobs.length) {
      var ft =
        '<table><thead><tr><th>Job</th><th>Failures</th><th>Total Runs</th><th>Fail Rate</th></tr></thead><tbody>';
      ci.failingJobs.forEach(function (j) {
        var col = j.rate >= 20 ? 'b-red' : j.rate >= 10 ? 'b-yellow' : 'b-dim';
        ft +=
          '<tr><td>' +
          j.job +
          '</td><td>' +
          j.failures +
          '</td><td>' +
          j.total +
          '</td><td><span class="b ' +
          col +
          '">' +
          j.rate +
          '%</span></td></tr>';
      });
      el.querySelector('.ci-failing').innerHTML = ft + '</tbody></table>';
    } else {
      el.querySelector('.ci-failing').innerHTML = '<p style="color:var(--dim)">No failures!</p>';
    }

    if (ci.flaky.length) {
      var flt = '<table><thead><tr><th>Job</th><th>Pass/Fail Flips</th></tr></thead><tbody>';
      ci.flaky.forEach(function (f) {
        flt += '<tr><td>' + f.job + '</td><td><span class="b b-yellow">' + f.flipCount + '</span></td></tr>';
      });
      el.querySelector('.ci-flaky').innerHTML = flt + '</tbody></table>';
    } else {
      el.querySelector('.ci-flaky').innerHTML =
        '<p style="color:var(--dim)">No flaky jobs detected (threshold: 3+ flips)</p>';
    }

    if (ci.recentFailures.length) {
      var rt = '<table><thead><tr><th>Date</th><th>Workflow</th><th>Failed Jobs</th></tr></thead><tbody>';
      ci.recentFailures.forEach(function (r) {
        rt +=
          '<tr><td>' +
          r.date +
          '</td><td>' +
          r.workflow +
          '</td><td>' +
          r.failedJobs
            .map(function (j) {
              return '<span class="b b-red">' + j + '</span>';
            })
            .join(' ') +
          '</td></tr>';
      });
      el.querySelector('.ci-recent').innerHTML = rt + '</tbody></table>';
    }

    var jobs = Object.keys(ci.avgDuration);
    new Chart(el.querySelector('.ci-duration canvas'), {
      type: 'bar',
      data: {
        labels: jobs,
        datasets: [
          {
            data: jobs.map(function (j) {
              return ci.avgDuration[j];
            }),
            backgroundColor: 'rgba(88,166,255,0.7)',
            borderRadius: 3,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false }, title: { display: true, text: 'Avg Duration (min)' } },
      },
    });
  }
});

document.querySelectorAll('.copy-btn').forEach(function (btn) {
  btn.onclick = function () {
    var card = btn.closest('.card');
    var table = card.querySelector('table');
    var text = '';
    if (table) {
      var rows = [].slice.call(table.querySelectorAll('tr'));
      text = rows
        .map(function (r) {
          return [].slice
            .call(r.querySelectorAll('th,td'))
            .map(function (c) {
              return c.textContent.trim();
            })
            .join(' | ');
        })
        .join('\n');
    } else {
      text = card.textContent.replace(/📋/g, '').trim();
    }
    navigator.clipboard.writeText(text).then(function () {
      btn.textContent = '✓';
      btn.classList.add('copied');
      setTimeout(function () {
        btn.textContent = '📋';
        btn.classList.remove('copied');
      }, 1500);
    });
  };
});
