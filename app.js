/* ===============================
   GATORS HUB — CORS-SAFE + FALLBACKS
   - Uses r.jina.ai (read-only mirror) to bypass CORS reliably
   - Handles Sports-Reference “commented tables”
   - Always shows usable UI via local fallbacks if a fetch fails
   =============================== */

const REFRESH_MS = 10 * 60 * 1000;
const CURRENT_SEASON = 2026;
const SEASONS = [2026, 2025, 2024, 2023];

/* Build a CORS-safe mirror URL:
   r.jina.ai returns the page HTML with permissive CORS.
   Example: JINA('https://www.sports-reference.com/x') =>
            https://r.jina.ai/http://www.sports-reference.com/x
*/
const JINA = (url) => `https://r.jina.ai/http://${url.replace(/^https?:\/\//,'')}`;

const SR = {
  schedule: (yr) => `https://www.sports-reference.com/cbb/schools/florida/men/${yr}-schedule.html`,
  teamPage: (yr) => `https://www.sports-reference.com/cbb/schools/florida/men/${yr}.html`
};
const UF = {
  roster:   'https://floridagators.com/sports/mens-basketball/roster',
  schedule: 'https://floridagators.com/sports/mens-basketball/schedule',
  rss:      'https://floridagators.com/rss.aspx?path=mbball'
};

/* Helpers */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const esc = (s)=> (s||"").replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const fmt = (n)=> (n===0||n)?Number(n).toFixed(1):'—';
const pct = (p)=> (p===0||p)?(p>1?(p/100).toFixed(3):Number(p).toFixed(3)):'—';
const pad2=(n)=>String(n).padStart(2,'0');
const toCSV = (rows)=> rows.map(r=> r.map(v=> `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
function toast(msg){ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1600); }
function diag(msg){ const d=$('#diag'); if(!d) return; d.style.display='block'; d.innerHTML += `<div class="card"><pre class="tiny">${esc(msg)}</pre></div>`; }

/* Theme */
function applyTheme(){
  const saved = localStorage.getItem('ghub_theme') || 'light';
  document.documentElement.classList.toggle('dark', saved==='dark');
  $('#themeToggle').textContent = saved==='dark' ? '☀️' : '🌙';
}
$('#themeToggle')?.addEventListener('click', ()=>{
  const now = (localStorage.getItem('ghub_theme')||'light')==='light'?'dark':'light';
  localStorage.setItem('ghub_theme', now); applyTheme();
});
applyTheme();

/* Routing */
function showTab(tab){ $$('.tab').forEach(a=> a.classList.toggle('active', a.dataset.tab===tab)); $$('.panel').forEach(p=> p.classList.toggle('active', p.id===tab)); }
function route(){ const m = location.hash.match(/^#\/([a-z]+)/i); showTab(m ? m[1] : 'schedule'); }
window.addEventListener('hashchange', route);

/* Banner */
const HERO_IMAGES = [
  "https://upload.wikimedia.org/wikipedia/commons/2/28/Exactech_Arena_at_the_Stephen_C._O%27Connell_Center_court_2016.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/8/86/Florida_Gators_basketball_2006_crowd.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/0/0e/Billy_Donovan_2008.jpg"
];
let heroIdx=0;
function renderHeroSlides(){
  const mount = $('#heroImages'); if(!mount) return;
  mount.innerHTML = HERO_IMAGES.map((src,i)=>`<div class="slide${i===0?' active':''}" style="background-image:url('${src}')"></div>`).join('');
}
function setHero(i){ const mount=$('#heroImages'); if(!mount) return; $$('.slide', mount).forEach((s,idx)=> s.classList.toggle('active', idx===i)); }
function startHero(){ renderHeroSlides(); setInterval(()=>{ heroIdx=(heroIdx+1)%HERO_IMAGES.length; setHero(heroIdx); }, 4000);
  $('#heroPrev')?.addEventListener('click', ()=>{ heroIdx=(heroIdx-1+HERO_IMAGES.length)%HERO_IMAGES.length; setHero(heroIdx); });
  $('#heroNext')?.addEventListener('click', ()=>{ heroIdx=(heroIdx+1)%HERO_IMAGES.length; setHero(heroIdx); });
}

/* Fetch HTML via CORS-safe mirror */
async function fetchHTML(url){
  try{
    const r = await fetch(JINA(url));
    if(!r.ok) throw new Error('HTTP '+r.status+' on '+url);
    const text = await r.text();
    return new DOMParser().parseFromString(text, 'text/html');
  }catch(e){
    diag(`fetchHTML failed: ${url}\n${e.message}`);
    throw e;
  }
}

/* Parse commented SR tables */
function parseCommentedTable(doc, id){
  let live = doc.querySelector(`#${id}`); if(live) return live;
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT, null);
  let node, html='';
  while(node = walker.nextNode()){
    if(node.nodeValue && node.nodeValue.includes(`id="${id}"`)){ html = node.nodeValue; break; }
  }
  if(!html) return null;
  const frag = new DOMParser().parseFromString(html, 'text/html');
  return frag.querySelector(`#${id}`);
}

/* Global state */
let STATE = { season: CURRENT_SEASON, schedule: [], players: [], team: {}, ufLogos: new Map(), ufHeadshots: new Map() };

/* Season pickers */
function fillSeasonSelects(){
  const opts = SEASONS.map(y=> `<option value="${y}" ${y===STATE.season?'selected':''}>${y-1}-${String(y).slice(-2)}</option>`).join('');
  $('#seasonSelect').innerHTML = opts; $('#statsSeason').innerHTML = opts; $('#rosterSeason').innerHTML = opts;
}
['seasonSelect','statsSeason','rosterSeason'].forEach(id=>{
  document.addEventListener('change', (e)=>{ if(e.target && e.target.id===id){ STATE.season = Number(e.target.value); refreshAll(); }});
});

/* UF opponent logos + headshots (best-effort) */
async function loadUFLogos(){
  try{
    const doc = await fetchHTML(UF.schedule);
    const imgs = Array.from(doc.querySelectorAll('img')).filter(i=>/logo/i.test(i.alt||''));
    const map = new Map(); imgs.forEach(img=>{ const name=(img.alt||'').replace(/ logo/i,'').trim(); if(name) map.set(name.toLowerCase(), img.src); });
    STATE.ufLogos = map;
  }catch(e){ diag('UF logos failed (non-critical)'); }
}
async function loadUFHeadshots(){
  try{
    const doc = await fetchHTML(UF.roster);
    const imgs = Array.from(doc.querySelectorAll('img')).filter(i=>/roster|headshot|player/i.test(i.src));
    const map = new Map(); imgs.forEach(img=>{ const name=(img.alt||'').replace(/\s+-.*$/,'').trim(); if(name) map.set(name.toLowerCase(), img.src); });
    STATE.ufHeadshots = map;
  }catch(e){ diag('Headshots failed (we use generated avatars)'); }
}
const logoFor = (opp)=> STATE.ufLogos.get((opp||'').toLowerCase()) || '';
const headshotFor = (name)=> STATE.ufHeadshots.get((name||'').toLowerCase()) || `https://source.boringavatars.com/beam/96/${encodeURIComponent(name||'Gator')}`;

/* ===== Schedule ===== */
async function loadSchedule(){
  const url = SR.schedule(STATE.season);
  let rows=[];
  try{
    const doc = await fetchHTML(url);
    const table = parseCommentedTable(doc,'schedule');
    const trs = Array.from(table?.querySelectorAll('tbody tr')||[]).filter(tr=> !tr.classList.contains('thead'));
    rows = trs.map((tr,i)=>{
      const get = (stat) => tr.querySelector(`[data-stat="${stat}"]`);
      const date = get('date_game')?.textContent?.trim() || '';
      const opp  = get('opp_name')?.textContent?.trim() || '';
      const atCode = get('game_location')?.textContent?.trim() || '';
      const at = atCode==='@'?'Away':atCode==='N'?'Neutral':'Home';
      const time = get('time')?.textContent?.trim() || 'TBA';
      const res  = get('game_result')?.textContent?.trim() || '';
      const pts  = get('pts')?.textContent?.trim() || '';
      const oppPts = get('opp_pts')?.textContent?.trim() || '';
      const box = get('box_score_text')?.querySelector('a')?.href || '';
      const notes = get('notes')?.textContent?.trim() || '';
      return {
        idx:i, date, time, opponent: opp, at, location: notes, result: res,
        score: (pts && oppPts) ? `${pts}-${oppPts}` : '',
        box, tv: '', venue:'', city:''
      };
    }).filter(g=>g.opponent);
  }catch(e){
    diag('Schedule fetch failed — using fallback sample.');
    rows = FALLBACK.schedule[STATE.season] || [];
  }

  /* Enrich (best-effort) from UF page */
  try{
    const doc = await fetchHTML(UF.schedule);
    const items = Array.from(doc.querySelectorAll('article,li,div')).filter(el=>/vs\.|at\s/i.test(el.textContent||''));
    const extra = [];
    items.forEach(el=>{
      const text = el.textContent.replace(/\s+/g,' ').trim();
      const mOpp = text.match(/(vs\.|at)\s+([A-Za-z .&'\-]+)/i);
      if(mOpp){
        const opp = mOpp[2].trim();
        const tv = (text.match(/\bESPN\w*|SECN|CBS|ABC|FOX Sports|TNT|TBS\b/i)||[])[0]||'';
        const city = (text.match(/\bGainesville|Jacksonville|Tampa|Orlando|Miami|Atlanta|Las Vegas|New York|Nashville\b/i)||[])[0]||'';
        const venue = (text.match(/\bO'Connell Center|Exactech Arena|Amalie Arena|Madison Square Garden|T-Mobile\b/i)||[])[0]||'';
        extra.push({opp, tv, city, venue});
      }
    });
    rows.forEach(g=>{ const hit = extra.find(x=> x.opp.toLowerCase()===g.opponent.toLowerCase()); if(hit){ g.tv ||= hit.tv; g.city ||= hit.city; g.venue ||= hit.venue; }});
  }catch(e){ diag('UF enrich failed (ok)'); }

  // Running record
  let w=0,l=0;
  rows.forEach(g=>{ if(/^W/.test(g.result)) w++; if(/^L/.test(g.result)) l++; g.record = (w||l) ? `${w}-${l}` : ''; });

  STATE.schedule = rows;
  renderSchedule(); renderCountdown(); fillTicketGames();
}

function renderSchedule(){
  const filter = $('#schedFilter')?.value || 'ALL';
  const rows = STATE.schedule.filter(g=> filter==='ALL' ? true : g.at===filter);
  const mount = $('#scheduleWrap'); if(!mount) return;
  mount.innerHTML = `
    <table id="scheduleTable">
      <thead><tr>
        <th>Date</th><th>Time (ET)</th><th>Opponent</th><th>H/A/N</th><th>Result</th><th>Score</th><th>Record</th><th>Links</th>
      </tr></thead>
      <tbody>
        ${rows.map(g=>{
          const logo = logoFor(g.opponent);
          const links = [ g.box ? `<a class="boxlink" href="${g.box}" target="_blank" rel="noopener">Box ↗</a>` : '' ].filter(Boolean).join(' • ');
          return `
          <tr class="game-row" data-idx="${g.idx}">
            <td>${esc(g.date)}</td>
            <td>${esc(g.time||'TBA')}</td>
            <td><div style="display:flex;align-items:center;gap:8px">${logo?`<img src="${logo}" alt="" width="20" height="20" style="border-radius:4px">`:''}<strong>${esc(g.opponent)}</strong></div></td>
            <td>${g.at}</td>
            <td>${esc(g.result||'')}</td>
            <td>${esc(g.score||'')}</td>
            <td>${esc(g.record||'')}</td>
            <td>${links||'—'}</td>
          </tr>
          <tr class="details" data-det="${g.idx}" style="display:none">
            <td colspan="8">
              <div style="display:flex;gap:16px;flex-wrap:wrap">
                <div><span class="tiny muted">Venue</span><div>${esc(g.venue||'TBA')}</div></div>
                <div><span class="tiny muted">City/State</span><div>${esc(g.city||'')}</div></div>
                <div><span class="tiny muted">TV</span><div>${esc(g.tv||'TBA')}</div></div>
                <div><span class="tiny muted">Notes</span><div>${esc(g.location||'')}</div></div>
                <div><button class="btn ghost addCal" data-game='${esc(JSON.stringify(g))}'>Add to Calendar</button></div>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  $$('#scheduleTable .game-row').forEach(tr=>{
    tr.addEventListener('click', ()=>{ const id=tr.dataset.idx; const det=$(`#scheduleTable [data-det="${id}"]`); if(det) det.style.display = det.style.display==='none' ? '' : 'none'; });
  });
  $$('#scheduleTable .addCal').forEach(b=> b.addEventListener('click', (e)=>{ e.stopPropagation(); downloadICS(JSON.parse(b.dataset.game)); }));
}
$('#schedFilter')?.addEventListener('change', renderSchedule);
$('#refreshSchedule')?.addEventListener('click', loadSchedule);
$('#exportScheduleCsv')?.addEventListener('click', ()=>{
  const rows = [["Date","Time","Opponent","H/A/N","Result","Score","Record","TV","Venue","City/State","Box"]];
  STATE.schedule.forEach(g=> rows.push([g.date,g.time,g.opponent,g.at,g.result||"",g.score||"",g.record||"",g.tv||"",g.venue||"",g.city||"",g.box||""]));
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([toCSV(rows)],{type:"text/csv"})); a.download="gators_schedule_detailed.csv"; a.click();
});
function downloadICS(g){
  const dt = new Date(`${g.date} ${g.time||'12:00 PM'} ET`);
  const end = new Date(dt.getTime() + 2*60*60*1000);
  const toICS = (d)=> d.getUTCFullYear()+pad2(d.getUTCMonth()+1)+pad2(d.getUTCDate())+'T'+pad2(d.getUTCHours())+pad2(d.getUTCMinutes())+pad2(d.getUTCSeconds())+'Z';
  const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Gators Hub//EN","BEGIN:VEVENT",
    `UID:${Date.now()}@gatorshub`,`DTSTAMP:${toICS(new Date())}`,
    `DTSTART:${toICS(dt)}`,`DTEND:${toICS(end)}`,
    `SUMMARY:Florida vs ${g.opponent}`,`LOCATION:${g.venue?g.venue+', ':''}${g.city||''}`,
    "END:VEVENT","END:VCALENDAR"].join("\r\n");
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics],{type:"text/calendar"})); a.download = `UF_vs_${g.opponent.replace(/\s+/g,'_')}.ics`; a.click();
}

/* Countdown */
function renderCountdown(){
  const el = $('#nextGame'); if(!el || !STATE.schedule.length) return;
  const upcoming = STATE.schedule.map(g=> ({...g, t: Date.parse(`${g.date} ${g.time||'12:00 PM'} ET`) }))
                           .filter(g=> !isNaN(g.t) && g.t > Date.now())
                           .sort((a,b)=>a.t-b.t)[0];
  if(!upcoming){ el.textContent = "Next game: TBA"; return; }
  (function tick(){ const diff = upcoming.t - Date.now(); if(diff<=0){ el.textContent = `Gameday: vs ${upcoming.opponent}!`; return; }
    const h=Math.floor(diff/3.6e6), m=Math.floor((diff%3.6e6)/6e4), s=Math.floor((diff%6e4)/1e3);
    el.textContent = `Next game vs ${upcoming.opponent}: ${h}h ${m}m ${s}s`; requestAnimationFrame(()=> setTimeout(tick, 500)); })();
}

/* ===== Stats (per_game from commented table) ===== */
async function loadStats(){
  const url = SR.teamPage(STATE.season);
  let players=[];
  try{
    const doc = await fetchHTML(url);
    const table = parseCommentedTable(doc,'per_game');
    const trs = Array.from(table?.querySelectorAll('tbody tr')||[]).filter(tr=> !tr.classList.contains('thead'));
    players = trs.map(tr=>{
      const get=(s)=> tr.querySelector(`[data-stat="${s}"]`)?.textContent?.trim()||'';
      const cell = tr.querySelector('[data-stat="player"]'); const link = cell?.querySelector('a')?.href||''; const name = cell?.textContent?.trim()||'';
      return { name, link, gp:+get('g')||null, mpg:+get('mp_per_g')||null, ppg:+get('pts_per_g')||null, rpg:+get('trb_per_g')||null, apg:+get('ast_per_g')||null,
               spg:+get('stl_per_g')||null, bpg:+get('blk_per_g')||null, tpg:+get('tov_per_g')||null, fgPct:+(get('fg_pct')||0), threePct:+(get('fg3_pct')||0), ftPct:+(get('ft_pct')||0) };
    }).filter(p=>p.name);
  }catch(e){
    diag('Stats fetch failed — using fallback players.');
    players = FALLBACK.players[STATE.season] || [];
  }
  STATE.players = players;

  const n = players.length || 1, sum=(k)=>players.reduce((a,b)=>a+(b[k]||0),0);
  STATE.team = { gp: Math.max(...players.map(p=>p.gp||0))||'—',
    pts:+(sum('ppg')).toFixed(1), reb:+(sum('rpg')).toFixed(1), ast:+(sum('apg')).toFixed(1),
    stl:+(sum('spg')).toFixed(1), blk:+(sum('bpg')).toFixed(1), tov:+(sum('tpg')).toFixed(1),
    fgPct:+(players.reduce((a,b)=>a+(b.fgPct||0),0)/n).toFixed(3),
    threePct:+(players.reduce((a,b)=>a+(b.threePct||0),0)/n).toFixed(3),
    ftPct:+(players.reduce((a,b)=>a+(b.ftPct||0),0)/n).toFixed(3) };

  renderTeamStats(); renderPlayerStats(); fillCompareOptions(); renderRoster(); renderPropsTable(); fillTicketGames();
}
function renderTeamStats(){
  $('#teamStats').innerHTML = `<table><thead><tr><th>GP</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead>
  <tbody><tr><td>${STATE.team.gp ?? '—'}</td><td class="stat">${fmt(STATE.team.pts)}</td><td>${fmt(STATE.team.reb)}</td><td>${fmt(STATE.team.ast)}</td><td>${fmt(STATE.team.stl)}</td><td>${fmt(STATE.team.blk)}</td><td>${fmt(STATE.team.tov)}</td><td>${pct(STATE.team.fgPct)}</td><td>${pct(STATE.team.threePct)}</td><td>${pct(STATE.team.ftPct)}</td></tr></tbody></table>`;
}
function renderPlayerStats(){
  const q = ($('#playerFilter')?.value||"").toLowerCase();
  let rows = STATE.players.slice(); if(q) rows = rows.filter(p=> p.name.toLowerCase().includes(q)); rows.sort((a,b)=> (b.ppg||0)-(a.ppg||0));
  $('#playerStats').innerHTML = `<table id="playersTable"><thead><tr><th>Player</th><th>GP</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>${
    rows.map(p=>`<tr class="plink" data-player="${esc(p.name)}"><td><strong>${esc(p.name)}</strong></td><td>${p.gp ?? '—'}</td><td>${fmt(p.mpg)}</td><td class="stat">${fmt(p.ppg)}</td><td>${fmt(p.rpg)}</td><td>${fmt(p.apg)}</td><td>${fmt(p.spg)}</td><td>${fmt(p.bpg)}</td><td>${fmt(p.tpg)}</td><td>${pct(p.fgPct)}</td><td>${pct(p.threePct)}</td><td>${pct(p.ftPct)}</td></tr>`).join('') }</tbody></table>`;
  $$('#playersTable .plink').forEach(tr=> tr.addEventListener('click', ()=>{ const p=STATE.players.find(x=>x.name===tr.dataset.player); openPlayerModal(p); }));
}
$('#playerFilter')?.addEventListener('input', renderPlayerStats);
$('#exportPlayersCsv')?.addEventListener('click', ()=>{
  const rows=[["Player","GP","MPG","PPG","RPG","APG","SPG","BPG","TOV","FG%","3P%","FT%","SR_Link"]];
  STATE.players.forEach(p=> rows.push([p.name,p.gp,p.mpg,p.ppg,p.rpg,p.apg,p.spg,p.bpg,p.tpg,p.fgPct,p.threePct,p.ftPct,p.link||""]));
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([toCSV(rows)],{type:"text/csv"})); a.download="gators_players.csv"; a.click();
});
$('#refreshStats')?.addEventListener('click', loadStats);

/* Roster cards (uses headshots when available) */
function renderRoster(){
  const q = ($('#rosterFilter')?.value||"").toLowerCase();
  const favOnly = $('#favOnly')?.checked;
  const favs = getFavs();
  let rows = STATE.players.map(p=>({name:p.name, pos:''}));
  if(q) rows = rows.filter(p=> (p.name + p.pos).toLowerCase().includes(q));
  if(favOnly) rows = rows.filter(p=> favs.includes(p.name));
  const grid = $('#rosterGrid'); if(!grid) return;
  grid.innerHTML = rows.map(p=>{
    const starred = favs.includes(p.name);
    const img = headshotFor(p.name);
    return `<div class="card player" data-player="${esc(p.name)}">
      <div style="display:flex;gap:12px;align-items:center;">
        <img loading="lazy" src="${img}" alt="${esc(p.name)} headshot" width="64" height="64" style="border-radius:12px;object-fit:cover" />
        <div><div><strong>${esc(p.name)}</strong></div><div class="meta">PPG ${fmt((STATE.players.find(x=>x.name===p.name)||{}).ppg)}</div></div>
        <button class="btn ghost" style="margin-left:auto" data-fav="${esc(p.name)}">${starred?'⭐':'☆'}</button>
      </div>
    </div>`;
  }).join('');
  $$('#rosterGrid [data-fav]').forEach(b=> b.addEventListener('click', (e)=>{ e.stopPropagation(); toggleFavorite(b.dataset.fav); renderRoster(); }));
  $$('#rosterGrid .player').forEach(card=> card.addEventListener('click', ()=> openPlayerModal(STATE.players.find(x=>x.name===card.dataset.player))));
}
$('#rosterFilter')?.addEventListener('input', renderRoster);
$('#favOnly')?.addEventListener('change', renderRoster);
$('#refreshRoster')?.addEventListener('click', async ()=>{ await loadUFHeadshots(); renderRoster(); });

function getFavs(){ try{ return JSON.parse(localStorage.getItem('ghub_favs'))||[] }catch{ return [] } }
function setFavs(v){ localStorage.setItem('ghub_favs', JSON.stringify(v)); }
function toggleFavorite(name){ const favs=getFavs(); const i=favs.indexOf(name); if(i>=0) favs.splice(i,1); else favs.push(name); setFavs(favs); }

/* Compare */
function fillCompareOptions(){
  const A = $('#cmpA'), B=$('#cmpB'); if(!A||!B) return; A.innerHTML=""; B.innerHTML="";
  STATE.players.forEach(p=>{ const o1=document.createElement('option'); o1.value=o1.textContent=p.name; A.appendChild(o1);
                             const o2=document.createElement('option'); o2.value=o2.textContent=p.name; B.appendChild(o2); });
  if(STATE.players[0]) A.value=STATE.players[0].name; if(STATE.players[1]) B.value=STATE.players[1].name;
}
$('#drawCompare')?.addEventListener('click', drawCompare);
function drawCompare(){
  const a = STATE.players.find(p=>p.name===$('#cmpA')?.value);
  const b = STATE.players.find(p=>p.name===$('#cmpB')?.value);
  if(!a || !b) return;
  const metrics=["ppg","rpg","apg","spg","bpg","tpg"];
  const maxes = { ppg:30, rpg:15, apg:8, spg:3, bpg:3, tpg:5 };
  const w=800, h=320, pad=40, col=(w-2*pad)/metrics.length;
  const bar = (val, max)=> Math.max(2, (val/max)*(h-2*pad));
  const svg = [`<svg viewBox="0 0 ${w} ${h}" width="100%" height="320">`,`<g font-size="12" fill="currentColor">`];
  metrics.forEach((m,i)=>{ const x = pad + i*col + col/2;
    svg.push(`<text x="${x}" y="${h-pad+18}" text-anchor="middle">${m.toUpperCase()}</text>`);
    svg.push(`<rect x="${x-22}" y="${h-pad-bar(a[m]||0,maxes[m])}" width="16" height="${bar(a[m]||0,maxes[m])}" rx="4" fill="#0021A5"></rect>`);
    svg.push(`<rect x="${x+6}"  y="${h-pad-bar(b[m]||0,maxes[m])}" width="16" height="${bar(b[m]||0,maxes[m])}" rx="4" fill="#FA4616"></rect>`);
  });
  svg.push(`</g><g font-size="14" fill="currentColor"><text x="${pad}" y="${pad-8}"><tspan fill="#0021A5">●</tspan> ${esc(a.name)}</text><text x="${pad+200}" y="${pad-8}"><tspan fill="#FA4616">●</tspan> ${esc(b.name)}</text></g></svg>`);
  $('#compareWrap').innerHTML = svg.join('');
}

/* Props (bankroll + slips + grading sim) */
const LS = { bankroll:"ghub_bankroll", username:"ghub_username", openBets:"ghub_openBets", history:"ghub_betHistory", board:"ghub_leaderboard" };
const getLS = (k,d)=> { try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch{ return d } };
const setLS = (k,v)=> localStorage.setItem(k, JSON.stringify(v));
function decimalFromAmerican(odds){ const o=Number(odds); return o<0 ? (100/-o)+1 : (o/100)+1; }
function roundHalf(n){ return Math.round(n*2)/2; }
function defaultLines(){ return (STATE.players||[]).map(p=>({ player:p.name, pts:roundHalf(p.ppg||0), reb:roundHalf(p.rpg||0), ast:roundHalf(p.apg||0), pra:roundHalf((p.ppg||0)+(p.rpg||0)+(p.apg||0)) })); }
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
function gradeBets(){
  const hist = getLS(LS.history, []); const pending = hist.filter(h=>h.status==="pending"); if(!pending.length) return toast("No pending bets.");
  let delta = 0; const map = Object.fromEntries(STATE.players.map(p=>[p.name,p]));
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

/* News + Photos */
async function loadNews(){
  try{
    const res = await fetch(JINA(UF.rss));
    if(!res.ok) throw new Error('rss '+res.status);
    const xml = await res.text();
    const items = parseRSS(xml).slice(0,12);
    $('#newsList').innerHTML = items.map(n=>`<article class="news-card"><h4><a href="${n.link}" target="_blank" rel="noopener">${esc(n.title)}</a></h4><p>${esc(n.summary||"")}</p><p class="meta">${new Date(n.date).toLocaleString()}</p></article>`).join('');
  }catch{ $('#newsList').innerHTML = `<article class="news-card"><h4>Welcome</h4><p class="muted">Auto schedule, stats, roster photos, news, props (for fun).</p></article>`; }
}
function parseRSS(xml){
  const items=[]; const itemRe=/<item[\s\S]*?<\/item>/gi, titleRe=/<title>([\s\S]*?)<\/title>/i, linkRe=/<link>([\s\S]*?)<\/link>/i, descRe=/<description>([\s\S]*?)<\/description>/i, dateRe=/<pubDate>([\s\S]*?)<\/pubDate>/i;
  (xml.match(itemRe)||[]).forEach(b=>{
    const title=(b.match(titleRe)?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,'').trim();
    const link=(b.match(linkRe)?.[1]||"").trim();
    const summary=(b.match(descRe)?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]*>/g,'').trim();
    const date=new Date(b.match(dateRe)?.[1]||Date.now()).toISOString();
    if(title && link) items.push({title, link, summary, date});
  }); return items;
}
const PHOTOS = [
  { src:"https://upload.wikimedia.org/wikipedia/commons/2/28/Exactech_Arena_at_the_Stephen_C._O%27Connell_Center_court_2016.jpg", alt:"Exactech Arena" },
  { src:"https://upload.wikimedia.org/wikipedia/commons/8/86/Florida_Gators_basketball_2006_crowd.jpg", alt:"Gators crowd" },
  { src:"https://upload.wikimedia.org/wikipedia/commons/0/0e/Billy_Donovan_2008.jpg", alt:"Billy Donovan" }
];
function loadPhotos(){ $('#photoGrid').innerHTML = PHOTOS.map(p=>`<div class="card"><img loading="lazy" src="${p.src}" alt="${esc(p.alt)}" class="photo"/><div class="meta">${esc(p.alt)}</div></div>`).join(''); }

/* Player modal */
function openPlayerModal(p){
  const modal=$('#scoutModal'), box=$('#scoutContent');
  if(!p){ box.innerHTML = `<p class="muted">No data.</p>`; modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); return; }
  box.innerHTML = `<h3 style="margin-top:0">${esc(p.name)}</h3><p class="meta"><a href="${p.link}" target="_blank" rel="noopener">Sports-Reference profile ↗</a></p>
    <table><tbody>
      <tr><td>GP</td><td>${p.gp??'—'}</td></tr><tr><td>MPG</td><td>${fmt(p.mpg)}</td></tr><tr><td>PPG</td><td>${fmt(p.ppg)}</td></tr>
      <tr><td>RPG</td><td>${fmt(p.rpg)}</td></tr><tr><td>APG</td><td>${fmt(p.apg)}</td></tr><tr><td>SPG</td><td>${fmt(p.spg)}</td></tr>
      <tr><td>BPG</td><td>${fmt(p.bpg)}</td></tr><tr><td>TOV</td><td>${fmt(p.tpg)}</td></tr><tr><td>FG%</td><td>${pct(p.fgPct)}</td></tr>
      <tr><td>3P%</td><td>${pct(p.threePct)}</td></tr><tr><td>FT%</td><td>${pct(p.ftPct)}</td></tr>
    </tbody></table>`;
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
}
$('#closeScout')?.addEventListener('click', ()=>{ const m=$('#scoutModal'); m.classList.add('hidden'); m.setAttribute('aria-hidden','true'); });
$('#scoutModal')?.addEventListener('click', (e)=>{ if(e.target.classList.contains('modal-bg')) $('#closeScout').click(); });

/* FALLBACK demo data (keeps site functional during outages) */
const FALLBACK = {
  players: {
    2026: [
      { name:"Gator Guard", link:"#", gp:30, mpg:30.1, ppg:17.2, rpg:3.1, apg:4.5, spg:1.2, bpg:0.2, tpg:2.1, fgPct:.445, threePct:.367, ftPct:.812 },
      { name:"Gator Wing",  link:"#", gp:31, mpg:28.4, ppg:14.0, rpg:5.6, apg:2.4, spg:0.9, bpg:0.6, tpg:1.8, fgPct:.471, threePct:.341, ftPct:.761 },
      { name:"Gator Big",   link:"#", gp:29, mpg:25.3, ppg:11.5, rpg:7.8, apg:1.1, spg:0.6, bpg:1.3, tpg:1.5, fgPct:.552, threePct:.100, ftPct:.701 }
    ]
  },
  schedule: {
    2026: [
      { idx:0, date:"Nov 7, 2025", time:"7:00 PM", opponent:"Stetson", at:"Home", location:"Exactech Arena", result:"", score:"", box:"", tv:"SECN+", venue:"Exactech Arena", city:"Gainesville, FL", record:"" },
      { idx:1, date:"Nov 12, 2025", time:"8:00 PM", opponent:"Florida State", at:"Home", location:"Rivalry Game", result:"", score:"", box:"", tv:"ESPN2", venue:"Exactech Arena", city:"Gainesville, FL", record:"" }
    ]
  }
};

/* INIT */
async function refreshAll(){
  fillSeasonSelects();
  await Promise.all([loadUFLogos(), loadUFHeadshots(), loadSchedule(), loadStats()]);
  renderPropsTable(); renderBetSlip(); bankrollUI(); renderLeaderboard(); renderHistory(); drawCompare(); loadPhotos(); loadNews();
}
function routeAndStart(){ route(); startHero(); }
document.addEventListener('DOMContentLoaded', async ()=>{ routeAndStart(); await refreshAll(); setInterval(async ()=>{ await Promise.all([loadSchedule(), loadStats(), loadUFLogos()]); renderPlayerStats(); renderTeamStats(); renderSchedule(); }, REFRESH_MS); });
