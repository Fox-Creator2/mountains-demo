/* «Конфликт в Криму» — генератор мира. Без графики: только числа, чтобы проверять автотестами.
   Полуостров «в духе Крыма»: степь и солёные озёра на севере, узкий перешеек к материку, горная гряда с плато (яйла)
   и обрывами вдоль южного берега, извилистые бухты-фьорды на юго-западе, вытянутый восточный выступ.
   Координаты: x — восток (0…W), z — юг (0…H), y — высота, метры. Каждый раунд — новый seed. */

export function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* шум значений (value noise) с плавной интерполяцией, fbm — сумма октав */
export function makeNoise(r) {
  const P = new Uint16Array(512), V = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; V[i] = r() * 2 - 1; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const f = t => t * t * (3 - 2 * t);
  const n2 = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const a = V[P[P[X] + Y]], b = V[P[P[X + 1] + Y]], c = V[P[P[X] + Y + 1]], d = V[P[P[X + 1] + Y + 1]], u = f(xf), v = f(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const fbm = (x, y, o = 4) => { let s = 0, a = 1, n = 0; for (let i = 0; i < o; i++) { s += a * n2(x, y); n += a; a *= .5; x = x * 2.03 + 17.1; y = y * 2.03 - 9.7; } return s / n; };
  return { n2, fbm };
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
export const TARGET_NAMES = { depot: "Склад горючего", radar: "Радиолокационный пост", airfield: "Аэродром", ship: "Корабль в бухте", bridge: "Узел связи" };

export function genWorld(seed, opt = {}) {
  const r = rng(seed), N = makeNoise(r), W = opt.W || 36000, H = opt.H || 24000, cs = opt.cs || 120;
  const nx = Math.round(W / cs) + 1, nz = Math.round(H / cs) + 1, J = (a, b) => a + (b - a) * r();
  /* ---------- 1. береговая линия: «знаковое расстояние» до моря (плюс — суша) ---------- */
  const body = { cx: W * J(.43, .5), cz: H * J(.53, .58), rx: W * J(.27, .31), rz: H * J(.26, .3) };
  const east = { cx: W * J(.78, .84), cz: H * J(.45, .52), rx: W * J(.13, .16), rz: H * J(.06, .085) };
  const nw = { cx: W * J(.15, .22), cz: H * J(.36, .42), rx: W * J(.08, .11), rz: H * J(.05, .07) };
  const isthX = W * J(.3, .42), mainZ = H * J(.04, .07);
  const ell = (x, z, e) => (1 - Math.hypot((x - e.cx) / e.rx, (z - e.cz) / e.rz)) * Math.min(e.rx, e.rz);
  const sdf0 = (x, z) => {
    let s = Math.max(ell(x, z, body), ell(x, z, east), ell(x, z, nw));
    s = Math.max(s, Math.min(650 - Math.abs(x - isthX + 400 * N.n2(z / 3000, 3.3)), body.cz - z)); // перешеек к материку
    s = Math.max(s, mainZ - z + 500 * N.fbm(x / 5000, 1.7, 3));                                      // материк на севере
    return s + 1100 * N.fbm(x / 9000 + 3.1, z / 9000, 3) + 380 * N.fbm(x / 2600, z / 2600 + 7.7, 3) + 90 * N.n2(x / 600, z / 600);
  };
  /* ---------- 2. бухты: извилистые узкие заливы с юго-запада внутрь суши ---------- */
  const bays = [], nb = 2 + Math.floor(r() * 3);
  for (let b = 0; b < nb; b++) {
    const ang = Math.PI * J(.72, .97) + (b - nb / 2) * .12;                                 // сектор: юго-запад…запад
    let px = body.cx, pz = body.cz + body.rz * .15; const dx = Math.cos(ang), dz = Math.sin(ang); // луч от центра к берегу
    for (let k = 0; k < 400 && sdf0(px, pz) > 0; k++) { px += dx * 60; pz += dz * 60; }
    if (px < 1500 || pz > H - 1500) continue;
    let hd = Math.atan2(-dz, -dx) + J(-.3, .3), x = px - Math.cos(hd) * 600, z = pz - Math.sin(hd) * 600; const L = J(2600, 5200), w0 = J(230, 380), pts = [];
    for (let i = 0; i <= 14; i++) { pts.push([x, z]); hd += J(-.16, .16); x += Math.cos(hd) * L / 14; z += Math.sin(hd) * L / 14; }
    if (bays.some(o => Math.hypot(o.pts[3][0] - pts[3][0], o.pts[3][1] - pts[3][1]) < 2200)) continue;
    bays.push({ pts, w0, L });
  }
  const bayD = (x, z) => { let best = 1e9; // расстояние до оси бухты минус её полуширина (минус — вода)
    for (const B of bays) { const p = B.pts; for (let i = 0; i < p.length - 1; i++) { const ax = p[i][0], az = p[i][1], bx = p[i + 1][0], bz = p[i + 1][1], ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
      const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)), d = Math.hypot(x - ax - ex * u, z - az - ez * u), t = (i + u) / (p.length - 1);
      best = Math.min(best, d - B.w0 * (1 - .55 * t) * (1 + .25 * N.n2(x / 400, z / 400))); } }
    return best; };
  /* ---------- 3. сетка: суша/вода, расстояния до берега ---------- */
  const n = nx * nz, sdf = new Float32Array(n), land = new Uint8Array(n);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = i * cs, z = j * cs, k = j * nx + i; let s = sdf0(x, z); if (bays.length && s > -300) s = Math.min(s, bayD(x, z)); sdf[k] = s; land[k] = s > 0 ? 1 : 0; }
  // мелкие острова и озёра-точки убираем (оставляем озёра на севере — ниже)
  const chamfer = isLand => { const d = new Float32Array(n), INF = 1e9, d1 = cs, d2 = cs * Math.SQRT2;
    for (let k = 0; k < n; k++) d[k] = (land[k] === 1) === isLand ? INF : 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!d[k]) continue; let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + d1); if (j > 0) { v = Math.min(v, d[k - nx] + d1); if (i > 0) v = Math.min(v, d[k - nx - 1] + d2); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + d2); } d[k] = v; }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (!d[k]) continue; let v = d[k];
      if (i < nx - 1) v = Math.min(v, d[k + 1] + d1); if (j < nz - 1) { v = Math.min(v, d[k + nx] + d1); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + d2); if (i > 0) v = Math.min(v, d[k + nx - 1] + d2); } d[k] = v; }
    return d; };
  const dIn = chamfer(true), dOut = chamfer(false);
  // расстояние до моря строго к югу (для южной гряды): идём по столбцу с юга на север
  const dS = new Float32Array(n);
  for (let i = 0; i < nx; i++) { let d = 0; for (let j = nz - 1; j >= 0; j--) { const k = j * nx + i; d = land[k] ? d + cs : 0; dS[k] = d; } }
  /* ---------- 4. высоты ---------- */
  const w_cz = body.cz, w_rz = body.rz, h = new Float32Array(n), ridgeX0 = W * J(.16, .24), ridgeX1 = W * J(.6, .7), Hp = J(700, 1050), lakes = [];
  const nl = 2 + Math.floor(r() * 3); for (let i = 0; i < nl; i++) lakes.push({ x: J(.25, .7) * W, z: body.cz - body.rz * J(.35, .75), r: J(500, 1300) });
  const mt = new Float32Array(n); // «горность» 0…1 — для цвета и леса
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = i * cs, z = j * cs;
    if (!land[k]) { h[k] = Math.max(-180, Math.min(-.3, sdf[k] * .06) - dOut[k] * .03 * (bays.length && bayD(x, z) < 0 ? .4 : 1)); continue; } // у берега высота ~ знаковому расстоянию: линия воды плавная, без «лесенки» сетки
    // степь: пологие волны 10…70 м
    let y = 18 + 26 * (N.fbm(x / 7000, z / 7000, 3) * .5 + .5) + 7 * N.n2(x / 900, z / 900);
    // южная гряда: обрыв к морю → плато → длинный северный склон с куэстами и долинами рек
    const fx = sstep(ridgeX0 - 2000, ridgeX0 + 2500, x) * (1 - sstep(ridgeX1 - 2500, ridgeX1 + 2000, x)) * sstep(w_cz - w_rz * .1, w_cz + w_rz * .3, z), d = dIn[k];
    let m = 0;
    if (fx > 0 && d < 8000) {
      const p = d < 400 ? .05 * d / 400 : d < 2000 ? .05 + .95 * Math.pow(sstep(400, 2000, d), .8) : d < 3200 ? 1 : Math.pow(1 - sstep(3200, 6500, d), 1.5);
      const karst = d > 2000 && d < 3200 ? 70 * N.fbm(x / 1200, z / 1200, 3) : 0;
      const cuesta = 120 * Math.max(0, N.fbm(x / 2500 + 9, z / 1400, 3)) * sstep(2500, 4500, d) * (1 - sstep(6500, 8000, d));
      const vr = N.fbm(x / 2600 + 4.4, z / 5200, 3) + .25 * N.n2(x / 700, z / 700); // долины: узкие русла поперёк склона
      const valley = Math.exp(-vr * vr / .006) * sstep(1200, 2800, d);
      m = fx * p; y += fx * (Hp * p * (1 + .12 * N.fbm(x / 3000, z / 3000, 2)) + karst + cuesta) * (1 - .55 * valley);
    }
    // восточный выступ — невысокие холмы
    const ee = ell(x, z, east); if (ee > 0) y += 90 * sstep(0, 2500, ee) * (N.fbm(x / 1800, z / 1800, 3) * .5 + .5);
    // солёные озёра на севере
    for (const L of lakes) { const dd = Math.hypot(x - L.x, z - L.z) / L.r + .35 * N.n2(x / 500, z / 500); if (dd < 1) { y = Math.min(y, -2); } else if (dd < 1.4) y = Math.min(y, lerp(3, y, (dd - 1) / .4)); }
    // у берега — пляж; на юге у гряды допускается обрыв
    const slope = m > .3 ? 2.2 : .5; y = Math.min(y, .4 + Math.max(0, sdf[k]) * slope);
    h[k] = Math.max(-2, y); mt[k] = m;
  }
  // озёра — тоже вода (для цвета и кораблей не годятся)
  for (let k = 0; k < n; k++) if (land[k] && h[k] <= -1) land[k] = 2;
  /* ---------- выборка высоты (билинейно) ---------- */
  const at = (A, x, z) => { const fx = Math.max(0, Math.min(nx - 1.001, x / cs)), fz = Math.max(0, Math.min(nz - 1.001, z / cs)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * nx + i;
    return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + nx] * (1 - u) + A[k + nx + 1] * u) * v; };
  const gnd = (x, z) => (x < 0 || z < 0 || x > W || z > H) ? -150 : at(h, x, z);
  const isSea = (x, z) => { const i = Math.round(x / cs), j = Math.round(z / cs); return i < 0 || j < 0 || i >= nx || j >= nz || land[j * nx + i] === 0; };
  const world = { seed, W, H, cs, nx, nz, h, land, dIn, dOut, mt, bays, lakes, gnd, isSea, at, body };
  placeObjects(world, r, N);
  return world;
}

/* ---------- объекты: цель, ПВО, корабли, точки входа и выхода ---------- */
function placeObjects(w, r, N) {
  const { W, H, cs, nx, nz, h, land, dIn, gnd } = w, J = (a, b) => a + (b - a) * r();
  const slopeAt = (x, z) => Math.hypot(gnd(x + 60, z) - gnd(x - 60, z), gnd(x, z + 60) - gnd(x, z - 60)) / 120;
  const landPick = (test, tries = 3000) => { for (let t = 0; t < tries; t++) { const x = J(1500, W - 1500), z = J(1500, H - 1500), i = Math.round(x / cs), j = Math.round(z / cs), k = j * nx + i; if (land[k] === 1 && test(x, z, k)) return [x, z]; } return null; };
  const types = ["depot", "radar", "airfield", "depot", "radar"]; if (w.bays.length) types.push("ship", "ship");
  let type = types[Math.floor(r() * types.length)], tgt = null;
  if (type === "ship") { const B = w.bays[Math.floor(r() * w.bays.length)], i = 5 + Math.floor(r() * 4), p = B.pts[i], q = B.pts[i + 1];
    tgt = { type, x: p[0], z: p[1], hd: Math.atan2(q[1] - p[1], q[0] - p[0]), bay: B }; }
  else {
    const flatOK = (x, z, k) => dIn[k] > 2500 && h[k] < 380 && slopeAt(x, z) < .06 && z > H * .2;
    let p = landPick((x, z, k) => flatOK(x, z, k) && (type !== "airfield" || [-1, -.5, .5, 1].every(s => { const a = .4; return slopeAt(x + s * 1200 * Math.cos(a), z + s * 1200 * Math.sin(a)) < .07 && gnd(x + s * 1200 * Math.cos(a), z + s * 1200 * Math.sin(a)) > 3; })));
    if (!p && type === "airfield") { type = "depot"; p = landPick(flatOK); }
    if (!p) p = landPick((x, z, k) => dIn[k] > 1500);
    tgt = { type, x: p[0], z: p[1], hd: type === "airfield" ? .4 : r() * 6.28 };
  }
  tgt.name = TARGET_NAMES[type]; tgt.y = type === "ship" ? 0 : gnd(tgt.x, tgt.z);
  /* части цели: что нужно разрушить (≥60 % — задание выполнено) */
  const parts = [], c = Math.cos(tgt.hd), s = Math.sin(tgt.hd), P = (a, b, kind, sz) => { const x = tgt.x + a * c - b * s, z = tgt.z + a * s + b * c; parts.push({ kind, x, z, y: type === "ship" ? 0 : gnd(x, z), sz, hp: 1 }); };
  if (type === "depot") { for (let i = 0; i < 6; i++) P(-110 + (i % 3) * 110, i < 3 ? -55 : 55, "tank", 22); P(-60, 190, "shed", 40); P(110, 190, "shed", 40); }
  else if (type === "radar") { P(0, 0, "dish", 26); P(-70, 40, "bunker", 30); P(60, -50, "mast", 10); P(90, 60, "bunker", 30); }
  else if (type === "airfield") { for (let i = 0; i < 4; i++) P(-450 + i * 160, 170, "hangar", 45); for (let i = 0; i < 4; i++) P(-380 + i * 160, 110, "jet", 16); P(250, 190, "tower", 15); }
  else { P(-40, 0, "hull", 0); P(40, 0, "hull", 0); }
  tgt.parts = parts; tgt.need = { depot: 3, radar: 2, airfield: 3, ship: 1 }[type] || 2; w.target = tgt; // сколько частей разрушить для успеха
  /* ПВО: ЗРК (радар + пусковые), зенитная артиллерия, корабли в бухтах */
  const sams = [], aaa = [], ships = [];
  const far = (L, x, z, d) => L.every(o => Math.hypot(o.x - x, o.z - z) > d);
  // ЗРК рядом с целью (прикрытие)
  for (let t = 0; t < 200 && sams.length < 1; t++) { const a = r() * 6.28, d = J(1500, 3200), x = tgt.x + Math.cos(a) * d, z = tgt.z + Math.sin(a) * d; if (gnd(x, z) > 4 && !w.isSea(x, z)) sams.push({ x, z }); }
  // остальные — на возвышенностях и вдоль берегов, разнесённые
  const nS = 2 + Math.floor(r() * 3);
  for (let t = 0; t < 4000 && sams.length < nS + 1; t++) { const x = J(2000, W - 2000), z = J(2000, H - 2000), i = Math.round(x / cs), j = Math.round(z / cs), k = j * nx + i;
    if (land[k] !== 1 || dIn[k] < 800 || slopeAt(x, z) > .12) continue; if (!far(sams, x, z, 6500)) continue; if (h[k] < 60 && r() < .5) continue; sams.push({ x, z }); }
  for (const S of sams) { S.y = gnd(S.x, S.z); S.R = 12000; S.Rr = 22000; S.ammo = 6; S.next = 0; S.kind = "sam"; S.hd = r() * 6.28; }
  // корабли: в каждой бухте 1–2; фрегат с ЗРК и пушкой или сторожевой катер с пушкой
  for (const B of w.bays) { const m = 1 + (r() < .5 ? 1 : 0);
    for (let q = 0; q < m; q++) { const i = q ? 8 + Math.floor(r() * 3) : 3 + Math.floor(r() * 3), p = B.pts[i], p2 = B.pts[i + 1];
      if (tgt.type === "ship" && Math.hypot(p[0] - tgt.x, p[1] - tgt.z) < 500) continue;
      const frig = q === 0 || r() < .4; ships.push({ x: p[0], z: p[1], y: 0, hd: Math.atan2(p2[1] - p[1], p2[0] - p[0]), kind: frig ? "frigate" : "boat", R: 10000, Rr: 18000, ammo: frig ? 8 : 0, next: 0, hp: frig ? 3 : 1 }); } }
  // зенитки: вокруг цели, у бухт и у ЗРК
  for (let i = 0; i < 3; i++) { const a = tgt.hd + i * 2.1 + J(-.4, .4), d = J(500, 1100); aaa.push({ x: tgt.x + Math.cos(a) * d, z: tgt.z + Math.sin(a) * d }); }
  for (const S of sams.slice(1)) if (r() < .6) { const a = r() * 6.28; aaa.push({ x: S.x + Math.cos(a) * 400, z: S.z + Math.sin(a) * 400 }); }
  for (const B of w.bays) { const p = B.pts[2], q = B.pts[4]; for (const pp of [p, q]) { const a = r() * 6.28; for (let d = 300; d < 900; d += 150) { const x = pp[0] + Math.cos(a) * d, z = pp[1] + Math.sin(a) * d; if (!w.isSea(x, z) && gnd(x, z) > 3) { aaa.push({ x, z }); break; } } } }
  for (const A of aaa) { A.y = Math.max(1, gnd(A.x, A.z)); A.R = 3200; A.next = 0; A.kind = "aaa"; A.yaw = 0; A.pitch = .4; }
  w.sams = sams; w.aaa = aaa.filter(A => !w.isSea(A.x, A.z)); w.ships = ships;
  /* вход: открытое море с той стороны, где до цели ближе и меньше ПВО; выход — там же, где-то в море */
  let best = null;
  for (let t = 0; t < 60; t++) { const side = Math.floor(r() * 3), x = side === 0 ? 600 : side === 1 ? J(2000, W - 2000) : W - 600, z = side === 1 ? H - 600 : J(H * .45, H - 1500);
    if (!w.isSea(x, z)) continue; const d = Math.hypot(x - tgt.x, z - tgt.z); let threat = 0; for (const S of sams) { const ux = (S.x - x), uz = (S.z - z), L = d, ex = (tgt.x - x) / L, ez = (tgt.z - z) / L, along = ux * ex + uz * ez, perp = Math.abs(ux * ez - uz * ex); if (along > 0 && along < L && perp < 9000) threat += 1 - perp / 9000; }
    const score = d / 1000 + threat * 6 + r() * 4; if (!best || score < best.score) best = { x, z, score }; }
  w.start = best || { x: 600, z: H - 600 };
}

/* ---------- видимость радаром: прямая от антенны до точки не задевает рельеф ---------- */
export function losClear(w, ax, ay, az, bx, by, bz, step = 160) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(d / step));
  for (let i = 1; i < n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t; if (y < w.gnd(x, z) + 3) return false; }
  return true;
}

/* ---------- планировщик маршрута: Дейкстра по сетке 300 м; цена клетки = длина × (1 + угроза).
   Угроза: клетку видит радар ЗРК/корабля на высоте полёта 60 м над рельефом и она в зоне ракет; зенитки — ближняя зона. ---------- */
export function threatMap(w, agl = 60, G = 300) {
  const gx = Math.ceil(w.W / G) + 1, gz = Math.ceil(w.H / G) + 1, T = new Float32Array(gx * gz), radars = [...w.sams.filter(s => !s.dead).map(s => ({ x: s.x, y: s.y + 18, z: s.z, R: s.R, Rr: s.Rr })), ...w.ships.filter(s => s.kind === "frigate" && !s.dead).map(s => ({ x: s.x, y: 25, z: s.z, R: s.R, Rr: s.Rr }))];
  for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) {
    const x = i * G, z = j * G, y = Math.max(0, w.gnd(x, z)) + agl; let t = 0;
    for (const S of radars) { const d = Math.hypot(x - S.x, z - S.z); if (d > S.R * 1.15) continue; if (!losClear(w, S.x, S.y, S.z, x, y, z, 220)) continue; t += 6 * (1.15 - d / S.R) + 1; }
    for (const A of w.aaa) { if (A.dead) continue; const d = Math.hypot(x - A.x, z - A.z); if (d < A.R) t += 2.5 * (1 - d / A.R); }
    T[j * gx + i] = t;
  }
  return { gx, gz, G, T };
}
export function planRoute(w, TM, from, goalFn, noise = 0, seed = 1) {
  const { gx, gz, G, T } = TM, n = gx * gz, dist = new Float32Array(n).fill(1e18), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n), r = rng(seed), jit = new Float32Array(n);
  for (let k = 0; k < n; k++) jit[k] = 1 + noise * (r() - .5);
  const s = Math.max(0, Math.min(gz - 1, Math.round(from.z / G))) * gx + Math.max(0, Math.min(gx - 1, Math.round(from.x / G))); dist[s] = 0;
  // двоичная куча
  const hp = [], push = (k, d) => { hp.push([d, k]); let i = hp.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hp[p][0] <= hp[i][0]) break; [hp[p], hp[i]] = [hp[i], hp[p]]; i = p; } };
  const pop = () => { const top = hp[0], last = hp.pop(); if (hp.length) { hp[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, rr = l + 1; let m = i; if (l < hp.length && hp[l][0] < hp[m][0]) m = l; if (rr < hp.length && hp[rr][0] < hp[m][0]) m = rr; if (m === i) break; [hp[m], hp[i]] = [hp[i], hp[m]]; i = m; } } return top; };
  push(s, 0); let goal = -1;
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (hp.length) { const [d, k] = pop(); if (done[k]) continue; done[k] = 1; const i = k % gx, j = (k - i) / gx;
    if (goalFn(i * G, j * G)) { goal = k; break; }
    for (const [di, dj, l] of D) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= gx || b >= gz) continue; const q = b * gx + a; if (done[q]) continue;
      const hh = Math.max(0, w.gnd(a * G, b * G)), climb = hh > 500 ? (hh - 500) / 400 : 0; // высокие горы — дороже (дольше набор, виден издалека)
      const c = d + l * G * (1 + 1.6 * T[q] + climb) * jit[q]; if (c < dist[q]) { dist[q] = c; prev[q] = k; push(q, c); } } }
  if (goal < 0) return null;
  const pts = []; for (let k = goal; k >= 0; k = prev[k]) { const i = k % gx; pts.push([i * G, (k - i) / gx * G]); }
  pts.reverse(); pts[0] = [from.x, from.z];
  return smoothPath(pts);
}
/* сглаживание: усреднение соседей (углы маршрута → плавные дуги) */
function smoothPath(p) {
  let a = p.map(q => q.slice());
  for (let it = 0; it < 6; it++) { const b = a.map(q => q.slice()); for (let i = 1; i < a.length - 1; i++) { b[i][0] = (a[i - 1][0] + 2 * a[i][0] + a[i + 1][0]) / 4; b[i][1] = (a[i - 1][1] + 2 * a[i][1] + a[i + 1][1]) / 4; } a = b; }
  return a;
}
