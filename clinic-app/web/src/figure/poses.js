// Start (A) and end (B) poses for each exercise. Viewbox 720 x 480, floor at y = 430.
// "near" = the operated / affected leg, drawn in front.

const FLOOR = 430;
const lyingArms = {
  armN: { upper: 8, fore: 4 }, armF: { upper: 12, fore: 6 },
};
const supine = (hip = [380, 396]) => ({ hip, torso: 180, head: 182, face: -90, ...lyingArms });
const straight = { thigh: 3, shin: 3, foot: -90 };
const standing = (hip, torso = -90) => ({ hip, torso, head: torso, face: 0 });

const mat = '<rect x="150" y="418" width="500" height="13" rx="6" fill="var(--prop)"/>';
const chair = (x = 470) => `<g fill="none" stroke="var(--prop)" stroke-width="9" stroke-linecap="round">
  <path d="M${x} 270 V430 M${x} 340 H${x + 70} V430 M${x + 70} 340 V250"/></g>`;

export const POSES = {
  quadset: {
    props: mat + '<circle cx="482" cy="408" r="11" fill="var(--prop-strong)"/>',
    A: { ...supine(), near: { thigh: 2, shin: 4, foot: -92 }, far: straight },
    B: { ...supine(), near: { thigh: 3, shin: 2, foot: -104 }, far: straight },
  },
  slr: {
    props: mat,
    A: { ...supine(), near: straight, far: { ik: [478, 404], bend: -1, foot: 0 } },
    B: { ...supine(), near: { thigh: -36, shin: -36, foot: -126 }, far: { ik: [478, 404], bend: -1, foot: 0 } },
  },
  heelslide: {
    props: mat,
    A: { ...supine(), near: straight, far: straight },
    B: { ...supine(), near: { ik: [470, 404], bend: -1, foot: 0 }, far: straight },
  },
  pumps: {
    props: mat,
    A: { ...supine(), near: { thigh: 3, shin: 3, foot: -112 }, far: straight },
    B: { ...supine(), near: { thigh: 3, shin: 3, foot: -18 }, far: straight },
  },
  prone: {
    props: '<rect x="120" y="358" width="318" height="20" rx="8" fill="var(--prop)"/><rect x="140" y="378" width="12" height="52" fill="var(--prop)"/><rect x="410" y="378" width="12" height="52" fill="var(--prop)"/>',
    A: { hip: [330, 331], torso: 180, head: 178, face: 90, armN: { upper: 4, fore: 2 }, armF: { upper: 6, fore: 4 },
      near: { thigh: 0, shin: -14, foot: 62 }, far: { thigh: 0, shin: -14, foot: 62 } },
    B: { hip: [330, 331], torso: 180, head: 178, face: 90, armN: { upper: 4, fore: 2 }, armF: { upper: 6, fore: 4 },
      near: { thigh: 0, shin: 4, foot: 78 }, far: { thigh: 0, shin: -14, foot: 62 } },
  },
  bridge: {
    props: mat,
    A: { hip: [380, 396], torso: 180, head: 182, face: -90, ...lyingArms,
      near: { ik: [474, 404], bend: -1, foot: 0 }, far: { ik: [478, 404], bend: -1, foot: 0 } },
    B: { hip: [368, 350], torso: 157, head: 176, face: -88, armN: { upper: 22, fore: 8 }, armF: { upper: 26, fore: 10 },
      near: { ik: [474, 404], bend: -1, foot: 0 }, far: { ik: [478, 404], bend: -1, foot: 0 } },
  },
  squat: {
    props: chair(),
    A: { ...standing([352, 214], -88), near: { ik: [360, 410], bend: -1, foot: 0 }, far: { ik: [354, 410], bend: -1, foot: 0 },
      armN: { ik: [470, 280], bend: 1 }, armF: { ik: [468, 286], bend: 1 } },
    B: { ...standing([322, 252], -70), near: { ik: [360, 410], bend: -1, foot: 0 }, far: { ik: [354, 410], bend: -1, foot: 0 },
      armN: { ik: [470, 280], bend: 1 }, armF: { ik: [468, 286], bend: 1 } },
  },
  calf: {
    props: chair(),
    A: { ...standing([356, 212]), near: { ik: [362, 410], bend: -1, foot: 0 }, far: { ik: [356, 410], bend: -1, foot: 0 },
      armN: { ik: [470, 280], bend: 1 }, armF: { ik: [468, 286], bend: 1 } },
    B: { ...standing([356, 196]), near: { ik: [362, 394], bend: -1, foot: 26 }, far: { ik: [356, 394], bend: -1, foot: 26 },
      armN: { ik: [470, 280], bend: 1 }, armF: { ik: [468, 286], bend: 1 } },
  },
  balance: {
    props: chair(),
    A: { ...standing([356, 214]), near: { ik: [360, 410], bend: -1, foot: 0 }, far: { ik: [350, 410], bend: -1, foot: 0 },
      armN: { ik: [470, 280], bend: 1 }, armF: { ik: [468, 286], bend: 1 } },
    B: { ...standing([356, 214]), near: { ik: [360, 410], bend: -1, foot: 0 }, far: { ik: [292, 318], bend: -1, foot: 110 },
      armN: { ik: [470, 280], bend: 1 }, armF: { ik: [468, 286], bend: 1 } },
  },
  abd: {
    props: mat,
    A: { hip: [380, 396], torso: 180, head: 180, face: 'front', armN: { upper: 40, fore: 0 }, armF: { upper: 6, fore: 4 },
      near: { thigh: 1, shin: 1, foot: -80 }, far: { thigh: 3, shin: 3, foot: -80 } },
    B: { hip: [380, 396], torso: 180, head: 180, face: 'front', armN: { upper: 40, fore: 0 }, armF: { upper: 6, fore: 4 },
      near: { thigh: -28, shin: -28, foot: -108 }, far: { thigh: 3, shin: 3, foot: -80 } },
  },
  hamcurl: {
    props: chair(),
    A: { ...standing([356, 212]), near: { ik: [360, 410], bend: -1, foot: 0 }, far: { ik: [352, 410], bend: -1, foot: 0 },
      armN: { ik: [470, 280], bend: 1 }, armF: { ik: [468, 286], bend: 1 } },
    B: { ...standing([356, 212]), near: { thigh: 94, shin: 186, foot: 100 }, far: { ik: [352, 410], bend: -1, foot: 0 },
      armN: { ik: [470, 280], bend: 1 }, armF: { ik: [468, 286], bend: 1 } },
  },
  stepup: {
    view: [-30, -70, 780, 520],
    props: `<rect x="400" y="362" width="150" height="68" rx="6" fill="var(--prop)"/>`,
    A: { ...standing([362, 236], -84), near: { ik: [440, 344], bend: -1, foot: 0 }, far: { ik: [340, 410], bend: -1, foot: 0 },
      armN: { upper: 70, fore: 60 }, armF: { upper: 110, fore: 100 } },
    B: { ...standing([434, 150], -90), near: { ik: [440, 344], bend: -1, foot: 0 }, far: { ik: [404, 300], bend: -1, foot: 60 },
      armN: { upper: 80, fore: 70 }, armF: { upper: 100, fore: 95 } },
  },
};
export { FLOOR };
