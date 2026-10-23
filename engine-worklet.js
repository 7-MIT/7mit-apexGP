// Apex GP engine voice (AudioWorkletProcessor).
// A physically-motivated model of a 1.6 L V6 turbo-hybrid F1 engine:
//   * a four-stroke cycle is two crank revolutions (720 deg); the six cylinders fire at uneven intervals
//     (90 and 150 deg alternating, as on a 90 degree V6 with a three-throw crank), which is why it does not sound like a smooth hum
//   * every firing releases a pressure pulse with a little random scatter in strength (combustion is never identical)
//   * cylinders alternate between the two banks; each bank feeds its own exhaust pipe, modelled as a damped feedback delay line,
//     so the pipe lengths put resonances in the sound that follow neither the rpm nor each other
//   * throttle opens the pulse (louder, sharper, brighter, less damping); lifting leaves a quieter, duller overrun
//   * a faint gear/valvetrain whine and a rev limiter flutter near the top of the range
// Parameters (k-rate): rpm, thr (0..1 throttle), vol (output gain).
class F1Engine extends AudioWorkletProcessor{
 static get parameterDescriptors(){return[
  {name:'rpm',defaultValue:4200,minValue:0,maxValue:20000,automationRate:'k-rate'},
  {name:'thr',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
  {name:'vol',defaultValue:1,minValue:0,maxValue:4,automationRate:'k-rate'}]}
 constructor(){
  super();
  this.ph=0;                                              // position in the 720 deg cycle, 0..1
  this.fire=[0,90,240,330,480,570].map(d=>d/720);         // crank angles of the six firings
  this.env=[0,0];                                         // pulse envelope per bank
  this.size=4096;this.buf=[new Float32Array(this.size),new Float32Array(this.size)];this.wi=0;
  this.lp=[0,0];                                          // damping filter state per pipe
  this.dcx=0;this.dcy=0;this.nz=1;this.whinePh=0;this.lim=0;
 }
 rnd(){this.nz=(this.nz*1664525+1013904223)>>>0;return this.nz/4294967296}
 process(_in,outputs,params){
  const out=outputs[0][0];if(!out)return true;
  const sr=sampleRate,rpm=params.rpm[0],thr=params.thr[0],vol=params.vol[0],n=out.length;
  const dph=rpm/60/2/sr;                                   // cycle fraction advanced per sample
  // pulse shape: attack of ~0.25 ms then an exponential tail; a held-open throttle gives a longer, fuller pulse
  const tau=sr*(.00055+.0007*(1-thr)),dec=Math.exp(-1/tau);
  // exhaust pipes: two lengths, slightly different so the banks beat against each other
  const d0=Math.max(8,Math.round(sr*.00245)),d1=Math.max(8,Math.round(sr*.00301));
  const fb=.4+.22*thr,k=.22+.5*thr+.14*Math.min(1,rpm/13000);   // pipe feedback and damping brightness
  const D=[d0,d1],B=this.buf,sz=this.size;
  // rev limiter: above ~12.4k rpm the engine cuts every few cycles
  const limit=rpm>12400;
  const whineInc=rpm/60*9/sr;                              // gear train whine at 9x crank speed
  for(let i=0;i<n;i++){
   const p0=this.ph;let p=p0+dph;if(p>=1)p-=1;
   for(let c=0;c<6;c++){const f=this.fire[c];
    if((p0<f&&p>=f)||(p<p0&&(f>p0||f<=p))){ // crossed this firing angle (handles wrap)
     const b=c&1;
     let a=(.35+.65*thr)*(.88+.24*this.rnd());
     if(limit&&((c+this.lim)%3===0)){a*=.08;this.lim=(this.lim+1)&7}  // cut
     this.env[b]+=a;}}
   this.ph=p;
   let sum=0;
   for(let b=0;b<2;b++){
    const e0=this.env[b];this.env[b]=e0*dec;
    // excitation: unipolar pressure pulse plus a little combustion hiss riding on it
    const ex=e0*(1+.22*(this.rnd()*2-1));
    const ri=(this.wi-D[b]+sz)&(sz-1);
    const delayed=B[b][ri];
    this.lp[b]+=k*(delayed-this.lp[b]);
    const y=ex+fb*this.lp[b];
    B[b][this.wi&(sz-1)]=y;
    sum+=y;}
   this.wi=(this.wi+1)&(sz-1);
   // remove DC, add whine, soft-clip
   let o=sum*.5;const hp=o-this.dcx+.995*this.dcy;this.dcx=o;this.dcy=hp;
   this.whinePh+=whineInc;if(this.whinePh>=1)this.whinePh-=1;
   const w=Math.sin(6.2831853*this.whinePh)*(.015+.03*thr);
   const s=hp*2.1+w;
   out[i]=Math.tanh(s)*vol;
  }
  return true}
}
registerProcessor('f1-engine',F1Engine);
