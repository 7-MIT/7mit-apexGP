// Apex GP broadcast overlay: F1 TV style graphics (timing tower, sector and lap banners, driver lower third, telemetry strip).
// Reads game state from index.html globals and the multiplayer standings; it never changes the simulation.
(function(){
'use strict';
const css=`
#menu{z-index:20}
#bc{position:fixed;inset:0;z-index:5;pointer-events:none;font-family:"Trebuchet MS",system-ui,sans-serif;font-weight:700;color:#fff;font-variant-numeric:tabular-nums}
body:not(.tv) #bc{display:none}
body.tv #tim,body.tv #spd,body.tv #mpb{display:none!important}
#bc small{font-weight:600;color:#aab3c2;letter-spacing:.08em;font-size:10px}
/* timing tower */
#bt{position:absolute;left:calc(8px + env(safe-area-inset-left,0px));top:calc(8px + env(safe-area-inset-top,0px));width:236px;animation:bcL .6s cubic-bezier(.2,.8,.2,1) both}
.bh{display:flex;align-items:center;gap:8px;height:30px;padding:0 10px;background:linear-gradient(90deg,#e10600,#a30400);clip-path:polygon(0 0,calc(100% - 12px) 0,100% 100%,0 100%);font-size:13px;letter-spacing:.04em}
.bh .lg{font:900 15px/1 "Trebuchet MS",sans-serif;letter-spacing:-.3px}.bh .lg i{font-style:normal;color:#101318;background:#fff;padding:1px 4px;margin-left:3px;border-radius:2px}
.bh #blap{margin-left:auto;font-size:12px}
#bcn{font-size:10px;font-weight:600;opacity:.9;max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#bsec{display:flex;gap:3px;padding:4px 10px;background:rgba(10,12,18,.9)}
#bsec i{flex:1;height:5px;background:#2a2e38;border-radius:2px;transition:background .3s}
#bsec i.g{background:#2ee66b}#bsec i.y{background:#ffd21f}#bsec i.p{background:#b44cff}#bsec i.cur{animation:bcPulse .9s ease-in-out infinite}
#brows{position:relative;background:rgba(10,12,18,.82);margin-top:2px}
.br{position:absolute;left:0;right:0;height:26px;display:flex;align-items:center;gap:6px;padding:0 8px 0 0;font-size:13px;transition:transform .6s cubic-bezier(.3,.9,.3,1),opacity .4s,background .4s;background:rgba(18,21,29,.92);border-bottom:1px solid rgba(255,255,255,.06)}
.br.me{background:linear-gradient(90deg,#e8e8ee,#c9ccd4);color:#101318}
.br.ghost{opacity:.62}
.br .ps{width:26px;height:100%;display:grid;place-items:center;background:rgba(255,255,255,.08);font-size:12px}.br.me .ps{background:rgba(0,0,0,.12)}
.br .tc{width:5px;height:16px;border-radius:1px}
.br .cd{width:38px;letter-spacing:.05em}
.br .gp{margin-left:auto;font-family:"Courier New",monospace;font-size:12px}
.br .ty{width:9px;height:9px;border-radius:50%;border:2px solid #fff;flex:none}
.br.out{opacity:0}
/* banners */
.bb{position:absolute;opacity:0;transition:transform .55s cubic-bezier(.2,.9,.2,1),opacity .35s}
#bsb{right:calc(10px + env(safe-area-inset-right,0px));top:42%;width:240px;transform:translateX(120%)}
#bsb.in{transform:none;opacity:1}
.bbx{background:rgba(10,12,18,.9);border-left:5px solid #ffd21f;padding:8px 12px;clip-path:polygon(0 0,100% 0,100% 100%,10px 100%)}
.bbx.grn{border-color:#2ee66b}.bbx.pur{border-color:#b44cff}.bbx.red{border-color:#ff3b3b}
.bbx small{display:block}.bbx .big{font:700 26px/1.1 "Courier New",monospace}.bbx .dl{font:700 15px "Courier New",monospace;margin-left:8px}
.bbx.grn .dl{color:#2ee66b}.bbx.yel .dl{color:#ffd21f}.bbx.pur .dl{color:#d089ff}.bbx.red .big{font:700 20px "Trebuchet MS",sans-serif;color:#ff6b6b}
#blt{left:50%;top:44px;width:300px;margin-left:-150px;transform:translateY(-140%)}
#blt.in{transform:none;opacity:1}
#blt .bbx{text-align:center;border-left:0;border-top:5px solid #ffd21f;clip-path:polygon(0 0,100% 0,calc(100% - 14px) 100%,14px 100%);padding:8px 18px 14px}
#blt .bbx.pur{border-top-color:#b44cff}#blt .bbx.grn{border-top-color:#2ee66b}#blt .bbx.red{border-top-color:#ff3b3b}
#blt .big{font-size:32px}
/* lower third */
#bdr{left:calc(10px + env(safe-area-inset-left,0px));bottom:calc(22px + env(safe-area-inset-bottom,0px));width:300px;transform:translateX(-120%)}
#bdr.in{transform:none;opacity:1}
#bdr .bd{display:flex;align-items:stretch;background:rgba(10,12,18,.92);clip-path:polygon(0 0,100% 0,calc(100% - 14px) 100%,0 100%)}
#bdr .cl{width:8px}#bdr .tx{padding:8px 24px 8px 12px}
#bdr .nm{font:900 20px/1.1 "Trebuchet MS",sans-serif;text-transform:uppercase;letter-spacing:.02em}
#bdr .tm{font-size:12px;color:#c7cdd8;font-weight:600}
#bdr .tm b{color:#fff}
#bdr .sw{height:3px;background:linear-gradient(90deg,#e10600,#ffd21f);transform-origin:left;transform:scaleX(0);transition:transform 1.2s .3s cubic-bezier(.2,.8,.2,1)}
#bdr.in .sw{transform:scaleX(1)}
/* telemetry strip */
#btel{position:absolute;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;align-items:center;gap:14px;padding:8px 26px;background:rgba(10,12,18,.88);clip-path:polygon(16px 0,100% 0,calc(100% - 16px) 100%,0 100%);animation:bcU .6s .2s cubic-bezier(.2,.8,.2,1) both}
#btel::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,#e10600,#ffd21f)}
.tg b{font:900 34px/1 "Trebuchet MS",sans-serif;color:#ffd21f;display:block;text-align:center;min-width:26px}
.ts{text-align:right;min-width:74px}.ts b{font:700 32px/1 "Courier New",monospace;display:block}
.tb{display:flex;gap:5px;align-items:flex-end;height:38px}.tb .bar{width:9px;height:38px;background:#272b36;border-radius:2px;position:relative;overflow:hidden}
.tb .bar i{position:absolute;left:0;right:0;bottom:0;height:0;transition:height .09s linear}
.tb .th i{background:#2ee66b}.tb .br i{background:#ff3b3b}
.tx2{display:flex;flex-direction:column;gap:4px;min-width:110px}
#tdrs{align-self:flex-start;padding:1px 8px;border-radius:3px;background:#272b36;color:#6c7380;font-size:12px;transition:background .2s,color .2s,transform .2s}
#tdrs.av{background:#8a6d00;color:#fff}#tdrs.on{background:#127a36;color:#fff;transform:scale(1.12);box-shadow:0 0 12px #2ee66b99}
.ers{height:7px;background:#272b36;border-radius:3px;overflow:hidden;position:relative}.ers i{position:absolute;left:0;top:0;bottom:0;width:0;background:#3aa0ff;transition:width .15s}
#tty{font-size:11px;color:#c7cdd8;display:flex;align-items:center;gap:6px}#tty i{width:11px;height:11px;border-radius:50%;border:3px solid #fff}
body.cock #btel{display:none}
/* multiplayer lap ticker */
#bfeed{position:absolute;left:calc(8px + env(safe-area-inset-left,0px));top:calc(8px + env(safe-area-inset-top,0px));transform:translateY(var(--ty,300px));font-size:11px;background:rgba(10,12,18,.8);padding:3px 8px;border-left:3px solid #3aa0ff;opacity:0;transition:opacity .4s}
@keyframes bcL{from{transform:translateX(-110%);opacity:0}to{transform:none;opacity:1}}
@keyframes bcU{from{transform:translate(-50%,140%);opacity:0}to{transform:translateX(-50%);opacity:1}}
@keyframes bcPulse{50%{opacity:.35}}
@media (max-width:760px){#bt{width:200px;transform-origin:0 0}#bdr{display:none}#btel{gap:8px;padding:6px 16px;zoom:.8}#blt{top:40px}}
@media (pointer:coarse){#btel{bottom:auto;top:calc(34px + env(safe-area-inset-top,0px))}#bsb{top:56%}}
#tv.on{background:#e10600}
`;
const sty=document.createElement('style');sty.textContent=css;document.head.appendChild(sty);

const root=document.createElement('div');root.id='bc';
root.innerHTML='<div id="bt"><div class="bh"><b class="lg">APEX<i>GP</i></b><span id="bcn"></span><span id="blap">LAP 1</span></div><div id="bsec"><i></i><i></i><i></i></div><div id="brows"></div></div>'+
'<div id="bfeed"></div><div class="bb" id="bsb"></div><div class="bb" id="blt"></div><div class="bb" id="bdr"></div>'+
'<div id="btel"><div class="tg"><small>GEAR</small><b id="tgr">N</b></div><div class="ts"><small>KM/H</small><b id="tsp">0</b></div>'+
'<div class="tb"><div class="bar th"><i id="tth"></i></div><div class="bar br"><i id="tbr"></i></div></div>'+
'<div class="tx2"><div id="tdrs">DRS</div><div class="ers"><i id="ters"></i></div><div id="tty"></div></div></div>';
document.body.appendChild(root);
const $$=id=>document.getElementById(id),ROW=26;

// ---- helpers
const code=n=>(String(n||'').replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase()||'DRV');
const teamBy=n=>TEAMS.find(t=>t.n===n);
const myName=()=>{const e=$$('mpn');return(e&&e.value.trim())||'Driver'};
const sgn=d=>(d>=0?'+':'−')+Math.abs(d).toFixed(3);
function show(el,html,ms){el.innerHTML=html;el.classList.add('in');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('in'),ms)}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
let sessBest=null,lastTI=-1,wasState='menu',lastDrs=0;

// ---- events called from the game
window.BC={
 sector(i,t,old,g){const has=old<1e8,d=has?t-old:null;
  show($$('bsb'),'<div class="bbx '+(g?'grn':'yel')+'"><small>SECTOR '+(i+1)+'</small><span class="big">'+t.toFixed(3)+'</span>'+(has?'<span class="dl">'+sgn(d)+'</span>':'')+'</div>',3200)},
 lap(lt,pb,prev){if(sessBest==null||lt<sessBest)sessBest=lt;const has=prev!=null;
  show($$('blt'),'<div class="bbx '+(pb?'pur':'yel')+'"><small>'+(pb?'NEW RECORD':'LAP TIME')+'</small><span class="big">'+esc(fmt(lt))+'</span>'+(has?'<span class="dl">'+sgn(lt-prev)+'</span>':'')+'</div>',4800)},
 deleted(){show($$('blt'),'<div class="bbx red"><small>TRACK LIMITS</small><span class="big">LAP DELETED</span></div>',3200)},
 begin(){sessBest=sessBest;const tm=(window.MP&&MP.isOn&&MP.isOn()?myName():'Driver');
  show($$('bdr'),'<div class="bd"><div class="cl" style="background:'+esc(T.c1)+'"></div><div class="tx"><div class="nm">'+esc(tm)+'</div><div class="tm"><b>'+esc(T.n)+'</b> · '+esc(TCS[TCi].n)+' tyres</div><div class="tm">'+esc(TRK.name)+' · Time attack</div></div></div><div class="sw"></div>',5200)},
 feed(t){const f=$$('bfeed');f.textContent='◆ '+t;f.style.setProperty('--ty',(document.getElementById('brows').offsetHeight+80)+'px');f.style.opacity=1;clearTimeout(f._t);f._t=setTimeout(()=>f.style.opacity=0,5000)},
 toggle(){const on=!document.body.classList.contains('tv');set(on)}
};
function set(on){document.body.classList.toggle('tv',on);try{localStorage.setItem('apexgp_tv',on?'1':'0')}catch(e){}const b=$$('tv');if(b)b.classList.toggle('on',on)}
{let v='1';try{v=localStorage.getItem('apexgp_tv')||'1'}catch(e){}set(v!=='0');const b=$$('tv');if(b)b.onclick=()=>BC.toggle()}
addEventListener('keydown',e=>{if(e.code==='KeyV'&&!/INPUT|TEXTAREA/.test((e.target||{}).tagName||''))BC.toggle()});

// ---- timing tower
const rows=new Map();
function entries(){const out=[],mp=window.MP&&MP.standings?MP.standings():null;
 if(mp&&mp.length)mp.forEach(p=>out.push({k:'p'+p.id,cd:code(p.name),col:(TEAMS[p.ti]||TEAMS[0]).c1,ty:TCS[p.tc]?TCS[p.tc].c:'#fff',t:p.best,me:p.me}));
 else{out.push({k:'me',cd:code(myName()),col:T.c1,ty:TCS[TCi].c,t:sessBest,me:true});
  (typeof rec!='undefined'?rec:[]).slice(0,6).forEach(r=>{const tm=teamBy(r.team);out.push({k:'r'+r.d,cd:code(r.team),col:tm?tm.c1:'#888',ty:null,t:r.t,ghost:true})})}
 out.sort((a,b)=>(a.t==null)-(b.t==null)||(a.t-b.t));return out.slice(0,9)}
function tower(){const list=entries(),lead=list.find(e=>e.t!=null),seen=new Set(),box=$$('brows');
 list.forEach((e,i)=>{seen.add(e.k);let r=rows.get(e.k);
  if(!r){r=document.createElement('div');r.className='br';r.innerHTML='<span class="ps"></span><span class="tc"></span><span class="cd"></span><span class="gp"></span><span class="ty"></span>';r.style.transform='translateY('+(list.length*ROW)+'px)';r.style.opacity=0;box.appendChild(r);rows.set(e.k,r);requestAnimationFrame(()=>{r.style.opacity=''})}
  r.className='br'+(e.me?' me':'')+(e.ghost?' ghost':'');r.style.transform='translateY('+i*ROW+'px)';
  r.children[0].textContent=i+1;r.children[1].style.background=e.col;r.children[2].textContent=e.cd;
  r.children[3].textContent=e.t==null?'NO TIME':(e===lead?fmt(e.t):'+'+(e.t-lead.t).toFixed(3));
  r.children[4].style.display=e.ty?'':'none';if(e.ty)r.children[4].style.background=e.ty;
  r.children[4].style.borderColor=e.me?'#101318':'#fff'});
 rows.forEach((r,k)=>{if(!seen.has(k)){rows.delete(k);r.classList.add('out');r.style.opacity=0;setTimeout(()=>r.remove(),450)}});
 box.style.height=list.length*ROW+'px'}

// ---- per-frame
let fr=0,tw0=0;
function loop(){requestAnimationFrame(loop);
 const menuOn=state=='menu';root.style.display=menuOn?'none':'';if(menuOn||!document.body.classList.contains('tv'))return;
 document.body.classList.toggle('cock',CAM==2);
 if(lastTI!==TI){lastTI=TI;sessBest=null}
 if(++fr%2)return;
 const c=car,kmh=Math.hypot(c.vx,c.vy)*3.6;
 $$('tgr').textContent=$$('gr')?$$('gr').textContent:'N';$$('tsp').textContent=Math.round(kmh);
 $$('tth').style.height=((c.tv!=null?c.tv:c.th)*100)+'%';$$('tbr').style.height=(c.br?100:0)+'%';
 const d=$$('tdrs');d.className=c.drs?'on':(drsZ(c.i)?'av':'');
 const ers=SET.ers?c.er:0;$$('ters').style.width=(ers*100)+'%';$$('ters').parentNode.style.opacity=SET.ers?1:.25;
 $$('tty').innerHTML='<i style="background:'+TCS[TCi].c+'"></i>'+TCS[TCi].n+' '+Math.round((1-tw)*100)+'%';
 $$('bcn').textContent=TRK.name;$$('blap').textContent='LAP '+(lap+1);
 // live sector chips
 const chips=$$('bsec').children,cur=lapStart==null?-1:(s1==null?0:(s2==null?1:2));
 for(let i=0;i<3;i++){const s=secShow[i];chips[i].className=(s?s[1]:'')+(i===cur?' cur':'')}
 if(++tw0>=8){tw0=0;tower()}
}
requestAnimationFrame(loop);tower();
})();
