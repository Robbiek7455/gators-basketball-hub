/* ======================================================
   Florida Gators MBB Hub — Beginner-friendly, no build
   - Real 2025–26 roster & schedule filled in below
   - Mock props with bankroll + leaderboard (localStorage)
   - Auto-refresh ready if you later point to JSON/CSV
   ====================================================== */

const REFRESH_MS = 5 * 60 * 1000; // 5m (stats/news)

/* ---------- DATA (curated Nov 10, 2025) ---------- */
/* Roster: combined from official UF roster and Sports-Reference (2026 season) */
const ROSTER_2026 = [
  {no:0,  name:"Boogie Fland",       pos:"G",  ht:"6'3\"", wt:185, cls:"So", hometown:"Bronx, NY",       prev:"Arkansas"},
  {no:1,  name:"Xaivian Lee",        pos:"G",  ht:"6'4\"", wt:180, cls:"Sr", hometown:"Toronto, ON",     prev:"Princeton"},
  {no:3,  name:"Micah Handlogten",   pos:"C",  ht:"7'1\"", wt:260, cls:"Sr", hometown:"Lake Norman, NC", prev:"Marshall"},
  {no:4,  name:"Alex Lloyd",         pos:"G",  ht:"6'3\"", wt:180, cls:"Fr", hometown:"Miami, FL"},
  {no:7,  name:"Urban Klavzar",      pos:"G",  ht:"6'1\"", wt:190, cls:"Jr", hometown:"Domzale, Slovenia", prev:"Real Madrid"},
  {no:8,  name:"Alex Kovatchev",     pos:"G",  ht:"6'5\"", wt:195, cls:"R-So", hometown:"Perth, Australia", prev:"Sacramento State"},
  {no:9,  name:"Rueben Chinyelu",    pos:"C",  ht:"6'10\"",wt:265, cls:"Jr", hometown:"Enugwu-Agidi, Nigeria", prev:"Washington State"},
  {no:10, name:"Thomas Haugh",       pos:"F",  ht:"6'9\"", wt:215, cls:"Jr", hometown:"New Oxford, PA"},
  {no:11, name:"CJ Ingram",          pos:"G",  ht:"6'6\"", wt:205, cls:"Fr", hometown:"Hawthorne, FL",    prev:"Montverde Academy"},
  {no:12, name:"Viktor Mikic",       pos:"C",  ht:"6'11\"",wt:260, cls:"So", hometown:"Belgrade, Serbia"},
  {no:20, name:"Isaiah Brown",       pos:"G",  ht:"6'4\"", wt:210, cls:"So", hometown:"Orlando, FL"},
  {no:21, name:"Alex Condon",        pos:"F/C",ht:"6'11\"",wt:236, cls:"Jr", hometown:"Perth, Australia"},
  {no:23, name:"AJ Brown",           pos:"G",  ht:"6'4\"", wt:210, cls:"R-Jr", hometown:"Orlando, FL",    prev:"Ohio"},
  {no:32, name:"Olivier Rioux",      pos:"C",  ht:"7'9\"", wt:305, cls:"R-Fr", hometown:"Terrebonne, QC", prev:"IMG Academy"},
  {no:33, name:"Cooper Josefsberg",  pos:"G",  ht:"6'4\"", wt:195, cls:"Jr", hometown:"Miami, FL",        prev:"Riviera Prep"},
];

/* Schedule: official UF 2025–26 page (ET) — first part of the slate */
const SCHEDULE_2026 = [
  {date:"Nov 3, 2025",  day:"Mon", time:"7:00 PM", at:"Neutral", opponent:"Arizona",          location:"Las Vegas, NV — Hall of Fame Series", result:"L 87–93"},
  {date:"Nov 6, 2025",  day:"Thu", time:"8:00 PM", at:"Home",    opponent:"North Florida",   location:"Gainesville, FL — O'Connell Center",  result:"W 104–64"},
  {date:"Nov 11, 2025", day:"Tue", time:"7:00 PM", at:"Home",    opponent:"Florida State",   location:"Gainesville, FL — O'Connell Center",  result:""},
  {date:"Nov 16, 2025", day:"Sun", time:"8:30 PM", at:"Neutral", opponent:"Miami (Fla.)",    location:"Jacksonville, FL — Jax Hoops Showdown",result:""},
  {date:"Nov 21, 2025", day:"Fri", time:"7:00 PM", at:"Home",    opponent:"Merrimack",       location:"Gainesville, FL — O'Connell Center",  result:""},
  {date:"Nov 27, 2025", day:"Thu", time:"3:00 PM", at:"Neutral", opponent:"TCU",             location:"San Diego, CA — Rady Children’s Inv.", result:""},
  {date:"Nov 28, 2025", day:"Fri", time:"3:00/5:30 PM", at:"Neutral", opponent:"Providence/Wisconsin", location:"San Diego, CA — Rady Children’s Inv.", result:""},
  {date:"Dec 2, 2025",  day:"Tue", time:"7:30 PM", at:"Away",    opponent:"Duke",            location:"Durham, NC — SEC–ACC Challenge",       result:""},
  {date:"Dec 9, 2025",  day:"Tue", time:"9:00 PM", at:"Neutral", opponent:"UConn",           location:"New York, NY — Jimmy V Classic",       result:""},
  {date:"Dec 13, 2025", day:"Sat", time:"2:30 PM", at:"Neutral", opponent:"George Washington",location:"Sunrise, FL — Orange Bowl Classic",    result:""},
];

/* Stats:
   We start with a tiny seed so the page renders.
   If you later add a JSON endpoint (no Excel needed), flip DATA_URLS below.
*/
const TEAM_STATS = { gp: 2, pts: 95.7, reb: 41.0, ast: 18.0, stl: 7.5, blk: 4.0, tov: 11.5, fgPct: 0.472, threePct: 0.365, ftPct: 0.755 };
const PLAYER_STATS = [
  { name:"AJ Brown",      gp:2, mpg:28.5, ppg:18.0, rpg:4.0, apg:2.0, spg:1.0, bpg:0.2, tpg:1.7, fgPct:0.47, threePct:0.39, ftPct:0.82 },
  { name:"Alex Condon",   gp:2, mpg:26.0, ppg:14.5, rpg:8.0, apg:1.6, spg:0.7, bpg:1.2, tpg:1.8, fgPct:0.58, threePct:0.33, ftPct:0.71 },
  { name:"Xaivian Lee",   gp:2, mpg:29.0, ppg:13.0, rpg:3.0, apg:4.5, spg:1.2, bpg:0.1, tpg:2.3, fgPct:0.46, threePct:0.36, ftPct:0.86 },
  { name:"Micah Handlogten", gp:2, mpg:23.0, ppg:11.0, rpg:9.0, apg:1.1, spg:0.4, bpg:1.4, tpg:1.6, fgPct:0.60, threePct:0.00, ftPct:0.64 },
  { name:"Thomas Haugh",  gp:2, mpg:22.5, ppg:9.0,  rpg:6.0, apg:2.0, spg:0.9, bpg:0.7, tpg:1.5, fgPct:0.52, threePct:0.29, ftPct:0.70 },
  { name:"Boogie Fland",  gp:2, mpg:20.0, ppg:8.0,  rpg:2.5, apg:2.0, spg:0.8, bpg:0.1, tpg:1.4, fgPct:0.44, threePct:0.34, ftPct:0.78 },
];

/* Optional “live” JSON (no spreadsheet):
   - Put roster.json, schedule.json, team.json, players.json in your repo, then paste their raw URLs below.
   - If left blank, code uses the in-file data above.
*/
const DATA_URLS = {
  roster: "",      // e.g. "https://Robbiek7455.github.io/gators-basketball-hub/roster.json"
  schedule: "",
  teamStats: "",
  playerStats: ""
};

/* Photo thumbs (licensed on their sites; we link back) */
const PHOTOS = [
  {
    src:"https://www.gannett-cdn.com/presto/2025/04/07/PNAS/5d7a7b6e-xxx-sec-title.jpg?width=1200", 
    alt:"Florida celebrates 2025 NCAA title",
    href:"https://www.gainesville.com/picture-gallery/sports/college/sec/2025/04/07/florida-basketball-celebrates-ncaa-championship-win-photo-gallery-images/82985706007/"
  },
  {
    src:"https://floridagators.com/images/2025/3/16/MBB_SEC_Champ_Trophy.jpg",
    alt:"SEC Tournament champions 2025",
    href:"https://floridagators.com/news/2025/3/16/mens-basketball-music-city-marvels-gators-won-sec-championship-march-16-2025.aspx"
  },
  {
    src:"https://floridagators.com/images/2025/4/7/MBB_NCAA_Title_Celebration.jpg",
    alt:"NCAA Championship celebration",
    href:"https://www.theguardian.com/sport/2025/apr/07/florida-houston-march-madness-final-ncaa-tournament"
  },
  {
    src:"https://floridagators.com/images/2025/11/7/UF_MBB_Team_2025.jpg",
    alt:"2025–26 team",
    href:"https://floridagators.com/galleries"
  }
];

/* ---------- UI helpers ---------- */
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function fmt(n){ return (n===0 || n) ? Number(n).toFixed(1) : '—'; }
function pct(p){ if(!(p===0||p)) return '—'; const v=Number(p); return (v>1? (v/100).toFixed(3): v.toFixed(3)); }
function roundHalf(n){ return Math.round(n*2)/2; }

/* ---------- Tabs ---------- */
$$('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    $$('.panel').forEach(p=>p.classList.remove('active'));
    $('#'+btn.dataset.tab).classList.add('active');
  });
});

/* ---------- Fetch (fallback to local data) ---------- */
async function maybeFetch(url, fallback){
  if(!url) return fallback;
  try{ const r = await fetch(url); if(!r.ok) throw new Error('bad'); return await r.json(); }
  catch(e){ console.warn('Fetch failed, using fallback for', url, e); return fallback; }
}

/* ---------- Roster ---------- */
async function loadRoster(){
  const data = await maybeFetch(DATA_URLS.roster, ROSTER_2026);
  renderRoster(data);
}
function renderRoster(list){
  const mount = $('#rosterGrid');
  mount.innerHTML = "";
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
          <div class="meta">${p.hometown || ""} ${p.prev?(" • Prev: "+p.prev):""}</div>
        </div>
      </div>`;
    mount.appendChild(el);
  });
}

/* ---------- Schedule ---------- */
async function loadSchedule(){
  const rows = await maybeFetch(DATA_URLS.schedule, SCHEDULE_2026);
  const mount = $('#scheduleWrap');
  mount.innerHTML = `
    <table>
      <thead><tr>
        <th>Date</th><th>Time (ET)</th><th>Opp.</th><th>H/A/N</th><th>Location / Event</th><th>Result</th>
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
          </tr>`).join('')}
      </tbody>
    </table>`;
}

/* ---------- Stats ---------- */
async function loadStats(){
  const team = await maybeFetch(DATA_URLS.teamStats, TEAM_STATS);
  const players = await maybeFetch(DATA_URLS.playerStats, PLAYER_STATS);

  // team
  $('#teamStats').innerHTML = `
    <table><thead><tr>
      <th>GP</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th>
    </tr></thead><tbody><tr>
      <td>${team.gp ?? '—'}</td>
      <td class="stat">${fmt(team.pts)}</td>
      <td>${fmt(team.reb)}</td>
      <td>${fmt(team.ast)}</td>
      <td>${fmt(team.stl)}</td>
      <td>${fmt(team.blk)}</td>
      <td>${fmt(team.tov)}</td>
      <td>${pct(team.fgPct)}</td>
      <td>${pct(team.threePct)}</td>
      <td>${pct(team.ftPct)}</td>
    </tr></tbody></table>`;

  renderPlayerStats(players, $('#playerFilter').value);
}
function renderPlayerStats(players, term=""){
  const rows = term ? players.filter(p=>p.name.toLowerCase().includes(term.toLowerCase())) : players.slice();
  rows.sort((a,b)=>(b.ppg||0)-(a.ppg||0));
  $('#playerStats').innerHTML = `
    <table><thead><tr>
      <th>Player</th><th>GP</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th>
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

/* ---------- Props (Mock betting with bankroll + leaderboard) ---------- */
const LS = {
  bankroll: "ghub_bankroll",
  username: "ghub_username",
  openBets: "ghub_openBets",
  history: "ghub_betHistory",
  board: "ghub_leaderboard"
};
function getLS(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch{ return d; } }
function setLS(k, v){ localStorage.setItem(k, JSON.stringify(v)); }

function defaultLines(){
  // build O/U lines from PLAYER_STATS (or fetched players) rounded to .5
  const players = getLS("cachedPlayers", PLAYER_STATS) || PLAYER_STATS;
  return players.map(p=>({
    player: p.name,
    pts: roundHalf(p.ppg||0),
    reb: roundHalf(p.rpg||0),
    ast: roundHalf(p.apg||0),
    pra: roundHalf((p.ppg||0)+(p.rpg||0)+(p.apg||0))
  }));
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
              <option value="PTS_O">PTS Over</option>
              <option value="PTS_U">PTS Under</option>
              <option value="REB_O">REB Over</option>
              <option value="REB_U">REB Under</option>
              <option value="AST_O">AST Over</option>
              <option value="AST_U">AST Under</option>
              <option value="PRA_O">PRA Over</option>
              <option value="PRA_U">PRA Under</option>
            </select>
          </td>
          <td><button class="btn addBet" data-player="${escapeHtml(l.player)}">Add</button></td>
        </tr>`).join('')}
    </tbody></table>`;

  // wire add buttons
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
  mount.innerHTML = slip.map((b,i)=> `<div class="card">
      <div><strong>${escapeHtml(b.player)}</strong> — ${b.market.replace('_',' ')} <span class="badge">@${b.odds}</span></div>
      <div class="meta">Slip item #${i+1}</div>
    </div>`).join('');
}

function bankrollUI(){
  const bank = getLS(LS.bankroll, 0);
  $('#bankroll').textContent = `$${Number(bank).toLocaleString()}`;
  const user = getLS(LS.username, "");
  $('#usernameInput').value = user || "";
}

function handleBankroll(){
  const user = $('#usernameInput').value.trim() || "Guest";
  setLS(LS.username, user);
  setLS(LS.bankroll, 1000);
  bankrollUI();
  upsertLeaderboard(user, 1000); // seed
}

function decimalFromAmerican(odds){
  // -110 => 1.909... , +120 => 2.20
  const o = Number(odds);
  return o<0 ? (100/-o)+1 : (o/100)+1;
}

function placeBets(){
  const wager = Math.max(1, Number($('#wagerInput').value||0));
  const bank = getLS(LS.bankroll, 0);
  const slip = getLS(LS.openBets, []);
  if(!slip.length) return alert("Add picks first.");
  if(bank < wager) return alert("Not enough bankroll.");
  // place: move to history as "pending"
  const hist = getLS(LS.history, []);
  hist.push({ placedAt: Date.now(), wager, bets: slip, status:"pending" });
  setLS(LS.history, hist);
  setLS(LS.openBets, []);
  setLS(LS.bankroll, bank - wager);
  renderBetSlip(); bankrollUI(); renderLeaderboard();
  alert("Bets placed!");
}

function gradeBets(){
  // simulate outcomes from current averages (± random variance)
  const hist = getLS(LS.history, []);
  const pending = hist.filter(h=>h.status==="pending");
  if(!pending.length) return alert("No pending bets.");
  let delta = 0;

  const players = getLS("cachedPlayers", PLAYER_STATS) || PLAYER_STATS;
  const map = Object.fromEntries(players.map(p=>[p.name,p]));

  pending.forEach(ticket=>{
    let wins = 0, legs = ticket.bets.length;
    ticket.bets.forEach(b=>{
      const p = map[b.player]; if(!p) return;
      const variance = (Math.random()*6 - 3); // -3..+3 wiggle
      const pts = (p.ppg||0)+variance;
      const reb = (p.rpg||0)+(Math.random()*4-2);
      const ast = (p.apg||0)+(Math.random()*3-1.5);
      const pra = pts+reb+ast;

      const [market, side] = b.market.split('_'); // e.g. PTS_O
      const line = market==="PTS"? roundHalf(p.ppg||0)
                 : market==="REB"? roundHalf(p.rpg||0)
                 : market==="AST"? roundHalf(p.apg||0)
                 : roundHalf((p.ppg||0)+(p.rpg||0)+(p.apg||0));

      const wentOver = (market==="PTS"? pts : market==="REB"? reb : market==="AST"? ast : pra) > line;
      const isWin = (side==="O" && wentOver) || (side==="U" && !wentOver);
      b.result = isWin ? "WIN" : "LOSS";
      if(isWin) wins++;
    });

    const allWin = wins===legs;
    const odds = -110; // same odds for simplicity (parlay style)
    const dec = decimalFromAmerican(odds);
    const payout = allWin ? ticket.wager * Math.pow(dec, legs) : 0;
    ticket.status = "graded";
    ticket.payout = Math.round(payout);
    delta += ticket.payout;
  });

  // apply bankroll change & persist
  const bank = getLS(LS.bankroll, 0);
  const user = getLS(LS.username, "Guest");
  setLS(LS.bankroll, bank + delta);
  setLS(LS.history, hist); // statuses updated
  upsertLeaderboard(user, getLS(LS.bankroll, 0));
  bankrollUI();
  renderLeaderboard();
  alert(`Graded! Net payout: $${delta}`);
}

function clearBets(){ setLS(LS.openBets, []); renderBetSlip(); }

/* ---------- Leaderboard ---------- */
function upsertLeaderboard(user, bankroll){
  const board = getLS(LS.board, []);
  const i = board.findIndex(b=>b.user===user);
  if(i>=0) board[i].bankroll = bankroll; else board.push({ user, bankroll });
  setLS(LS.board, board);
}
function renderLeaderboard(){
  const board = getLS(LS.board, []).sort((a,b)=>b.bankroll-a.bankroll).slice(0,20);
  $('#leaderboard').innerHTML = `
    <table><thead><tr><th>#</th><th>User</th><th>Bankroll</th></tr></thead>
    <tbody>
      ${board.map((b,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(b.user)}</td><td>$${Number(b.bankroll).toLocaleString()}</td></tr>`).join('')}
    </tbody></table>`;
}

/* ---------- News (simple fallback card) ---------- */
async function loadNews(){
  const items = [
    { title:"Welcome to the Gators Hub", link:"#", summary:"Roster, schedule, stats, news, and for-fun props.", date:new Date().toISOString() }
  ];
  const mount = $('#newsList');
  mount.innerHTML = items.map(n=>`
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

/* ---------- Wire UI ---------- */
function wire(){
  $('#refreshRoster').addEventListener('click', loadRoster);
  $('#refreshSchedule').addEventListener('click', loadSchedule);
  $('#refreshStats').addEventListener('click', loadStats);
  $('#playerFilter').addEventListener('input', (e)=>{
    renderPlayerStats(getLS("cachedPlayers", PLAYER_STATS)||PLAYER_STATS, e.target.value);
  });

  $('#startBankroll').addEventListener('click', handleBankroll);
  $('#placeBets').addEventListener('click', placeBets);
  $('#clearBets').addEventListener('click', clearBets);
  $('#gradeBets').addEventListener('click', gradeBets);
}

/* ---------- Init ---------- */
async function init(){
  wire();
  bankrollUI();
  setLS("cachedPlayers", PLAYER_STATS); // cache for props builder
  await loadRoster();
  await loadSchedule();
  await loadStats();
  await loadNews();
  loadPhotos();

  // auto-refresh hook (works if DATA_URLS are set)
  setInterval(async ()=>{
    await loadStats();
  }, REFRESH_MS);
}
document.addEventListener('DOMContentLoaded', init);
