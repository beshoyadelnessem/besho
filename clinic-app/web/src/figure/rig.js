// Flat-style exercise figure. A pose is a set of joint angles (degrees, SVG
// coordinates: 0 = right, 90 = down) plus optional IK targets for planted feet
// and hands. Two poses per exercise are blended by t in [0, 1].

const L = { torso: 118, neck: 14, head: 30, upper: 62, fore: 56, thigh: 102, shin: 98, foot: 38 };

export const SKIN = {
  1: '#F7D3B8', 2: '#EDB993', 3: '#C98D64', 4: '#8B5A3C',
};
const HAIR = { dark: '#2F2A28', grey: '#B9B5B1' };
const C = {
  top: '#F4F4F4', topShade: '#E3E3E3', shorts: '#FDB13B', shortsShade: '#EFA22E',
  shoe: '#F5A623', sole: '#E08E0B', modestTop: '#E7EEF6', sleeve: '#C5D4E6', pants: '#46597F', hijab: '#7C5CBF',
};

const rad = (d) => (d * Math.PI) / 180;
const dir = (d) => [Math.cos(rad(d)), Math.sin(rad(d))];
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const ang = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const shade = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k)
  .toString(16).padStart(2, '0')).join('');

// two-bone IK: root, target, lengths, bend side (+1 / -1) -> middle joint
function ik(root, target, l1, l2, bend) {
  const dx = target[0] - root[0], dy = target[1] - root[1];
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const base = Math.atan2(dy, dx) + bend * a;
  return [root[0] + l1 * Math.cos(base), root[1] + l1 * Math.sin(base)];
}

// Limbs blend in IK space when both poses plant the same end point (feet stay put),
// otherwise in joint-angle space.
function limbAngles(root, spec, l1, l2, isLeg) {
  if (!spec.ik) return spec;
  const mid = ik(root, spec.ik, l1, l2, spec.bend ?? (isLeg ? -1 : 1));
  const o = isLeg ? { thigh: ang(root, mid), shin: ang(mid, spec.ik) } : { upper: ang(root, mid), fore: ang(mid, spec.ik) };
  if (isLeg) o.foot = spec.foot ?? 0;
  return o;
}
function blendLimb(a, b, t, rootA, rootB, l1, l2, isLeg) {
  if (a.ik && b.ik) {
    return { ik: [lerp(a.ik[0], b.ik[0], t), lerp(a.ik[1], b.ik[1], t)], bend: a.bend,
      ...(isLeg ? { foot: lerp(a.foot ?? 0, b.foot ?? 0, t) } : {}) };
  }
  const A = limbAngles(rootA, a, l1, l2, isLeg), B = limbAngles(rootB, b, l1, l2, isLeg);
  const out = {};
  for (const k of Object.keys(A)) out[k] = lerp(A[k], B[k], t);
  return out;
}
const shoulderOf = (p) => add(add(p.hip, dir(p.torso), L.torso), dir(p.torso), -8);
export function blend(A, B, t) {
  const sA = shoulderOf(A), sB = shoulderOf(B);
  return {
    hip: [lerp(A.hip[0], B.hip[0], t), lerp(A.hip[1], B.hip[1], t)],
    torso: lerp(A.torso, B.torso, t),
    head: lerp(A.head ?? A.torso, B.head ?? B.torso, t),
    face: A.face === 'front' ? 'front' : lerp(A.face, B.face, t),
    near: blendLimb(A.near, B.near, t, A.hip, B.hip, L.thigh, L.shin, true),
    far: blendLimb(A.far, B.far, t, A.hip, B.hip, L.thigh, L.shin, true),
    armN: blendLimb(A.armN, B.armN, t, sA, sB, L.upper, L.fore, false),
    armF: blendLimb(A.armF, B.armF, t, sA, sB, L.upper, L.fore, false),
  };
}

function leg(hip, spec) {
  const knee = spec.ik ? ik(hip, spec.ik, L.thigh, L.shin, spec.bend ?? -1) : add(hip, dir(spec.thigh), L.thigh);
  const ankle = spec.ik ? spec.ik : add(knee, dir(spec.shin), L.shin);
  const toe = add(ankle, dir(spec.foot), L.foot);
  return { hip, knee, ankle, toe };
}
function arm(shoulder, spec) {
  const elbow = spec.ik ? ik(shoulder, spec.ik, L.upper, L.fore, spec.bend ?? 1) : add(shoulder, dir(spec.upper), L.upper);
  const hand = spec.ik ? spec.ik : add(elbow, dir(spec.fore), L.fore);
  return { shoulder, elbow, hand };
}

const seg = (a, b, w, color) =>
  `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
const circ = (c, r, color) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${r}" fill="${color}"/>`;

function drawLeg(g, look, far) {
  const k = far ? 0.88 : 1;
  const skin = shade(look.skin, k);
  const thighCol = look.modest ? shade(C.pants, k) : skin;
  const shinCol = look.modest ? shade(C.pants, k) : skin;
  let s = seg(g.hip, g.knee, 38, thighCol) + seg(g.knee, g.ankle, 29, shinCol);
  if (!look.modest) s += seg(g.hip, add(g.hip, dir(ang(g.hip, g.knee)), 44), 44, shade(far ? C.shortsShade : C.shorts, 1));
  // shoe: heel behind the ankle to the toe, sole on the side away from the knee
  const fd = dir(ang(g.ankle, g.toe));
  const heel = add(g.ankle, fd, -8);
  let n = [-fd[1], fd[0]];
  const toKnee = [g.knee[0] - g.ankle[0], g.knee[1] - g.ankle[1]];
  if (n[0] * toKnee[0] + n[1] * toKnee[1] > 0) n = [-n[0], -n[1]];
  s += seg(heel, g.toe, 22, shade(C.shoe, k)) + seg(add(heel, n, 7), add(g.toe, n, 7), 8, shade(C.sole, k));
  return s;
}
function drawArm(g, look, far) {
  const k = far ? 0.88 : 1;
  const skin = shade(look.skin, k);
  const sleeve = look.modest ? shade(C.sleeve, k) : skin;
  let s = seg(g.shoulder, g.elbow, 22, sleeve) + seg(g.elbow, g.hand, 19, look.modest ? sleeve : skin) + circ(g.hand, 11, skin);
  if (!look.modest) s += circ(g.shoulder, 13, shade(C.shoe, k));
  return s;
}
function drawHead(c, headDir, face, look) {
  const hd = dir(headDir);
  if (look.hijab) {
    const f = face === 'front' ? [0, 0] : dir(face);
    return circ(add(c, f, -2), 35, C.hijab) + circ(add(c, f, face === 'front' ? 0 : 10), 22, look.skin);
  }
  const hair = look.grey ? HAIR.grey : HAIR.dark;
  let s;
  if (face === 'front') {
    s = circ(c, 32, hair) + circ(add(c, hd, -6), 30, look.skin);
  } else {
    const f = dir(face);
    s = circ(add(c, hd, 2), 32, hair) + circ([c[0] + f[0] * 7 - hd[0] * 4, c[1] + f[1] * 7 - hd[1] * 4], 30, look.skin);
    s += circ(add(c, f, -4), 6, shade(look.skin, 0.9)); // ear
  }
  if (look.female && !look.hijab) {
    const back = face === 'front' ? [0, 0] : dir(face + 180);
    s = circ([c[0] + (back[0] * 0.7 + hd[0] * 0.7) * 30, c[1] + (back[1] * 0.7 + hd[1] * 0.7) * 30], 14, look.grey ? HAIR.grey : HAIR.dark) + s;
  }
  return s;
}

export function lookFor(avatar = {}) {
  const female = avatar.gender === 'female';
  const hijab = female && !!avatar.hijab;
  return {
    female, hijab, modest: hijab,
    skin: SKIN[avatar.skin] ?? SKIN[2],
    grey: (avatar.age ?? 30) >= 60,
  };
}

// Full figure as SVG markup (numbers only, no user text) for a pose.
export function drawFigure(pose, look) {
  const hip = pose.hip;
  const td = dir(pose.torso);
  const shoulder = add(hip, td, L.torso);
  const neckEnd = add(shoulder, dir(pose.head), L.neck);
  const headC = add(neckEnd, dir(pose.head), L.head);
  const near = leg(hip, pose.near), far = leg(hip, pose.far);
  const armN = arm(add(shoulder, td, -8), pose.armN), armF = arm(add(shoulder, td, -8), pose.armF);
  const top = look.modest ? C.modestTop : C.top;
  let s = drawArm(armF, look, true) + drawLeg(far, look, true);
  s += seg(add(hip, td, 8), add(shoulder, td, -4), 60, look.modest ? shade(C.modestTop, 0.9) : '#DCDCDC');
  s += seg(add(hip, td, 8), add(shoulder, td, -4), 56, top);
  s += seg(add(hip, td, 8), add(shoulder, td, -4), 18, look.modest ? shade(C.modestTop, 0.94) : C.topShade).replace('stroke-linecap="round"', 'stroke-linecap="round" opacity=".55"');
  s += circ(hip, 29, look.modest ? (look.hijab ? C.modestTop : C.pants) : C.shorts);
  s += seg(shoulder, neckEnd, 24, look.hijab ? C.hijab : look.skin);
  s += drawHead(headC, pose.head, pose.face, look);
  s += drawLeg(near, look, false) + drawArm(armN, look, false);
  return s;
}
