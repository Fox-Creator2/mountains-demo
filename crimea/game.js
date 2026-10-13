/* «Конфликт в Криму»: синие бомбардировщики против красной ПВО. Раунды по кругу, каждый раз новая карта (world.js). */
import * as THREE from "three";
import { genWorld, threatMap, planRoute, losClear, rng } from "./world.js";

const $ = id => document.getElementById(id);
const KEY = "crimea-settings-v1";
const S = Object.assign({ diff: 1, wing: 3, agl: 60, resume: 3, life: 1, q: 2, inv: 0, cam: 0, seed: 0 }, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })());
const saveS = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
let rnd = Math.random; const seedRnd = n => { rnd = rng(n); };
const UP = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4();
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/* ---------- параметры ---------- */
const PL = { AMAX: 60, VMAX: 300, CRU: 235, ACC: 14, BRK: 28, HP: 5 };          // бомбардировщик: ~6g, 1080 км/ч
const DIFF = [{ reload: 8, decoy: .65, mg: 220, aaaRate: .6, spread: 1.5, notch: 60 }, { reload: 7, decoy: .6, mg: 250, aaaRate: .45, spread: 1.15, notch: 45 }, { reload: 4, decoy: .4, mg: 320, aaaRate: .3, spread: .9, notch: 30 }];
const D = () => DIFF[+S.diff] || DIFF[1];

let W = null, G = null, TM = null, tNow = 0;
const STATS = { rounds: 0, wins: 0, losses: 0, planesLost: 0, defKilled: 0 };

/* ================= раунд ================= */
function newRound(seed) {
  if (seed == null) seed = (S.seed || 1) + 1; S.seed = seed; saveS();
  seedRnd(seed * 7 + 3);
  W = genWorld(seed);
  if (+S.diff === 2) addSams(W, 2); if (+S.diff === 0) W.sams = W.sams.slice(0, Math.max(1, W.sams.length - 1));
  W.aaa = W.aaa.slice(+S.diff === 2 ? 0 : +S.diff === 1 ? 1 : 2); // первые три — у цели: на обычной ПВО их две, на слабой одна
  TM = threatMap(W, +S.agl || 60);
  G = { seed, t: 0, bombers: [], missiles: [], shells: [], bursts: [], bombs: [], flares: [], fx: [], fires: [], debris: [], sched: [], done: false, endT: 0, success: false, me: 0, msg: [], causes: {} };
  tNow = 0;
  const tg = W.target, ang0 = Math.atan2(W.start.z - tg.z, W.start.x - tg.x), n = +S.wing || 3, dir = Math.atan2(tg.z - W.start.z, tg.x - W.start.x);
  for (let i = 0; i < n; i++) {
    const sector = ang0 + (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * .85);
    const back = i * 1500, side = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 500;
    const x = W.start.x - Math.cos(dir) * back - Math.sin(dir) * side, z = W.start.z - Math.sin(dir) * back + Math.cos(dir) * side;
    const b = { id: i, pos: new THREE.Vector3(x, (+S.agl || 60) + 20, z), f: new THREE.Vector3(Math.cos(dir), 0, Math.sin(dir)), v: PL.CRU, roll: 0, rollV: 0, ar: 0, au: 0,
      hp: PL.HP, alive: true, falling: false, bombs: 6, flares: 8, mode: "ingress", sector, route: null, ri: 0, rel: 0, relT: 0, evT: 0, flT: -9, r0: new THREE.Vector3(), u0: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), tracked: 0, safe: false };
    planIngress(b); G.bombers.push(b);
  }
  STATS.rounds++;
  if (renderer) buildScene();
  ctl.steerMan = false; ctl.spdMan = false;
  toast(`Раунд ${STATS.rounds}: ${tg.name}`, 2600);
}
function addSams(w, k) { const r = rng(w.seed * 13 + 1); for (let t = 0; t < 3000 && k > 0; t++) { const x = 2000 + r() * (w.W - 4000), z = 2000 + r() * (w.H - 4000); if (w.isSea(x, z) || w.gnd(x, z) < 5) continue; if (w.sams.some(s => Math.hypot(s.x - x, s.z - z) < 5000)) continue; w.sams.push({ x, z, y: w.gnd(x, z), R: 12000, Rr: 22000, ammo: 6, next: 0, kind: "sam", hd: r() * 6 }); k--; } }
function planIngress(b) {
  const tg = W.target, sec = b.sector;
  b.route = planRoute(W, TM, { x: b.pos.x, z: b.pos.z }, (x, z) => { const d = Math.hypot(x - tg.x, z - tg.z); if (d < 3600 || d > 5200) return false; const a = Math.atan2(z - tg.z, x - tg.x); return Math.abs(wrap(a - sec)) < .75; }, .5, G.seed * 31 + b.id)
    || planRoute(W, TM, { x: b.pos.x, z: b.pos.z }, (x, z) => Math.hypot(x - tg.x, z - tg.z) < 5200, .3, b.id) || [[b.pos.x, b.pos.z], [tg.x, tg.z]];
  b.ri = 0; b.mode = "ingress";
}
function planEgress(b) {
  const r = planRoute(W, TM, { x: b.pos.x, z: b.pos.z }, (x, z) => W.isSea(x, z) && W.at(W.dOut, x, z) > 3000 && !W.ships.some(s => !s.dead && s.kind === "frigate" && Math.hypot(s.x - x, s.z - z) < 9000), .3, b.id + 99);
  b.route = r || [[b.pos.x, b.pos.z], [W.start.x, W.start.z]]; b.ri = 0; b.mode = "egress";
}

/* ================= полёт ================= */
function basis(b) { b.r0.crossVectors(b.f, UP); if (b.r0.lengthSq() < 1e-8) b.r0.set(1, 0, 0); b.r0.normalize(); b.u0.crossVectors(b.r0, b.f).normalize();
  const c = Math.cos(b.roll), s = Math.sin(b.roll); b.r.copy(b.r0).multiplyScalar(c).addScaledVector(b.u0, -s); b.u.copy(b.u0).multiplyScalar(c).addScaledVector(b.r0, s); }
function stepPlane(b, dt, ar, au, vt) {
  basis(b); const m = Math.hypot(ar, au); if (m > PL.AMAX) { ar *= PL.AMAX / m; au *= PL.AMAX / m; } b.ar = ar; b.au = au;
  const vv = Math.max(b.v, 80); b.f.addScaledVector(b.r0, ar * dt / vv).addScaledVector(b.u0, au * dt / vv);
  if (Math.abs(b.f.y) > .85) { const k = Math.sqrt((1 - .85 * .85) / (b.f.x * b.f.x + b.f.z * b.f.z + 1e-12)); b.f.x *= k; b.f.z *= k; b.f.y = Math.sign(b.f.y) * .85; }
  b.f.normalize(); b.v += clamp(vt - b.v, -PL.BRK * dt, PL.ACC * dt); b.pos.addScaledVector(b.f, b.v * dt);
  const rt = clamp(Math.atan2(ar, 9.81 + Math.max(0, au) * .3), -1.35, 1.35);
  for (let k = 0, h = dt / 2; k < 2; k++) { b.rollV += (100 * (rt - b.roll) - 17 * b.rollV) * h; b.roll += b.rollV * h; }
  basis(b);
}
const agl = p => p.y - Math.max(0, W.gnd(p.x, p.z));
/* точка падения бомбы, сброшенной сейчас (баллистика с небольшим сопротивлением) */
function impact(p, v) { let x = p.x, y = p.y, z = p.z, vx = v.x, vy = v.y, vz = v.z; const dt = .05;
  for (let i = 0; i < 800; i++) { vy -= 9.81 * dt; const k = 1 - .015 * dt; vx *= k; vy *= k; vz *= k; x += vx * dt; y += vy * dt; z += vz * dt; if (y < Math.max(0, W.gnd(x, z))) break; }
  return _c.set(x, y, z); }

/* автопилот бомбардировщика → [ar, au, vt] */
function aiBomber(b, dt) {
  const p = b.pos, tg = W.target, v = Math.max(b.v, 120), ALT = +S.agl || 60;
  const dTg = Math.hypot(tg.x - p.x, tg.z - p.z), psi = Math.atan2(b.f.z, b.f.x), gam = Math.asin(clamp(b.f.y, -1, 1));
  let psiD = psi, yT = p.y, vt = PL.CRU, gDive = null;
  /* ракета летит в нас: ловушки и резкий отворот с уходом вниз к земле */
  const thr = G.missiles.find(m => m.alive && m.tgt === b && !m.decoy && m.pos.distanceTo(p) < 1300);
  if (thr && tNow - b.flT > 1.3 && b.flares > 0 && thr.pos.distanceTo(p) < 1800) dropFlares(b); // ловушки — когда ракета близко (дальше её не обмануть)
  if (thr && b.evT < tNow && b.mode !== "dive" && b.mode !== "popup" && b.mode !== "release") { b.evT = tNow + 3; const s = thr.src, br = Math.atan2(s.z - p.z, s.x - p.x); b.evPsi = [br + Math.PI / 2, br - Math.PI / 2].sort((x, y) => Math.abs(wrap(x - psi)) - Math.abs(wrap(y - psi)))[0]; }
  /* фазы: маршрут → горка → пикирование и сброс → уход к морю */
  if (b.mode === "ingress" && (b.ri >= b.route.length - 1 || dTg < 4300) && b.bombs > 0 && !G.success) b.mode = "popup";
  if (b.mode === "ingress" && G.success) planEgress(b);
  if ((b.mode === "popup" || b.mode === "dive") && G.success) planEgress(b);
  if (b.mode === "popup" && (dTg < 2600 || (agl(p) > 330 && dTg < 3600))) b.mode = "dive";
  if (b.mode === "dive" || b.mode === "popup") {
    /* точка прицеливания: уцелевшая часть цели; ведомые берут разные части */
    const alive = tg.parts.filter(q => q.hp > 0); let ap = b.aimP; if (!ap || ap.hp <= 0) ap = b.aimP = alive.length ? alive[(b.id * 3 + (b.reN || 0)) % alive.length] : tg.parts[0];
    const ax = ap.x, az = ap.z, dA = Math.hypot(ax - p.x, az - p.z), tgy = ap.y + 4; psiD = Math.atan2(az - p.z, ax - p.x);
    if (b.mode === "popup") { yT = Math.max(tgy, Math.max(0, W.gnd(p.x, p.z))) + 380; vt = 270; }
    else {
      const I = impact(p, _a.copy(b.f).multiplyScalar(b.v)), ex = I.x - ax, ez = I.z - az, fx = Math.cos(psi), fz = Math.sin(psi), along = ex * fx + ez * fz, cross = -ex * fz + ez * fx;
      psiD -= clamp(1.5 * cross / Math.max(dA, 400), -.45, .45);
      /* линия прицеливания — выше цели на величину падения бомбы за оставшееся время полёта */
      const tf = dA / Math.max(v, 150), hA = .5 * 9.81 * tf * tf * .92; gDive = Math.atan2(tgy + hA - p.y, Math.max(dA, 300)); vt = 260;
      b.dbg = [Math.round(along), Math.round(cross), Math.round(dA), +gam.toFixed(2)];
      if (along > -32 && along < 60 && Math.abs(cross) < 28 && b.bombs > 0 && dA < 2600) { b.mode = "release"; b.relT = tNow; b.relG = gam; }
      if (dA < 200 || (along > 60 && dA < 1600) || Math.abs(wrap(Math.atan2(az - p.z, ax - p.x) - psi)) > 1.7) { b.mode = "missed"; b.reN = (b.reN || 0) + 1; b.aimP = null; (G.miss ??= []).push([Math.round(along), Math.round(cross), Math.round(dTg)]); }
    }
  }
  if (b.mode === "release") { psiD = psi; gDive = b.relG; vt = b.v; // серия: держать угол пикирования, бомбы ложатся с шагом ~20 м
    if (b.bombs > 0 && tNow - b.relT >= b.rel * .1) { dropBomb(b); b.rel++; } if (b.bombs <= 0) { b.rel = 0; b.pullT = tNow; b.mode = "break"; } }
  /* после сброса: резкий отворот прочь от цели и вниз к земле, потом маршрут к морю */
  if (b.mode === "break") { if (b.brPsi == null) { const bt = Math.atan2(tg.z - p.z, tg.x - p.x), toS = Math.atan2(W.start.z - p.z, W.start.x - p.x); b.brPsi = bt + (wrap(toS - bt) > 0 ? 1 : -1) * 1.75; } psiD = b.brPsi; yT = Math.max(0, W.gnd(p.x + b.f.x * v * 2, p.z + b.f.z * v * 2)) + ALT; vt = PL.VMAX; if (tNow - b.pullT > 6) { b.brPsi = null; planEgress(b); } }
  if (b.mode === "missed") { b.rel = 0; if (b.bombs > 0 && !G.success) { // повторный заход: отойти на 6 км по курсу, потом снова к рубежу атаки
      const x = clamp(p.x + Math.cos(psi) * 6000, 1000, W.W - 1000), z = clamp(p.z + Math.sin(psi) * 6000, 1000, W.H - 1000); b.route = [[p.x, p.z], [x, z]]; b.ri = 0; b.mode = "outbound"; } else planEgress(b); }
  if (b.mode === "outbound" && (b.ri >= b.route.length - 1 && Math.hypot(b.route[1][0] - p.x, b.route[1][1] - p.z) < 1500)) planIngress(b);
  if (b.mode === "ingress" || b.mode === "egress" || b.mode === "outbound") {
    const R = b.route, L = Math.max(700, v * 2.4);
    while (b.ri < R.length - 1 && Math.hypot(R[b.ri][0] - p.x, R[b.ri][1] - p.z) < L) b.ri++;
    const q = R[b.ri]; psiD = Math.atan2(q[1] - p.z, q[0] - p.x);
    /* огибание рельефа: максимум высоты земли по маршруту на ~3 с вперёд + заданная высота */
    let gmax = Math.max(0, W.gnd(p.x, p.z));
    for (let k = 1; k <= 10; k++) { const d = v * .32 * k, a = psi + clamp(wrap(psiD - psi), -.6, .6) * k / 10; gmax = Math.max(gmax, W.gnd(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d) - k * 6); }
    yT = gmax + ALT; vt = b.mode === "egress" ? PL.VMAX : PL.CRU;
    if (b.mode === "egress" && b.ri >= R.length - 1) { b.safe = true; }
  }
  if (b.evT > tNow && (b.mode === "dive" || b.mode === "popup")) b.evT = 0; // в атаке не отворачивать — только ловушки
  if (b.evT > tNow) { psiD = b.evPsi; yT = Math.min(yT, Math.max(0, W.gnd(p.x, p.z)) + 40); vt = PL.VMAX; gDive = null; } // уход поперёк луча радара и вниз, к земле
  /* боковая перегрузка — по ошибке курса, вертикальная — по углу наклона траектории */
  let ar = clamp(wrap(psiD - psi), -1.2, 1.2) * v * 1.5;
  let gD = gDive != null && b.evT <= tNow ? clamp(gDive, -.6, .3) : clamp(Math.atan2(yT - p.y, Math.max(500, v * 2.2)), -.32, .55);
  /* запас по рельефу: какой угол набора нужен, чтобы пройти над всеми гребнями на ~6 с вперёд (по курсу и в сторону поворота) */
  const amin = Math.min(ALT, 40); let greq = -1;
  for (const da of [0, clamp(wrap(psiD - psi), -.8, .8)]) { const a = psi + da; for (let k = 1; k <= 14; k++) { const d = 120 + v * .45 * k; greq = Math.max(greq, Math.atan2(Math.max(0, W.gnd(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d)) + amin - p.y, d)); } }
  if (b.mode !== "release") gD = Math.max(gD, Math.min(.8, greq + .06));
  let au = (gD - gam) * v * 2.6;
  /* защита от земли: если по курсу через 2.5 с рельеф выше нас — тянуть вверх */
  const kmx = clamp(Math.ceil((Math.max(0, -gam) * v / PL.AMAX + .9) / .45), 2, 6); // горизонт — сколько нужно на вывод из текущего снижения
  for (let k = 1; k <= kmx; k++) { const d = v * .45 * k, x = p.x + b.f.x * d, z = p.z + b.f.z * d, y = p.y + b.f.y * d; if (y < Math.max(0, W.gnd(x, z)) + 18) { au = Math.max(au, PL.AMAX * (k <= 4 ? 1 : .75)); ar *= .3; break; } }
  return [ar, au, vt];
}

/* ---------- оружие синих ---------- */
function dropBomb(b) { if (b.bombs <= 0) return; b.bombs--; G.bombs.push({ pos: b.pos.clone().addScaledVector(b.u0, -2.5), vel: b.f.clone().multiplyScalar(b.v), owner: b, mesh: null, t: 0 }); }
function dropFlares(b) { if (b.flares <= 0) return; b.flares--; b.flT = tNow;
  for (const s of [-1, 0, 1]) G.flares.push({ pos: b.pos.clone().addScaledVector(b.u0, -2), vel: b.f.clone().multiplyScalar(b.v * .97).addScaledVector(b.r0, s * 24).add(_a.set(0, s ? -8 : -26, 0)), t0: tNow, mesh: null, trT: 0 });
  for (const m of G.missiles) if (m.alive && m.tgt === b && !m.decoy && m.pos.distanceTo(b.pos) < 3200 && rnd() < D().decoy) { m.decoy = G.flares[G.flares.length - 1]; }
}

/* ---------- красные: ЗРК, корабли, зенитки ---------- */
function radarSees(px, py, pz, sx, sy, sz, R) {
  const d = Math.hypot(px - sx, pz - sz); if (d > R) return false;
  if (agl(_a.set(px, py, pz)) < 35 && d > 4500) return false; // у самой земли — в «засветке» от рельефа
  return losClear(W, sx, sy, sz, px, py, pz, 120);
}
function defenseStep(dt) {
  const dif = D(), live = G.bombers.filter(b => b.alive && !b.falling);
  const shooters = [...W.sams.map(s => ({ s, h: 18 })), ...W.ships.filter(s => s.kind === "frigate").map(s => ({ s, h: 25 }))];
  for (const { s, h } of shooters) { if (s.dead || s.ammo <= 0) continue;
    if (tNow < (s.scanT || 0)) continue; s.scanT = tNow + .4; s.lock = null; let best = null;
    for (const b of live) { const d = Math.hypot(b.pos.x - s.x, b.pos.z - s.z); if (!radarSees(b.pos.x, b.pos.y, b.pos.z, s.x, s.y + h, s.z, s.Rr)) continue; b.tracked = tNow + .6; if (d < s.R && (!best || d < best.d)) best = { b, d }; }
    if (best) { s.lock = best.b; const inAir = G.missiles.filter(m => m.alive && m.src === s).length;
      if (tNow >= s.next && inAir < 2) { s.next = tNow + dif.reload * (.8 + .4 * rnd()); s.ammo--; launchMissile(s, h, best.b); } } }
  /* зенитки: разрывы в точке упреждения с разбросом */
  const guns = [...W.aaa, ...W.ships];
  for (const A of guns) { if (A.dead) continue; const R = A.R || 3200, ay = (A.y || 0) + 6;
    let tgt = null, bd = 1e9; for (const b of live) { const d = b.pos.distanceTo(_a.set(A.x, ay, A.z)); if (d < Math.min(R, 2300) && d < bd) { bd = d; tgt = b; } }
    A.tg = tgt; if (!tgt) continue;
    const vs = 1050, tt = bd / vs, P = _b.copy(tgt.pos).addScaledVector(tgt.f, tgt.v * tt);
    A.yaw = Math.atan2(P.x - A.x, P.z - A.z); A.pitch = Math.atan2(P.y - ay, Math.hypot(P.x - A.x, P.z - A.z));
    if (tNow < (A.next || 0)) continue; A.next = tNow + dif.aaaRate * (.7 + .6 * rnd());
    if (!losClear(W, A.x, ay, A.z, P.x, P.y, P.z, 90)) continue;
    const sp = 45 * dif.spread * (bd / 2000 + .35); P.x += (rnd() - .5) * 2 * sp; P.y += (rnd() - .5) * 1.4 * sp; P.z += (rnd() - .5) * 2 * sp;
    G.shells.push({ from: new THREE.Vector3(A.x, ay, A.z), to: P.clone(), t0: tNow, tb: tNow + tt, mesh: null }); A.recoil = 1; startAdCam(A, tgt, "Плотный огонь зениток", 1); }
}
/* камера «от лица ПВО»: когда оно открывает огонь по нашему борту — на ~3 с кадр от позиции ЗРК/зенитки с длиннофокусным обзором */
function startAdCam(src, tgt, txt, w = 1) { G.heat = (G.heat || 0) + w; /* «накал» огня: пуск ракеты весит 6, залп зениток по 1; решает суммарная плотность за ~2.5 с */
  if (G.heat < 6 || ctl.steerMan || tNow < (G.adCool || 0) || (G.impactCam && tNow < G.impactCam.until) || G.done || !tgt.alive || tgt.falling) return;
  G.adCam = { src, tgt, t0: tNow, until: tNow + (src.kind === "sam" || src.kind === "frigate" ? 4 : 4), m: src.kind === "sam" || src.kind === "frigate" ? G.missiles[G.missiles.length - 1] : null }; G.adCool = tNow + 10; G.heat = 0; toast(txt, 1800); }
function launchMissile(s, h, b) {
  const pos = new THREE.Vector3(s.x, s.y + h, s.z), dir = new THREE.Vector3().subVectors(b.pos, pos).normalize(); dir.y = Math.max(dir.y, .5); dir.normalize();
  G.missiles.push({ pos, vel: dir.multiplyScalar(60), src: s, srcH: h, tgt: b, t0: tNow, alive: true, decoy: null, lostT: 0, trail: [], mesh: null, lineMesh: null });
  if (b.id === G.me) warnT = tNow + 1.5;
  startAdCam(s, b, "ПВО: пуск ракеты — смотрим от расчёта", 6);
}
function missilesStep(dt) {
  const dif = D();
  for (const m of G.missiles) { if (!m.alive) continue; const age = tNow - m.t0, spd = m.vel.length();
    const tp = m.decoy ? m.decoy.pos : m.tgt.pos, tv = m.decoy ? m.decoy.vel : _b.copy(m.tgt.f).multiplyScalar(m.tgt.v);
    // полуактивное наведение: радар должен «видеть» цель, иначе ракета летит по инерции
    if (!m.decoy && age > .5) { const s = m.src, T = m.tgt;
      /* «провал» доплеровского радара: цель идёт поперёк луча у земли — радар её теряет */
      const rx = T.pos.x - s.x, rz = T.pos.z - s.z, rl = Math.hypot(rx, rz) || 1, radial = Math.abs((T.f.x * rx + T.f.z * rz) / rl) * T.v, notch = radial < dif.notch && agl(T.pos) < 200;
      if (s.dead || notch || !radarSees(T.pos.x, T.pos.y, T.pos.z, s.x, s.y + m.srcH, s.z, s.Rr * 1.1)) m.lostT += dt; else m.lostT = Math.max(0, m.lostT - dt * .5); }
    if (age > .6 && m.lostT < 1.2 && !(m.tgt.falling && !m.decoy)) {
      const R = _a.subVectors(tp, m.pos), tgo = R.length() / Math.max(spd, 300); m.nz ??= new THREE.Vector3((rnd() - .5) * 30, (rnd() - .5) * 20, (rnd() - .5) * 30); const aim = R.addScaledVector(tv, tgo * .9).add(m.nz).normalize();
      const cur = _b.copy(m.vel).normalize(), ang = Math.acos(clamp(cur.dot(aim), -1, 1)), maxT = dif.mg * dt / Math.max(spd, 100);
      if (ang > 1e-4) { cur.lerp(aim, Math.min(1, maxT / ang)).normalize(); m.vel.copy(cur).multiplyScalar(spd); }
    }
    const thrust = age < 4.5 ? 260 : -25; let ns = clamp(spd + thrust * dt, 0, 1050); m.vel.setLength(ns); if (age > 4.5) m.vel.y -= 9.81 * dt;
    const prev = m.pos.clone(); m.pos.addScaledVector(m.vel, dt);
    // неконтактный взрыватель: ближайшее сближение за шаг
    const tgts = m.decoy ? [] : [m.tgt];
    for (const b of tgts) { if (!b.alive || b.falling) continue; const seg = _a.subVectors(m.pos, prev), w = _b.subVectors(b.pos, prev), u = clamp(w.dot(seg) / Math.max(seg.lengthSq(), 1e-6), 0, 1), d = w.sub(seg.multiplyScalar(u)).length();
      if (d < 22) { m.alive = false; boom(m.pos, 16, 0xffb060); if (d < 10) hitBomber(b, 4, "ракета ЗРК"); else hitBomber(b, d < 18 ? 2 : 1, "осколки ракеты"); } }
    if (m.alive && m.decoy && m.pos.distanceTo(m.decoy.pos) < 25) { m.alive = false; boom(m.pos, 12, 0xffb060); }
    if (m.alive && (m.pos.y < Math.max(0, W.gnd(m.pos.x, m.pos.z)) || age > 22 || (age > 6 && ns < 260))) { m.alive = false; boom(m.pos, 12, 0xffa050); }
  }
  G.missiles = G.missiles.filter(m => m.alive || (m.lineMesh && tNow - (m.deadT ??= tNow) < 3) || (!m.lineMesh && false));
}
function hitBomber(b, dmg, why) {
  if (!b.alive || b.falling) return; b.hp -= dmg; const hk = why[0] + ":" + b.mode; (G.hitModes ??= {})[hk] = (G.hitModes[hk] || 0) + 1; if (b.id === G.me) flash(.35);
  if (b.hp <= 0) { b.falling = true; b.fallT = tNow; G.causes[why] = (G.causes[why] || 0) + 1; STATS.planesLost++; G.msg.push(`Борт ${b.id + 1} сбит: ${why}`); if (b.id === G.me) toast(`Сбит: ${why}`, 1600); }
}
function shellsStep(dt, prevPos) {
  for (const sh of G.shells) if (!sh.done && tNow >= sh.tb) { sh.done = true; if (sh.to.y > Math.max(0, W.gnd(sh.to.x, sh.to.z))) G.bursts.push({ pos: sh.to, t0: tNow, r: 11, mesh: null }); }
  G.shells = G.shells.filter(sh => !sh.done || (sh.mesh && (sh.mesh.parent?.remove(sh.mesh), false)));
  for (const b of G.bombers) { if (!b.alive || b.falling) continue; const pp = prevPos.get(b); if (!pp) continue;
    for (const B of G.bursts) { if (tNow - B.t0 > .3 || B.hitSet?.has(b)) continue; const seg = _a.subVectors(b.pos, pp), w = _b.subVectors(B.pos, pp), u = clamp(w.dot(seg) / Math.max(seg.lengthSq(), 1e-6), 0, 1), d = w.sub(seg.multiplyScalar(u)).length();
      if (d < B.r) { (B.hitSet ??= new Set()).add(b); hitBomber(b, 1, "зенитная артиллерия"); } } }
}
function bombsStep(dt) {
  for (const B of G.bombs) { if (B.done) continue; B.t += dt; B.vel.y -= 9.81 * dt; B.vel.multiplyScalar(1 - .015 * dt); B.pos.addScaledVector(B.vel, dt);
    /* за ~3 с до падения бомбы камера уходит на точку падения, чтобы увидеть разрыв */
    if (B.owner.id === G.me && !B.owner.falling && !(G.impactCam && tNow < G.impactCam.until) && !ctl.steerMan) { const h = B.pos.y - Math.max(0, W.gnd(B.pos.x, B.pos.z)), tti = (B.vel.y + Math.sqrt(B.vel.y * B.vel.y + 19.62 * Math.max(0, h))) / 9.81;
      if (tti < 4.6) { const lx = B.pos.x + B.vel.x * tti, lz = B.pos.z + B.vel.z * tti, o = B.owner; G.impactCam = { x: lx, y: Math.max(0, W.gnd(lx, lz)), z: lz, t0: tNow, hit: tNow + tti, until: tNow + tti + 1, kills: 0, bomb: B,
        cp: new THREE.Vector3(lx, 0, lz).addScaledVector(_b.copy(o.f).setY(0).normalize(), -330).addScaledVector(o.r0, 90) }; G.adCam = null; } }
    const gy = Math.max(0, W.gnd(B.pos.x, B.pos.z)); if (B.pos.y > gy) continue;
    B.done = true; B.pos.y = gy; const water = gy <= 0 && W.isSea(B.pos.x, B.pos.z); boom(B.pos, water ? 34 : 52, water ? 0xd8eaff : 0xffa040, water);
    { const ap = B.owner.aimP; (G.imp ??= []).push(ap ? Math.round(Math.hypot(ap.x - B.pos.x, ap.z - B.pos.z)) : -1); }
    const R = 48; let hitN = 0, dMin = 1e9; for (const p of W.target.parts) { const d = Math.hypot(p.x - B.pos.x, p.z - B.pos.z); dMin = Math.min(dMin, d); if (p.hp <= 0) continue; if (W.target.type === "ship" ? d < 45 : d < R + p.sz * .4) { p.hp = 0; hitN++; G.fires.push({ x: p.x, y: p.y + 6, z: p.z, t0: tNow, big: true }); boom(_a.set(p.x, p.y + 8, p.z), 70, 0xff9030, false); } }
    /* показать результат: камера на месте попадания и подпись */
    if (B.owner.id === G.me && !B.owner.falling) { const ic = G.impactCam; const o = B.owner;
      if (!ic || tNow > ic.until) G.impactCam = { x: B.pos.x, y: B.pos.y, z: B.pos.z, t0: tNow, hit: tNow, until: tNow + 1, cp: new THREE.Vector3(B.pos.x, 0, B.pos.z).addScaledVector(_b.copy(o.f).setY(0).normalize(), -330).addScaledVector(o.r0, 90), kills: 0 };
      else { ic.x = B.pos.x; ic.y = B.pos.y; ic.z = B.pos.z; ic.until = tNow + 1; }
      G.impactCam.kills += hitN; G.hitMsg = { t: tNow, txt: G.impactCam.kills ? `Попадание! Разрушено частей цели: ${W.target.parts.filter(q => q.hp <= 0).length + 0} из ${W.target.parts.length}` : dMin < 160 ? "Близкий разрыв — цель цела" : "Мимо" }; }
    for (const L of [W.sams, W.aaa, W.ships]) for (const s of L) if (!s.dead && Math.hypot(s.x - B.pos.x, s.z - B.pos.z) < (s.kind === "frigate" ? 50 : 40)) { if (s.hp > 1) s.hp--; else { s.dead = true; STATS.defKilled++; G.fires.push({ x: s.x, y: (s.y || 0) + 4, z: s.z, t0: tNow }); } }
    const tg = W.target, killed = tg.parts.filter(p => p.hp <= 0).length;
    if (!G.success && killed >= tg.need) { G.success = true; G.succT = tNow; toast(`Цель поражена: ${tg.name}`, 2600); }
  }
  G.bombs = G.bombs.filter(B => !B.done || (B.mesh && (B.mesh.parent?.remove(B.mesh), false)));
}

/* ================= шаг симуляции ================= */
let warnT = 0;
function simStep(dt) {
  if (!G) return; tNow += dt; G.t = tNow; G.heat = (G.heat || 0) * Math.exp(-dt / 2.5);
  const prevPos = new Map();
  for (const b of G.bombers) { if (!b.alive) continue; prevPos.set(b, b.pos.clone());
    if (b.falling) { // подбит: падает, крутится, дымит
      b.f.y = Math.max(-.85, b.f.y - dt * .35); b.f.normalize(); b.v = Math.max(140, b.v - 10 * dt); b.roll += dt * 3.5; b.pos.addScaledVector(b.f, b.v * dt); basis(b);
      if (b.pos.y < Math.max(0, W.gnd(b.pos.x, b.pos.z)) + 2) { b.alive = false; b.deadT = tNow; const sea = W.isSea(b.pos.x, b.pos.z); crashFx(b.pos, b, sea); if (!W.isSea(b.pos.x, b.pos.z)) G.fires.push({ x: b.pos.x, y: b.pos.y, z: b.pos.z, t0: tNow }); }
      continue; }
    let c = aiBomber(b, dt);
    if (b.id === G.me) c = playerControl(b, c);
    stepPlane(b, dt, c[0], c[1], c[2]);
    (b.hist ??= []).push([+tNow.toFixed(2), b.mode, Math.round(agl(b.pos)), +Math.asin(b.f.y).toFixed(2), Math.round(c[0]), Math.round(c[1]), b.evT > tNow ? 'EV' : '', Math.round(b.v)]); if (b.hist.length > 240) b.hist.shift();
    if (b.pos.y < Math.max(0, W.gnd(b.pos.x, b.pos.z)) + 1.5) { b.hp = 0; b.falling = true; b.alive = false; b.fallT = b.deadT = tNow; G.causes["столкновение с рельефом"] = (G.causes["столкновение с рельефом"] || 0) + 1; (G.crashLog ??= []).push(b.hist.filter((_, i) => i % 12 === 0 || i > b.hist.length - 4)); STATS.planesLost++; crashFx(b.pos, b, W.isSea(b.pos.x, b.pos.z)); G.msg.push(`Борт ${b.id + 1}: столкновение с землёй`); if (b.id === G.me) toast("Столкновение с землёй", 1600); }
  }
  defenseStep(dt); missilesStep(dt); shellsStep(dt, prevPos); bombsStep(dt); debrisStep(dt);
  for (const F of G.flares) { F.vel.y -= 9.81 * dt; F.vel.multiplyScalar(1 - .12 * dt); F.pos.addScaledVector(F.vel, dt); }
  G.flares = G.flares.filter(F => tNow - F.t0 < 3.5 || (F.mesh && (F.mesh.parent?.remove(F.mesh), F.halo?.parent?.remove(F.halo), false)));
  G.bursts = G.bursts.filter(B => tNow - B.t0 < 2.4 || (B.mesh && (drop(B.mesh), false)));
  // кем управляем: если ведущий потерян — следующий живой
  const me = G.bombers[G.me]; if (!me || !me.alive) { const nx = G.bombers.find(b => b.alive && !b.falling); if (nx && (!me || (!me.alive && tNow - (me.deadT ?? me.fallT ?? 0) > 4.5) || (me.falling && tNow - (me.fallT || 0) > 12))) { G.me = nx.id; ctl.steerMan = false; cam.reset = true; cam.dc = null; } }
  // конец раунда
  if (!G.done) { const flying = G.bombers.filter(b => b.alive && !b.falling), armed = flying.filter(b => b.bombs > 0);
    let end = null;
    if (!flying.length) { if (tNow - Math.max(...G.bombers.map(q => q.deadT ?? q.fallT ?? -99)) > 4.5) end = G.success ? "win" : "lose"; }
    else if (G.success && flying.every(b => b.safe || b.mode === "egress") && tNow - G.succT > 12) end = "win";
    else if (!G.success && !armed.length && flying.every(b => b.mode === "egress")) end = "lose";
    else if (tNow > 420) end = G.success ? "win" : "lose";
    if (end) { G.done = true; G.endT = tNow; G.success = end === "win"; if (G.success) STATS.wins++; else STATS.losses++; showSummary(); } }
  else if (tNow - G.endT > 6 && !window.__noLoop) { hideSummary(); newRound(); }
}

/* ================= управление ================= */
const ctl = { steerMan: false, spdMan: false, sx: 0, sy: 0, thr: .78, lastStick: -1e9, stickDown: false, keys: {} };
function playerControl(b, ai) {
  const key = ctl.keys, kx = (key.ArrowRight || key.d ? 1 : 0) - (key.ArrowLeft || key.a ? 1 : 0), ky = (key.ArrowUp || key.w ? 1 : 0) - (key.ArrowDown || key.s ? 1 : 0);
  if (kx || ky) { ctl.sx = kx; ctl.sy = ky; ctl.lastStick = tNow; ctl.steerMan = true; ctl.keyAct = true; } else if (ctl.keyAct) { ctl.sx = ctl.sy = 0; ctl.keyAct = false; }
  if (key.shift) { ctl.thr = Math.min(1, ctl.thr + .4 / 60); ctl.spdMan = true; } if (key.control) { ctl.thr = Math.max(0, ctl.thr - .4 / 60); ctl.spdMan = true; }
  if (ctl.steerMan && !ctl.stickDown && !ctl.keyAct && +S.resume > 0 && tNow - ctl.lastStick > +S.resume) { ctl.steerMan = false; if (b.mode !== "egress" && b.bombs > 0) planIngress(b); else planEgress(b); toast("Автопилот снова ведёт", 1100); }
  let [ar, au, vt] = ai;
  if (ctl.steerMan) { const ex = x => Math.sign(x) * (.35 * Math.abs(x) + .65 * x * x); ar = ex(ctl.sx) * PL.AMAX * .7; au = ex(ctl.sy) * (+S.inv ? -1 : 1) * PL.AMAX * .7;
    // помощь у земли: если впереди рельеф — автопилот подхватывает
    for (let k = 1; k <= 8; k++) { const d = b.v * .4 * k, x = b.pos.x + b.f.x * d, z = b.pos.z + b.f.z * d, y = b.pos.y + b.f.y * d; if (y < Math.max(0, W.gnd(x, z)) + 25) { const w = 1 - (k - 1) / 9; au = au * (1 - w) + PL.AMAX * w; break; } } }
  if (ctl.spdMan || ctl.steerMan) vt = 120 + (PL.VMAX - 120) * ctl.thr;
  return [ar, au, vt];
}
function playerBomb() { const b = G.bombers[G.me]; if (!b || !b.alive || b.falling || b.bombs <= 0) return; if (!ctl.steerMan) { b.mode = "release"; b.relT = tNow; b.rel = 0; return; } dropBomb(b); }
function playerFlare() { const b = G.bombers[G.me]; if (b && b.alive && !b.falling) dropFlares(b); }

/* ================= графика ================= */
let renderer, scene, camera, sun, terrainMesh, water, sky, objGroup, fxGroup;
const MAT = {}, GEO = {};
function initGfx() {
  renderer = new THREE.WebGLRenderer({ canvas: $("c"), antialias: true, powerPreference: "high-performance" });
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(65, 1, 4, 90000);
  scene.fog = new THREE.Fog(0xc4d6e6, 4000, 42000);
  scene.add(new THREE.HemisphereLight(0xdcecff, 0x6a5a40, .85)); sun = new THREE.DirectionalLight(0xfff1dc, 1.25); sun.position.set(.5, .7, .35); scene.add(sun);
  // небо: градиент к горизонту
  sky = new THREE.Mesh(new THREE.SphereGeometry(80000, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; void main(){ float h=max(vP.y,0.); vec3 c=mix(vec3(.77,.84,.9),vec3(.33,.55,.85),pow(h,.55)); gl_FragColor=vec4(c,1.); }` }));
  scene.add(sky);
  water = new THREE.Mesh(new THREE.PlaneGeometry(240000, 240000), waterMaterial());
  water.rotation.x = -Math.PI / 2; water.position.y = 0; scene.add(water);
  const L = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  Object.assign(MAT, { olive: L(0x5d6642), dark: L(0x2b2e28), grey: L(0x7c848e), grey2: L(0x69707a), steel: L(0xb9bec4), conc: L(0x9a958a), roof: L(0xa04530), wall: L(0xe6dfcf), tree: L(0x2f5a2c), tree2: L(0x46703a), red: new THREE.MeshBasicMaterial({ color: 0xff3020 }),
    burnt: L(0x1d1b19), blue: L(0x8696a6), blueT: new THREE.MeshLambertMaterial({ color: 0x3d5f86, flatShading: true, side: THREE.DoubleSide }), glass: new THREE.MeshLambertMaterial({ color: 0x1b3550, transparent: true, opacity: .85 }),
    white: L(0xe8e6e0), runway: L(0x3a3c3e),
    flash: new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    smoke: new THREE.MeshLambertMaterial({ color: 0x6a6460, emissive: 0x3a3632, transparent: true, depthWrite: false }),
    smokeW: new THREE.MeshLambertMaterial({ color: 0xe6e4e0, emissive: 0x606060, transparent: true, depthWrite: false }),
    tracer: new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }),
    flare: new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), flareHalo: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false }) });
  Object.assign(GEO, { ball: new THREE.SphereGeometry(1, 12, 8), puff: new THREE.IcosahedronGeometry(1, 2), tracer: new THREE.CylinderGeometry(1, 1, 1, 5).translate(0, -.5, 0).rotateX(Math.PI / 2),
    bomb: new THREE.CapsuleGeometry(.35, 2.2, 3, 8).rotateX(Math.PI / 2), missile: new THREE.CylinderGeometry(.25, .25, 6, 8).rotateX(Math.PI / 2) });
  objGroup = new THREE.Group(); fxGroup = new THREE.Group(); scene.add(objGroup, fxGroup);
  resize(); addEventListener("resize", resize);
}
let qAuto = 1;
function resize() { const q = (+S.q || 1) * qAuto; renderer.setPixelRatio(Math.max(.5, Math.min(devicePixelRatio || 1, q))); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 1 ? 82 : 65; camera.updateProjectionMatrix(); }

/* море и озёра: цвет по глубине (карта расстояния до берега), пена прибоя, бегущая рябь и блики солнца — всё в шейдере */
const WU = { uTime: { value: 0 }, uWt: { value: null }, uSz: { value: new THREE.Vector2(36000, 24000) } };
function waterMaterial() {
  const m = new THREE.MeshPhongMaterial({ color: 0x2b6a86, specular: 0xbfd6e6, shininess: 70, transparent: true, opacity: .95 });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, WU);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vWP; uniform float uTime; uniform sampler2D uWt; uniform vec2 uSz;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float wv(vec2 p){ return vn(p / 26. + vec2(uTime * .05, uTime * .03)) * .55 + vn(p / 9. - vec2(uTime * .09, -uTime * .06)) * .3 + vn(p / 3.2 + vec2(uTime * .17, uTime * .11)) * .15; }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
  vec4 wt = texture2D(uWt, vWP.xz / uSz); float dst = wt.r, lake = wt.g;
  float k = pow(clamp(dst, 0., 1.), .5);
  vec3 shallow = vec3(.16, .62, .64), deep = vec3(.025, .15, .30);
  vec3 col = mix(shallow, deep, smoothstep(0., .75, k));
  vec3 lakeC = mix(vec3(.62, .78, .72), vec3(.2, .48, .56), clamp(lake * 1.4, 0., 1.));
  col = mix(col, lakeC, step(.004, lake));
  float wn = wv(vWP.xz);
  col *= .88 + .24 * wn;
  float shore = (1. - smoothstep(.006, .05, dst)) * (1. - step(.004, lake));
  float foam = shore * smoothstep(.38, .7, wn + .4 * sin(uTime * .8 - dst * 200.) * (1. - dst * 8.)) * 1.0 + (1. - smoothstep(0., .005, dst)) * (1. - step(.004, lake)) * .5;
  col = mix(col, vec3(.93, .97, 1.), clamp(foam, 0., .85));
  diffuseColor.rgb = col; diffuseColor.a = mix(.55, .96, smoothstep(0., .5, k)) * (1. - .1 * step(.004, lake));`)
      .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
  { float fa = 1. - smoothstep(1500., 9000., length(cameraPosition - vWP)); if (fa > 0.) { vec2 q = vWP.xz, e = vec2(1.2, 0.);
    float w0 = wn, gx = wv(q + e.xy) - w0, gz = wv(q + e.yx) - w0; normal = normalize(normal + mat3(viewMatrix) * vec3(-gx, 0., -gz) * 1.3 * fa); } }`);
  };
  return m;
}
function buildWaterTex() {
  const { nx, nz, h, land, dOut } = W, d = new Uint8Array(nx * nz * 4);
  for (let k = 0; k < nx * nz; k++) { const sea = land[k] === 0; d[4 * k] = sea ? Math.min(255, dOut[k] / 4500 * 255) : 0; d[4 * k + 1] = land[k] === 2 ? Math.max(8, Math.min(255, -h[k] / 30 * 255)) : 0; d[4 * k + 2] = 0; d[4 * k + 3] = 255; }
  const t = new THREE.DataTexture(d, nx, nz, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  WU.uWt.value?.dispose(); WU.uWt.value = t; WU.uSz.value.set(W.W, W.H);
}
/* дороги и посёлки — карта поверх рельефа (в шейдер как цветовая подложка с прозрачностью) */
const OV = { uTSz: { value: new THREE.Vector2(1201, 801) }, uNrm: { value: null }, uTerCol: { value: null }, uRoad: { value: null }, uOSz: { value: new THREE.Vector2(36000, 24000) } };
function pickVillages() {
  const r = rng(W.seed + 11), { nx, land, mt, dIn, cs } = W, nv = 10 + Math.floor(r() * 8), out = [];
  for (let v = 0; v < nv; v++) for (let t = 0; t < 200; t++) { const cx = r() * W.W, cz = r() * W.H, k = Math.round(cz / cs) * nx + Math.round(cx / cs);
    if (land[k] === 1 && mt[k] < .3 && W.gnd(cx, cz) > 3 && (dIn[k] < 2500 || r() < .4) && Math.hypot(cx - W.target.x, cz - W.target.z) > 1200) { out.push({ x: cx, z: cz, rot: r() * 3, n: 12 + Math.floor(r() * 30) }); break; } }
  return out;
}
function buildOverlay() {
  const px = 20, cw = Math.ceil(W.W / px), ch = Math.ceil(W.H / px), cv = document.createElement("canvas"); cv.width = cw; cv.height = ch; const c = cv.getContext("2d"), r = rng(W.seed + 21), P = (x, z) => [x / px, z / px];
  c.lineCap = "round"; c.lineJoin = "round";
  const pts = [...W.vil.map(v => ({ x: v.x, z: v.z, v })), { x: W.target.x, z: W.target.z, t: 1 }], conn = [pts[0]], rest = pts.slice(1), edges = [];
  while (rest.length) { let best = null; for (const a of conn) for (const b of rest) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (!best || d < best.d) best = { a, b, d }; } edges.push(best); conn.push(best.b); rest.splice(rest.indexOf(best.b), 1); }
  for (let i = 0; i < 3 && pts.length > 4; i++) { const a = pts[Math.floor(r() * pts.length)], b = pts[Math.floor(r() * pts.length)]; if (a !== b) edges.push({ a, b, d: Math.hypot(a.x - b.x, a.z - b.z) }); }
  const road = (e, w, col) => { const { a, b, d } = e, nx_ = -(b.z - a.z) / d, nz_ = (b.x - a.x) / d, bend = (r() - .5) * .22 * d, N = Math.max(8, Math.floor(d / 250)); c.strokeStyle = col; c.lineWidth = w; let pen = false; c.beginPath();
    for (let i = 0; i <= N; i++) { const t = i / N, s = Math.sin(Math.PI * t) * bend + Math.sin(t * 17 + e.d) * 40, x = a.x + (b.x - a.x) * t + nx_ * s, z = a.z + (b.z - a.z) * t + nz_ * s; if (W.isSea(x, z) || W.gnd(x, z) < 1.2 || W.gnd(x, z) > 700) { pen = false; continue; } const [u, v] = P(x, z); if (!pen) { c.moveTo(u, v); pen = true; } else c.lineTo(u, v); } c.stroke(); };
  for (const e of edges) { road(e, 1.55, "rgba(60,58,56,.55)"); road(e, 1.0, "rgba(176,170,160,.85)"); } // обочина + полотно
  for (const v of W.vil) { const [u, w] = P(v.x, v.z); c.fillStyle = "rgba(150,128,96,.5)"; c.beginPath(); c.arc(u, w, 5 + v.n / 12, 0, 6.3); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.flipY = false; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; OV.uRoad.value?.dispose(); OV.uRoad.value = t; OV.uOSz.value.set(W.W, W.H);
}
/* рельеф: сетка с цветами вершин (пляж, степь, солончак, лес на склонах, светлый известняк на плато и обрывах) */
const FIELDS = [0xd8c27a, 0xc9b25e, 0x8fa04f, 0x7d8a45, 0x9c7a52, 0xb59a62, 0xa8b066].map(c => new THREE.Color(c));
/* карта нормалей рельефа из полной сетки высот (30 м на пиксель): освещение не зависит от уровня детализации куска — нет «квадратов» */
function terrainNormals(f = 2) {
  const { nx, nz, h, cs } = W, Nx = (nx - 1) * f + 1, Nz = (nz - 1) * f + 1, data = new Uint8Array(Nx * Nz * 4), at = W.at;
  for (let oj = 0; oj < Nz; oj++) for (let oi = 0; oi < Nx; oi++) { const x = oi * cs / f, z = oj * cs / f, a = Math.max(at(h, x - cs, z), -60) - Math.max(at(h, x + cs, z), -60), b = Math.max(at(h, x, z - cs), -60) - Math.max(at(h, x, z + cs), -60), l = Math.hypot(a, 2 * cs, b), o = (oj * Nx + oi) * 4;
    data[o] = Math.round((a / l * .5 + .5) * 255); data[o + 1] = Math.round((2 * cs / l * .5 + .5) * 255); data[o + 2] = Math.round((b / l * .5 + .5) * 255); data[o + 3] = 255; }
  const t = new THREE.DataTexture(data, Nx, Nz, THREE.RGBAFormat); t.colorSpace = THREE.NoColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; return t;
}
function terrainColors(f = 2) {
  const { nx, nz, h, land, mt, dIn, cs } = W, Nx = (nx - 1) * f + 1, Nz = (nz - 1) * f + 1, data = new Uint8Array(Nx * Nz * 4), c = new THREE.Color(), r = rng(W.seed + 5), at = W.at;
  const C = { sand: new THREE.Color(0xd9c58e), steppe: new THREE.Color(0xb7a96a), steppe2: new THREE.Color(0x9a9a58), forest: new THREE.Color(0x3f6234), meadow: new THREE.Color(0x8fa060), lime: new THREE.Color(0xc9c4b4), salt: new THREE.Color(0xe7e2da), sea: new THREE.Color(0x2b5a6a), cliff: new THREE.Color(0xa59f92) };
  for (let oj = 0; oj < Nz; oj++) for (let oi = 0; oi < Nx; oi++) { const x = oi * cs / f, z = oj * cs / f, i = Math.min(nx - 1, Math.round(oi / f)), j = Math.min(nz - 1, Math.round(oj / f)), k = j * nx + i, y = at(h, x, z);
    if (!land[k]) { c.copy(C.sea).lerp(C.sand, Math.max(0, 1 + y / 12)); }
    else if (land[k] === 2) c.copy(C.salt);
    else { const sl = Math.hypot(at(h, x + cs, z) - at(h, x - cs, z), at(h, x, z + cs) - at(h, x, z - cs)) / (2 * cs), m = at(mt, x, z), n = r(), din = at(dIn, x, z);
      c.copy(C.steppe).lerp(C.steppe2, .5 + .5 * Math.sin(x * 5.8e-4 + z * 4.2e-4) * Math.cos(x * 2.6e-4 - z * 5e-4));
      /* поля в степи: прямоугольные участки (пшеница, зелень, пашня, сухая трава), сетка полей слегка повёрнута по районам */
      if (m < .12) { const a = .5 * Math.sin(x / 9000 + 1.3) + .3 * Math.cos(z / 7000), u = x * Math.cos(a) + z * Math.sin(a), w = -x * Math.sin(a) + z * Math.cos(a), fi = Math.floor(u / 520), fj = Math.floor(w / 380);
        const hsh = Math.abs(Math.sin(fi * 127.1 + fj * 311.7 + W.seed) * 43758.5) % 1, F = FIELDS[Math.floor(hsh * FIELDS.length)]; if (hsh > .12) c.lerp(F, .55 * (1 - sstep(.05, .12, m))); }
      if (m > .08) c.lerp(C.forest, sstep(.08, .3, m) * (1 - sstep(.75, .95, m)));
      if (m > .85) c.lerp(C.meadow, sstep(.85, .97, m)).lerp(C.lime, .12);
      if (sl > .45) c.lerp(C.cliff, sstep(.45, .9, sl));
      if (din < 150 && y < 12) c.lerp(C.sand, 1 - din / 150);
      for (const L of W.lakes) { const d = Math.hypot(x - L.x, z - L.z) / L.r; if (d < 1.6) c.lerp(C.salt, .6 * (1 - sstep(1, 1.6, d))); }
      }
    c.convertLinearToSRGB(); const o = (oj * Nx + oi) * 4; data[o] = Math.max(0, Math.min(255, Math.round(c.r * 255))); data[o + 1] = Math.max(0, Math.min(255, Math.round(c.g * 255))); data[o + 2] = Math.max(0, Math.min(255, Math.round(c.b * 255))); data[o + 3] = 255; }
  const t = new THREE.DataTexture(data, Nx, Nz, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}
/* процедурная детализация рельефа в шейдере: цвет и микро-неровности по мировым координатам (3 масштаба, с затуханием вдали), слоистость на обрывах */
function terrainMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, OV);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP; varying vec3 vWN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.)).xyz; vWN = normal;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vWP; varying vec3 vWN; uniform sampler2D uRoad; uniform sampler2D uTerCol; uniform sampler2D uNrm; uniform vec2 uOSz; uniform vec2 uTSz;
vec4 smTex(sampler2D t, vec2 uv){ vec2 p = uv * uTSz - .5, i = floor(p), f = fract(p); f = f * f * f * (f * (f * 6. - 15.) + 10.); return texture2D(t, (i + .5 + f) / uTSz); }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fb(vec2 p, float k){ float s = 0., a = .5; for (int i = 0; i < 3; i++) { s += a * vn(p); p = p * 2.07 + 13.1; a *= .5 * k; } return s; }`)
      .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
  normal = normalize(mat3(viewMatrix) * nT);
  float dcam = length(cameraPosition - vWP); float fa = 1. - smoothstep(500., 2500., dcam), fb2 = 1. - smoothstep(2500., 9000., dcam);
  vec3 pw = vec3(0.);
  if (fb2 > 0.) { vec2 q = vWP.xz; float m0 = vn(q / 38.), mx = vn((q + vec2(4., 0.)) / 38.) - m0, mz = vn((q + vec2(0., 4.)) / 38.) - m0; pw = vec3(-(mx / 4.) * 11. * fb2, 0., -(mz / 4.) * 11. * fb2);
    if (fa > 0.) { float e = .6, n0 = fb(q / 5., 1.), gx = fb((q + vec2(e, 0.)) / 5., 1.) - n0, gz = fb((q + vec2(0., e)) / 5., 1.) - n0; pw += vec3(-(gx / e) * .9 * fa, 0., -(gz / e) * .9 * fa); } }
  normal = normalize(normal + mat3(viewMatrix) * pw);`)
      .replace("#include <color_fragment>", `#include <color_fragment>
  diffuseColor.rgb *= smTex(uTerCol, vWP.xz / uOSz).rgb;
  vec3 nT = normalize(smTex(uNrm, vWP.xz / uOSz).xyz * 2. - 1.);
  { float fa = 1. - smoothstep(500., 2500., length(cameraPosition - vWP)); float c1 = fa > 0. ? fb(vWP.xz / 4., 1.) : .5, c2 = fb(vWP.xz / 31. + 7., 1.), c3 = fb(vWP.xz / 260. + 3., 1.);
    float v = .76 + .5 * c3 * (1. - .5 * fa) ; v *= mix(1., .82 + .36 * c2, .75 * (1. - smoothstep(4000., 14000., length(cameraPosition - vWP)))); v *= mix(1., .86 + .28 * c1, fa);
    float steep = smoothstep(.5, .85, 1. - nT.y); float band = .5 + .5 * sin(vWP.y * .22 + c3 * 14. + c2 * 4.);
    v *= 1. - steep * (.05 + .10 * band);
    diffuseColor.rgb *= v;
    /* поля: живая изгородь по границам, у некоторых — ряды (виноградники/сады), видны вблизи */
    if (vWP.y < 140. && nT.y > .97 && fa > 0.) { float a = .5 * sin(vWP.x / 9000. + 1.3) + .3 * cos(vWP.z / 7000.), u = vWP.x * cos(a) + vWP.z * sin(a), w = -vWP.x * sin(a) + vWP.z * cos(a), fi = floor(u / 520.), fj = floor(w / 380.);
      float hs = fract(sin(fi * 127.1 + fj * 311.7) * 43758.5), du = abs(fract(u / 520.) - .5) * 520., dw = abs(fract(w / 380.) - .5) * 380.;
      float edge = 1. - smoothstep(0., 6., min(250. - du, 190. - dw)); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.55, .66, .45), edge * .32 * fa);
      if (hs < .22) { float rows = smoothstep(.3, .7, abs(fract(u / 5.5) - .5) * 2.); diffuseColor.rgb *= 1. - .22 * rows * fa; } }
    vec4 rd = texture2D(uRoad, vWP.xz / uOSz); diffuseColor.rgb = mix(diffuseColor.rgb, rd.rgb / max(rd.a, .001), rd.a * (1. - .6 * smoothstep(3000., 12000., length(cameraPosition - vWP)))); }`);
  };
  return m;
}
/* рельеф кусками 50×50 ячеек с тремя уровнями детализации (шаг 1/2/5 ячеек), юбки по краям прячут стыки; невидимые куски отсекает камера */
const TER = { chunks: [], mat: null };
function buildTerrain() {
  for (const c of TER.chunks) for (const m of c.lod) { scene.remove(m); m.geometry.dispose(); } TER.chunks = [];
  const { nx, nz, h, cs } = W, CH = 50, hh = (i, j) => h[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
  TER.mat ??= terrainMaterial(); TER.tex?.dispose(); TER.tex = terrainColors(2); OV.uTerCol.value = TER.tex; TER.ntex?.dispose(); TER.ntex = terrainNormals(2); OV.uNrm.value = TER.ntex; OV.uTSz.value.set((nx - 1) * 2 + 1, (nz - 1) * 2 + 1); OV.uOSz.value.set(W.W, W.H);
  for (let cz = 0; cz < nz - 1; cz += CH) for (let cx = 0; cx < nx - 1; cx += CH) {
    const ex = Math.min(CH, nx - 1 - cx), ez = Math.min(CH, nz - 1 - cz), lod = [];
    for (const s of [1, 2, 5]) { const st = ex % s || ez % s ? 1 : s, gx = ex / st + 1, gz = ez / st + 1, vid = new Map(), P = [], idx = [];
      /* вершины: сетка с шагом st + все вершины полной сетки по периметру куска — границы соседних кусков совпадают при любой детализации (без щелей и швов) */
      const add = (fi, fj) => { const key = fj * 1000 + fi; let v = vid.get(key); if (v === undefined) { v = P.length; vid.set(key, v); P.push([fi, fj]); } return v; };
      for (let q = 0; q < gz; q++) for (let p = 0; p < gx; p++) add(p * st, q * st);
      for (let f = 0; f <= ex; f++) { add(f, 0); add(f, ez); } for (let f = 0; f <= ez; f++) { add(0, f); add(ex, f); }
      for (let q = 0; q < gz - 1; q++) for (let p = 0; p < gx - 1; p++) {
        const T = q === 0, Bm = q === gz - 2, L = p === 0, R = p === gx - 2, fi0 = p * st, fi1 = (p + 1) * st, fj0 = q * st, fj1 = (q + 1) * st;
        if (!(T || Bm || L || R)) { const a = add(fi0, fj0), b = add(fi1, fj0), c = add(fi0, fj1), d = add(fi1, fj1); idx.push(a, c, b, b, c, d); continue; }
        /* ячейка у края: многоугольник A→B→D→C с промежуточными вершинами периметра, веер от угла без таких сторон */
        const poly = [[fi0, fj0, "A"]]; if (T) for (let f = fi0 + 1; f < fi1; f++) poly.push([f, fj0]); poly.push([fi1, fj0, "B"]); if (R) for (let f = fj0 + 1; f < fj1; f++) poly.push([fi1, f]); poly.push([fi1, fj1, "D"]);
        if (Bm) for (let f = fi1 - 1; f > fi0; f--) poly.push([f, fj1]); poly.push([fi0, fj1, "C"]); if (L) for (let f = fj1 - 1; f > fj0; f--) poly.push([fi0, f]);
        const ok = { A: !T && !L, B: !T && !R, D: !R && !Bm, C: !Bm && !L }, ap = ["D", "C", "B", "A"].find(k => ok[k]) || "D", k0 = poly.findIndex(v => v[2] === ap), rot = poly.slice(k0).concat(poly.slice(0, k0)), vs = rot.map(v => add(v[0], v[1]));
        for (let k = 1; k < vs.length - 1; k++) idx.push(vs[0], vs[k + 1], vs[k]); }
      const nv = P.length, pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
      P.forEach(([fi, fj], v) => { const i = cx + fi, j = cz + fj, y = Math.max(hh(i, j), -60), a = hh(i - 1, j) - hh(i + 1, j), b = hh(i, j - 1) - hh(i, j + 1), l = Math.hypot(a, 2 * cs, b);
        pos[3 * v] = i * cs; pos[3 * v + 1] = y; pos[3 * v + 2] = j * cs; nor[3 * v] = a / l; nor[3 * v + 1] = 2 * cs / l; nor[3 * v + 2] = b / l; });
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); geo.setIndex(new THREE.BufferAttribute(nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1)); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, TER.mat); m.visible = s === 1; scene.add(m); lod.push(m); }
    TER.chunks.push({ x: (cx + ex / 2) * cs, z: (cz + ez / 2) * cs, lod, sel: 0 }); }
}
function terrainLod() { const p = camera.position; for (const c of TER.chunks) { const d = Math.hypot(c.x - p.x, c.z - p.z, p.y * .7), k = d < 8000 ? 0 : d < 18000 ? 1 : 2; if (k !== c.sel) { c.lod[c.sel].visible = false; c.lod[k].visible = true; c.sel = k; } } }
function buildScene() {
  for (const g of [objGroup, fxGroup]) while (g.children.length) drop(g.children[g.children.length - 1]);
  buildTerrain();
  W.vil = pickVillages(); buildWaterTex(); buildOverlay();
  if (+S.life) buildLife();
  buildObjects(); buildMinimap();
  for (const b of G.bombers) { b.mesh = makeJet(); objGroup.add(b.mesh); b.trail = makeTrail(); fxGroup.add(b.trail); b.smoke = makeSmoke(); fxGroup.add(b.smoke); }
  G.dsm = makeSmoke(2400); fxGroup.add(G.dsm);
}
/* лес на склонах гор, посёлки в степи и у берега — для ощущения скорости у земли */
function buildLife() {
  const r = rng(W.seed + 9), trees = [], houses = [], { nx, nz, h, land, mt, dIn, cs } = W;
  for (let t = 0; t < 120000 && trees.length < 13000; t++) { const x = r() * W.W, z = r() * W.H, i = Math.round(x / cs), j = Math.round(z / cs), k = j * nx + i; if (land[k] !== 1) continue; const m = mt[k];
    if (m > .1 && m < .85 && r() < .9) trees.push([x, W.gnd(x, z), z, .7 + .8 * r()]); else if (m < .05 && r() < .015) trees.push([x, W.gnd(x, z), z, .6 + .4 * r()]); }
  for (const V of W.vil) { const cx = V.x, cz = V.z, nH = V.n, rot = V.rot;
    for (let i = 0; i < nH; i++) { const a = (i % 6) * 38 - 95, b = Math.floor(i / 6) * 34 - 70, x = cx + a * Math.cos(rot) - b * Math.sin(rot) + (r() - .5) * 10, z = cz + a * Math.sin(rot) + b * Math.cos(rot) + (r() - .5) * 10; if (W.isSea(x, z)) continue; houses.push([x, W.gnd(x, z), z, rot]); } }
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const tg = new THREE.ConeGeometry(5, 16, 6).translate(0, 8, 0); tg.userData.own = true;
  const TI = new THREE.InstancedMesh(tg, MAT.tree, trees.length); trees.forEach(([x, y, z, s], i) => { TI.setMatrixAt(i, m4.compose(p.set(x, y - 1, z), qt.identity(), sc.set(s, s * (.8 + .5 * ((i * 7919) % 13) / 13), s))); }); objGroup.add(TI);
  const hw = new THREE.BoxGeometry(10, 6, 8).translate(0, 3, 0), hr = new THREE.ConeGeometry(7.5, 4, 4).rotateY(Math.PI / 4).translate(0, 8, 0).scale(1, 1, .8);
  const HW = new THREE.InstancedMesh(hw, MAT.wall, houses.length), HR = new THREE.InstancedMesh(hr, MAT.roof, houses.length);
  houses.forEach(([x, y, z, a], i) => { qt.setFromAxisAngle(UP, a); m4.compose(p.set(x, y - .5, z), qt, sc.set(1, 1, 1)); HW.setMatrixAt(i, m4); HR.setMatrixAt(i, m4); }); objGroup.add(HW, HR);
}
/* ---------- модели ---------- */
function makeJet() { // бомбардировщик синих: стреловидное крыло, два двигателя; нос по −Z
  const g = new THREE.Group(), body = MAT.blue, trim = MAT.blueT;
  const prof = [[0, 9], [.35, 8.2], [.8, 6.6], [1.15, 4.4], [1.35, 1.8], [1.4, -2], [1.3, -6], [1.05, -8.2], [.95, -8.8]].map(([r, y]) => new THREE.Vector2(r, y));
  const fu = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), body); fu.rotation.x = -Math.PI / 2; fu.scale.set(1, 1, .9); g.add(fu);
  const can = new THREE.Mesh(GEO.ball, MAT.glass); can.scale.set(.8, .7, 2.6); can.position.set(0, .8, -4.6); g.add(can);
  const ext = (pts, depth, mat) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y)); sh.closePath(); const ge = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); ge.translate(0, 0, -depth / 2); return new THREE.Mesh(ge, mat); };
  for (const sx of [-1, 1]) {
    const w = ext([[0, -2.5], [sx * 8.5, 2.6], [sx * 8.5, 3.8], [0, 4.2]], .25, trim); w.rotation.x = Math.PI / 2; g.add(w);
    const st = ext([[0, 6], [sx * 3.6, 8.2], [sx * 3.6, 8.9], [0, 8.8]], .15, trim); st.rotation.x = Math.PI / 2; st.position.y = .3; g.add(st);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(.7, .8, 6, 10).rotateX(Math.PI / 2), MAT.dark); eng.position.set(sx * 1.3, -.4, 5); g.add(eng);
  }
  const fin = ext([[0, 4.5], [0, 8.9], [3.4, 8.7], [3.4, 7.2]], .15, body); fin.geometry.rotateX(Math.PI / 2).rotateZ(Math.PI / 2); fin.position.y = .8; g.add(fin);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(.6, 4, 8).rotateX(Math.PI / 2), MAT.flare.clone()); flame.material.color.set(0xffa040); flame.position.set(0, -.4, 10); g.add(flame);
  const fl2 = flame.clone(); flame.position.x = -1.3; fl2.position.x = 1.3; g.add(fl2);
  g.userData = { flame, fl2 }; g.scale.setScalar(1.25); return g;
}
/* дымный след двигателей: кольцевой буфер точек-«клубов» (один draw call на борт); белый, у повреждённого борта — чёрный */
const SM = { uTime: { value: 0 }, uPx: { value: 800 } };
function makeSmoke(N = 420) { const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3)); geo.setAttribute("birth", new THREE.BufferAttribute(new Float32Array(N).fill(-99), 1)); geo.setAttribute("dark", new THREE.BufferAttribute(new Float32Array(N), 1)); geo.setAttribute("sz", new THREE.BufferAttribute(new Float32Array(N), 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: SM,
    vertexShader: `attribute float birth; attribute float dark; attribute float sz; uniform float uTime; uniform float uPx; varying float vA; varying float vD;
      void main(){ float age = uTime - birth, life = 4.2 + 2. * dark; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
        float ok = step(0., age) * step(age, life); float k = clamp(age / life, 0., 1.);
        gl_PointSize = ok * sz * (1. + 4.5 * sqrt(k)) * uPx / max(1., -mv.z); vA = pow(1. - k, 1.3) * (.45 + .8 * dark) * smoothstep(0., .25, age); vD = dark; }`,
    fragmentShader: `varying float vA; varying float vD; void main(){ vec2 p = gl_PointCoord * 2. - 1.; float r2 = dot(p, p); if (r2 > 1.) discard; float a = pow(1. - r2, 1.2) * vA;
      vec3 c = mix(vec3(.96, .97, 1.), vec3(.05, .05, .055), vD); gl_FragColor = vec4(c, a); }` });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5; pts.userData = { N, i: 0, last: null }; return pts; }
function putPuff(P, x, y, z, dark, size) { const u = P.userData, a = P.geometry.attributes, i = u.i = (u.i + 1) % u.N; a.position.setXYZ(i, x, y, z); a.birth.setX(i, tNow); a.dark.setX(i, dark); a.sz.setX(i, size); a.position.needsUpdate = a.birth.needsUpdate = a.dark.needsUpdate = a.sz.needsUpdate = true; }
function emitSmoke(b) { const P = b.smoke; if (!P) return; const u = P.userData, g = P.geometry, pos = g.attributes.position, bi = g.attributes.birth, dk = g.attributes.dark, sz = g.attributes.sz;
  const dmg = b.falling ? 1.6 : b.hp < PL.HP ? 1 : 0, now = b.pos; if (!u.last) u.last = now.clone();
  const dist = u.last.distanceTo(now), n = Math.min(8, Math.floor(dist / 5)); if (!n) return;
  for (let k = 1; k <= n; k++) for (const s of [-1, 1]) { const f = k / n, i = u.i = (u.i + 1) % u.N;
    _a.copy(u.last).lerp(now, f).addScaledVector(b.r0, s * 1.5).addScaledVector(b.f, -7).addScaledVector(b.u0, -.2);
    pos.setXYZ(i, _a.x, _a.y, _a.z); bi.setX(i, tNow - (1 - f) * dist / Math.max(b.v, 50)); dk.setX(i, Math.min(1, dmg)); sz.setX(i, dmg ? 5.5 * (dmg > 1 ? 1.5 : 1) : 3.6); }
  u.last.copy(now); pos.needsUpdate = bi.needsUpdate = dk.needsUpdate = sz.needsUpdate = true; }
function makeTrail() { const n = 50, geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .35, depthWrite: false })); l.frustumCulled = false; l.userData = { n, hist: [], t: 0 }; return l; }
function gunMesh() { const g = new THREE.Group(), base = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 3, 8), MAT.olive); base.position.y = 1.5; g.add(base);
  const yawG = new THREE.Group(); yawG.position.y = 3; g.add(yawG); const tur = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 5), MAT.olive); tur.position.y = 1.5; yawG.add(tur);
  const pitchG = new THREE.Group(); pitchG.position.y = 2.6; yawG.add(pitchG); for (const s of [-1, 1]) { const br = new THREE.Mesh(new THREE.CylinderGeometry(.3, .35, 9, 6).rotateX(Math.PI / 2).translate(0, 0, 4.5), MAT.dark); br.position.x = s * 1.1; pitchG.add(br); }
  g.userData = { yawG, pitchG }; return g; }
function samMesh() { const g = new THREE.Group(), truck = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 11), MAT.olive); truck.position.y = 1.8; g.add(truck);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.6, 2.6), MAT.olive); cab.position.set(0, 2.2, -6.4); g.add(cab);
  const rack = new THREE.Group(); rack.position.set(0, 3.6, 2); rack.rotation.x = -.6; g.add(rack); for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, 8.5, 8), MAT.grey); t.rotation.x = Math.PI / 2; t.position.set((i % 2 - .5) * 1.3, Math.floor(i / 2) * 1.2, 0); rack.add(t); }
  const rad = new THREE.Group(), mast = new THREE.Mesh(new THREE.CylinderGeometry(.3, .4, 12, 6), MAT.dark); mast.position.y = 6; rad.add(mast);
  const ant = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, .4), MAT.grey2); ant.position.y = 12.5; rad.add(ant); rad.position.set(18, 0, 6); g.add(rad);
  g.userData = { ant: rad }; return g; }
function shipMesh(kind, len) { const g = new THREE.Group(), L = len || (kind === "frigate" ? 110 : 34), B = L * .13;
  const sh = new THREE.Shape(); sh.moveTo(-L / 2, -B / 2); sh.lineTo(L * .3, -B / 2); sh.quadraticCurveTo(L * .5, -B * .2, L * .52, 0); sh.quadraticCurveTo(L * .5, B * .2, L * .3, B / 2); sh.lineTo(-L / 2, B / 2); sh.closePath();
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: L * .09, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -L * .03, 0), MAT.grey2); g.add(hull);
  const sup = new THREE.Mesh(new THREE.BoxGeometry(L * .26, L * .09, B * .7), MAT.grey); sup.position.set(-L * .02, L * .1, 0); g.add(sup);
  const br = new THREE.Mesh(new THREE.BoxGeometry(L * .1, L * .05, B * .6), MAT.grey); br.position.set(L * .06, L * .17, 0); g.add(br);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(L * .006, L * .009, L * .2, 6), MAT.dark); mast.position.set(0, L * .27, 0); g.add(mast);
  if (kind === "frigate" || kind === "target") { const lau = new THREE.Mesh(new THREE.BoxGeometry(L * .08, L * .04, B * .5), MAT.dark); lau.position.set(L * .25, L * .075, 0); g.add(lau); const gun = new THREE.Mesh(new THREE.CylinderGeometry(L * .02, L * .025, L * .02, 8), MAT.grey); gun.position.set(L * .36, L * .07, 0); g.add(gun); }
  return g; }
function partMesh(p) { const k = p.kind, g = new THREE.Group(), add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  if (k === "tank") { add(new THREE.CylinderGeometry(11, 11, 10, 16), MAT.steel, 0, 5, 0); add(new THREE.CylinderGeometry(11.3, 11.3, .8, 16), MAT.grey, 0, 10, 0); }
  else if (k === "shed") { add(new THREE.BoxGeometry(40, 10, 22), MAT.wall, 0, 5, 0); add(new THREE.BoxGeometry(41, 1.5, 23), MAT.roof, 0, 10.5, 0); }
  else if (k === "dish") { add(new THREE.CylinderGeometry(4, 6, 10, 8), MAT.conc, 0, 5, 0); const d = add(new THREE.SphereGeometry(13, 16, 8, 0, Math.PI * 2, 0, 1.0), MAT.white, 0, 22, 0); d.rotation.x = 1.0; g.userData.spin = d; }
  else if (k === "bunker") { add(new THREE.BoxGeometry(26, 7, 18), MAT.conc, 0, 3.5, 0); }
  else if (k === "mast") { add(new THREE.CylinderGeometry(.6, 1.2, 46, 6), MAT.roof, 0, 23, 0); }
  else if (k === "hangar") { const m = add(new THREE.CylinderGeometry(16, 16, 40, 12, 1, false, 0, Math.PI), MAT.grey, 0, 0, 0); m.rotation.z = Math.PI / 2; m.rotation.y = Math.PI / 2; }
  else if (k === "jet") { const j = makeJet(); j.scale.setScalar(.9); j.position.y = 2; j.userData.flame.visible = j.userData.fl2.visible = false; g.add(j); }
  else if (k === "tower") { add(new THREE.BoxGeometry(6, 18, 6), MAT.wall, 0, 9, 0); add(new THREE.BoxGeometry(9, 4, 9), MAT.glass, 0, 20, 0); }
  return g; }
function buildObjects() {
  const tg = W.target;
  if (tg.type === "airfield") { const rw = new THREE.Mesh(new THREE.BoxGeometry(2400, 1, 55), MAT.runway); rw.position.set(tg.x, W.gnd(tg.x, tg.z) + .6, tg.z); rw.rotation.y = -tg.hd; objGroup.add(rw);
    for (let i = -10; i <= 10; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(40, 1.2, 2), MAT.white); s.position.set(tg.x + Math.cos(tg.hd) * i * 110, rw.position.y + .1, tg.z + Math.sin(tg.hd) * i * 110); s.rotation.y = -tg.hd; objGroup.add(s); } }
  if (tg.type === "ship") { const m = shipMesh("target", 140); m.position.set(tg.x, 0, tg.z); m.rotation.y = -tg.hd; objGroup.add(m); tg.mesh = m; }
  for (const p of tg.parts) { if (p.kind === "hull") continue; const m = partMesh(p); m.position.set(p.x, p.y, p.z); m.rotation.y = -tg.hd; objGroup.add(m); p.mesh = m; }
  for (const s of W.sams) { const m = samMesh(); m.position.set(s.x, s.y, s.z); m.rotation.y = s.hd; m.scale.setScalar(1.6); objGroup.add(m); s.mesh = m; }
  for (const A of W.aaa) { const m = gunMesh(); m.position.set(A.x, A.y, A.z); m.scale.setScalar(1.5); objGroup.add(m); A.mesh = m; }
  for (const s of W.ships) { const m = shipMesh(s.kind); m.position.set(s.x, 0, s.z); m.rotation.y = -s.hd; objGroup.add(m); s.mesh = m;
    const gm = gunMesh(); gm.scale.setScalar(s.kind === "frigate" ? 1.3 : .9); gm.position.set(s.kind === "frigate" ? 30 : 8, s.kind === "frigate" ? 9 : 3, 0); m.add(gm); s.gun = gm; }
}
/* ---------- эффекты ---------- */
/* гибель самолёта: ослепительная вспышка, огненный шар, вторичные взрывы и разлёт горящих обломков (крылья, фюзеляж, двигатели) с дымными хвостами */
function crashFx(pos, b, sea) {
  const P = pos.clone(), n = sea ? 16 : 34, fv = b.f.clone().multiplyScalar(b.v * .45);
  boom(P, 58, 0xfff0c8, sea); boom(_a.copy(P).add(_b.set(0, 10, 0)), 62, 0xff8a30, sea);
  for (let i = 0; i < n; i++) { const th = rnd() * 6.283, ph = Math.acos(1 - rnd() * 1.4), sp = 25 + rnd() * 105, d = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph) * .9 + .25, Math.sin(ph) * Math.sin(th));
    G.debris.push({ pos: P.clone().add(_a.set(0, 3, 0)), vel: d.multiplyScalar(sp).add(fv), rot: new THREE.Vector3(rnd() * 6, rnd() * 6, rnd() * 6), spin: new THREE.Vector3((rnd() - .5) * 14, (rnd() - .5) * 14, (rnd() - .5) * 14), kind: i % 3, sc: .7 + rnd() * 1.4, t0: tNow, life: 6 + rnd() * 3, rest: false, dead: false, fire: rnd() < .75, trT: 0, mesh: null, sp: null }); }
  const off = () => P.clone().add(_a.set((rnd() - .5) * 40, 4 + rnd() * 14, (rnd() - .5) * 40));
  G.sched.push([tNow + .16, () => boom(off(), 52, 0xff7a20, sea)], [tNow + .38, () => boom(off(), 44, 0xffc060, sea)], [tNow + .7, () => boom(off(), 58, 0xff5a10, sea)], [tNow + 1.2, () => boom(off(), 40, 0xff9030, sea)]);
}
function debrisStep(dt) {
  for (const D of G.debris) { if (D.dead) continue;
    if (!D.rest) { D.vel.y -= 9.81 * dt; D.vel.multiplyScalar(1 - .18 * dt); D.pos.addScaledVector(D.vel, dt); D.rot.addScaledVector(D.spin, dt);
      const gy = Math.max(0, W.gnd(D.pos.x, D.pos.z)); if (D.pos.y < gy + .4) { if (W.isSea(D.pos.x, D.pos.z)) { D.dead = true; boom(D.pos, 9, 0xd8eaff, true); } else { D.rest = true; D.restT = tNow; D.pos.y = gy + .4; D.vel.set(0, 0, 0); boom(D.pos, 9, 0xffa040, false); if (D.fire && G.fires.length < 24 && rnd() < .35) G.fires.push({ x: D.pos.x, y: D.pos.y + 1, z: D.pos.z, t0: tNow }); } } }
    if (tNow - D.t0 > D.life) D.dead = true; }
  G.debris = G.debris.filter(D => !D.dead || (D.mesh && (D.mesh.parent?.remove(D.mesh), D.sp?.parent?.remove(D.sp), false)));
  for (let i = G.sched.length - 1; i >= 0; i--) if (tNow >= G.sched[i][0]) { const f = G.sched[i][1]; G.sched.splice(i, 1); f(); }
}
function boom(pos, r, color, water) { G.fx.push({ pos: pos.clone(), t0: tNow, r, color, water, mesh: null }); }
function fxDraw(dt) {
  const keep = [];
  /* взрыв: короткая яркая вспышка + несколько клубов дыма/пыли (на воде — белый столб брызг), клубы расходятся и поднимаются */
  for (const f of G.fx) { const life = f.smokeOnly ? 4 : 3.5, a = tNow - f.t0; if (a > life) { if (f.mesh) drop(f.mesh); continue; } keep.push(f);
    if (!f.mesh) { const g = new THREE.Group(), fl = new THREE.Mesh(GEO.ball, MAT.flash.clone()); fl.material.color.set(f.color); g.add(fl); const puffs = [], n = f.smokeOnly ? 1 : f.r > 20 ? 6 : 3;
      for (let i = 0; i < n; i++) { const m = new THREE.Mesh(GEO.puff, (f.water ? MAT.smokeW : MAT.smoke).clone()); if (f.pale) m.material.color.setHSL(.11, .06, .82 + .12 * rnd()); else if (!f.water) m.material.color.setHSL(.07, .1 + .1 * rnd(), .3 + .22 * rnd()); m.rotation.set(rnd() * 3, rnd() * 3, 0);
        m.userData.v = new THREE.Vector3((rnd() - .5) * 1.2, f.water ? 1.5 + rnd() * 2.5 : .4 + rnd() * .9, (rnd() - .5) * 1.2); m.userData.s = .35 + .35 * rnd(); g.add(m); puffs.push(m); }
      g.userData = { fl, puffs }; f.mesh = g; fxGroup.add(g); }
    const g = f.mesh, k = a / life; g.position.copy(f.pos);
    g.userData.fl.visible = a < .3 && !f.smokeOnly; g.userData.fl.scale.setScalar(f.r * (.3 + 1.6 * a / .3)); g.userData.fl.material.opacity = 1 - a / .3;
    for (const m of g.userData.puffs) { const s = f.r * m.userData.s * (.5 + 1.5 * Math.sqrt(k)); m.position.copy(m.userData.v).multiplyScalar(f.r * (.6 + 1.6 * Math.sqrt(k))); m.scale.set(s, s * (f.water ? 1.6 : 1), s); m.material.opacity = (f.water ? .75 : .62) * (1 - k) * Math.min(1, g.position.distanceTo(camera.position) / (f.r * 4)); } }
  G.fx = keep;
  // пожары: столб дыма над разрушенным
  for (const F of G.fires) { if (tNow - (F.last || 0) < (F.big ? .25 : .45)) continue; F.last = tNow; if (G.fx.length > 220) break; G.fx.push({ pos: new THREE.Vector3(F.x + (rnd() - .5) * 8, F.y, F.z + (rnd() - .5) * 8), t0: tNow, r: F.big ? 16 : 9, color: 0xff6020, mesh: null, smokeOnly: true }); }
  for (const f of G.fx) if (f.smokeOnly && !f.pale && f.mesh) { const a = tNow - f.t0; f.mesh.position.y = f.pos.y + a * 22; f.mesh.position.x = f.pos.x + a * 6; }
}
function objectsDraw(dt) {
  for (const s of W.sams) if (s.mesh) { if (s.dead && !s.burnt) burn(s.mesh); s.burnt = s.dead; if (!s.dead) s.mesh.userData.ant.rotation.y += dt * (s.lock ? 6 : 1.4); }
  for (const A of [...W.aaa, ...W.ships]) { const gm = A.gun || A.mesh; if (!gm) continue; if (A.dead) { if (!A.burnt) { burn(A.mesh); A.burnt = true; } continue; }
    if (A.yaw != null && gm.userData.yawG) { gm.userData.yawG.rotation.y = A.yaw + (A.gun ? A.hd : 0); gm.userData.pitchG.rotation.x = -(A.pitch || .3); } }
  for (const p of W.target.parts) { if (p.mesh && p.hp <= 0 && !p.burnt) { burn(p.mesh); p.burnt = true; } if (p.mesh?.userData.spin && p.hp > 0) p.mesh.userData.spin.rotation.y += dt * 1.2; }
  if (W.target.mesh && G.success && !W.target.burnt) { burn(W.target.mesh); W.target.burnt = true; }
  // разрывы зениток
  for (const B of G.bursts) { const a = tNow - B.t0; if (!B.mesh) { const g = new THREE.Group(), f = new THREE.Mesh(GEO.ball, MAT.flash.clone()), sm = new THREE.Mesh(GEO.puff, MAT.smoke.clone()); sm.rotation.set(rnd() * 3, rnd() * 3, 0); g.add(sm, f); g.userData = { f, sm }; B.mesh = g; fxGroup.add(g); }
    const g = B.mesh; g.position.copy(B.pos); g.userData.f.visible = a < .3; g.userData.f.scale.setScalar(B.r * (.5 + 1.5 * a / .3)); g.userData.f.material.opacity = 1 - a / .3; g.userData.sm.scale.setScalar(B.r * (.5 + 1.1 * Math.sqrt(a / 2.4))); g.userData.sm.material.opacity = .7 * (1 - a / 2.4) * Math.min(1, B.pos.distanceTo(camera.position) / 80); }
  for (const sh of G.shells) { if (!sh.mesh) { sh.mesh = new THREE.Mesh(GEO.tracer, MAT.tracer); sh.mesh.frustumCulled = false; fxGroup.add(sh.mesh); }
    const k = clamp((tNow - sh.t0) / Math.max(1e-3, sh.tb - sh.t0), 0, 1); sh.mesh.position.lerpVectors(sh.from, sh.to, k); sh.mesh.lookAt(sh.to); const dc = sh.mesh.position.distanceTo(camera.position), wd = Math.max(.5, dc * .002); sh.mesh.scale.set(wd, wd, Math.max(25, dc * .03)); }
  for (const B of G.bombs) { if (!B.mesh) { B.mesh = new THREE.Mesh(GEO.bomb, MAT.dark); fxGroup.add(B.mesh); } B.mesh.position.copy(B.pos); B.mesh.lookAt(_a.copy(B.pos).add(B.vel)); B.mesh.scale.setScalar(1.6); }
  if (!MAT.flareS) { const mk = (stops, c) => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const x = cv.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, col]) => gr.addColorStop(o, col)); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); return new THREE.SpriteMaterial({ map: t, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, sizeAttenuation: false, fog: false }); };
    MAT.flareS = mk([[0, "#ffffff"], [.25, "#fff2c0"], [.6, "#ffb050"], [1, "rgba(255,120,30,0)"]], 0xffffff); MAT.flareH = mk([[0, "rgba(255,190,90,.55)"], [.5, "rgba(255,140,40,.18)"], [1, "rgba(255,100,20,0)"]], 0xffffff); }
  /* ловушки: яркие точки постоянного экранного размера (видны с любой камеры) + белый дымный след */
  /* обломки: куски обшивки, горящие, с дымным хвостом */
  if (!GEO.deb) { GEO.deb = [new THREE.BoxGeometry(6, .35, 3), new THREE.BoxGeometry(4.5, 1.6, 1.6), new THREE.CylinderGeometry(.8, 1, 4.5, 8).rotateZ(Math.PI / 2)]; MAT.deb = new THREE.MeshLambertMaterial({ color: 0x353b46, flatShading: true }); MAT.deb2 = new THREE.MeshLambertMaterial({ color: 0x1b1c1e, flatShading: true }); }
  for (const D of G.debris) { if (D.dead) continue; if (!D.mesh) { D.mesh = new THREE.Mesh(GEO.deb[D.kind], D.kind === 2 ? MAT.deb2 : MAT.deb); D.mesh.scale.setScalar(D.sc); fxGroup.add(D.mesh); if (D.fire) { D.sp = new THREE.Sprite(MAT.flareH); D.sp.renderOrder = 19; fxGroup.add(D.sp); } }
    D.mesh.position.copy(D.pos); D.mesh.rotation.set(D.rot.x, D.rot.y, D.rot.z); const age = tNow - D.t0;
    if (D.sp) { D.sp.position.copy(D.pos); const s = Math.max(0, .075 * (1 - age / 5) * (1 + .2 * Math.sin(age * 40 + D.sc * 9))); D.sp.scale.set(s, s, 1); D.sp.visible = s > .004; }
    if (age < 4.5 && tNow - D.trT > .08 && G.dsm && (!D.rest || age < 3)) { D.trT = tNow; putPuff(G.dsm, D.pos.x, D.pos.y, D.pos.z, D.rest ? .6 : 1, (D.rest ? 3.2 : 3.8) * (.6 + D.sc * .4)); } }
  for (const F of G.flares) { if (!F.mesh) { F.mesh = new THREE.Sprite(MAT.flareS); F.halo = new THREE.Sprite(MAT.flareH); F.mesh.renderOrder = F.halo.renderOrder = 20; fxGroup.add(F.mesh, F.halo); } const age = tNow - F.t0, fade = Math.max(.05, 1 - age / 4.2);
    F.mesh.position.copy(F.pos); F.halo.position.copy(F.pos); const s = .05 * (1 + .25 * Math.sin(tNow * 40 + F.t0 * 7)) * fade; F.mesh.scale.set(s, s, 1); F.halo.scale.set(s * 3.6, s * 3.6, 1);
    if (age < 3.4 && tNow - (F.trT || 0) > .06 && G.fx.length < 260) { F.trT = tNow; G.fx.push({ pos: F.pos.clone(), t0: tNow, r: 6.5, color: 0xffe0a0, mesh: null, smokeOnly: true, pale: true }); } }
  for (const m of G.missiles) {
    if (!m.mesh) { m.mesh = new THREE.Group(); const body = new THREE.Mesh(GEO.missile, MAT.white), fl = new THREE.Mesh(GEO.ball, MAT.flash.clone()); fl.position.z = 4; fl.scale.set(.8, .8, 3); m.mesh.add(body, fl); m.mesh.userData.fl = fl; fxGroup.add(m.mesh);
      const n = 90, geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3)); m.lineMesh = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xe8e4de, transparent: true, opacity: .7, depthWrite: false })); m.lineMesh.frustumCulled = false; fxGroup.add(m.lineMesh); }
    m.mesh.visible = m.alive; if (m.alive) { m.mesh.position.copy(m.pos); m.mesh.lookAt(_a.copy(m.pos).sub(m.vel)); m.mesh.scale.setScalar(1.8); m.mesh.userData.fl.visible = tNow - m.t0 < 4.5;
      if (tNow - (m.trT || 0) > .06) { m.trT = tNow; m.trail.unshift(m.pos.clone()); if (m.trail.length > 90) m.trail.pop(); } }
    const arr = m.lineMesh.geometry.attributes.position.array; for (let i = 0; i < 90; i++) { const q = m.trail[Math.min(i, m.trail.length - 1)] || m.pos; arr[3 * i] = q.x; arr[3 * i + 1] = q.y; arr[3 * i + 2] = q.z; } m.lineMesh.geometry.attributes.position.needsUpdate = true;
    if (!m.alive) { m.lineMesh.material.opacity = Math.max(0, .7 * (1 - (tNow - (m.deadT || tNow)) / 3)); if (tNow - (m.deadT || tNow) > 2.9) { drop(m.lineMesh); drop(m.mesh); } }
  }
}
/* убрать объект со сцены и освободить его собственные геометрии/материалы (общие из GEO/MAT не трогаем) */
let SHARED = null;
function drop(o) { if (!o) return; o.parent?.remove(o); SHARED ??= new Set([...Object.values(GEO), ...Object.values(MAT)]);
  o.traverse(q => { if (q.geometry && !SHARED.has(q.geometry)) q.geometry.dispose(); if (q.material && !SHARED.has(q.material)) q.material.dispose(); }); }
function burn(mesh) { mesh.traverse(o => { if (o.isMesh && o.material !== MAT.flash) { o.material = MAT.burnt; } }); mesh.scale.y *= .55; }
function bombersDraw(dt) {
  for (const b of G.bombers) { const m = b.mesh; if (!m) continue; m.visible = b.alive || tNow - (b.fallT || 0) < .1; if (!m.visible) { b.trail.visible = false; continue; }
    m.position.copy(b.pos); _m.makeBasis(b.r, b.u, _a.copy(b.f).negate()); m.quaternion.setFromRotationMatrix(_m);
    const th = .4 + 1.2 * (b.v / PL.VMAX); m.userData.flame.scale.set(1, 1, th); m.userData.fl2.scale.set(1, 1, th);
    const d = b.trail.userData; d.t += dt; if (d.t > .05) { d.t = 0; d.hist.unshift(b.pos.clone()); if (d.hist.length > d.n) d.hist.pop(); }
    const arr = b.trail.geometry.attributes.position.array; for (let i = 0; i < d.n; i++) { const q = d.hist[Math.min(i, d.hist.length - 1)] || b.pos; arr[3 * i] = q.x; arr[3 * i + 1] = q.y; arr[3 * i + 2] = q.z; } b.trail.geometry.attributes.position.needsUpdate = true;
    b.trail.material.color.set(b.falling ? 0x333333 : 0xffffff); b.trail.material.opacity = b.falling ? .9 : .3; b.trail.visible = false; emitSmoke(b);
    if (b.falling && tNow - (b.smT || 0) > .08) { b.smT = tNow; G.fx.push({ pos: b.pos.clone(), t0: tNow, r: 7, color: 0xff5010, mesh: null }); } }
}

/* ---------- камера ---------- */
let camMode = +S.cam || 0;
const cam = { f: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), off: null, pos: new THREE.Vector3() };
const CAMN = ["Сзади", "Далеко", "Из кабины", "С земли у цели", "Сверху"];
function cameraUpdate(dt) {
  const b = G.bombers[G.me] || G.bombers[0], p = b.pos;
  /* камера попадания: короткий план места разрыва сразу после сброса (только на автопилоте) */
  const ic = G.impactCam; if (ic && tNow < ic.until && camMode < 3 && b.alive && !b.falling && !ctl.steerMan) {
    if (ic.bomb && !ic.bomb.done) { /* вид «от бомбы»: камера летит вместе с бомбой чуть позади и выше, смотрит вперёд-вниз на цель */
      const B = ic.bomb, d = _b.copy(B.vel).normalize(); camera.position.copy(B.pos).addScaledVector(d, -9).addScaledVector(UP, 2.5); camera.up.set(0, 1, 0); camera.lookAt(_a.copy(B.pos).addScaledVector(d, 80)); cam.reset = true; if (cam.zoom) { cam.zoom = false; resize(); } return; }
    const gy = Math.max(0, W.gnd(ic.cp.x, ic.cp.z)); ic.cp.y = Math.max(ic.cp.y, gy + 70, gy + 70); camera.position.copy(ic.cp); camera.up.set(0, 1, 0); camera.lookAt(ic.x, ic.y + 20, ic.z); cam.reset = true; if (cam.zoom) { cam.zoom = false; resize(); } return; }
  const ad = G.adCam; if (ad && tNow < ad.until && camMode < 3 && b.alive && !b.falling && !ctl.steerMan && ad.tgt.alive && !ad.src.dead) {
    const tb = ad.tgt, s = ad.src, ex = tb.pos.x - s.x, ez = tb.pos.z - s.z, el = Math.hypot(ex, ez) || 1, sy = (s.y || 0) + 14;
    /* камера сбоку и чуть позади установки — сама она в кадр не лезет; сначала смотрим на ракету/трассы, потом на цель */
    const mm = ad.m, tt = tNow - ad.t0, chase = mm && tt > 2 && (mm.alive || (ad.mEnd && tNow < ad.mEnd));
    if (mm && !mm.alive && !ad.mEnd) { ad.mEnd = tNow + 1.6; ad.until = Math.max(ad.until, ad.mEnd); }
    if (mm && ad.until < ad.t0 + 12 && mm.alive) ad.until = Math.max(ad.until, tNow + .5); // пока ракета летит — следим за ней
    if (chase) { /* камера летит за ракетой, смотрит вперёд на цель; после разрыва — 1.6 с на месте */
      if (mm.alive && tt < 3) { /* вид «из носа ракеты» — секунда */ const d = _b.copy(mm.vel).normalize(); camera.position.copy(mm.pos).addScaledVector(d, 4); camera.up.set(0, 1, 0); camera.lookAt(_a.copy(mm.pos).addScaledVector(d, 200).lerp(tb.pos, .35)); cam.reset = true; if (cam.zoom) { cam.zoom = false; resize(); } return; }
      if (mm.alive) { const d = _b.copy(mm.vel).normalize(); ad.cp ??= new THREE.Vector3(); ad.cp.copy(mm.pos).addScaledVector(d, -30).addScaledVector(UP, 7); ad.look = _c.copy(mm.pos).addScaledVector(d, 70); if (mm.pos.distanceTo(tb.pos) < 900) ad.look.lerp(tb.pos, .75); ad.lk ??= new THREE.Vector3(); ad.lk.copy(ad.look); }
      camera.position.copy(ad.cp || mm.pos); camera.up.set(0, 1, 0); camera.lookAt(mm.alive ? ad.lk : tb.pos); cam.reset = true; if (cam.zoom) { cam.zoom = false; resize(); } return; }
    camera.position.set(s.x - ex / el * 40 - ez / el * 75, Math.max(sy + 8, Math.max(0, W.gnd(s.x - ex / el * 40 - ez / el * 75, s.z - ez / el * 40 + ex / el * 75)) + 22), s.z - ez / el * 40 + ex / el * 75); camera.up.set(0, 1, 0);
    const k = clamp((tNow - ad.t0 - .9) / 1.4, 0, 1), fp = ad.m && ad.m.alive ? ad.m.pos : tb.pos; camera.lookAt(_a.copy(fp).lerp(tb.pos, k));
    if (!cam.zoom || camera.fov !== 38) { camera.fov = 38; camera.updateProjectionMatrix(); cam.zoom = true; } cam.reset = true; return; }
  if (cam.zoom) { cam.zoom = false; resize(); }
  /* камера гибели: борт подбит или взорвался — смотрим со стороны, как он падает и взрывается */
  if ((b.falling || !b.alive) && camMode < 3) {
    if (!cam.dc) { const o = _a.copy(camera.position).sub(p); if (o.length() < 140) o.copy(b.r0).multiplyScalar(170).addScaledVector(UP, 40); else o.setLength(Math.min(o.length(), 280)); cam.dc = { off: o.clone(), p: camera.position.clone() }; }
    const dc = cam.dc; if (b.alive) dc.p.addScaledVector(b.f, b.v * .6 * dt); // пока падает — камера немного сопровождает
    const ang = dt * .22, c = Math.cos(ang), s = Math.sin(ang), ox = dc.off.x * c - dc.off.z * s; dc.off.z = dc.off.x * s + dc.off.z * c; dc.off.x = ox;
    camera.position.copy(b.alive ? dc.p : _b.copy(p).add(dc.off)); const gyy = Math.max(0, W.gnd(camera.position.x, camera.position.z)) + 6; if (camera.position.y < gyy) camera.position.y = gyy;
    camera.up.set(0, 1, 0); camera.lookAt(p); return; }
  if (b.alive && !b.falling) cam.dc = null;
  if (camMode === 3) { const tg = W.target, a = Math.atan2(W.start.z - tg.z, W.start.x - tg.x) + .6, cx = tg.x + Math.cos(a) * 700, cz = tg.z + Math.sin(a) * 700;
    camera.position.set(cx, Math.max(0, W.gnd(cx, cz)) + 25, cz); camera.up.set(0, 1, 0); camera.lookAt(p); return; }
  if (camMode === 4) { camera.position.set(p.x - b.f.x * 600, p.y + 1800, p.z - b.f.z * 600); camera.up.set(b.f.x, 0, b.f.z); camera.lookAt(p); return; }
  const ck = camMode === 2, m = [[60, 15], [190, 55], [0, 0]][camMode] || [60, 15];
  cam.f.lerp(b.f, 1 - Math.exp(-(ck ? 12 : 2.8) * dt)).normalize();
  cam.up.lerp(_b.copy(UP).lerp(ck ? b.u : b.u0, ck ? .95 : .25).normalize(), 1 - Math.exp(-(ck ? 10 : 2.2) * dt)).normalize();
  const offT = _a.copy(cam.f).multiplyScalar(-m[0]).addScaledVector(cam.up, m[1]); if (!cam.off || cam.reset) { cam.off = offT.clone(); cam.reset = false; }
  cam.off.lerp(offT, 1 - Math.exp(-(ck ? 40 : 3.5) * dt)); cam.pos.copy(p).add(cam.off);
  if (ck) cam.pos.copy(p).addScaledVector(b.u, 1.6).addScaledVector(b.f, -3);
  const gy = Math.max(0, W.gnd(cam.pos.x, cam.pos.z)) + 4; if (cam.pos.y < gy) cam.pos.y = gy;
  camera.position.copy(cam.pos); camera.up.copy(cam.up); camera.lookAt(_a.copy(p).addScaledVector(cam.f, ck ? 200 : 60));
}

/* ---------- HUD, мини-карта ---------- */
let mapImg = null;
function buildMinimap() {
  const c = document.createElement("canvas"), { nx, nz, h, land } = W; c.width = nx; c.height = nz; const g = c.getContext("2d"), im = g.createImageData(nx, nz);
  for (let k = 0; k < nx * nz; k++) { const y = h[k], L = land[k]; let r, gg, bb; if (!L) { r = 20; gg = 50; bb = 85; } else if (L === 2) { r = 190; gg = 190; bb = 195; } else { const t = Math.min(1, y / 900); r = 170 - 90 * t; gg = 160 - 40 * t; bb = 95 - 20 * t; if (y > 650) { r = 190; gg = 185; bb = 170; } } im.data.set([r, gg, bb, 255], k * 4); }
  g.putImageData(im, 0, 0); mapImg = c;
}
function drawMap() {
  const cv = $("map"), big = cv.classList.contains("big"), Wd = big ? 600 : 300, Hd = big ? 400 : 200; if (cv.width !== Wd) { cv.width = Wd; cv.height = Hd; }
  const g = cv.getContext("2d"), sx = Wd / W.W, sz = Hd / W.H; g.drawImage(mapImg, 0, 0, Wd, Hd);
  const P = (x, z) => [x * sx, z * sz];
  g.lineWidth = 1.5;
  for (const s of [...W.sams, ...W.ships.filter(s => s.kind === "frigate")]) { const [x, y] = P(s.x, s.z); g.strokeStyle = s.dead ? "#ffffff30" : "#ff404090"; g.beginPath(); g.ellipse(x, y, s.R * sx, s.R * sz, 0, 0, 7); g.stroke(); g.fillStyle = s.dead ? "#555" : "#ff3030"; g.fillRect(x - 3, y - 3, 6, 6); }
  for (const A of W.aaa) { const [x, y] = P(A.x, A.z); g.fillStyle = A.dead ? "#555" : "#ff9a30"; g.fillRect(x - 2, y - 2, 4, 4); }
  for (const s of W.ships) { const [x, y] = P(s.x, s.z); g.fillStyle = s.dead ? "#555" : "#ff60ff"; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  { const [x, y] = P(W.target.x, W.target.z); g.strokeStyle = G.success ? "#7dff9b" : "#ffd54a"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6, 0, 7); g.stroke(); g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.moveTo(x, y - 9); g.lineTo(x, y + 9); g.stroke(); }
  const me = G.bombers[G.me]; if (me && me.route) { g.strokeStyle = "#4fd8ff70"; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); me.route.forEach((q, i) => { const [x, y] = P(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); }
  for (const b of G.bombers) { if (!b.alive) continue; const [x, y] = P(b.pos.x, b.pos.z), a = Math.atan2(b.f.z, b.f.x); g.fillStyle = b.falling ? "#888" : b.id === G.me ? "#4fd8ff" : "#9ec9ff"; g.beginPath(); g.moveTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.lineTo(x + Math.cos(a + 2.5) * 5, y + Math.sin(a + 2.5) * 5); g.lineTo(x + Math.cos(a - 2.5) * 5, y + Math.sin(a - 2.5) * 5); g.fill(); }
  g.fillStyle = "#ff3030"; for (const m of G.missiles) if (m.alive) { const [x, y] = P(m.pos.x, m.pos.z); g.fillRect(x - 1.5, y - 1.5, 3, 3); }
}
let hudT = 0;
const PHN = { break: "Отворот после сброса", outbound: "Разворот на повторный заход", ingress: "Маловысотный проход", popup: "Горка перед целью", dive: "Атака: пикирование", release: "Сброс", missed: "Повторный заход", egress: "Отход к морю" };
function hud() {
  const b = G.bombers[G.me] || G.bombers[0], tg = W.target;
  $("vS").textContent = Math.round(b.v * 3.6); $("alt").textContent = `высота ${Math.round(agl(b.pos))} м · броня ${Math.max(0, b.hp)}/${PL.HP}`;
  $("phase").textContent = G.done ? (G.success ? "Задание выполнено" : "Задание сорвано") : b.falling ? "Борт подбит" : (b.safe ? "Ушли в море" : PHN[b.mode] || "");
  const left = tg.parts.filter(p => p.hp > 0).length;
  $("tgt").textContent = `${tg.name}: ${G.success ? "поражена" : `${Math.round(Math.hypot(tg.x - b.pos.x, tg.z - b.pos.z) / 100) / 10} км · разрушено ${tg.parts.length - left} из ${tg.need} нужных`}`;
  $("score").textContent = `раунд ${STATS.rounds} · успехов ${STATS.wins} · неудач ${STATS.losses}`;
  $("grp").innerHTML = G.bombers.map(q => `<div class="${q.id === G.me ? "me" : ""} ${q.alive && !q.falling ? "" : "dead"}">✈ Борт ${q.id + 1} · 💣${q.bombs} ✨${q.flares}${q.safe ? " · в море" : ""}</div>`).join("");
  $("nBm").textContent = b.bombs; $("nFl").textContent = b.flares;
  $("chip").textContent = ctl.steerMan ? "РУЧНОЕ" : "АВТОПИЛОТ"; $("chip").className = ctl.steerMan ? "man" : "auto";
  $("thr").className = ctl.steerMan || ctl.spdMan ? "man" : ""; $("thrFill").style.height = (ctl.steerMan || ctl.spdMan ? ctl.thr : (b.v - 120) / (PL.VMAX - 120)) * 100 + "%";
  const mis = G.missiles.find(m => m.alive && m.tgt === b && !m.decoy), w = $("warn");
  if (mis) { w.style.display = "block"; w.textContent = `⚠ РАКЕТА ${(mis.pos.distanceTo(b.pos) / 1000).toFixed(1)} км`; w.style.opacity = Math.sin(tNow * 18) > 0 ? 1 : .4; }
  else if (b.tracked > tNow) { w.style.display = "block"; w.textContent = "радар ЗРК видит нас"; w.style.opacity = .8; } else w.style.display = "none";
  drawMap();
}
/* прицел бомб: куда упадёт бомба, если сбросить сейчас (виден при ручном управлении и в атаке) */
function pipUpdate() { const b = G.bombers[G.me], el = $("pip"); if (!b || !b.alive || b.falling || b.bombs <= 0 || camMode > 2 || !(ctl.steerMan || b.mode === "dive" || b.mode === "release")) { el.style.display = "none"; return; }
  const I = impact(b.pos, _a.copy(b.f).multiplyScalar(b.v)), P = _b.copy(I).project(camera); if (P.z > 1) { el.style.display = "none"; return; }
  el.style.display = "block"; el.style.transform = `translate(${(P.x * .5 + .5) * innerWidth}px,${(-P.y * .5 + .5) * innerHeight}px)`;
  const tg = W.target, near = tg.parts.some(q => q.hp > 0 && Math.hypot(q.x - I.x, q.z - I.z) < 45); el.style.borderColor = near ? "#ff5040" : "#7dff9b"; }
function markUpdate() {
  const tg = W.target, P = _a.set(tg.x, tg.y + 20, tg.z).project(camera), el = $("mark");
  if (G.done) { el.style.display = "none"; return; }
  let x = (P.x * .5 + .5) * innerWidth, y = (-P.y * .5 + .5) * innerHeight; const behind = P.z > 1, inside = !behind && x > 20 && x < innerWidth - 20 && y > 90 && y < innerHeight - 20;
  if (!inside) { let dx = x - innerWidth / 2, dy = y - innerHeight / 2; if (behind) { dx = -dx; dy = -dy; } const k = Math.min((innerWidth / 2 - 30) / Math.abs(dx || 1), (innerHeight / 2 - 60) / Math.abs(dy || 1)); x = innerWidth / 2 + dx * k; y = innerHeight / 2 + dy * k; $("markArrow").setAttribute("transform", `rotate(${Math.atan2(dy, dx) * 57.3 + 90} 20 20)`); }
  else $("markArrow").setAttribute("transform", "rotate(180 20 20)");
  el.style.display = "block"; el.style.transform = `translate(${x}px,${y}px)`; $("markT").textContent = `${(Math.hypot(tg.x - G.bombers[G.me].pos.x, tg.z - G.bombers[G.me].pos.z) / 1000).toFixed(1)} км`;
}
function showSummary() {
  const c = Object.entries(G.causes).map(([k, v]) => `${k}: ${v}`).join(", ") || "без потерь", lost = G.bombers.filter(b => !b.alive || b.falling).length;
  const def = [...W.sams, ...W.aaa, ...W.ships].filter(s => s.dead).length;
  $("sum").innerHTML = `<h3>${G.success ? "✅ Цель поражена" : "❌ Задание сорвано"}</h3><p>${W.target.name}</p><p>Потеряно бортов: ${lost} из ${G.bombers.length} (${c})</p><p>Уничтожено средств ПВО: ${def}</p><p style="opacity:.6">Следующий раунд — новая карта…</p>`;
  $("sum").style.display = "block";
}
function hideSummary() { $("sum").style.display = "none"; }
let toastT = null; function toast(s, ms) { const t = $("toast"); t.textContent = s; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => t.style.opacity = 0, ms || 1500); }
function flash(o) { const f = $("flash"); f.style.opacity = o; setTimeout(() => f.style.opacity = 0, 90); }

/* ---------- кадр ---------- */
let lastT = 0, fEma = 0, qT = 0;
function frame(ms) {
  const t = ms / 1000, dt = Math.min(.1, t - lastT || .016); lastT = t; if (!G) return;
  let left = dt; const me0 = G.bombers[G.me], slow = me0 && ((G.impactCam && tNow < G.impactCam.until && tNow > G.impactCam.hit - 1.2 && !ctl.steerMan && me0.alive && !me0.falling && camMode < 3) || (me0.falling && tNow - (me0.fallT || 0) < 2.2) || (!me0.alive && tNow - (me0.deadT ?? -99) < 2.2)); // замедление на гибели борта
  if (slow) left *= .45;
  while (left > 1e-6 && !window.__freeze) { const d = Math.min(1 / 60, left); simStep(d); left -= d; }
  if (G.hitMsg && !G.hitMsg.shown) { G.hitMsg.shown = true; toast(G.hitMsg.txt, 2800); }
  cameraUpdate(dt); terrainLod(); sky.position.copy(camera.position); water.position.x = camera.position.x; water.position.z = camera.position.z;
  SM.uTime.value = tNow; SM.uPx.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360)); WU.uTime.value = t; bombersDraw(dt); objectsDraw(dt); fxDraw(dt);
  renderer.render(scene, camera);
  /* авто-чёткость: если кадры тяжёлые — снижаем разрешение рендера (до 55 %), если быстрые — возвращаем */
  { const ft = Math.min(.1, dt); fEma = fEma ? fEma + (ft - fEma) * .08 : ft; if (t - qT > 1.5 && !window.__noLoop) { qT = t; const want = fEma > .042 ? Math.max(.75, qAuto * .88) : fEma < .024 ? Math.min(1, qAuto * 1.08) : qAuto; if (Math.abs(want - qAuto) > .04) { qAuto = want; resize(); } } }
  if (t - hudT > .1) { hudT = t; hud(); } markUpdate(); pipUpdate();
}

/* ---------- ввод ---------- */
let stickId = null, thrId = null, sx0 = 0, sy0 = 0;
const zr = $("zoneR"), zl = $("zoneL"), st = $("stick");
zr.addEventListener("pointerdown", e => { if (stickId !== null) return; stickId = e.pointerId; zr.setPointerCapture(e.pointerId); sx0 = e.clientX; sy0 = e.clientY; st.style.display = "block"; st.style.left = sx0 + "px"; st.style.top = sy0 + "px"; ctl.stickDown = true; ctl.steerMan = true; ctl.lastStick = tNow; ctl.sx = ctl.sy = 0; });
zr.addEventListener("pointermove", e => { if (e.pointerId !== stickId) return; let dx = (e.clientX - sx0) / 60, dy = (e.clientY - sy0) / 60; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } ctl.sx = dx; ctl.sy = -dy; ctl.lastStick = tNow; st.firstChild.style.transform = `translate(${dx * 37}px,${dy * 37}px)`; });
const endStick = e => { if (e.pointerId !== stickId) return; stickId = null; st.style.display = "none"; ctl.stickDown = false; ctl.sx = ctl.sy = 0; ctl.lastStick = tNow; };
zr.addEventListener("pointerup", endStick); zr.addEventListener("pointercancel", endStick);
const setThr = e => { const r = $("thr").getBoundingClientRect(); ctl.thr = clamp((r.bottom + 10 - e.clientY) / (r.height + 20), 0, 1); ctl.spdMan = true; };
zl.addEventListener("pointerdown", e => { thrId = e.pointerId; zl.setPointerCapture(e.pointerId); setThr(e); });
zl.addEventListener("pointermove", e => { if (e.pointerId === thrId) setThr(e); });
zl.addEventListener("pointerup", () => thrId = null);
$("bAuto").onclick = () => { const b = G.bombers[G.me]; if (ctl.steerMan || ctl.spdMan) { ctl.steerMan = ctl.spdMan = false; if (b && b.alive) { if (b.bombs > 0 && !G.success) planIngress(b); else planEgress(b); } toast("Автопилот", 900); } else { ctl.steerMan = true; ctl.lastStick = tNow + 1e6; ctl.thr = clamp((b.v - 120) / (PL.VMAX - 120), 0, 1); toast("Ручное управление", 900); } };
/* полный экран */
{ const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen, FS = () => document.fullscreenElement || document.webkitFullscreenElement;
  if (!req) $("bFull").style.display = "none";
  $("bFull").onclick = async () => { try { if (FS()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else await req.call(el, { navigationUI: "hide" }); } catch { toast("Полный экран недоступен в этом браузере", 1800); } };
  const upd = () => { $("bFull").textContent = FS() ? "🗗" : "⛶"; setTimeout(resize, 150); }; document.addEventListener("fullscreenchange", upd); document.addEventListener("webkitfullscreenchange", upd); }
$("bCam").onclick = () => { camMode = (camMode + 1) % 5; S.cam = camMode; saveS(); cam.reset = true; toast(CAMN[camMode], 900); };
$("map").onclick = () => $("map").classList.toggle("big");
$("bBomb").addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); playerBomb(); });
$("bFlare").addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); playerFlare(); });
addEventListener("keydown", e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase(); ctl.keys[k] = true; ctl.keys[e.key] = true;
  if (e.key === " ") { $("bAuto").onclick(); e.preventDefault(); } if (k === "b" || k === "и" || k === "enter") playerBomb(); if (k === "f" || k === "а") playerFlare(); if (k === "c" || k === "с") $("bCam").onclick(); if (k === "m" || k === "ь") $("map").onclick(); if (k === "escape") $("panel").style.display = "none"; });
addEventListener("keyup", e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase(); ctl.keys[k] = false; ctl.keys[e.key] = false; });
/* панель */
const sel = { sDiff: "diff", sWing: "wing", sAgl: "agl", sResume: "resume", sLife: "life", sQ: "q", sInv: "inv" };
$("bSet").onclick = () => { for (const [id, k] of Object.entries(sel)) $(id).value = String(S[k]); $("panel").style.display = "block"; };
for (const [id, k] of Object.entries(sel)) $(id).onchange = e => { S[k] = +e.target.value; saveS(); if (k === "q") resize(); };
$("bClose").onclick = () => { $("panel").style.display = "none"; };
$("bNew").onclick = () => { $("panel").style.display = "none"; hideSummary(); newRound(); };

/* ---------- запуск ---------- */
initGfx();
setTimeout(() => { newRound(S.seed ? S.seed + 1 : 1 + Math.floor(Math.random() * 999)); $("loading").style.display = "none"; renderer.setAnimationLoop(frame);
  $("hint").textContent = "правая часть экрана — стик · 💣 бомбы · ✨ ловушки"; setTimeout(() => $("hint").textContent = "", 6000); }, 30);

/* тесты: симуляция без графики */
window.__cr = { sim(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) simStep(dt); return this.state(); },
  state() { return { round: STATS.rounds, t: +tNow.toFixed(1), done: G.done, success: G.success, causes: G.causes, bombers: G.bombers.map(b => ({ id: b.id, alive: b.alive && !b.falling, mode: b.mode, bombs: b.bombs, hp: b.hp, agl: Math.round(agl(b.pos)), v: Math.round(b.v) })), left: W.target.parts.filter(p => p.hp > 0).length, target: W.target.type, missiles: G.missiles.length }; },
  newRound, get W() { return W; }, get G() { return G; }, STATS, S, seedRnd, renderer: () => renderer, scene: () => scene, camera: () => camera, frame, setCam: m => { camMode = m; cam.reset = true; } };
