const DEMO = {
  teams: [
    {team_id:"T1",team_name:"Team Ankur",color:"#e87532"},
    {team_id:"T2",team_name:"Team Rajiv",color:"#277da1"},
    {team_id:"T3",team_name:"Team Ravi",color:"#6b5ca5"},
    {team_id:"T4",team_name:"Team Paris",color:"#39936d"},
    {team_id:"T5",team_name:"Team Sreesh",color:"#c44d58"},
    {team_id:"T6",team_name:"Team Zeeshan",color:"#9b7a35"}
  ],
  games: [],
  playerStats: []
};

const config = window.LEAGUE_CONFIG || {};
let leagueData = DEMO;
const $ = (id) => document.getElementById(id);
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function parseCSV(text){
  const rows=[]; let row=[], field="", quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(c==='"' && quoted && n==='"'){field+='"';i++;}
    else if(c==='"') quoted=!quoted;
    else if(c===',' && !quoted){row.push(field);field="";}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(field);if(row.some(x=>x.trim()!==""))rows.push(row);row=[];field="";}
    else field+=c;
  }
  row.push(field); if(row.some(x=>x.trim()!==""))rows.push(row);
  if(!rows.length)return [];
  const headers=rows.shift().map(x=>x.trim().replace(/^\uFEFF/,""));
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]??"").trim()])));
}
async function getSheet(url, fallback){
  if(!url) return fallback;
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok) throw new Error("Could not load a published spreadsheet tab.");
  return parseCSV(await response.text());
}
function number(v){const n=Number(v);return Number.isFinite(n)?n:0}
function dateLabel(date){if(!date)return "Date TBD";const d=new Date(date+"T12:00:00");return Number.isNaN(d.getTime())?date:d.toLocaleDateString(undefined,{month:"short",day:"numeric"});}
function totals(){
  const map=new Map();
  leagueData.playerStats.forEach(s=>{
    const key=(s.player_name||"").trim()+"||"+(s.team_name||"").trim();
    if(!s.player_name)return;
    if(!map.has(key))map.set(key,{player:s.player_name,team:s.team_name,games:new Set(),points:0,rebounds:0});
    const p=map.get(key);p.games.add(s.game_id);p.points+=number(s.points);p.rebounds+=number(s.rebounds);
  });
  return [...map.values()].map(p=>({...p,gp:p.games.size,ppg:p.games.size?p.points/p.games.size:0,rpg:p.games.size?p.rebounds/p.games.size:0}));
}
function renderSummary(players){
  $("team-count").textContent=leagueData.teams.length;
  $("games-played").textContent=leagueData.games.filter(g=>(g.status||"").toLowerCase()==="final").length;
  $("player-count").textContent=players.length;
}
const volunteerRoles = {ref1:"Ref 1",ref2:"Ref 2",scorekeeper:"Scorekeeper",statskeeper:"Stats Keeper"};
function volunteerForm(g){
  const filled=Object.keys(volunteerRoles).filter(k=>g[k]).length;
  return `<form class="volunteer-form" data-game="${safe(g.game_id)}"><div class="volunteer-heading"><strong>Volunteer signups</strong><span>${filled}/4 filled</span></div><div class="volunteer-fields">${Object.entries(volunteerRoles).map(([key,label])=>`<label>${label}${`<input name="${key}" value="${safe(g[key]||"")}" placeholder="Enter Name" maxlength="80" ${config.signupUrl?"":"disabled"}>`}</label>`).join("")}</div><div class="volunteer-actions"><button type="submit" ${!config.signupUrl?"disabled":""}>Save signups</button><span role="status">${config.signupUrl?"Edit or clear a name, then save.":"Signups not connected yet."}</span></div></form>`;
}
async function saveVolunteers(event){
  event.preventDefault(); const form=event.currentTarget, button=form.querySelector("button"), status=form.querySelector('[role="status"]');
  const g=leagueData.games.find(x=>x.game_id===form.dataset.game); if(!g)return;
  const names=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,v.trim()]).filter(([k,v])=>v!==(g[k]||"")));
  const expected=Object.fromEntries(Object.keys(names).map(k=>[k,g[k]||""]));
  if(!Object.keys(names).length){status.textContent="No changes to save.";return;}
  if(Object.keys(names).some(k=>expected[k]&&!names[k])&&!confirm("Remove the selected volunteer signup(s)?"))return;
  button.disabled=true;status.textContent="Saving…";
  try{
    const response=await fetch(config.signupUrl,{method:"POST",body:new URLSearchParams({game_id:form.dataset.game,names:JSON.stringify(names),expected:JSON.stringify(expected)})});
    if(!response.ok)throw new Error(); const result=await response.json();
    if(result.game){const g=leagueData.games.find(x=>x.game_id===form.dataset.game);if(g)Object.assign(g,result.game);}
    if(!result.ok){if(result.game){renderSchedule();const updated=[...document.querySelectorAll('.volunteer-form')].find(f=>f.dataset.game===form.dataset.game);if(updated)updated.querySelector('[role="status"]').textContent=result.error;}else status.textContent=result.error;return;}
    renderSchedule();const updated=[...document.querySelectorAll('.volunteer-form')].find(f=>f.dataset.game===form.dataset.game);if(updated)updated.querySelector('[role="status"]').textContent="Signups saved!";
  }catch(e){status.textContent="Could not confirm saving. Refresh before retrying.";}finally{button.disabled=false;}
}
async function refreshVolunteers(){
  if(!config.signupUrl)return;
  try{const r=await fetch(config.signupUrl,{cache:"no-store"});const data=await r.json();if(!data.ok)throw new Error();leagueData.games.forEach(g=>{if(data.games[g.game_id])Object.assign(g,data.games[g.game_id]);});}catch(e){console.warn("Could not refresh volunteer assignments",e);}
}

function renderSchedule(){
  const configuredWeeks = Number(config.seasonWeeks) || 12;
  const weeks=[...new Set([
    ...Array.from({length:configuredWeeks},(_,i)=>String(i+1)),
    ...leagueData.games.map(g=>String(g.week||"1"))
  ])].sort((a,b)=>Number(a)-Number(b));
  const select=$("week-select"), old=select.value;
  select.innerHTML=weeks.map(w=>`<option value="${safe(w)}">Week ${safe(w)}</option>`).join("");
  if(weeks.includes(old))select.value=old;
  const week=select.value||weeks[0];
  const games=leagueData.games.filter(g=>String(g.week||"1")===week);
  $("schedule-list").innerHTML=games.length?games.map(g=>{
    const final=(g.status||"").toLowerCase()==="final";
    const score=final?`${number(g.home_score)} – ${number(g.away_score)}`:"VS";
    return `<section class="game-with-volunteers"><article class="game-card" data-game="${safe(g.game_id)}" tabindex="0" role="button" aria-label="View ${safe(g.home_team)} versus ${safe(g.away_team)} box score">
      <div class="game-date"><strong>${safe(dateLabel(g.date))}</strong>${safe(g.time||"Time TBD")}</div>
      <div class="matchup"><span class="team-name">${safe(g.home_team)}</span><span class="versus">VS</span><span class="team-name">${safe(g.away_team)}</span></div>
      <div class="game-result"><strong>${safe(score)}</strong><span class="status-tag ${final?"":"upcoming"}">${safe(g.status||"Scheduled")}</span></div>
    </article>${volunteerForm(g)}</section>`;
  }).join(""):`<div class="empty-state">No games entered for this week yet.<br>Add games to the <strong>Games</strong> tab in your spreadsheet.</div>`;
  document.querySelectorAll(".volunteer-form").forEach(form=>form.addEventListener("submit",saveVolunteers));
  document.querySelectorAll(".game-card").forEach(card=>{card.addEventListener("click",()=>openGame(card.dataset.game));card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openGame(card.dataset.game)}})});
}
function renderPlayers(){
  const q=$("player-search").value.toLowerCase(), sort=$("player-sort").value;
  const rows=totals().filter(p=>(p.player+" "+p.team).toLowerCase().includes(q));
  const key={points:"points",rebounds:"rebounds",ppg:"ppg",rpg:"rpg",name:"player"}[sort];
  rows.sort((a,b)=>sort==="name"?a.player.localeCompare(b.player):b[key]-a[key]);
  $("players-body").innerHTML=rows.length?rows.map(p=>`<tr><td>${safe(p.player)}</td><td>${safe(p.team)}</td><td class="num">${p.gp}</td><td class="num">${p.points}</td><td class="num">${p.rebounds}</td><td class="num">${p.ppg.toFixed(1)}</td><td class="num">${p.rpg.toFixed(1)}</td></tr>`).join(""):`<tr><td colspan="7">No player statistics yet.</td></tr>`;
}
function leaderRows(list,valueKey,suffix){
  return list.slice(0,10).map((p,i)=>`<div class="leader-row"><span class="leader-rank">${String(i+1).padStart(2,"0")}</span><div><div class="leader-name">${safe(p.player)}</div><div class="leader-team">${safe(p.team)}</div></div><div class="leader-value">${valueKey==="points"?p.points:p.rebounds}<small style="font:600 9px Inter;color:#8391a0"> ${suffix}</small></div></div>`).join("")||`<div class="empty-state">Leaders will appear after stats are entered.</div>`;
}
function renderLeaders(){
  const p=totals();
  $("points-leaders").innerHTML=leaderRows([...p].sort((a,b)=>b.points-a.points),"points","PTS");
  $("rebound-leaders").innerHTML=leaderRows([...p].sort((a,b)=>b.rebounds-a.rebounds),"rebounds","REB");
}
let selectedTeam = null;
let rosterError = "";
const normalized = v => String(v ?? "").trim().toLowerCase();
function teamMatches(value,t){return !!normalized(value) && [t.team_id,t.team_name].some(v=>normalized(v)===normalized(value));}
function teamRoster(t){
  const map=new Map();
  (leagueData.rosters||[]).filter(r=>teamMatches(r.team_id,t)&&r.player_name).forEach(r=>{
    map.set(normalized(r.player_name),{player:r.player_name,captain:["yes","true","1","y"].includes(normalized(r.captain)),games:new Set(),points:0,rebounds:0});
  });
  leagueData.playerStats.filter(s=>teamMatches(s.team_name,t)&&s.player_name&&s.game_id).forEach(s=>{
    const key=normalized(s.player_name);
    if(!map.has(key))map.set(key,{player:s.player_name,captain:false,games:new Set(),points:0,rebounds:0});
    const p=map.get(key);p.games.add(s.game_id);p.points+=number(s.points);p.rebounds+=number(s.rebounds);
  });
  return [...map.values()].map(p=>({...p,gp:p.games.size,ppg:p.games.size?p.points/p.games.size:0,rpg:p.games.size?p.rebounds/p.games.size:0}));
}
function teamRecord(t){
  let wins=0,losses=0,ties=0,points=0,gp=0;
  leagueData.games.filter(g=>normalized(g.status)==="final"&&String(g.home_score??"").trim()!==""&&String(g.away_score??"").trim()!=="").forEach(g=>{
    const home=teamMatches(g.home_team,t);if(!home&&!teamMatches(g.away_team,t))return;
    const own=number(home?g.home_score:g.away_score),other=number(home?g.away_score:g.home_score);
    gp++;points+=own;if(own>other)wins++;else if(own<other)losses++;else ties++;
  });
  return {record:`${wins}–${losses}${ties?`–${ties}`:""}`,ppg:gp?points/gp:0};
}
function renderTeams(){
  if(!leagueData.teams.some(t=>t.team_id===selectedTeam))selectedTeam=leagueData.teams[0]?.team_id??null;
  $("teams-grid").innerHTML=leagueData.teams.map(t=>{
    const color=/^#[0-9a-f]{6}$/i.test(t.color||"")?t.color:"#f28b36";
    const roster=teamRoster(t),record=teamRecord(t);
    return `<button type="button" class="team-card roster-card" data-team="${safe(t.team_id)}" aria-pressed="${t.team_id===selectedTeam}" aria-controls="team-details"><span class="roster-card-title"><span class="team-dot" style="background:${color}"></span>${safe(t.team_name)}</span><span>${roster.length} players · ${record.record} record</span><span class="roster-preview">${roster.map(p=>safe(p.player)+(p.captain?" (C)":"")).join(" · ")||"Roster not entered yet"}</span><span class="roster-link">View season stats →</span></button>`;
  }).join("")||`<div class="empty-state">Add your six teams to the Teams tab.</div>`;
  document.querySelectorAll(".roster-card").forEach(btn=>btn.addEventListener("click",()=>{selectedTeam=btn.dataset.team;document.querySelectorAll(".roster-card").forEach(b=>b.setAttribute("aria-pressed",String(b===btn)));renderTeamDetails();}));
  renderTeamDetails();
}
function renderTeamDetails(){
  const t=leagueData.teams.find(t=>t.team_id===selectedTeam), panel=$("team-details");
  panel.hidden=!t;if(!t)return;
  const record=teamRecord(t),rows=teamRoster(t),sort=$("roster-sort").value;
  rows.sort((a,b)=>sort==="name"?Number(b.captain)-Number(a.captain)||a.player.localeCompare(b.player):b[sort]-a[sort]||a.player.localeCompare(b.player));
  $("roster-title").textContent=t.team_name;
  $("roster-record").textContent=record.record;$("roster-count").textContent=rows.length;$("roster-ppg").textContent=record.ppg.toFixed(1);
  $("roster-status").textContent=rosterError;
  $("roster-body").innerHTML=rows.map(p=>`<tr><td>${safe(p.player)} ${p.captain?'<span class="captain-tag">Captain</span>':""}</td><td class="num">${p.gp}</td><td class="num">${p.points}</td><td class="num">${p.rebounds}</td><td class="num">${p.ppg.toFixed(1)}</td><td class="num">${p.rpg.toFixed(1)}</td></tr>`).join("")||'<tr><td colspan="6">No roster entries yet.</td></tr>';
}
function openGame(id){
  const g=leagueData.games.find(x=>x.game_id===id);if(!g)return;
  const stats=leagueData.playerStats.filter(s=>s.game_id===id);
  $("dialog-week").textContent=`WEEK ${g.week||"—"} • ${dateLabel(g.date)}`;
  $("dialog-title").textContent="Game box score";
  $("home-team-heading").textContent=g.home_team;$("away-team-heading").textContent=g.away_team;
  const final=(g.status||"").toLowerCase()==="final";
  $("dialog-score").innerHTML=`<div class="score-side"><span>${safe(g.home_team)}</span><strong>${final?number(g.home_score):"—"}</strong></div><div class="score-divider">FINAL SCORE</div><div class="score-side"><span>${safe(g.away_team)}</span><strong>${final?number(g.away_score):"—"}</strong></div>`;
  const side=(team)=>stats.filter(s=>s.team_name===team).map(s=>`<tr><td>${safe(s.player_name)}</td><td class="num">${number(s.points)}</td><td class="num">${number(s.rebounds)}</td></tr>`).join("")||`<tr><td colspan="3">No player stats entered</td></tr>`;
  $("home-stats").innerHTML=side(g.home_team);$("away-stats").innerHTML=side(g.away_team);
  $("game-dialog").showModal();
}
async function init(){
  $("league-name").textContent=config.leagueName||"LEAGUE CENTRAL";
  $("season-label").textContent=config.seasonLabel||"SEASON";
  const urls=[config.teamsCsvUrl,config.gamesCsvUrl,config.playerStatsCsvUrl];
  try{
    if(urls.some(Boolean)){
      const [teams,games,playerStats]=await Promise.all([
        getSheet(config.teamsCsvUrl,DEMO.teams),getSheet(config.gamesCsvUrl,DEMO.games),getSheet(config.playerStatsCsvUrl,DEMO.playerStats)
      ]);
      leagueData={teams,games,playerStats};
      $("data-status").textContent="Live spreadsheet data loaded.";
      $("data-status").className="data-status live";
    }else{
      $("data-status").textContent="Preview mode: showing sample data. Connect your Google Sheets tabs in config.js to show your league data.";
    }
  }catch(err){
    $("data-status").textContent="Could not load spreadsheet data. Check that all three tabs are published as CSV and their URLs are correct. Showing sample data instead.";
    $("data-status").className="data-status error";
    leagueData=DEMO;
  }
  if(config.rostersCsvUrl){
    try{leagueData.rosters=await getSheet(config.rostersCsvUrl,[]);}catch(err){rosterError="Could not load Rosters. Showing players from recorded stats only.";}
  }else{rosterError="Rosters CSV not configured. Showing players from recorded stats only.";}
  await refreshVolunteers();
  const players=totals();renderSummary(players);renderSchedule();renderPlayers();renderLeaders();renderTeams();
}
document.querySelectorAll(".nav-button").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("active",b===btn));
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${btn.dataset.view}`));
}));
$("week-select").addEventListener("change",renderSchedule);
$("player-search").addEventListener("input",renderPlayers);
$("player-sort").addEventListener("change",renderPlayers);
$("close-dialog").addEventListener("click",()=>$("game-dialog").close());
$("game-dialog").addEventListener("click",e=>{if(e.target===$("game-dialog"))$("game-dialog").close()});
$("roster-sort").addEventListener("change",renderTeamDetails);
init();