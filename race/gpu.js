/* WebGPU-бэкенд тренировки: тот же автопилот и физика, что в игре и в WebGL2-версии (train.html), но на вычислительном шейдере (WGSL).
   Один поток = один самолёт; состояние хранится в storage-буфере, за один запуск считается несколько шагов по 1/60 с. */

export const WGSL = /* wgsl */`
struct U { dt: f32, steps: u32, n: u32, pad: u32 };
@group(0) @binding(0) var<uniform> U0: U;
@group(0) @binding(1) var<storage, read> PR: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> ST: array<vec4f>;

var<private> SC: f32; var<private> CS: f32; var<private> VMAX: f32; var<private> AMAX: f32; var<private> ACC: f32; var<private> BRK: f32; var<private> ALT: f32;
var<private> LS: f32; var<private> BLE: f32; var<private> LCW: f32; var<private> AW: f32; var<private> HY: f32; var<private> HYA: f32; var<private> MM: f32;
var<private> COLW: f32; var<private> ARW: f32; var<private> OUTW: f32; var<private> KW: f32; var<private> NF: f32; var<private> NW: f32; var<private> CF: f32;
var<private> CWD: f32; var<private> AU: f32; var<private> LD: f32; var<private> LDX: f32; var<private> VF: f32;

/* ---- рельеф каньона (копия C_SRC / H_SRC из common.js) ---- */
fn nz(x: f32, z: f32, c: f32, s: f32, ph: f32) -> f32 {
  let u = c * x + s * z; let v = c * z - s * x;
  return sin(u + 1.7 * sin(v * 0.53 + ph)) * sin(v * 0.91 + ph * 1.3 + 1.1 * sin(u * 0.37));
}
fn czc(x: f32) -> f32 { return 1400. * sin(x * 5.7e-4 + .7) + 520. * sin(x * 1.337e-3 + 2.1) + 120. * sin(x * 2.0e-3 + 4.0); }
fn cfl(x: f32) -> f32 { return 45. + 45. * sin(x * 3.7e-4 + 1.) + 30. * sin(x * 9.1e-4 + 2.3); }
fn czd(x: f32) -> f32 { return .798 * cos(x * 5.7e-4 + .7) + .695 * cos(x * 1.337e-3 + 2.1) + .24 * cos(x * 2.0e-3 + 4.0); }
fn fkk(x: f32, kk: f32) -> f32 { if (sin(kk * 3.71 + 2.2) < .1) { return 0.; } let a = 4300. * (kk + .5 + .22 * sin(2.3 * kk + .6)); let b = 4300. * (kk + 1.5 + .22 * sin(2.3 * kk + 2.9)); let hl = min(1300., (b - a) * .5 - 650.); return 1. - smoothstep(hl - 600., hl, abs(x - (a + b) * .5)); }
fn fkz(x: f32) -> f32 { let k = floor(x / 4300. - .5); return max(fkk(x, k - 1.), max(fkk(x, k), fkk(x, k + 1.))); }
fn cw0(x: f32) -> f32 { return (260. + 90. * sin(x * 3.1e-4 + 1.1) + 50. * sin(x * 7.3e-4 + .5)) * (1. + .85 * fkz(x)); }
fn fko(x: f32) -> f32 { let f = max(fkz(x), max(fkz(x + 700.), fkz(x + 1400.))); return .32 * f * cw0(x) * (1. + .85 * f) / (1. + .85 * fkz(x)); }
fn cD(x: f32) -> f32 { return 650. + 220. * sin(x * 2.3e-4 + 2.2) + 90. * sin(x * 5.1e-4 + .3); }
fn axk(x: f32, k: f32) -> f32 { return abs(x - 4300. * (k + .5 + .22 * sin(2.3 * k + .6))); }
fn archd(x: f32) -> f32 { let k = floor(x / 4300.); return min(axk(x, k - 1.), min(axk(x, k), axk(x, k + 1.))); }
fn shk(x: f32, kk: f32) -> f32 { if (sin(kk * 2.17 + .4) < .3 || sin(kk * 3.71 + 2.2) >= .1) { return 1e9; } let a = 4300. * (kk + .5 + .22 * sin(2.3 * kk + .6)); let b = 4300. * (kk + 1.5 + .22 * sin(2.3 * kk + 2.9)); let hl = min(950., (b - a) * .5 - 800.); if (hl < 250.) { return 1e9; } return abs(x - (a + b) * .5) - hl; }
fn shd(x: f32) -> f32 { let k = floor(x / 4300. - .5); return min(shk(x, k - 1.), min(shk(x, k), shk(x, k + 1.))); }
fn shy(x: f32) -> f32 { return 30. + cfl(x) + cD(x) * (.52 + .06 * sin(x * 7e-4)); }
fn sht(x: f32) -> f32 { return cD(x) * .07; }
fn shT(x: f32, a: f32) -> f32 { return sqrt(clamp((-shd(x) + 110. * nz(x * 1.1e-3, a * 1.7, .8, .6, 3.3) + 300. * smoothstep(.3, 1.1, abs(a))) / 320., 0., 1.)); }
fn shU(x: f32, a: f32) -> f32 { let t = shT(x, a); let q = smoothstep(.35, 1.05, abs(a)); return max(0., sht(x) * t * (.5 + 1.6 * smoothstep(.5, 1.2, abs(a)) + .35 * nz(x * 3.7e-3, a * 2.9, .7, .7, 1.3)) * (1. + .3 * nz(x * 1.3e-3, a * .7, .9, .4, 2.6)) + cD(x) * .22 * t * q * q); }
fn shB(x: f32, a: f32) -> f32 { let t = shT(x, a); let q = smoothstep(.3, 1., abs(a)); return max(0., sht(x) * t * (.55 + 2.6 * smoothstep(.45, 1.2, abs(a)) + .55 * nz(x * 2.9e-3, a * 2.3 + 5., .6, .8, 4.1)) * (1. + .3 * nz(x * 1.1e-3, a * .8, .4, .9, 5.2)) + cD(x) * .38 * t * q * q); }
fn chgt(x0: f32, z0: f32, sc: f32) -> f32 {
  let x = x0 / sc; let z = z0 / sc;
  let sl = czd(x); let isl = inverseSqrt(1. + sl * sl);
  let dz = z - czc(x); let d = abs(dz) * isl;
  let w0 = cw0(x); let D = cD(x); let u = d / w0;
  let rd = abs(dz * isl - .25 * w0 * sin(x * 5.3e-4 + .9));
  var fl = 30. + cfl(x) + 20. * nz(x * 1.7e-3, z * 1.7e-3, .8, .6, 2.7);
  fl = mix(fl, -30., 1. - smoothstep(25., 100., rd));
  let fr = smoothstep(.32, 1.08, u);
  let st = fr * 5.; let stp = (floor(st) + smoothstep(.55, .95, fract(st))) / 5.;
  let wt = mix(fr, stp, .8);
  var h = fl + (D - fl) * wt;
  let wallm = smoothstep(.25, .6, u) * (1. - smoothstep(1.05, 1.3, u));
  h += wallm * (nz(x * 2.3e-3, z * 2.3e-3, .5, .86, 1.1) * 38. + nz(x * 6.7e-3, z * 6.7e-3, .9, .44, 3.9) * 14.);
  let pu = smoothstep(1.35, 2.3, u);
  let pl = nz(x * 6.1e-4, z * 6.1e-4, .7, -.7, .9) * 110. + nz(x * 1.7e-3, z * 1.7e-3, .3, .95, 2.2) * 45. + nz(x * 4.9e-3, z * 4.9e-3, -.6, .8, 4.4) * 16.;
  var ms = max(0., nz(x * 9e-4, z * 9e-4, .9, .44, 1.9) - .45) / .55; ms = ms * ms * 320.;
  h += pu * (pl + ms);
  let qa = nz(x * 4.1e-3, z * 4.1e-3, .5, .86, 1.1); let qb = nz(x * 2.9e-3, z * 2.9e-3, .9, .44, 3.7);
  let sp = max(0., qa * qb - .4) / .6;
  let fk = fkz(x);
  h += min(380., .72 * D) * sp * smoothstep(600., 1700., archd(x)) * smoothstep(130., 230., w0) * smoothstep(.05, .22, u) * (1. - smoothstep(.95, 1.15, u)) * (1. - fk) * smoothstep(0., 500., shd(x));
  if (fk > 0.) {
    let iw = .14 * w0 * (.45 + .55 * fk) * (1. + .35 * nz(x * 1.3e-3, 7.3, .8, .6, 1.7)); let io = .05 * w0 * nz(x * 9e-4, 3.1, .6, .8, .4); let di = abs(dz * isl - io);
    var ci = 1. - smoothstep(iw * .25, iw * 2.2, di); ci = ci * ci * (3. - 2. * ci);
    let ihf = (.55 + .45 * smoothstep(-.3, .3, sin(x * 1.9e-4 + 1.3))) * (1. + .1 * nz(x * 2.3e-3, 1.1, .7, .7, 2.9));
    let hi = fl + (D * ihf - fl) * fk * ci + ci * fk * (nz(x * 3.1e-3, z * 3.1e-3, .6, .8, 2.4) * 30. + nz(x * 8e-3, z * 8e-3, .9, .4, 1.) * 10.); h = max(h, hi);
  }
  return h * sc;
}

/* ---- геометрия и арки (как COMMON в train.html) ---- */
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn ZC(x: f32) -> f32 { return czc(x / SC) * SC; }
fn WW(x: f32) -> f32 { return cw0(x / SC) * SC; }
fn DD(x: f32) -> f32 { return cD(x / SC) * SC; }
fn FL(x: f32) -> f32 { return (30. + cfl(x / SC)) * SC; }
fn GND(x: f32, z: f32) -> f32 { return max(0., chgt(x, z, SC)); }
fn SPA() -> f32 { return 4300. * SC; }
fn AX(k: f32) -> f32 { return SPA() * (k + .5 + .22 * sin(k * 2.3 + .6)); }
struct Arch { x: f32, z: f32, th: f32, Sa: f32, yc: f32, yl: f32, Th: f32, Lt: f32, fl: f32 };
fn AP_(k: f32) -> Arch {
  var a: Arch; a.x = AX(k); let w = WW(a.x); let D = DD(a.x); a.z = ZC(a.x); a.th = atan(czd(a.x / SC));
  a.Sa = 1.18 * w; a.yc = .64 * D; a.yl = -20. * SC; a.Th = .14 * D; a.Lt = max(90. * SC, .32 * w); a.fl = FL(a.x); return a;
}
fn archHit(p: vec3f, m: f32) -> bool {
  let k0 = floor(p.x / SPA());
  for (var i = -1; i <= 1; i++) {
    let a = AP_(k0 + f32(i)); let dx = p.x - a.x; let dz = p.z - a.z; let c = cos(a.th); let sn = sin(a.th);
    let t = dx * c + dz * sn; let n = -dx * sn + dz * c;
    if (abs(t) > a.Lt / 2. + m || abs(n) > a.Sa) { continue; }
    let r = abs(n) / a.Sa; let yb = a.fl + a.yc - (a.yc - a.yl) * pow(r, 2.4); let yt = yb + a.Th * (1. - .4 * r * r);
    if (p.y > yb - m && p.y < yt + m) { return true; }
  }
  return false;
}
fn shelfHit(p: vec3f, m: f32) -> bool {
  let u = p.x / SC; if (shd(u) * SC > m + 420. * SC) { return false; }
  let sl = czd(u); let a = (p.z - ZC(p.x)) / sqrt(1. + sl * sl) / WW(p.x); if (abs(a) > 1.3) { return false; }
  let ys = shy(u) * SC; let up = shU(u, a); let dn = shB(u, a);
  return p.y < ys + up * SC + m && p.y > ys - dn * SC - m && up + dn > 0.;
}
fn nextArchK(x: f32) -> f32 { var k = floor(x / SPA()) - 1.; for (var i = 0; i < 4; i++) { if (AX(k) > x) { return k; } k += 1.; } return k; }
fn altPref(x: f32) -> f32 {
  var r = vec2f(1.3, 1.3);
  if (ALT < .5) { r = vec2f(.08, .3); } else if (ALT < 1.5) { r = vec2f(.1, .62); } else if (ALT < 2.5) { r = vec2f(.26, .8); }
  let u = x / SC; let g = .5 + .5 * sin(u * 1.5e-3 + .8 + 1.3 * sin(u * 4e-4)); return r.x + (r.y - r.x) * g;
}
fn popFlag(k: f32) -> bool { return sin(k * 5.17 + 1.3) * .5 + .5 > .75; }
fn archU(k: f32, SP: f32) -> f32 { return SP * (k + .5 + .22 * sin(k * 2.3 + .6)); }
fn popE(x: f32) -> f32 {
  if (ALT >= 2.5) { return 0.; }
  let u = x / SC; let SP = 4300.; let k0 = floor(u / SP); var ea = 0.; var dA = 1e9;
  for (var i = -1; i <= 1; i++) {
    let k = k0 + f32(i); let ak = archU(k, SP); let dd = u - ak; let d = abs(dd); dA = min(dA, d);
    if (popFlag(k)) {
      let k2 = k + select(-1., 1., dd > 0.); var a = 1500.; var b = 2800.;
      if (!popFlag(k2)) { b = min(2800., abs(archU(k2, SP) - ak) - 900.); a = max(300., min(1500., b - 600.)); }
      ea = max(ea, 1. - ss(a, max(b, a + 50.), d));
    }
  }
  let D = cD(u); let es = ss(500., 1500., dA) * ss(.15, .55, sin(u * 1.1e-3 + .4)) * ss(700., 540., D);
  return max(ea, es);
}
fn popAc(x: f32) -> f32 { let u = x / SC; let y = (1350. + 350. * sin(u * 1.3e-3 + .5)) * SC; return clamp((y - FL(x)) / DD(x), 1.05, 1.9); }

fn loadParams(id: u32) {
  let a = PR[id * 6u]; let b = PR[id * 6u + 1u]; let c = PR[id * 6u + 2u]; let d = PR[id * 6u + 3u]; let e = PR[id * 6u + 4u]; let f = PR[id * 6u + 5u];
  LS = a.x; BLE = a.y; LCW = a.z; AW = a.w; HY = b.x; HYA = b.y; MM = b.z; COLW = b.w; ARW = c.x; OUTW = c.y; KW = c.z; NF = c.w; NW = d.x; CF = d.y; CWD = d.z; AU = d.w;
  LD = e.x; LDX = e.y; VF = e.z; ALT = e.w; VMAX = f.x; SC = f.y; AMAX = f.z; CS = 1. + .7 * SC; ACC = VMAX / 3.; BRK = VMAX / 2.;
}

/* ---- планировщик траектории (как plan() в train.html) ---- */
fn plan(P: vec3f, v_: f32, pl1: ptr<function, vec4f>, pl2: ptr<function, vec4f>, tNow: f32) {
  let sk = .92; let v = max(v_, VMAX * .2); let Ls = v * LS; let Lsx = Ls * .85; let x0 = P.x; let fl = FL(x0);
  let w0 = WW(x0); let D0 = DD(x0); let L0 = clamp((P.z - ZC(x0)) / w0, -1.4, 1.4); let a0 = (P.y - fl) / D0; let r = 80. * CS; let m = MM * CS;
  let xm = x0 + Lsx * .6; let pref0 = altPref(xm); let E = popE(xm); let pref = pref0 + (popAc(xm) - pref0) * E;
  var acs: array<f32, 7>; var nac = 5;
  acs[0] = clamp(pref * .6, .1, 1.9); acs[1] = clamp(pref * .8, .1, 1.9); acs[2] = clamp(pref, .1, 1.9); acs[3] = clamp(pref * 1.25, .1, 1.9); acs[4] = clamp(pref * 1.6, .1, 1.9);
  var LCS = array<f32, 11>(-1.5, -1.05, -.6, -.35, -.15, 0., .15, .35, .6, 1.05, 1.5);
  var ACHI = array<f32, 3>(1.12, 1.5, 1.9);
  var SX: array<f32, 15>; var SE: array<f32, 15>; var SW: array<f32, 15>; var SD: array<f32, 15>; var SZ: array<f32, 15>; var SF: array<f32, 15>;
  var SK: array<f32, 15>; var SNX: array<f32, 15>; var SNZ: array<f32, 15>; var SB: array<f32, 15>; var SR: array<f32, 15>; var SA: array<bool, 15>; var SH: array<bool, 15>;
  for (var i = 1; i <= 14; i++) {
    let s = f32(i) / 14.; let xi = x0 + Lsx * s; let sl = czd(xi / SC); let il = inverseSqrt(1. + sl * sl);
    SX[i] = xi; SE[i] = popE(xi); SW[i] = WW(xi); SD[i] = DD(xi); SZ[i] = ZC(xi); SF[i] = FL(xi); SNX[i] = -sl * il; SNZ[i] = il; SB[i] = ss(0., BLE, s); SK[i] = max(fkz(xi / SC), fkz((xi + .6 * v) / SC));
    let rx = SW[i] * 1.3; SR[i] = min(GND(xi + SNX[i] * rx, SZ[i] + SNZ[i] * rx), GND(xi - SNX[i] * rx, SZ[i] - SNZ[i] * rx));
    let kk = nextArchK(xi - 40. * CS - 300. * SC); let na = AP_(kk); SA[i] = abs(na.x - xi) < na.Lt + 80. * CS; SH[i] = shd(xi / SC) * SC < 120. * CS + 420. * SC;
  }
  var shTg = -1.; var shUn = false;
  for (var i = 1; i <= 14; i++) { if (SH[i]) { let u = SX[i] / SC; let ys = shy(u) * SC; let th = sht(u) * SC;
    acs[5] = clamp((ys - 1.6 * th - SF[i]) / SD[i] - .1, .1, 1.9); acs[6] = clamp((ys + 1.5 * th - SF[i]) / SD[i] + .1, .1, 1.9); nac = 7; shTg = select(acs[6], acs[5], a0 < (ys - SF[i]) / SD[i]); shUn = a0 < (ys - SF[i]) / SD[i]; break; } }
  var fsd = sign(select(L0, (*pl1).x, abs((*pl1).x) > .05)); if (fsd == 0.) { fsd = 1.; }
  var bestC = 1e30; var bLc = 0.; var bac = .3; var bCmin = 0.; var bwmin = 0.; var bk = 0.; var bOut = 0.;
  var pts: array<vec3f, 15>;
  for (var li = 0; li < 11; li++) {
    let Lc = LCS[li]; let hi = abs(Lc) > .8; var nas = nac; if (hi) { nas = 3; }
    for (var ai = 0; ai < 7; ai++) {
      if (ai >= nas) { break; }
      var ac = acs[ai]; if (hi) { ac = ACHI[ai]; }
      var cost = HY * (abs(Lc - (*pl1).x) + HYA * abs(ac - (*pl1).y));
      if (hi && shUn) { cost += 150.; } /* решили под полку — над кромкой каньона не лезть */
      if (!hi) { cost += LCW * Lc * Lc + AW * (ac - pref) * (ac - pref); }
      var Cmin = 1e9; var wmin = 1e9; var kmax = 0.; var nOut = 0.;
      for (var i = 1; i <= 14; i++) {
        let s = f32(i) / 14.; let bl = SB[i]; let xi = SX[i]; let Li = L0 + (Lc - L0) * bl; let ai_ = a0 + (ac - a0) * bl; let wi = SW[i];
        let zi = SZ[i] + Li * wi; let yi = SF[i] + ai_ * SD[i]; let nx = SNX[i]; let nzz = SNZ[i];
        let ri = min(r, .42 * wi); let g0 = GND(xi, zi); let gl = GND(xi + nx * ri, zi + nzz * ri); let gr = GND(xi - nx * ri, zi - nzz * ri);
        let C = min(yi - g0, min(yi - gl, yi - gr));
        Cmin = min(Cmin, C); wmin = min(wmin, wi * (1. - .4 * SK[i]));
        if (shTg >= 0. && SH[i]) { cost += 4. * (1. - smoothstep(0., 500., shd(xi / SC))) * (ai_ - shTg) * (ai_ - shTg); }
        cost += 5. * SK[i] * (Li - fsd * .35) * (Li - fsd * .35);
        if (C < m) { let q = (m - C) / m; cost += q * q * COLW * (1.25 - s * .7); if (C < 0.) { cost += 1000.; } }
        if (SA[i] && archHit(vec3f(xi, yi, zi), 35. * CS)) { cost += ARW; if (archHit(vec3f(xi, yi, zi), 8. * CS)) { cost += 1000.; } }
        if (SH[i] && shelfHit(vec3f(xi, yi, zi), 35. * CS + .04 * v)) { cost += ARW; if (shelfHit(vec3f(xi, yi, zi), 8. * CS)) { cost += 1000.; } }
        let r2 = min(r * 2.4, .9 * wi); let gl2 = GND(xi + nx * r2, zi + nzz * r2); let gr2 = GND(xi - nx * r2, zi - nzz * r2);
        if (max(gl2, gr2) > yi) { cost += .5; }
        if (abs(Li) > 1.02 || yi > SR[i] - 30. * CS) { cost += OUTW * (1. - SE[i]); nOut += 1.; }
        pts[i] = vec3f(xi, yi, zi);
      }
      for (var i = 5; i <= 12; i++) {
        let A = pts[i - 1] - pts[i - 2]; let B = pts[i] - pts[i - 1]; let la = length(A); let lb = length(B); let ang = length(A / la - B / lb);
        kmax = max(kmax, ang / ((la + lb) / 2.));
      }
      cost += KW * min(2.5, kmax * 500. * SC);
      if (cost < bestC) { bestC = cost; bLc = Lc; bac = ac; bCmin = Cmin; bwmin = wmin; bk = kmax; bOut = nOut; }
    }
  }
  *pl1 = vec4f(bLc, bac, L0, a0);
  let vcap = VMAX * (.8 + .2 * sk); let outF = bOut / 14.;
  var vt = vcap * (1. - (1. - max(NF, min(1., sqrt(bwmin / (NW * SC))))) * (1. - E) * (1. - outF));
  if (bk > 1e-9) { vt = min(vt, sqrt(AMAX * AU * sk / bk)); }
  vt *= max(CF, min(1., CF + (1. - CF) * bCmin / (CWD * CS)));
  *pl2 = vec4f(x0, Lsx, max(vt, vcap * VF), tNow);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let id = gid.x; if (id >= U0.n) { return; }
  loadParams(id);
  var s0 = ST[id * 6u]; var s1 = ST[id * 6u + 1u]; var pl1 = ST[id * 6u + 2u]; var pl2 = ST[id * 6u + 3u]; var t0 = ST[id * 6u + 4u]; var t1 = ST[id * 6u + 5u];
  let dt = U0.dt;
  for (var it = 0u; it < U0.steps; it++) {
    var P = s0.xyz; var f = s1.xyz; var v = s0.w; let t = s1.w + dt; let Po = P;
    if (t - pl2.w > .05) { plan(P, v, &pl1, &pl2, t); }
    /* преследование точки плана */
    let UP = vec3f(0., 1., 0.); var r0 = cross(f, UP); if (dot(r0, r0) < 1e-8) { r0 = vec3f(1., 0., 0.); } else { r0 = normalize(r0); }
    let u0 = normalize(cross(r0, f));
    let vv = max(v, VMAX * .2); let Ld = max(LD * vv, 80. * CS); let xT = P.x + Ld * LDX;
    let s = max(0., (xT - pl2.x) / pl2.y); let bl = ss(0., BLE, min(1., s)); let L = pl1.z + (pl1.x - pl1.z) * bl; let a = pl1.w + (pl1.y - pl1.w) * bl;
    let tp = vec3f(xT, FL(xT) + a * DD(xT), ZC(xT) + L * WW(xT));
    var d = tp - P; d -= f * dot(d, f); let diff = tp - P;
    let L2 = max(Ld * Ld * .5, dot(diff, diff)); let aw = d * (2. / L2 * vv * vv);
    var ar = dot(aw, r0); var au = dot(aw, u0); var vt = pl2.z;
    if (length(vec2f(ar, au)) > 1.15 * AMAX) { vt = min(vt, max(VMAX * .5, v * .9)); } /* не вписываемся — тормоз */
    /* физика (Plane.step) */
    let mg = length(vec2f(ar, au)); if (mg > AMAX) { ar *= AMAX / mg; au *= AMAX / mg; }
    let vq = max(v, VMAX * .1); f += r0 * (ar * dt / vq) + u0 * (au * dt / vq);
    if (abs(f.y) > .96) { let k = sqrt((1. - .96 * .96) / (f.x * f.x + f.z * f.z + 1e-12)); f.x *= k; f.z *= k; f.y = sign(f.y) * .96; }
    f = normalize(f); let brk = select(BRK, BRK * 3., vt < v - .12 * VMAX); v += max(-brk * dt, min(ACC * dt, vt - v)); P += f * (v * dt); // воздушный тормоз
    /* падение → возврат назад в каньон */
    if (P.y < GND(P.x, P.z) + 2. * CS || archHit(P, 2. * CS) || shelfHit(P, 2. * CS)) {
      let x = P.x - 150. * CS - VMAX * .8; let ap = altPref(x); P = vec3f(x, FL(x) + ap * DD(x), ZC(x) + fko(x / SC) * SC); P.y = max(P.y, GND(x, P.z) + 60. * CS);
      if (shd(x / SC) * SC < 300. * CS + 420. * SC) { let ys = shy(x / SC) * SC; let th = sht(x / SC) * SC; if (P.y > ys - 1.6 * th - 60. * CS && P.y < ys + 1.5 * th + 60. * CS) { P.y = (FL(x) + ys - 1.6 * th) / 2.; } } f = normalize(vec3f(1., 0., czd(x / SC))); v = VMAX * .5; pl2.w = -1e9;
    }
    /* статистика */
    let crashed = P.x < Po.x - 1.;
    if (crashed) { t0.x += 1.; t1.x = nextArchK(P.x); }
    else {
      var k = t1.x; for (var i = 0; i < 3; i++) { if (P.x > AX(k)) { k += 1.; } }
      if (k != t1.x) { let ar_ = AP_(t1.x); t1.y += 1.; if (P.y < ar_.fl + ar_.yc) { t1.z += 1.; } t1.x = k; }
    }
    t0.y += v; t0.z += 1.;
    let x = P.x; let sl = czd(x / SC); let isl = inverseSqrt(1. + sl * sl); let rx = WW(x) * 1.3; let zc = ZC(x);
    let rim = min(GND(x - sl * isl * rx, zc + isl * rx), GND(x + sl * isl * rx, zc - isl * rx)); if (P.y > rim) { t0.w += dt; }
    t1.w += min(1., max(0., (P.y - GND(P.x, P.z)) / DD(x)));
    s0 = vec4f(P, v); s1 = vec4f(f, t);
  }
  ST[id * 6u] = s0; ST[id * 6u + 1u] = s1; ST[id * 6u + 2u] = pl1; ST[id * 6u + 3u] = pl2; ST[id * 6u + 4u] = t0; ST[id * 6u + 5u] = t1;
}
`;

/* Возвращает { name, create(params, state, n) } или null, если WebGPU недоступен. */
export async function initWebGPU() {
  if (!navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return null;
  const dev = await adapter.requestDevice();
  let lost = null; dev.lost.then(i => { lost = i.message || i.reason || "устройство потеряно"; });
  dev.pushErrorScope("validation");
  const mod = dev.createShaderModule({ code: WGSL });
  const info = await mod.getCompilationInfo();
  const errs = info.messages.filter(m => m.type === "error");
  if (errs.length) throw new Error("WGSL: " + errs.slice(0, 3).map(m => `строка ${m.lineNum}: ${m.message}`).join(" | "));
  const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: mod, entryPoint: "main" } });
  const err0 = await dev.popErrorScope(); if (err0) throw new Error("WebGPU: " + err0.message);
  const ai = adapter.info || {};
  const name = [ai.vendor, ai.architecture, ai.device, ai.description].filter(Boolean).join(" ") || "WebGPU";
  return {
    name,
    create(params, state, n) {
      const mk = (data, usage) => { const b = dev.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST }); dev.queue.writeBuffer(b, 0, data); return b; };
      const ubuf = dev.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const pbuf = mk(params, GPUBufferUsage.STORAGE), sbuf = mk(state, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const rbuf = dev.createBuffer({ size: state.byteLength, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: { buffer: pbuf } }, { binding: 2, resource: { buffer: sbuf } }] });
      const ub = new ArrayBuffer(16), dv = new DataView(ub);
      return {
        /* посчитать k шагов; вернуть, когда видеокарта закончила */
        async step(k, dt) {
          if (lost) throw new Error("видеокарта сброшена системой: " + lost);
          dv.setFloat32(0, dt, true); dv.setUint32(4, k, true); dv.setUint32(8, n, true); dev.queue.writeBuffer(ubuf, 0, ub);
          const enc = dev.createCommandEncoder(), pass = enc.beginComputePass();
          pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(Math.ceil(n / 64)); pass.end();
          dev.queue.submit([enc.finish()]); await dev.queue.onSubmittedWorkDone();
          if (lost) throw new Error("видеокарта сброшена системой: " + lost);
        },
        async read() {
          const enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(sbuf, 0, rbuf, 0, state.byteLength); dev.queue.submit([enc.finish()]);
          await rbuf.mapAsync(GPUMapMode.READ); const out = new Float32Array(rbuf.getMappedRange().slice(0)); rbuf.unmap(); return out;
        },
        destroy() { ubuf.destroy(); pbuf.destroy(); sbuf.destroy(); rbuf.destroy(); },
      };
    },
  };
}
