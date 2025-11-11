/* ======================================================
   Florida Gators MBB Hub — Feature boost
   - Safe tabs (fixes non-clickable tabs)
   - Box score links (icon)
   - Opponent scouting cards (modal)
   - Shareable props slips (URL fragment)
   ====================================================== */

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

/* ---- Raw GitHub URLs (adjust if your repo name differs) ---- */
const ROOT = "https://raw.githubusercontent.com/Robbiek7455/gators-basketball-hub/main";
const DATA_URLS = {
  roster:    `${ROOT}/roster.json`,
  schedule:  `${ROOT}/schedule.json`,
  team:      `${ROOT}/team.json`,
  players:   `${ROOT}/players.json`,
  opponents: `${ROOT}/opponents.json`,        // logos/colors (optional)
  standings: `${ROOT}/standings.json`,        // optional
  scout:     `${ROOT}/opponents_scout.json`   // NEW: scouting notes per opponent
};

/* ---- News feed via AllOrigins (fallback handled) ---- */
const NEWS_FEEDS = [
  "https://api.allorigins.win/raw?url=" + encodeURIComponent("https://floridagators.com/rss.aspx?path=mbball")
];

/* ---- Helpers ---- */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const escapeHtml = (s)=> (s||"").replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const fmt  = (n)=> (n===0 || n) ? Number(n).toFixed(1) : '—';
const pct  = (p)=> (p===0 || p) ? (p>1 ? (p/100).toFixed(3) : Number(p).toFixed(3)) : '—';
const pad2 = (n)=> String(n).padStart(2,'0');
const roundHalf = (n)=> Math.round(n*2)/2;

/* ---- Theme ---- */
function applyTheme(){
  const saved = localStorage.getItem('ghub_theme') || 'light';
  document.documentElement.classList.toggle('dark', saved==='dark');
  const tgl = $('#themeToggle'); if (tgl) tgl.textContent = saved==='dark' ? '☀️' : '🌙';
}
$('#themeToggle')?.addEventListener('click', ()=>{
  const now = (localStorage.getItem('ghub_theme')||'light')==='light'?'dark':'light';
  localStorage.setItem('ghub_theme', now); applyTheme();
});
applyTheme();

/* ---- Fetch JSON (cache-busted) ---- */
async function getJSON(url){
  const r = await fetch(url + `?t=${Date.now()}`);
  if(!r.ok) throw new Error("Failed " + url);
  return await r.json();
}

/* ---- Global state ---- */
let ROSTER=[], SCHEDULE=[], TEAM={}, PLAYERS=[], OPPONENTS=[], STANDINGS=[], SCOUT={};

/* ---- Favorites ---- */
function getFavs(){ try{ return JSON.parse(localStorage.getItem('ghub_favs'))||[] }catch{ return [] } }
function setFavs(v){ localStorage.setItem('ghub_favs', JSON.stringify(v)); }
function toggleFavorite(name){
  const favs = getFavs();
  const i = favs.indexOf(name);
  if(i>=0) favs.splice(i,1); else favs.push(name);
  setFavs(favs);
}

/* ---- Tabs (SAFE) ---- */
function wireTabs(){
  $$('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const tabId = btn.dataset.tab;
      if(!tabId) return; // ignore theme button or any non-tab
      $$('.tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      $$('.panel').forEach(p=>p.classList.remove('active'));
      const panel = $('#'+tabId);
      if(panel) panel.classList.add('active');
    });
  });
}

/* ---- Roster ---- */
async function loadRoster(){
  ROSTER = await getJSON(DATA_URLS.roster);
  renderRoster();
}
function renderRoster(){
  const q = ($('#rosterFilter')?.value||"").toLowerCase();
  const favOnly = $('#favOnly')?.checked;
  const favs = getFavs();
  let list = ROSTER.slice();
  if(q) list = list.filter(p=> (p.name+p.pos+(p.hometown||"")).toLowerCase().includes(q));
  if(favOnly) list = list.filter(p=> favs.includes(p.name));

  const grid = $('#rosterGrid'); if(!grid) return;
  grid.innerHTML = "";
  list.forEach(p=>{
    const starred = favs.includes(p.name);
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
        <button class="btn ghost" style="margin-left:auto" aria-label="Favorite" data-fav="${escapeHtml(p.name)}">${starred?'⭐':'☆'}</button>
      </div>`;
    grid.appendChild(el);
  });
  $$('#rosterGrid [data-fav]').forEach(b=> b.addEventListener('click', ()=>{
    toggleFavorite(b.dataset.fav); renderRoster();
  }));
}
$('#rosterFilter')?.addEventListener('input', renderRoster);
$('#favOnly')?.addEventListener('change', renderRoster);
$('#refreshRoster')?.addEventListener('click', loadRoster);

/* ---- Opponents map ---- */
const oppByName = ()=> Object.fromEntries((OPPONENTS||[]).map(o=>[o.name,o]));

/* ---- Schedule + Box links + Scouting modal ---- */
async function loadSchedule(){
  const promises = [ getJSON(DATA_URLS.schedule) ];
  // optional files won’t break if missing
  promises.push(getJSON(DATA_URLS.opponents).catch(()=>[]));
  promises.push(getJSON(DATA_URLS.scout).catch(()=>({})));

  const [sch, opp, scout] = await Promise.all(promises);
  SCHEDULE = sch; OPPONENTS = opp; SCOUT = scout;
  renderSchedule(); renderCountdown();
}

function renderSchedule(){
  const filter = $('#schedFilter')?.value || 'ALL';
  const M = oppByName();
  const rows = SCHEDULE.filter(g=> filter==='ALL' ? true : g.at===filter);
  const mount = $('#scheduleWrap'); if(!mount) return;

  mount.innerHTML = `
    <table id="scheduleTable">
      <thead><tr>
        <th>Date</th><th>Time (ET)</th><th>Opponent</th><th>H/A/N</th><th>Location / Event</th><th>Result</th><th>Box</th><th>Add</th>
      </tr></thead>
      <tbody>
        ${rows.map(g=>{
          const o = M[g.opponent] || {};
          const box = g.box ? `<a class="boxlink" href="${g.box}" target="_blank" rel="noopener" title="Box score">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 3v2h3.59L7 15.59 8.41 17 19 6.41V10h2V3z"/><path d="M5 19h14v2H5z"/></svg>
          </a>` : "";
          return `<tr>
            <td>${g.date} (${g.day})</td>
            <td>${g.time}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                ${o.logo? `<img src="${o.logo}" alt="" width="20" height="20" style="border-radius:4px">` : ""}
                <span class="opplink" data-opp="${escapeHtml(g.opponent)}"><strong>${escapeHtml(g.opponent)}</strong></span>
              </div>
            </td>
            <td>${g.at}</td>
            <td>${escapeHtml(g.location)}</td>
            <td>${escapeHtml(g.result||"")}</td>
            <td>${box}</td>
            <td><button class="btn ghost addCal" data-game='${escapeHtml(JSON.stringify(g))}'>.ics</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  // calendar
  $$('.addCal').forEach(b=> b.addEventListener('click', ()=>{
    const g = JSON.parse(b.dataset.game); downloadICS(g);
  }));
  // scouting
  $$('.opplink').forEach(el => el.addEventListener('click', ()=>{
    const name = el.dataset.opp;
    openScout(name);
  }));
}
$('#schedFilter')?.addEventListener('change', renderSchedule);
$('#refreshSchedule')?.addEventListener('click', loadSchedule);

function openScout(name){
  const data = SCOUT[name];
  const modal = $('#scoutModal'), content = $('#scoutContent');
  if(!modal || !content){ return; }
  if(!data){
    content.innerHTML = `<h3>${escapeHtml(name)}</h3><p class="muted">No scouting notes yet.</p>`;
  } else {
    content.innerHTML = `
      <h3 style="margin-top:0">${escapeHtml(name)} — Scouting</h3>
      <p><strong>Style:</strong> ${escapeHtml(data.style || "—")}</p>
      <h4>Players to watch</h4>
      <ul>${(data.players||[]).map(p=>`<li><strong>${escapeHtml(p.name)}</strong>: ${escapeHtml(p.note||"")}</li>`).join('')}</ul>
      <h4>Keys</h4>
      <ul>${(data.keys||[]).map(k=>`<li>${escapeHtml(k)}</li>`).join('')}</ul>
    `;
  }
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
}
$('#closeScout')?.addEventListener('click', ()=>{
  const modal = $('#scoutModal'); if(!modal) return;
  modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true');
});
$('#scoutModal')?.addEventListener('click', (e)=>{
  if(e.target.classList.contains('modal-bg')){
    $('#closeScout').click();
  }
});

function downloadICS(g){
  const dt = new Date(`${g.date} ${g.time} ET`);
  const end = new Date(dt.getTime() + 2*60*60*1000);
  const toICS = (d)=> d.getUTCFullYear()+pad2(d.getUTCMonth()+1)+pad2(d.getUTCDate())+'T'+pad2(d.getUTCHours())+pad2(d.getUTCMinutes())+pad2(d.getUTCSeconds())+'Z';
  const ics = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Gators Hub//EN","BEGIN:VEVENT",
    `UID:${Date.now()}@gatorshub`,`DTSTAMP:${toICS(new Date())}`,
    `DTSTART:${toICS(dt)}`,`DTEND:${toICS(end)}`,
    `SUMMARY:Florida vs ${g.opponent}`,`LOCATION:${g.location}`,
    "END:VEVENT","END:VCALENDAR"].join("\r\n");
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics],{type:"text/calendar"}));
  a.download = `UF_vs_${g.opponent.replace(/\s+/g,'_')}.ics`; a.click();
}

/* ---- Next Game Countdown ---- */
function renderCountdown(){
  const el = $('#nextGame'); if(!el || !SCHEDULE.length) return;
  const upcoming = SCHEDULE.map(g=> ({...g, t: Date.parse(`${g.date} ${g.time} ET`) }))
                           .filter(g=> !isNaN(g.t) && g.t > Date.now())
                           .sort((a,b)=>a.t-b.t)[0];
  if(!upcoming){ el.textContent = "Next game: TBA"; return; }
  function tick(){
    const diff = upcoming.t - Date.now();
    if(diff<=0){ el.textContent = `Gameday: vs ${upcoming.opponent}!`; return; }
    const h = Math.floor(diff/3.6e6), m=Math.floor((diff%3.6e6)/6e4), s=Math.floor((diff%6e4)/1e3);
    el.textContent = `Next game vs ${upcoming.opponent}: ${h}h ${m}m ${s}s`;
    requestAnimationFrame(()=> setTimeout(tick, 500));
  }
  tick();
}

/* ---- Stats ---- */
async function loadStats(){
  [TEAM, PLAYERS] = await Promise.all([ getJSON(DATA_URLS.team), getJSON(DATA_URLS.players) ]);
  renderTeamStats(); renderPlayerStats();
}
function renderTeamStats(){
  const mount = $('#teamStats'); if(!mount) return;
  mount.innerHTML = `
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
  const mount = $('#playerStats'); if(!mount) return;
  const q = ($('#playerFilter')?.value||"").toLowerCase();
  let rows = PLAYERS.slice();
  if(q) rows = rows.filter(p=> p.name.toLowerCase().includes(q));
  rows.sort((a,b)=> (b.ppg||0)-(a.ppg||0));
  mount.innerHTML = `
    <table id="playersTable"><thead><tr>
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
}
$('#playerFilter')?.addEventListener('input', renderPlayerStats);
$('#refreshStats')?.addEventListener('click', loadStats);

/* ---- Props (shareable slips + existing features) ---- */
const LS = {
  bankroll: "ghub_bankroll", username: "ghub_username",
  openBets: "ghub_openBets", history: "ghub_betHistory", board: "ghub_leaderboard"
};
const getLS = (k,d)=> { try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch{ return d } };
const setLS = (k,v)=> localStorage.setItem(k, JSON.stringify(v));

function decimalFromAmerican(odds){ const o=Number(odds); return o<0 ? (100/-o)+1 : (o/100)+1; }
function defaultLines(){
  return (PLAYERS||[]).map(p=>({ player:p.name, pts:roundHalf(p.ppg||0), reb:roundHalf(p.rpg||0), ast:roundHalf(p.apg||0), pra:roundHalf((p.ppg||0)+(p.rpg||0)+(p.apg||0)) }));
}
function bankrollUI(){ const el=$('#bankroll'); if(el) el.textContent = `$${Number(getLS(LS.bankroll,0)).toLocaleString()}`; const u=$('#usernameInput'); if(u) u.value = getLS(LS.username,"") || ""; }
function upsertLeaderboard(user, bankroll){ const board=getLS(LS.board,[]); const i=board.findIndex(b=>b.user===user); if(i>=0)board[i].bankroll=bankroll; else board.push({user,bankroll,updated:Date.now()}); setLS(LS.board,board); renderLeaderboard(); }
function renderLeaderboard(){
  const mount = $('#leaderboard'); if(!mount) return;
  const board=getLS(LS.board,[]).sort((a,b)=>b.bankroll-a.bankroll);
  mount.innerHTML = `<table><thead><tr><th>#</th><th>User</th><th>Bankroll</th><th>Updated</th></tr></thead><tbody>${
    board.map((b,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(b.user)}</td><td>$${Number(b.bankroll).toLocaleString()}</td><td>${new Date(b.updated||Date.now()).toLocaleString()}</td></tr>`).join('')
  }</tbody></table>`;
}

function renderPropsTable(){
  const lines = defaultLines();
  const mount = $('#propsTable'); if(!mount) return;
  mount.innerHTML = `<table><thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th><th>P+R+A</th><th>Pick</th><th>Add</th></tr></thead><tbody>${
    lines.map(l=>`<tr><td><strong>${escapeHtml(l.player)}</strong></td><td>${l.pts}</td><td>${l.reb}</td><td>${l.ast}</td><td>${l.pra}</td>
    <td><select data-player="${escapeHtml(l.player)}" class="pick">
      <option value="PTS_O">PTS Over</option><option value="PTS_U">PTS Under</option>
      <option value="REB_O">REB Over</option><option value="REB_U">REB Under</option>
      <option value="AST_O">AST Over</option><option value="AST_U">AST Under</option>
      <option value="PRA_O">PRA Over</option><option value="PRA_U">PRA Under</option>
    </select></td><td><button class="btn addBet" data-player="${escapeHtml(l.player)}">Add</button></td></tr>`).join('')
  }</tbody></table>`;
  $$('.addBet').forEach(b=> b.addEventListener('click', ()=>{
    const player = b.dataset.player; const sel = b.closest('tr').querySelector('.pick').value;
    const slip = getLS(LS.openBets, []); slip.push({ player, market: sel, odds: -110 });
    setLS(LS.openBets, slip); renderBetSlip();
  }));
}
function renderBetSlip(){
  const slip = getLS(LS.openBets, []);
  const mount = $('#betList'); if(!mount) return;
  mount.innerHTML = slip.length
    ? slip.map((b,i)=> `<div class="card"><div><strong>${escapeHtml(b.player)}</strong> — ${b.market.replace('_',' ')} <span class="badge">@${b.odds}</span></div><div class="meta">Slip item #${i+1}</div></div>`).join('')
    : `<p class="muted tiny">No selections yet.</p>`;
}
function handleBankroll(){ const user=$('#usernameInput')?.value.trim()||"Guest"; setLS(LS.username,user); setLS(LS.bankroll,1000); upsertLeaderboard(user,1000); bankrollUI(); }
function resetBankroll(){ setLS(LS.bankroll,0); bankrollUI(); }
function placeBets(){
  const wager = Math.max(1, Number($('#wagerInput')?.value||0));
  const bank = getLS(LS.bankroll, 0); const slip = getLS(LS.openBets, []);
  if(!slip.length) return alert("Add picks first.");
  if(bank<wager) return alert("Not enough bankroll.");
  const hist = getLS(LS.history, []); hist.push({ placedAt: Date.now(), wager, bets: slip, status:"pending" });
  setLS(LS.history, hist); setLS(LS.openBets, []); setLS(LS.bankroll, bank - wager);
  renderBetSlip(); bankrollUI(); renderLeaderboard(); alert("Bets placed!");
}
function gradeBets(){
  const hist = getLS(LS.history, []); const pending = hist.filter(h=>h.status==="pending"); if(!pending.length) return alert("No pending bets.");
  let delta = 0; const map = Object.fromEntries(PLAYERS.map(p=>[p.name,p]));
  pending.forEach(ticket=>{
    let wins=0, legs=ticket.bets.length;
    ticket.bets.forEach(b=>{
      const p = map[b.player]; if(!p) return; const variance=(Math.random()*6-3);
      const pts=(p.ppg||0)+variance, reb=(p.rpg||0)+(Math.random()*4-2), ast=(p.apg||0)+(Math.random()*3-1.5), pra=pts+reb+ast;
      const [m,side] = b.market.split('_');
      const line = m==="PTS"?roundHalf(p.ppg||0):m==="REB"?roundHalf(p.rpg||0):m==="AST"?roundHalf(p.apg||0):roundHalf((p.ppg||0)+(p.rpg||0)+(p.apg||0));
      const over = (m==="PTS"?pts:m==="REB"?reb:m==="AST"?ast:pra) > line;
      const win = (side==="O" && over) || (side==="U" && !over); b.result = win?"WIN":"LOSS"; if(win) wins++;
    });
    const allWin = wins===legs; const dec = decimalFromAmerican(-110);
    ticket.status="graded"; ticket.payout = allWin ? Math.round(ticket.wager * Math.pow(dec, legs)) : 0;
    delta += ticket.payout;
  });
  const bank = getLS(LS.bankroll,0); const user = getLS(LS.username,"Guest");
  setLS(LS.bankroll, bank + delta); setLS(LS.history, hist); upsertLeaderboard(user, getLS(LS.bankroll,0));
  bankrollUI(); renderLeaderboard(); alert(`Graded! Net payout: $${delta}`);
}

/* ---- Shareable slips ---- */
function shareSlip(){
  const slip = getLS(LS.openBets, []);
  if(!slip.length) return alert("Your bet slip is empty.");
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(slip))));
  const url = location.origin + location.pathname + '#slip=' + payload;
  navigator.clipboard?.writeText(url);
  alert("Share link copied!");
}
function importSlipFromHash(){
  const m = location.hash.match(/#slip=([^&]+)/);
  if(!m) return;
  try{
    const slip = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    setLS(LS.openBets, slip);
    renderBetSlip();
  }catch(e){ /* ignore */ }
}

/* ---- Standings (optional) ---- */
async function loadStandings(){ 
  try{ STANDINGS = await getJSON(DATA_URLS.standings); renderStandings(); }catch{ /* optional */ }
}
function renderStandings(){
  const mount = $('#standingsWrap'); if(!mount) return;
  mount.innerHTML = `
    <table><thead><tr><th>Team</th><th>Overall</th><th>Conf</th></tr></thead><tbody>
      ${STANDINGS.map(s=>`<tr><td><a href="${s.link}" target="_blank" rel="noopener">${escapeHtml(s.team)}</a></td><td>${s.overall}</td><td>${s.conf}</td></tr>`).join('')}
    </tbody></table>`;
}

/* ---- News ---- */
async function loadNews(){
  try{
    const res = await fetch(NEWS_FEEDS[0]); const xml = await res.text();
    const items = parseBasicRSS(xml).slice(0,12);
    renderNews(items);
  }catch(e){
    renderNews([{ title:"Welcome to the Gators Hub", link:"#", summary:"Roster, schedule, stats, news, photos, and for-fun props.", date:new Date().toISOString() }]);
  }
}
function parseBasicRSS(xml){
  const items=[]; const itemRe=/<item[\s\S]*?<\/item>/gi, titleRe=/<title>([\s\S]*?)<\/title>/i, linkRe=/<link>([\s\S]*?)<\/link>/i, descRe=/<description>([\s\S]*?)<\/description>/i, dateRe=/<pubDate>([\s\S]*?)<\/pubDate>/i;
  (xml.match(itemRe)||[]).forEach(b=>{
    const title=(b.match(titleRe)?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,'').trim();
    const link=(b.match(linkRe)?.[1]||"").trim();
    const summary=(b.match(descRe)?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]*>/g,'').trim();
    const date=new Date(b.match(dateRe)?.[1]||Date.now()).toISOString();
    if(title && link) items.push({title, link, summary, date});
  });
  return items;
}
function renderNews(items){
  const mount = $('#newsList'); if(!mount) return;
  mount.innerHTML = items.map(n=>`
    <article class="news-card">
      <h4><a href="${n.link}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a></h4>
      <p>${escapeHtml(n.summary||"")}</p>
      <p class="meta">${new Date(n.date).toLocaleString()}</p>
    </article>`).join('');
}

/* ---- Photos ---- */
const PHOTOS = [
  { src:"https://floridagators.com/images/2025/3/16/MBB_SEC_Champ_Trophy.jpg", alt:"SEC Tournament champions 2025", href:"https://floridagators.com/galleries" },
  { src:"https://floridagators.com/images/2025/4/7/MBB_NCAA_Title_Celebration.jpg", alt:"NCAA Championship celebration 2025", href:"https://floridagators.com/galleries" },
  { src:"https://floridagators.com/images/2025/11/7/UF_MBB_Team_2025.jpg", alt:"2025–26 team", href:"https://floridagators.com/galleries" }
];
function loadPhotos(){
  const g = $('#photoGrid'); if(!g) return;
  g.innerHTML = PHOTOS.map(p=>`
    <a class="card" href="${p.href}" target="_blank" rel="noopener">
      <img src="${p.src}" alt="${escapeHtml(p.alt)}" />
      <div class="meta">${escapeHtml(p.alt)}</div>
    </a>`).join('');
}

/* ---- PWA registration (optional files present) ---- */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

/* ---- Init ---- */
async function init(){
  wireTabs();
  loadPhotos(); loadNews(); loadStandings();
  await Promise.all([ loadRoster(), loadSchedule(), loadStats() ]);
  // Props depends on PLAYERS
  renderPropsTable(); renderBetSlip(); bankrollUI(); renderLeaderboard();
  // shareable slips
  $('#shareSlip')?.addEventListener('click', shareSlip);
  importSlipFromHash();
  // bankroll, etc.
  $('#usernameInput')?.addEventListener('blur', ()=>{ const u=$('#usernameInput').value.trim(); if(u) localStorage.setItem(LS.username, JSON.stringify(u)); });
  $('#startBankroll')?.addEventListener('click', handleBankroll);
  $('#resetBankroll')?.addEventListener('click', resetBankroll);
  $('#placeBets')?.addEventListener('click', placeBets);
  $('#clearBets')?.addEventListener('click', ()=>{ setLS(LS.openBets,[]); renderBetSlip(); });
  $('#gradeBets')?.addEventListener('click', gradeBets);

  setInterval(loadStats, REFRESH_MS);
}
document.addEventListener('DOMContentLoaded', init);
