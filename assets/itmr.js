/* ITMR Audio house motion.
   1. Live plugin overlays: canvases drawn at each plugin UI's own geometry (1280×800 logical),
      driven by a DEMO SIGNAL (92 bpm kick/snare/hat + a sung phrase). Swap demoSignal() for
      Web Audio AnalyserNode data from real dry/processed renders when they exist.
   2. Perspective lift-away tours (.liftD): the front layer lifts, tips back (top recedes, bottom
      swings toward you), blurs and fades; the next layer rises from below and behind.
   3. The animated ITMR mark: logo → live meters → logo, 9 s loop.
*/
(function(){
'use strict';
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cl=(v)=>Math.max(0,Math.min(1,v)), ease=(x)=>x*x*(3-2*x);

/* ---------- demo signal ---------- */
const env=(u)=>{ const beat=u*92/60, ph=beat%1; const hit=Math.exp(-ph*5)*((Math.floor(beat)%2===0)?1:0.7); const sung=Math.max(0,Math.sin(u*0.7)+0.2)*0.5*(0.6+0.4*Math.abs(Math.sin(u*4.2))); return Math.min(1,hit*0.75+sung); };
const sig=(u,f)=>env(u)*Math.sin(u*2*Math.PI*(f||9.1)+Math.sin(u*2.7)*2.4);
function spectrum(t,n){
  const beat=t*92/60, ph=beat%1;
  const kick=Math.exp(-ph*9)*((Math.floor(beat)%2===0)?1:0.15), snare=Math.exp(-((beat+1)%2)*7)*((Math.floor(beat)%2===1)?1:0), hat=Math.exp(-((beat*2)%1)*14);
  const phrase=Math.max(0,Math.sin(t*0.62)+0.35)*(0.6+0.4*Math.abs(Math.sin(t*3.1+Math.sin(t*1.3))));
  const f0=196*Math.pow(2,(Math.round(Math.sin(t*0.9)*3+Math.sin(t*0.37)*2))/12)*(1+0.012*Math.sin(t*34));
  const out=new Float32Array(n);
  for(let i=0;i<n;i++){
    const f=40*Math.pow(500,i/(n-1)), lf=Math.log2(f); let p=0.0006;
    p+=0.9*kick*Math.exp(-Math.pow(lf-Math.log2(58),2)/0.35)+0.35*Math.exp(-Math.pow(lf-Math.log2(90),2)/0.6);
    p+=0.35*snare*Math.exp(-Math.pow(lf-Math.log2(1800),2)/5)+0.12*hat*Math.exp(-Math.pow(lf-Math.log2(9000),2)/1.2);
    const h=f/f0, comb=Math.pow(Math.max(0,Math.cos(Math.PI*2*h)),24)*(h>0.7?1:0);
    const form=Math.exp(-Math.pow(lf-Math.log2(650),2)/0.5)+0.6*Math.exp(-Math.pow(lf-Math.log2(1150),2)/0.35)+0.35*Math.exp(-Math.pow(lf-Math.log2(2700),2)/0.4)+0.18*Math.exp(-Math.pow(lf-Math.log2(7200),2)/0.5);
    p+=phrase*(0.08+0.9*comb)*form*Math.pow(f/200,-0.35)*(f>f0*0.8?1:0.05);
    p*=1+0.25*Math.sin(i*1.7+t*9)*Math.sin(i*0.37-t*5);
    out[i]=10*Math.log10(p+1e-9);
  }
  return {db:out,phrase,kick};
}
// shared level model for the VOX views: input peak, compressor gain reduction, de-ess
function voxLevels(t){
  const sp=spectrum(t,48); let peak=-120; for(const v of sp.db) peak=Math.max(peak,v);
  return {sp,peak,gr:Math.max(0,(peak+14)*0.55),deess:Math.max(0,sp.phrase*4.2*Math.max(0,Math.sin(t*3.1))*0.9)};
}

/* ---------- canvas helper ---------- */
function prep(cv,logical){
  const dpr=Math.min(devicePixelRatio||1,2), W=cv.clientWidth, H=cv.clientHeight; if(!W||!H) return null;
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){ cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); }
  const g=cv.getContext('2d');
  if(logical){ const s=W/logical; g.setTransform(dpr*s,0,0,dpr*s,0,0); g.clearRect(0,0,logical,logical*H/W); }
  else { g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H); }
  return {g,W,H};
}

/* ---------- VOX footer meters (input 182, output 1038; y 767/776; −60..0 dB) ---------- */
function voxMeters(g,st,ts,lvIn,lvOut){
  [[182,lvIn,0],[1038,lvOut,2]].forEach(([x,lv,k])=>{
    for(let ch=0;ch<2;ch++){ const l=cl(lv*(ch?0.97:1)+0.02*Math.sin(ts*20+ch)), y=767+(ch?9:0);
      g.fillStyle='#252a2b'; g.fillRect(x,y,60,5);
      const mg=g.createLinearGradient(x,0,x+60,0); mg.addColorStop(0,'#94d319'); mg.addColorStop(1,'#d3ff19'); g.fillStyle=mg; g.fillRect(x,y,60*l,5);
      st.pk[k+ch]=Math.max(l,(st.pk[k+ch]||0)-0.004); g.fillStyle='#f1f1ea'; g.fillRect(x+59*st.pk[k+ch],y,1,5); }
  });
}

const LIVE={
  /* THE ARC VOX · voice view: input vs processed spectrum, COMP / DE-ESS readouts, meters */
  'vox-voice'(cv,st,ts){
    const c=prep(cv,1280); if(!c) return; const g=c.g, n=120, sp=spectrum(ts,n);
    if(!st.si){ st.si=new Float32Array(n).fill(-90); st.so=new Float32Array(n).fill(-90); st.pk=[]; }
    let peak=-120; for(let i=0;i<n;i++) peak=Math.max(peak,sp.db[i]);
    const gr=Math.max(0,(peak+14)*0.55), deess=Math.max(0,sp.phrase*4.2*Math.max(0,Math.sin(ts*3.1))*0.9);
    for(let i=0;i<n;i++){ const f=40*Math.pow(500,i/(n-1)), lf=Math.log2(f);
      const o=sp.db[i]-gr*0.8+2.6*Math.exp(-Math.pow(lf-Math.log2(3200),2)/0.5)-deess*Math.exp(-Math.pow(lf-Math.log2(7000),2)/0.12)+1.5;
      st.si[i]+=(sp.db[i]-st.si[i])*(sp.db[i]>st.si[i]?0.55:0.12); st.so[i]+=(o-st.so[i])*(o>st.so[i]?0.55:0.12); }
    const x0=82,x1=1228,y0=166,y1=416;
    g.fillStyle='#0b0c0c'; g.fillRect(x0-2,y0+2,x1-x0+4,y1-y0-4);
    g.strokeStyle='rgba(241,241,234,0.05)'; g.lineWidth=1;
    [100,200,500,1000,2000,5000,10000].forEach(f=>{ const x=x0+(x1-x0)*Math.log(f/40)/Math.log(500); g.beginPath(); g.moveTo(x,y0); g.lineTo(x,y1); g.stroke(); });
    [-24,-48,-72].forEach(d=>{ const y=y0+(y1-y0)*(-d/96); g.beginPath(); g.moveTo(x0,y); g.lineTo(x1,y); g.stroke(); });
    const Y=(d)=>y0+(y1-y0)*cl(-(d+6)/96);
    g.beginPath(); for(let i=0;i<n;i++){ const x=x0+(x1-x0)*i/(n-1); i?g.lineTo(x,Y(st.si[i])):g.moveTo(x,Y(st.si[i])); }
    g.strokeStyle='rgba(162,170,168,0.75)'; g.lineWidth=1.3; g.stroke();
    const path=new Path2D(); path.moveTo(x0,y1); for(let i=0;i<n;i++) path.lineTo(x0+(x1-x0)*i/(n-1),Y(st.so[i])); path.lineTo(x1,y1); path.closePath();
    const grd=g.createLinearGradient(0,y0,0,y1); grd.addColorStop(0,'rgba(211,255,25,0.22)'); grd.addColorStop(1,'rgba(211,255,25,0)'); g.fillStyle=grd; g.fill(path);
    g.beginPath(); for(let i=0;i<n;i++){ const x=x0+(x1-x0)*i/(n-1); i?g.lineTo(x,Y(st.so[i])):g.moveTo(x,Y(st.so[i])); } g.strokeStyle='#d3ff19'; g.lineWidth=2; g.stroke();
    g.font='500 16px "IBM Plex Sans", system-ui, sans-serif'; g.textBaseline='middle';
    [[997,gr],[1118,deess]].forEach(([x,v])=>{ g.fillStyle='#121313'; g.fillRect(x,132,96,22); g.fillStyle='#d3ff19'; g.fillText((v>0.05?'-':'')+v.toFixed(1)+' dB',x+1,144); });
    voxMeters(g,st,ts,cl((peak+68)/60),cl((peak-gr*0.8+70)/60));
  },
  /* THE ARC VOX · rack: the signal walks the chain CLEAN → SPACE, each module lights as it passes */
  'vox-rack'(cv,st,ts){
    const c=prep(cv,1280); if(!c) return; const g=c.g; if(!st.pk) st.pk=[];
    const L=voxLevels(ts), cards=[[52,207],[222,377],[392,547],[562,717],[732,887],[902,1057],[1072,1227]], dots=[73,243,413,583,753,923,1093], y=420;
    const gaps=[[27,52]]; for(let i=0;i<6;i++) gaps.push([cards[i][1],cards[i+1][0]]); gaps.push([1227,1252]);
    // travelling pulses: one per beat, moving left → right across the chain in 1.3 s
    const beat=ts*92/60;
    for(let b=Math.floor(beat)-2;b<=Math.floor(beat);b++){
      const age=(beat-b)*60/92, pos=27+(1252-27)*cl(age/1.3), a=env(b*60/92+0.01);
      if(age>1.3) continue;
      gaps.forEach(([ga,gb])=>{ if(pos<ga-60||pos>gb+60) return; const s=Math.max(ga,pos-60), e=Math.min(gb,pos); if(e<=s) return;
        const lg=g.createLinearGradient(pos-60,0,pos,0); lg.addColorStop(0,'rgba(211,255,25,0)'); lg.addColorStop(1,'rgba(211,255,25,'+(0.35+0.6*a).toFixed(2)+')');
        g.fillStyle=lg; g.fillRect(s,y-1.5,e-s,3); });
      dots.forEach((dx,i)=>{ const d=Math.abs(pos-(cards[i][0]+cards[i][1])/2); if(d<70){ const k=(1-d/70)*(0.4+0.6*a); g.globalAlpha=k; g.fillStyle='#d3ff19'; g.shadowColor='#d3ff19'; g.shadowBlur=14; g.beginPath(); g.arc(dx,280,5,0,7); g.fill(); g.shadowBlur=0; g.globalAlpha=1; } });
    }
    voxMeters(g,st,ts,cl((L.peak+68)/60),cl((L.peak-L.gr*0.8+70)/60));
  },
  /* THE ARC VOX · advance › COMP: 6 s input history, gain-reduction trace, live REDUCTION readout */
  'vox-comp'(cv,st,ts){
    const c=prep(cv,1280); if(!c) return; const g=c.g; if(!st.pk) st.pk=[];
    const x0=85,x1=1025,y0=402,y1=530, N=240;
    if(!st.h){ st.h=[]; st.last=ts; }
    while(st.last<ts){ st.last+=6/N; const L=voxLevels(st.last); st.h.push([L.peak,L.gr]); if(st.h.length>N) st.h.shift(); }
    const L=voxLevels(ts);
    g.fillStyle='#080808'; g.fillRect(x0,y0+1,x1-x0,y1-y0-2);
    g.strokeStyle='rgba(241,241,234,0.05)'; g.lineWidth=1; [-12,-24,-36].forEach(d=>{ const y=y0+(y1-y0)*(-d/48); g.beginPath(); g.moveTo(x0,y); g.lineTo(x1,y); g.stroke(); });
    const h=st.h, dx=(x1-x0)/(N-1), off=N-h.length;
    // input level (dBFS, 0 at top, −48 at bottom) as a filled history
    g.beginPath(); g.moveTo(x0+off*dx,y1);
    h.forEach(([pk],i)=>{ g.lineTo(x0+(off+i)*dx,y0+(y1-y0)*cl(-(pk+4)/48)); }); g.lineTo(x1,y1); g.closePath();
    g.fillStyle='rgba(162,170,168,0.22)'; g.fill(); g.strokeStyle='rgba(162,170,168,0.6)'; g.lineWidth=1; g.stroke();
    // gain reduction (0 at top → 12 dB at bottom), lime, hanging from the 0 line
    g.beginPath(); h.forEach(([,gr],i)=>{ const x=x0+(off+i)*dx, y=y0+(y1-y0)*cl(gr/12); i?g.lineTo(x,y):g.moveTo(x,y); });
    g.strokeStyle='#d3ff19'; g.lineWidth=2; g.stroke();
    // REDUCTION readout + bar
    st.r=(st.r||0)+(L.gr-(st.r||0))*0.2;
    g.fillStyle='#161616'; g.fillRect(1062,462,118,40);
    g.font='500 30px "IBM Plex Sans", system-ui, sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillStyle='#d3ff19';
    g.fillText((st.r>0.05?'-':'')+st.r.toFixed(1)+' dB',1121,483); g.textAlign='start';
    g.fillStyle='#262a29'; g.fillRect(1072,514,105,3); g.fillStyle='#d3ff19'; g.fillRect(1072,514,105*cl(st.r/12),3);
    voxMeters(g,st,ts,cl((L.peak+68)/60),cl((L.peak-L.gr*0.8+70)/60));
  },
  /* THE ARC FX · create: input on the left, generated result on the right, header output meter */
  'fx-create'(cv,st,ts){
    const c=prep(cv,1280); if(!c) return; const g=c.g;
    const x0=310,x1=968,y0=154,y1=324,mid=574,cy=(y0+y1)/2;
    g.fillStyle='#0a0f10'; g.fillRect(x0,y0,x1-x0,y1-y0);
    g.strokeStyle='rgba(158,167,165,0.08)'; g.lineWidth=1; g.beginPath(); g.moveTo(x0,cy); g.lineTo(x1,cy); g.stroke();
    g.setLineDash([3,4]); g.strokeStyle='rgba(158,167,165,0.35)'; g.beginPath(); g.moveTo(mid,y0+8); g.lineTo(mid,y1); g.stroke(); g.setLineDash([]);
    g.beginPath(); for(let x=x0+6;x<mid-4;x+=1.5){ const y=cy-sig(ts-(mid-x)/420)*(y1-y0)*0.36; x===x0+6?g.moveTo(x,y):g.lineTo(x,y); }
    g.strokeStyle='rgba(158,167,165,0.85)'; g.lineWidth=1.4; g.stroke();
    const res=(u)=>{ let v=Math.tanh(sig(u)*3)*0.75; v*=1+0.2*Math.sin(u*55); v+=0.45*Math.tanh(sig(u-0.33)*3)*0.75+0.22*Math.tanh(sig(u-0.66)*3)*0.75; return v*0.8; };
    const grd=g.createLinearGradient(mid,0,x1,0); grd.addColorStop(0,'#e3bc23'); grd.addColorStop(0.35,'#ee6267'); grd.addColorStop(0.65,'#1dcadb'); grd.addColorStop(1,'#9a43dd');
    g.beginPath(); for(let x=mid+4;x<x1-6;x+=1.5){ const y=cy-res(ts-(x-mid)/420-0.12)*(y1-y0)*0.36; x===mid+4?g.moveTo(x,y):g.lineTo(x,y); }
    g.strokeStyle=grd; g.lineWidth=1.8; g.stroke();
    fxHeaderMeter(g,st,ts,1114,6);
  },
  /* THE ARC FX · rack: the signal runs INPUT → GRIT → WARP → ECHO → SPACE → OUTPUT, taking each pedal's colour */
  'fx-rack'(cv,st,ts){
    const c=prep(cv,1280); if(!c) return; const g=c.g;
    const y=288, peds=[[333,463,'#e3bc23'],[497,627,'#ee6267'],[660,793,'#1dcadb'],[825,957,'#9a43dd']];
    const gaps=[[92,333,'#c8cfc9'],[463,497,'#e3bc23'],[627,660,'#ee6267'],[793,825,'#1dcadb'],[957,1192,'#9a43dd']];
    const beat=ts*92/60;
    for(let b=Math.floor(beat)-2;b<=Math.floor(beat);b++){
      const age=(beat-b)*60/92; if(age>1.4) continue; const pos=92+(1192-92)*cl(age/1.4), a=env(b*60/92+0.01);
      gaps.forEach(([ga,gb,col])=>{ const s=Math.max(ga,pos-70), e=Math.min(gb,pos); if(e<=s) return;
        g.globalAlpha=0.35+0.6*a; const lg=g.createLinearGradient(pos-70,0,pos,0); lg.addColorStop(0,'rgba(0,0,0,0)'); lg.addColorStop(1,col); g.fillStyle=lg; g.fillRect(s,y-2,e-s,4); g.globalAlpha=1; });
      peds.forEach(([pa,pb,col])=>{ const d=Math.abs(pos-(pa+pb)/2); if(d<90){ g.globalAlpha=(1-d/90)*(0.25+0.5*a); g.strokeStyle=col; g.lineWidth=3; g.shadowColor=col; g.shadowBlur=18; g.strokeRect(pa-1,241,pb-pa+2,95); g.shadowBlur=0; g.globalAlpha=1; } });
    }
    // input / output stereo meters (vertical, 28 segments)
    const lvIn=cl(env(ts)*0.9+0.05), lvOut=cl(env(ts-0.1)*0.95+0.08);
    [[37,lvIn],[48,lvIn*0.96],[1232,lvOut],[1243,lvOut*0.97]].forEach(([x,l])=>{ const segs=16, top=266, bot=330, sh=(bot-top)/segs;
      for(let i=0;i<segs;i++){ if((i+0.5)/segs>l) break; const f=i/segs; g.fillStyle=f>0.88?'#ff9a49':(f>0.72?'#d6ff7a':'#b8ff1f'); g.fillRect(x,bot-(i+1)*sh+0.6,6,sh-1.2); } });
    fxHeaderMeter(g,st,ts,1130,6);
  },
  /* THE ARC FX · four-pedal chain: one waveform, reshaped as it passes each pedal */
  'fx-chain'(cv,st,ts){
    const c=prep(cv); if(!c) return; const {g,W,H}=c, cy=H*0.5, amp=H*0.16, k=1/(W*0.33);
    const zones=[[0,'#a3a597'],[0.21,'#e3bc23'],[0.403,'#ee6267'],[0.597,'#1dcadb'],[0.79,'#9a43dd']];
    const s2=(u)=>env(u)*Math.sin(u*2*Math.PI*7.3+Math.sin(u*3)*2);
    for(let x=0;x<W;x+=2){ const fx=x/W, u=ts-x*k; let z=0; for(let i=0;i<zones.length;i++) if(fx>=zones[i][0]) z=i;
      let v=s2(u); if(z>=1) v=Math.tanh(v*3.2)*0.82; if(z>=2) v*=1+0.25*Math.sin(u*40); if(z>=3) v+=0.5*s2(u-0.33)+0.25*s2(u-0.66);
      let e=Math.abs(v); if(z>=4) e=0.55*(env(u)+0.7*env(u-0.2)+0.5*env(u-0.45)+0.35*env(u-0.8))/1.6+0.05;
      const A=Math.max(0.8,Math.min(1.25,e)*amp); g.globalAlpha=0.85*Math.min(1,fx*12,(1-fx)*12); g.fillStyle=zones[z][1]; g.fillRect(x,cy-A,1.4,A*2); }
    g.globalAlpha=1;
  },
  /* ITMR mark: logo → live meters → logo */
  'logo'(cv,st,ts){
    const c=prep(cv); if(!c) return; const {g,W,H}=c; if(!st.lv) st.lv=[0,0,0,0];
    const P=9, cc=ts%P, m=RM?0:(cc<2.4?0:cc<3.2?ease((cc-2.4)/0.8):cc<7.2?1:cc<8?1-ease((cc-7.2)/0.8):0);
    const u=Math.min(W,H)/37, ox=(W-32*u)/2+u*1.6, oy=(H-32*u)/2, X=(x)=>ox+x*u, Y=(y)=>oy+y*u;
    if(m>0.01){ for(let x=0;x<X(2)-2;x+=3){ const f=x/X(2), uu=ts-(1-f)*1.6, e=Math.min(1,Math.exp(-((uu*92/60)%1)*5)*0.7+Math.max(0,Math.sin(uu*0.7)+0.3)*0.4);
      const a=Math.max(1,e*(0.7+0.3*Math.sin(x*0.7+ts*30))*u*7); g.globalAlpha=m*(0.15+0.6*f); g.fillStyle='#a3a597'; g.fillRect(x,Y(16)-a,1.6,a*2); } g.globalAlpha=1; }
    const op=m*1.6; g.fillStyle='#f4f3e9';
    const poly=(pts,dx)=>{ g.beginPath(); pts.forEach(([x,y],i)=>{ i?g.lineTo(X(x+dx),Y(y)):g.moveTo(X(x+dx),Y(y)); }); g.closePath(); g.fill(); };
    poly([[8,2],[2,5],[2,27],[8,30],[8,26],[5,24.5],[5,7.5],[8,6]],-op);
    poly([[24,2],[30,5],[30,27],[24,30],[24,26],[27,24.5],[27,7.5],[24,6]],op);
    const logo=[[9,17,7],[13,11,10],[17,15,9],[21,9,11]], beat=ts*92/60, ph=beat%1, e=Math.max(0,Math.sin(ts*0.62)+0.35)*(0.6+0.4*Math.abs(Math.sin(ts*3.1)));
    const tgt=[0.35+0.6*Math.exp(-ph*8),0.3+0.6*e,0.25+0.5*e*Math.abs(Math.sin(ts*2.3))+0.2*Math.exp(-((beat+1)%2)*6),0.3+0.6*Math.exp(-((beat*2)%1)*12)];
    g.fillStyle='#d5ff3f';
    logo.forEach(([x,y,h],i)=>{ st.lv[i]+=(Math.min(1,tgt[i])-st.lv[i])*0.25; const mh=1+19*st.lv[i], lb=y+h, bot=lb+(26-lb)*m, hh=h+(mh-h)*m, wx=x-0.6*m, ww=3+1.2*m;
      g.fillRect(X(wx),Y(bot-hh),ww*u,hh*u); if(m>0.6){ g.globalAlpha=(m-0.6)/0.4*0.9; g.fillRect(X(wx),Y(bot-hh)-u*0.9,ww*u,u*0.35); g.globalAlpha=1; } });
  }
};
// THE ARC FX header output meter (components/meters/geometry.json: master 168×62 at 0.875, 28 segments)
function fxHeaderMeter(g,st,ts,bx,by){
  if(!st.lv){ st.lv=[0,0]; st.pk=[0,0]; }
  const kn=[-60,-24,-12,-6,0], kx=[19,58,90,122,158];
  const lvl=(db)=>{ if(db<=-60) return 0; if(db>=0) return 1; let i=0; while(db>kn[i+1]) i++; const mx=kx[i]+(kx[i+1]-kx[i])*(db-kn[i])/(kn[i+1]-kn[i]); return cl((mx-20)/140); };
  const db=-60+56*Math.pow(env(ts),0.6), S=147/168, mx=bx+20*S, mw=140*S, segs=28;
  [17,34].forEach((yy,ch)=>{ const t=lvl(db-(ch?1.2:0)+1.5*Math.sin(ts*13+ch)); st.lv[ch]+=(t-st.lv[ch])*(t>st.lv[ch]?0.5:0.08); st.pk[ch]=Math.max(st.lv[ch],st.pk[ch]-0.003);
    const y=by+yy*S, h=9*S;
    for(let i=0;i<segs;i++){ if((i+0.5)/segs>st.lv[ch]) continue; const f=i/segs; g.fillStyle=f>0.93?'#ff9a49':(f>0.8?'#d6ff7a':'#b8ff1f'); g.fillRect(mx+i*mw/segs+0.5,y+0.6,mw/segs-1.2,h-1.2); }
    const pi=Math.min(segs-1,Math.floor(st.pk[ch]*segs)); g.fillStyle='#f1f1ea'; g.fillRect(mx+pi*mw/segs+0.5,y+0.6,mw/segs-1.2,h-1.2); });
}

/* ---------- perspective lift-away ---------- */
function lift(sec){
  const stage=sec.querySelector('.stageD'), Ls=[...sec.querySelectorAll('.layerD')], dots=[...sec.querySelectorAll('.dotsD i')], n=Ls.length;
  const r=sec.getBoundingClientRect(), sh=stage.offsetHeight, stick=parseFloat(getComputedStyle(stage).top)||0;
  const p=cl((stick-r.top)/Math.max(1,r.height-sh));
  const T=[]; for(let k=0;k<n-1;k++) T.push(ease(cl((p*(n-1)-k-0.25)/0.5)));
  let act=0; T.forEach((t,k)=>{ if(t>0.5) act=k+1; });
  Ls.forEach((el,i)=>{
    const inn=i===0?1:T[i-1], out=i<n-1?T[i]:0;
    const sc=(0.84+0.16*inn)*(1+0.12*out), ty=18*(1-inn)-30*out, bl=10*(1-inn)+16*out, op=cl(inn*(1-out*1.1));
    const rx=22*(1-inn)+55*out, tz=-120*(1-inn)+180*out;   // top tips back into the distance, bottom swings toward you
    const tf='perspective(760px) translateY('+ty.toFixed(2)+'vh) translateZ('+tz.toFixed(1)+'px) rotateX('+rx.toFixed(2)+'deg) scale('+sc.toFixed(4)+')';
    if(el._tf!==tf){ el._tf=tf; el.style.transform=tf; }
    el.style.opacity=op.toFixed(3); el._op=op; el.style.pointerEvents=op>0.6?'auto':'none'; el.style.zIndex=String(out>0?n+2:n-i);
    // blur goes on the children: a filter on the tilted element itself flattens the 3D in Safari
    const f=bl>0.2?'blur('+bl.toFixed(1)+'px)':'none'; if(el._f!==f){ el._f=f; for(const c of el.children) c.style.filter=f; }
  });
  dots.forEach((d,i)=>d.classList.toggle('on',i===act));
}

window.ITMR_LIVE=LIVE; // exposed so other pages (the 3D badge) can draw the live overlays into textures
/* ---------- boot ---------- */
function boot(){
  const lives=[...document.querySelectorAll('[data-live]')].map(el=>({el,cv:el.tagName==='CANVAS'?el:el.querySelector('canvas'),fn:LIVE[el.dataset.live],st:{},layer:el.closest('.layerD')})).filter(o=>o.cv&&o.fn);
  const lifts=RM?[]:[...document.querySelectorAll('.liftD')];
  const reveals=[...document.querySelectorAll('[data-reveal]')];
  if(RM) reveals.forEach(e=>e.classList.add('in'));
  const vis=new Set(); const io=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting?vis.add(e.target):vis.delete(e.target)),{rootMargin:'200px'});
  lives.forEach(o=>io.observe(o.cv));
  const loop=(t)=>{
    lifts.forEach(lift);
    const ts=t/1000;
    lives.forEach(o=>{ if(!vis.has(o.cv)) return; if(o.layer&&o.layer._op!==undefined&&o.layer._op<0.02) return; o.fn(o.cv,o.st,ts); });
    if(!RM) reveals.forEach(e=>{ if(!e.classList.contains('in')&&e.getBoundingClientRect().top<innerHeight*0.86) e.classList.add('in'); });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
