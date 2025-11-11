/* =========================================================
   GATORS HUB — ESPN JSON (CORS-friendly) + SR deep links
   - Roster, schedule & stats from ESPN public endpoints
   - NO roster fallbacks; UI shows message if empty
   - “Analytics” tab from per-game box scores (ORtg, eFG%, Pace)
   ========================================================= */

const CURRENT_SEASON = 2026;
const SEASONS = [2026, 2025, 2024, 2023];
const REFRESH_MS = 10 * 60 * 1000; // auto refresh

/* ESPN team id for Florida */
const TEAM_ID = 57;
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

/* Helpers */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const esc = (s)=> (s||"").replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const fmt1=(n)=> (n===0||n)?Number(n).toFixed(1):'—';
const pct3=(p)=> (p===0||p)?Number(p).toFixed(3):'—';
const pad2=(n)=>String(n).padStart(2,'0');
function toast(msg){ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1600); }
function applyTheme(){ const saved=localStorage.getItem('ghub_theme')||'light'; document.documentElement.classList.toggle('dark', saved==='dark'); $('#themeToggle').textContent=saved==='dark'?'☀️':'🌙'; }
$('#themeToggle')?.addEventListener('click', ()=>{ const now=(localStorage.getItem('ghub_theme')||'light')==='light'?'dark':'light'; localStorage.setItem('ghub_theme',now); applyTheme(); });
applyTheme();

/* Routing */
function showTab(tab){ $$('.tab').forEach(a=> a.classList.toggle('active', a.dataset.tab===tab)); $$('.panel').forEach(p=> p.classList.toggle('active', p.id===tab)); }
function route(){ const m = location.hash.match(/^#\/([a-z]+)/i); showTab(m ? m[1] : 'schedule'); }
window.addEventListener('hashchange', route);

/* Hero */
const HERO_IMAGES = [
  "https://upload.wikimedia.org/wikipedia/commons/2/28/Exactech_Arena_at_the_Stephen_C._O%27Connell_Center_court_2016.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/8/86/Florida_Gators_basketball_2006_crowd.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/0/0e/Billy_Donovan_2008.jpg"
];
let heroIdx=0;
function renderHeroSlides(){ const mount=$('#heroImages'); if(!mount) return; mount.innerHTML=HERO_IMAGES.map((src,i)=>`<div class="slide${i===0?' active':''}" style="background-image:url('${src}')"></div>`).join(''); }
function setHero(i){ const mount=$('#heroImages'); if(!mount) return; $$('.slide', mount).forEach((s,idx)=> s.classList.toggle('active', idx===i)); }
function startHero(){ renderHeroSlides(); setInterval(()=>{ heroIdx=(heroIdx+1)%HERO_IMAGES.length; setHero(heroIdx); }, 4000);
  $('#heroPrev')?.addEventListener('click', ()=>{ heroIdx=(heroIdx-1+HERO_IMAGES.length)%HERO_IMAGES.length; setHero(heroIdx); });
  $('#heroNext')?.addEventListener('click', ()=>{ heroIdx=(heroIdx+1)%HERO_IMAGES.length; setHero(heroIdx); });
}

/* State */
let STATE = { season: CURRENT_SEASON, schedule: [], roster: [], stats: { team:{}, players:[] }, analytics: [] };

/* Season selectors */
function fillSeasonSelects(){
  const opts = SEASONS.map(y=> `<option value="${y}" ${y===STATE.season?'selected':''}>${y-1}-${String(y).slice(-2)}</option>`).join('');
  $('#seasonSelect').innerHTML = opts; $('#statsSeason').innerHTML = opts; $('#rosterSeason').innerHTML = opts;
}
['seasonSelect','statsSeason','rosterSeason'].forEach(id=>{
  document.addEventListener('change', (e)=>{ if(e.target && e.target.id===id){ STATE.season = Number(e.target.value); refreshAll(); }});
});

/* ========= ESPN fetchers ========= */
async function espnTeam(){
  const url = `${ESPN_BASE}/teams/${TEAM_ID}?enable=roster,statistics,record`;
  const res = await fetch(url); if(!res.ok) throw new Error('team '+res.status);
  return res.json();
}
async function espnSchedule(season, seasontype){
  const url = `${ESPN_BASE}/teams/${TEAM_ID}/schedule?season=${season}&seasontype=${seasontype}`;
  const res = await fetch(url); if(!res.ok) throw new Error('schedule '+res.status);
  return res.json();
}
async function espnSummary(eventId){
  const url = `${ESPN_BASE}/summary?event=${eventId}`;
  const res = await fetch(url); if(!res.ok) throw new Error('summary '+res.status);
  return res.json();
}

/* ========= Loaders ========= */
async function loadRosterAndStats(){
  const data = await espnTeam(); // players + team stats
  // roster
  const athletes = (data?.team?.athletes || []).flatMap(g=> g.items || []);
  STATE.roster = athletes.map(a=>({
    id:a.id, name:a.displayName, pos:a.position?.abbreviation||"", class:a.class||"", height:a.height, weight:a.weight,
    headshot: a.headshot?.href||a.flag?.href||`https://source.boringavatars.com/beam/96/${encodeURIComponent(a.displayName)}`,
    number:a.jersey, hometown:a.homeTown
  }));
  // team & player stats (season totals and per game)
  const cats = data?.team?.team?.statistics || data?.team?.statistics || {};
  const teamStats = (cats?.splits?.categories||[]).reduce((acc,c)=>{ (c.stats||[]).forEach(s=> acc[s.name]=+s.value||0 ); return acc; }, {});
  const players = (data?.team?.athletes || []).flatMap(g=> (g.items||[]).map(a=>{
    const pcat = (a.statistics?.splits?.categories||[]).reduce((acc,c)=>{ (c.stats||[]).forEach(s=> acc[s.name]=+s.value||0 ); return acc; }, {});
    return {
      id:a.id, name:a.displayName, link:`https://www.espn.com/mens-college-basketball/player/_/id/${a.id}`,
      gp:pcat.gamesPlayed??null, mpg:pcat.minutesPerGame??null, ppg:pcat.pointsPerGame??null, rpg:pcat.reboundsPerGame??null,
      apg:pcat.assistsPerGame??null, spg:pcat.stealsPerGame??null, bpg:pcat.blocksPerGame??null, tpg:pcat.turnoversPerGame??null,
      fgPct:(pcat.fieldGoalPct??0), threePct:(pcat.threePointFieldGoalPct??0), ftPct:(pcat.freeThrowPct??0), headshot: a.headshot?.href||""
    };
  }));
  STATE.stats = { team: teamStats, players };
  renderRoster(); renderTeamStats(); renderPlayerStats(); fillCompare();
}

async function loadSchedule(){
  const reg = await espnSchedule(STATE.season, 2); // regular season
  let pof = {};
  try{ pof = await espnSchedule(STATE.season, 3); }catch{}
  const items = [...(reg?.events||[]), ...(pof?.events||[])];
  const games = items.map(ev=>{
    const comp = ev.competitions?.[0]||{};
    const uf   = comp.competitors?.find(c=> c.team?.id==String(TEAM_ID));
    const opp  = comp.competitors?.find(c=> c.team?.id!=String(TEAM_ID));
    const homeAway = uf?.homeAway==='home'?'Home':'Away';
    return {
      id: ev.id,
      date: new Date(ev.date).toLocaleString('en-US', { timeZone:'America/New_York', weekday:'short', month:'short', day:'numeric'}),
      time: new Date(ev.date).toLocaleTimeString('en-US',{ timeZone:'America/New_York', hour:'numeric', minute:'2-digit'}),
      opponent: opp?.team?.displayName||'TBA',
      at: homeAway,
      venue: comp.venue?.fullName||'TBA',
      city: comp.venue?.address?.city||'',
      tv: (comp.broadcasts?.[0]?.names?.[0])||'',
      result: uf?.winner===true?'W':(opp?.winner===true?'L':''),
      score: (uf?.score && opp?.score)?`${uf.score}-${opp.score}`:'',
      box: ev.links?.find(l=>/boxscore/i.test(l.text||''))?.href || ''
    };
  });
  STATE.schedule = games;
  renderSchedule(); renderCountdown(); fillTicketGames();
}

/* ========= Analytics =========
   Pull each finished game’s summary and compute:
   - Possessions ≈ FGA + 0.475*FTA − ORB + TO
   - ORtg (points per 100 poss), eFG%, TO%, Pace
*/
function poss(t){ return (t.fieldGoalsAttempted||0) + 0.475*(t.freeThrowsAttempted||0) - (t.offensiveRebounds||0) + (t.turnovers||0); }
function efg(t){ const fgm=t.fieldGoalsMade||0, fg3=t.threePointFieldGoalsMade||0, fga=t.fieldGoalsAttempted||0; return fga? (fgm+0.5*fg3)/fga : 0; }
function tor(t){ const to=t.turnovers||0, fga=t.fieldGoalsAttempted||0, fta=t.freeThrowsAttempted||0; const denom=fga+0.475*fta; return denom? to/denom : 0; }

async function loadAnalytics(){
  const done = STATE.schedule.filter(g=> g.result).slice(-10); // last 10 finished
  const rows = [];
  for(const g of done){
    try{
      const s = await espnSummary(g.id);
      const box = s?.boxscore?.teams || [];
      const us  = box.find(t=> t.team?.id==String(TEAM_ID))?.statistics?.[0]?.stats || [];
      const them= box.find(t=> t.team?.id!=String(TEAM_ID))?.statistics?.[0]?.stats || [];
      const toMap = (arr)=> Object.fromEntries(arr.map(x=>[x.name, Number(x.value)||0]));
      const our = toMap(us), opp = toMap(them);
      const pOur = poss(our), pOpp = poss(opp);
      const possEst = Math.max(1, Math.round((pOur + pOpp)/2));
      const ptsUs = our.points||0, ptsOpp = opp.points||0;
      rows.push({
        date:g.date, opp:g.opponent, at:g.at, score:g.score,
        ortg: +(ptsUs*100/possEst).toFixed(1),
        drtg: +(ptsOpp*100/possEst).toFixed(1),
        pace: +(possEst*40/ (our.minutes||200)).toFixed(1), // rough adjustment by minutes (5 players x 40=200)
        efg: +(efg(our)*100).toFixed(1),
        toPct: +(tor(our)*100).toFixed(1),
        box: g.box || `https://www.espn.com/mens-college-basketball/game/_/gameId/${g.id}`
      });
    }catch(e){
      // ignore a game if summary not available yet
    }
  }
  STATE.analytics = rows;
  renderAnalytics();
}

/* ========= Rendering ========= */
function renderSchedule(){
  const filter = $('#schedFilter')?.value || 'ALL';
  const rows = STATE.schedule.filter(g=> filter==='ALL' ? true : g.at===filter);
  const mount = $('#scheduleWrap'); if(!mount) return;
  mount.innerHTML = `
    <table id="scheduleTable">
      <thead><tr>
        <th>Date</th><th>Time (ET)</th><th>Opponent</th><th>H/A</th><th>Result</th><th>Score</th><th>Links</th>
      </tr></thead>
      <tbody>
        ${rows.map(g=>`
          <tr class="game-row" data-id="${g.id}">
            <td>${esc(g.date)}</td>
            <td>${esc(g.time)}</td>
            <td><strong>${esc(g.opponent)}</strong></td>
            <td>${g.at}</td>
            <td>${esc(g.result||'')}</td>
            <td>${esc(g.score||'')}</td>
            <td>
              ${g.box?`<a class="boxlink" target="_blank" rel="noopener" href="${g.box}">Box ↗</a>`:''}
              <a class="boxlink" target="_blank" rel="noopener" href="https://www.sports-reference.com/cbb/boxscores/">SR box index ↗</a>
            </td>
          </tr>
          <tr class="details" data-det="${g.id}" style="display:none">
            <td colspan="7">
              <div style="display:flex;gap:16px;flex-wrap:wrap">
                <div><span class="tiny muted">Venue</span><div>${esc(g.venue||'TBA')}</div></div>
                <div><span class="tiny muted">City</span><div>${esc(g.city||'')}</div></div>
                <div><span class="tiny muted">TV</span><div>${esc(g.tv||'')}</div></div>
                <div><button class="btn ghost addCal" data-game='${esc(JSON.stringify(g))}'>Add to Calendar</button></div>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  $$('#scheduleTable .game-row').forEach(tr=>{
    tr.addEventListener('click', ()=>{ const id=tr.dataset.id; const det=$(`#scheduleTable [data-det="${id}"]`); if(det) det.style.display = det.style.display==='none' ? '' : 'none'; });
  });
  $$('#scheduleTable .addCal').forEach(b=> b.addEventListener('click', (e)=>{ e.stopPropagation(); downloadICS(JSON.parse(b.dataset.game)); }));
}
$('#schedFilter')?.addEventListener('change', renderSchedule);
$('#refreshSchedule')?.addEventListener('click', loadSchedule);
$('#exportScheduleCsv')?.addEventListener('click', ()=>{
  const rows = [["Date","Time","Opponent","H/A","Result","Score","TV","Venue","City","ESPN Box"]];
  STATE.schedule.forEach(g=> rows.push([g.date,g.time,g.opponent,g.at,g.result||"",g.score||"",g.tv||"",g.venue||"",g.city||"",g.box||""]));
  const csv = rows.map(r=> r.map(v=> `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="gators_schedule.csv"; a.click();
});
function downloadICS(g){
  const start = new Date(`${g.date} ${g.time} EST`);
  const end = new Date(start.getTime()+2*60*60*1000);
  const toICS = (d)=> d.getUTCFullYear()+pad2(d.getUTCMonth()+1)+pad2(d.getUTCDate())+'T'+pad2(d.getUTCHours())+pad2(d.getUTCMinutes())+pad2(d.getUTCSeconds())+'Z';
  const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Gators Hub//EN","BEGIN:VEVENT",
    `UID:${g.id}@gatorshub`,`DTSTAMP:${toICS(new Date())}`,
    `DTSTART:${toICS(start)}`,`DTEND:${toICS(end)}`,
    `SUMMARY:Florida vs ${g.opponent}`,`LOCATION:${g.venue?g.venue+', ':''}${g.city||''}`,
    "END:VEVENT","END:VCALENDAR"].join("\r\n");
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([ics],{type:"text/calendar"})); a.download=`UF_vs_${g.opponent.replace(/\s+/g,'_')}.ics`; a.click();
}

/* Roster (no fallback) */
function renderRoster(){
  const mount = $('#rosterGrid'); if(!mount) return;
  const q = ($('#rosterFilter')?.value||"").toLowerCase();
  const favOnly = $('#favOnly')?.checked;
  const favs = getFavs();
  let rows = STATE.roster.slice();
  if(q) rows = rows.filter(p=> p.name.toLowerCase().includes(q));
  if(favOnly) rows = rows.filter(p=> favs.includes(p.name));
  $('#rosterEmpty').style.display = rows.length? 'none':'block';
  mount.innerHTML = rows.map(p=>`
    <div class="card player" data-player="${esc(p.name)}">
      <div style="display:flex;gap:12px;align-items:center;">
        <img loading="lazy" src="${p.headshot}" alt="${esc(p.name)} headshot" width="64" height="64" style="border-radius:12px;object-fit:cover" />
        <div><div><strong>${esc(p.name)}</strong> <span class="tiny muted">#${p.number||''} ${esc(p.pos||'')}</span></div><div class="meta">${esc(p.hometown||'')}</div></div>
        <button class="btn ghost" style="margin-left:auto" data-fav="${esc(p.name)}">${favs.includes(p.name)?'⭐':'☆'}</button>
      </div>
    </div>`).join('');
  $$('#rosterGrid [data-fav]').forEach(b=> b.addEventListener('click', (e)=>{ e.stopPropagation(); toggleFavorite(b.dataset.fav); renderRoster(); }));
  $$('#rosterGrid .player').forEach(card=> card.addEventListener('click', ()=> openPlayerModal(STATE.stats.players.find(x=>x.name===card.dataset.player))));
}
$('#rosterFilter')?.addEventListener('input', renderRoster);
$('#favOnly')?.addEventListener('change', renderRoster);
$('#refreshRoster')?.addEventListener('click', async ()=>{ await loadRosterAndStats(); });

/* Stats */
function renderTeamStats(){
  const t = STATE.stats.team||{};
  $('#teamStats').innerHTML = `<table><thead><tr><th>PTS/G</th><th>REB/G</th><th>AST/G</th><th>STL/G</th><th>BLK/G</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead>
  <tbody><tr>
    <td class="stat">${fmt1(t.pointsPerGame)}</td><td>${fmt1(t.reboundsPerGame)}</td><td>${fmt1(t.assistsPerGame)}</td><td>${fmt1(t.stealsPerGame)}</td><td>${fmt1(t.blocksPerGame)}</td>
    <td>${pct3(t.fieldGoalPct)}</td><td>${pct3(t.threePointFieldGoalPct)}</td><td>${pct3(t.freeThrowPct)}</td></tr></tbody></table>`;
}
function renderPlayerStats(){
  const q = ($('#playerFilter')?.value||"").toLowerCase();
  let rows = STATE.stats.players.slice(); if(q) rows = rows.filter(p=> p.name.toLowerCase().includes(q)); rows.sort((a,b)=> (b.ppg||0)-(a.ppg||0));
  $('#playerStats').innerHTML = `<table id="playersTable"><thead><tr><th>Player</th><th>GP</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>${
    rows.map(p=>`<tr class="plink" data-player="${esc(p.name)}"><td><div style="display:flex;align-items:center;gap:8px">${p.headshot?`<img src="${p.headshot}" width="20" height="20" style="border-radius:50%">`:''}<strong>${esc(p.name)}</strong></div></td><td>${p.gp??'—'}</td><td>${fmt1(p.mpg)}</td><td class="stat">${fmt1(p.ppg)}</td><td>${fmt1(p.rpg)}</td><td>${fmt1(p.apg)}</td><td>${fmt1(p.spg)}</td><td>${fmt1(p.bpg)}</td><td>${fmt1(p.tpg)}</td><td>${pct3(p.fgPct)}</td><td>${pct3(p.threePct)}</td><td>${pct3(p.ftPct)}</td></tr>`).join('') }</tbody></table>`;
  $$('#playersTable .plink').forEach(tr=> tr.addEventListener('click', ()=>{ const p=STATE.stats.players.find(x=>x.name===tr.dataset.player); openPlayerModal(p); }));
}
$('#playerFilter')?.addEventListener('input', renderPlayerStats);
$('#exportPlayersCsv')?.addEventListener('click', ()=>{
  const rows=[["Player","GP","MPG","PPG","RPG","APG","SPG","BPG","TOV","FG%","3P%","FT%","ESPN_Link"]];
  STATE.stats.players.forEach(p=> rows.push([p.name,p.gp,p.mpg,p.ppg,p.rpg,p.apg,p.spg,p.bpg,p.tpg,p.fgPct,p.threePct,p.ftPct,p.link||""]));
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([rows.map(r=>r.join(',')).join('\n')],{type:"text/csv"})); a.download="gators_players.csv"; a.click();
});
$('#refreshStats')?.addEventListener('click', loadRosterAndStats);

/* Compare */
function fillCompare(){ const A=$('#cmpA'),B=$('#cmpB'); if(!A||!B) return; A.innerHTML=""; B.innerHTML="";
  STATE.stats.players.forEach(p=>{ const o1=new Option(p.name,p.name); A.add(o1); const o2=new Option(p.name,p.name); B.add(o2); });
  if(STATE.stats.players[0]) A.value=STATE.stats.players[0].name; if(STATE.stats.players[1]) B.value=STATE.stats.players[1].name;
}
$('#drawCompare')?.addEventListener('click', drawCompare);
function drawCompare(){
  const a = STATE.stats.players.find(p=>p.name===$('#cmpA')?.value);
  const b = STATE.stats.players.find(p=>p.name===$('#cmpB')?.value);
  if(!a||!b) return;
  const metrics=["ppg","rpg","apg","spg","bpg","tpg"];
  const maxes = { ppg:30, rpg:15, apg:8, spg:3, bpg:3, tpg:5 };
  const w=800,h=320,pad=40,col=(w-2*pad)/metrics.length;
  const bar=(val,max)=> Math.max(2,(val/max)*(h-2*pad));
  const svg=[`<svg viewBox="0 0 ${w} ${h}" width="100%" height="320">`,`<g font-size="12" fill="currentColor">`];
  metrics.forEach((m,i)=>{ const x=pad+i*col+col/2;
    svg.push(`<text x="${x}" y="${h-pad+18}" text-anchor="middle">${m.toUpperCase()}</text>`);
    svg.push(`<rect x="${x-22}" y="${h-pad-bar(a[m]||0,maxes[m])}" width="16" height="${bar(a[m]||0,maxes[m])}" rx="4" fill="#0021A5"></rect>`);
    svg.push(`<rect x="${x+6}"  y="${h-pad-bar(b[m]||0,maxes[m])}" width="16" height="${bar(b[m]||0,maxes[m])}" rx="4" fill="#FA4616"></rect>`);
  });
  svg.push(`</g><g font-size="14"><text x="${pad}" y="${pad-8}"><tspan fill="#0021A5">●</tspan> ${esc(a.name)}</text><text x="${pad+200}" y="${pad-8}"><tspan fill="#FA4616">●</tspan> ${esc(b.name)}</text></g></svg>`);
  $('#compareWrap').innerHTML = svg.join('');
}

/* Analytics render */
function renderAnalytics(){
  const rows = STATE.analytics.slice().reverse();
  $('#analyticsWrap').innerHTML = rows.length ? `<table><thead><tr><th>Date</th><th>Opponent</th><th>H/A</th><th>Score</th><th>ORtg</th><th>DRtg</th><th>Pace</th><th>eFG%</th><th>TO%</th><th>Box</th></tr></thead><tbody>${
    rows.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.opp)}</td><td>${r.at}</td><td>${esc(r.score)}</td><td class="stat">${r.ortg}</td><td>${r.drtg}</td><td>${r.pace}</td><td>${r.efg}</td><td>${r.toPct}</td><td><a class="boxlink" target="_blank" rel="noopener" href="${r.box}">↗</a></td></tr>`).join('')
  }</tbody></table>` : `<div class="card"><p class="tiny muted">No completed games yet.</p></div>`;
  // tiny trend SVG (ORtg last 10)
  const w=800,h=200,pad=24, vals=rows.map(r=>r.ortg), n=vals.length||1, min=Math.min(...vals, 80), max=Math.max(...vals, 130);
  const x=(i)=> pad + i*( (w-2*pad)/Math.max(1,n-1) ), y=(v)=> h-pad - ((v-min)/(max-min||1))*(h-2*pad);
  const path = vals.map((v,i)=> (i?'L':'M')+x(i)+','+y(v)).join(' ');
  $('#analyticsTrend').innerHTML = n>1 ? `<svg viewBox="0 0 ${w} ${h}" width="100%" height="200"><path d="${path}" fill="none" stroke="#FA4616" stroke-width="3"/><g font-size="12" fill="currentColor"><text x="${pad}" y="${pad}">ORtg trend (last ${n})</text></g></svg>` : '';
}
$('#refreshAnalytics')?.addEventListener('click', loadAnalytics);

/* Player modal */
function openPlayerModal(p){
  const modal=$('#scoutModal'), box=$('#scoutContent');
  if(!p){ box.innerHTML = `<p class="muted">No data.</p>`; modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); return; }
  box.innerHTML = `<h3 style="margin-top:0">${esc(p.name)}</h3><p class="meta"><a href="${p.link}" target="_blank" rel="noopener">ESPN player profile ↗</a></p>
    <table><tbody>
      <tr><td>GP</td><td>${p.gp??'—'}</td></tr><tr><td>MPG</td><td>${fmt1(p.mpg)}</td></tr><tr><td>PPG</td><td>${fmt1(p.ppg)}</td></tr>
      <tr><td>RPG</td><td>${fmt1(p.rpg)}</td></tr><tr><td>APG</td><td>${fmt1(p.apg)}</td></tr><tr><td>SPG</td><td>${fmt1(p.spg)}</td></tr>
      <tr><td>BPG</td><td>${fmt1(p.bpg)}</td></tr><tr><td>TOV</td><td>${fmt1(p.tpg)}</td></tr><tr><td>FG%</td><td>${pct3(p.fgPct)}</td></tr>
      <tr><td>3P%</td><td>${pct3(p.threePct)}</td></tr><tr><td>FT%</td><td>${pct3(p.ftPct)}</td></tr>
    </tbody></table>`;
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
}
$('#closeScout')?.addEventListener('click', ()=>{ const m=$('#scoutModal'); m.classList.add('hidden'); m.setAttribute('aria-hidden','true'); });
$('#scoutModal')?.addEventListener('click', (e)=>{ if(e.target.classList.contains('modal-bg')) $('#closeScout').click(); });

/* Favorites */
function getFavs(){ try{ return JSON.parse(localStorage.getItem('ghub_favs'))||[] }catch{ return [] } }
function setFavs(v){ localStorage.setItem('ghub_favs', JSON.stringify(v)); }
function toggleFavorite(name){ const favs=getFavs(); const i=favs.indexOf(name); if(i>=0) favs.splice(i,1); else favs.push(name); setFavs(favs); }

/* Props (unchanged core) */
const LS = { bankroll:"ghub_bankroll", username:"ghub_username", openBets:"ghub_openBets", history:"ghub_betHistory", board:"ghub_leaderboard" };
const getLS = (k,d)=> { try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch{ return d } };
const setLS = (k,v)=> localStorage.setItem(k, JSON.stringify(v));
function decimalFromAmerican(odds){ const o=Number(odds); return o<0 ? (100/-o)+1 : (o/100)+1; }
function roundHalf(n){ return Math.round(n*2)/2; }
function defaultLines(){ return (STATE.stats.players||[]).map(p=>({ player:p.name, pts:roundHalf(p.ppg||0), reb:roundHalf(p.rpg||0), ast:roundHalf(p.apg||0), pra:roundHalf((p.ppg||0)+(p.rpg||0)+(p.apg||0)) })); }
function bankrollUI(){ $('#bankroll').textContent = `$${Number(getLS(LS.bankroll,0)).toLocaleString()}`; $('#usernameInput').value = getLS(LS.username,"") || ""; }
function upsertLeaderboard(user,bankroll){ const board=getLS(LS.board,[]); const i=board.findIndex(b=>b.user===user); if(i>=0)board[i].bankroll=bankroll; else board.push({user,bankroll,updated:Date.now()}); setLS(LS.board,board); renderLeaderboard(); }
function renderLeaderboard(){ const board=getLS(LS.board,[]).sort((a,b)=>b.bankroll-a.bankroll); $('#leaderboard').innerHTML = `<table><thead><tr><th>#</th><th>User</th><th>Bankroll</th><th>Updated</th></tr></thead><tbody>${board.map((b,i)=>`<tr><td>${i+1}</td><td>${esc(b.user)}</td><td>$${Number(b.bankroll).toLocaleString()}</td><td>${new Date(b.updated||Date.now()).toLocaleString()}</td></tr>`).join('')}</tbody></table>`; }
function fillTicketGames(){ const sel=$('#ticketGame'); if(!sel) return; sel.innerHTML = `<option value="">(None)</option>` + STATE.schedule.map(g=> `<option value="${esc(`${g.date}|${g.time}|${g.opponent}`)}">${esc(`${g.date} – ${g.opponent} (${g.at})`)}</option>`).join(''); }
function renderPropsTable(){
  const lines = defaultLines();
  $('#propsTable').innerHTML = `<table><thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th><th>P+R+A</th><th>Pick</th><th>Add</th></tr></thead><tbody>${
    lines.map(l=>`<tr><td><strong>${esc(l.player)}</strong></td><td>${l.pts}</td><td>${l.reb}</td><td>${l.ast}</td><td>${l.pra}</td>
    <td><select data-player="${esc(l.player)}" class="pick"><option value="PTS_O">PTS Over</option><option value="PTS_U">PTS Under</option><option value="REB_O">REB Over</option><option value="REB_U">REB Under</option><option value="AST_O">AST Over</option><option value="AST_U">AST Under</option><option value="PRA_O">PRA Over</option><option value="PRA_U">PRA Under</option></select></td>
    <td><button class="btn addBet" data-player="${esc(l.player)}">Add</button></td></tr>`).join('')
  }</tbody></table>`;
  $$('.addBet').forEach(b=> b.addEventListener('click', ()=>{ const player=b.dataset.player; const sel=b.closest('tr').querySelector('.pick').value; const slip=getLS(LS.openBets,[]); slip.push({player, market:sel, odds:-110}); setLS(LS.openBets, slip); renderBetSlip(); toast("Added to slip"); }));
}
function renderBetSlip(){ const slip=getLS(LS.openBets,[]); $('#betList').innerHTML = slip.length? slip.map((b,i)=> `<div class="card"><div><strong>${esc(b.player)}</strong> — ${b.market.replace('_',' ')} <span class="badge">@${b.odds}</span></div><div class="meta">Slip item #${i+1}</div></div>`).join('') : `<p class="muted tiny">No selections yet.</p>`; }
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
$('#startBankroll')?.addEventListener('click', handleBankroll);
$('#resetBankroll')?.addEventListener('click', resetBankroll);
$('#placeBets')?.addEventListener('click', placeBets);
$('#clearBets')?.addEventListener('click', ()=>{ setLS(LS.openBets,[]); renderBetSlip(); toast("Slip cleared"); });
$('#exportHistory')?.addEventListener('click', ()=>{ const h=getLS(LS.history, []); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(h,null,2)],{type:"application/json"})); a.download='bet_history.json'; a.click(); });
$('#importHistory')?.addEventListener('change', async (e)=>{ const f=e.target.files?.[0]; if(!f) return; const text=await f.text(); setLS(LS.history, JSON.parse(text)); renderHistory(); toast("History imported"); });
$('#clearHistory')?.addEventListener('click', ()=>{ setLS(LS.history, []); renderHistory(); toast("History cleared"); });

function renderHistory(){
  const hist = getLS(LS.history, []);
  const key = (g)=> `${g.date}|${g.time}|${g.opponent}`;
  const map = new Map(STATE.schedule.map(g=> [key(g), g]));
  $('#historyWrap').innerHTML = `<table><thead><tr><th>Placed</th><th>Game</th><th>Wager</th><th>Status</th><th>Payout</th><th>Picks</th></tr></thead><tbody>${
    hist.slice().reverse().map(t=>{
      const g = t.gameId ? map.get(t.gameId) : null;
      const gameTxt = g ? `${g.date} vs ${g.opponent} ${g.result?`(${g.result})`:''} ${g.box?` • <a class="boxlink" href="${g.box}" target="_blank" rel="noopener">box ↗</a>`:''}` : '—';
      return `<tr><td>${new Date(t.placedAt).toLocaleString()}</td><td>${gameTxt}</td><td>$${Number(t.wager).toLocaleString()}</td><td>${esc(t.status||'pending')}</td><td>${t.payout?('$'+Number(t.payout).toLocaleString()):'—'}</td><td>${t.bets.map(b=>`${esc(b.player)} (${b.market.replace('_',' ')}) ${b.result?`<span class="badge">${b.result}</span>`:''}`).join('<br/>')}</td></tr>`;
    }).join('')
  }</tbody></table>`;
}

/* Countdown */
function renderCountdown(){
  const el=$('#nextGame'); if(!el || !STATE.schedule.length) return;
  const upcoming = STATE.schedule.map(g=> ({...g, t: Date.parse(`${g.date} ${g.time} ET`) }))
                           .filter(g=> !isNaN(g.t) && g.t > Date.now())
                           .sort((a,b)=>a.t-b.t)[0];
  if(!upcoming){ el.textContent = "Next game: TBA"; return; }
  (function tick(){ const diff = upcoming.t - Date.now(); if(diff<=0){ el.textContent = `Gameday: vs ${upcoming.opponent}!`; return; }
    const h=Math.floor(diff/3.6e6), m=Math.floor((diff%3.6e6)/6e4), s=Math.floor((diff%6e4)/1e3);
    el.textContent = `Next game vs ${upcoming.opponent}: ${h}h ${m}m ${s}s`; requestAnimationFrame(()=> setTimeout(tick, 500)); })();
}

/* Photos & News (simple) */
const PHOTOS = [
  { src:"https://upload.wikimedia.org/wikipedia/commons/2/28/Exactech_Arena_at_the_Stephen_C._O%27Connell_Center_court_2016.jpg", alt:"Exactech Arena" },
  { src:"https://upload.wikimedia.org/wikipedia/commons/8/86/Florida_Gators_basketball_2006_crowd.jpg", alt:"Gators crowd" },
  { src:"https://upload.wikimedia.org/wikipedia/commons/0/0e/Billy_Donovan_2008.jpg", alt:"Billy Donovan" }
];
function loadPhotos(){ $('#photoGrid').innerHTML = PHOTOS.map(p=>`<div class="card"><img loading="lazy" src="${p.src}" alt="${esc(p.alt)}" class="photo"/><div class="meta">${esc(p.alt)}</div></div>`).join(''); }
async function loadNews(){ try{ const r=await fetch('https://floridagators.com/rss.aspx?path=mbball'); const xml=await r.text(); const items=[]; const itemRe=/<item[\s\S]*?<\/item>/gi, titleRe=/<title>([\s\S]*?)<\/title>/i, linkRe=/<link>([\s\S]*?)<\/link>/i, dateRe=/<pubDate>([\s\S]*?)<\/pubDate>/i, descRe=/<description>([\s\S]*?)<\/description>/i; (xml.match(itemRe)||[]).slice(0,12).forEach(b=>{ const title=(b.match(titleRe)?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,'').trim(); const link=(b.match(linkRe)?.[1]||"").trim(); const summary=(b.match(descRe)?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]*>/g,'').trim(); const date=new Date(b.match(dateRe)?.[1]||Date.now()).toISOString(); if(title&&link) items.push({title, link, summary, date}); }); $('#newsList').innerHTML = items.map(n=>`<article class="news-card"><h4><a href="${n.link}" target="_blank" rel="noopener">${esc(n.title)}</a></h4><p>${esc(n.summary||"")}</p><p class="meta">${new Date(n.date).toLocaleString()}</p></article>`).join(''); }catch{ $('#newsList').innerHTML = `<article class="news-card"><h4>Welcome</h4><p class="muted">Live schedule/roster/stats + analytics.</p></article>`; }}

/* INIT */
async function refreshAll(){
  fillSeasonSelects();
  await Promise.all([loadRosterAndStats(), loadSchedule()]);
  renderPropsTable(); renderBetSlip(); bankrollUI(); renderLeaderboard(); loadPhotos(); loadNews(); await loadAnalytics();
}
function routeAndStart(){ route(); startHero(); }
document.addEventListener('DOMContentLoaded', async ()=>{
  routeAndStart();
  await refreshAll();
  setInterval(async ()=>{ await Promise.all([loadRosterAndStats(), loadSchedule()]); await loadAnalytics(); }, REFRESH_MS);
});
