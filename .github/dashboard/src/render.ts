import type { DashboardConfig, PageData, SectionData } from './types.js';

const PALETTE = {
  bg: '#0d1117',
  card: '#161b22',
  text: '#e6edf3',
  border: '#30363d',
  dim: '#8b949e',
  accent: '#58a6ff',
  green: '#3fb950',
  red: '#f85149',
  yellow: '#d29922',
  purple: '#bc8cff',
} as const;
const CHART_COLORS = [
  PALETTE.accent,
  PALETTE.green,
  PALETTE.red,
  PALETTE.yellow,
  PALETTE.purple,
  '#f778ba',
  '#79c0ff',
  '#7ee787',
  '#ffa657',
  '#ff7b72',
];

const SCRIPT_CLOSE = '<' + '/script>';

function renderCSS(): string {
  return `<style>
:root{--bg:${PALETTE.bg};--card:${PALETTE.card};--text:${PALETTE.text};--border:${PALETTE.border};--dim:${PALETTE.dim};--accent:${PALETTE.accent};--green:${PALETTE.green};--red:${PALETTE.red};--yellow:${PALETTE.yellow};--purple:${PALETTE.purple}}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;padding:24px;max-width:1400px;margin:0 auto}
h1{font-size:22px;margin-bottom:4px}
.sub{color:var(--dim);font-size:13px;margin-bottom:16px}
nav{display:flex;gap:8px;margin-bottom:20px;padding:8px 12px;background:var(--card);border-radius:8px;border:1px solid var(--border)}
nav a{color:var(--dim);text-decoration:none;padding:6px 14px;border-radius:6px;font-weight:600;font-size:13px}
nav a:hover{color:var(--text);background:rgba(255,255,255,.04)}
nav a.active{color:var(--accent);background:rgba(31,111,235,.12)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px}
.card h2{font-size:14px;color:var(--accent);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border);position:relative}
.wide{grid-column:1/-1}
.row{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:10px}
.st{text-align:center;flex:1;min-width:90px;padding:8px 4px}
.st .v{font-size:26px;font-weight:700;line-height:1.2}
.st .l{font-size:11px;color:var(--dim);margin-top:2px}
.sm .v{font-size:18px}
.green{color:var(--green)}.red{color:var(--red)}.yellow{color:var(--yellow)}.accent{color:var(--accent)}.purple{color:var(--purple)}.dim{color:var(--dim)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--dim);font-weight:600}
td{padding:6px 8px;border-bottom:1px solid #21262d}
tr:hover{background:rgba(255,255,255,.02)}
a{color:var(--accent);text-decoration:none}
.b{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.b-green{background:rgba(63,185,80,.15);color:var(--green)}
.b-red{background:rgba(248,81,73,.15);color:var(--red)}
.b-yellow{background:rgba(210,153,34,.15);color:var(--yellow)}
.b-blue{background:rgba(88,166,255,.15);color:var(--accent)}
.b-dim{background:rgba(139,148,158,.15);color:var(--dim)}
.b-purple{background:rgba(188,140,255,.15);color:var(--purple)}
footer{text-align:center;color:#484f58;font-size:12px;margin-top:24px;padding:16px}
canvas{max-height:300px}
.copy-btn{position:absolute;right:0;top:-2px;background:none;border:none;color:var(--dim);cursor:pointer;font-size:14px;padding:4px 8px;border-radius:4px}
.copy-btn:hover{color:var(--text);background:rgba(255,255,255,.06)}
.copied{color:var(--green)!important}
.tabs{display:flex;gap:4px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:8px}
.tab{background:none;border:none;color:var(--dim);font-size:12px;font-weight:600;padding:4px 12px;border-radius:4px;cursor:pointer}
.tab:hover{color:var(--text);background:rgba(255,255,255,.04)}
.tab.active{color:var(--accent);background:rgba(31,111,235,.12)}
.extra{margin-top:12px}
.extra h4{font-size:13px;color:var(--dim);margin-bottom:8px}
</style>`;
}

function renderClientJS(page: PageData, config: DashboardConfig): string {
  return `<script>
const D=${JSON.stringify(page.sections)};
const REPO="https://github.com/${config.repo}";
const CL=${JSON.stringify(CHART_COLORS)};
const COL={accent:'${PALETTE.accent}',green:'${PALETTE.green}',red:'${PALETTE.red}',yellow:'${PALETTE.yellow}',purple:'${PALETTE.purple}',dim:'#484f58'};
Chart.defaults.color='${PALETTE.dim}';
Chart.defaults.borderColor='${PALETTE.border}';

function rateColor(pct){return pct>=90?COL.green:pct>=70?COL.yellow:COL.red;}

function makeTabs(container,tabNames,renderFn){
  let tabHtml='<div class="tabs">';
  tabNames.forEach(function(t,j){tabHtml+='<button class="tab'+(j===0?' active':'')+'" data-idx="'+j+'">'+t+'</button>';});
  tabHtml+='</div>';
  let panelsHtml='';
  tabNames.forEach(function(t,j){panelsHtml+='<div class="tab-panel" style="'+(j>0?'display:none':'')+'" data-panel="'+j+'">'+renderFn(t)+'</div>';});
  container.innerHTML=tabHtml+panelsHtml;
  container.querySelectorAll('.tab').forEach(function(btn){
    btn.onclick=function(){
      container.querySelectorAll('.tab').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      container.querySelectorAll('.tab-panel').forEach(function(p){p.style.display='none';});
      container.querySelector('[data-panel="'+btn.dataset.idx+'"]').style.display='';
    };
  });
}

D.forEach(function(s,i){
  var el=document.getElementById('s'+i);
  if(!el)return;
  var c=s.config;

  if(c.type==='stats'&&s.stats){
    function renderRow(items,cls){
      return '<div class="row'+(cls?' '+cls:'')+'">'+items.map(function(st){
        var col=st.color?COL[st.color]||'var(--text)':'var(--text)';
        return '<div class="st"><div class="v" style="color:'+col+'">'+st.value+'</div><div class="l">'+st.key+(st.sublabel?' ('+st.sublabel+')':'')+'</div></div>';
      }).join('')+'</div>';
    }
    function renderStats(stats){
      var p=stats.slice(0,6),sc=stats.slice(6);
      return renderRow(p,'')+renderRow(sc,'sm');
    }
    var windows=s.windowedStats||{};
    var tabs=['All Time'].concat(Object.keys(windows));
    var allData=Object.assign({'All Time':s.stats},windows);
    makeTabs(el,tabs,function(t){return renderStats(allData[t]);});
  }

  if(c.type==='timeline'&&s.timeline){
    var labels=s.timeline.map(function(b){return b.week;});
    var ds=c.series.map(function(k,j){
      var cum=k.startsWith('cumulative');
      return{label:k.replace(/([A-Z])/g,' $1').trim(),data:s.timeline.map(function(b){return b[k]||0;}),
        type:cum?'line':'bar',
        backgroundColor:cum?'transparent':j===0?'rgba(210,153,34,0.7)':'rgba(63,185,80,0.7)',
        borderColor:cum?'${PALETTE.accent}':undefined,borderWidth:cum?2:0,pointRadius:cum?2:undefined,
        yAxisID:cum?'y1':'y',order:cum?0:1,borderRadius:cum?0:3};
    });
    new Chart(el.querySelector('canvas'),{type:'bar',data:{labels:labels,datasets:ds},
      options:{responsive:true,interaction:{mode:'index'},
        plugins:{legend:{position:'bottom',labels:{boxWidth:12,padding:16}}},
        scales:{y:{beginAtZero:true,title:{display:true,text:'Weekly'}},
          y1:{position:'right',beginAtZero:true,title:{display:true,text:'Cumulative'},grid:{drawOnChartArea:false}}}}});
  }

  if(c.type==='distribution'&&s.chart){
    if(c.chart==='doughnut'){
      new Chart(el.querySelector('canvas'),{type:'doughnut',data:{labels:s.chart.labels,
        datasets:[{data:s.chart.values,backgroundColor:CL.slice(0,s.chart.labels.length)}]},
        options:{responsive:true,plugins:{legend:{position:'right',labels:{boxWidth:10,padding:8,font:{size:11}}}}}});
    }else{
      new Chart(el.querySelector('canvas'),{type:'bar',data:{labels:s.chart.labels,
        datasets:[{data:s.chart.values,backgroundColor:s.chart.colors||CL.slice(0,s.chart.labels.length),borderRadius:3}]},
        options:{indexAxis:c.orientation==='horizontal'?'y':'x',responsive:true,plugins:{legend:{display:false}}}});
    }
  }

  if(c.type==='histogram'){
    if(s.histogramGrouped){
      var g=s.histogramGrouped;var keys=Object.keys(g);
      var hLabels=(g[keys[0]]||[]).map(function(b){return b.label;});
      new Chart(el.querySelector('canvas'),{type:'bar',data:{labels:hLabels,
        datasets:keys.map(function(k,j){return{label:k,data:g[k].map(function(b){return b.count;}),backgroundColor:CL[j%CL.length],borderRadius:2};})},
        options:{responsive:true,plugins:{legend:{position:'bottom',labels:{boxWidth:10}}},scales:{y:{beginAtZero:true}}}});
    }else if(s.histogram){
      var n=s.histogram.length;
      var bg=s.histogram.map(function(_,j){var t=n>1?j/(n-1):0;
        return t<0.25?'rgba(63,185,80,0.7)':t<0.5?'rgba(88,166,255,0.7)':t<0.75?'rgba(210,153,34,0.7)':'rgba(248,81,73,0.7)';});
      new Chart(el.querySelector('canvas'),{type:'bar',data:{labels:s.histogram.map(function(b){return b.label;}),
        datasets:[{data:s.histogram.map(function(b){return b.count;}),backgroundColor:bg,borderRadius:3}]},
        options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
    }
  }

  if(c.type==='table'&&s.table){
    var cols=c.columns;
    var isPR=cols.includes('draft');
    var h='<table><thead><tr>'+cols.map(function(c){return '<th>'+c+'</th>';}).join('')+'</tr></thead><tbody>';
    s.table.forEach(function(row){
      h+='<tr>'+cols.map(function(col){
        var v=row[col];
        if(col==='number')v='<a href="'+REPO+(isPR?'/pull/':'/issues/')+v+'">#'+v+'</a>';
        else if(col==='labels'&&Array.isArray(v))v=v.length?v.map(function(l){return '<span class="b b-blue">'+l+'</span>';}).join(' '):'<span class="b b-red">unlabeled</span>';
        else if(col==='state')v='<span class="b '+(v==='open'?'b-green':'b-dim')+'">'+v+'</span>';
        else if(col==='draft')v=v?'<span class="b b-purple">draft</span>':'';
        else if(col==='priority'){var colors={'P0':'b-red','P1':'b-yellow','P2':'b-blue','bug':'b-red','enhancement':'b-blue'};v=v?'<span class="b '+(colors[v]||'b-dim')+'">'+v+'</span>':'<span class="b b-dim">—</span>';}
        else if(col==='bucket'){var colors={'needs-re-review':'b-red','needs-initial-review':'b-yellow','waiting-on-author':'b-dim','approved':'b-green','closed':'b-dim'};v='<span class="b '+(colors[v]||'b-dim')+'">'+v+'</span>';}
        else if(col==='age')v=v+'d';
        return '<td>'+v+'</td>';
      }).join('')+'</tr>';
    });
    el.querySelector('.tbl').innerHTML=h+'</tbody></table>';
  }

  if(c.type==='termFrequency'){
    if(s.terms&&s.terms.length){
      var th='<table><thead><tr><th>Term</th><th>Occurrences in Unlabeled Issues</th></tr></thead><tbody>';
      s.terms.forEach(function(t){th+='<tr><td><span class="b b-blue">'+t.term+'</span></td><td>'+t.count+'</td></tr>';});
      el.querySelector('.tbl').innerHTML=th+'</tbody></table>';
    }
    if(s.unusedLabels&&s.unusedLabels.length){
      el.querySelector('.extra').innerHTML='<h4>Defined but Unused Labels</h4><div>'+
        s.unusedLabels.map(function(l){return '<span class="b b-yellow" style="margin:2px">'+l+'</span>';}).join(' ')+'</div>';
    }
  }

  if(c.type==='ci'&&s.ci){
    var ci=s.ci;
    function renderCIStats(overall,perWf){
      var h='<div class="row"><div class="st"><div class="v" style="color:'+rateColor(overall)+'">'+overall+'%</div><div class="l">Overall Pass Rate</div></div>';
      Object.entries(perWf).forEach(function(e){
        h+='<div class="st"><div class="v" style="color:'+rateColor(e[1])+'">'+e[1]+'%</div><div class="l">'+e[0]+'</div></div>';
      });
      return h+'</div>';
    }
    var ciWindows=ci.windows||{};
    var ciTabs=['All Time'].concat(Object.keys(ciWindows));
    var ciAllData=Object.assign({'All Time':{overallPassRate:ci.overallPassRate,passRate:ci.passRate}},ciWindows);
    makeTabs(el.querySelector('.ci-stats'),ciTabs,function(t){var d=ciAllData[t];return renderCIStats(d.overallPassRate,d.passRate);});

    new Chart(el.querySelector('.ci-timeline canvas'),{type:'bar',data:{
      labels:ci.timeline.map(function(w){return w.week;}),
      datasets:[
        {label:'Pass',data:ci.timeline.map(function(w){return w.pass;}),backgroundColor:'rgba(63,185,80,0.7)',borderRadius:3},
        {label:'Fail',data:ci.timeline.map(function(w){return w.fail;}),backgroundColor:'rgba(248,81,73,0.7)',borderRadius:3}
      ]},options:{responsive:true,plugins:{legend:{position:'bottom',labels:{boxWidth:10}}},scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}}});

    if(ci.failingJobs.length){
      var ft='<table><thead><tr><th>Job</th><th>Failures</th><th>Total Runs</th><th>Fail Rate</th></tr></thead><tbody>';
      ci.failingJobs.forEach(function(j){
        var col=j.rate>=20?'b-red':j.rate>=10?'b-yellow':'b-dim';
        ft+='<tr><td>'+j.job+'</td><td>'+j.failures+'</td><td>'+j.total+'</td><td><span class="b '+col+'">'+j.rate+'%</span></td></tr>';
      });
      el.querySelector('.ci-failing').innerHTML=ft+'</tbody></table>';
    }else{el.querySelector('.ci-failing').innerHTML='<p style="color:var(--dim)">No failures!</p>';}

    if(ci.flaky.length){
      var flt='<table><thead><tr><th>Job</th><th>Pass/Fail Flips</th></tr></thead><tbody>';
      ci.flaky.forEach(function(f){flt+='<tr><td>'+f.job+'</td><td><span class="b b-yellow">'+f.flipCount+'</span></td></tr>';});
      el.querySelector('.ci-flaky').innerHTML=flt+'</tbody></table>';
    }else{el.querySelector('.ci-flaky').innerHTML='<p style="color:var(--dim)">No flaky jobs detected (threshold: 3+ flips)</p>';}

    if(ci.recentFailures.length){
      var rt='<table><thead><tr><th>Date</th><th>Workflow</th><th>Failed Jobs</th></tr></thead><tbody>';
      ci.recentFailures.forEach(function(r){
        rt+='<tr><td>'+r.date+'</td><td>'+r.workflow+'</td><td>'+r.failedJobs.map(function(j){return '<span class="b b-red">'+j+'</span>';}).join(' ')+'</td></tr>';
      });
      el.querySelector('.ci-recent').innerHTML=rt+'</tbody></table>';
    }

    var jobs=Object.keys(ci.avgDuration);
    new Chart(el.querySelector('.ci-duration canvas'),{type:'bar',data:{
      labels:jobs,datasets:[{data:jobs.map(function(j){return ci.avgDuration[j];}),backgroundColor:'rgba(88,166,255,0.7)',borderRadius:3}]},
      options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false},title:{display:true,text:'Avg Duration (min)'}}}});
  }
});

document.querySelectorAll('.copy-btn').forEach(function(btn){
  btn.onclick=function(){
    var card=btn.closest('.card');
    var table=card.querySelector('table');
    var text='';
    if(table){
      var rows=[].slice.call(table.querySelectorAll('tr'));
      text=rows.map(function(r){return [].slice.call(r.querySelectorAll('th,td')).map(function(c){return c.textContent.trim();}).join(' | ');}).join('\\n');
    }else{
      text=card.textContent.replace(/📋/g,'').trim();
    }
    navigator.clipboard.writeText(text).then(function(){
      btn.textContent='✓';
      btn.classList.add('copied');
      setTimeout(function(){btn.textContent='📋';btn.classList.remove('copied');},1500);
    });
  };
});
${SCRIPT_CLOSE}`;
}

export function renderPage(page: PageData, config: DashboardConfig): string {
  const nav = config.pages
    .map(p => `<a href="${p.id}.html"${p.id === page.id ? ' class="active"' : ''}>${p.title}</a>`)
    .join('');

  const sections = page.sections.map((s, i) => renderSection(s, i)).join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${page.title} — ${config.repo} Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4">${SCRIPT_CLOSE}
${renderCSS()}</head><body>
<h1>📊 ${config.repo.split('/')[1]} Dashboard</h1>
<p class="sub">Generated: ${page.generatedAt} · <a href="https://github.com/${config.repo}">${config.repo}</a></p>
<nav>${nav}</nav>
<div class="grid">${sections}</div>
<footer>Data fetched live from GitHub API</footer>
${renderClientJS(page, config)}</body></html>`;
}

const SECTION_INNER: Record<string, (i: number) => string> = {
  stats: i => `<div id="s${i}"></div>`,
  timeline: i => `<div id="s${i}"><canvas></canvas></div>`,
  distribution: i => `<div id="s${i}"><canvas></canvas></div>`,
  histogram: i => `<div id="s${i}"><canvas></canvas></div>`,
  table: i => `<div id="s${i}"><div class="tbl"></div></div>`,
  ci: i => `<div id="s${i}">
      <div class="ci-stats"></div>
      <div class="grid" style="margin-top:16px">
        <div class="card wide"><h2>📈 Pass/Fail Over Time</h2><div class="ci-timeline"><canvas></canvas></div></div>
      </div>
      <div class="grid" style="margin-top:16px">
        <div class="card"><h2>❌ Most Failing Jobs</h2><div class="ci-failing"></div></div>
        <div class="card"><h2>🔄 Flaky Jobs (pass↔fail flips)</h2><div class="ci-flaky"></div></div>
      </div>
      <div class="grid" style="margin-top:16px">
        <div class="card"><h2>🕐 Avg Job Duration</h2><div class="ci-duration"><canvas></canvas></div></div>
        <div class="card"><h2>🔥 Recent Failures</h2><div class="ci-recent"></div></div>
      </div>
    </div>`,
  termFrequency: i => `<div id="s${i}"><div class="tbl"></div><div class="extra"></div></div>`,
};

function renderSection(s: SectionData, i: number): string {
  const c = s.config;
  const wide =
    c.type === 'stats' || c.type === 'timeline' || c.type === 'table' || c.type === 'termFrequency' || c.type === 'ci'
      ? ' wide'
      : '';
  const title = sectionTitle(s);
  const renderInner =
    SECTION_INNER[c.type] ??
    ((idx: number) => `<div id="s${idx}"><div class="tbl"></div><div class="extra"></div></div>`);
  const inner = renderInner(i);
  return `<div class="card${wide}"><h2>${title}<button class="copy-btn">📋</button></h2>${inner}</div>`;
}

function sectionTitle(s: SectionData): string {
  const c = s.config;
  switch (c.type) {
    case 'stats':
      return '📊 Overview';
    case 'timeline':
      return '📈 Activity Over Time';
    case 'distribution':
      return distributionTitle(c.field);
    case 'histogram':
      return c.title ? `⏱️ ${c.title}` : `⏱️ ${c.field}`;
    case 'table':
      return tableIcon(c.id) + ' ' + c.title;
    case 'termFrequency':
      return c.title ?? '🔍 Common Terms in Unlabeled Issues';
    case 'ci':
      return '🧪 CI / Test Health';
  }
}

function distributionTitle(field: string): string {
  const map: Record<string, string> = {
    labels: '🏷️ Issues by Label',
    age: '📅 Open Issue Age',
    sizeLabel: '📏 PR Size Distribution',
    author: '👥 Top Authors',
    bucket: '📊 Open PR Status',
    linkedIssuePriority: '🎯 PR Priority (from linked issues)',
  };
  return map[field] ?? `📊 ${field}`;
}

function tableIcon(id: string): string {
  return id === 'stale' ? '🧊' : id === 'engagement' ? '💬' : '📋';
}
