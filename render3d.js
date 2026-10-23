// Apex GP 3D renderer (Three.js). Physics and HUD live in index.html; this file only draws the world.
// World x,y (metres) map to Three x,z. Car heading a: forward = (cos a, sin a); local +X forward, +Z right.
(function(){
'use strict';
if(THREE.ColorManagement&&'legacyMode'in THREE.ColorManagement)THREE.ColorManagement.legacyMode=false;
let ren;
try{ren=new THREE.WebGLRenderer({canvas:cv,antialias:true,powerPreference:'high-performance'})}catch(e){ren=null}
if(!ren){window.draw=()=>{drawMini()};window.build3D=()=>{};window.onR3=()=>{};toast('WebGL is not available on this device','#ff5a5a',6000);return}
const coarse=matchMedia('(pointer:coarse)').matches;
ren.setPixelRatio(Math.min(devicePixelRatio||1,coarse?1.25:1.75));
ren.outputEncoding=THREE.sRGBEncoding;
ren.toneMapping=THREE.ACESFilmicToneMapping;
ren.shadowMap.enabled=true;ren.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.3,2600);
const aniso=Math.min(8,ren.capabilities.getMaxAnisotropy());
const rnd=(()=>{let s=4242;return()=>(s=(s*16807)%2147483647)/2147483647})();
const C=c=>new THREE.Color(c);
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);

// ---- procedural textures
function tex(w,h,fn,rx,ry){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=aniso;if(rx)t.repeat.set(rx,ry||rx);return t}
function speckle(g,w,h,n,cols,a,sz){for(let i=0;i<n;i++){g.globalAlpha=a*(.4+rnd()*.6);g.fillStyle=cols[Math.floor(rnd()*cols.length)];const s=1+rnd()*sz;g.fillRect(rnd()*w,rnd()*h,s,s)}g.globalAlpha=1}
const mk={
asphalt:(base,edge)=>tex(512,512,(g,w,h)=>{g.fillStyle=base;g.fillRect(0,0,w,h);speckle(g,w,h,9000,['#000','#fff','#777'],.07,2.4);
 // darker rubbered racing groove
 const gr=g.createLinearGradient(0,0,w,0);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(.3,'rgba(0,0,0,.16)');gr.addColorStop(.5,'rgba(0,0,0,.07)');gr.addColorStop(.7,'rgba(0,0,0,.16)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,w,h);
 if(edge){g.fillStyle='#e8e8e8';g.fillRect(w*.018,0,w*.016,h);g.fillRect(w*(1-.034),0,w*.016,h)}}),
plain:(base,pal,n)=>tex(256,256,(g,w,h)=>{g.fillStyle=base;g.fillRect(0,0,w,h);speckle(g,w,h,n||6000,pal,.5,3)}),
grass:()=>tex(512,512,(g,w,h)=>{const gr=TRK.gr;g.fillStyle=gr[1];g.fillRect(0,0,w,h);for(let i=0;i<260;i++){g.globalAlpha=.18;g.fillStyle=gr[[0,2,3][i%3]];g.beginPath();g.arc(rnd()*w,rnd()*h,6+rnd()*28,0,7);g.fill()}g.globalAlpha=1;speckle(g,w,h,14000,[gr[0],gr[2],gr[3],'#0b2a12','#9cc27a'],.4,2)},60,60),
kerb:()=>tex(64,128,(g,w,h)=>{g.fillStyle='#d8202a';g.fillRect(0,0,w,h/2);g.fillStyle='#f4f4f4';g.fillRect(0,h/2,w,h/2);speckle(g,w,h,300,['#000'],.15,2)}),
barrier:()=>tex(1024,64,(g,w,h)=>{g.fillStyle='#d9dce2';g.fillRect(0,0,w,h);let x=0;while(x<w){const bw=70+rnd()*110,c=AD[Math.floor(rnd()*AD.length)];g.fillStyle=c;g.fillRect(x+3,6,bw-6,h-22);g.fillStyle='rgba(255,255,255,.85)';for(let k=0;k<3;k++)g.fillRect(x+10,12+k*10,(bw-20)*(.4+rnd()*.5),4);x+=bw}g.fillStyle='#b9bdc6';g.fillRect(0,h-14,w,14);g.fillStyle='#e10600';for(let k=0;k<w;k+=64)g.fillRect(k,h-14,32,14)}),
crowd:()=>tex(256,128,(g,w,h)=>{g.fillStyle='#2b2f3a';g.fillRect(0,0,w,h);for(let i=0;i<2600;i++){g.fillStyle=CR[i%CR.length][2];g.fillRect(rnd()*w,rnd()*h,2,3)}}),
checker:()=>tex(16,128,(g,w,h)=>{for(let x=0;x<2;x++)for(let y=0;y<16;y++){g.fillStyle=(x+y)&1?'#111':'#f4f4f4';g.fillRect(x*8,y*8,8,8)}}),
windows:(lit)=>tex(128,256,(g,w,h)=>{g.fillStyle='#8b919c';g.fillRect(0,0,w,h);for(let y=6;y<h-6;y+=14)for(let x=6;x<w-6;x+=14){const on=lit&&rnd()<.5;g.fillStyle=on?(rnd()<.5?'#ffd98a':'#bfe3ff'):'#2b3340';g.fillRect(x,y,8,9)}}),
glow:()=>tex(128,128,(g,w,h)=>{const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(255,230,170,.95)');r.addColorStop(.4,'rgba(255,220,150,.35)');r.addColorStop(1,'rgba(255,220,150,0)');g.fillStyle=r;g.fillRect(0,0,w,h)})};

// ---- trackside LED advertising (Jumay banner, 1568x196 = 8:1)
const adTex=new THREE.Texture();adTex.encoding=THREE.sRGBEncoding;adTex.wrapS=THREE.RepeatWrapping;adTex.anisotropy=aniso;
{const im=new Image();im.onload=()=>{adTex.image=im;adTex.needsUpdate=true};im.src='jumay.png'}
const AD_R=8;

// ---- sky dome
function skyMat(gm,top,hor,sunV,night){return new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{top:{value:top},hor:{value:hor},sun:{value:sunV},night:{value:night},gm:{value:gm}},
vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
fragmentShader:'uniform vec3 top,hor,sun;uniform float night,gm;varying vec3 vP;void main(){vec3 d=normalize(vP);float h=clamp(d.y,0.,1.);vec3 c=mix(hor,top,pow(h,.5));float s=max(dot(d,sun),0.);c+=vec3(1.,.9,.7)*(pow(s,900.)*3.+pow(s,10.)*.22)*(1.-night);if(d.y<0.)c=hor;if(gm>.5)c=pow(c,vec3(1./2.2));gl_FragColor=vec4(c,1.);}'})}

// ---- state
let world=null,sky,sunL,hemi,carG,carKey='',wheelsF=[],wheelsR=[],spinF=[],spinR=[],flap,brakeMat,helmet,halo,wheelG,wheelRot,dispC,dispT,skidM,skidG,partP,partG,rlM,headL,nightMode=false,envTex,skyScene,pmrem,lightPool;
const camP=new THREE.Vector3();let camInit=false,pitch=0,roll=0,dispAt=0,mt=0;
const SUN=V3(Math.cos(-.9)*.62,.74,Math.sin(-.9)*.62).normalize();

// ---- geometry helpers over the track centreline (uses S,N,NX,NY from the game)
function cum(){const d=[0];for(let i=1;i<=N;i++){const a=S[i-1],b=S[i%N];d.push(d[i-1]+Math.hypot(b[0]-a[0],b[1]-a[1]))}return d}
function ribbon(o0,o1,y,vs,i0,i1,up){const n=i1-i0,pos=new Float32Array((n+1)*6),uv=new Float32Array((n+1)*4),nr=new Float32Array((n+1)*6),idx=[];let d=0;
 for(let j=0;j<=n;j++){const k=((i0+j)%N+N)%N;if(j){const a=S[((i0+j-1)%N+N)%N],b=S[k];d+=Math.hypot(b[0]-a[0],b[1]-a[1])}
  const x=S[k][0],z=S[k][1],q=(y.call?y(j):y);pos.set([x+NX[k]*o0,q,z+NY[k]*o0,x+NX[k]*o1,q,z+NY[k]*o1],j*6);uv.set([0,d/vs,1,d/vs],j*4);nr.set([0,1,0,0,1,0],j*6)}
 for(let j=0;j<n;j++){const a=j*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('normal',new THREE.BufferAttribute(nr,3));g.setIndex(idx);return g}
function wall(off,y0,y1,vs,i0,i1){const n=i1-i0,pos=new Float32Array((n+1)*6),uv=new Float32Array((n+1)*4),idx=[];let d=0;
 for(let j=0;j<=n;j++){const k=((i0+j)%N+N)%N;if(j){const a=S[((i0+j-1)%N+N)%N],b=S[k];d+=Math.hypot(b[0]-a[0],b[1]-a[1])}
  const x=S[k][0]+NX[k]*off,z=S[k][1]+NY[k]*off;pos.set([x,y0,z,x,y1,z],j*6);uv.set([d/vs,0,d/vs,1],j*4)}
 for(let j=0;j<n;j++){const a=j*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g}
function mesh(g,m,o){const q=new THREE.Mesh(g,m);if(o){if(o.rs)q.receiveShadow=true;if(o.cs)q.castShadow=true;if(o.ro!=null)q.renderOrder=o.ro}return q}
const poly=(f,u)=>({polygonOffset:true,polygonOffsetFactor:f,polygonOffsetUnits:u});

function dispose(o){o.traverse(q=>{if(q.geometry)q.geometry.dispose();if(q.material){const ms=Array.isArray(q.material)?q.material:[q.material];ms.forEach(m=>{if(m.map)m.map.dispose();m.dispose()})}})}

// ---- build the circuit
function build3D(){
 if(world){scene.remove(world);dispose(world)}
 if(envTex){envTex.dispose()}
 world=new THREE.Group();scene.add(world);
 nightMode=!!TRK.night;
 const top=C(TRK.sk[0]),hor=C(TRK.sk[1]),WB=TRK.wb||26,street=!!TRK.bld,D=cum();
 // sky + environment reflections
 if(sky){scene.remove(sky);sky.geometry.dispose()}
 sky=new THREE.Mesh(new THREE.SphereGeometry(2200,24,12),skyMat(1,top,hor,SUN,nightMode?1:0));sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
 skyScene=new THREE.Scene();skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(50,16,8),skyMat(0,top,hor,SUN,nightMode?1:0)));
 pmrem=pmrem||new THREE.PMREMGenerator(ren);envTex=pmrem.fromScene(skyScene,.02).texture;
 scene.background=null;scene.fog=new THREE.Fog(nightMode?C('#0a1022'):hor,nightMode?90:220,nightMode?650:1500);
 ren.toneMappingExposure=nightMode?1.25:.95;
 // lights
 if(hemi)scene.remove(hemi);hemi=new THREE.HemisphereLight(nightMode?0x4a5a90:0xcfe2ff,nightMode?0x151a2a:0x6a6c70,nightMode?.55:.6);scene.add(hemi);
 if(!sunL){sunL=new THREE.DirectionalLight(0xffffff,1);sunL.castShadow=true;const s=sunL.shadow;s.mapSize.set(coarse?1024:2048,coarse?1024:2048);const e=80;Object.assign(s.camera,{left:-e,right:e,top:e,bottom:-e,near:1,far:400});s.bias=-.0004;s.normalBias=.06;scene.add(sunL,sunL.target)}
 sunL.color.set(nightMode?0x7f93d8:0xfff1d6);sunL.intensity=nightMode?.5:2.2;
 // ground
 const GW=Math.max(X1-X0,Y1-Y0)+2400,gT=mk.grass();gT.repeat.set(GW/22,GW/22);
 const gnd=mesh(new THREE.PlaneGeometry(GW,GW),new THREE.MeshStandardMaterial({map:gT,roughness:1,metalness:0,color:nightMode?0x6b7694:0xffffff}),{rs:1});gnd.rotation.x=-Math.PI/2;gnd.position.set((X0+X1)/2,-.02,(Y0+Y1)/2);world.add(gnd);
 // asphalt
 const asT=mk.asphalt(TRK.as[0],true),asM=new THREE.MeshStandardMaterial({map:asT,roughness:.88,metalness:0,color:nightMode?0x9aa3c0:0xffffff});
 world.add(mesh(ribbon(-HW,HW,.02,16,0,N),asM,{rs:1}));
 // run-off strips
 const roT=street?mk.asphalt(TRK.as[1],false):mk.plain(TRK.gv[0],[TRK.gv[1],'#fff','#6b5d3c','#8d7e58'],8000),roM=new THREE.MeshStandardMaterial({map:roT,roughness:1,color:nightMode?0x8890a8:0xffffff}),rw=Math.min(WB,street?WB:11);
 for(const s of[-1,1]){const a=s*HW,b=s*(HW+rw);world.add(mesh(ribbon(s>0?a:b,s>0?b:a,.012,street?16:7,0,N),roM,{rs:1}))}
 // kerbs on the inside of corners
 {const kT=mk.kerb(),pos=[],uv=[],idx=[];let vi=0;
  const cr=i=>{const A=S[(i+N-3)%N],B=S[i],Cc=S[(i+3)%N],ax=B[0]-A[0],ay=B[1]-A[1],bx=Cc[0]-B[0],by=Cc[1]-B[1];return(ax*by-ay*bx)/((Math.hypot(ax,ay)*Math.hypot(bx,by))||1)};
  for(let i=0;i<N;i++){const k=cr(i),k2=cr((i+1)%N);if(Math.abs(k)<.1||Math.abs(k2)<.1||k*k2<0)continue;const s=k>0?1:-1,j=(i+1)%N,o0=s*(HW-.1),o1=s*(HW+1.35);
   const p=(q,o)=>[S[q][0]+NX[q]*o,.045,S[q][1]+NY[q]*o];pos.push(...p(i,o0),...p(i,o1),...p(j,o0),...p(j,o1));
   const v0=D[i]/3,v1=D[i+1]/3;uv.push(0,v0,1,v0,0,v1,1,v1);
   if(s>0)idx.push(vi,vi+1,vi+2,vi+1,vi+3,vi+2);else idx.push(vi,vi+2,vi+1,vi+1,vi+2,vi+3);vi+=4}
  if(vi){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
   world.add(mesh(g,new THREE.MeshStandardMaterial({map:kT,roughness:.7,side:THREE.DoubleSide,color:nightMode?0x9aa3c0:0xffffff}),{rs:1}))}}
 // start / finish line and gantry
 {const p=S[0],q=S[1],a=Math.atan2(q[1]-p[1],q[0]-p[0]),cT=mk.checker();cT.repeat.set(1,1);
  const ln=mesh(new THREE.PlaneGeometry(1.8,HW*2),new THREE.MeshBasicMaterial({map:cT,...poly(-2,-8)}));ln.rotation.x=-Math.PI/2;
  const lg=new THREE.Group();lg.position.set(p[0],.05,p[1]);lg.rotation.y=-a;lg.add(ln);world.add(lg);
  const gr=new THREE.Group(),gm=new THREE.MeshStandardMaterial({color:0x2a2d35,metalness:.6,roughness:.4});gr.position.set(S[3][0],0,S[3][1]);gr.rotation.y=-a;
  for(const s of[-1,1]){const c=mesh(new THREE.BoxGeometry(.8,8,.8),gm,{cs:1});c.position.set(0,4,s*(HW+1.6));gr.add(c)}
  const beam=mesh(new THREE.BoxGeometry(1.4,1.3,HW*2+4.4),gm,{cs:1});beam.position.set(0,8,0);gr.add(beam);
  window.gantryLamps=[];for(let k=0;k<5;k++){const m=new THREE.MeshBasicMaterial({color:0x2a0808}),b=mesh(new THREE.SphereGeometry(.42,12,8),m);b.position.set(-.75,8,(k-2)*2.1);gr.add(b);window.gantryLamps.push(m)}
  world.add(gr)}
 // DRS zones
 {const gm=new THREE.MeshBasicMaterial({color:0x2ee66b,transparent:true,opacity:.7,depthWrite:false,...poly(-1,-4)});
  for(const[a,b]of TRK.drs){for(const[o0,o1]of[[-.4,.4],[-HW+.5,-HW+1.1],[HW-1.1,HW-.5]])world.add(mesh(ribbon(o0,o1,.055,1e5,a,b),gm,{ro:1}));
   for(const e of[a,b])world.add(mesh(ribbon(-HW,HW,.056,1e5,e,e+1),gm,{ro:1}))}}
 // racing line
 {const pos=[],col=[],idx=[];let vi=0;for(let i=0;i<N;i++){const j=(i+1)%N,c=C(RC[i]),p=(q,o)=>[S[q][0]+NX[q]*(RO[q]+o),.06,S[q][1]+NY[q]*(RO[q]+o)];pos.push(...p(i,-.45),...p(i,.45),...p(j,-.45),...p(j,.45));for(let k=0;k<4;k++)col.push(c.r,c.g,c.b);idx.push(vi,vi+1,vi+2,vi+1,vi+3,vi+2);vi+=4}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);
  rlM=mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.62,depthWrite:false,...poly(-2,-6)}),{ro:2});world.add(rlM)}
 // barriers
 {const bM=new THREE.MeshBasicMaterial({map:adTex,side:THREE.DoubleSide,color:nightMode?0xffffff:0xeaeaea}),h=street?1.4:1.1,cap=new THREE.MeshStandardMaterial({color:0xb9bdc6,roughness:.5});
  // LED boards on the walls: the image is mirrored on the right-hand side unless the length is negated
  for(const s of[-1,1]){const o=s*(HW+WB);world.add(mesh(wall(o,0,h,s>0?-h*AD_R:h*AD_R,0,N),bM,{cs:1}));world.add(mesh(ribbon(o-.2,o+.2,h,1e5,0,N),cap,{rs:1}))}}
 // big videotron screens on posts, facing the track
 {const bw=24,bh=bw/AD_R,pl=new THREE.PlaneGeometry(bw,bh),back=new THREE.BoxGeometry(bw+.5,bh+.5,.3),post=new THREE.CylinderGeometry(.16,.16,6,8),
   fm=new THREE.MeshBasicMaterial({map:adTex,color:nightMode?0xffffff:0xf2f2f2}),dk=new THREE.MeshStandardMaterial({color:0x15171c,roughness:.6});let side=1;
  for(let i=30;i<N-30;i+=48){if(i>N-125||(TRK.tun&&i>TRK.tun[0]-25&&i<TRK.tun[1]+25))continue;side=-side;
   const o=side*(HW+(WB>14?13:WB+2.4)),k=i,x=S[k][0]+NX[k]*o,z=S[k][1]+NY[k]*o,a=Math.atan2(S[k+1][1]-S[k-1][1],S[k+1][0]-S[k-1][0]),g=new THREE.Group();
   g.position.set(x,0,z);g.rotation.y=-a+(side>0?Math.PI:0);
   const bk=mesh(back,dk,{cs:1});bk.position.set(0,4.4,0);g.add(bk);const fc=mesh(pl,fm);fc.position.set(0,4.4,.17);g.add(fc);
   for(const px of[-8,8]){const q=mesh(post,dk,{cs:1});q.position.set(px,3,-.1);g.add(q)}
   world.add(g)}}
 // tunnel
 if(TRK.tun){const [a,b]=TRK.tun,cm=new THREE.MeshStandardMaterial({color:0x2b2e34,roughness:.9,side:THREE.DoubleSide}),lm=new THREE.MeshBasicMaterial({color:0xfff0c8});
  world.add(mesh(ribbon(-(HW+WB+.3),HW+WB+.3,7,16,a,b),cm));world.add(mesh(ribbon(-.5,.5,6.95,16,a,b),lm));
  for(const s of[-1,1])world.add(mesh(wall(s*(HW+WB+.2),1.3,7,16,a,b),cm));
  for(const s of[-1,1])world.add(mesh(ribbon(s*(HW-1),s*(HW-1)+.4,6.95,16,a,b),lm))}
 // grandstands either side of the start straight
 {const cT=mk.crowd(),sm=new THREE.MeshStandardMaterial({map:cT,roughness:.9,color:nightMode?0x8a93b0:0xffffff}),cn=new THREE.MeshStandardMaterial({color:0x8b8f99,roughness:.8}),rf=new THREE.MeshStandardMaterial({color:0xdadde3,roughness:.5,side:THREE.DoubleSide}),i0=N-120,i1=N+40;
  for(const s of[-1,1]){const base=s*(HW+WB+(street?3:5));let t=0;for(;t<7;t++){const o=base+s*t*1.9,y=1.2+t*.95;world.add(mesh(ribbon(s>0?o:o+1.9,s>0?o+1.9:o,y,6,i0,i1),sm,{rs:1,cs:1}));world.add(mesh(wall(o,y-.95,y,6,i0,i1),sm))}
   const e=base+s*t*1.9;world.add(mesh(ribbon(Math.min(base,e),Math.max(base,e),9.5+.0,1e5,i0,i1),rf,{cs:1}));world.add(mesh(wall(e,0,9.5,1e5,i0,i1),cn))}}
 // scenery: trees, or buildings on street circuits
 {const n=TREES.length,dm=new THREE.Object3D(),cA=C(TRK.tc[0]),cB=C(TRK.tc[1]);
  if(street){const wT=mk.windows(nightMode),bm=new THREE.MeshStandardMaterial({map:wT,roughness:.8,emissive:nightMode?0xffffff:0x000000,emissiveMap:nightMode?wT:null,emissiveIntensity:.9}),im=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),bm,n),pal=TRK.bc.map(C);im.castShadow=true;im.receiveShadow=true;
   TREES.forEach((t,i)=>{const w=7+t[2]*2.4,h=16+t[3]*54;dm.position.set(t[0],h/2,t[1]);dm.scale.set(w,h,w);dm.rotation.y=t[3]*6;dm.updateMatrix();im.setMatrixAt(i,dm.matrix);const c=pal[i%pal.length].clone().lerp(C('#ffffff'),.35);im.setColorAt(i,c)});world.add(im)}
  else{const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.34,1,6),new THREE.MeshStandardMaterial({color:0x4a3524,roughness:1}),n),
   fol=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({roughness:.9,flatShading:true}),n),fol2=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),fol.material,n);
   TREES.forEach((t,i)=>{const r=t[2];dm.rotation.set(0,t[3]*6,0);dm.position.set(t[0],r*.45,t[1]);dm.scale.set(1,r*.9,1);dm.updateMatrix();trunk.setMatrixAt(i,dm.matrix);
    dm.position.set(t[0],r*1.45,t[1]);dm.scale.set(r*.95,r*1.15,r*.95);dm.updateMatrix();fol.setMatrixAt(i,dm.matrix);fol.setColorAt(i,cA.clone().lerp(cB,t[3]));
    dm.position.set(t[0]+r*.15,r*2.15,t[1]-r*.1);dm.scale.set(r*.65,r*.8,r*.65);dm.updateMatrix();fol2.setMatrixAt(i,dm.matrix);fol2.setColorAt(i,cB.clone().lerp(cA,t[3]*.7))});
   trunk.castShadow=fol.castShadow=true;world.add(trunk,fol,fol2)}}
 // distant hills
 {const R=1700,seg=120,pos=[],idx=[],cx0=(X0+X1)/2,cz0=(Y0+Y1)/2;for(let j=0;j<=seg;j++){const a=j/seg*Math.PI*2,h=70+60*Math.sin(a*3+1)+45*Math.sin(a*7+2)+30*Math.sin(a*13);pos.push(cx0+Math.cos(a)*R,-10,cz0+Math.sin(a)*R,cx0+Math.cos(a)*R*.97,Math.max(20,h),cz0+Math.sin(a)*R*.97)}
  for(let j=0;j<seg;j++){const a=j*2;idx.push(a,a+2,a+1,a+1,a+2,a+3)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
  world.add(mesh(g,new THREE.MeshLambertMaterial({color:C(TRK.hl),side:THREE.DoubleSide})))}
 // night: stars, lamp posts and light pools
 if(nightMode){const sp=new Float32Array(900);for(let i=0;i<300;i++){const a=rnd()*6.283,e=.15+rnd()*1.2;sp.set([Math.cos(a)*Math.cos(e)*2000,Math.sin(e)*2000,Math.sin(a)*Math.cos(e)*2000],i*3)}
  const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(sp,3));const st=new THREE.Points(sg,new THREE.PointsMaterial({color:0xffffff,size:2,sizeAttenuation:false,fog:false}));world.add(st);
  const L=[];for(let i=0;i<N;i+=10)for(const s of[-1,1])L.push([S[i][0]+NX[i]*s*(HW+WB+1),S[i][1]+NY[i]*s*(HW+WB+1),S[i][0]+NX[i]*s*(HW-3),S[i][1]+NY[i]*s*(HW-3)]);
  const pole=new THREE.InstancedMesh(new THREE.CylinderGeometry(.12,.16,10,6),new THREE.MeshStandardMaterial({color:0x2a2d35}),L.length),bulb=new THREE.InstancedMesh(new THREE.SphereGeometry(.45,8,6),new THREE.MeshBasicMaterial({color:0xfff0c0}),L.length),
   pool=new THREE.InstancedMesh(new THREE.PlaneGeometry(26,26),new THREE.MeshBasicMaterial({map:mk.glow(),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.5,...poly(-3,-10)}),L.length),dm=new THREE.Object3D();
  L.forEach((l,i)=>{dm.rotation.set(0,0,0);dm.scale.set(1,1,1);dm.position.set(l[0],5,l[1]);dm.updateMatrix();pole.setMatrixAt(i,dm.matrix);dm.position.set(l[0],10.1,l[1]);dm.updateMatrix();bulb.setMatrixAt(i,dm.matrix);dm.rotation.set(-Math.PI/2,0,0);dm.position.set(l[2],.07,l[3]);dm.updateMatrix();pool.setMatrixAt(i,dm.matrix)});
  pool.renderOrder=3;world.add(pole,bulb,pool)}
 // dynamic: skid marks and smoke
 skidG=new THREE.BufferGeometry();skidG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(5600*4*3),3));
 {const idx=[];for(let i=0;i<5600;i++){const a=i*4;idx.push(a,a+1,a+2,a+1,a+3,a+2)}skidG.setIndex(idx);skidG.setDrawRange(0,0)}
 skidM=mesh(skidG,new THREE.MeshBasicMaterial({color:0x050506,transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide,...poly(-2,-5)}),{ro:2});skidM.frustumCulled=false;world.add(skidM);
 partG=new THREE.BufferGeometry();partG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(300*3),3));partG.setAttribute('aC',new THREE.BufferAttribute(new Float32Array(300*4),4));partG.setAttribute('aS',new THREE.BufferAttribute(new Float32Array(300),1));
 partP=new THREE.Points(partG,new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{sc:{value:600}},vertexShader:'attribute vec4 aC;attribute float aS;uniform float sc;varying vec4 vC;void main(){vC=aC;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aS*sc/-mv.z;gl_Position=projectionMatrix*mv;}',fragmentShader:'varying vec4 vC;void main(){float d=length(gl_PointCoord-.5)*2.;float a=smoothstep(1.,.2,d)*vC.a;gl_FragColor=vec4(vC.rgb,a);}'}));partP.frustumCulled=false;world.add(partP);
 carKey='';camInit=false;
}
window.build3D=build3D;

// ---- the F1 car
function rod(p0,p1,r,m){const a=V3(...p0),b=V3(...p1),d=b.clone().sub(a),g=new THREE.CylinderGeometry(r,r,d.length(),8),q=new THREE.Mesh(g,m);q.position.copy(a.clone().add(b).multiplyScalar(.5));q.quaternion.setFromUnitVectors(V3(0,1,0),d.normalize());q.castShadow=true;return q}
function buildCar(){
 if(carG){scene.remove(carG);dispose(carG)}
 carG=new THREE.Group();carG.rotation.order='YZX';
 const paint=new THREE.MeshPhysicalMaterial({color:C(T.c1),metalness:.45,roughness:.32,clearcoat:1,clearcoatRoughness:.08,envMap:envTex,envMapIntensity:1.2}),
  acc=new THREE.MeshPhysicalMaterial({color:C(T.c2),metalness:.35,roughness:.38,clearcoat:.8,envMap:envTex}),
  carbon=new THREE.MeshStandardMaterial({color:0x14151a,metalness:.4,roughness:.5,envMap:envTex,envMapIntensity:.8}),
  tyre=new THREE.MeshStandardMaterial({color:0x0e0e10,roughness:.92}),rimM=new THREE.MeshStandardMaterial({color:0x9aa0aa,metalness:.9,roughness:.3,envMap:envTex}),
  band=new THREE.MeshBasicMaterial({color:C(TCS[TCi].c),side:THREE.DoubleSide});
 brakeMat=new THREE.MeshStandardMaterial({color:0x550000,emissive:0xff1010,emissiveIntensity:.3});
 const add=(g,m,x,y,z,o)=>{const q=new THREE.Mesh(g,m);q.position.set(x,y,z);q.castShadow=true;q.receiveShadow=true;if(o&&o.r)q.rotation.set(...o.r);carG.add(q);return q},B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
 add(B(4.4,.06,1.5),carbon,-.1,.12,0);
 add(B(1.5,.42,.58),paint,.35,.38,0);
 for(const s of[-1,1]){add(B(1.9,.4,.5),paint,-.65,.38,s*.6);add(B(.5,.3,.42),carbon,.35,.34,s*.55)}
 add(B(2.0,.36,.46),paint,-1.45,.5,0);add(B(1.2,.22,.28),paint,-2.5,.4,0);
 add(B(.62,.56,.36),acc,-.35,.82,0);add(B(.08,.28,.26),carbon,-.05,.84,0);
 const nose=new THREE.CylinderGeometry(.06,.3,2.3,14);nose.rotateZ(-Math.PI/2);add(nose,paint,1.95,.3,0);
 add(B(.8,.08,.5),carbon,.5,.62,0);
 helmet=add(new THREE.SphereGeometry(.17,14,10),acc,.12,.72,0);add(B(.1,.07,.22),carbon,.24,.74,0);
 // halo
 halo=new THREE.Group();{const arc=new THREE.TorusGeometry(.36,.016,8,24,Math.PI);arc.rotateZ(-Math.PI/2);arc.rotateX(Math.PI/2);const a=new THREE.Mesh(arc,carbon);a.position.set(.15,.84,0);a.castShadow=true;halo.add(a);
  halo.add(rod([.51,.84,0],[1.0,.54,0],.02,carbon));for(const s of[-1,1])halo.add(rod([.15,.84,s*.36],[-.1,.56,s*.3],.016,carbon))}carG.add(halo);
 // front & rear wings
 add(B(.5,.035,2.05),carbon,2.9,.1,0);add(B(.35,.03,1.95),acc,2.65,.2,0);for(const s of[-1,1])add(B(.62,.24,.03),acc,2.8,.2,s*1.02);
 add(B(.5,.05,1.1),carbon,-2.8,.9,0);for(const s of[-1,1])add(B(.85,.55,.03),acc,-2.85,.72,s*.56);add(B(.1,.5,.1),carbon,-2.7,.62,0);
 flap=new THREE.Group();flap.position.set(-2.95,.98,0);flap.add(new THREE.Mesh(B(.3,.04,1.1),acc));flap.children[0].position.x=.1;flap.children[0].castShadow=true;carG.add(flap);
 add(B(.1,.14,.3),brakeMat,-3.08,.46,0);
 // wheels
 wheelsF=[];wheelsR=[];spinF=[];spinR=[];const R=.36;
 for(const[x,z,w,fr]of[[1.5,-.92,.34,1],[1.5,.92,.34,1],[-1.7,-.92,.44,0],[-1.7,.92,.44,0]]){
  const piv=new THREE.Group(),spin=new THREE.Group();piv.position.set(x,R,z);
  const t=new THREE.CylinderGeometry(R,R,w,32);t.rotateX(Math.PI/2);const tm=new THREE.Mesh(t,tyre);tm.castShadow=true;spin.add(tm);
  const rm=new THREE.CylinderGeometry(R*.63,R*.63,w+.01,24);rm.rotateX(Math.PI/2);spin.add(new THREE.Mesh(rm,rimM));
  for(const sd of[-1,1]){const r=new THREE.RingGeometry(R*.8,R*.93,32);const rg=new THREE.Mesh(r,band);rg.position.z=sd*(w/2+.002);spin.add(rg)}
  for(let k=0;k<5;k++){const sp=new THREE.Mesh(B(.05,R*1.1,.02),carbon);sp.rotation.z=k/5*Math.PI*2;sp.position.z=(z>0?1:-1)*(w/2+.006);spin.add(sp)}
  piv.add(spin);carG.add(piv);(fr?wheelsF:wheelsR).push(piv);(fr?spinF:spinR).push(spin);
  const sgn=z>0?1:-1;carG.add(rod([x,R,sgn*.52],[x+.3,.3,sgn*.22],.025,carbon));carG.add(rod([x,R+.1,sgn*.52],[x-.35,.42,sgn*.25],.025,carbon))}
 // steering wheel with display (cockpit)
 wheelG=new THREE.Group();wheelG.position.set(.7,.8,0);wheelG.rotation.z=.6;wheelRot=new THREE.Group();wheelG.add(wheelRot);
 {const bm=new THREE.MeshStandardMaterial({color:0x101114,roughness:.6}),body=new THREE.Mesh(B(.035,.1,.3),bm);wheelRot.add(body);for(const s of[-1,1]){const g=new THREE.Mesh(B(.05,.2,.05),bm);g.position.set(0,-.01,s*.17);wheelRot.add(g)}
  dispC=document.createElement('canvas');dispC.width=256;dispC.height=96;dispT=new THREE.CanvasTexture(dispC);dispT.encoding=THREE.sRGBEncoding;
  const dp=new THREE.Mesh(new THREE.PlaneGeometry(.26,.0975),new THREE.MeshBasicMaterial({map:dispT}));dp.position.set(-.02,.015,0);dp.rotation.y=-Math.PI/2;wheelRot.add(dp)}
 carG.add(wheelG);
 headL=new THREE.SpotLight(0xfff2d8,nightMode?3:0,140,.55,.6,1);headL.position.set(2.2,.5,0);headL.target.position.set(30,0,0);carG.add(headL,headL.target);
 scene.add(carG);carKey=T.n+'|'+TCi+'|'+(nightMode?1:0);
}

// ---- cockpit steering-wheel display
function updDisp(c,kmh){if(!dispC)return;const g=dispC.getContext('2d'),w=256,h=96;g.fillStyle='#05070a';g.fillRect(0,0,w,h);
 g.fillStyle='#ffd21f';g.font='700 44px "Courier New",monospace';g.fillText($('gr').textContent,8,48);
 g.fillStyle='#fff';g.font='700 40px "Courier New",monospace';g.textAlign='right';g.fillText(Math.round(kmh),w-8,40);g.font='700 12px sans-serif';g.fillStyle='#98a0ad';g.fillText('KM/H',w-8,56);g.textAlign='left';
 const rpm=Math.min(1,Math.max(0,(c.rpm-9500)/3000));for(let i=0;i<15;i++){g.fillStyle=i<rpm*15?(i<5?'#2ee66b':i<10?'#ff2b2b':'#3aa0ff'):'#222731';g.fillRect(8+i*16,62,12,6)}
 g.fillStyle='#3aa0ff';g.fillRect(8,76,(SET.ers?c.er:0)*100,8);g.strokeStyle='#445';g.strokeRect(8,76,100,8);g.fillStyle=c.drs?'#2ee66b':'#445';g.font='700 14px sans-serif';g.fillText('DRS',124,84);
 g.fillStyle='#fff';g.font='700 16px "Courier New",monospace';g.textAlign='right';g.fillText($('ct').textContent,w-8,88);g.textAlign='left';dispT.needsUpdate=true}

function onR3(){ren.setSize(W,H,false);camera.aspect=W/H;camera.updateProjectionMatrix()}
window.onR3=onR3;

// ---- per-frame
function frame(){
 const c=car,sp=Math.hypot(c.vx,c.vy),fc=Math.cos(c.a),fs=Math.sin(c.a),tNow=performance.now()/1000;
 if(carKey!==T.n+'|'+TCi+'|'+(nightMode?1:0))buildCar();
 // car transform and animation
 const vf=c.vx*fc+c.vy*fs,pt=-(c.br?.022:0)+(c.th?.01:0),rl=c.st*Math.min(1,Math.abs(vf)/60)*.03;pitch+=(pt-pitch)*.1;roll+=(rl-roll)*.1;
 carG.position.set(c.x,0,c.y);carG.rotation.set(roll,-c.a,pitch);
 const wr=c.wr||0;spinF.forEach(s=>s.rotation.z=-wr);spinR.forEach(s=>s.rotation.z=-wr);wheelsF.forEach(w=>w.rotation.y=-c.st*.42);
 flap.rotation.z+=((c.drs?.5:0)-flap.rotation.z)*.25;brakeMat.emissiveIntensity=c.br?4:.25;wheelRot.rotation.x=c.st*1.15;
 const cock=CAM==2&&state!='menu';helmet.visible=!cock;
 // gantry lights
 if(window.gantryLamps){const n=state=='grid'?$('lights').querySelectorAll('.on').length:0;window.gantryLamps.forEach((m,i)=>m.color.setHex(i<n?0xff1a1a:0x2a0808))}
 // dynamic geometry: skid marks
 {const a=skidG.attributes.position.array,n=Math.min(skids.length,2800),k0=skids.length-n;let q=0;
  for(let i=0;i<n;i++){const s=skids[k0+i];for(let w=0;w<2;w++){const px=s[w*2],pz=s[w*2+1],qx=s[4+w*2],qz=s[5+w*2],dx=qx-px,dz=qz-pz,l=Math.hypot(dx,dz)||1,nx=-dz/l*.17,nz=dx/l*.17;
   a.set([px-nx,.058,pz-nz,px+nx,.058,pz+nz,qx-nx,.058,qz-nz,qx+nx,.058,qz+nz],q*12);q++}}
  skidG.setDrawRange(0,q*6);skidG.attributes.position.needsUpdate=true}
 // smoke / dust
 {const P=partG.attributes.position.array,Cc=partG.attributes.aC.array,Sz=partG.attributes.aS.array,n=Math.min(parts.length,300);
  for(let i=0;i<n;i++){const q=parts[i],age=1-q.l;P[i*3]=q.x;P[i*3+1]=.25+age*1.4;P[i*3+2]=q.y;const col=q.k?[.82,.82,.84]:(nightMode?[.25,.25,.3]:[.62,.55,.42]);Cc.set([col[0],col[1],col[2],Math.max(0,q.l)*.5],i*4);Sz[i]=(1.4+age*3.5)*(q.k?1:1.2)}
  partG.setDrawRange(0,n);partG.attributes.position.needsUpdate=partG.attributes.aC.needsUpdate=partG.attributes.aS.needsUpdate=true;partP.material.uniforms.sc.value=H*.6}
 rlM.visible=!!RL;
 // camera
 let hf=CAM==1?1.36:CAM==2?1.83:1.48;if(CAM==2&&SET.fovm)hf=Math.max(.6,Math.min(2.4,2*Math.atan(SET.sw/(2*SET.sd))));hf*=1+sp/90*.06;
 let vfov=2*Math.atan(Math.tan(hf/2)/camera.aspect)*180/Math.PI;
 if(state=='menu'){const a=tNow*.25;camera.position.set(c.x+Math.cos(a)*9,2.4,c.y+Math.sin(a)*9);camera.up.set(0,1,0);camera.lookAt(c.x,.6,c.y);vfov=50}
 else if(CAM==0){const h=70+60*Math.min(1,sp/90);camP.set(c.x+c.vx*.3,h,c.y+c.vy*.3);if(!camInit){camera.position.copy(camP);camInit=true}camera.position.lerp(camP,.18);camera.up.set(0,0,-1);camera.lookAt(camera.position.x,0,camera.position.z);vfov=50}
 else{camera.up.set(0,1,0);
  if(CAM==1){const cc=Math.cos(ha),ss=Math.sin(ha);camera.position.set(c.x-cc*7.2,2.4,c.y-ss*7.2);camera.lookAt(c.x+cc*6,.8,c.y+ss*6);vfov=Math.min(95,Math.max(40,vfov))}
  else if(CAM==2){const ca=c.a+c.st*SET.lta*.22*Math.min(1,sp/40),cc=Math.cos(ca),ss=Math.sin(ca),m=SET.shk*.012*(Math.min(1,sp/80)+(Math.abs(c.vl||0)>3?1.2:0)+(c.off?1.5:0));
   camera.position.set(c.x+fc*.25+(Math.random()-.5)*m*-fs,.0+1.06+(Math.random()-.5)*m,c.y+fs*.25+(Math.random()-.5)*m*fc);camera.lookAt(camera.position.x+cc*10,.93+pitch*-6,camera.position.z+ss*10);camera.rotateZ(-c.st*.02*Math.min(1,sp/40));vfov=Math.min(110,Math.max(35,vfov))}
  else{const m=SET.shk*.01*Math.min(1,sp/80);camera.position.set(c.x-fc*.9+(Math.random()-.5)*m,1.55+(Math.random()-.5)*m,c.y-fs*.9+(Math.random()-.5)*m);camera.lookAt(c.x+fc*30,.9,c.y+fs*30);camera.rotateZ(-c.st*.02*Math.min(1,sp/40));vfov=Math.min(95,Math.max(40,vfov))}}
 camera.near=cock?.1:.3;camera.fov=vfov;camera.updateProjectionMatrix();
 sky.position.copy(camera.position);
 // light follows the car
 sunL.position.set(c.x+SUN.x*120,SUN.y*120,c.y+SUN.z*120);sunL.target.position.set(c.x,0,c.y);
 headL.intensity=nightMode?3:0;
 if(cock&&tNow-dispAt>.08){dispAt=tNow;updDisp(c,sp*3.6)}
 ren.render(scene,camera);
}
window.draw=function(){frame();drawMini()};
if(typeof TRK!=='undefined'&&S)build3D();
onR3();addEventListener('resize',onR3);
})();
