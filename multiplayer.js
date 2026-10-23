// Apex GP multiplayer: rooms over Supabase Realtime (Broadcast + Presence) on the 7MIT project.
// No database tables are read or written; everything is ephemeral channel traffic.
//
//   Lobby channel  "apexgp:lobby:v2"  public rooms advertise themselves here with Presence (this is "discovery").
//   Room channel   "apexgp:r:<CODE>"  one per room. The host's presence entry carries the room settings; everybody
//                                     broadcasts car state, lap times and the host's "go" signal on it.
// A room exists only while its host is connected: when the host leaves, the room closes for everyone.
(function(){
'use strict';
const SB_URL='https://lajzrempjyoqkubkumhb.supabase.co';
// Public anon (publishable) key: safe in client code, it only grants what Row Level Security and Realtime allow.
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhanpyZW1wanlvcWt1Ymt1bWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4ODUzNDQsImV4cCI6MjEwMDQ2MTM0NH0.qM1qzhIPin7U1StnPP5n_0xEMRYTdl3Isy1HHahK8dQ';
const LOBBY='apexgp:lobby:v2',ALPHA='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',CODE_LEN=5;
const STALE=4500,SEND_MS=125,SEND_MS_BUSY=200,PROBE_MS=900,JOIN_TIMEOUT=3500,HOST_GRACE=2600;
const $$=id=>document.getElementById(id);
const rid=()=>Math.random().toString(36).slice(2,10);
const clean=(s,n)=>String(s==null?'':s).replace(/[^\w \-.']/g,'').trim().slice(0,n);
const num=(v,lo,hi)=>{v=+v;return Number.isFinite(v)&&v>=lo&&v<=hi?v:null};
const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtT=t=>typeof fmt=='function'?fmt(t):t.toFixed(3);

const me={id:rid(),name:clean(ls.get('apexgp_mp_name'),14)||('Driver'+Math.floor(100+Math.random()*900))};
const pref={pub:ls.get('apexgp_mp_pub')!=='0',max:+ls.get('apexgp_mp_max')||8};
let client=null,room=null,lobby=null,discovered=[],onScreen=false,lastSend=0,lastTick=0,lastAud=0,feedT=0;
const R=new Map(),best=new Map(); // R: remote cars by player id, best: best lap seconds by player id

function status(t,c){const e=$$('mps');if(e){e.textContent=t;e.style.color=c||'var(--mut)'}}
function err(t){const n=$$('mperr');if(n)n.textContent=t;const rn=$$('rnote');if(rn&&room&&room.joined)rn.textContent=t;if(typeof toast=='function')toast(t,'#ff5a5a',3200)}
function ensureClient(){
 if(client)return true;
 if(typeof supabase=='undefined'||!supabase.createClient){status('realtime library failed to load','#ff5a5a');return false}
 try{client=supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:20}}});return true}
 catch(e){status('could not start','#ff5a5a');return false}}
const myMeta=()=>{const m={name:me.name,team:Math.max(0,TEAMS.indexOf(T)),tyre:TCi};
 if(room&&room.host){m.host=1;m.rn=room.info.name;m.trk=room.info.trk;m.max=room.info.max;m.pub=room.info.pub?1:0}return m};
const count=()=>room?Object.keys(room.roster).length:0;
const trackName=i=>TRACKS[i]?TRACKS[i].name:'?';

// ---- lobby (discovery)
function lobbyJoin(){
 if(lobby||!ensureClient())return;
 const c=client.channel(LOBBY,{config:{presence:{key:'u'+me.id}}});lobby={ch:c,ready:false};
 c.on('presence',{event:'sync'},()=>{if(lobby&&lobby.ch===c)readLobby()});
 c.subscribe(s=>{if(!lobby||lobby.ch!==c)return;
  if(s==='SUBSCRIBED'){lobby.ready=true;advertise();readLobby();if(!room)status('online','#2ee66b')}
  else if(s==='CHANNEL_ERROR'||s==='TIMED_OUT'){lobby.ready=false;if(!room)status('server unreachable','#ff5a5a');renderDisc()}});
}
function lobbyLeave(){if(!lobby)return;const c=lobby.ch;lobby=null;discovered=[];try{c.untrack();client.removeChannel(c)}catch(e){}}
function readLobby(){
 if(!lobby)return;const st=lobby.ch.presenceState();discovered=[];
 for(const k in st){const m=st[k]&&st[k][0];if(!m||!m.code||!m.pub)continue;const code=clean(m.code,CODE_LEN+1).toUpperCase();if(room&&room.code===code)continue;
  discovered.push({code,name:clean(m.name,24)||'Room',trk:num(m.trk,0,TRACKS.length-1)==null?0:+m.trk,n:num(m.n,1,99)||1,max:num(m.max,2,20)||8,host:clean(m.host,14)||'Host'})}
 discovered.sort((a,b)=>b.n-a.n);renderDisc()}
function advertise(){ // a public room's host announces it in the lobby; everyone else just listens
 if(!lobby||!lobby.ready)return;
 if(room&&room.host&&room.joined&&room.info.pub)lobby.ch.track({code:room.code,name:room.info.name,trk:room.info.trk,n:count(),max:room.info.max,host:me.name,pub:1}).catch(()=>{});
 else lobby.ch.untrack().catch(()=>{})}
function renderDisc(){
 const box=$$('mpdisc');if(!box)return;box.textContent='';
 if(!lobby||!lobby.ready){box.innerHTML='<p class="note">'+(lobby?'Connecting to the lobby…':'Not connected.')+'</p>';return}
 if(!discovered.length){box.innerHTML='<p class="note">No public rooms right now. Create one, or join a friend with their code.</p>';return}
 for(const d of discovered){const row=document.createElement('div');row.className='rm';const full=d.n>=d.max;
  row.innerHTML='<div><div class="nm">'+esc(d.name)+'</div><div class="sb">'+esc(trackName(d.trk))+' · host '+esc(d.host)+' · code '+esc(d.code)+'</div></div><div class="rt"><span class="sb">'+d.n+' / '+d.max+'</span><button class="cta" '+(full?'disabled':'')+'>'+(full?'Full':'Join')+'</button></div>';
  row.querySelector('button').onclick=()=>joinRoom(d.code);box.appendChild(row)}}

// ---- rooms
function genCode(){let s='';for(let i=0;i<CODE_LEN;i++)s+=ALPHA[Math.floor(Math.random()*ALPHA.length)];return s}
function clearErr(){const n=$$('mperr');if(n)n.textContent=''}
function createRoom(){
 clearErr();if(!ensureClient())return;if(room)leaveRoom(true);
 me.name=clean($$('mpn').value,14)||me.name;
 const sel=+$$('mpct').value,trk=TRACKS[sel]?sel:TI;
 const info={name:clean($$('mprn').value,24)||(me.name+"'s room"),trk,max:pref.max,pub:pref.pub};
 ls.set('apexgp_mp_name',me.name);openRoom(genCode(),true,info,0)}
function joinRoom(code){
 clearErr();code=clean(code,CODE_LEN+1).toUpperCase();if(code.length!==CODE_LEN){err('Enter the '+CODE_LEN+'-character room code');return}
 if(!ensureClient())return;me.name=clean($$('mpn').value,14)||me.name;ls.set('apexgp_mp_name',me.name);openRoom(code,false,null,0)}
function openRoom(code,host,info,attempt){
 if(room)leaveRoom(true);
 status(host?'creating room…':'joining '+code+'…','#ffd21f');
 const c=client.channel('apexgp:r:'+code,{config:{broadcast:{self:false,ack:false},presence:{key:me.id}}});
 const r={code,ch:c,host,info:info||{name:'',trk:TI,max:8,pub:false},roster:{},hostId:null,joined:false,timer:0,goneAt:0};room=r;
 c.on('broadcast',{event:'s'},m=>onState(m&&m.payload));
 c.on('broadcast',{event:'lap'},m=>onLap(m&&m.payload));
 c.on('broadcast',{event:'go'},m=>onGo(m&&m.payload));
 c.on('presence',{event:'sync'},()=>{if(room===r)onRoomSync()});
 c.subscribe(s=>{if(room!==r)return;
  if(s==='SUBSCRIBED'){
   if(host){ // make sure nobody else already hosts this code, then claim it
    r.timer=setTimeout(()=>{if(room!==r)return;const st=c.presenceState();
     if(Object.keys(st).some(k=>k!==me.id&&st[k][0]&&st[k][0].host)){leaveRoom(true);if(attempt<4)openRoom(genCode(),true,info,attempt+1);else err('Could not create a room, try again');return}
     r.joined=true;c.track(myMeta()).catch(()=>{});setTrackFromRoom(r.info.trk);showRoom();status('hosting '+code,'#2ee66b');advertise()},PROBE_MS)}
   else{c.track(myMeta()).catch(()=>{});r.timer=setTimeout(()=>{if(room===r&&!r.hostId){err('Room '+code+' not found');leaveRoom()}},JOIN_TIMEOUT)}}
  else if(s==='CHANNEL_ERROR'||s==='TIMED_OUT'){if(room===r){err(s==='TIMED_OUT'?'Connection timed out':'The server refused the connection');leaveRoom()}}});
}
function onRoomSync(){
 const r=room,st=r.ch.presenceState();r.roster={};r.hostId=null;let hm=null;
 for(const k in st){const p=st[k]&&st[k][0];if(!p)continue;r.roster[k]={name:clean(p.name,14)||'Driver',team:num(p.team,0,TEAMS.length-1)|0,tyre:num(p.tyre,0,2)|0,host:!!p.host};
  if(p.host){r.hostId=k;if(k!==me.id)hm=p}}
 if(!r.host){
  if(r.hostId){clearTimeout(r.timer);r.goneAt=0;
   const trk=num(hm.trk,0,TRACKS.length-1),max=num(hm.max,2,20)||8,nm=clean(hm.rn,24)||'Room';
   if(!r.joined){if(Object.keys(r.roster).length>max){err('Room is full');leaveRoom();return}
    r.joined=true;r.info={name:nm,trk:trk==null?TI:trk,max,pub:!!hm.pub};setTrackFromRoom(r.info.trk);showRoom();status('in room '+r.code,'#2ee66b')}
   else{r.info.name=nm;r.info.max=max;if(trk!=null&&trk!==r.info.trk){r.info.trk=trk;setTrackFromRoom(trk)}}}
  else if(r.joined&&!r.goneAt){r.goneAt=performance.now();setTimeout(()=>{if(room===r&&!r.hostId&&performance.now()-r.goneAt>=HOST_GRACE-100){err('The host closed the room');leaveRoom()}},HOST_GRACE)}}
 else if(r.joined){advertise()}
 renderRoom()}
function setTrackFromRoom(i){if(i!=null&&TRACKS[i]&&i!==TI){loadTrack(i);best.clear();R.forEach((_,id)=>MPR.del(id));R.clear()}const s=$$('rtrack');if(s)s.value=String(TI)}
function leaveRoom(keepLobby){
 if(!room){if(!keepLobby&&!onScreen)lobbyLeave();return}
 const r=room;room=null;clearTimeout(r.timer);try{r.ch.untrack();client.removeChannel(r.ch)}catch(e){}
 R.forEach((_,id)=>MPR.del(id));R.clear();best.clear();
 showLobby();advertise();if(!keepLobby&&!onScreen)lobbyLeave();status(lobby&&lobby.ready?'online':'offline',lobby&&lobby.ready?'#2ee66b':'')}
const leave=()=>{leaveRoom(false);onScreen=false;lobbyLeave();status('offline')};

// ---- host actions
function startAll(){if(!room||!room.host||!room.joined)return;room.ch.send({type:'broadcast',event:'go',payload:{t:Date.now()}}).catch(()=>{});feed('You started the session');if(typeof begin=='function')begin()}
function onGo(){if(!room||!room.joined||room.host)return;feed('Host started the session');if(typeof begin=='function')begin()}
function hostSetTrack(i){if(!room||!room.host||!TRACKS[i])return;loadTrack(i);best.clear();R.forEach((_,id)=>MPR.del(id));R.clear();room.info.trk=i;room.ch.track(myMeta()).catch(()=>{});advertise();renderRoom()}

// ---- incoming car data
function onState(p){
 if(!room||!room.joined||!p||typeof p!=='object')return;const id=clean(p.i,12);if(!id||id===me.id)return;
 if(num(p.k,0,99)!==TI)return; // different circuit (host is switching): ignore until we follow
 const x=num(p.x,-1e5,1e5),y=num(p.y,-1e5,1e5),a=num(p.a,-20,20),v=num(p.v,-200,200),s=num(p.s,-1.2,1.2);
 if(x==null||y==null||a==null||v==null||s==null)return;
 let r=R.get(id);
 if(!r){if(R.size>=20)return;const ti=num(p.m,0,TEAMS.length-1)|0,tc=num(p.u,0,2)|0;r={id,name:clean(p.n,14)||'Driver',ti,tc,x,y,a,v,s,br:0,drs:0,th:0,t:0,rx:x,ry:y,ra:a};R.set(id,r);MPR.add(id,ti,tc,r.name)}
 const nm=clean(p.n,14);if(nm&&nm!==r.name){r.name=nm;MPR.add(id,r.ti,r.tc,nm)}
 const ti=num(p.m,0,TEAMS.length-1),tc=num(p.u,0,2);if((ti!=null&&(ti|0)!==r.ti)||(tc!=null&&(tc|0)!==r.tc)){r.ti=ti==null?r.ti:ti|0;r.tc=tc==null?r.tc:tc|0;MPR.add(id,r.ti,r.tc,r.name)}
 r.x=x;r.y=y;r.a=a;r.v=v;r.s=s;r.br=p.b?1:0;r.drs=p.d?1:0;r.th=p.h?1:0;r.t=performance.now()}
function onLap(p){
 if(!room||!room.joined||!p||typeof p!=='object')return;const id=clean(p.i,12),t=num(p.t,20,600);if(!id||id===me.id||t==null)return;
 if(num(p.k,0,99)!==TI)return;const nm=clean(p.n,14)||'Driver';if(!best.has(id)||t<best.get(id))best.set(id,t);
 const r=R.get(id);if(r)r.name=nm;feed(nm+'  '+fmtT(t));renderBoard()}

// ---- per-frame (called from the renderer)
function tick(){
 const now=performance.now(),dt=Math.min(.1,(now-lastTick)/1000||.016);lastTick=now;
 if(!room||!room.joined)return;
 if(state!='menu'&&now-lastSend>(R.size>6?SEND_MS_BUSY:SEND_MS)){lastSend=now;const c=car,q=(v,d)=>Math.round(v*d)/d,f=c.vx*Math.cos(c.a)+c.vy*Math.sin(c.a);
  room.ch.send({type:'broadcast',event:'s',payload:{i:me.id,n:me.name,m:TEAMS.indexOf(T),u:TCi,k:TI,x:q(c.x,10),y:q(c.y,10),a:q(c.a,100),v:q(f,10),s:q(c.st,100),b:c.br?1:0,d:c.drs?1:0,h:c.th?1:0}}).catch(()=>{})}
 const k=1-Math.exp(-dt*10),aud=[];
 R.forEach((r,id)=>{const age=now-r.t;if(age>STALE){MPR.del(id);R.delete(id);renderBoard();return}
  const ex=Math.min(.35,age/1000),tx=r.x+Math.cos(r.a)*r.v*ex,ty=r.y+Math.sin(r.a)*r.v*ex;
  if(Math.hypot(tx-r.rx,ty-r.ry)>40){r.rx=tx;r.ry=ty;r.ra=r.a}else{r.rx+=(tx-r.rx)*k;r.ry+=(ty-r.ry)*k;let d=r.a-r.ra;d=Math.atan2(Math.sin(d),Math.cos(d));r.ra+=d*k}
  MPR.set(id,r.rx,r.ry,r.ra,r.v,r.s,r.br,r.drs,dt,true);aud.push({id,x:r.rx,y:r.ry,vx:Math.cos(r.ra)*r.v,vy:Math.sin(r.ra)*r.v,th:r.th})});
 if(window.AUD&&state!='menu'&&now-lastAud>90){lastAud=now;AUD.remote(aud)}}
function mini(mx){R.forEach(r=>{mx.fillStyle=TEAMS[r.ti]?TEAMS[r.ti].c1:'#fff';mx.strokeStyle='#000';mx.lineWidth=1;mx.beginPath();mx.arc((r.rx-X0)*MS,(r.ry-Y0)*MS,2.6,0,7);mx.fill();mx.stroke()})}
function lap(t){if(!room||!room.joined)return;best.set(me.id,Math.min(t,best.get(me.id)||1e9));renderBoard();
 room.ch.send({type:'broadcast',event:'lap',payload:{i:me.id,n:me.name,t,k:TI}}).catch(()=>{})}
function standings(){if(!room||!room.joined)return null;
 const out=[{id:me.id,name:me.name,ti:Math.max(0,TEAMS.indexOf(T)),tc:TCi,best:best.get(me.id),me:true}];
 R.forEach((r,id)=>out.push({id,name:r.name,ti:r.ti,tc:r.tc,best:best.get(id),me:false}));return out}

// ---- UI
function feed(t){if(window.BC&&BC.feed)BC.feed(t);const f=$$('mpf');if(!f)return;f.textContent='◆ '+t;f.style.opacity=1;clearTimeout(feedT);feedT=setTimeout(()=>{f.style.opacity=0},5000)}
function renderBoard(){const b=$$('mpb');if(!b)return;b.textContent='';if(!room||!room.joined){b.style.display='none';return}b.style.display='block';
 const rows=[];best.forEach((t,id)=>rows.push([id===me.id?me.name:(R.get(id)?R.get(id).name:(room.roster[id]?room.roster[id].name:'Driver')),t,id===me.id]));rows.sort((a,b)=>a[1]-b[1]);
 const t=document.createElement('div');t.className='mpt';t.textContent='ROOM '+room.code+' · '+count()+(count()===1?' driver':' drivers');b.appendChild(t);
 rows.slice(0,6).forEach((r,i)=>{const d=document.createElement('div');d.className=r[2]?'me':'';d.textContent=(i+1)+'. '+r[0]+'  '+fmtT(r[1]);b.appendChild(d)});
 const f=document.createElement('div');f.id='mpf';b.appendChild(f)}
function showLobby(){const a=$$('mp-lobby'),b=$$('mp-room');if(a)a.style.display='block';if(b)b.style.display='none';renderBoard();renderDisc()}
function showRoom(){const a=$$('mp-lobby'),b=$$('mp-room');if(a)a.style.display='none';if(b)b.style.display='block';renderRoom();renderBoard()}
function renderRoom(){
 if(!room||!room.joined)return;const r=room;
 $$('rcode').textContent=r.code;
 $$('rinfo').textContent=(r.info.name||'Room')+' · '+(r.info.pub?'public':'private')+' · '+count()+' / '+r.info.max+' drivers'+(r.host?' · you are the host':'');
 const sel=$$('rtrack');sel.value=String(TI);sel.disabled=!r.host;
 $$('rstartall').style.display=r.host?'':'none';
 $$('rnote').textContent=r.host?'Share the code. Drivers can start whenever they like, or press "Start for everyone" to start all at once. If you leave, the room closes.':'Waiting for the host. You can start your own session at any time.';
 const box=$$('rlist');box.textContent='';
 Object.keys(r.roster).sort((a,b)=>(r.roster[b].host?1:0)-(r.roster[a].host?1:0)).forEach(id=>{const p=r.roster[id],d=document.createElement('div');d.className='pl';
  d.innerHTML='<i style="background:'+esc((TEAMS[p.team]||TEAMS[0]).c1)+'"></i><span>'+esc(p.name)+(id===me.id?' (you)':'')+'</span><span class="sb">'+esc((TEAMS[p.team]||TEAMS[0]).n)+'</span>'+(p.host?'<span class="hb">HOST</span>':'');box.appendChild(d)});
 renderBoard()}
function segs(box,opts,get,set){box.innerHTML='';opts.forEach(([n,v])=>{const b=document.createElement('button');b.textContent=n;b.className=get()==v?'sel':'';b.onclick=()=>{set(v);[...box.children].forEach(x=>x.classList.remove('sel'));b.classList.add('sel')};box.appendChild(b)})}
function fillTracks(sel){sel.innerHTML='';const add=(g,t,i)=>{const o=document.createElement('option');o.value=i;o.textContent=t.name+' · '+(t.real?(t.km/1000).toFixed(2)+' km':'original');g.appendChild(o)};
 const g1=document.createElement('optgroup');g1.label='Real circuits';const g2=document.createElement('optgroup');g2.label='Original circuits';
 TRACKS.forEach((t,i)=>add(t.real?g1:g2,t,i));sel.appendChild(g1);sel.appendChild(g2);sel.value=String(TI)}

function enter(){onScreen=true;$$('mpn').value=me.name;fillTracks($$('mpct'));fillTracks($$('rtrack'));
 if(room&&room.joined)showRoom();else showLobby();
 if(!room)status('connecting…','#ffd21f');lobbyJoin();if(lobby&&lobby.ready)status(room?'':'online','#2ee66b')}
function exit(){onScreen=false;if(!room)lobbyLeave()}

function init(){
 if(!$$('mpn'))return;
 segs($$('mpvis'),[['Public (discoverable)',1],['Private (code only)',0]],()=>pref.pub?1:0,v=>{pref.pub=!!v;ls.set('apexgp_mp_pub',v?'1':'0')});
 segs($$('mpmax'),[['2',2],['4',4],['8',8],['12',12],['20',20]],()=>pref.max,v=>{pref.max=v;ls.set('apexgp_mp_max',String(v))});
 $$('mpcreate').onclick=createRoom;$$('mpjoin').onclick=()=>joinRoom($$('mpcode').value);
 $$('mpcode').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')});
 $$('mpcode').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom($$('mpcode').value)});
 $$('mprefresh').onclick=()=>{lobbyLeave();discovered=[];renderDisc();lobbyJoin()};
 $$('rleave').onclick=()=>{leaveRoom(true)};$$('rstart').onclick=()=>{if(typeof begin=='function')begin()};$$('rstartall').onclick=startAll;
 $$('rtrack').onchange=e=>{if(room&&room.host)hostSetTrack(+e.target.value)};
 $$('rcopy').onclick=()=>{const t=room?room.code:'';const done=()=>{$$('rcopy').textContent='Copied';setTimeout(()=>{$$('rcopy').textContent='Copy'},1500)};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(done,()=>{});else{const i=document.createElement('input');i.value=t;document.body.appendChild(i);i.select();try{document.execCommand('copy');done()}catch(e){}i.remove()}};
 $$('mpn').addEventListener('input',e=>{const n=clean(e.target.value,14);if(n){me.name=n;ls.set('apexgp_mp_name',n);if(room&&room.joined)room.ch.track(myMeta()).catch(()=>{})}});
 // typing in the menu must not drive the car
 ['mpn','mprn','mpcode'].forEach(id=>$$(id).addEventListener('keydown',ev=>ev.stopPropagation()));
 addEventListener('beforeunload',()=>{if(room)try{room.ch.untrack()}catch(e){}});
}
window.MP={tick,mini,lap,standings,enter,exit,leave,inRoom:()=>!!(room&&room.joined),isOn:()=>!!(room&&room.joined),isHost:()=>!!(room&&room.host),
 locked:()=>!!(room&&room.joined&&!room.host),onTrack(){},onHostTrack(){},onTeam(){if(room&&room.joined)room.ch.track(myMeta()).catch(()=>{})},code:()=>room?room.code:null};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
