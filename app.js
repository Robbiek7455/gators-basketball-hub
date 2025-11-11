/* ======================================================
   GATORS HUB — Auto schedule & stats + headshots + banner
   - Hash routing (#/schedule etc.)
   - Player modal with SR link
   - Opponent logos scraped from UF schedule
   - CSV export, game notifications (optional)
   - Props, share, QR, image (kept)
   ====================================================== */

const REFRESH_MS = 10 * 60 * 1000; // 10 minutes
const ALO = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

const SRC = {
  srSchedule: 'https://www.sports-reference.com/cbb/schools/florida/men/2026-schedule.html',
  srRoster:   'https://www.sports-reference.com/cbb/schools/florida/men/2026.html',
  ufRoster:   'https://floridagators.com/sports/mens-basketball/roster',
  ufSchedule: 'https://floridagators.com/sports/mens-basketball/schedule',
  newsRSS:    'https://floridagators.com/rss.aspx?path=mbball'
};

/* ---------- helpers ---------- */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const escapeHtml = (s)=> (s||"").replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const fmt  = (n)=> (n===0 || n) ? Number(n).toFixed(1) : '—';
const pct  = (p)=> (p===0 || p) ? (p>1 ? (p/100).toFixed(3) : Number(p).toFixed(3)) : '—';
const pad2 = (n)=> String(n).padStart(2,'0');
const roundHalf = (n)=> Math.round(n*2)/2;
function toast(msg){ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1500); }
function toCSV(rows){ return rows.map(r=> r.map(v=> `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n'); }

/* ---------- theme ---------- */
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

/* ---------- hash routing ---------- */
function showTab(tab){
  $$('.tab').forEach(a=> a.classList.toggle('active', a.dataset.tab===tab));
  $$('.panel').forEach(p=> p.classList.toggle('active', p.id===tab));
}
function route(){
  const m = location.hash.match(/^#\/([a-z]+)/i);
  const tab = m ? m[1] : 'schedule';
  showTab(tab);
}
window.addEventListener('hashchange', route);

/* ---------- banner shuffle ---------- */
const HERO_IMAGES = [
  "https://floridagators.com/images/2025/4/7/MBB_NCAA_Title_Celebration.jpg",
  "https://floridagators.com/images/2025/3/16/MBB_SEC_Title_Confetti.jpg",
  "https://floridagators.com/images/2025/11/7/UF_MBB_Team_2025.jpg"
];
let heroIdx=0;
function setHero(i){
  const mount = $('#heroImages'); if(!mount) return;
  $$('.slide', mount).forEach((s,idx)=> s.classList.toggle('active', idx===i));
}
function startHeroShuffle(){
  const mount = $('#heroImages'); if(!mount) return;
  mount.innerHTML = HERO_IMAGES.map((src,i)=>`<div class="slide${i===0?' active':''}" style="background-image:url('${src}')"></div>`).join('');
  setInterval(()=>{ heroIdx=(heroIdx+1)%HERO_IMAGES.length; setHero(heroIdx); }, 4000);
  $('#heroPrev')?.addEventListener('click', ()=>{ heroIdx=(heroIdx-1+HERO_IMAGES.length)%HERO_IMAGES.length; setHero(heroIdx); });
  $('#heroNext')?.addEventListener('click', ()=>{ heroIdx=(heroIdx+1)%HERO_IMAGES.length; setHero(heroIdx); });
}

/* ---------- fetch HTML via AllOrigins ---------- */
async function fetchHTML(url){
  const r = await fetch(ALO(url)); if(!r.ok) throw new Error('fetch failed ' + url);
  const text = await r.text(); const doc = new DOMParser().parseFromString(text, 'text/html'); return doc;
}

/* ---------- schedule (Sports-Reference; UF fallback; + logos) ---------- */
let SCHEDULE=[], OPP_LOGOS=new Map();
async function loadOpponentLogosFromUF(){
  try{
    const doc = await fetchHTML(SRC.ufSchedule);
    const cards = Array.from(doc.querySelectorAll('img')).filter(i=>/logo/i.test(i.alt||''));
    cards.forEach(img=>{
      const name = (img.alt||'').replace(/ logo/i,'').trim();
      if(name) OPP_LOGOS.set(name.toLowerCase(), img.src);
    });
  }catch{}
}
async function loadScheduleAuto(){
  try{
    const doc = await fetchHTML(SRC.srSchedule);
    const table = doc.querySelector('#schedule');
    const rows = Array.from(table?.querySelectorAll('tbody tr')||[]).filter(tr=> !tr.classList.contains('thead'));
    SCHEDULE = rows.map(tr=>{
      const dateTxt = tr.querySelector('th[data-stat="date_game"]')?.textContent?.trim()||'';
      const oppA = tr.querySelector('td[data-stat="opp_name"] a');
      const opp = oppA?.textContent?.trim() || tr.querySelector('td[data-stat="opp_name"]')?.textContent?.trim()||'';
      const siteCode = tr.querySelector('td[data-stat="game_location"]')?.textContent?.trim()||'';
      const at = siteCode==='@'?'Away':siteCode==='N'?'Neutral':'Home';
      const time = tr.querySelector('td[data-stat="time"]')?.textContent?.trim()||'TBA';
      const box = tr.querySelector('td[data-stat="box_score_text"] a')?.href || '';
      const result = tr.querySelector('td[data-stat="game_result"]')?.textContent?.trim()||'';
      const notes = tr.querySelector('td[data-stat="notes"]')?.textContent?.trim()||'';
      return { date: dateTxt, day:'', time, opponent: opp, at, location: notes, result, box };
    }).filter(g=> g.opponent);
  }catch{
    SCHEDULE = [];
  }
  renderSchedule(); renderCountdown(); fillTicketGames();
}

/* ---------- roster headshots (UF) & stats (Sports-Reference) ---------- */
let UF_HEADSHOTS = new Map();
async function loadUFHeadshots(){
  try{
    const doc = await fetchHTML(SRC.ufRoster);
    const imgs = Array.from(doc.querySelectorAll('img')).filter(i=>/roster|headshot|player/i.test(i.src));
    imgs.forEach(img=>{
      const name = (img.alt||'').replace(/\s+-.*$/,'').trim();
      if(name) UF_HEADSHOTS.set(name.toLowerCase(), img.src);
    });
  }catch{}
}

let TEAM={}, PLAYERS=[];
async function loadStatsAuto(){
  const doc = await fetchHTML(SRC.srRoster);
  const perGame = doc.querySelector('#per_game');
  const rows = Array.from(perGame?.querySelectorAll('tbody tr')||[]).filter(tr=> !tr.classList.contains('thead'));
  PLAYERS = rows.map(tr=>{
    const get = (stat)=> tr.querySelector(`[data-stat="${stat}"]`)?.textContent?.trim()||'';
    const nameCell = tr.querySelector('[data-stat="player"]');
    const link = nameCell?.querySelector('a')?.href || '';
    const name = nameCell?.textContent?.trim() || '';
    return {
      name, link,
      gp: +get('g')||null,
      mpg: +get('mp_per_g')||null,
      ppg: +get('pts_per_g')||null,
      rpg: +get('trb_per_g')||null,
      apg: +get('ast_per_g')||null,
      spg: +get('stl_per_g')||null,
      bpg: +get('blk_per_g')||null,
      tpg: +get('tov_per_g')||null,
      fgPct: +(get('fg_pct')||0),
      threePct: +(get('fg3_pct')||0),
      ftPct: +(get('ft_pct')||0)
    };
  }).filter(p=>p.name);
  const n = PLAYERS.length || 1;
  const sum = (k)=> PLAYERS.reduce((a,b)=> a + (b[k]||0), 0);
  TEAM = {
    gp: Math.max(...PLAYERS.map(p=>p.gp||0)) || '—',
    pts: +(sum('ppg')).toFixed(1),
    reb: +(sum('rpg')).toFixed(1),
    ast: +(sum('apg')).toFixed(1),
    stl: +(sum('spg')).toFixed(1),
    blk: +(sum('bpg')).toFixed(1),
    tov: +(sum('tpg')).toFixed(1),
    fgPct: +(PLAYERS.reduce((a,b)=>a+(b.fgPct||0),0)/n).toFixed(3),
    threePct: +(PLAYERS.reduce((a,b)=>a+(b.threePct||0),0)/n).toFixed(3),
    ftPct: +(PLAYERS.reduce((a,b)=>a+(b.ftPct||0),0)/n).toFixed(3)
  };
  renderTeamStats(); renderPlayerStats(); fillCompareOptions(); renderPropsTable();
}

/* ---------- schedule render ---------- */
function gameKey(g){ return `${g.date}|${g.time}|${g.opponent}`; }
function logoFor(opp){
  const k = (opp||'').toLowerCase();
  return OPP_LOGOS.get(k) || '';
}
function renderSchedule(){
  const filter = $('#schedFilter')?.value || 'ALL';
  const rows = SCHEDULE.filter(g=> filter==='ALL' ? true : g.at===filter);
  const mount = $('#scheduleWrap'); if(!mount) return;

  mount.innerHTML = `
    <table id="scheduleTable">
      <thead><tr>
        <th>Date</th><th>Time (ET)</th><th>Opponent</th><th>H/A/N</th><th>Location / Event</th><th>Result</th><th>Box</th><th>Add</th>
      </tr></thead>
      <tbody>
        ${rows.map(g=>{
          const box = g.box ? `<a class="boxlink" href="${g.box}" target="_blank" rel="noopener" title="Box score">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 3v2h3.59L7 15.59 8.41 17 19 6.41V10h2V3z"/><path d="M5 19h14v2H5z"/></svg>
          </a>` : "";
          const logo = logoFor(g.opponent);
          return `<tr>
            <td>${g.date}${g.day?` (${g.day})`:''}</td>
            <td>${g.time||'TBA'}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                ${logo? `<img loading="lazy" src="${logo}" alt="" width="20" height="20" style="border-radius:4px">` : ""}
                <span class="opplink" data-opp="${escapeHtml(g.opponent)}"><strong>${escapeHtml(g.opponent)}</strong></span>
              </div>
            </td>
            <td>${g.at}</td>
            <td>${escapeHtml(g.location||'')}</td>
            <td>${escapeHtml(g.result||'')}</td>
            <td>${box}</td>
            <td><button class="btn ghost addCal" data-game='${escapeHtml(JSON.stringify(g))}'>.ics</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  $$('.addCal').forEach(b=> b.addEventListener('click', ()=> downloadICS(JSON.parse(b.dataset.game))));
  $$('.opplink').forEach(el => el.addEventListener('click', ()=> openOpponent(el.dataset.opp)));
}
$('#schedFilter')?.addEventListener('change', renderSchedule);
$('#refreshSchedule')?.addEventListener('click', async ()=>{ await Promise.all([loadScheduleAuto(), loadOpponentLogosFromUF()]); renderSchedule(); });

/* CSV export for schedule */
$('#exportScheduleCsv')?.addEventListener('click', ()=>{
  const rows = [["Date","Time","Opponent","H/A/N","Location","Result","Box"]];
  SCHEDULE.forEach(g=> rows.push([g.date,g.time,g.opponent,g.at,g.location||"",g.result||"",g.box||""]));
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([toCSV(rows)],{type:"text/csv"}));
  a.download="gators_schedule.csv"; a.click();
});

function downloadICS(g){
  const dt = new Date(`${g.date} ${g.time||'12:00 PM'} ET`);
  const end = new Date(dt.getTime() + 2*60*60*1000);
  const toICS = (d)=> d.getUTCFullYear()+pad2(d.getUTCMonth()+1)+pad2(d.getUTCDate())+'T'+pad2(d.getUTCHours())+pad2(d.getUTCMinutes())+pad2(d.getUTCSeconds())+'Z';
  const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Gators Hub//EN","BEGIN:VEVENT",
    `UID:${Date.now()}@gatorshub`,`DTSTAMP:${toICS(new Date())}`,
    `DTSTART:${toICS(dt)}`,`DTEND:${toICS(end)}`,
    `SUMMARY:Florida vs ${g.opponent}`,`LOCATION:${g.location||''}`,
    "END:VEVENT","END:VCALENDAR"].join("\r\n");
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics],{type:"text/calendar"})); a.download = `UF_vs_${g.opponent.replace(/\s+/g,'_')}.ics`; a.click();
}

/* ---------- countdown ---------- */
function renderCountdown(){
  const el = $('#nextGame'); if(!el || !SCHEDULE.length) return;
  const upcoming = SCHEDULE.map(g=> ({...g, t: Date.parse(`${g.date} ${g.time||'12:00 PM'} ET`) }))
                           .filter(g=> !isNaN(g.t) && g.t > Date.now())
                           .sort((a,b)=>a.t-b.t)[0];
  if(!upcoming){ el.textContent = "Next game: TBA"; return; }
  (function tick(){
    const diff = upcoming.t - Date.now();
    if(diff<=0){ el.textContent = `Gameday: vs ${upcoming.opponent}!`; return; }
    const h = Math.floor(diff/3.6e6), m=Math.floor((diff%3.6e6)/6e4), s=Math.floor((diff%6e4)/1e3);
    el.textContent = `Next game vs ${upcoming.opponent}: ${h}h ${m}m ${s}s`;
    requestAnimationFrame(()=> setTimeout(tick, 500));
  })();
}

/* ---------- roster/players ---------- */
function headshotFor(name){
  const key = (name||'').toLowerCase();
  return UF_HEADSHOTS.get(key) || `https://source.boringavatars.com/beam/96/${encodeURIComponent(name||'Gator')}`;
}
function renderRoster(){
  const q = ($('#rosterFilter')?.value||"").toLowerCase();
  const favOnly = $('#favOnly')?.checked;
  const favs = getFavs();

  const list = PLAYERS.map(p=>({name:p.name, pos:'', no:'—'}));
  let rows = list;
  if(q) rows = rows.filter(p=> (p.name + p.pos).toLowerCase().includes(q));
  if(favOnly) rows = rows.filter(p=> favs.includes(p.name));

  const grid = $('#rosterGrid'); if(!grid) return;
  grid.innerHTML = rows.map(p=>{
    const starred = favs.includes(p.name);
    const img = headshotFor(p.name);
    return `<div class="card player" data-player="${escapeHtml(p.name)}">
      <div style="display:flex;gap:12px;align-items:center;">
        <img loading="lazy" src="${img}" alt="${escapeHtml(p.name)} headshot" width="64" height="64" style="border-radius:12px;object-fit:cover" />
        <div>
          <div><strong>${escapeHtml(p.name)}</strong> <span class="meta">${p.pos||''}</span></div>
          <div class="meta">PPG ${fmt((PLAYERS.find(x=>x.name===p.name)||{}).ppg)}</div>
        </div>
        <button class="btn ghost" style="margin-left:auto" data-fav="${escapeHtml(p.name)}">${starred?'⭐':'☆'}</button>
      </div>
    </div>`;
  }).join('');

  $$('#rosterGrid [data-fav]').forEach(b=> b.addEventListener('click', (e)=>{
    e.stopPropagation();
    toggleFavorite(b.dataset.fav); renderRoster();
  }));
  $$('#rosterGrid .player').forEach(card=>{
    card.addEventListener('click', ()=>{
      const name = card.dataset.player;
      const p = PLAYERS.find(x=>x.name===name);
      openPlayerModal(p);
    });
  });
}
function openPlayerModal(p){
  const modal=$('#scoutModal'), box=$('#scoutContent');
  if(!p){ box.innerHTML = `<p class="muted">No data.</p>`; modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); return; }
  box.innerHTML = `
    <h3 style="margin-top:0">${escapeHtml(p.name)}</h3>
    <p class="meta"><a href="${p.link}" target="_blank" rel="noopener">Sports-Reference profile ↗</a></p>
    <table><tbody>
      <tr><td>GP</td><td>${p.gp??'—'}</td></tr>
      <tr><td>MPG</td><td>${fmt(p.mpg)}</td></tr>
      <tr><td>PPG</td><td>${fmt(p.ppg)}</td></tr>
      <tr><td>RPG</td><td>${fmt(p.rpg)}</td></tr>
      <tr><td>APG</td><td>${fmt(p.apg)}</td></tr>
      <tr><td>SPG</td><td>${fmt(p.spg)}</td></tr>
      <tr><td>BPG</td><td>${fmt(p.bpg)}</td></tr>
      <tr><td>TOV</td><td>${fmt(p.tpg)}</td></tr>
      <tr><td>FG%</td><td>${pct(p.fgPct)}</td></tr>
      <tr><td>3P%</td><td>${pct(p.threePct)}</td></tr>
      <tr><td>FT%</td><td>${pct(p.ftPct)}</td></tr>
    </tbody></table>
  `;
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
}
$('#rosterFilter')?.addEventListener('input', renderRoster);
$('#favOnly')?.addEventListener('change', renderRoster);
$('#refreshRoster')?.addEventListener('click', async ()=>{ await loadUFHeadshots(); renderRoster(); });

function getFavs(){ try{ return JSON.parse(localStorage.getItem('ghub_favs'))||[] }catch{ return [] } }
function setFavs(v){ localStorage.setItem('ghub_favs', JSON.stringify(v)); }
function toggleFavorite(name){ const favs=getFavs(); const i=favs.indexOf(name); if(i>=0) favs.splice(i,1); else favs.push(name); setFavs(favs); }

/* ---------- team & player stats (render + CSV) ---------- */
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
  const q = ($('#playerFilter')?.value||"").toLowerCase();
  let rows = PLAYERS.slice();
  if(q) rows = rows.filter(p=> p.name.toLowerCase().includes(q));
  rows.sort((a,b)=> (b.ppg||0)-(a.ppg||0));
  $('#playerStats').innerHTML = `
    <table id="playersTable"><thead><tr>
      <th>Player</th><th>GP</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th>
    </tr></thead><tbody>
      ${rows.map(p=>`
        <tr class="plink" data-player="${escapeHtml(p.name)}">
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
  $$('#playersTable .plink').forEach(tr=>{
    tr.addEventListener('click', ()=>{
      const name = tr.dataset.player; const p = PLAYERS.find(x=>x.name===name); openPlayerModal(p);
    });
  });
}
$('#playerFilter')?.addEventListener('input', renderPlayerStats);
$('#refreshStats')?.addEventListener('click', loadStatsAuto);

/* CSV export for players */
$('#exportPlayersCsv')?.addEventListener('click', ()=>{
  const rows = [["Player","GP","MPG","PPG","RPG","APG","SPG","BPG","TOV","FG%","3P%","FT%","SR_Link"]];
  PLAYERS.forEach(p=> rows.push([p.name,p.gp,p.mpg,p.ppg,p.rpg,p.apg,p.spg,p.bpg,p.tpg,p.fgPct,p.threePct,p.ftPct,p.link||""]));
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([toCSV(rows)],{type:"text/csv"}));
  a.download="gators_players.csv"; a.click();
});

/* ---------- Compare ---------- */
function fillCompareOptions(){
  const A = $('#cmpA'), B=$('#cmpB'); if(!A||!B) return; A.innerHTML=""; B.innerHTML="";
  PLAYERS.forEach(p=>{
    const o1 = document.createElement('option'); o1.value=o1.textContent=p.name; A.appendChild(o1);
    const o2 = document.createElement('option'); o2.value=o2.textContent=p.name; B.appendChild(o2);
  });
  if(PLAYERS[0]) A.value=PLAYERS[0].name;
  if(PLAYERS[1]) B.value=PLAYERS[1].name;
}
function drawCompare(){
  const a = PLAYERS.find(p=>p.name===$('#cmpA')?.value);
  const b = PLAYERS.find(p=>p.name===$('#cmpB')?.value);
  if(!a || !b) return;
  const metrics=["ppg","rpg","apg","spg","bpg","tpg"];
  const maxes = { ppg:30, rpg:15, apg:8, spg:3, bpg:3, tpg:5 };
  const w=800, h=320, pad=40, col=(w-2*pad)/metrics.length;
  const bar = (val, max)=> Math.max(2, (val/max)*(h-2*pad));
  const svg = [`<svg viewBox="0 0 ${w} ${h}" width="100%" height="320">`,`<g font-size="12" fill="currentColor">`];
  metrics.forEach((m,i)=>{
    const x = pad + i*col + col/2;
    svg.push(`<text x="${x}" y="${h-pad+18}" text-anchor="middle">${m.toUpperCase()}</text>`);
    svg.push(`<rect x="${x-22}" y="${h-pad-bar(a[m]||0,maxes[m])}" width="16" height="${bar(a[m]||0,maxes[m])}" rx="4" fill="#0021A5"></rect>`);
    svg.push(`<rect x="${x+6}"  y="${h-pad-bar(b[m]||0,maxes[m])}" width="16" height="${bar(b[m]||0,maxes[m])}" rx="4" fill="#FA4616"></rect>`);
  });
  svg.push(`</g><g font-size="14" fill="currentColor">
              <text x="${pad}" y="${pad-8}"><tspan fill="#0021A5">●</tspan> ${escapeHtml(a.name)}</text>
              <text x="${pad+200}" y="${pad-8}"><tspan fill="#FA4616">●</tspan> ${escapeHtml(b.name)}</text>
            </g></svg>`);
  $('#compareWrap').innerHTML = svg.join('');
}
$('#drawCompare')?.addEventListener('click', drawCompare);

/* ---------- Props (same as before) ---------- */
const LS = { bankroll:"ghub_bankroll", username:"ghub_username", openBets:"ghub_openBets", history:"ghub_betHistory", board:"ghub_leaderboard" };
const getLS = (k,d)=> { try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch{ return d } };
const setLS = (k,v)=> localStorage.setItem(k, JSON.stringify(v));
function decimalFromAmerican(odds){ const o=Number(odds); return o<0 ? (100/-o)+1 : (o/100)+1; }
function defaultLines(){ return (PLAYERS||[]).map(p=>({ player:p.name, pts:roundHalf(p.ppg||0), reb:roundHalf(p.rpg||0), ast:roundHalf(p.apg||0), pra:roundHalf((p.ppg||0)+(p.rpg||0)+(p.apg||0)) })); }
function bankrollUI(){ $('#bankroll').textContent = `$${Number(getLS(LS.bankroll,0)).toLocaleString()}`; $('#usernameInput').value = getLS(LS.username,"") || ""; }
function upsertLeaderboard(user,bankroll){ const board=getLS(LS.board,[]); const i=board.findIndex(b=>b.user===user); if(i>=0)board[i].bankroll=bankroll; else board.push({user,bankroll,updated:Date.now()}); setLS(LS.board,board); renderLeaderboard(); }
function renderLeaderboard(){ const board=getLS(LS.board,[]).sort((a,b)=>b.bankroll-a.bankroll); $('#leaderboard').innerHTML = `<table><thead><tr><th>#</th><th>User</th><th>Bankroll</th><th>Updated</th></tr></thead><tbody>${board.map((b,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(b.user)}</td><td>$${Number(b.bankroll).toLocaleString()}</td><td>${new Date(b.updated||Date.now()).toLocaleString()}</td></tr>`).join('')}</tbody></table>`; }
function fillTicketGames(){ const sel=$('#ticketGame'); if(!sel) return; const opts=SCHEDULE.map(g=>({id:gameKey(g), label:`${g.date} – ${g.opponent} (${g.at})`})); sel.innerHTML = `<option value="">(None)</option>` + opts.map(o=> `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`).join(''); }
function renderPropsTable(){
  const lines = defaultLines();
  $('#propsTable').innerHTML = `<table><thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th><th>P+R+A</th><th>Pick</th><th>Add</th></tr></thead><tbody>${
    lines.map(l=>`<tr><td><strong>${escapeHtml(l.player)}</strong></td><td>${l.pts}</td><td>${l.reb}</td><td>${l.ast}</td><td>${l.pra}</td>
    <td><select data-player="${escapeHtml(l.player)}" class="pick"><option value="PTS_O">PTS Over</option><option value="PTS_U">PTS Under</option><option value="REB_O">REB Over</option><option value="REB_U">REB Under</option><option value="AST_O">AST Over</option><option value="AST_U">AST Under</option><option value="PRA_O">PRA Over</option><option value="PRA_U">PRA Under</option></select></td>
    <td><button class="btn addBet" data-player="${escapeHtml(l.player)}">Add</button></td></tr>`).join('')
  }</tbody></table>`;
  $$('.addBet').forEach(b=> b.addEventListener('click', ()=>{ const player=b.dataset.player; const sel=b.closest('tr').querySelector('.pick').value; const slip=getLS(LS.openBets,[]); slip.push({player, market:sel, odds:-110}); setLS(LS.openBets, slip); renderBetSlip(); toast("Added to slip"); }));
}
function renderBetSlip(){ const slip=getLS(LS.openBets,[]); $('#betList').innerHTML = slip.length? slip.map((b,i)=> `<div class="card"><div><strong>${escapeHtml(b.player)}</strong> — ${b.market.replace('_',' ')} <span class="badge">@${b.odds}</span></div><div class="meta">Slip item #${i+1}</div></div>`).join('') : `<p class="muted tiny">No selections yet.</p>`; }
function handleBankroll(){ const user=$('#usernameInput').value.trim()||"Guest"; setLS(LS.username,user); setLS(LS.bankroll,1000); upsertLeaderboard(user,1000); bankrollUI(); toast("Bankroll set to $1,000"); }
function resetBankroll(){ setLS(LS.bankroll,0); bankrollUI(); toast("Bankroll reset"); }
function placeBets(){
  const wager = Math.max(1, Number($('#wagerInput')?.value||0));
  const bank = getLS(LS.bankroll, 0); const slip = getLS(LS.openBets, []);
  const gameId = $('#ticketGame')?.value || "";
  if(!slip.length) return toast("Add picks first."); if(bank<wager) return toast("Not enough bankroll.");
  const hist = getLS(LS.history, []); hist.push({ placedAt: Date.now(), wager, gameId, bets: slip, status:"pending" });
  setLS(LS.history, hist); setLS(LS.openBets, []); setLS(LS.bankroll, bank - wager);
  renderBetSlip(); bankrollUI(); renderHistory(); toast("Bets placed!");
}
function gradeBets(){
  const hist = getLS(LS.history, []); const pending = hist.filter(h=>h.status==="pending"); if(!pending.length) return toast("No pending bets.");
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
    ticket.status="graded"; ticket.payout = allWin ? Math.round(ticket.wager * Math.pow(dec, legs)) : 0; delta += ticket.payout;
  });
  const bank = getLS(LS.bankroll,0); const user = getLS(LS.username,"Guest");
  setLS(LS.bankroll, bank + delta); setLS(LS.history, hist); upsertLeaderboard(user, getLS(LS.bankroll,0));
  bankrollUI(); renderHistory(); toast(`Graded! Net: $${delta}`);
}

/* share/QR/image */
function shareSlip(){ const slip=getLS(LS.openBets, []); if(!slip.length) return toast("Slip is empty."); const payload=btoa(unescape(encodeURIComponent(JSON.stringify(slip)))); const url=location.origin+location.pathname+'#slip='+payload; navigator.clipboard?.writeText(url); toast("Share link copied!"); }
function importSlipFromHash(){ const m=location.hash.match(/#slip=([^&]+)/); if(!m) return; try{ const slip=JSON.parse(decodeURIComponent(escape(atob(m[1])))); setLS(LS.openBets, slip); renderBetSlip(); toast("Loaded shared slip"); }catch{} }
function qrSlip(){ const slip=getLS(LS.openBets, []); if(!slip.length) return toast("Slip is empty."); const payload=btoa(unescape(encodeURIComponent(JSON.stringify(slip)))); const url=location.origin+location.pathname+'#slip='+payload; const qr=`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`; const modal=$('#scoutModal'), box=$('#scoutContent'); box.innerHTML=`<h3>Share Slip (QR)</h3><img src="${qr}" width="220" height="220" alt="QR code" />`; modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); }
function imgSlip(){ const slip=getLS(LS.openBets, []); if(!slip.length) return toast("Slip is empty."); const w=700,lineH=28,pad=20,h=pad*2+lineH*(slip.length+5); const c=document.createElement('canvas'); c.width=w;c.height=h;const ctx=c.getContext('2d'); ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);ctx.fillStyle='#0021A5';ctx.fillRect(0,0,w,50);ctx.fillStyle='#ffffff';ctx.font='bold 18px Arial';ctx.fillText('Florida Gators — Bet Slip (Mock)',18,32);ctx.fillStyle='#0f172a';ctx.font='16px Arial';ctx.fillText(`User: ${getLS(LS.username,"Guest")}    Wager: $${Number($('#wagerInput')?.value||0)}`,18,80); let y=110; slip.forEach((b,i)=>{ ctx.fillText(`${i+1}. ${b.player} — ${b.market.replace('_',' ')}  @${b.odds}`,18,y); y+=lineH; }); ctx.fillStyle='#475569';ctx.font='12px Arial';ctx.fillText('For entertainment only • Lines from per-game averages',18,h-20); c.toBlob(blob=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gators-slip.png'; a.click(); }); }

/* history w/ box link */
function renderHistory(){
  const hist = getLS(LS.history, []);
  const map = new Map(SCHEDULE.map(g=> [gameKey(g), g]));
  $('#historyWrap').innerHTML = `<table><thead><tr><th>Placed</th><th>Game</th><th>Wager</th><th>Status</th><th>Payout</th><th>Picks</th></tr></thead><tbody>${
    hist.slice().reverse().map(t=>{
      const g = t.gameId ? map.get(t.gameId) : null;
      const gameTxt = g ? `${g.date} vs ${g.opponent} ${g.result?`(${g.result})`:''} ${g.box?` • <a class="boxlink" href="${g.box}" target="_blank" rel="noopener">box ↗</a>`:''}` : '—';
      return `<tr><td>${new Date(t.placedAt).toLocaleString()}</td><td>${gameTxt}</td><td>$${Number(t.wager).toLocaleString()}</td><td>${escapeHtml(t.status||'pending')}</td><td>${t.payout?('$'+Number(t.payout).toLocaleString()):'—'}</td><td>${t.bets.map(b=>`${escapeHtml(b.player)} (${b.market.replace('_',' ')}) ${b.result?`<span class="badge">${b.result}</span>`:''}`).join('<br/>')}</td></tr>`;
    }).join('')
  }</tbody></table>`;
}
$('#exportHistory')?.addEventListener('click', ()=>{ const hist=getLS(LS.history, []); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(hist,null,2)],{type:"application/json"})); a.download='bet_history.json'; a.click(); });
$('#importHistory')?.addEventListener('change', async (e)=>{ const f=e.target.files?.[0]; if(!f) return; const text=await f.text(); setLS(LS.history, JSON.parse(text)); renderHistory(); toast("History imported"); });
$('#clearHistory')?.addEventListener('click', ()=>{ setLS(LS.history, []); renderHistory(); toast("History cleared"); });

$('#exportLeaderboard')?.addEventListener('click', ()=>{ const board=getLS(LS.board, []); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(board,null,2)],{type:"application/json"})); a.download="leaderboard.json"; a.click(); });
$('#importLeaderboard')?.addEventListener('change', async (e)=>{ const f=e.target.files?.[0]; if(!f) return; const text=await f.text(); setLS(LS.board, JSON.parse(text)); renderLeaderboard(); toast("Leaderboard imported"); });

$('#shareSlip')?.addEventListener('click', shareSlip);
$('#qrSlip')?.addEventListener('click', qrSlip);
$('#imgSlip')?.addEventListener('click', imgSlip);
$('#usernameInput')?.addEventListener('blur', ()=>{ const u=$('#usernameInput').value.trim(); if(u) localStorage.setItem(LS.username, JSON.stringify(u)); });
$('#startBankroll')?.addEventListener('click', handleBankroll);
$('#resetBankroll')?.addEventListener('click', resetBankroll);
$('#placeBets')?.addEventListener('click', placeBets);
$('#clearBets')?.addEventListener('click', ()=>{ setLS(LS.openBets,[]); renderBetSlip(); toast("Slip cleared"); });
$('#gradeBets')?.addEventListener('click', gradeBets);

/* ---------- news ---------- */
async function loadNews(){
  try{
    const res = await fetch(ALO(SRC.newsRSS));
    const xml = await res.text();
    const items = parseBasicRSS(xml).slice(0,12);
    renderNews(items);
  }catch(e){
    renderNews([{ title:"Welcome to the Gators Hub", link:"#", summary:"Auto schedule, stats, roster photos, news, props (for fun).", date:new Date().toISOString() }]);
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

/* ---------- modal (player/opponent/QR) ---------- */
function openOpponent(name){ const modal=$('#scoutModal'), content=$('#scoutContent'); content.innerHTML=`<h3>${escapeHtml(name)}</h3><p class="muted">Scouting card coming soon.</p>`; modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); }
$('#closeScout')?.addEventListener('click', ()=>{ const modal=$('#scoutModal'); modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); });
$('#scoutModal')?.addEventListener('click', (e)=>{ if(e.target.classList.contains('modal-bg')) $('#closeScout').click(); });

/* ---------- notifications (optional) ---------- */
async function enableGameReminder(){
  try{
    const perm = await Notification.requestPermission();
    if(perm!=='granted'){ toast('Notifications not allowed'); return; }
    localStorage.setItem('ghub_notify', '1'); toast('Game reminders enabled');
    scheduleNextGameReminder();
  }catch{ toast('Could not enable notifications'); }
}
$('#enableGameReminder')?.addEventListener('click', enableGameReminder);
function scheduleNextGameReminder(){
  if(!('Notification' in window) || localStorage.getItem('ghub_notify')!=='1') return;
  const next = SCHEDULE.map(g=> ({...g, t: Date.parse(`${g.date} ${g.time||'12:00 PM'} ET`) }))
                      .filter(g=> !isNaN(g.t) && g.t > Date.now())
                      .sort((a,b)=>a.t-b.t)[0];
  if(!next) return;
  const fireAt = next.t - 30*60*1000; // 30 min before
  const wait = Math.max(0, fireAt - Date.now());
  setTimeout(()=> new Notification(`Gators tip in 30m vs ${next.opponent}`), wait);
}

/* ---------- keyboard shortcuts ---------- */
document.addEventListener('keydown', (e)=>{
  if(e.key === '/' && $('#playerFilter')){ e.preventDefault(); $('#playerFilter').focus(); }
  if(e.key.toLowerCase() === 't'){ const now=(localStorage.getItem('ghub_theme')||'light')==='light'?'dark':'light'; localStorage.setItem('ghub_theme', now); applyTheme(); }
  if(e.key.toLowerCase() === 'g'){ location.hash = '#/schedule'; }
});

/* ---------- photos grid ---------- */
const PHOTOS = [
  { src:"https://floridagators.com/images/2025/4/7/MBB_NCAA_Title_Celebration.jpg", alt:"NCAA Championship celebration 2025", href:"https://floridagators.com/galleries" },
  { src:"https://floridagators.com/images/2025/3/16/MBB_SEC_Title_Confetti.jpg", alt:"SEC champions 2025", href:"https://floridagators.com/galleries" },
  { src:"https://floridagators.com/images/2025/11/7/UF_MBB_Team_2025.jpg", alt:"2025–26 team", href:"https://floridagators.com/galleries" }
];
function loadPhotos(){
  $('#photoGrid').innerHTML = PHOTOS.map(p=>`
    <a class="card" href="${p.href}" target="_blank" rel="noopener">
      <img loading="lazy" src="${p.src}" alt="${escapeHtml(p.alt)}" />
      <div class="meta">${escapeHtml(p.alt)}</div>
    </a>`).join('');
}

/* ---------- init ---------- */
async function init(){
  route(); // hash → tab
  startHeroShuffle();
  loadPhotos(); loadNews();

  // Data pulls
  await Promise.all([ loadOpponentLogosFromUF(), loadUFHeadshots(), loadScheduleAuto(), loadStatsAuto() ]);

  // Render dependent views
  renderSchedule(); renderCountdown(); fillTicketGames();
  renderRoster(); renderPropsTable(); renderBetSlip(); bankrollUI(); renderLeaderboard(); renderHistory(); fillCompareOptions(); drawCompare(); importSlipFromHash();

  // Re-refresh periodically
  setInterval(async ()=>{ await Promise.all([loadScheduleAuto(), loadStatsAuto(), loadOpponentLogosFromUF()]); renderSchedule(); renderPlayerStats(); renderTeamStats(); }, REFRESH_MS);

  // Schedule notification if enabled
  scheduleNextGameReminder();
}
document.addEventListener('DOMContentLoaded', init);
