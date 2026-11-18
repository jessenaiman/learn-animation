import { PuppetPin, RigDemoId, VectorProject2D } from '../types/studio';

export interface RigDemoMeta {
  id: RigDemoId;
  code: string;
  title: string;
  objective: string;
  rigidCoreRule: string;
  flexibleParameters: string;
  checklistPrompt: string;
}

export const RIG_DEMOS_META: RigDemoMeta[] = [
  {
    id: 'demo-a',
    code: 'Demo A',
    title: 'Vector vs. Raster Scaling & Precomp Order',
    objective:
      'Verify scaling limits at 300% zoom and enforce precomposition order before applying Puppet mesh pins to vector artwork.',
    rigidCoreRule:
      'Import layered assets via Composition - Retain Layer Sizes. Never animate Position/Scale transforms directly on a Continuously Rasterized vector layer that also carries Puppet mesh pins.',
    flexibleParameters:
      'Scale zoom (100%–350%), Continuously Rasterize switch, Precompose Vector Layer toggle, and Puppet Mesh Pin bend test.',
    checklistPrompt:
      'Set Scale >= 300%, enable Continuously Rasterize, and enable Precompose Before Pinning.',
  },
  {
    id: 'demo-b',
    code: 'Demo B',
    title: 'Inpainted Cutout Rig: Pivot & Hierarchy',
    objective:
      'Construct a 3-part articulated arm with rounded inpainted joint caps, anatomical anchor pivots, and parent-child hierarchy.',
    rigidCoreRule:
      'Separate Torso, Upper_Limb, Lower_Limb, and Hand onto independent alpha layers with extended rounded joint caps (inpainting) before keyframing.',
    flexibleParameters:
      'Inpainted Joint Caps toggle, Shoulder/Elbow Anchor Point placement (Pan Behind Y), Parent & Link hierarchy chain, and 60-frame rotation arc.',
    checklistPrompt:
      'Enable Inpainted Joint Caps, snap pivots to anatomical joints, and link Lower_Limb -> Upper_Limb -> Torso.',
  },
  {
    id: 'demo-c',
    code: 'Demo C',
    title: 'Whole-Body Distortion Fix (Position + Starch Pins)',
    objective:
      'Eliminate unintended torso shear during extreme limb deformation over a triangulated character mesh.',
    rigidCoreRule:
      'Use native mesh pin stiffness (Starch Pins in red) along the structural spine and ribcage rather than external scripts.',
    flexibleParameters:
      'Yellow Position Pin hand drag offset, Red Starch Pin placement on chest/pelvis, and live triangle mesh wireframe overlay.',
    checklistPrompt:
      'Drag the yellow Position Pin to test arm reach and place at least 2 red Starch Pins on the torso/spine until torso shear drops below 8%.',
  },
  {
    id: 'demo-d',
    code: 'Demo D',
    title: 'Bee Antennae Follow-Through & Depth Overlap',
    objective:
      'Demonstrate natural secondary inertia (2–4 frame lag), Bend midpoint pins, and Overlap front/back depth control.',
    rigidCoreRule:
      'Lock the head base with Starch pins; drive secondary sway via native Bend/Position frame offsets and explicit Overlap depth pins.',
    flexibleParameters:
      'Frame-offset delay (0–6 frames), sway amplitude, Bend midpoint flex, and Blue Overlap Pin depth priority (Front vs. Behind Head).',
    checklistPrompt:
      'Set Frame Lag between 2 and 5 frames, enable Starch Head Base, and set Foreground Antenna Overlap to In Front (+50).',
  },
];

export const INITIAL_DEMO_C_PINS: PuppetPin[] = [
  {
    id: 'pin-hand-pos',
    kind: 'position',
    label: 'Right Hand Deform',
    restX: 430,
    restY: 165,
    x: 472,
    y: 112,
    rotation: 0,
    scale: 1,
    inFront: 0,
  },
  {
    id: 'pin-foot-l',
    kind: 'position',
    label: 'Left Foot Anchor',
    restX: 278,
    restY: 356,
    x: 278,
    y: 356,
    rotation: 0,
    scale: 1,
    inFront: 0,
  },
  {
    id: 'pin-foot-r',
    kind: 'position',
    label: 'Right Foot Anchor',
    restX: 352,
    restY: 356,
    x: 352,
    y: 356,
    rotation: 0,
    scale: 1,
    inFront: 0,
  },
];

/**
 * Evaluates inverse-distance weighted Puppet mesh deformation where Position pins pull vertices
 * and Starch pins clamp displacement back toward rest coordinates (simulating AE Starch stiffness).
 */
export function deformMeshPoint(
  px: number,
  py: number,
  pins: PuppetPin[]
): { x: number; y: number; strain: number } {
  const posPins = pins.filter((p) => p.kind === 'position');
  const starchPins = pins.filter((p) => p.kind === 'starch');

  if (posPins.length === 0) {
    return { x: px, y: py, strain: 0 };
  }

  let weightSum = 0;
  let dxSum = 0;
  let dySum = 0;

  // Position pins exert smooth radial displacement
  for (const pin of posPins) {
    const distSq = (px - pin.restX) ** 2 + (py - pin.restY) ** 2;
    const w = 1 / Math.pow(distSq + 1800, 1.15);
    weightSum += w;
    dxSum += w * (pin.x - pin.restX);
    dySum += w * (pin.y - pin.restY);
  }

  // Starch pins exert strong stiffness anchor weights (zero displacement) across torso/core
  for (const sPin of starchPins) {
    const distSq = (px - sPin.restX) ** 2 + (py - sPin.restY) ** 2;
    const stiffnessWeight = 5.2 / Math.pow(distSq + 900, 1.15);
    weightSum += stiffnessWeight;
    // Starch target displacement is (0, 0)
  }

  const dx = weightSum > 0 ? dxSum / weightSum : 0;
  const dy = weightSum > 0 ? dySum / weightSum : 0;
  const strain = Math.min(1, Math.hypot(dx, dy) / 55);

  return {
    x: px + dx,
    y: py + dy,
    strain,
  };
}

/**
 * Exports Demo B (Inpainted Cutout Arm Rig) as a playable Lottie VectorProject2D
 */
export function buildDemoBLottieProject(options: {
  inpaintCaps: boolean;
  shoulderSwingDeg: number;
  elbowFlexDeg: number;
}): VectorProject2D {
  const s = options.shoulderSwingDeg;
  const e = options.elbowFlexDeg;

  return {
    name: 'DemoB_Cutout_Arm_Rig',
    width: 640,
    height: 420,
    fps: 30,
    totalFrames: 60,
    backgroundColor: '#0B1120',
    layers: [
      {
        id: 'db-torso',
        name: 'Torso_Core',
        parentId: null,
        kind: 'rect',
        width: 116,
        height: 168,
        cornerRadius: 28,
        sides: 4,
        closed: true,
        vertices: [],
        fillColor: '#334155',
        fillOpacity: 1,
        strokeColor: '#64748B',
        strokeWidth: 3,
        inpaintCap: false,
        anchor: { x: 0, y: 65 },
        positionTrack: [{ frame: 0, x: 235, y: 315, easing: 'linear' }],
        rotationTrack: [{ frame: 0, value: 0, easing: 'linear' }],
        scaleTrack: [{ frame: 0, x: 100, y: 100, easing: 'linear' }],
        opacityTrack: [{ frame: 0, value: 100, easing: 'linear' }],
        visible: true,
        locked: true,
      },
      {
        id: 'db-upper',
        name: 'Upper_Limb',
        parentId: 'db-torso',
        kind: 'rect',
        width: 118,
        height: 36,
        cornerRadius: options.inpaintCaps ? 18 : 2,
        sides: 4,
        closed: true,
        vertices: [],
        fillColor: '#0EA5E9',
        fillOpacity: 1,
        strokeColor: '#BAE6FD',
        strokeWidth: 2,
        inpaintCap: options.inpaintCaps,
        anchor: { x: -42, y: 0 },
        positionTrack: [{ frame: 0, x: 42, y: -52, easing: 'linear' }],
        rotationTrack: [
          { frame: 0, value: -10, easing: 'easeInOut' },
          { frame: 30, value: -10 - s, easing: 'easeInOut' },
          { frame: 60, value: -10, easing: 'easeInOut' },
        ],
        scaleTrack: [{ frame: 0, x: 100, y: 100, easing: 'linear' }],
        opacityTrack: [{ frame: 0, value: 100, easing: 'linear' }],
        visible: true,
        locked: false,
      },
      {
        id: 'db-lower',
        name: 'Lower_Limb',
        parentId: 'db-upper',
        kind: 'rect',
        width: 106,
        height: 30,
        cornerRadius: options.inpaintCaps ? 15 : 2,
        sides: 4,
        closed: true,
        vertices: [],
        fillColor: '#38BDF8',
        fillOpacity: 1,
        strokeColor: '#E0F2FE',
        strokeWidth: 2,
        inpaintCap: options.inpaintCaps,
        anchor: { x: -38, y: 0 },
        positionTrack: [{ frame: 0, x: 46, y: 0, easing: 'linear' }],
        rotationTrack: [
          { frame: 0, value: -15, easing: 'easeInOut' },
          { frame: 30, value: -15 - e, easing: 'easeInOut' },
          { frame: 60, value: -15, easing: 'easeInOut' },
        ],
        scaleTrack: [{ frame: 0, x: 100, y: 100, easing: 'linear' }],
        opacityTrack: [{ frame: 0, value: 100, easing: 'linear' }],
        visible: true,
        locked: false,
      },
      {
        id: 'db-hand',
        name: 'Articulated_Hand',
        parentId: 'db-lower',
        kind: 'ellipse',
        width: 42,
        height: 32,
        cornerRadius: 0,
        sides: 5,
        closed: true,
        vertices: [],
        fillColor: '#F59E0B',
        fillOpacity: 1,
        strokeColor: '#FEF3C7',
        strokeWidth: 2,
        inpaintCap: false,
        anchor: { x: -14, y: 0 },
        positionTrack: [{ frame: 0, x: 46, y: 0, easing: 'linear' }],
        rotationTrack: [
          { frame: 0, value: 10, easing: 'easeInOut' },
          { frame: 20, value: -24, easing: 'easeInOut' },
          { frame: 42, value: 22, easing: 'easeInOut' },
          { frame: 60, value: 10, easing: 'easeInOut' },
        ],
        scaleTrack: [{ frame: 0, x: 100, y: 100, easing: 'linear' }],
        opacityTrack: [{ frame: 0, value: 100, easing: 'linear' }],
        visible: true,
        locked: false,
      },
    ],
  };
}

/**
 * Exports Demo D (Bee Antennae Follow-Through & Depth Overlap) as a playable Lottie VectorProject2D
 */
export function buildDemoDLottieProject(options: {
  frameLag: number;
  swayAmplitude: number;
  frontAntennaOverlap: boolean;
}): VectorProject2D {
  const lag = Math.max(0, Math.min(8, Math.round(options.frameLag)));
  const amp = options.swayAmplitude;

  const backAntennaLayer = {
    id: 'bee-ant-back',
    name: 'Back_Antenna_Base',
    parentId: 'bee-head',
    kind: 'rect' as const,
    width: 14,
    height: 76,
    cornerRadius: 7,
    sides: 4,
    closed: true,
    vertices: [],
    fillColor: '#94A3B8',
    fillOpacity: 1,
    strokeColor: '#CBD5E1',
    strokeWidth: 2,
    inpaintCap: true,
    anchor: { x: 0, y: 34 },
    positionTrack: [{ frame: 0, x: -26, y: -48, easing: 'linear' as const }],
    rotationTrack: [
      { frame: 0, value: -16, easing: 'easeInOut' as const },
      { frame: Math.min(58, 28 + lag), value: -16 + amp, easing: 'easeInOut' as const },
      { frame: 60, value: -16, easing: 'easeInOut' as const },
    ],
    scaleTrack: [{ frame: 0, x: 100, y: 100, easing: 'linear' as const }],
    opacityTrack: [{ frame: 0, value: 100, easing: 'linear' as const }],
    visible: true,
    locked: false,
  };

  const backTipLayer = {
    id: 'bee-ant-back-tip',
    name: 'Back_Antenna_Tip_FollowThrough',
    parentId: 'bee-ant-back',
    kind: 'ellipse' as const,
    width: 22,
    height: 22,
    cornerRadius: 0,
    sides: 5,
    closed: true,
    vertices: [],
    fillColor: '#38BDF8',
    fillOpacity: 1,
    strokeColor: '#E0F2FE',
    strokeWidth: 2,
    inpaintCap: false,
    anchor: { x: 0, y: 18 },
    positionTrack: [{ frame: 0, x: 0, y: -36, easing: 'linear' as const }],
    rotationTrack: [
      { frame: 0, value: -8, easing: 'easeInOut' as const },
      { frame: Math.min(59, 30 + lag * 1.5), value: amp * 1.25, easing: 'easeInOut' as const },
      { frame: 60, value: -8, easing: 'easeInOut' as const },
    ],
    scaleTrack: [{ frame: 0, x: 100, y: 100, easing: 'linear' as const }],
    opacityTrack: [{ frame: 0, value: 100, easing: 'linear' as const }],
    visible: true,
    locked: false,
  };

  const headLayer = {
    id: 'bee-head',
    name: 'Bee_Head_Starch_Core',
    parentId: null,
    kind: 'ellipse' as const,
    width: 146,
    height: 132,
    cornerRadius: 0,
    sides: 5,
    closed: true,
    vertices: [],
    fillColor: '#F59E0B',
    fillOpacity: 1,
    strokeColor: '#FEF3C7',
    strokeWidth: 4,
    inpaintCap: false,
    anchor: { x: 0, y: 40 },
    positionTrack: [
      { frame: 0, x: 320, y: 275, easing: 'easeInOut' as const },
      { frame: 28, x: 344, y: 268, easing: 'easeInOut' as const },
      { frame: 60, x: 320, y: 275, easing: 'easeInOut' as const },
    ],
    rotationTrack: [
      { frame: 0, value: -6, easing: 'easeInOut' as const },
      { frame: 28, value: 8, easing: 'easeInOut' as const },
      { frame: 60, value: -6, easing: 'easeInOut' as const },
    ],
    scaleTrack: [{ frame: 0, x: 100, y: 100, easing: 'linear' as const }],
    opacityTrack: [{ frame: 0, value: 100, easing: 'linear' as const }],
    visible: true,
    locked: false,
  };

  const frontAntennaLayer = {
    id: 'bee-ant-front',
    name: 'Front_Antenna_Overlap',
    parentId: 'bee-head',
    kind: 'rect' as const,
    width: 14,
    height: 82,
    cornerRadius: 7,
    sides: 4,
    closed: true,
    vertices: [],
    fillColor: '#0F172A',
    fillOpacity: 1,
    strokeColor: '#38BDF8',
    strokeWidth: 2.5,
    inpaintCap: true,
    anchor: { x: 0, y: 36 },
    positionTrack: [{ frame: 0, x: 24, y: -34, easing: 'linear' as const }],
    rotationTrack: [
      { frame: 0, value: 14, easing: 'easeInOut' as const },
      { frame: Math.min(58, 28 + lag), value: 14 - amp * 1.15, easing: 'easeInOut' as const },
      { frame: 60, value: 14, easing: 'easeInOut' as const },
    ],
    scaleTrack: [{ frame: 0, x: 100, y: 100, easing: 'linear' as const }],
    opacityTrack: [{ frame: 0, value: 100, easing: 'linear' as const }],
    visible: true,
    locked: false,
  };

  const frontTipLayer = {
    id: 'bee-ant-front-tip',
    name: 'Front_Antenna_Tip_Bulb',
    parentId: 'bee-ant-front',
    kind: 'ellipse' as const,
    width: 24,
    height: 24,
    cornerRadius: 0,
    sides: 5,
    closed: true,
    vertices: [],
    fillColor: '#0EA5E9',
    fillOpacity: 1,
    strokeColor: '#E0F2FE',
    strokeWidth: 2.5,
    inpaintCap: false,
    anchor: { x: 0, y: 18 },
    positionTrack: [{ frame: 0, x: 0, y: -38, easing: 'linear' as const }],
    rotationTrack: [
      { frame: 0, value: 8, easing: 'easeInOut' as const },
      { frame: Math.min(59, 30 + lag * 1.5), value: -amp * 1.35, easing: 'easeInOut' as const },
      { frame: 60, value: 8, easing: 'easeInOut' as const },
    ],
    scaleTrack: [{ frame: 0, x: 100, y: 100, easing: 'linear' as const }],
    opacityTrack: [{ frame: 0, value: 100, easing: 'linear' as const }],
    visible: true,
    locked: false,
  };

  // Overlap pin controls render depth order relative to headLayer
  const layers = options.frontAntennaOverlap
    ? [backAntennaLayer, backTipLayer, headLayer, frontAntennaLayer, frontTipLayer]
    : [backAntennaLayer, backTipLayer, frontAntennaLayer, frontTipLayer, headLayer];

  return {
    name: 'DemoD_Bee_Antennae_FollowThrough',
    width: 640,
    height: 420,
    fps: 30,
    totalFrames: 60,
    backgroundColor: '#0B1120',
    layers,
  };
}
