/* =========================================================
   Gators Hub — ESPN-only build (no Sports-Reference)
   Works on GitHub Pages (CORS-safe).
   - Roster + stats + schedule: ESPN JSON
   - Analytics: ESPN game summary boxscore
   - Banner: Wikimedia/Unsplash images
   ========================================================= */

(function () {
  "use strict";

  var CURRENT_SEASON = 2026;
  var SEASONS = [2026, 2025, 2024, 2023];
  var REFRESH_MS = 10 * 60 * 1000;

  var TEAM_ID = 57; // Florida
  var ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

  /* DOM helpers */
  var $ = (s, el) => (el || document).querySelector(s);
  var $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  var esc = (s) => String(s || "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  var fmt1 = (n) => (n===0||n)? Number(n).toFixed(1) : "—";
  var pct3 = (p) => (p===0||p)? Number(p).toFixed(3) : "—";
  var pad2 = (n) => String(n).padStart(2,"0");
  var toCSV = (rows) => rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  function toast(msg){ var t=$("#toast"); if(!t) return; t.textContent=msg; t.classList.remove("hidden"); setTimeout(()=>t.classList.add("hidden"),1600); }
  function diag(msg){ var d=$("#diag"); if(!d) return; d.style.display='block'; d.innerHTML += `<div class="card"><pre class="tiny">${esc(msg)}</pre></div>`; }

  /* Theme */
  function applyTheme(){ var saved=localStorage.getItem("ghub_theme")||"light"; document.documentElement.classList.toggle("dark", saved==="dark"); var t=$("#themeToggle"); if(t) t.textContent = saved==="dark" ? "☀️" : "🌙"; }
  $("#themeToggle")?.addEventListener("click", ()=>{ var now=(localStorage.getItem("ghub_theme")||"light")==="light"?"dark":"light"; localStorage.setItem("ghub_theme", now); applyTheme(); });
  applyTheme();

  /* Router */
  function showTab(tab){ $$(".tab").forEach(a=>a.classList.toggle("active", a.dataset.tab===tab)); $$(".panel").forEach(p=>p.classList.toggle("active", p.id===tab)); }
  function route(){ var m=location.hash.match(/^#\/([a-z]+)/i); showTab(m?m[1]:"schedule"); }
  window.addEventListener("hashchange", route);

  /* Banner */
  var HERO_IMAGES = [
    "https://upload.wikimedia.org/wikipedia/commons/2/28/Exactech_Arena_at_the_Stephen_C._O%27Connell_Center_court_2016.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/8/86/Florida_Gators_basketball_2006_crowd.jpg",
    "https://images.unsplash.com/photo-1521417531039-df0e627e8c0b?q=80&w=1200&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=1200&auto=format&fit=crop"
  ];
  var heroIdx=0;
  function renderHeroSlides(){ var mount=$("#heroImages"); if(!mount) return;
    mount.innerHTML = HERO_IMAGES.map((src,i)=>`<div class="slide${i===0?" active":""}" style="background-image:url('${src}')"></div>`).join("");
  }
  function setHero(i){ var mount=$("#heroImages"); if(!mount) return; $$(".slide", mount).forEach((s,idx)=>s.classList.toggle("active", idx===i)); }
  function startHero(){ renderHeroSlides(); setInterval(()=>{ heroIdx=(heroIdx+1)%HERO_IMAGES.length; setHero(heroIdx); }, 4000);
    $("#heroPrev")?.addEventListener("click", ()=>{ heroIdx=(heroIdx-1+HERO_IMAGES.length)%HERO_IMAGES.length; setHero(heroIdx); });
    $("#heroNext")?.addEventListener("click", ()=>{ heroIdx=(heroIdx+1)%HERO_IMAGES.length; setHero(heroIdx); });
  }

  /* State */
  var STATE = { season: CURRENT_SEASON, schedule: [], roster: [], stats: { team:{}, players:[] }, analytics: [] };

  /* Season selects */
  function fillSeasonSelects(){
    var opts = SEASONS.map(y=>`<option value="${y}" ${y===STATE.season?"selected":""}>${y-1}-${String(y).slice(-2)}</option>`).join("");
    $("#seasonSelect").innerHTML=opts; $("#statsSeason").innerHTML=opts; $("#rosterSeason").innerHTML=opts;
  }
  ["seasonSelect","statsSeason","rosterSeason"].forEach(id=>{
    document.addEventListener("change", (e)=>{ if(e.target && e.target.id===id){ STATE.season=Number(e.target.value); refreshAll(); }});
  });

  /* ESPN fetchers */
  function ok(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r; }
  function j(r){ return r.json(); }
  function espnTeam(){ return fetch(`${ESPN_BASE}/teams/${TEAM_ID}?enable=roster,statistics,record`).then(ok).then(j); }
  function espnSchedule(season,seasontype){ return fetch(`${ESPN_BASE}/teams/${TEAM_ID}/schedule?season=${season}&seasontype=${seasontype}`).then(ok).then(j); }
  function espnSummary(eventId){ return fetch(`${ESPN_BASE}/summary?event=${eventId}`).then(ok).then(j); }

  /* Loaders: roster + stats */
  async function loadRosterAndStats(){
    try{
      const data = await espnTeam();

      // Roster
      const athletes = (data?.team?.athletes||[]).flatMap(g=>g.items||[]);
      STATE.roster = athletes.map(a=>({
        id:a.id, name:a.displayName, pos:a.position?.abbreviation||"", number:a.jersey||"",
        headshot:a.headshot?.href || `https://source.boringavatars.com/beam/96/${encodeURIComponent(a.displayName)}`,
        hometown:a.homeTown||""
      }));

      // Team + players per-game
      const cats = data?.team?.statistics?.splits?.categories || data?.team?.team?.statistics?.splits?.categories || [];
      const teamStats = cats.reduce((acc,c)=>{ (c.stats||[]).forEach(s=>acc[s.name]=+s.value||0); return acc; },{});
      const players = (data?.team?.athletes||[]).flatMap(g=>(g.items||[]).map(a=>{
        const pc = a?.statistics?.splits?.categories || [];
        const m = pc.reduce((acc,c)=>{ (c.stats||[]).forEach(s=>acc[s.name]=+s.value||0); return acc; },{});
        return {
          id:a.id, name:a.displayName, link:`https://www.espn.com/mens-college-basketball/player/_/id/${a.id}`,
          gp:m.gamesPlayed??null, mpg:m.minutesPerGame??null, ppg:m.pointsPerGame??null, rpg:m.reboundsPerGame??null,
          apg:m.assistsPerGame??null, spg:m.stealsPerGame??null, bpg:m.blocksPerGame??null, tpg:m.turnoversPerGame??null,
          fgPct:m.fieldGoalPct??0, threePct:m.threePointFieldGoalPct??0, ftPct:m.freeThrowPct??0, headshot:a.headshot?.href||""
        };
      }));

      STATE.stats = { team: teamStats, players };

      renderRoster(); renderTeamStats(); renderPlayerStats(); fillCompare(); renderPropsTable();
    }catch(e){ diag("loadRosterAndStats: "+e.message);
      $("#rosterGrid").innerHTML=""; $("#rosterEmpty").style.display="block";
      $("#playerStats").innerHTML='<div class="card"><p class="tiny muted">Stats unavailable.</p></div>';
    }
  }

  /* Schedule */
  async function loadSchedule(){
    try{
      const [reg, post] = await Promise.all([espnSchedule(STATE.season,2), espnSchedule(STATE.season,3).catch(()=>({events:[]}))]);
      const items = [...(reg?.events||[]), ...(post?.events||[])];
      const games = items.map((ev,idx)=>{
        const comp = ev.competitions?.[0]||{};
        const uf   = (comp.competitors||[]).find(c=>c.team?.id==String(TEAM_ID))||{};
        const opp  = (comp.competitors||[]).find(c=>c.team?.id!=String(TEAM_ID))||{};
        const dt   = new Date(ev.date);
        return {
          idx, id:ev.id,
          date: dt.toLocaleDateString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",weekday:"short"}),
          time: dt.toLocaleTimeString("en-US",{timeZone:"America/New_York",hour:"numeric",minute:"2-digit"}),
          opponent: opp.team?.displayName||"TBA",
          at: uf.homeAway==="home"?"Home":"Away",
          venue: comp.venue?.fullName||"", city: comp.venue?.address?.city||"", tv: (comp.broadcasts?.[0]?.names?.[0])||"",
          result: uf.winner===true?"W":(opp.winner===true?"L":""),
          score: (uf.score && opp.score)? (uf.score+"-"+opp.score) : "",
          box: ev.links?.find(l=>/boxscore/i.test(l.text||""))?.href || `https://www.espn.com/mens-college-basketball/game/_/gameId/${ev.id}`
        };
      });
      STATE.schedule = games;
      renderSchedule(); renderCountdown(); fillTicketGames();
    }catch(e){ diag("loadSchedule: "+e.message);
      $("#scheduleWrap").innerHTML='<div class="card"><p class="tiny muted">Schedule unavailable.</p></div>';
    }
  }

  /* Analytics */
  function poss(t){ return (t.fieldGoalsAttempted||0)+0.475*(t.freeThrowsAttempted||0)-(t.offensiveRebounds||0)+(t.turnovers||0); }
  function efg(t){ var fgm=t.fieldGoalsMade||0, fg3=t.threePointFieldGoalsMade||0, fga=t.fieldGoalsAttempted||0; return fga? (fgm+0.5*fg3)/fga : 0; }
  function tor(t){ var to=t.turnovers||0, fga=t.fieldGoalsAttempted||0, fta=t.freeThrowsAttempted||0; var d=fga+0.475*fta; return d? to/d : 0; }
  async function loadAnalytics(){
    const done = STATE.schedule.filter(g=>g.result).slice(-10);
    const rows = [];
    for(const g of done){
      try{
        const s = await espnSummary(g.id);
        const box = s?.boxscore?.teams || [];
        const us = box.find(t=>t.team?.id==String(TEAM_ID))?.statistics?.[0]?.stats || [];
        const them = box.find(t=>t.team?.id!=String(TEAM_ID))?.statistics?.[0]?.stats || [];
        const map = (arr)=>Object.fromEntries(arr.map(x=>[x.name, Number(x.value)||0]));
        const our = map(us), opp = map(them);
        const pOur = poss(our), pOpp = poss(opp);
        const possEst = Math.max(1, Math.round((pOur+pOpp)/2));
        const ptsUs = our.points||0, ptsOpp = opp.points||0;
        rows.push({
          date:g.date, opp:g.opponent, at:g.at, score:g.score,
          ortg:+(ptsUs*100/possEst).toFixed(1), drtg:+(ptsOpp*100/possEst).toFixed(1),
          pace:+((possEst*40)/((our.minutes||200))).toFixed(1),
          efg:+(efg(our)*100).toFixed(1), toPct:+(tor(our)*100).toFixed(1),
          box:g.box
        });
      }catch(e){ /* skip if not ready */ }
    }
    STATE.analytics = rows; renderAnalytics();
  }

  /* Renderers */
  function renderSchedule(){
    var filter=$("#schedFilter")?.value||"ALL";
    var rows=STATE.schedule.filter(g=>filter==="ALL"?true:g.at===filter);
    var mount=$("#scheduleWrap"); if(!mount) return;
    mount.innerHTML = `
      <table id="scheduleTable">
        <thead><tr><th>Date</th><th>Time (ET)</th><th>Opponent</th><th>H/A</th><th>Result</th><th>Score</th><th>Links</th></tr></thead>
        <tbody>
          ${rows.map(g=>`
            <tr class="game-row" data-id="${g.id}">
              <td>${esc(g.date)}</td><td>${esc(g.time)}</td><td><strong>${esc(g.opponent)}</strong></td>
              <td>${g.at}</td><td>${esc(g.result||"")}</td><td>${esc(g.score||"")}</td>
              <td><a class="boxlink" target="_blank" rel="noopener" href="${g.box}">Box ↗</a></td>
            </tr>
            <tr class="details" data-det="${g.id}" style="display:none">
              <td colspan="7">
                <div style="display:flex;gap:16px;flex-wrap:wrap">
                  <div><span class="tiny muted">Venue</span><div>${esc(g.venue||"")}</div></div>
                  <div><span class="tiny muted">City</span><div>${esc(g.city||"")}</div></div>
                  <div><span class="tiny muted">TV</span><div>${esc(g.tv||"")}</div></div>
                  <div><button class="btn ghost addCal" data-game='${esc(JSON.stringify(g))}'>Add to Calendar</button></div>
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>`;
    $$("#scheduleTable .game-row").forEach(tr=>tr.addEventListener("click", ()=>{ var id=tr.dataset.id; var det=$(`#scheduleTable [data-det="${id}"]`); if(det) det.style.display = det.style.display==="none" ? "" : "none"; }));
    $$("#scheduleTable .addCal").forEach(b=>b.addEventListener("click", (e)=>{ e.stopPropagation(); downloadICS(JSON.parse(b.dataset.game)); }));
  }
  $("#schedFilter")?.addEventListener("change", renderSchedule);
  $("#refreshSchedule")?.addEventListener("click", loadSchedule);
  $("#exportScheduleCsv")?.addEventListener("click", ()=>{
    var rows=[["Date","Time","Opponent","H/A","Result","Score","TV","Venue","City","Box"]];
    STATE.schedule.forEach(g=>rows.push([g.date,g.time,g.opponent,g.at,g.result||"",g.score||"",g.tv||"",g.venue||"",g.city||"",g.box||""]));
    var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([toCSV(rows)],{type:"text/csv"})); a.download="gators_schedule.csv"; a.click();
  });
  function downloadICS(g){
    var start = new Date(`${g.date} ${g.time} ET`);
    var end = new Date(start.getTime()+2*60*60*1000);
    var toICS = (d)=> d.getUTCFullYear()+pad2(d.getUTCMonth()+1)+pad2(d.getUTCDate())+'T'+pad2(d.getUTCHours())+pad2(d.getUTCMinutes())+pad2(d.getUTCSeconds())+'Z';
    var ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Gators Hub//EN","BEGIN:VEVENT",
      `UID:${g.id}@gatorshub`,`DTSTAMP:${toICS(new Date())}`,`DTSTART:${toICS(start)}`,`DTEND:${toICS(end)}`,
      `SUMMARY:Florida vs ${g.opponent}`,`LOCATION:${g.venue?g.venue+", ":""}${g.city||""}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
    var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([ics],{type:"text/calendar"})); a.download=`UF_vs_${g.opponent.replace(/\s+/g,'_')}.ics`; a.click();
  }

  function renderRoster(){
    var q=$("#rosterFilter")?.value.toLowerCase()||""; var favOnly=$("#favOnly")?.checked; var favs=getFavs();
    var rows=STATE.roster.slice(); if(q) rows=rows.filter(p=>p.name.toLowerCase().includes(q)); if(favOnly) rows=rows.filter(p=>favs.includes(p.name));
    var mount=$("#rosterGrid"); if(!mount) return;
    if(!rows.length){ mount.innerHTML=""; $("#rosterEmpty").style.display="block"; return; }
    $("#rosterEmpty").style.display="none";
    mount.innerHTML = rows.map(p=>`
      <div class="card player" data-player="${esc(p.name)}">
        <div style="display:flex;gap:12px;align-items:center;">
          <img loading="lazy" src="${p.headshot}" alt="${esc(p.name)} headshot" width="64" height="64" style="border-radius:12px;object-fit:cover"/>
          <div><div><strong>${esc(p.name)}</strong> <span class="tiny muted">#${esc(p.number||"")} ${esc(p.pos||"")}</span></div><div class="meta">${esc(p.hometown||"")}</div></div>
          <button class="btn ghost" style="margin-left:auto" data-fav="${esc(p.name)}">${favs.includes(p.name)?"⭐":"☆"}</button>
        </div>
      </div>`).join("");
    $$("#rosterGrid [data-fav]").forEach(b=>b.addEventListener("click", (e)=>{ e.stopPropagation(); toggleFavorite(b.dataset.fav); renderRoster(); }));
    $$("#rosterGrid .player").forEach(card=>card.addEventListener("click", ()=>{ var p=STATE.stats.players.find(x=>x.name===card.dataset.player); openPlayerModal(p); }));
  }
  $("#rosterFilter")?.addEventListener("input", renderRoster);
  $("#favOnly")?.addEventListener("change", renderRoster);
  $("#refreshRoster")?.addEventListener("click", loadRosterAndStats);

  function renderTeamStats(){
    var t=STATE.stats.team||{};
    $("#teamStats").innerHTML = `<table><thead><tr><th>PTS/G</th><th>REB/G</th><th>AST/G</th><th>STL/G</th><th>BLK/G</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead>
      <tbody><tr><td class="stat">${fmt1(t.pointsPerGame)}</td><td>${fmt1(t.reboundsPerGame)}</td><td>${fmt1(t.assistsPerGame)}</td><td>${fmt1(t.stealsPerGame)}</td><td>${fmt1(t.blocksPerGame)}</td><td>${pct3(t.fieldGoalPct)}</td><td>${pct3(t.threePointFieldGoalPct)}</td><td>${pct3(t.freeThrowPct)}</td></tr></tbody></table>`;
  }
  function renderPlayerStats(){
    var q=$("#playerFilter")?.value.toLowerCase()||""; var rows=STATE.stats.players.slice(); if(q) rows=rows.filter(p=>p.name.toLowerCase().includes(q));
    rows.sort((a,b)=>(b.ppg||0)-(a.ppg||0));
    $("#playerStats").innerHTML = `<table id="playersTable"><thead><tr><th>Player</th><th>GP</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>
      ${rows.map(p=>`<tr class="plink" data-player="${esc(p.name)}"><td><div style="display:flex;align-items:center;gap:8px">${p.headshot?`<img src="${p.headshot}" width="20" height="20" style="border-radius:50%">`:""}<strong>${esc(p.name)}</strong></div></td><td>${p.gp??"—"}</td><td>${fmt1(p.mpg)}</td><td class="stat">${fmt1(p.ppg)}</td><td>${fmt1(p.rpg)}</td><td>${fmt1(p.apg)}</td><td>${fmt1(p.spg)}</td><td>${fmt1(p.bpg)}</td><td>${fmt1(p.tpg)}</td><td>${pct3(p.fgPct)}</td><td>${pct3(p.threePct)}</td><td>${pct3(p.ftPct)}</td></tr>`).join("")}
    </tbody></table>`;
    $$("#playersTable .plink").forEach(tr=>tr.addEventListener("click", ()=>{ var p=STATE.stats.players.find(x=>x.name===tr.dataset.player); openPlayerModal(p); }));
  }
  $("#playerFilter")?.addEventListener("input", renderPlayerStats);
  $("#refreshStats")?.addEventListener("click", loadRosterAndStats);
  $("#exportPlayersCsv")?.addEventListener("click", ()=>{
    var rows=[["Player","GP","MPG","PPG","RPG","APG","SPG","BPG","TOV","FG%","3P%","FT%"]];
    STATE.stats.players.forEach(p=>rows.push([p.name,p.gp,p.mpg,p.ppg,p.rpg,p.apg,p.spg,p.bpg,p.tpg,p.fgPct,p.threePct,p.ftPct]));
    var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([toCSV(rows)],{type:"text/csv"})); a.download="gators_players.csv"; a.click();
  });

  /* Compare */
  function fillCompare(){ var A=$("#cmpA"), B=$("#cmpB"); if(!A||!B) return; A.innerHTML=""; B.innerHTML="";
    STATE.stats.players.forEach(p=>{ A.add(new Option(p.name,p.name)); B.add(new Option(p.name,p.name)); });
    if(STATE.stats.players[0]) A.value=STATE.stats.players[0].name; if(STATE.stats.players[1]) B.value=STATE.stats.players[1].name;
  }
  $("#drawCompare")?.addEventListener("click", drawCompare);
  function drawCompare(){
    var a=STATE.stats.players.find(p=>p.name===($("#cmpA")?.value||""));
    var b=STATE.stats.players.find(p=>p.name===($("#cmpB")?.value||""));
    if(!a||!b) return;
    var metrics=["ppg","rpg","apg","spg","bpg","tpg"]; var maxes={ppg:30,rpg:15,apg:8,spg:3,bpg:3,tpg:5};
    var w=800,h=320,pad=40,col=(w-2*pad)/metrics.length; var bar=(val,max)=>Math.max(2,(val/max)*(h-2*pad));
    var svg=[`<svg viewBox="0 0 ${w} ${h}" width="100%" height="320">`,`<g font-size="12" fill="currentColor">`];
    metrics.forEach((m,i)=>{ var x=pad+i*col+col/2; svg.push(`<text x="${x}" y="${h-pad+18}" text-anchor="middle">${m.toUpperCase()}</text>`); svg.push(`<rect x="${x-22}" y="${h-pad-bar(a[m]||0,maxes[m])}" width="16" height="${bar(a[m]||0,maxes[m])}" rx="4" fill="#0021A5"></rect>`); svg.push(`<rect x="${x+6}" y="${h-pad-bar(b[m]||0,maxes[m])}" width="16" height="${bar(b[m]||0,maxes[m])}" rx="4" fill="#FA4616"></rect>`); });
    svg.push(`</g><g font-size="14"><text x="${pad}" y="${pad-8}"><tspan fill="#0021A5">●</tspan> ${esc(a.name)}</text><text x="${pad+200}" y="${pad-8}"><tspan fill="#FA4616">●</tspan> ${esc(b.name)}</text></g></svg>`);
    $("#compareWrap").innerHTML = svg.join("");
  }

  /* Analytics render */
  function renderAnalytics(){
    var rows=STATE.analytics.slice().reverse();
    $("#analyticsWrap").innerHTML = rows.length
      ? `<table><thead><tr><th>Date</th><th>Opponent</th><th>H/A</th><th>Score</th><th>ORtg</th><th>DRtg</th><th>Pace</th><th>eFG%</th><th>TO%</th><th>Box</th></tr></thead><tbody>
          ${rows.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.opp)}</td><td>${r.at}</td><td>${esc(r.score)}</td><td class="stat">${r.ortg}</td><td>${r.drtg}</td><td>${r.pace}</td><td>${r.efg}</td><td>${r.toPct}</td><td><a class="boxlink" target="_blank" rel="noopener" href="${r.box}">↗</a></td></tr>`).join("")}
        </tbody></table>`
      : `<div class="card"><p class="tiny muted">No completed games yet.</p></div>`;
    var w=800,h=200,pad=24, vals=rows.map(r=>r.ortg).filter(v=>typeof v==="number");
    if(vals.length<2){ $("#analyticsTrend").innerHTML=""; return; }
    var n=vals.length,min=Math.min(...vals,80),max=Math.max(...vals,130);
    var X=i=>pad+(i*(w-2*pad))/Math.max(1,n-1); var Y=v=>h-pad-((v-min)/(max-min||1))*(h-2*pad);
    var path=vals.map((v,i)=>(i?"L":"M")+X(i)+","+Y(v)).join(" ");
    $("#analyticsTrend").innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="200"><path d="${path}" fill="none" stroke="#FA4616" stroke-width="3"/><g font-size="12" fill="currentColor"><text x="${pad}" y="${pad}">ORtg trend (last ${n})</text></g></svg>`;
  }
  $("#refreshAnalytics")?.addEventListener("click", loadAnalytics);

  /* Player modal */
  function openPlayerModal(p){
    var modal=$("#scoutModal"), box=$("#scoutContent");
    if(!p){ box.innerHTML='<p class="muted">No data.</p>'; modal.classList.remove("hidden"); modal.setAttribute("aria-hidden","false"); return; }
    box.innerHTML = `<h3 style="margin-top:0">${esc(p.name)}</h3><p class="meta"><a href="${p.link}" target="_blank" rel="noopener">ESPN player profile ↗</a></p>
      <table><tbody>
        <tr><td>GP</td><td>${p.gp??"—"}</td></tr><tr><td>MPG</td><td>${fmt1(p.mpg)}</td></tr><tr><td>PPG</td><td>${fmt1(p.ppg)}</td></tr>
        <tr><td>RPG</td><td>${fmt1(p.rpg)}</td></tr><tr><td>APG</td><td>${fmt1(p.apg)}</td></tr><tr><td>SPG</td><td>${fmt1(p.spg)}</td></tr>
        <tr><td>BPG</td><td>${fmt1(p.bpg)}</td></tr><tr><td>TOV</td><td>${fmt1(p.tpg)}</td></tr><tr><td>FG%</td><td>${pct3(p.fgPct)}</td></tr>
        <tr><td>3P%</td><td>${pct3(p.threePct)}</td></tr><tr><td>FT%</td><td>${pct3(p.ftPct)}</td></tr>
      </tbody></table>`;
    modal.classList.remove("hidden"); modal.setAttribute("aria-hidden","false");
  }
  $("#closeScout")?.addEventListener("click", ()=>{ var m=$("#scoutModal"); m.classList.add("hidden"); m.setAttribute("aria-hidden","true"); });
  $("#scoutModal")?.addEventListener("click", (e)=>{ if(e.target.classList.contains("modal-bg")) $("#closeScout").click(); });

  /* Props / Leaderboard (local only) */
  var LS={bankroll:"ghub_bankroll",username:"ghub_username",openBets:"ghub_openBets",history:"ghub_betHistory",board:"ghub_leaderboard"};
  var getLS=(k,d)=>{ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch{ return d; } };
  var setLS=(k,v)=>localStorage.setItem(k, JSON.stringify(v));
  function roundHalf(n){ return Math.round(n*2)/2; }
  function defaultLines(){ return (STATE.stats.players||[]).map(p=>({ player:p.name, pts:roundHalf(p.ppg||0), reb:roundHalf(p.rpg||0), ast:roundHalf(p.apg||0), pra:roundHalf((p.ppg||0)+(p.rpg||0)+(p.apg||0)) })); }
  function bankrollUI(){ $("#bankroll").textContent="$"+Number(getLS(LS.bankroll,0)).toLocaleString(); if($("#usernameInput")) $("#usernameInput").value=getLS(LS.username,"")||""; }
  function upsertLeaderboard(user,bankroll){ var board=getLS(LS.board,[]); var i=board.findIndex(b=>b.user===user); if(i>=0)board[i].bankroll=bankroll; else board.push({user,bankroll,updated:Date.now()}); setLS(LS.board,board); renderLeaderboard(); }
  function renderLeaderboard(){ var board=getLS(LS.board,[]).sort((a,b)=>b.bankroll-a.bankroll); $("#leaderboard").innerHTML = `<table><thead><tr><th>#</th><th>User</th><th>Bankroll</th><th>Updated</th></tr></thead><tbody>${board.map((b,i)=>`<tr><td>${i+1}</td><td>${esc(b.user)}</td><td>$${Number(b.bankroll).toLocaleString()}</td><td>${new Date(b.updated||Date.now()).toLocaleString()}</td></tr>`).join("")}</tbody></table>`; }
  function fillTicketGames(){ var sel=$("#ticketGame"); if(!sel) return; sel.innerHTML = `<option value="">(None)</option>`+STATE.schedule.map(g=>`<option value="${esc(`${g.date}|${g.time}|${g.opponent}`)}">${esc(`${g.date} – ${g.opponent} (${g.at})`)}</option>`).join(""); }
  function renderPropsTable(){
    var lines = defaultLines();
    $("#propsTable").innerHTML = `<table><thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th><th>P+R+A</th><th>Pick</th><th>Add</th></tr></thead><tbody>
      ${lines.map(l=>`<tr><td><strong>${esc(l.player)}</strong></td><td>${l.pts}</td><td>${l.reb}</td><td>${l.ast}</td><td>${l.pra}</td>
        <td><select data-player="${esc(l.player)}" class="pick"><option value="PTS_O">PTS Over</option><option value="PTS_U">PTS Under</option><option value="REB_O">REB Over</option><option value="REB_U">REB Under</option><option value="AST_O">AST Over</option><option value="AST_U">AST Under</option><option value="PRA_O">PRA Over</option><option value="PRA_U">PRA Under</option></select></td>
        <td><button class="btn addBet" data-player="${esc(l.player)}">Add</button></td></tr>`).join("")}
    </tbody></table>`;
    $$(".addBet").forEach(b=>b.addEventListener("click", ()=>{ var player=b.dataset.player; var sel=b.closest("tr").querySelector(".pick").value; var slip=getLS(LS.openBets,[]); slip.push({player, market:sel, odds:-110}); setLS(LS.openBets, slip); renderBetSlip(); toast("Added to slip"); }));
  }
  function renderBetSlip(){ var slip=getLS(LS.openBets,[]); $("#betList").innerHTML = slip.length? slip.map((b,i)=>`<div class="card"><div><strong>${esc(b.player)}</strong> — ${b.market.replace('_',' ')} <span class="badge">@${b.odds}</span></div><div class="meta">Slip item #${i+1}</div></div>`).join("") : `<p class="muted tiny">No selections yet.</p>`; }
  function handleBankroll(){ var user=$("#usernameInput")?.value.trim()||"Guest"; setLS(LS.username,user); setLS(LS.bankroll,1000); upsertLeaderboard(user,1000); bankrollUI(); toast("Bankroll set to $1,000"); }
  function resetBankroll(){ setLS(LS.bankroll,0); bankrollUI(); toast("Bankroll reset"); }
  function placeBets(){
    var wager=Math.max(1, Number($("#wagerInput")?.value||0)); var bank=getLS(LS.bankroll,0); var slip=getLS(LS.openBets,[]); var gameId=$("#ticketGame")?.value||"";
    if(!slip.length) return toast("Add picks first."); if(bank<wager) return toast("Not enough bankroll.");
    var hist=getLS(LS.history,[]); hist.push({ placedAt:Date.now(), wager, gameId, bets:slip, status:"pending" });
    setLS(LS.history, hist); setLS(LS.openBets, []); setLS(LS.bankroll, bank-wager); renderBetSlip(); bankrollUI(); renderHistory(); toast("Bets placed!");
  }
  $("#startBankroll")?.addEventListener("click", handleBankroll);
  $("#resetBankroll")?.addEventListener("click", resetBankroll);
  $("#placeBets")?.addEventListener("click", placeBets);
  $("#clearBets")?.addEventListener("click", ()=>{ setLS(LS.openBets,[]); renderBetSlip(); toast("Slip cleared"); });
  $("#exportHistory")?.addEventListener("click", ()=>{ var h=getLS(LS.history,[]); var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(h,null,2)],{type:"application/json"})); a.download='bet_history.json'; a.click(); });
  $("#importHistory")?.addEventListener("change", async (e)=>{ var f=e.target.files?.[0]; if(!f) return; var text=await f.text(); setLS(LS.history, JSON.parse(text)); renderHistory(); toast("History imported"); });
  $("#clearHistory")?.addEventListener("click", ()=>{ setLS(LS.history, []); renderHistory(); toast("History cleared"); });
  function renderHistory(){
    var hist=getLS(LS.history,[]); var key=g=>`${g.date}|${g.time}|${g.opponent}`; var map=new Map(STATE.schedule.map(g=>[key(g), g]));
    $("#historyWrap").innerHTML = `<table><thead><tr><th>Placed</th><th>Game</th><th>Wager</th><th>Status</th><th>Payout</th><th>Picks</th></tr></thead><tbody>
      ${hist.slice().reverse().map(t=>{ var g=t.gameId?map.get(t.gameId):null; var gameTxt = g ? `${g.date} vs ${g.opponent}${g.result?` (${g.result})`:""}${g.box?` • <a class="boxlink" href="${g.box}" target="_blank" rel="noopener">box ↗</a>`:""}` : "—";
        return `<tr><td>${new Date(t.placedAt).toLocaleString()}</td><td>${gameTxt}</td><td>$${Number(t.wager).toLocaleString()}</td><td>${esc(t.status||'pending')}</td><td>${t.payout?('$'+Number(t.payout).toLocaleString()):'—'}</td><td>${t.bets.map(b=>`${esc(b.player)} (${b.market.replace('_',' ')})`).join('<br/>')}</td></tr>`; }).join("")}
    </tbody></table>`;
  }

  /* Favorites */
  function getFavs(){ try{ return JSON.parse(localStorage.getItem("ghub_favs"))||[]; }catch{ return []; } }
  function setFavs(v){ localStorage.setItem("ghub_favs", JSON.stringify(v)); }
  function toggleFavorite(name){ var favs=getFavs(); var i=favs.indexOf(name); if(i>=0) favs.splice(i,1); else favs.push(name); setFavs(favs); }

  /* Countdown */
  function renderCountdown(){
    var el=$("#nextGame"); if(!el || !STATE.schedule.length) return;
    var upcoming = STATE.schedule.map(g=>Object.assign({}, g, { t: Date.parse(`${g.date} ${g.time} ET`) }))
      .filter(g=>!isNaN(g.t) && g.t>Date.now()).sort((a,b)=>a.t-b.t)[0];
    if(!upcoming){ el.textContent="Next game: TBA"; return; }
    (function tick(){ var diff=upcoming.t - Date.now(); if(diff<=0){ el.textContent=`Gameday: vs ${upcoming.opponent}!`; return; }
      var h=Math.floor(diff/3.6e6), m=Math.floor((diff%3.6e6)/6e4), s=Math.floor((diff%6e4)/1e3);
      el.textContent = `Next game vs ${upcoming.opponent}: ${h}h ${m}m ${s}s`;
      requestAnimationFrame(()=>setTimeout(tick,500));
    })();
  }

  /* Photos & News */
  function loadPhotos(){ var PHOTOS = HERO_IMAGES.map((src,i)=>({src, alt:i===0?"Exactech Arena":"Gators"}));
    $("#photoGrid").innerHTML = PHOTOS.map(p=>`<div class="card"><img loading="lazy" src="${p.src}" alt="${esc(p.alt)}"><div class="meta">${esc(p.alt)}</div></div>`).join('');
  }
  function loadNews(){
    fetch("https://floridagators.com/rss.aspx?path=mbball").then(r=>r.text()).then(xml=>{
      var items=[], itemRe=/<item[\s\S]*?<\/item>/gi, titleRe=/<title>([\s\S]*?)<\/title>/i, linkRe=/<link>([\s\S]*?)<\/link>/i, dateRe=/<pubDate>([\s\S]*?)<\/pubDate>/i, descRe=/<description>([\s\S]*?)<\/description>/i;
      (xml.match(itemRe)||[]).slice(0,12).forEach(b=>{
        var title=(b.match(titleRe)?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,'').trim();
        var link=(b.match(linkRe)?.[1]||"").trim();
        var summary=(b.match(descRe)?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]*>/g,'').trim();
        var date=new Date(b.match(dateRe)?.[1]||Date.now()).toISOString();
        if(title && link) items.push({title, link, summary, date});
      });
      $("#newsList").innerHTML = items.map(n=>`<article class="news-card"><h4><a href="${n.link}" target="_blank" rel="noopener">${esc(n.title)}</a></h4><p>${esc(n.summary||"")}</p><p class="meta">${new Date(n.date).toLocaleString()}</p></article>`).join('');
    }).catch(()=>{ $("#newsList").innerHTML = '<article class="news-card"><h4>Welcome</h4><p class="muted">Live schedule/roster/stats + analytics.</p></article>'; });
  }

  /* Init */
  function fillTicketGames(){ var sel=$("#ticketGame"); if(!sel) return; sel.innerHTML = `<option value="">(None)</option>` + STATE.schedule.map(g=>`<option value="${esc(`${g.date}|${g.time}|${g.opponent}`)}">${esc(`${g.date} – ${g.opponent} (${g.at})`)}</option>`).join(''); }
  async function refreshAll(){
    fillSeasonSelects();
    await Promise.all([loadRosterAndStats(), loadSchedule()]);
    renderPropsTable(); renderBetSlip(); bankrollUI(); renderLeaderboard(); loadPhotos(); loadNews(); await loadAnalytics();
  }
  function start(){ route(); startHero(); refreshAll();
    setInterval(async ()=>{ try{ await Promise.all([loadRosterAndStats(), loadSchedule()]); await loadAnalytics(); }catch(e){ diag("auto refresh: "+e.message); } }, REFRESH_MS);
  }
  document.addEventListener("DOMContentLoaded", start);
})();
