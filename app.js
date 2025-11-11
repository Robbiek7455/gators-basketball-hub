/* =========================================================
   Gators Hub (stable build) — 3 files, GH Pages ready
   - Roster & schedule: ESPN (CORS-safe JSON)
   - Player stats: Sports-Reference per_game (via mirror)
   - Banner: robust rotating photos
   ========================================================= */

(function(){
  "use strict";

  /* ---------- Settings ---------- */
  var CURRENT_SEASON = 2026;
  var SEASONS = [2026, 2025, 2024, 2023];
  var REFRESH_MS = 10 * 60 * 1000;

  /* ESPN team id for Florida */
  var TEAM_ID = 57;
  var ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

  /* Sports-Reference (via read-only CORS mirror) */
  function JINA(url){ return "https://r.jina.ai/http://" + url.replace(/^https?:\/\//,''); }
  var SR = {
    schedule: function(yr){ return "https://www.sports-reference.com/cbb/schools/florida/men/"+yr+"-schedule.html"; },
    team:     function(yr){ return "https://www.sports-reference.com/cbb/schools/florida/men/"+yr+".html"; }
  };

  /* ---------- DOM helpers ---------- */
  function $(s, el){ return (el||document).querySelector(s); }
  function $$(s, el){ return Array.prototype.slice.call((el||document).querySelectorAll(s)); }
  function esc(s){ return String(s||"").replace(/[&<>"']/g,function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; }); }
  function fmt1(n){ return (n===0||n)? Number(n).toFixed(1) : "—"; }
  function pct3(p){ return (p===0||p)? Number(p).toFixed(3) : "—"; }
  function pad2(n){ return String(n).padStart(2,"0"); }
  function toCSV(rows){ return rows.map(function(r){ return r.map(function(v){ return '"'+String(v==null?"":v).replace(/"/g,'""')+'"'; }).join(','); }).join('\r\n'); }
  function toast(msg){ var t=$("#toast"); if(!t) return; t.textContent=msg; t.classList.remove("hidden"); setTimeout(function(){ t.classList.add("hidden"); },1600); }
  function diag(msg){ var d=$("#diag"); if(!d) return; d.style.display='block'; d.innerHTML += '<div class="card"><pre class="tiny">'+esc(msg)+'</pre></div>'; }

  /* ---------- Theme ---------- */
  function applyTheme(){
    var saved = localStorage.getItem("ghub_theme") || "light";
    document.documentElement.classList.toggle("dark", saved==="dark");
    var tgl=$("#themeToggle"); if(tgl) tgl.textContent = saved==="dark" ? "☀️" : "🌙";
  }
  $("#themeToggle") && $("#themeToggle").addEventListener("click", function(){
    var now = (localStorage.getItem("ghub_theme")||"light")==="light"?"dark":"light";
    localStorage.setItem("ghub_theme", now); applyTheme();
  });
  applyTheme();

  /* ---------- Router ---------- */
  function showTab(tab){ $$(".tab").forEach(function(a){ a.classList.toggle("active", a.dataset.tab===tab); }); $$(".panel").forEach(function(p){ p.classList.toggle("active", p.id===tab); }); }
  function route(){ var m = location.hash.match(/^#\/([a-z]+)/i); showTab(m?m[1]:"schedule"); }
  window.addEventListener("hashchange", route);

  /* ---------- Hero / Banner ---------- */
  var HERO_IMAGES = [
    // Reliable sources; add/remove freely.
    "https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=1200&auto=format&fit=crop",      /* arena generic */
    "https://upload.wikimedia.org/wikipedia/commons/8/86/Florida_Gators_basketball_2006_crowd.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/2/28/Exactech_Arena_at_the_Stephen_C._O%27Connell_Center_court_2016.jpg",
    "https://images.unsplash.com/photo-1521417531039-df0e627e8c0b?q=80&w=1200&auto=format&fit=crop"     /* basketball */
  ];
  var heroIdx=0;
  function renderHeroSlides(){
    var mount=$("#heroImages"); if(!mount) return;
    mount.innerHTML = HERO_IMAGES.map(function(src,i){ return '<div class="slide'+(i===0?' active':'')+'" style="background-image:url(\''+src+'\')"></div>'; }).join('');
  }
  function setHero(i){ var mount=$("#heroImages"); if(!mount) return; $$(".slide", mount).forEach(function(s,idx){ s.classList.toggle("active", idx===i); }); }
  function startHero(){ renderHeroSlides(); setInterval(function(){ heroIdx=(heroIdx+1)%HERO_IMAGES.length; setHero(heroIdx); }, 4000); $("#heroPrev")&&$("#heroPrev").addEventListener("click", function(){ heroIdx=(heroIdx-1+HERO_IMAGES.length)%HERO_IMAGES.length; setHero(heroIdx); }); $("#heroNext")&&$("#heroNext").addEventListener("click", function(){ heroIdx=(heroIdx+1)%HERO_IMAGES.length; setHero(heroIdx); }); }

  /* ---------- State ---------- */
  var STATE = { season: CURRENT_SEASON, schedule: [], roster: [], players: [], team: {}, analytics: [] };

  /* ---------- Season Selects ---------- */
  function fillSeasonSelects(){
    var opts = SEASONS.map(function(y){ return '<option value="'+y+'" '+(y===STATE.season?'selected':'')+'>'+(y-1)+'-'+String(y).slice(-2)+'</option>'; }).join('');
    $("#seasonSelect").innerHTML = opts; $("#statsSeason").innerHTML = opts; $("#rosterSeason").innerHTML = opts;
  }
  ["seasonSelect","statsSeason","rosterSeason"].forEach(function(id){
    document.addEventListener("change", function(e){ if(e.target && e.target.id===id){ STATE.season = Number(e.target.value); refreshAll(); }});
  });

  /* ---------- ESPN fetchers (CORS-safe) ---------- */
  function espnTeam(){
    var url = ESPN_BASE + "/teams/" + TEAM_ID + "?enable=roster,statistics,record";
    return fetch(url).then(ok).then(json).catch(function(e){ diag("espnTeam: "+e.message); throw e; });
  }
  function espnSchedule(season, seasontype){
    var url = ESPN_BASE + "/teams/" + TEAM_ID + "/schedule?season=" + season + "&seasontype=" + seasontype;
    return fetch(url).then(ok).then(json).catch(function(e){ diag("espnSchedule: "+e.message); throw e; });
  }
  function ok(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r; }
  function json(r){ return r.json(); }

  /* ---------- Sports-Reference HTML ---------- */
  function fetchHTML(url){
    return fetch(JINA(url)).then(ok).then(function(r){ return r.text(); })
      .then(function(txt){ return new DOMParser().parseFromString(txt, "text/html"); })
      .catch(function(e){ diag("fetchHTML failed: "+url+"\n"+e.message); throw e; });
  }
  function commentedTable(doc, id){
    var live = doc.querySelector("#"+id); if(live) return live;
    var it = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT, null);
    var n, html=""; while(n=it.nextNode()){ if(n.nodeValue && n.nodeValue.indexOf('id="'+id+'"')!==-1){ html=n.nodeValue; break; } }
    if(!html) return null; var frag = new DOMParser().parseFromString(html, "text/html"); return frag.querySelector("#"+id);
  }

  /* ==================== LOADERS ==================== */

  // ROSTER (ESPN only, no fallbacks)
  function loadRoster(){
    return espnTeam().then(function(data){
      var athletes = (data?.team?.athletes || []).flatMap(function(g){ return g.items||[]; });
      STATE.roster = athletes.map(function(a){
        return {
          id:a.id, name:a.displayName, pos:a.position?.abbreviation||"", number:a.jersey||"",
          headshot:a.headshot?.href || "https://source.boringavatars.com/beam/96/"+encodeURIComponent(a.displayName),
          hometown:a.homeTown||""
        };
      });
      renderRoster();
    }).catch(function(){ $("#rosterGrid").innerHTML=""; $("#rosterEmpty").style.display="block"; });
  }

  // SCHEDULE (ESPN dates/times + SR link)
  function loadSchedule(){
    return Promise.all([espnSchedule(STATE.season,2), espnSchedule(STATE.season,3).catch(function(){return {events:[]};})])
      .then(function(arr){
        var items = (arr[0]?.events||[]).concat(arr[1]?.events||[]);
        var games = items.map(function(ev,idx){
          var comp = ev.competitions?.[0]||{};
          var uf   = (comp.competitors||[]).find(function(c){ return c.team?.id==String(TEAM_ID); })||{};
          var opp  = (comp.competitors||[]).find(function(c){ return c.team?.id!=String(TEAM_ID); })||{};
          var dt   = new Date(ev.date);
          return {
            idx: idx, id: ev.id,
            date: dt.toLocaleDateString("en-US", { timeZone:"America/New_York", month:"short", day:"numeric", weekday:"short"}),
            time: dt.toLocaleTimeString("en-US", { timeZone:"America/New_York", hour:"numeric", minute:"2-digit"}),
            opponent: opp.team?.displayName||"TBA",
            at: uf.homeAway==="home"?"Home":"Away",
            venue: comp.venue?.fullName||"", city: comp.venue?.address?.city||"", tv: (comp.broadcasts?.[0]?.names?.[0])||"",
            result: uf.winner===true?"W":(opp.winner===true?"L":""),
            score: (uf.score && opp.score)? (uf.score+"-"+opp.score) : "",
            box: ev.links?.find(function(l){ return /boxscore/i.test(l.text||""); })?.href || ""
          };
        });
        STATE.schedule = games;
        renderSchedule(); renderCountdown(); fillTicketGames();
      }).catch(function(e){ diag("schedule failed: "+e.message); $("#scheduleWrap").innerHTML='<div class="card"><p class="tiny muted">Schedule unavailable.</p></div>'; });
  }

  // STATS (players) from SR per_game; compute team totals
  function loadStats(){
    return fetchHTML(SR.team(STATE.season)).then(function(doc){
      var per = commentedTable(doc,"per_game");
      var trs = Array.prototype.filter.call((per?per.querySelectorAll("tbody tr"):[]), function(tr){ return !tr.classList.contains("thead"); });
      var players = trs.map(function(tr){
        function get(s){ var el=tr.querySelector('[data-stat="'+s+'"]'); return el?el.textContent.trim():""; }
        var pcell = tr.querySelector('[data-stat="player"]');
        var name = pcell ? pcell.textContent.trim() : "";
        if(!name) return null;
        return {
          name:name,
          gp:+get("g")||null, mpg:+get("mp_per_g")||null, ppg:+get("pts_per_g")||null, rpg:+get("trb_per_g")||null,
          apg:+get("ast_per_g")||null, spg:+get("stl_per_g")||null, bpg:+get("blk_per_g")||null, tpg:+get("tov_per_g")||null,
          fgPct:+(get("fg_pct")||0), threePct:+(get("fg3_pct")||0), ftPct:+(get("ft_pct")||0)
        };
      }).filter(Boolean);

      STATE.players = players;

      var t = { gp:null, pts:0, reb:0, ast:0, stl:0, blk:0, tov:0, fgPct:0, threePct:0, ftPct:0 };
      var n = players.length||1;
      players.forEach(function(p){ t.gp=Math.max(t.gp||0,p.gp||0); t.pts+=p.ppg||0; t.reb+=p.rpg||0; t.ast+=p.apg||0; t.stl+=p.spg||0; t.blk+=p.bpg||0; t.tov+=p.tpg||0; t.fgPct+=p.fgPct||0; t.threePct+=p.threePct||0; t.ftPct+=p.ftPct||0; });
      t.fgPct=+(t.fgPct/n).toFixed(3); t.threePct=+(t.threePct/n).toFixed(3); t.ftPct=+(t.ftPct/n).toFixed(3);
      STATE.team = t;

      renderTeamStats(); renderPlayerStats(); renderRoster(); fillCompare(); renderPropsTable();
    }).catch(function(e){ diag("stats failed: "+e.message); $("#playerStats").innerHTML='<div class="card"><p class="tiny muted">Stats unavailable.</p></div>'; });
  }

  /* ==================== RENDER ==================== */

  function renderSchedule(){
    var filter = $("#schedFilter")?.value || "ALL";
    var rows = STATE.schedule.filter(function(g){ return filter==="ALL" ? true : g.at===filter; });
    var mount=$("#scheduleWrap"); if(!mount) return;
    mount.innerHTML = '<table id="scheduleTable"><thead><tr>'
      +'<th>Date</th><th>Time (ET)</th><th>Opponent</th><th>H/A</th><th>Result</th><th>Score</th><th>Links</th>'
      +'</tr></thead><tbody>'
      + rows.map(function(g){
          var links = (g.box?'<a class="boxlink" target="_blank" rel="noopener" href="'+g.box+'">ESPN Box ↗</a>':'')
            +' • <a class="boxlink" target="_blank" rel="noopener" href="https://www.sports-reference.com/cbb/boxscores/">SR Box Index ↗</a>';
          return '<tr class="game-row" data-id="'+g.id+'"><td>'+esc(g.date)+'</td><td>'+esc(g.time)+'</td><td><strong>'+esc(g.opponent)+'</strong></td><td>'+g.at+'</td><td>'+esc(g.result||"")+'</td><td>'+esc(g.score||"")+'</td><td>'+links+'</td></tr>'
               + '<tr class="details" data-det="'+g.id+'" style="display:none"><td colspan="7"><div style="display:flex;gap:16px;flex-wrap:wrap">'
               + '<div><span class="tiny muted">Venue</span><div>'+esc(g.venue||"")+'</div></div>'
               + '<div><span class="tiny muted">City</span><div>'+esc(g.city||"")+'</div></div>'
               + '<div><span class="tiny muted">TV</span><div>'+esc(g.tv||"")+'</div></div>'
               + '<div><button class="btn ghost addCal" data-game=\''+esc(JSON.stringify(g))+'\'>Add to Calendar</button></div>'
               + '</div></td></tr>';
        }).join('')
      +'</tbody></table>';
    $$("#scheduleTable .game-row").forEach(function(tr){ tr.addEventListener("click", function(){ var id=tr.dataset.id; var det=$('#scheduleTable [data-det="'+id+'"]'); if(det) det.style.display = det.style.display==="none" ? "" : "none"; }); });
    $$("#scheduleTable .addCal").forEach(function(b){ b.addEventListener("click", function(e){ e.stopPropagation(); downloadICS(JSON.parse(b.dataset.game)); }); });
  }
  $("#schedFilter") && $("#schedFilter").addEventListener("change", renderSchedule);
  $("#refreshSchedule") && $("#refreshSchedule").addEventListener("click", loadSchedule);
  $("#exportScheduleCsv") && $("#exportScheduleCsv").addEventListener("click", function(){
    var rows = [["Date","Time","Opponent","H/A","Result","Score","TV","Venue","City","ESPN Box"]];
    STATE.schedule.forEach(function(g){ rows.push([g.date,g.time,g.opponent,g.at,g.result||"",g.score||"",g.tv||"",g.venue||"",g.city||"",g.box||""]); });
    var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([toCSV(rows)],{type:"text/csv"})); a.download="gators_schedule.csv"; a.click();
  });
  function downloadICS(g){
    var start = new Date(g.date+" "+g.time+" ET");
    var end = new Date(start.getTime()+2*60*60*1000);
    function toICS(d){ return d.getUTCFullYear()+pad2(d.getUTCMonth()+1)+pad2(d.getUTCDate())+'T'+pad2(d.getUTCHours())+pad2(d.getUTCMinutes())+pad2(d.getUTCSeconds())+'Z'; }
    var ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Gators Hub//EN","BEGIN:VEVENT",
      "UID:"+g.id+"@gatorshub","DTSTAMP:"+toICS(new Date()),
      "DTSTART:"+toICS(start),"DTEND:"+toICS(end),
      "SUMMARY:Florida vs "+g.opponent,"LOCATION:"+(g.venue?g.venue+", ":"")+(g.city||""),
      "END:VEVENT","END:VCALENDAR"].join("\r\n");
    var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([ics],{type:"text/calendar"})); a.download="UF_vs_"+g.opponent.replace(/\s+/g,'_')+".ics"; a.click();
  }

  function renderRoster(){
    var q = $("#rosterFilter")?.value.toLowerCase() || "";
    var favOnly = $("#favOnly")?.checked;
    var favs = getFavs();
    var rows = STATE.roster.slice();
    if(q) rows = rows.filter(function(p){ return p.name.toLowerCase().indexOf(q)!==-1; });
    if(favOnly) rows = rows.filter(function(p){ return favs.indexOf(p.name)!==-1; });
    var mount=$("#rosterGrid"); if(!mount) return;
    if(!rows.length){ mount.innerHTML=""; $("#rosterEmpty").style.display="block"; return; }
    $("#rosterEmpty").style.display="none";
    mount.innerHTML = rows.map(function(p){
      var star = favs.indexOf(p.name)!==-1 ? "⭐" : "☆";
      return '<div class="card player" data-player="'+esc(p.name)+'">'
        +'<div style="display:flex;gap:12px;align-items:center;">'
        +'<img loading="lazy" src="'+p.headshot+'" alt="'+esc(p.name)+' headshot" width="64" height="64" style="border-radius:12px;object-fit:cover" />'
        +'<div><div><strong>'+esc(p.name)+'</strong> <span class="tiny muted">#'+esc(p.number||"")+' '+esc(p.pos||"")+'</span></div><div class="meta">'+esc(p.hometown||"")+'</div></div>'
        +'<button class="btn ghost" style="margin-left:auto" data-fav="'+esc(p.name)+'">'+star+'</button>'
        +'</div></div>';
    }).join('');
    $$("#rosterGrid [data-fav]").forEach(function(b){ b.addEventListener("click", function(e){ e.stopPropagation(); toggleFavorite(b.dataset.fav); renderRoster(); }); });
    $$("#rosterGrid .player").forEach(function(card){ card.addEventListener("click", function(){ var p=STATE.players.find(function(x){ return x.name===card.dataset.player; }); openPlayerModal(p); }); });
  }
  $("#rosterFilter") && $("#rosterFilter").addEventListener("input", renderRoster);
  $("#favOnly") && $("#favOnly").addEventListener("change", renderRoster);
  $("#refreshRoster") && $("#refreshRoster").addEventListener("click", loadRoster);

  function renderTeamStats(){
    var t = STATE.team||{};
    $("#teamStats").innerHTML = '<table><thead><tr><th>GP</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead>'
      +'<tbody><tr><td>'+(t.gp==null?'—':t.gp)+'</td><td class="stat">'+fmt1(t.pts)+'</td><td>'+fmt1(t.reb)+'</td><td>'+fmt1(t.ast)+'</td><td>'+fmt1(t.stl)+'</td><td>'+fmt1(t.blk)+'</td><td>'+fmt1(t.tov)+'</td><td>'+pct3(t.fgPct)+'</td><td>'+pct3(t.threePct)+'</td><td>'+pct3(t.ftPct)+'</td></tr></tbody></table>';
  }
  function renderPlayerStats(){
    var q = $("#playerFilter")?.value.toLowerCase() || "";
    var rows = STATE.players.slice(); if(q) rows = rows.filter(function(p){ return p.name.toLowerCase().indexOf(q)!==-1; });
    rows.sort(function(a,b){ return (b.ppg||0)-(a.ppg||0); });
    $("#playerStats").innerHTML = '<table id="playersTable"><thead><tr><th>Player</th><th>GP</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>'
      + rows.map(function(p){ return '<tr class="plink" data-player="'+esc(p.name)+'"><td><strong>'+esc(p.name)+'</strong></td><td>'+(p.gp==null?'—':p.gp)+'</td><td>'+fmt1(p.mpg)+'</td><td class="stat">'+fmt1(p.ppg)+'</td><td>'+fmt1(p.rpg)+'</td><td>'+fmt1(p.apg)+'</td><td>'+fmt1(p.spg)+'</td><td>'+fmt1(p.bpg)+'</td><td>'+fmt1(p.tpg)+'</td><td>'+pct3(p.fgPct)+'</td><td>'+pct3(p.threePct)+'</td><td>'+pct3(p.ftPct)+'</td></tr>'; }).join('')
      +'</tbody></table>';
    $$("#playersTable .plink").forEach(function(tr){ tr.addEventListener("click", function(){ var p=STATE.players.find(function(x){ return x.name===tr.dataset.player; }); openPlayerModal(p); }); });
  }
  $("#playerFilter") && $("#playerFilter").addEventListener("input", renderPlayerStats);
  $("#refreshStats") && $("#refreshStats").addEventListener("click", loadStats);
  $("#exportPlayersCsv") && $("#exportPlayersCsv").addEventListener("click", function(){
    var rows=[["Player","GP","MPG","PPG","RPG","APG","SPG","BPG","TOV","FG%","3P%","FT%"]];
    STATE.players.forEach(function(p){ rows.push([p.name,p.gp,p.mpg,p.ppg,p.rpg,p.apg,p.spg,p.bpg,p.tpg,p.fgPct,p.threePct,p.ftPct]); });
    var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([toCSV(rows)],{type:"text/csv"})); a.download="gators_players.csv"; a.click();
  });

  /* ---------- Compare ---------- */
  function fillCompare(){ var A=$("#cmpA"), B=$("#cmpB"); if(!A||!B) return; A.innerHTML=""; B.innerHTML="";
    STATE.players.forEach(function(p){ A.add(new Option(p.name,p.name)); B.add(new Option(p.name,p.name)); });
    if(STATE.players[0]) A.value=STATE.players[0].name; if(STATE.players[1]) B.value=STATE.players[1].name;
  }
  $("#drawCompare") && $("#drawCompare").addEventListener("click", drawCompare);
  function drawCompare(){
    var a = STATE.players.find(function(p){ return p.name===($("#cmpA")?.value||""); });
    var b = STATE.players.find(function(p){ return p.name===($("#cmpB")?.value||""); });
    if(!a||!b) return;
    var metrics=["ppg","rpg","apg","spg","bpg","tpg"]; var maxes={ppg:30,rpg:15,apg:8,spg:3,bpg:3,tpg:5};
    var w=800,h=320,pad=40,col=(w-2*pad)/metrics.length;
    function bar(val,max){ return Math.max(2,(val/max)*(h-2*pad)); }
    var svg=['<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="320">','<g font-size="12" fill="currentColor">'];
    metrics.forEach(function(m,i){ var x=pad+i*col+col/2; svg.push('<text x="'+x+'" y="'+(h-pad+18)+'" text-anchor="middle">'+m.toUpperCase()+'</text>'); svg.push('<rect x="'+(x-22)+'" y="'+(h-pad-bar(a[m]||0,maxes[m]))+'" width="16" height="'+bar(a[m]||0,maxes[m])+'" rx="4" fill="#0021A5"></rect>'); svg.push('<rect x="'+(x+6)+'" y="'+(h-pad-bar(b[m]||0,maxes[m]))+'" width="16" height="'+bar(b[m]||0,maxes[m])+'" rx="4" fill="#FA4616"></rect>'); });
    svg.push('</g><g font-size="14"><text x="'+pad+'" y="'+(pad-8)+'"><tspan fill="#0021A5">●</tspan> '+esc(a.name)+'</text><text x="'+(pad+200)+'" y="'+(pad-8)+'"><tspan fill="#FA4616">●</tspan> '+esc(b.name)+'</text></g></svg>');
    $("#compareWrap").innerHTML = svg.join('');
  }

  /* ---------- Analytics (compact placeholder; links to boxes) ---------- */
  function loadAnalytics(){
    var rows = STATE.schedule.filter(function(g){ return g.result; }).slice(-10).map(function(g){
      return { date:g.date, opp:g.opponent, at:g.at, score:g.score||"", ortg:"—", drtg:"—", pace:"—", efg:"—", toPct:"—", box:g.box||"https://www.sports-reference.com/cbb/boxscores/" };
    });
    renderAnalytics(rows);
  }
  function renderAnalytics(rows){
    STATE.analytics = rows;
    $("#analyticsWrap").innerHTML = rows.length ? '<table><thead><tr><th>Date</th><th>Opponent</th><th>H/A</th><th>Score</th><th>ORtg</th><th>DRtg</th><th>Pace</th><th>eFG%</th><th>TO%</th><th>Box</th></tr></thead><tbody>'
      + rows.map(function(r){ return '<tr><td>'+esc(r.date)+'</td><td>'+esc(r.opp)+'</td><td>'+r.at+'</td><td>'+esc(r.score)+'</td><td>'+r.ortg+'</td><td>'+r.drtg+'</td><td>'+r.pace+'</td><td>'+r.efg+'</td><td>'+r.toPct+'</td><td><a class="boxlink" target="_blank" rel="noopener" href="'+r.box+'">↗</a></td></tr>'; }).join('') + '</tbody></table>'
      : '<div class="card"><p class="tiny muted">No completed games yet.</p></div>';
    $("#analyticsTrend").innerHTML = ""; // can be expanded later once per-game boxes are pulled
  }
  $("#refreshAnalytics") && $("#refreshAnalytics").addEventListener("click", loadAnalytics);

  /* ---------- Player modal ---------- */
  function openPlayerModal(p){
    var modal=$("#scoutModal"), box=$("#scoutContent");
    if(!p){ box.innerHTML='<p class="muted">No data.</p>'; modal.classList.remove("hidden"); modal.setAttribute("aria-hidden","false"); return; }
    box.innerHTML = '<h3 style="margin-top:0">'+esc(p.name)+'</h3>'
      +'<table><tbody>'
      +'<tr><td>GP</td><td>'+(p.gp==null?'—':p.gp)+'</td></tr><tr><td>MPG</td><td>'+fmt1(p.mpg)+'</td></tr><tr><td>PPG</td><td>'+fmt1(p.ppg)+'</td></tr>'
      +'<tr><td>RPG</td><td>'+fmt1(p.rpg)+'</td></tr><tr><td>APG</td><td>'+fmt1(p.apg)+'</td></tr><tr><td>SPG</td><td>'+fmt1(p.spg)+'</td></tr>'
      +'<tr><td>BPG</td><td>'+fmt1(p.bpg)+'</td></tr><tr><td>TOV</td><td>'+fmt1(p.tpg)+'</td></tr><tr><td>FG%</td><td>'+pct3(p.fgPct)+'</td></tr>'
      +'<tr><td>3P%</td><td>'+pct3(p.threePct)+'</td></tr><tr><td>FT%</td><td>'+pct3(p.ftPct)+'</td></tr>'
      +'</tbody></table>'
      +'<p class="tiny"><a class="boxlink" target="_blank" rel="noopener" href="'+SR.team(STATE.season)+'">Sports-Reference team page ↗</a></p>';
    modal.classList.remove("hidden"); modal.setAttribute("aria-hidden","false");
  }
  $("#closeScout") && $("#closeScout").addEventListener("click", function(){ var m=$("#scoutModal"); m.classList.add("hidden"); m.setAttribute("aria-hidden","true"); });
  $("#scoutModal") && $("#scoutModal").addEventListener("click", function(e){ if(e.target.classList.contains("modal-bg")) $("#closeScout").click(); });

  /* ---------- Props (local only) ---------- */
  var LS = { bankroll:"ghub_bankroll", username:"ghub_username", openBets:"ghub_openBets", history:"ghub_betHistory", board:"ghub_leaderboard" };
  function getLS(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
  function setLS(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
  function roundHalf(n){ return Math.round(n*2)/2; }
  function defaultLines(){ return (STATE.players||[]).map(function(p){ return { player:p.name, pts:roundHalf(p.ppg||0), reb:roundHalf(p.rpg||0), ast:roundHalf(p.apg||0), pra:roundHalf((p.ppg||0)+(p.rpg||0)+(p.apg||0)) }; }); }
  function bankrollUI(){ $("#bankroll").textContent = "$"+Number(getLS(LS.bankroll,0)).toLocaleString(); $("#usernameInput") && ($("#usernameInput").value=getLS(LS.username,"")||""); }
  function upsertLeaderboard(user,bankroll){ var board=getLS(LS.board,[]); var i=board.findIndex(function(b){ return b.user===user; }); if(i>=0)board[i].bankroll=bankroll; else board.push({user:user,bankroll:bankroll,updated:Date.now()}); setLS(LS.board,board); renderLeaderboard(); }
  function renderLeaderboard(){ var board=getLS(LS.board,[]).sort(function(a,b){ return b.bankroll-a.bankroll; }); $("#leaderboard").innerHTML = '<table><thead><tr><th>#</th><th>User</th><th>Bankroll</th><th>Updated</th></tr></thead><tbody>'+board.map(function(b,i){ return '<tr><td>'+(i+1)+'</td><td>'+esc(b.user)+'</td><td>$'+Number(b.bankroll).toLocaleString()+'</td><td>'+new Date(b.updated||Date.now()).toLocaleString()+'</td></tr>'; }).join('')+'</tbody></table>'; }
  function fillTicketGames(){ var sel=$("#ticketGame"); if(!sel) return; sel.innerHTML = '<option value="">(None)</option>' + STATE.schedule.map(function(g){ return '<option value="'+esc(g.date+'|'+g.time+'|'+g.opponent)+'">'+esc(g.date+' – '+g.opponent+' ('+g.at+')')+'</option>'; }).join(''); }
  function renderPropsTable(){
    var lines = defaultLines();
    $("#propsTable").innerHTML = '<table><thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th><th>P+R+A</th><th>Pick</th><th>Add</th></tr></thead><tbody>'
      + lines.map(function(l){
          return '<tr><td><strong>'+esc(l.player)+'</strong></td><td>'+l.pts+'</td><td>'+l.reb+'</td><td>'+l.ast+'</td><td>'+l.pra+'</td>'
            +'<td><select data-player="'+esc(l.player)+'" class="pick"><option value="PTS_O">PTS Over</option><option value="PTS_U">PTS Under</option><option value="REB_O">REB Over</option><option value="REB_U">REB Under</option><option value="AST_O">AST Over</option><option value="AST_U">AST Under</option><option value="PRA_O">PRA Over</option><option value="PRA_U">PRA Under</option></select></td>'
            +'<td><button class="btn addBet" data-player="'+esc(l.player)+'">Add</button></td></tr>';
        }).join('')
      +'</tbody></table>';
    $$(".addBet").forEach(function(b){ b.addEventListener("click", function(){ var player=b.dataset.player; var sel=b.closest("tr").querySelector(".pick").value; var slip=getLS(LS.openBets,[]); slip.push({player:player, market:sel, odds:-110}); setLS(LS.openBets, slip); renderBetSlip(); toast("Added to slip"); }); });
  }
  function renderBetSlip(){ var slip=getLS(LS.openBets,[]); $("#betList").innerHTML = slip.length? slip.map(function(b,i){ return '<div class="card"><div><strong>'+esc(b.player)+'</strong> — '+b.market.replace('_',' ')+' <span class="badge">@'+b.odds+'</span></div><div class="meta">Slip item #'+(i+1)+'</div></div>'; }).join('') : '<p class="muted tiny">No selections yet.</p>'; }
  function handleBankroll(){ var user=$("#usernameInput")?.value.trim()||"Guest"; setLS(LS.username,user); setLS(LS.bankroll,1000); upsertLeaderboard(user,1000); bankrollUI(); toast("Bankroll set to $1,000"); }
  function resetBankroll(){ setLS(LS.bankroll,0); bankrollUI(); toast("Bankroll reset"); }
  function placeBets(){
    var wager = Math.max(1, Number($("#wagerInput")?.value||0));
    var bank = getLS(LS.bankroll, 0); var slip = getLS(LS.openBets, []);
    var gameId = $("#ticketGame")?.value || "";
    if(!slip.length) return toast("Add picks first."); if(bank<wager) return toast("Not enough bankroll.");
    var hist = getLS(LS.history, []); hist.push({ placedAt: Date.now(), wager:wager, gameId:gameId, bets:slip, status:"pending" });
    setLS(LS.history, hist); setLS(LS.openBets, []); setLS(LS.bankroll, bank - wager);
    renderBetSlip(); bankrollUI(); renderHistory(); toast("Bets placed!");
  }
  $("#startBankroll") && $("#startBankroll").addEventListener("click", handleBankroll);
  $("#resetBankroll") && $("#resetBankroll").addEventListener("click", resetBankroll);
  $("#placeBets") && $("#placeBets").addEventListener("click", placeBets);
  $("#clearBets") && $("#clearBets").addEventListener("click", function(){ setLS(LS.openBets,[]); renderBetSlip(); toast("Slip cleared"); });
  $("#exportHistory") && $("#exportHistory").addEventListener("click", function(){ var h=getLS(LS.history, []); var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(h,null,2)],{type:"application/json"})); a.download='bet_history.json'; a.click(); });
  $("#importHistory") && $("#importHistory").addEventListener("change", function(e){ var f=e.target.files?.[0]; if(!f) return; f.text().then(function(text){ setLS(LS.history, JSON.parse(text)); renderHistory(); toast("History imported"); }); });
  $("#clearHistory") && $("#clearHistory").addEventListener("click", function(){ setLS(LS.history, []); renderHistory(); toast("History cleared"); });
  function renderHistory(){
    var hist = getLS(LS.history, []);
    var key = function(g){ return g.date+"|"+g.time+"|"+g.opponent; };
    var map = new Map(STATE.schedule.map(function(g){ return [key(g), g]; }));
    $("#historyWrap").innerHTML = '<table><thead><tr><th>Placed</th><th>Game</th><th>Wager</th><th>Status</th><th>Payout</th><th>Picks</th></tr></thead><tbody>'
      + hist.slice().reverse().map(function(t){
          var g = t.gameId ? map.get(t.gameId) : null;
          var gameTxt = g ? (g.date+' vs '+g.opponent+(g.result?(' ('+g.result+')'):'')+(g.box?(' • <a class="boxlink" href="'+g.box+'" target="_blank" rel="noopener">box ↗</a>'):"")) : '—';
          return '<tr><td>'+new Date(t.placedAt).toLocaleString()+'</td><td>'+gameTxt+'</td><td>$'+Number(t.wager).toLocaleString()+'</td><td>'+esc(t.status||'pending')+'</td><td>'+(t.payout?('$'+Number(t.payout).toLocaleString()):'—')+'</td><td>'+t.bets.map(function(b){ return esc(b.player)+' ('+b.market.replace('_',' ')+')'; }).join('<br/>')+'</td></tr>';
        }).join('')
      +'</tbody></table>';
  }

  /* ---------- Favorites ---------- */
  function getFavs(){ try{ var v=localStorage.getItem("ghub_favs"); return v?JSON.parse(v):[]; }catch(e){ return []; } }
  function setFavs(v){ localStorage.setItem("ghub_favs", JSON.stringify(v)); }
  function toggleFavorite(name){ var favs=getFavs(); var i=favs.indexOf(name); if(i>=0) favs.splice(i,1); else favs.push(name); setFavs(favs); }

  /* ---------- Countdown ---------- */
  function renderCountdown(){
    var el=$("#nextGame"); if(!el || !STATE.schedule.length) return;
    var upcoming = STATE.schedule.map(function(g){ return Object.assign({}, g, { t: Date.parse(g.date+" "+g.time+" ET") }); })
      .filter(function(g){ return !isNaN(g.t) && g.t > Date.now(); })
      .sort(function(a,b){ return a.t-b.t; })[0];
    if(!upcoming){ el.textContent="Next game: TBA"; return; }
    (function tick(){
      var diff = upcoming.t - Date.now(); if(diff<=0){ el.textContent = "Gameday: vs "+upcoming.opponent+"!"; return; }
      var h=Math.floor(diff/3.6e6), m=Math.floor((diff%3.6e6)/6e4), s=Math.floor((diff%6e4)/1e3);
      el.textContent = "Next game vs "+upcoming.opponent+": "+h+"h "+m+"m "+s+"s";
      requestAnimationFrame(function(){ setTimeout(tick,500); });
    })();
  }

  /* ---------- Photos & News ---------- */
  function loadPhotos(){
    var PHOTOS = HERO_IMAGES.map(function(src,i){ return { src:src, alt:i===0?"Arena":"Gators"}; });
    $("#photoGrid").innerHTML = PHOTOS.map(function(p){ return '<div class="card"><img loading="lazy" src="'+p.src+'" alt="'+esc(p.alt)+'"><div class="meta">'+esc(p.alt)+'</div></div>'; }).join('');
  }
  function loadNews(){
    fetch("https://floridagators.com/rss.aspx?path=mbball").then(function(r){ return r.text(); }).then(function(xml){
      var items=[], itemRe=/<item[\s\S]*?<\/item>/gi, titleRe=/<title>([\s\S]*?)<\/title>/i, linkRe=/<link>([\s\S]*?)<\/link>/i, dateRe=/<pubDate>([\s\S]*?)<\/pubDate>/i, descRe=/<description>([\s\S]*?)<\/description>/i;
      (xml.match(itemRe)||[]).slice(0,12).forEach(function(b){
        var title=(b.match(titleRe)||[])[1]||""; title=title.replace(/<!\[CDATA\[|\]\]>/g,'').trim();
        var link=(b.match(linkRe)||[])[1]||"";
        var summary=((b.match(descRe)||[])[1]||"").replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]*>/g,'').trim();
        var date=new Date((b.match(dateRe)||[])[1]||Date.now()).toISOString();
        if(title && link) items.push({title:title, link:link, summary:summary, date:date});
      });
      $("#newsList").innerHTML = items.map(function(n){ return '<article class="news-card"><h4><a href="'+n.link+'" target="_blank" rel="noopener">'+esc(n.title)+'</a></h4><p>'+esc(n.summary||"")+'</p><p class="meta">'+new Date(n.date).toLocaleString()+'</p></article>'; }).join('');
    }).catch(function(){ $("#newsList").innerHTML = '<article class="news-card"><h4>Welcome</h4><p class="muted">Live schedule/roster/stats + analytics.</p></article>'; });
  }

  /* ---------- Init ---------- */
  function fillTicketGames(){ var sel=$("#ticketGame"); if(!sel) return; sel.innerHTML = '<option value="">(None)</option>' + STATE.schedule.map(function(g){ return '<option value="'+esc(g.date+'|'+g.time+'|'+g.opponent)+'">'+esc(g.date+' – '+g.opponent+' ('+g.at+')')+'</option>'; }).join(''); }
  function refreshAll(){
    fillSeasonSelects();
    return Promise.all([loadRoster(), loadSchedule(), loadStats()])
      .then(function(){ renderPropsTable(); renderBetSlip(); bankrollUI(); renderLeaderboard(); loadPhotos(); loadNews(); loadAnalytics(); })
      .catch(function(e){ diag("refreshAll: "+e.message); });
  }
  function start(){ route(); startHero(); refreshAll().then(function(){ setInterval(function(){ Promise.all([loadRoster(), loadSchedule(), loadStats()]).then(loadAnalytics).catch(function(e){ diag("auto refresh: "+e.message); }); }, REFRESH_MS); }); }
  document.addEventListener("DOMContentLoaded", start);
})();
