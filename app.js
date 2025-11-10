/* ===========================
   Florida Gators MBB Hub
   Single-file vanilla JS
   =========================== */

/** ---------- Quick config ---------- **/
const SCHOOL = "Florida";
const TEAM_KEY = "gators-mbb";
const DEFAULT_SEASONS = ["2024-25","2023-24","2022-23","2021-22","2020-21"]; // add more freely
const REFRESH_MS = 5 * 60 * 1000; // auto-refresh interval for stats/news

/** ---------- Data sources (choose one) ----------
 * You have three ingestion paths for Sports-Reference data:
 * A) Paste JSON/CSV URLs (Google Sheet published as CSV recommended)
 * B) Use a tiny CORS-friendly proxy that returns JSON from Sports-Reference HTML
 * C) Manual JSON blocks (super easy; works everywhere)
 *
 * Below: we default to SAMPLE_DATA so the site renders day one.
 * Then you can flip to CSV or proxy for “live” pulls.
 */

// A) CSV endpoints (Google Sheets "Publish to Web" -> CSV) — easiest no-server path
const DATA_CSV = {
  // TODO: replace with your published CSV URLs (one per season, or one wide “players” CSV).
  // Example:
  // "2024-25": "https://docs.google.com/spreadsheets/d/XXXX/pub?output=csv"
};

// B) Proxy endpoint returning normalized JSON { roster: [], teamStats: {}, playerStats: [] }
const PROXY_BASE = ""; // e.g., "https://your-worker.example.workers.dev"
// Example expected routes (you implement on the proxy):
//  - `${PROXY_BASE}/roster?school=Florida&season=2024-25`
//  - `${PROXY_BASE}/team-stats?school=Florida&season=2024-25`
//  - `${PROXY_BASE}/player-stats?school=Florida&season=2024-25`

// C) Sample seed so UI works immediately (edit freely)
const SAMPLE_DATA = {
  "2024-25": {
    roster: [
      { number: 1, name: "Sample Guard", pos: "G", height: "6-3", weight: 190, class: "JR", hometown: "Orlando, FL", headshot: "https://source.boringavatars.com/beam/120/Sample%20Guard" },
      { number: 2, name: "Sample Wing", pos: "G/F", height: "6-6", weight: 205, class: "SO", hometown: "Tampa, FL", headshot: "https://source.boringavatars.com/beam/120/Sample%20Wing" },
      { number: 15, name: "Sample Big", pos: "F", height: "6-10", weight: 240, class: "SR", hometown: "Jacksonville, FL", headshot: "https://source.boringavatars.com/beam/120/Sample%20Big" }
    ],
    teamStats: { gp: 3, pts: 82.3, reb: 39.7, ast: 16.1, stl: 7.2, blk: 4.1, tov: 11.0, fgPct: 0.465, threePct: 0.354, ftPct: 0.742 },
    playerStats: [
      { name: "Sample Guard", gp: 3, mpg: 29.4, ppg: 17.3, rpg: 3.1, apg: 4.8, spg: 1.3, bpg: 0.2, tpg: 2.1, fgPct: 0.476, threePct: 0.386, ftPct: 0.812 },
      { name: "Sample Wing",  gp: 3, mpg: 27.2, ppg: 13.4, rpg: 5.6, apg: 2.3, spg: 0.9, bpg: 0.3, tpg: 1.8, fgPct: 0.452, threePct: 0.333, ftPct: 0.731 },
      { name: "Sample Big",   gp: 3, mpg: 24.8, ppg: 11.2, rpg: 8.5, apg: 1.1, spg: 0.6, bpg: 1.4, tpg: 1.5, fgPct: 0.58,  threePct: 0.0,   ftPct: 0.69 }
    ]
  },
  "2023-24": {
    roster: [],
    teamStats: {},
    playerStats: []
  }
};

// News (RSS) — prefer official site
// If CORS blocks, you can use rss2json or your proxy. We include a safe fallback list.
const NEWS_SOURCES = [
  // Official site RSS (often available; if blocked by CORS, use your proxy or a feed-to-JSON service)
  // "https://floridagators.com/rss.aspx?path=mbball"
];
const NEWS_FALLBACK = [
  { title: "Welcome to the Gators Hub", link: "#", summary: "Your one-stop Florida Men’s Basketball hub with rosters, stats, news, and fun props.", date: new Date().toISOString() }
];

/** ---------- DOM helpers ---------- **/
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

/** ---------- Tabs ---------- **/
$$('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $$('.panel').forEach(p=>p.classList.remove('active'));
    $('#'+tab).classList.add('active');
  });
});

/** ---------- Season selects ---------- **/
function populateSeasonSelects(){
  const selects = ['currentSeasonSelect','pastSeasonSelect','teamSeasonSelect','playerSeasonSelect','propsSeasonSelect']
    .map(id=>$('#'+id));

  selects.forEach(sel=>{
    sel.innerHTML = "";
    DEFAULT_SEASONS.forEach(season=>{
      const opt = document.createElement('option');
      opt.value = season; opt.textContent = season;
      sel.appendChild(opt);
    });
  });

  // Default to first season
  selects.forEach(sel => sel.value = DEFAULT_SEASONS[0]);
}

/** ---------- Fetchers (CSV / Proxy / Local) ---------- **/
async function fetchSeasonData(season){
  // 1) CSV direct (Google Sheets published as CSV)
  if (DATA_CSV[season]) {
    try {
      const csv = await (await fetch(DATA_CSV[season])).text();
      return parseCsvToData(csv);
    } catch(err) {
      console.warn('CSV fetch failed, falling back to SAMPLE_DATA', err);
    }
  }

  // 2) Proxy endpoints (if configured)
  if (PROXY_BASE) {
    try {
      const [rRoster, rTeam, rPlayers] = await Promise.all([
        fetch(`${PROXY_BASE}/roster?school=${encodeURIComponent(SCHOOL)}&season=${encodeURIComponent(season)}`).then(r=>r.json()),
        fetch(`${PROXY_BASE}/team-stats?school=${encodeURIComponent(SCHOOL)}&season=${encodeURIComponent(season)}`).then(r=>r.json()),
        fetch(`${PROXY_BASE}/player-stats?school=${encodeURIComponent(SCHOOL)}&season=${encodeURIComponent(season)}`).then(r=>r.json())
      ]);
      return { roster: rRoster.roster||[], teamStats: rTeam||{}, playerStats: rPlayers||[] };
    } catch(err) {
      console.warn('Proxy fetch failed, falling back to SAMPLE_DATA', err);
    }
  }

  // 3) Local sample
  return SAMPLE_DATA[season] || { roster: [], teamStats: {}, playerStats: [] };
}

// Tiny CSV parser -> normalize columns like: number,name,pos,height,weight,class,hometown,ppg,rpg,apg,etc.
function parseCsvToData(csvText){
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(',').map(h=>h.trim().toLowerCase());
  const rows = lines.map(line => {
    // naive CSV split (ok for Google Sheets without embedded commas). For robust parsing, swap in PapaParse.
    return line.split(',').map(v=>v.trim());
  });

  const roster = [];
  const playerStats = [];
  for (const cells of rows) {
    const item = {};
    headers.forEach((h,i)=> item[h] = cells[i] ?? "");
    if (item.name) {
      roster.push({
        number: +item.number || item.no || "",
        name: item.name,
        pos: item.pos || item.position || "",
        height: item.height || "",
        weight: +item.weight || "",
        class: item.class || item.year || "",
        hometown: item.hometown || "",
        headshot: item.headshot || ""
      });
      playerStats.push({
        name: item.name,
        gp: +item.gp || 0,
        mpg: +item.mpg || 0,
        ppg: +item.ppg || 0,
        rpg: +item.rpg || 0,
        apg: +item.apg || 0,
        spg: +item.spg || 0,
        bpg: +item.bpg || 0,
        tpg: +item.tpg || 0,
        fgPct: +item.fgpct || 0,
        threePct: +item.threepct || 0,
        ftPct: +item.ftpct || 0,
      });
    }
  }
  // You can compute team aggregates from player stats if team sheet not provided
  const teamStats = aggregateTeam(playerStats);
  return { roster, teamStats, playerStats };
}

/** ---------- Rendering ---------- **/
function renderRoster(list, mount){
  mount.innerHTML = "";
  if (!list.length){
    mount.innerHTML = `<div class="card">No roster data yet for this season.</div>`;
    return;
  }
  list.forEach(p=>{
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <div style="display:flex; gap:12px; align-items:center;">
        <img src="${p.headshot || 'https://source.boringavatars.com/beam/120/'+encodeURIComponent(p.name)}" alt="${p.name}" width="64" height="64" style="border-radius:12px; object-fit:cover;" />
        <div>
          <div><span class="badge">#${p.number || '—'}</span> <strong>${p.name}</strong> <span class="meta">${p.pos || ''}</span></div>
          <div class="meta">${p.height || ''} • ${p.weight?`${p.weight} lbs`:''} • ${p.class || ''}</div>
          <div class="meta">${p.hometown || ''}</div>
        </div>
      </div>
    `;
    mount.appendChild(el);
  });
}

function renderTeamStats(stats, mount){
  if (!stats || Object.keys(stats).length === 0){
    mount.innerHTML = `<div class="card">No team stats yet for this season.</div>`;
    return;
  }
  mount.innerHTML = `
    <table>
      <thead><tr>
        <th>GP</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th>
      </tr></thead>
      <tbody><tr>
        <td>${stats.gp ?? '—'}</td>
        <td class="stat">${fmt(stats.pts)}</td>
        <td>${fmt(stats.reb)}</td>
        <td>${fmt(stats.ast)}</td>
        <td>${fmt(stats.stl)}</td>
        <td>${fmt(stats.blk)}</td>
        <td>${fmt(stats.tov)}</td>
        <td>${pct(stats.fgPct)}</td>
        <td>${pct(stats.threePct)}</td>
        <td>${pct(stats.ftPct)}</td>
      </tr></tbody>
    </table>
  `;
}

function renderPlayerStats(rows, mount, filter=""){
  mount.innerHTML = "";
  if (!rows.length){ mount.innerHTML = `<div class="card">No player stats for this season.</div>`; return; }
  const data = filter ? rows.filter(r => r.name.toLowerCase().includes(filter.toLowerCase())) : rows.slice();
  data.sort((a,b)=> (b.ppg||0)-(a.ppg||0));

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Player</th><th>GP</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(p=>`
        <tr>
          <td><strong>${p.name}</strong></td>
          <td>${p.gp ?? '—'}</td>
          <td>${fmt(p.mpg)}</td>
          <td class="stat">${fmt(p.ppg)}</td>
          <td>${fmt(p.rpg)}</td>
          <td>${fmt(p.apg)}</td>
          <td>${fmt(p.spg)}</td>
          <td>${fmt(p.bpg)}</td>
          <td>${fmt(p.tpg)}</td>
          <td>${pct(p.fgPct)}</td>
          <td>${pct(p.threePct)}</td>
          <td>${pct(p.ftPct)}</td>
        </tr>`).join('')}
    </tbody>
  `;
  mount.appendChild(table);
}

function renderNews(items, mount){
  mount.innerHTML = "";
  items.forEach(n=>{
    const el = document.createElement('article');
    el.className = "news-card";
    el.innerHTML = `
      <h4><a href="${n.link}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a></h4>
      <p>${escapeHtml(n.summary || "")}</p>
      <p class="meta">${new Date(n.date).toLocaleString()}</p>
    `;
    mount.appendChild(el);
  });
}

function renderProps(rows, mount){
  if (!rows.length){ mount.innerHTML = `<div class="card">No player stats available to compute props.</div>`; return; }
  // Lines derived from per-game averages (rounded to half points). Add slight jitter factor.
  const lines = rows.map(p=>{
    const linePts = roundHalf(p.ppg || 0);
    const lineReb = roundHalf(p.rpg || 0);
    const lineAst = roundHalf(p.apg || 0);
    return {
      player: p.name,
      pts: linePts,
      reb: lineReb,
      ast: lineAst,
      pra: roundHalf((p.ppg||0)+(p.rpg||0)+(p.apg||0))
    };
  });
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr><th>Player</th><th>PTS O/U</th><th>REB O/U</th><th>AST O/U</th><th>P+R+A O/U</th></tr>
    </thead>
    <tbody>
      ${lines.map(x=>`
        <tr>
          <td><strong>${x.player}</strong></td>
          <td>${x.pts}</td>
          <td>${x.reb}</td>
          <td>${x.ast}</td>
          <td class="stat">${x.pra}</td>
        </tr>`).join('')}
    </tbody>
  `;
  mount.innerHTML = "";
  mount.appendChild(table);
}

/** ---------- Aggregations & utils ---------- **/
function aggregateTeam(players){
  if (!players.length) return {};
  const sum = (k)=> players.reduce((a,c)=> a + (+c[k]||0), 0);
  const gpAvg = Math.max(...players.map(p=> +p.gp || 0)) || 0;
  return {
    gp: gpAvg,
    pts: round(sum('ppg')),
    reb: round(sum('rpg')),
    ast: round(sum('apg')),
    stl: round(sum('spg')),
    blk: round(sum('bpg')),
    tov: round(sum('tpg')),
    fgPct: avg(players.map(p=> +p.fgPct || 0)),
    threePct: avg(players.map(p=> +p.threePct || 0)),
    ftPct: avg(players.map(p=> +p.ftPct || 0)),
  };
}

function fmt(n){ return (n===0 || n) ? Number(n).toFixed(1) : '—'; }
function pct(p){ return (p===0 || p) ? (p>1? (p/100).toFixed(3) : p.toFixed(3)) : '—'; }
function round(n){ return Math.round(n*10)/10; }
function roundHalf(n){ return Math.round(n*2)/2; }
function avg(arr){ return arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

/** ---------- News fetch ---------- **/
async function fetchNews(){
  // If RSS list is empty or blocked by CORS, use fallback card
  if (!NEWS_SOURCES.length){
    return NEWS_FALLBACK;
  }
  try{
    // You can add your proxy here, e.g., `${PROXY_BASE}/rss?url=...`
    const all = [];
    for (const url of NEWS_SOURCES){
      const res = await fetch(url);
      const text = await res.text();
      const parsed = parseBasicRSS(text);
      all.push(...parsed);
    }
    // de-dupe + sort desc
    const uniq = Object.values(all.reduce((acc,cur)=>{
      acc[cur.link] = cur; return acc;
    },{}));
    uniq.sort((a,b)=> new Date(b.date) - new Date(a.date));
    return uniq.slice(0,24);
  }catch(e){
    console.warn('News fetch failed, using fallback', e);
    return NEWS_FALLBACK;
  }
}

// super-naive RSS parser for simple feeds
function parseBasicRSS(xml){
  const items = [];
  const itemRe = /<item[\s\S]*?<\/item>/gi;
  const titleRe = /<title>([\s\S]*?)<\/title>/i;
  const linkRe = /<link>([\s\S]*?)<\/link>/i;
  const descRe = /<description>([\s\S]*?)<\/description>/i;
  const dateRe = /<pubDate>([\s\S]*?)<\/pubDate>/i;
  const blocks = (xml.match(itemRe) || []);
  for (const b of blocks){
    const title = (b.match(titleRe)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g,'').trim();
    const link = (b.match(linkRe)?.[1] || "").trim();
    const summary = (b.match(descRe)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]*>/g,'').trim();
    const date = new Date(b.match(dateRe)?.[1] || Date.now()).toISOString();
    if (title && link) items.push({ title, link, summary, date });
  }
  return items;
}

/** ---------- Page init & event hooks ---------- **/
const state = {
  seasonData: {}, // cache by season
};

async function loadSeason(season){
  if (!state.seasonData[season]){
    state.seasonData[season] = await fetchSeasonData(season);
  }
  const { roster, teamStats, playerStats } = state.seasonData[season];

  renderRoster(roster, $('#rosterGrid'));
  renderRoster(roster, $('#pastRosterGrid')); // re-used when you pick a past season
  renderTeamStats(teamStats, $('#teamStats'));
  renderPlayerStats(playerStats, $('#playerStats'));
  renderProps(playerStats, $('#propsTable'));
}

async function init(){
  populateSeasonSelects();
  await loadSeason($('#currentSeasonSelect').value);

  // News initial
  const items = await fetchNews();
  renderNews(items, $('#newsList'));

  // Handlers
  $('#refreshRoster').addEventListener('click', async ()=>{
    const season = $('#currentSeasonSelect').value;
    state.seasonData[season] = await fetchSeasonData(season); // force refresh
    renderRoster(state.seasonData[season].roster, $('#rosterGrid'));
  });

  $('#loadPastRoster').addEventListener('click', async ()=>{
    const season = $('#pastSeasonSelect').value;
    const d = await fetchSeasonData(season);
    renderRoster(d.roster, $('#pastRosterGrid'));
  });

  $('#refreshTeamStats').addEventListener('click', async ()=>{
    const season = $('#teamSeasonSelect').value;
    const d = await fetchSeasonData(season);
    renderTeamStats(d.teamStats, $('#teamStats'));
  });

  $('#refreshPlayerStats').addEventListener('click', async ()=>{
    const season = $('#playerSeasonSelect').value;
    const d = await fetchSeasonData(season);
    const q = $('#playerSearch').value.trim();
    renderPlayerStats(d.playerStats, $('#playerStats'), q);
  });

  $('#playerSearch').addEventListener('input', ()=>{
    const season = $('#playerSeasonSelect').value;
    const d = state.seasonData[season] || { playerStats: [] };
    renderPlayerStats(d.playerStats, $('#playerStats'), $('#playerSearch').value.trim());
  });

  $('#recalcProps').addEventListener('click', ()=>{
    const season = $('#propsSeasonSelect').value;
    const d = state.seasonData[season] || { playerStats: [] };
    renderProps(d.playerStats, $('#propsTable'));
  });

  // Auto-refresh stats & news
  setInterval(async ()=>{
    const season = $('#currentSeasonSelect').value;
    state.seasonData[season] = await fetchSeasonData(season);
    const d = state.seasonData[season];
    renderTeamStats(d.teamStats, $('#teamStats'));
    renderPlayerStats(d.playerStats, $('#playerStats'), $('#playerSearch').value.trim());
    renderProps(d.playerStats, $('#propsTable'));
    const items = await fetchNews();
    renderNews(items, $('#newsList'));
  }, REFRESH_MS);
}

document.addEventListener('DOMContentLoaded', init);
