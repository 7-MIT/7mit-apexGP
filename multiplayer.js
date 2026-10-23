// Apex GP multiplayer: ghost racing over Supabase Realtime (Broadcast + Presence) on the 7MIT server project.
// Nothing is written to any database table. Everything is ephemeral channel traffic.
(function(){
'use strict';
const SB_URL='https://lajzrempjyoqkubkumhb.supabase.co';
// Public anon (publishable) key: safe to ship in client code, it only grants what Row Level Security and Realtime allow.
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhanpyZW1wanlvcWt1Ymt1bWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4ODUzNDQsImV4cCI6MjEwMDQ2MTM0NH0.qM1qzhIPin7U1StnPP5n_0xEMRYTdl3Isy1HHahK8dQ';
const MAXP=20,STALE=4500,SEND_MS=125,SEND_MS_BUSY=200;
const $$=id=>document.getElementById(id);
const rid=()=>Math.random().toString(36).slice(2,10);
const clean=(s,n)=>String(s==null?'':s).replace(/[^\w \-.]/g,'').trim().slice(0,n);
const num=(v,lo,hi)=>{v=+v;return Number.isFinite(v)&&v>=lo&&v<=hi?v:null};
const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

const me={id:rid(),name:clean(ls.get('apexgp_mp_name'),14)||('Driver'+Math.floor(100+Math.random()*900)),room:clean(ls.get('apexgp_mp_room'),16).toUpperCase()||'PUBLIK'};
let client=null,ch=null,on=false,joining=false,topic='',lastSend=0,lastTick=0,roster={};const R=new Map(); // id -> remote player
const best=new Map(); // id -> best lap seconds (this session)

function status(t,c){const e=$$('mps');if(e){e.textContent=t;e.style.color=c||''}}
function trackIdx(){return typeof TI=='number'?TI:0}
function fmtT(t){return typeof fmt=='function'?fmt(t):t.toFixed(3)}

// ---- connection
function leave(){
 if(ch){try{ch.untrack();client.removeChannel(ch)}catch(e){}}
 ch=null;on=false;joining=false;R.forEach((_,id)=>MPR.del(id));R.clear();best.clear();roster={};renderBoard();renderRoster();
}
function join(){
 if(typeof supabase=='undefined'||!supabase.createClient){status('library failed to load','#ff5a5a');return}
 leave();joining=true;status('connecting…','#ffd21f');
 me.name=clean($$('mpn').value,14)||me.name;me.room=clean($$('mpr').value,16).toUpperCase()||'PUBLIK';
 ls.set('apexgp_mp_name',me.name);ls.set('apexgp_mp_room',me.room);ls.set('apexgp_mp_on','1');
 try{client=client||supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:20}}})}catch(e){status('could not start','#ff5a5a');joining=false;return}
 topic='apexgp:'+me.room+':'+trackIdx();
 const c=client.channel(topic,{config:{broadcast:{self:false,ack:false},presence:{key:me.id}}});ch=c;
 c.on('broadcast',{event:'s'},m=>onState(m&&m.payload));
 c.on('broadcast',{event:'lap'},m=>onLap(m&&m.payload));
 c.on('presence',{event:'sync'},()=>{if(ch!==c)return;roster={};const st=c.presenceState();for(const k in st){const p=st[k]&&st[k][0];if(p&&k!==me.id)roster[k]={name:clean(p.name,14)||'Driver'}}renderRoster()});
 c.subscribe(s=>{if(ch!==c)return;
  if(s==='SUBSCRIBED'){on=true;joining=false;status('online · '+me.room,'#2ee66b');announce();renderBoard();$$('mpc').textContent='Disconnect'}
  else if(s==='CHANNEL_ERROR'||s==='TIMED_OUT'){on=false;status(s==='TIMED_OUT'?'timed out, retrying…':'server refused the connection','#ff5a5a')}
  else if(s==='CLOSED'&&!joining){on=false;status('offline')}});
}
function announce(){if(!ch||!on)return;ch.track({name:me.name,team:TEAMS.indexOf(T),tyre:TCi,track:trackIdx()}).catch(()=>{})}
function disconnect(){ls.set('apexgp_mp_on','0');leave();status('offline');$$('mpc').textContent='Connect'}

// ---- incoming
function onState(p){
 if(!p||typeof p!='object')return;const id=clean(p.i,12);if(!id||id===me.id)return;
 const x=num(p.x,-1e5,1e5),y=num(p.y,-1e5,1e5),a=num(p.a,-20,20),v=num(p.v,-200,200),s=num(p.s,-1.2,1.2);
 if(x==null||y==null||a==null||v==null||s==null)return;
 let r=R.get(id);
 if(!r){if(R.size>=MAXP)return;const ti=num(p.m,0,TEAMS.length-1)|0,tc=num(p.u,0,2)|0;r={id,name:clean(p.n,14)||'Driver',ti,tc,x,y,a,v,s,br:0,drs:0,t:0,rx:x,ry:y,ra:a};R.set(id,r);MPR.add(id,ti,tc,r.name);
  r.team=ti;r.tyre=tc}
 const nm=clean(p.n,14);if(nm&&nm!==r.name){r.name=nm;MPR.add(id,r.ti,r.tc,nm)}
 const ti=num(p.m,0,TEAMS.length-1),tc=num(p.u,0,2);if((ti!=null&&(ti|0)!==r.ti)||(tc!=null&&(tc|0)!==r.tc)){r.ti=(ti==null?r.ti:ti|0);r.tc=(tc==null?r.tc:tc|0);MPR.add(id,r.ti,r.tc,r.name)}
 r.x=x;r.y=y;r.a=a;r.v=v;r.s=s;r.br=p.b?1:0;r.drs=p.d?1:0;r.t=performance.now();
}
function onLap(p){
 if(!p||typeof p!='object')return;const id=clean(p.i,12),t=num(p.t,20,600);if(!id||id===me.id||t==null)return;
 const nm=clean(p.n,14)||'Driver';if(!best.has(id)||t<best.get(id))best.set(id,t);
 const r=R.get(id);if(r)r.name=nm;feed(nm+'  '+fmtT(t));renderBoard();
}

// ---- per-frame (called from the renderer)
function tick(){
 const now=performance.now(),dt=Math.min(.1,(now-lastTick)/1000||.016);lastTick=now;
 if(!on)return;
 // send own state
 if(state!='menu'&&now-lastSend>(R.size>6?SEND_MS_BUSY:SEND_MS)&&ch){lastSend=now;const c=car,f=c.vx*Math.cos(c.a)+c.vy*Math.sin(c.a),q=(v,d)=>Math.round(v*d)/d;
  ch.send({type:'broadcast',event:'s',payload:{i:me.id,n:me.name,m:TEAMS.indexOf(T),u:TCi,x:q(c.x,10),y:q(c.y,10),a:q(c.a,100),v:q(f,10),s:q(c.st,100),b:c.br?1:0,d:c.drs?1:0}}).catch(()=>{})}
 // move remote cars with simple extrapolation and smoothing
 const k=1-Math.exp(-dt*10);
 R.forEach((r,id)=>{const age=now-r.t;if(age>STALE){MPR.del(id);R.delete(id);renderBoard();return}
  const ex=Math.min(.35,age/1000),tx=r.x+Math.cos(r.a)*r.v*ex,ty=r.y+Math.sin(r.a)*r.v*ex;
  if(Math.hypot(tx-r.rx,ty-r.ry)>40){r.rx=tx;r.ry=ty;r.ra=r.a}else{r.rx+=(tx-r.rx)*k;r.ry+=(ty-r.ry)*k;let d=r.a-r.ra;d=Math.atan2(Math.sin(d),Math.cos(d));r.ra+=d*k}
  MPR.set(id,r.rx,r.ry,r.ra,r.v,r.s,r.br,r.drs,dt,true)});
}
function mini(mx){R.forEach(r=>{mx.fillStyle=TEAMS[r.ti]?TEAMS[r.ti].c1:'#fff';mx.strokeStyle='#000';mx.lineWidth=1;mx.beginPath();mx.arc((r.rx-X0)*MS,(r.ry-Y0)*MS,2.6,0,7);mx.fill();mx.stroke()})}

// ---- lap sharing
function lap(t){if(!on)return;const id=me.id;if(!best.has(id)||t<best.get(id))best.set(id,t);renderBoard();
 if(ch)ch.send({type:'broadcast',event:'lap',payload:{i:id,n:me.name,t}}).catch(()=>{})}

// ---- UI
function renderRoster(){const ol=$$('mpl');if(!ol)return;ol.textContent='';const names=Object.values(roster).map(r=>r.name);
 if(!on){return}
 const li=document.createElement('li');li.textContent=me.name+' (you)';ol.appendChild(li);names.forEach(n=>{const l=document.createElement('li');l.textContent=n;ol.appendChild(l)});
 const h=$$('mph');if(h)h.textContent=(names.length+1)+' online in '+me.room}
function renderBoard(){const b=$$('mpb');if(!b)return;b.textContent='';if(!on){b.style.display='none';return}b.style.display='block';
 const rows=[];best.forEach((t,id)=>rows.push([id===me.id?me.name:(R.get(id)?R.get(id).name:(roster[id]?roster[id].name:'Driver')),t,id===me.id]));rows.sort((a,b)=>a[1]-b[1]);
 const t=document.createElement('div');t.className='mpt';t.textContent='ONLINE · '+me.room+' · '+(R.size+1)+(R.size?' drivers':' driver');b.appendChild(t);
 rows.slice(0,6).forEach((r,i)=>{const d=document.createElement('div');d.className=r[2]?'me':'';d.textContent=(i+1)+'. '+r[0]+'  '+fmtT(r[1]);b.appendChild(d)});
 const f=document.createElement('div');f.id='mpf';b.appendChild(f)}
let feedT=0;function feed(t){if(window.BC&&BC.feed)BC.feed(t);const f=$$('mpf');if(!f)return;f.textContent='◆ '+t;f.style.opacity=1;clearTimeout(feedT);feedT=setTimeout(()=>{f.style.opacity=0},5000)}

function init(){
 const nm=$$('mpn'),rm=$$('mpr'),btn=$$('mpc');if(!nm||!btn)return;
 nm.value=me.name;rm.value=me.room;
 btn.onclick=()=>{on||joining?disconnect():join()};
 [nm,rm].forEach(e=>e.addEventListener('keydown',ev=>ev.stopPropagation())); // typing must not drive the car
 addEventListener('beforeunload',()=>{if(ch)try{ch.untrack()}catch(e){}});
 if(ls.get('apexgp_mp_on')==='1')setTimeout(join,300);
}
function standings(){if(!on)return null;const out=[{id:me.id,name:me.name,ti:Math.max(0,TEAMS.indexOf(T)),tc:TCi,best:best.get(me.id),me:true}];
 R.forEach((r,id)=>out.push({id,name:r.name,ti:r.ti,tc:r.tc,best:best.get(id),me:false}));return out}
window.MP={tick,mini,lap,join,standings,isOn:()=>on,onTrack(){if(on||joining){if(ls.get('apexgp_mp_on')==='1')join()}},onTeam(){announce()}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
