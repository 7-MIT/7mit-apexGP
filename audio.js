// Apex GP audio: Web Audio synthesis of a V6 turbo-hybrid Formula 1 car and its surroundings.
// Everything is generated at runtime (no sample files). Driven from the game loop through AUD.update(...).
(function(){
'use strict';
let ctx=null,master,comp,noiseBuf,probeNode=null,muted=false;
const E={},R=new Map(); // E: own-car voices, R: remote engine voices keyed by player id
let lastGear=0,shiftT=0,lastDrs=0,popT=0,rpmS=4200,thS=0,t0=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SOS=343; // speed of sound, m/s (used for Doppler)

function shaperCurve(k){const n=1024,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1)*2-1;c[i]=Math.tanh(k*x)/Math.tanh(k)}return c}
function noiseSrc(){const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=true;s.start(0,Math.random()*noiseBuf.duration);return s}
function bq(type,f,q,g){const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;if(q!=null)b.Q.value=q;if(g!=null)b.gain.value=g;return b}
function gn(v){const g=ctx.createGain();g.gain.value=v;return g}
function osc(type,f){const o=ctx.createOscillator();o.type=type;o.frequency.value=f;o.start();return o}

function start(){
 if(ctx){if(ctx.state==='suspended')ctx.resume();return true}
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
 try{ctx=new AC({latencyHint:'interactive'})}catch(e){ctx=null;return false}
 t0=ctx.currentTime;
 master=gn(muted?0:.85);comp=ctx.createDynamicsCompressor();comp.threshold.value=-16;comp.knee.value=14;comp.ratio.value=5;comp.attack.value=.004;comp.release.value=.2;master.connect(comp);comp.connect(ctx.destination);
 // 3 s of white noise reused by every noise-based voice
 noiseBuf=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);{const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}

 // ---- engine: harmonic stack -> soft clipping -> exhaust resonances
 // firing frequency of a four-stroke V6 is 3 x rev/s; the stack adds sub-harmonics (uneven firing), 2nd..6th harmonics and a pulse for the raw edge
 const sum=gn(1),clip=ctx.createWaveShaper();clip.curve=shaperCurve(2.6);clip.oversample='2x';
 E.o=[osc('sawtooth',200),osc('sawtooth',400),osc('square',600),osc('sawtooth',100),osc('sawtooth',800),osc('triangle',1200)];
 E.og=[.5,.42,.22,.34,.14,.1].map(v=>gn(v));E.o.forEach((o,i)=>{o.connect(E.og[i]);E.og[i].connect(sum)});
 sum.connect(clip);
 E.lp=bq('lowpass',2500,.7);E.res1=bq('peaking',1100,1.3,9);E.res2=bq('peaking',2700,1.6,6);E.hp=bq('highpass',70,.7);
 clip.connect(E.lp);E.lp.connect(E.res1);E.res1.connect(E.res2);E.res2.connect(E.hp);
 E.gain=gn(0);E.hp.connect(E.gain);E.gain.connect(master);
 // subtle vibrato from engine mounts
 E.lfo=osc('sine',27);E.lfoG=gn(2.5);E.lfo.connect(E.lfoG);E.o.forEach(o=>E.lfoG.connect(o.detune));
 // turbo / MGU-H whine
 E.whine=osc('sine',2400);E.whine2=osc('sine',4800);E.wg=gn(0);E.whine.connect(E.wg);E.whine2.connect(E.wg);E.wg.connect(master);
 // exhaust crackle / pops
 E.popN=noiseSrc();E.popF=bq('bandpass',1800,.9);E.popG=gn(0);E.popN.connect(E.popF);E.popF.connect(E.popG);E.popG.connect(master);
 // wind
 E.windN=noiseSrc();E.windF=bq('bandpass',700,.5);E.windG=gn(0);E.windN.connect(E.windF);E.windF.connect(E.windG);E.windG.connect(master);
 // intake roar tied to throttle
 E.inN=noiseSrc();E.inF=bq('bandpass',420,.8);E.inG=gn(0);E.inN.connect(E.inF);E.inF.connect(E.inG);E.inG.connect(master);
 // tyre squeal and scrub
 E.sqN=noiseSrc();E.sqF=bq('bandpass',1700,9);E.sqF2=bq('peaking',3100,3,8);E.sqG=gn(0);E.sqN.connect(E.sqF);E.sqF.connect(E.sqF2);E.sqF2.connect(E.sqG);E.sqG.connect(master);
 // rumble from kerbs and gravel
 E.rmN=noiseSrc();E.rmF=bq('lowpass',140,.9);E.rmG=gn(0);E.rmN.connect(E.rmF);E.rmF.connect(E.rmG);E.rmG.connect(master);
 // brake disc hiss
 E.brN=noiseSrc();E.brF=bq('highpass',4200,.7);E.brG=gn(0);E.brN.connect(E.brF);E.brF.connect(E.brG);E.brG.connect(master);
 loadEngine();
 return true}
// Physical engine model in an AudioWorklet (engine-worklet.js). Until it has loaded, or if it cannot load, the oscillator stack above plays.
function loadEngine(){
 if(!ctx||!ctx.audioWorklet||!window.AudioWorkletNode)return;const c0=ctx;
 c0.audioWorklet.addModule('engine-worklet.js').then(()=>{
  if(ctx!==c0)return;
  const wk=new AudioWorkletNode(c0,'f1-engine',{numberOfInputs:0,outputChannelCount:[1]});
  E.wlp=bq('lowpass',6500,.7);E.wr1=bq('peaking',950,1.1,6);E.wr2=bq('peaking',2600,1.4,4);E.whp=bq('highpass',55,.7);E.wgain=gn(0);
  wk.connect(E.wlp);E.wlp.connect(E.wr1);E.wr1.connect(E.wr2);E.wr2.connect(E.whp);E.whp.connect(E.wgain);E.wgain.connect(master);
  E.wk=wk;E.wkReady=true;E.gain.gain.cancelScheduledValues(0);E.gain.gain.setTargetAtTime(0,c0.currentTime,.05);
 }).catch(()=>{E.wkReady=false})}

function setMuted(m){muted=!!m;if(ctx&&master)master.gain.setTargetAtTime(muted?0:.85,ctx.currentTime,.05)}
function burst(freq,q,peak,dur,sweep){ // one-shot filtered noise (clicks, whooshes, pops)
 if(!ctx)return;const n=noiseSrc(),f=bq('bandpass',freq,q),g=gn(0),t=ctx.currentTime;
 if(sweep){f.frequency.setValueAtTime(freq,t);f.frequency.exponentialRampToValueAtTime(freq*sweep,t+dur)}
 g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+.012);g.gain.exponentialRampToValueAtTime(.0008,t+dur);
 n.connect(f);f.connect(g);g.connect(master);n.stop(t+dur+.05)}

// ---- per-frame update for the player's car
function update(c,kmh,gear,st){
 if(!ctx||ctx.state!=='running')return;
 const t=ctx.currentTime,tc=.045;
 const active=st!=='menu';
 const th=active?clamp(c.tv!=null?c.tv:c.th,0,1):0;
 // rpm with inertia, shift dip and throttle blip
 let target=c.rpm||4200;
 if(gear!==lastGear){if(gear>lastGear&&lastGear>0){shiftT=t+.14;burst(900,1.2,.18,.07)}else if(gear<lastGear&&gear>0){shiftT=t+.1;popT=t+.4}lastGear=gear}
 if(t<shiftT)target-=1300;
 rpmS+=(target-rpmS)*Math.min(1,.28);thS+=(th-thS)*.35;
 const f=rpmS/60*3,rf=clamp((rpmS-4000)/8500,0,1);
 const on=active?1:0;
 E.o[0].frequency.setTargetAtTime(f,t,tc);E.o[1].frequency.setTargetAtTime(f*2.003,t,tc);E.o[2].frequency.setTargetAtTime(f*3.01,t,tc);
 E.o[3].frequency.setTargetAtTime(f*.5,t,tc);E.o[4].frequency.setTargetAtTime(f*4.005,t,tc);E.o[5].frequency.setTargetAtTime(f*6.01,t,tc);
 // more bite and upper harmonics with throttle and revs
 E.lp.frequency.setTargetAtTime(1400+thS*2800+rf*3200,t,.06);
 E.res1.frequency.setTargetAtTime(900+rf*900,t,.08);E.res2.frequency.setTargetAtTime(2200+rf*1500,t,.08);
 E.og[3].gain.setTargetAtTime(.34*(1-rf*.5),t,.1);E.og[4].gain.setTargetAtTime(.1+.18*rf,t,.1);E.og[5].gain.setTargetAtTime(.04+.14*rf*thS,t,.1);
 const idle=st==='grid'?1:0;
 if(E.wkReady){const P=E.wk.parameters;P.get('rpm').setTargetAtTime(rpmS,t,.03);P.get('thr').setTargetAtTime(thS,t,.04);
  E.wgain.gain.setTargetAtTime(on*(.8+1.05*thS+.08*idle),t,.05);E.wlp.frequency.setTargetAtTime(3800+thS*2600+rf*1800,t,.08);
  E.wr1.frequency.setTargetAtTime(800+rf*700,t,.1);E.wr2.frequency.setTargetAtTime(2200+rf*1500,t,.1);E.gain.gain.setTargetAtTime(0,t,.05)}
 else E.gain.gain.setTargetAtTime(on*(.26+.5*thS+.1*rf+.05*idle),t,.04);
 // whine climbs with revs and load
 E.whine.frequency.setTargetAtTime(1800+rpmS*.35,t,.08);E.whine2.frequency.setTargetAtTime((1800+rpmS*.35)*2.02,t,.08);
 E.wg.gain.setTargetAtTime(on*(.012+.035*thS*rf),t,.08);
 // overrun crackles: random pops when lifting at high revs or just after a downshift
 const lift=thS<.1&&rpmS>8200&&kmh>90;
 if(on&&(lift||t<popT)&&Math.random()<(lift?.16:.3)){E.popF.frequency.setValueAtTime(900+Math.random()*2400,t);E.popG.gain.cancelScheduledValues(t);E.popG.gain.setValueAtTime(.34*Math.random()+.1,t);E.popG.gain.exponentialRampToValueAtTime(.001,t+.05+Math.random()*.05)}
 // intake, wind
 E.inF.frequency.setTargetAtTime(300+rf*700,t,.08);E.inG.gain.setTargetAtTime(on*thS*(.05+.1*rf),t,.06);
 const v=clamp(kmh/340,0,1);
 E.windF.frequency.setTargetAtTime(500+v*1500,t,.1);E.windG.gain.setTargetAtTime(on*v*v*.55,t,.1);
 // tyres: lateral slip and locked braking
 const lat=Math.abs(c.vl||0),slip=clamp((lat-2.2)/6,0,1),lock=c.br&&kmh>70&&lat>1.5?clamp(lat/8,0,.7):0,sq=Math.max(slip,lock);
 E.sqF.frequency.setTargetAtTime(1300+kmh*5+Math.sin(t*9)*70,t,.05);
 E.sqG.gain.setTargetAtTime(on*sq*sq*.42*clamp(kmh/50,0,1),t,.04);
 // kerb and gravel rumble
 const off=c.off?1:0;
 E.rmF.frequency.setTargetAtTime(off?190:110,t,.1);E.rmG.gain.setTargetAtTime(on*(off?.75*clamp(kmh/90,0,1):0)*(.7+.3*Math.sin(t*60)),t,.03);
 // brakes
 E.brG.gain.setTargetAtTime(on*(c.br&&kmh>60?.045*clamp(kmh/200,0,1):0),t,.05);
 // DRS flap
 if(c.drs&&!lastDrs)burst(700,.8,.3,.28,3.4);else if(!c.drs&&lastDrs)burst(1400,1.1,.16,.12,.5);
 lastDrs=c.drs?1:0;
}

// ---- other players' cars: panned, attenuated and Doppler-shifted voices
function makeRemote(){
 const pan=ctx.createStereoPanner?ctx.createStereoPanner():null,out=gn(0);
 if(E.wkReady){ // same physical model as the player's car, quieter and filtered by distance
  const wk=new AudioWorkletNode(ctx,'f1-engine',{numberOfInputs:0,outputChannelCount:[1]}),lp=bq('lowpass',3200,.8),res=bq('peaking',1100,1.2,5);
  wk.connect(lp);lp.connect(res);let last=res;if(pan){res.connect(pan);last=pan}last.connect(out);out.connect(master);return{wk,lp,pan,out,seen:0}}
 const o1=osc('sawtooth',200),o2=osc('square',400),g1=gn(.5),g2=gn(.22),clip=ctx.createWaveShaper();clip.curve=shaperCurve(2);const lp=bq('lowpass',2200,.8),res=bq('peaking',1200,1.4,7);
 o1.connect(g1);o2.connect(g2);g1.connect(clip);g2.connect(clip);clip.connect(lp);lp.connect(res);let last=res;if(pan){res.connect(pan);last=pan}last.connect(out);out.connect(master);return{o1,o2,lp,pan,out,seen:0}}
function remote(list){
 if(!ctx||ctx.state!=='running')return;const t=ctx.currentTime,me=window.car;if(!me)return;
 const fr=[Math.cos(me.a),Math.sin(me.a)],rt=[-fr[1],fr[0]],seen=new Set();
 const cand=list.map(p=>{const dx=p.x-me.x,dy=p.y-me.y;return{p,dx,dy,d:Math.hypot(dx,dy)}}).sort((a,b)=>a.d-b.d).slice(0,5);
 for(const q of cand){const id=q.p.id;seen.add(id);let v=R.get(id);if(!v){v=makeRemote();R.set(id,v)}v.seen=t;
  const kmh=Math.hypot(q.p.vx,q.p.vy)*3.6,g=kmh<3?0:Math.min(8,Math.floor(kmh/40)+1),lo=(g-1)*40,hi=g==8?345:g*40,rf=g?clamp((kmh-lo)/(hi-lo),0,1):0,rpm=g?7500+5000*rf:4200+(q.p.th?5000:0);
  const dir=q.d>.5?[q.dx/q.d,q.dy/q.d]:[1,0],closing=((me.vx-q.p.vx)*dir[0]+(me.vy-q.p.vy)*dir[1]),dop=1+clamp(closing/SOS*.6,-.12,.12),f=rpm/60*3*dop;
  if(v.wk){v.wk.parameters.get('rpm').setTargetAtTime(rpm*dop,t,.06);v.wk.parameters.get('thr').setTargetAtTime(q.p.th?1:.15,t,.08)}
  else{v.o1.frequency.setTargetAtTime(f,t,.06);v.o2.frequency.setTargetAtTime(f*2.003,t,.06)}
  v.lp.frequency.setTargetAtTime(clamp(3200-q.d*12,700,3200),t,.1);
  if(v.pan)v.pan.pan.setTargetAtTime(clamp((q.dx*rt[0]+q.dy*rt[1])/Math.max(q.d,6),-1,1),t,.08);
  v.out.gain.setTargetAtTime(muted?0:.34/Math.pow(1+q.d/22,1.5),t,.08)}
 R.forEach((v,id)=>{if(!seen.has(id)){v.out.gain.setTargetAtTime(0,t,.1);if(t-v.seen>.8){try{if(v.wk){v.wk.disconnect()}else{v.o1.stop();v.o2.stop()}v.out.disconnect()}catch(e){}R.delete(id)}}})}

// debug / verification helper: an analyser tapped at the master bus
function probe(){if(!ctx)return null;if(!probeNode){probeNode=ctx.createAnalyser();probeNode.fftSize=8192;probeNode.smoothingTimeConstant=.6;comp.connect(probeNode)}return probeNode}
window.AUD={start,update,remote,setMuted,probe,engine:()=>E.wkReady?'worklet':'oscillators',state:()=>ctx?ctx.state:'none',sampleRate:()=>ctx?ctx.sampleRate:0};
})();
