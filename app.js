/* ======================================================
   Florida Gators MBB Hub — Supercharged (no libraries)
   - Pulls JSON from your repo
   - Opponent logos, favorites, countdown, compare SVG
   - PWA ready (manifest + sw.js)
   ====================================================== */

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

/* ---- Your JSON endpoints (raw GitHub URLs) ---- */
const ROOT = "https://raw.githubusercontent.com/Robbiek7455/gators-basketball-hub/main";
const DATA_URLS = {
  roster:    `${ROOT}/roster.json`,
  schedule:  `${ROOT}/schedule.json`,
  team:      `${ROOT}/team.json`,
  players:   `${ROOT}/players.json`,
  opponents: `${ROOT}/opponents.json`,
  standings: `${ROOT}/standings.json`
};

/* ---- News (CORS-safe public gateway; falls back gracefully) ---- */
const NEWS_FEEDS = [
  // Official site RSS might be blocked by CORS. AllOrigins JSON works:
  // (If it ever fails, you still get a fallback card.)
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
  $('#themeToggle').textContent = saved==='dark' ? '☀️' : '🌙';
}
$('#themeToggle').addEventListener('click', ()=>{
  const now = (localStorage.getItem('ghub_theme')||'light')==='light'?'dark':'light';
  localStorage.setItem('ghub_theme', now); applyTheme();
});
applyTheme();

/* ---- Fetch JSON (cache buster to avoid GH CDN lag) ---- */
async function getJSON(url){
  const r = await fetch(url + `?t=${Date.now()}`);
  if(!r.ok) throw new Error("Failed " + url);
  return await r.json();
}

/* ---- Global state ---- */
let ROSTER=[], SCHEDULE=[], TEAM={}, PLAYERS=[], OPPONENTS=[], STANDINGS=[];

/* ---- Favorites ---- */
function getFavs(){ try{ return JSON.parse(localStorage.getItem('ghub_favs'))||[] }catch{ return [] } }
function setFavs(v){ localStorage.setItem('ghub_favs', JSON.stringify(v)); }
function toggleFavorite(name){
  const favs = getFavs();
  const i = favs.indexOf(name);
  if(i>=0) favs.splice(i,1); else favs.push(name);
  setFavs(favs);
}

/* ---- Roster ---- */
async function loadRoster(){
  ROSTER = await getJSON(DATA_URLS.roster);
  renderRoster();
}
function renderRoster(){
  const q = ($('#rosterFilter').value||"").toLowerCase();
  const favOnly = $('#favOnly').checked;
  const favs = getFavs();
  let list = ROSTER.slice();
  if(q) list = list.filter(p=> (p.name+p.pos+(p.hometown||"")).toLowerCase().includes(q));
  if(favOnly) list = list.filter(p=> favs.includes(p.name));

  const grid = $('#rosterGrid');
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
$('#rosterFilter').addEventListener('input', renderRoster);
$('#favOnly').addEventListener('change', renderRoster);
$('#refreshRoster').addEventListener('click', loadRoster);

/* ---- Opponents map ---- */
function oppMap(){
  return Object.fromEntries((OPPONENTS||[]).map(o=>[o.name,o]));
}

/* ---- Schedule + Opp logos + Countdown + .ics ---- */
async function loadSchedule(){
  [SCHEDULE, OPPONENTS] = await Promise.all([ getJSON(DATA_URLS.schedule), getJSON(DATA_URLS.opponents) ]);
  renderSchedule();
  renderCountdown();
}
function renderSchedule(){
  const filter = $('#schedFilter').value || 'ALL';
  const M = oppMap();
  const rows = SCHEDULE.filter(g=> filter==='ALL' ? true : g.at===filter);
  const mount = $('#scheduleWrap');
  mount.innerHTML = `
    <table id="scheduleTable">
      <thead><tr>
        <th>Date</th><th>Time (ET)</th><th>Opponent</th><th>H/A/N</th><th>Location / Event</th><th>Result</th><th>Add</th>
      </tr></thead>
      <tbody>
        ${rows.map(g=>{
          const o = M[g.opponent] || {};
          return `<tr>
            <td>${g.date} (${g.day})</td>
            <td>${g.time}</td>
            <td><div style="display:flex;align-items:center;gap:8px">
                ${o.logo? `<img src="${o.logo}" alt="" width="20" height="20" style="border-radius:4px">` : ""}
                <strong>${escapeHtml(g.opponent)}</strong>
              </div></td>
            <td>${g.at}</td>
            <td>${escapeHtml(g.location)}</td>
            <td>${escapeHtml(g.result||"")}</td>
            <td><button class="btn ghost addCal" data-game='${escapeHtml(JSON.stringify(g))}'>.ics</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  $$('.addCal').forEach(b=> b.addEventListener('click', ()=>{
    const g = JSON.parse(b.dataset.game); downloadICS(g);
  }));
}
$('#schedFilter').addEventListener('change', renderSchedule);
$('#refreshSchedule').addEventListener('click', loadSchedule);

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
  const upcoming = SCHEDULE.map(g=> ({...g, t: Date.parse(`${g.date} ${g.time} ET`) }))
                           .filter(g=> !isNaN(g.t) && g.t > Date.now())
                           .sort((a,b)=>a.t-b.t)[0];
  const el = $('#nextGame');
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
  renderTeamStats(); renderPlayerStats(); fillCompareOptions();
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
  const q = ($('#playerFilter').value||"").toLowerCase();
  let rows = PLAYERS.slice();
  if(q) rows = rows.filter(p=> p.name.toLowerCase().includes(q));
  rows.sort((a,b)=> (b.ppg||0)-(a.ppg||0));
  $('#playerStats').innerHTML = `
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
$('#playerFilter').addEventListener('input', renderPlayerStats);
$('#refreshStats').addEventListener('click', loadStats);
$('#exportPlayersCsv').addEventListener('click', ()=>{
  const headers = ["name","gp","mpg","ppg","rpg","apg","spg","bpg","tpg","fgPct","threePct","ftPct"];
  const csv = [headers.join(",")].concat( PLAYERS.map(p=> headers.map(h=> p[h] ?? "").join(",")) ).join("\n");
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="players.csv"; a.click();
});

/* ---- Compare (SVG radar-style bars) ---- */
function fillCompareOptions(){
  const A = $('#cmpA'), B=$('#cmpB'); A.innerHTML=""; B.innerHTML="";
  PLAYERS.forEach(p=>{
    const o1 = document.createElement('option'); o1.value=o1.textContent=p.name; A.appendChild(o1);
    const o2 = document.createElement('option'); o2.value=o2.textContent=p.name; B.appendChild(o2);
  });
  if(PLAYERS[0]) A.value=PLAYERS[0].name;
  if(PLAYERS[1]) B.value=PLAYERS[1].name;
}
function drawCompare(){
  const a = PLAYERS.find(p=>p.name===$('#cmpA').value); 
  const b = PLAYERS.find(p=>p.name===$('#cmpB').value);
  const metrics = ["ppg","rpg","apg","spg","bpg","tpg"];
  const maxes = { ppg:30, rpg:15, apg:8, spg:3, bpg:3, tpg:5 };
  const w=800, h=320, pad=40, col=(w-2*pad)/metrics.length;
  const bar = (val, max)=> Math.max(2, (val/max)*(h-2*pad));
  const svg = [`<svg viewBox="0 0 ${w} ${h}" width="100%" height="320">`,
    `<rect x="0" y="0" width="${w}" height="${h}" rx="16" fill="transparent"/>`,
    `<g font-size="12" fill="currentColor">`
  ];
  metrics.forEach((m,i)=>{
    const x = pad + i*col + col/2;
    svg.push(`<text x="${x}" y="${h-pad+18}" text-anchor="middle">${m.toUpperCase()}</text>`);
    // A (left bar)
    svg.push(`<rect x="${x-22}" y="${h-pad-bar(a[m]||0,maxes[m])}" width="16" height="${bar(a[m]||0,maxes[m])}" rx="4" fill="#0021A5"></rect>`);
    // B (right bar)
    svg.push(`<rect x="${x+6}" y="${h-pad-bar(b[m]||0,maxes[m])}" width="16" height="${bar(b[m]||0,maxes[m])}" rx="4" fill="#FA4616"></rect>`);
  });
  svg.push(`</g>`,
           `<g font-size="14" fill="currentColor">
              <text x="${pad}" y="${pad-8}"><tspan fill="#0021A5">●</tspan> ${escapeHtml(a.name)}</text>
              <text x="${pad+200}" y="${pad-8}"><tspan fill="#FA4616">●</tspan> ${escapeHtml(b.name)}</text>
            </g>`,
           `</svg>`);
  $('#compareWrap').innerHTML = svg.join('');
}
$('#drawCompare').addEventListener('click', drawCompare);

/* ---- Props (same as your last version, intact) ---- */
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
function bankrollUI(){ $('#bankroll').textContent = `$${Number(getLS(LS.bankroll,0)).toLocaleString()}`; $('#usernameInput').value = getLS(LS.username,"") || ""; }
function upsertLeaderboard(user, bankroll){ const board=getLS(LS.board,[]); const i=board.findIndex(b=>b.user===user); if(i>=0)board[i].bankroll=bankroll; else board.push({user,bankroll,updated:Date.now()}); setLS(LS.board,board); }
function renderLeaderboard(){ const board=getLS(LS.board,[]).sort((a,b)=>b.bankroll-a.bankroll); $('#leaderboard').innerHTML = `<table><thead><tr><th>#</th><th>User</th><th>Bankroll</th><th>Updated</th></tr></thead><tbody>${board.map((b,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(b.user)}</td><td>$${Number(b.bankroll).toLocaleString()}</td><td>${new Date(b.updated||Date.now()).toLocaleString()}</td></tr>`).join('')}</tbody></table>`; }
function renderPropsTable(){
  const lines = defaultLines();
  $('#propsTable').innerHTML = `<table><thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th><th>P+R+A</th><th>Pick</th><th>Add</th></tr></thead><tbody>${
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
  $('#betList').innerHTML = slip.length? slip.map((b,i)=> `<div class="card"><div><strong>${escapeHtml(b.player)}</strong> — ${b.market.replace('_',' ')} <span class="badge">@${b.odds}</span></div><div class="meta">Slip item #${i+1}</div></div>`).join('') : `<p class="muted tiny">No selections yet.</p>`;
}
function handleBankroll(){ const user=$('#usernameInput').value.trim()||"Guest"; setLS(LS.username,user); setLS(LS.bankroll,1000); upsertLeaderboard(user,1000); bankrollUI(); renderLeaderboard(); }
function resetBankroll(){ setLS(LS.bankroll,0); bankrollUI(); }
function placeBets(){
  const wager = Math.max(1, Number($('#wagerInput').value||0));
  const bank = getLS(LS.bankroll, 0); const slip = getLS(LS.openBets, []);
  if(!slip.length) return alert("Add picks first."); if(bank<wager) return alert("Not enough bankroll.");
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
$('#usernameInput').addEventListener('blur', ()=>{ const u=$('#usernameInput').value.trim(); if(u) localStorage.setItem(LS.username, JSON.stringify(u)); });
$('#startBankroll').addEventListener('click', handleBankroll);
$('#resetBankroll').addEventListener('click', resetBankroll);
$('#placeBets').addEventListener('click', placeBets);
$('#clearBets').addEventListener('click', ()=>{ setLS(LS.openBets,[]); renderBetSlip(); });
$('#gradeBets').addEventListener('click', gradeBets);
$('#exportLeaderboard').addEventListener('click', ()=>{
  const board = getLS(LS.board, []); const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(board,null,2)],{type:"application/json"}));
  a.download="leaderboard.json"; a.click();
});
$('#importLeaderboard').addEventListener('change', async (e)=>{
  const f=e.target.files?.[0]; if(!f) return; const text=await f.text(); setLS(LS.board, JSON.parse(text)); renderLeaderboard();
});

/* ---- Standings ---- */
async function loadStandings(){ STANDINGS = await getJSON(DATA_URLS.standings); renderStandings(); }
function renderStandings(){
  $('#standingsWrap').innerHTML = `
    <table><thead><tr><th>Team</th><th>Overall</th><th>Conf</th></tr></thead><tbody>
      ${STANDINGS.map(s=>`<tr><td><a href="${s.link}" target="_blank" rel="noopener">${escapeHtml(s.team)}</a></td><td>${s.overall}</td><td>${s.conf}</td></tr>`).join('')}
    </tbody></table>`;
}
$('#refreshStandings').addEventListener('click', loadStandings);

/* ---- News ---- */
async function loadNews(){
  try{
    const res = await fetch(NEWS_FEEDS[0]);
    const xml = await res.text();
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
  $('#newsList').innerHTML = items.map(n=>`
    <article class="news-card">
      <h4><a href="${n.link}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a></h4>
      <p>${escapeHtml(n.summary||"")}</p>
      <p class="meta">${new Date(n.date).toLocaleString()}</p>
    </article>`).join('');
}
$('#refreshNews').addEventListener('click', loadNews);

/* ---- Photos ---- */
const PHOTOS = [
  { src:"https://floridagators.com/images/2025/3/16/MBB_SEC_Champ_Trophy.jpg", alt:"SEC Tournament champions 2025", href:"https://floridagators.com/galleries" },
  { src:"https://floridagators.com/images/2025/4/7/MBB_NCAA_Title_Celebration.jpg", alt:"NCAA Championship celebration 2025", href:"https://floridagators.com/galleries" },
  { src:"https://floridagators.com/images/2025/11/7/UF_MBB_Team_2025.jpg", alt:"2025–26 team", href:"https://floridagators.com/galleries" }
];
function loadPhotos(){
  $('#photoGrid').innerHTML = PHOTOS.map(p=>`
    <a class="card" href="${p.href}" target="_blank" rel="noopener">
      <img src="${p.src}" alt="${escapeHtml(p.alt)}" />
      <div class="meta">${escapeHtml(p.alt)}</div>
    </a>`).join('');
}

/* ---- PWA registration ---- */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

/* ---- Tabs ---- */
$$('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    $$('.panel').forEach(p=>p.classList.remove('active'));
    $('#'+btn.dataset.tab)?.classList.add('active');
  });
});

/* ---- Init ---- */
async function init(){
  loadPhotos(); loadNews();
  await Promise.all([ loadRoster(), loadSchedule(), loadStats(), loadStandings() ]);
  // Props depends on PLAYERS
  renderPropsTable(); renderBetSlip(); bankrollUI(); renderLeaderboard(); fillCompareOptions(); drawCompare();
  setInterval(loadStats, REFRESH_MS);
}
document.addEventListener('DOMContentLoaded', init);
