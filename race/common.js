/* Общая математика гонки: рельеф каньона, пресеты, пилоты. Используется игрой (index.html) и тренировкой (train.html). */
export const PRESETS = [
  { id:"warm",  name:"Разминка · 900 км/ч",       vmax:250 },
  { id:"fast",  name:"Скоростная · 2500 км/ч",    vmax:700 },
  { id:"hyper", name:"Гипер · 7200 км/ч",         vmax:2000 },
  { id:"orbit", name:"Над планетой · 24000 км/ч", vmax:6700 },
  { id:"ultra", name:"Космос · 47000 км/ч",        vmax:13000 },
  { id:"max",   name:"Предел · 94000 км/ч",        vmax:26000 },
];

export const H_SRC = `
float nz(float x,float z,float c,float s,float ph){
  float u=c*x+s*z; float v=c*z-s*x;
  return sin(u+1.7*sin(v*0.53+ph))*sin(v*0.91+ph*1.3+1.1*sin(u*0.37));
}
float hgt(float x,float z,float sc){
  x/=sc; z/=sc;
  float h=380.;
  h+=620.*nz(x*3.1e-4,z*3.1e-4,.8,.6,0.3);
  float r=1.-abs(nz(x*7.7e-4,z*7.7e-4,.6,-.8,1.9));
  h+=420.*r*r;
  h+=150.*nz(x*2.1e-3,z*2.1e-3,.96,.28,4.1);
  h+=45.*nz(x*5.3e-3,z*5.3e-3,.28,.96,2.2);
  h+=12.*nz(x*1.3e-2,z*1.3e-2,-.6,.8,5.0);
  float lk=nz(x*3.4e-4,z*3.4e-4,.2,.98,6.4);
  float low=1.-smoothstep(230.,430.,h);
  h=mix(h,-40.,smoothstep(.26,.44,lk)*low);
  return h*sc;
}
float tmpF(float x,float z,float sc,float hs){ x/=sc; z/=sc; return clamp(.56+.68*nz(x*3e-4,z*3e-4,.9,.44,5.1)-hs/5000.,0.,1.); }
float wetF(float x,float z,float sc){ x/=sc; z/=sc; return clamp(.5+.68*nz(x*3.7e-4,z*3.7e-4,.3,.95,8.2),0.,1.); }`;

export const CZC = `float czc(float x){ return 1400.*sin(x*5.7e-4+.7)+520.*sin(x*1.337e-3+2.1)+120.*sin(x*2.0e-3+4.0); }`;
export const C_SRC = `
${CZC}
float cfl(float x){ return 45.+45.*sin(x*3.7e-4+1.)+30.*sin(x*9.1e-4+2.3); }
float czd(float x){ return .798*cos(x*5.7e-4+.7)+.695*cos(x*1.337e-3+2.1)+.24*cos(x*2.0e-3+4.0); }
/* развилка: между соседними арками (примерно в половине промежутков) каньон расширяется, посреди вырастает скальный остров */
float fkk(float x,float kk){ float a=4300.*(kk+.5+.22*sin(2.3*kk+.6)); float b=4300.*(kk+1.5+.22*sin(2.3*kk+2.9)); float hl=min(1300.,(b-a)*.5-650.); return step(.1,sin(kk*3.71+2.2))*(1.-smoothstep(hl-600.,hl,abs(x-(a+b)*.5))); }
float fkz(float x){ float k=floor(x/4300.-.5); return max(fkk(x,k-1.),max(fkk(x,k),fkk(x,k+1.))); }
float cw0(float x){ return (260.+90.*sin(x*3.1e-4+1.1)+50.*sin(x*7.3e-4+.5))*(1.+.85*fkz(x)); }
/* точка возврата в развилке: середина правого рукава с учётом острова, который вырастет впереди (а не только здесь) */
float fko(float x){ float f=max(fkz(x),max(fkz(x+700.),fkz(x+1400.))); return .32*f*cw0(x)*(1.+.85*f)/(1.+.85*fkz(x)); }
float cD(float x){ return 650.+220.*sin(x*2.3e-4+2.2)+90.*sin(x*5.1e-4+.3); }
float axk(float x,float k){ return abs(x-4300.*(k+.5+.22*sin(2.3*k+.6))); }
float archd(float x){ float k=floor(x/4300.); return min(axk(x,k-1.),min(axk(x,k),axk(x,k+1.))); }
/* полка: каменная плита поперёк каньона (проход над ней и под ней); shd<0 — внутри полки по длине */
float shk(float x,float kk){ if(sin(kk*2.17+.4)<.3||sin(kk*3.71+2.2)>=.1) return 1e9; /* не в том же промежутке, что развилка: вместе они образуют западню */ float a=4300.*(kk+.5+.22*sin(2.3*kk+.6)); float b=4300.*(kk+1.5+.22*sin(2.3*kk+2.9)); float hl=min(950.,(b-a)*.5-800.); if(hl<250.) return 1e9; return abs(x-(a+b)*.5)-hl; }
float shd(float x){ float k=floor(x/4300.-.5); return min(shk(x,k-1.),min(shk(x,k),shk(x,k+1.))); }
float shy(float x){ return 30.+cfl(x)+cD(x)*(.52+.06*sin(x*7e-4)+.055*sin(x*2.4e-3+1.3)); } /* вдоль — горб/прогиб, мост не прямой */
float sht(float x){ return cD(x)*.07; }
/* форма полки — природный каменный мост: a — поперечное положение в долях ширины (по перпендикуляру к оси, знак — сторона).
   Низ — арка: к стенам опускается и уходит в склон (контрфорсы), верх поднимается к кромкам; у стен мост длиннее, чем посередине,
   толщина «гуляет» вдоль и поперёк, края рваные; shU — верх над shy, shB — низ под shy (оба со сдвигом коробления shO; толщина = shU+shB) */
float shT(float x,float a){ return sqrt(clamp((-shd(x)+110.*nz(x*1.1e-3,a*1.7,.8,.6,3.3)+300.*smoothstep(.3,1.1,abs(a))+160.*sin(a*2.6+x*7e-4)+70.*nz(x*2.3e-3,a*5.3,.6,.8,7.7))/600.,0.,1.)); } /* край моста — изогнутый язык, а не прямая кромка; к краю истончается плавно */
/* коробление: средняя поверхность моста наклонена поперёк (наклон меняется вдоль) и волнистая — сдвигает и верх, и низ */
float shO(float x,float a){ return cD(x)*(.075*a*sin(x*1.3e-3+.7)+.05*nz(x*1.9e-3,a*1.4,.7,.7,6.1)); }
float shU(float x,float a){ float t=shT(x,a); float q=smoothstep(.35,1.05,abs(a)); return shO(x,a)+max(0.,sht(x)*t*(.5+1.6*smoothstep(.5,1.2,abs(a))+.35*nz(x*3.7e-3,a*2.9,.7,.7,1.3))*(1.+.3*nz(x*1.3e-3,a*.7,.9,.4,2.6))+cD(x)*.22*t*q*q); }
float shB(float x,float a){ float t=shT(x,a); float q=smoothstep(.3,1.,abs(a)); return -shO(x,a)+max(0.,sht(x)*t*(.55+2.6*smoothstep(.45,1.2,abs(a))+.75*nz(x*2.9e-3,a*2.3+5.,.6,.8,4.1)+.3*nz(x*7.1e-3,a*4.3,.9,.4,2.2))*(1.+.35*nz(x*1.1e-3,a*.8,.4,.9,5.2))+cD(x)*.38*t*q*q); }
float chgt(float x,float z,float sc){
  x/=sc; z/=sc;
  float sl=czd(x); float isl=inversesqrt(1.+sl*sl);
  float dz=z-czc(x); float d=abs(dz)*isl;
  float w0=cw0(x); float D=cD(x); float u=d/w0;
  float rd=abs(dz*isl-.25*w0*sin(x*5.3e-4+.9));
  float fl=30.+cfl(x)+20.*nz(x*1.7e-3,z*1.7e-3,.8,.6,2.7);
  fl=mix(fl,-30.,1.-smoothstep(25.,100.,rd));
  float fr=smoothstep(.32,1.08,u);
  float st=fr*5.; float stp=(floor(st)+smoothstep(.55,.95,fract(st)))/5.;
  float wt=mix(fr,stp,.8);
  float h=fl+(D-fl)*wt;
  float wallm=smoothstep(.25,.6,u)*(1.-smoothstep(1.05,1.3,u));
  h+=wallm*(nz(x*2.3e-3,z*2.3e-3,.5,.86,1.1)*38.+nz(x*6.7e-3,z*6.7e-3,.9,.44,3.9)*14.);
  float pu=smoothstep(1.35,2.3,u);
  float pl=nz(x*6.1e-4,z*6.1e-4,.7,-.7,.9)*110.+nz(x*1.7e-3,z*1.7e-3,.3,.95,2.2)*45.+nz(x*4.9e-3,z*4.9e-3,-.6,.8,4.4)*16.;
  float ms=max(0.,nz(x*9e-4,z*9e-4,.9,.44,1.9)-.45)/.55; ms=ms*ms*320.;
  h+=pu*(pl+ms);
  float qa=nz(x*4.1e-3,z*4.1e-3,.5,.86,1.1); float qb=nz(x*2.9e-3,z*2.9e-3,.9,.44,3.7);
  float sp=max(0.,qa*qb-.4)/.6;
  float fk=fkz(x);
  h+=min(380.,.72*D)*sp*smoothstep(600.,1700.,archd(x))*smoothstep(130.,230.,w0)*smoothstep(.05,.22,u)*(1.-smoothstep(.95,1.15,u))*(1.-fk)*smoothstep(0.,500.,shd(x));
  if(fk>0.){ /* остров: ширина и положение плавно «гуляют», вершина волнистая, склоны мягко переходят в дно */
    float iw=.14*w0*(.45+.55*fk)*(1.+.35*nz(x*1.3e-3,7.3,.8,.6,1.7)); float io=.05*w0*nz(x*9e-4,3.1,.6,.8,.4); float di=abs(dz*isl-io);
    float ci=1.-smoothstep(iw*.25,iw*2.2,di); ci=ci*ci*(3.-2.*ci);
    float ihf=(.55+.45*smoothstep(-.3,.3,sin(x*1.9e-4+1.3)))*(1.+.1*nz(x*2.3e-3,1.1,.7,.7,2.9));
    float hi=fl+(D*ihf-fl)*fk*ci+ci*fk*(nz(x*3.1e-3,z*3.1e-3,.6,.8,2.4)*30.+nz(x*8e-3,z*8e-3,.9,.4,1.)*10.); h=max(h,hi); }
  return h*sc;
}`;
export const WRAPJS = "const abs=Math.abs,sin=Math.sin,cos=Math.cos,floor=Math.floor,sign=Math.sign,pow=Math.pow,sqrt=Math.sqrt,max=Math.max,min=Math.min,fract=x=>x-Math.floor(x),inversesqrt=x=>1/Math.sqrt(x),smoothstep=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)},mix=(a,b,t)=>a+(b-a)*t,clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),step=(e,x)=>x<e?0:1;";
export const toJs = src => src.replace(/float (\w+)(?=\s*[,)])/g, "$1").replace(/float\s+(\w+)\s*\(/g, "function $1(").replace(/float\s+(\w+)\s*=/g, "let $1 =");
export const CW = new Function(WRAPJS + toJs(H_SRC) + toJs(C_SRC) + ";return {czc,czd,cw0,cD,chgt,archd,cfl,fkz,fko,shd,shy,sht,shU,shB};")();

export function paramsFor(vmax) {
  const SC = Math.pow(vmax / 250, 0.8);
  return { vmax, SC, AMAX: Math.max(70, vmax / 4), ACC: vmax / 6, BRK: vmax / 4, R: 40000 * SC, Rg: 40 + 35 * SC, cs: 1 + 0.7 * SC };
}

export const AP_STD = { LS: 3.2, BLE: .65, LCW: 1.05, AW: 2.4, HY: .5, HYA: 1.2, M: 50, COLW: 40, ARW: 70, OUT: 1.1, KW: 4, NF: .8, NW: 130, CF: .75, CWD: 60, AU: .95, LD: .8, LDX: .85, VF: .38 };

export const PILOTS = { // чемпионы эволюции (см. README)
  c1: { name: "Чемпион 1 — быстрый (иногда падает)", ap: { LS: 4.095, BLE: 0.66, LCW: 1.257, AW: 0.5, HY: 0.418, HYA: 0.982, M: 57.933, COLW: 16.256, ARW: 65.04, OUT: 0.887, KW: 5.665, NF: 0.74, NW: 171.908, CF: 0.594, CWD: 53.033, AU: 0.978, LD: 1.012, LDX: 0.922, VF: 0.579 } },
  c2: { name: "Чемпион 2 — 40 поколений (на 47 000+ км/ч иногда падает)", ap: { ARW: 61.495, AU: 1.0, AW: 1.511, BLE: 0.709, CF: 0.501, COLW: 33.086, CWD: 58.015, HY: 0.379, HYA: 0.849, KW: 7.544, LCW: 0.874, LD: 0.883, LDX: 0.821, LS: 3.685, M: 80, NF: 0.685, NW: 80, OUT: 2.05, VF: 0.574 } },
  c3: { name: "Чемпион 3 — смелый, под арками (на 47 000+ км/ч иногда падает)", ap: { ARW: 61.811, AU: 0.982, AW: 1.49, BLE: 0.787, CF: 0.551, COLW: 28.962, CWD: 59.497, HY: 0.658, HYA: 1.351, KW: 7.254, LCW: 1.058, LD: 1.152, LDX: 0.794, LS: 3.486, M: 62.739, NF: 0.702, NW: 91.904, OUT: 2.994, VF: 0.568 } },
};

