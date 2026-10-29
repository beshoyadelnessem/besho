// Cartoon exercise figure. A pose is a set of joint angles (degrees, SVG
// coordinates: 0 = right, 90 = down) plus optional IK targets for planted feet
// and hands. Two poses per exercise are blended by t in [0, 1]; t also drives the
// face (relaxed at 0, straining at 1). Each age group has its own body, clothes
// and hair; children are drawn smaller, together with their props.

const L = { torso: 118, neck: 12, upper: 62, fore: 56, thigh: 102, shin: 98, foot: 38 };
const SKIN = '#F2C6A0';
const FLOOR = [360, 430];

const rad = (d) => (d * Math.PI) / 180;
const dir = (d) => [Math.cos(rad(d)), Math.sin(rad(d))];
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const mix = (...terms) => terms.reduce((acc, [v, k]) => [acc[0] + v[0] * k, acc[1] + v[1] * k], [0, 0]);
const ang = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const shade = (hex, k) => '#' + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))
  .toString(16).padStart(2, '0')).join('');
const f1 = (n) => n.toFixed(1);

// ------------------------------------------------------------------ looks by age
export const AGE_GROUPS = ['kid', 'teen', 'y25', 'y35', 'y50', 'y60'];
export function ageGroup(age) {
  if (!age) return 'y25';
  if (age < 14) return 'kid';
  if (age < 22) return 'teen';
  if (age < 30) return 'y25';
  if (age < 45) return 'y35';
  if (age < 60) return 'y50';
  return 'y60';
}

const LOOKS = {
  kid: {
    male: { top: '#4FA3F7', sleeve: 'short', bottom: 'shorts', bottomColor: '#2E3B55', shoe: '#FF5A5F', hair: 'spiky', hairColor: '#5B3A29', star: true },
    female: { top: '#FF8FB1', sleeve: 'short', bottom: 'shorts', bottomColor: '#6A4C93', shoe: '#FFD23F', hair: 'pigtails', hairColor: '#5B3A29', star: true },
    scale: 0.74, head: 44,
  },
  teen: {
    male: { top: '#7C4DFF', sleeve: 'long', bottom: 'long', bottomColor: '#3A3F4B', shoe: '#F4F4F4', sole: '#9AA0A6', hair: 'short', hairColor: '#2F2A28', cap: '#FF7A00', hood: true },
    female: { top: '#00B3A6', sleeve: 'long', bottom: 'long', bottomColor: '#2F2F3A', shoe: '#F4F4F4', sole: '#9AA0A6', hair: 'ponytail', hairColor: '#3B2A20', hood: true, hijab: '#26A69A' },
    scale: 0.94, head: 38,
  },
  y25: {
    male: { top: '#F4F4F4', sleeve: 'none', bottom: 'shorts', bottomColor: '#FDB13B', shoe: '#F5A623', hair: 'short', hairColor: '#2F2A28', headband: '#E53935', trim: '#F5A623' },
    female: { top: '#E91E63', sleeve: 'none', bottom: 'long', bottomColor: '#37474F', shoe: '#F5A623', hair: 'ponytail', hairColor: '#2F2A28', headband: '#FFFFFF', hijab: '#EC407A' },
    scale: 1, head: 36,
  },
  y35: {
    male: { top: '#2E7D32', sleeve: 'short', bottom: 'long', bottomColor: '#263238', shoe: '#455A64', hair: 'short', hairColor: '#3E2723', beard: true },
    female: { top: '#FF7043', sleeve: 'short', bottom: 'long', bottomColor: '#3949AB', shoe: '#ECEFF1', sole: '#B0BEC5', hair: 'bun', hairColor: '#3E2723', hijab: '#5C6BC0' },
    scale: 1, head: 36,
  },
  y50: {
    male: { top: '#1565C0', sleeve: 'short', bottom: 'long', bottomColor: '#A1887F', shoe: '#6D4C41', hair: 'balding', hairColor: '#4E342E', moustache: true, belly: true, collar: '#FFFFFF' },
    female: { top: '#8E24AA', sleeve: 'long', bottom: 'long', bottomColor: '#5D4037', shoe: '#8D6E63', hair: 'bob', hairColor: '#4E342E', belly: true, hijab: '#8D6E63' },
    scale: 1, head: 37,
  },
  y60: {
    male: { top: '#6D8B74', sleeve: 'long', bottom: 'long', bottomColor: '#5D6D7E', shoe: '#8D6E63', hair: 'bald', hairColor: '#D7D3CE', glasses: true, moustache: true, moustacheColor: '#E8E4DF', belly: true },
    female: { top: '#C2185B', sleeve: 'long', bottom: 'long', bottomColor: '#4E5D6C', shoe: '#8D6E63', hair: 'bun', hairColor: '#D7D3CE', glasses: true, hijab: '#546E7A' },
    scale: 0.98, head: 37,
  },
};

// avatar: { gender, age, hijab } -> drawing style
export function lookFor(avatar = {}) {
  const group = ageGroup(avatar.age);
  const g = LOOKS[group];
  const female = avatar.gender === 'female';
  const base = { ...(female ? g.female : g.male) };
  const hijab = female && !!avatar.hijab && group !== 'kid' ? base.hijab : null;
  if (hijab) Object.assign(base, { sleeve: 'long', bottom: 'long', hair: 'none', headband: null, cap: null });
  return { group, female, hijab, scale: g.scale, headR: g.head, sole: shade(base.shoe, 0.8), ...base };
}

// ------------------------------------------------------------------ geometry
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

// ------------------------------------------------------------------ primitives
const seg = (a, b, w, color, extra = '') =>
  `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"${extra}/>`;
const circ = (c, r, color, extra = '') => `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(r)}" fill="${color}"${extra}/>`;
const poly = (pts, color, w, extra = '') =>
  `<polyline points="${pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const along = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

// ------------------------------------------------------------------ body parts
function drawLeg(g, look, far) {
  const k = far ? 0.86 : 1;
  const skin = shade(SKIN, k);
  const cloth = shade(look.bottomColor, k);
  let s;
  if (look.bottom === 'long') {
    s = seg(g.hip, g.knee, 42, cloth) + seg(g.knee, g.ankle, 34, cloth);
  } else {
    s = seg(g.hip, g.knee, 40, skin) + seg(g.knee, g.ankle, 32, skin) + seg(g.hip, along(g.hip, g.knee, 0.55), 48, cloth);
  }
  // shoe from behind the ankle to the toe, sole on the side away from the knee
  const fd = dir(ang(g.ankle, g.toe));
  const heel = add(g.ankle, fd, -9);
  let n = [-fd[1], fd[0]];
  const toKnee = [g.knee[0] - g.ankle[0], g.knee[1] - g.ankle[1]];
  if (n[0] * toKnee[0] + n[1] * toKnee[1] > 0) n = [-n[0], -n[1]];
  s += seg(heel, g.toe, 27, shade(look.shoe, k)) + seg(add(heel, n, 8), add(g.toe, n, 8), 8, shade(look.sole, k));
  return s;
}
function drawArm(g, look, far) {
  const k = far ? 0.86 : 1;
  const skin = shade(SKIN, k);
  const cloth = shade(look.top, k);
  let s;
  if (look.sleeve === 'long') s = seg(g.shoulder, g.elbow, 26, cloth) + seg(g.elbow, g.hand, 23, cloth);
  else {
    s = seg(g.shoulder, g.elbow, 24, skin) + seg(g.elbow, g.hand, 21, skin);
    if (look.sleeve === 'short') s += seg(g.shoulder, along(g.shoulder, g.elbow, 0.45), 30, cloth);
    if (look.trim) s += circ(g.shoulder, 13, shade(look.trim, k));
  }
  return s + circ(g.hand, 13.5, skin);
}

function drawTorso(hip, shoulder, td, faceDir, look) {
  const a = add(hip, td, 8), b = add(shoulder, td, -4);
  const w = 70;
  let s = seg(a, b, w + 4, shade(look.top, 0.82)) + seg(a, b, w, look.top);
  if (look.belly) s += circ(add(along(a, b, 0.38), faceDir, 20), 34, look.top);
  s += seg(a, b, 16, shade(look.top, 0.9), ' opacity=".6"');
  if (look.star) s += circ(add(along(a, b, 0.6), faceDir, 6), 9, '#FFFFFF', ' opacity=".9"');
  if (look.hood) s += circ(add(b, faceDir, -18), 20, shade(look.top, 0.88));
  if (look.collar) s += seg(add(b, faceDir, -6), add(b, faceDir, 14), 10, look.collar);
  return s;
}

function drawHead(c, headDir, faceAngle, look, effort) {
  const r = look.headR;
  const u = dir(headDir);                       // toward the crown
  const front = faceAngle === 'front';
  const f = front ? [0, 0] : dir(faceAngle);    // toward the face
  const b = [-f[0], -f[1]];
  const hair = look.hairColor;
  let s = '';

  if (look.hijab) {
    s += circ(mix([c, 1], [b, 4]), r + 7, look.hijab) + circ(mix([c, 1], [u, -r * 0.8], [b, 6]), r * 0.85, look.hijab);
    s += circ(front ? mix([c, 1], [u, -3]) : mix([c, 1], [f, r * 0.34], [u, -3]), r * 0.66, SKIN);
  } else {
    // hair behind the head
    if (look.hair === 'ponytail' && !front) s += circ(mix([c, 1], [b, r + 6], [u, r * 0.35]), r * 0.36, hair);
    if (look.hair === 'pigtails') {
      s += circ(mix([c, 1], [b, r * 0.85], [u, r * 0.2]), r * 0.34, hair) + circ(mix([c, 1], [b, r * 0.6], [u, -r * 0.35]), r * 0.3, hair);
    }
    if (look.hair === 'bun') s += circ(mix([c, 1], [u, r + 2], [b, 6]), r * 0.36, hair);
    // head
    if (look.hair === 'bald' || look.hair === 'balding') {
      s += circ(mix([c, 1], [b, 6], [u, -6]), r + 2, hair);
      s += circ(mix([c, 1], [f, 4], [u, look.hair === 'bald' ? 6 : 3]), r, SKIN);
      if (look.hair === 'balding') s += circ(mix([c, 1], [u, r * 0.85], [b, r * 0.2]), r * 0.22, hair);
    } else if (look.hair === 'bob') {
      s += circ(mix([c, 1], [u, 3], [b, 7]), r + 6, hair) + circ(mix([c, 1], [f, 9], [u, -5]), r - 1, SKIN);
    } else {
      s += circ(mix([c, 1], [u, 4], [b, front ? 0 : 5]), r + 3, hair);
      s += circ(front ? mix([c, 1], [u, -5]) : mix([c, 1], [f, 6], [u, -4]), r, SKIN);
      if (look.hair === 'spiky') {
        for (const k of [-0.5, 0, 0.5]) {
          const p = mix([c, 1], [u, r + 1], [front ? [u[1], -u[0]] : b, k * r]);
          s += circ(p, r * 0.28, hair);
        }
      }
    }
    if (look.cap) {
      s += circ(mix([c, 1], [u, 9], [b, 2]), r + 2, look.cap, ' clip-path="none"');
      s += circ(front ? mix([c, 1], [u, -9]) : mix([c, 1], [f, 6], [u, -9]), r - 2, SKIN);
      if (!front) s += seg(mix([c, 1], [b, r - 2], [u, r * 0.45]), mix([c, 1], [b, r + 16], [u, r * 0.3]), 9, look.cap);
    }
    if (look.headband) {
      const sgn = front ? 1 : Math.sign(u[0] * f[1] - u[1] * f[0]) || 1;
      const pts = [];
      for (let k = -50; k <= 70; k += 20) pts.push(add(c, dir(headDir + sgn * k), r * 0.98));
      s += poly(pts, look.headband, 7);
    }
  }

  // face
  const e = Math.max(0, Math.min(1, effort));
  const ink = '#2B2A28';
  if (front) {
    const p = [u[1], -u[0]];
    const eyeY = mix([c, 1], [u, 2]);
    for (const k of [-1, 1]) {
      const eye = add(eyeY, p, k * r * 0.33);
      s += e > 0.6 ? seg(add(eye, p, -4), add(eye, p, 4), 3, ink) : circ(eye, 3.4, ink);
    }
    s += e > 0.6 ? seg(mix([c, 1], [u, -r * 0.42], [p, -7]), mix([c, 1], [u, -r * 0.42], [p, 7]), 5, '#FFFFFF', ` stroke="${ink}"`)
      : poly([mix([c, 1], [u, -r * 0.38], [p, -7]), mix([c, 1], [u, -r * 0.48]), mix([c, 1], [u, -r * 0.38], [p, 7])], ink, 2.5);
    if (look.glasses) for (const k of [-1, 1]) s += circ(add(eyeY, p, k * r * 0.33), 8, 'none', ` stroke="${ink}" stroke-width="2.4"`);
    return s;
  }
  const at = (fk, uk) => mix([c, 1], [f, fk * r], [u, uk * r]);
  const eye = at(0.45, 0.12);
  if (!look.hijab) s += circ(at(-0.12, -0.05), r * 0.17, shade(SKIN, 0.9));            // ear
  s += circ(at(0.92, -0.08), r * 0.15, shade(SKIN, 0.95));                               // nose
  s += circ(at(0.25, -0.28), r * 0.15, '#F28B82', ' opacity=".45"');                    // cheek
  if (e > 0.6) {
    s += poly([add(eye, f, -4), add(add(eye, f, 0), u, 2), add(eye, f, 4)], ink, 2.6);      // squeezed eye
    s += seg(at(0.38, 0.36), at(0.66, 0.26), 2.6, ink);                                     // frowning brow
    s += seg(at(0.55, -0.42), at(0.82, -0.42), 6, '#FFFFFF', ` stroke-opacity="1"`) + seg(at(0.55, -0.42), at(0.82, -0.42), 1.4, ink); // gritted teeth
    if (e > 0.85) s += circ(at(-0.55, 0.75), 5, '#7EC8F2');                                // sweat drop
  } else {
    s += circ(eye, 5.2, '#FFFFFF', ` stroke="${ink}" stroke-width="1.2"`) + circ(add(eye, f, 1.6), 2.8, ink) + seg(at(0.36, 0.34), at(0.6, 0.34), 2.4, ink);
    s += poly([at(0.52, -0.38), at(0.67, -0.46), at(0.82, -0.36)], ink, 2.4);              // smile
  }
  if (look.glasses) s += circ(eye, 9, 'none', ` stroke="${ink}" stroke-width="2.4"`) + seg(add(eye, f, 9), add(eye, f, 13), 2.2, ink);
  if (look.beard) s += circ(at(0.5, -0.45), r * 0.42, '#3E2723', ' opacity=".18"');
  if (look.moustache) s += seg(at(0.66, -0.26), at(0.86, -0.24), 5, look.moustacheColor || look.hairColor);
  return s;
}

// ------------------------------------------------------------------ figure + scene
export function drawFigure(pose, look, effort = 0) {
  const hip = pose.hip;
  const td = dir(pose.torso);
  const shoulder = add(hip, td, L.torso);
  const hd = dir(pose.head);
  const neckEnd = add(shoulder, hd, L.neck);
  const headC = add(neckEnd, hd, look.headR - 4);
  const faceDir = pose.face === 'front' ? [0, -1] : dir(pose.face);
  const near = leg(hip, pose.near), far = leg(hip, pose.far);
  const armN = arm(add(shoulder, td, -8), pose.armN), armF = arm(add(shoulder, td, -8), pose.armF);
  let s = drawArm(armF, look, true) + drawLeg(far, look, true);
  s += drawTorso(hip, shoulder, td, faceDir, look);
  s += circ(hip, 34, look.bottomColor);
  s += seg(shoulder, neckEnd, 24, look.hijab || SKIN);
  s += drawHead(headC, pose.head, pose.face, look, effort);
  s += drawLeg(near, look, false) + drawArm(armN, look, false);
  return s;
}

// Exercise scene (props + figure). Children are scaled down together with their props.
export function drawScene(ex, t, look) {
  const k = look.scale;
  const inner = (ex.props || '') + drawFigure(blend(ex.A, ex.B, t), look, t);
  if (k === 1) return inner;
  return `<g transform="translate(${FLOOR[0]} ${FLOOR[1]}) scale(${k}) translate(${-FLOOR[0]} ${-FLOOR[1]})">${inner}</g>`;
}
