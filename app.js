/* ======================================================
   Florida Gators MBB Hub — Enhanced, beginner-friendly
   - Pulls JSON hosted in your repo (no Excel, no server)
   - Clean UI + Dark mode + Sortable tables + Filters
   - Props: bankroll, slip, grade, leaderboard import/export
   - Add-to-calendar (.ics) per game
   ====================================================== */

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

/* ---------- Your JSON endpoints (raw URLs) ----------
   After you create the 4 JSON files, click each file in GitHub
   → "Raw" → copy URL, then paste below.
   Example (yours will be similar):
   https://raw.githubusercontent.com/Robbiek7455/gators-basketball-hub/main/roster.json
*/
const DATA_URLS = {
  roster:  "https://raw.githubusercontent.com/Robbiek7455/gators-basketball-hub/main/roster.json",
  schedule:"https://raw.githubusercontent.com/Robbiek7455/gators-basketball-hub/main/schedule.json",
  team:    "https://raw.githubusercontent.com/Robbiek7455/gators-basketball-hub/main/team.json",
  players: "https://raw.githubusercontent.com/Robbiek7455/gators-basketball-hub/main/players.json"
};

/* ---------- Photos (linked to source pages) ---------- */
const PHOTOS = [
  { src:"https://floridagators.com/images/2025/3/16/MBB_SEC_Champ_Trophy.jpg", alt:"SEC Tournament champions 2025", href:"https://floridagators.com/galleries" },
  { src:"https://floridagators.com/images/2025/4/7/MBB_NCAA_Title_Celebration.jpg", alt:"NCAA Championship celebration 2025", href:"https://floridagators.com/galleries" },
  { src:"https://floridagators.com/images/2025/11/7/UF_MBB_Team_2025.jpg", alt:"2025–26 team", href:"https://floridagators.com/galleries" }
];

/* ---------- Helpers ---------- */
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const escapeHtml = (s)=> (s||"").replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const fmt = (n)=> (n===0 || n) ? Number(n).toFixed(1) : '—';
const pct = (p)=> (p===0 || p) ? (p>1 ? (p/100).toFixed(3) : Number(p).toFixed(3)) : '—';
const roundHalf = (n)=> Math.round(n*2)/2;
const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
const sortBy = (arr, key, dir=1)=> arr.slice().sort((a,b)=>{
  const av = (a[key] ?? "").toString().toLowerCase();
  const bv = (b[key] ?? "").toString().toLowerCase();
  return av>bv? dir: av<bv? -dir : 0;
});

/* ---------- Theme ---------- */
function applyTheme(){
  const saved = localStorage.getItem('ghub_theme') || 'light';
  document.documentElement.classList.toggle('dark', saved==='dark');
  $('#themeToggle').textContent = saved==='dark' ? '☀️' : '🌙';
}
$('#themeToggle')?.addEventListener('click', ()=>{
  const now = (localStorage.getItem('ghub_theme')||'light')==='light'?'dark':'light';
  localStorage.setItem('ghub_theme', now);
  applyTheme();
});
applyTheme();

/* ---------- Fetch JSON (with cache-busting) ---------- */
async function getJSON(url){
  const res = await fetch(url + `?t=${Date.now()}`);
  if(!res.ok) throw new Error('Fetch failed: '+url);
  return await res.json();
}

/* ---------- Roster ---------- */
let ROSTER = [];
async function loadRoster(){
  ROSTER = await getJSON(DATA_URLS.roster);
  renderRoster();
}
function renderRoster(){
  const q = $('#rosterFilter').value?.toLowerCase() || "";
  const list = q ? ROSTER.filter(p => (p.name+p.pos+(p.hometown||"")).toLowerCase().includes(q)) : ROSTER;
  const grid = $('#rosterGrid');
  grid.innerHTML = "";
  list.forEach(p=>{
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;">
        <img src="https://source.boringavatars.com/beam/96/${encodeURIComponent(p.name)}"
             alt="${escapeHtml(p.name)}" width="64" height="64" style="border-radius:12px;object-fit:cover" />
        <div>
          <div><span class="badge">#${p.no}</span> <strong>${escapeHtml(p.name)}</strong> <span class="meta">${p.pos}</span></div>
          <div class="meta">${p.ht} • ${p.wt} lbs • ${p.cls}</div>
          <div class="meta">${p.hometown||""} ${p.prev?(" • Prev: "+p.prev):""}</div>
        </div>
        <button class="btn ghost" style="margin-left:auto" aria-label="Favorite" data-fav="${escapeHtml(p.name)}">⭐</button>
      </div>`;
    grid.appendChild(el);
  });
  $$('#rosterGrid [data-fav]').forEach(b=> b.addEventListener('click', ()=>{
    const name = b.dataset.fav; toggleFavorite(name); renderRoster();
  }));
}
function getFavs(){ try{ return JSON.parse(localStorage.getItem('ghub_favs'))||[] }catch{ return [] } }
function toggleFavorite(name){
  const favs = getFavs();
  const i = favs.indexOf(name);
  if(i>=0) favs.splice(i,1); else favs.push(name);
  localStorage.setItem('ghub_favs', JSON.stringify(favs));
}

/* ---------- Schedule ---------- */
let SCHEDULE = [];
async function loadSchedule(){
  SCHEDULE = await getJSON(DATA_URLS.schedule);
  renderSchedule();
}
function renderSchedule(){
  const filter = $('#schedFilter').value || 'ALL';
  const rows = SCHEDULE.filter(g=> filter==='ALL' ? true : g.at===filter);
  const mount = $('#scheduleWrap');
  mount.innerHTML = `
    <table id="scheduleTable">
      <thead><tr>
        <th data-key="date">Date</th><th data-key="time">Time (ET)</th><th data-key="opponent">Opp.</th><th data-key="at">H/A/N</th><th data-key="location">Location / Event</th><th data-key="result">Result</th><th>Add</th>
      </tr></thead>
      <tbody>
        ${rows.map(g=>`
          <tr>
            <td>${g.date} (${g.day})</td>
            <td>${g.time}</td>
            <td><strong>${escapeHtml(g.opponent)}</strong></td>
            <td>${g.at}</td>
            <td>${escapeHtml(g.location)}</td>
            <td>${escapeHtml(g.result||"")}</td>
            <td><button class="btn ghost addCal" data-game='${escapeHtml(JSON.stringify(g))}'>.ics</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  // sort handlers
  $$('#scheduleTable th[data-key]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.key;
      SCHEDULE = sortBy(SCHEDULE, key, 1);
      renderSchedule();
    });
  });
  // calendar downloads
  $$('.addCal').forEach(b=> b.addEventListener('click', ()=>{
    const g = JSON.parse(b.dataset.game);
    downloadICS(g);
  }));
}
function downloadICS(g){
  // naive ICS generator (no TZ conversion; ET as plain)
  const dt = new Date(`${g.date} ${g.time} ET`);
  const end = new Date(dt.getTime() + 2*60*60*1000);
  const pad = (n)=> String(n).padStart(2,'0');
  const toICS = (d)=> d.getUTCFullYear()+
    pad(d.getUTCMonth()+1)+pad(d.getUTCDate())+'T'+
    pad(d.getUTCHours())+pad(d.getUTCMinutes())+pad(d.getUTCSeconds())+'Z';
  const ics = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Gators Hub//EN","BEGIN:VEVENT",
    `UID:${Date.now()}@gatorshub`,
    `DTSTAMP:${toICS(new Date())}`,
    `DTSTART:${toICS(dt)}`,
    `DTEND:${toICS(end)}`,
    `SUMMARY:Florida vs ${g.opponent}`,
    `LOCATION:${g.location}`,
    "END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
  const blob = new Blob([ics], {type:"text/calendar"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `UF_vs_${g.opponent.replace(/\s+/g,'_')}.ics`; a.click();
}

/* ---------- Stats ---------- */
let TEAM = {}, PLAYERS = [];
async function loadStats(){
  [TEAM, PLAYERS] = await Promise.all([ getJSON(DATA_URLS.team), getJSON(DATA_URLS.players) ]);
  renderTeamStats();
  renderPlayerStats();
}
function renderTeamStats(){
  $('#teamStats').innerHTML = `
    <table><thead><tr>
      <th>GP</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th>
    </tr></thead><tbody><tr>
      <td>${TEAM.gp ?? '—'}</td>
      <td class="stat">${fmt(TEAM.pts)}</td>
      <td>${fmt(TEAM.reb)}</td>
      <td>${fmt(TEAM.ast)}</td>
      <td>${fmt(TEAM.stl)}</td>
      <td>${fmt(TEAM.blk)}</td>
      <td>${fmt(TEAM.tov)}</td>
      <td>${pct(TEAM.fgPct)}</td>
      <td>${pct(TEAM.threePct)}</td>
      <td>${pct(TEAM.ftPct)}</td>
    </tr></tbody></table>`;
}
function renderPlayerStats(){
  const mount = $('#playerStats');
  const q = $('#playerFilter').value?.toLowerCase() || "";
  let rows = PLAYERS.slice();
  if(q) rows = rows.filter(p=> p.name.toLowerCase().includes(q));
  rows.sort((a,b)=> (b.ppg||0)-(a.ppg||0));
  mount.innerHTML = `
    <table id="playersTable">
      <thead><tr>
        <th data-key="name">Player</th><th data-key="gp">GP</th><th data-key="mpg">MPG</th><th data-key="ppg">PPG</th><th data-key="rpg">RPG</th><th data-key="apg">APG</th><th data-key="spg">SPG</th><th data-key="bpg">BPG</th><th data-key="tpg">TOV</th><th data-key="fgPct">FG%</th><th data-key="threePct">3P%</th><th data-key="ftPct">FT%</th>
      </tr></thead><tbody>
      ${rows.map(p=>`
        <tr>
          <td><strong>${escapeHtml(p.name)}</strong></td>
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
    </tbody></table>`;
  // sortable
  $$('#playersTable th[data-key]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.key;
      const dir = th.dataset.dir==='desc' ? 1 : -1;
      th.dataset.dir = dir===1?'asc':'desc';
      PLAYERS = PLAYERS.slice().sort((a,b)=>{
        const av = a[key] ?? ""; const bv = b[key] ?? "";
        return av>bv? dir: av<bv? -dir : 0;
      });
      renderPlayerStats();
    });
  });
}
$('#playerFilter').addEventListener('input', renderPlayerStats);
$('#exportPlayersCsv').addEventListener('click', ()=>{
  const headers = ["name","gp","mpg","ppg","rpg","apg","spg","bpg","tpg","fgPct","threePct","ftPct"];
  const csv = [headers.join(",")].concat(
    PLAYERS.map(p=> headers.map(h=> p[h] ?? "").join(","))
  ).join("\n");
  const blob = new Blob([csv], {type:"text/csv"});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download="players.csv"; a.click();
});

/* ---------- Props (Mock betting) ---------- */
const LS = {
  bankroll: "ghub_bankroll",
  username: "ghub_username",
  openBets: "ghub_openBets",
  history: "ghub_betHistory",
  board: "ghub_leaderboard"
};
const getLS = (k,d)=> { try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch{ return d } };
const setLS = (k,v)=> localStorage.setItem(k, JSON.stringify(v));

function decimalFromAmerican(odds){ const o=Number(odds); return o<0 ? (100/-o)+1 : (o/100)+1; }
function defaultLines(){
  return (PLAYERS.length?PLAYERS:[]).map(p=>({
    player: p.name,
    pts: roundHalf(p.ppg||0),
    reb: roundHalf(p.rpg||0),
    ast: roundHalf(p.apg||0),
    pra: roundHalf((p.ppg||0)+(p.rpg||0)+(p.apg||0))
  }));
}
function bankrollUI(){
  $('#bankroll').textContent = `$${Number(getLS(LS.bankroll,0)).toLocaleString()}`;
  $('#usernameInput').value = getLS(LS.username,"") || "";
}
function upsertLeaderboard(user, bankroll){
  const board = getLS(LS.board, []);
  const i = board.findIndex(b=>b.user===user);
  if(i>=0) board[i].bankroll = bankroll; else board.push({ user, bankroll, updated: Date.now() });
  setLS(LS.board, board);
}
function renderLeaderboard(){
  const board = getLS(LS.board, []).sort((a,b)=> b.bankroll - a.bankroll);
  $('#leaderboard').innerHTML = `
    <table><thead><tr><th>#</th><th>User</th><th>Bankroll</th><th>Updated</th></tr></thead>
    <tbody>${board.map((b,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(b.user)}</td><td>$${Number(b.bankroll).toLocaleString()}</td><td>${new Date(b.updated||Date.now()).toLocaleString()}</td></tr>`).join('')}</tbody>
    </table>`;
}

function renderPropsTable(){
  const lines = defaultLines();
  const mount = $('#propsTable');
  mount.innerHTML = `
    <table><thead><tr>
      <th>Player</th><th>PTS</th><th>REB</th><th>AST</th><th>P+R+A</th><th>Pick</th><th>Add</th>
    </tr></thead><tbody>
    ${lines.map(l=>`
      <tr>
        <td><strong>${escapeHtml(l.player)}</strong></td>
        <td>${l.pts}</td><td>${l.reb}</td><td>${l.ast}</td><td>${l.pra}</td>
        <td>
          <select data-player="${escapeHtml(l.player)}" class="pick">
            <option value="PTS_O">PTS Over</option><option value="PTS_U">PTS Under</option>
            <option value="REB_O">REB Over</option><option value="REB_U">REB Under</option>
            <option value="AST_O">AST Over</option><option value="AST_U">AST Under</option>
            <option value="PRA_O">PRA Over</option><option value="PRA_U">PRA Under</option>
          </select>
        </td>
        <td><button class="btn addBet" data-player="${escapeHtml(l.player)}">Add</button></td>
      </tr>`).join('')}
    </tbody></table>`;
  $$('.addBet').forEach(b=> b.addEventListener('click', ()=>{
    const player = b.dataset.player;
    const sel = b.closest('tr').querySelector('.pick').value;
    const slip = getLS(LS.openBets, []);
    slip.push({ player, market: sel, odds: -110 });
    setLS(LS.openBets, slip);
    renderBetSlip();
  }));
}
function renderBetSlip(){
  const slip = getLS(LS.openBets, []);
  const mount = $('#betList');
  if(!slip.length){ mount.innerHTML = `<p class="muted tiny">No selections yet.</p>`; return; }
  mount.innerHTML = slip.map((b,i)=> `<div class="card"><div><strong>${escapeHtml(b.player)}</strong> — ${b.market.replace('_',' ')} <span class="badge">@${b.odds}</span></div><div class="meta">Slip item #${i+1}</div></div>`).join('');
}
function handleBankroll(){
  const user = $('#usernameInput').value.trim() || "Guest";
  setLS(LS.username, user);
  setLS(LS.bankroll, 1000);
  upsertLeaderboard(user, 1000);
  bankrollUI(); renderLeaderboard();
}
function resetBankroll(){
  setLS(LS.bankroll, 0); bankrollUI();
}
function placeBets(){
  const wager = Math.max(1, Number($('#wagerInput').value||0));
  const bank = getLS(LS.bankroll, 0);
  const slip = getLS(LS.openBets, []);
  if(!slip.length) return alert("Add picks first.");
  if(bank < wager) return alert("Not enough bankroll.");
  const hist = getLS(LS.history, []);
  hist.push({ placedAt: Date.now(), wager, bets: slip, status:"pending" });
  setLS(LS.history, hist);
  setLS(LS.openBets, []);
  setLS(LS.bankroll, bank - wager);
  renderBetSlip(); bankrollUI(); renderLeaderboard();
  alert("Bets placed!");
}
function gradeBets(){
  const hist = getLS(LS.history, []);
  const pending = hist.filter(h=>h.status==="pending");
  if(!pending.length) return alert("No pending bets.");
  let delta = 0;
  const map = Object.fromEntries(PLAYERS.map(p=>[p.name,p]));
  pending.forEach(ticket=>{
    let wins = 0, legs = ticket.bets.length;
    ticket.bets.forEach(b=>{
      const p = map[b.player]; if(!p) return;
      const variance = (Math.random()*6 - 3);
      const pts = (p.ppg||0)+variance;
      const reb = (p.rpg||0)+(Math.random()*4-2);
      const ast = (p.apg||0)+(Math.random()*3-1.5);
      const pra = pts+reb+ast;
      const [market, side] = b.market.split('_');
      const line = market==="PTS"? roundHalf(p.ppg||0)
                 : market==="REB"? roundHalf(p.rpg||0)
                 : market==="AST"? roundHalf(p.apg||0)
                 : roundHalf((p.ppg||0)+(p.rpg||0)+(p.apg||0));
      const wentOver = (market==="PTS"? pts : market==="REB"? reb : market==="AST"? ast : pra) > line;
      const win = (side==="O" && wentOver) || (side==="U" && !wentOver);
      b.result = win ? "WIN" : "LOSS";
      if(win) wins++;
    });
    const allWin = wins===legs;
    const odds = -110, dec = decimalFromAmerican(odds);
    const payout = allWin ? ticket.wager * Math.pow(dec, legs) : 0;
    ticket.status="graded"; ticket.payout=Math.round(payout);
    delta += ticket.payout;
  });
  const bank = getLS(LS.bankroll,0);
  const user = getLS(LS.username,"Guest");
  setLS(LS.bankroll, bank + delta);
  setLS(LS.history, hist);
  upsertLeaderboard(user, getLS(LS.bankroll,0));
  bankrollUI(); renderLeaderboard();
  alert(`Graded! Net payout: $${delta}`);
}
function exportLeaderboard(){
  const board = getLS(LS.board, []);
  const blob = new Blob([JSON.stringify(board,null,2)], {type:"application/json"});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download="leaderboard.json"; a.click();
}
$('#importLeaderboard').addEventListener('change', async (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  const text = await f.text();
  setLS(LS.board, JSON.parse(text)); renderLeaderboard();
});

/* ---------- News (simple fallback card) ---------- */
async function loadNews(){
  const items = [{ title:"Welcome to the Gators Hub", link:"#", summary:"Roster, schedule, stats, news, and for-fun props.", date:new Date().toISOString() }];
  $('#newsList').innerHTML = items.map(n=>`
    <article class="news-card">
      <h4><a href="${n.link}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a></h4>
      <p>${escapeHtml(n.summary||"")}</p>
      <p class="meta">${new Date(n.date).toLocaleString()}</p>
    </article>`).join('');
}

/* ---------- Photos ---------- */
function loadPhotos(){
  const g = $('#photoGrid');
  g.innerHTML = PHOTOS.map(p=>`
    <a class="card" href="${p.href}" target="_blank" rel="noopener">
      <img src="${p.src}" alt="${escapeHtml(p.alt)}" />
      <div class="meta">${escapeHtml(p.alt)}</div>
    </a>`).join('');
}

/* ---------- Wire & Init ---------- */
function wire(){
  $('#rosterFilter').addEventListener('input', renderRoster);
  $('#schedFilter').addEventListener('change', renderSchedule);
  $('#refreshRoster').addEventListener('click', loadRoster);
  $('#refreshSchedule').addEventListener('click', loadSchedule);
  $('#refreshStats').addEventListener('click', loadStats);
  $('#exportPlayersCsv').addEventListener('click', ()=>{}); // handler defined above

  $('#usernameInput').addEventListener('blur', ()=>{
    const u = $('#usernameInput').value.trim(); if(u) localStorage.setItem(LS.username, JSON.stringify(u));
  });
  $('#startBankroll').addEventListener('click', handleBankroll);
  $('#resetBankroll').addEventListener('click', resetBankroll);
  $('#placeBets').addEventListener('click', placeBets);
  $('#clearBets').addEventListener('click', ()=>{ setLS(LS.openBets,[]); renderBetSlip(); });
  $('#gradeBets').addEventListener('click', gradeBets);
  $('#exportLeaderboard').addEventListener('click', exportLeaderboard);
}
async function init(){
  wire();
  loadPhotos(); loadNews();
  await Promise.all([ loadRoster(), loadSchedule(), loadStats() ]);
  // props depends on PLAYERS
  renderPropsTable(); renderBetSlip();
  // keep stats fresh if you update players.json/team.json
  setInterval(loadStats, REFRESH_MS);
  // initial UI
  bankrollUI(); renderLeaderboard();
}
document.addEventListener('DOMContentLoaded', init);
