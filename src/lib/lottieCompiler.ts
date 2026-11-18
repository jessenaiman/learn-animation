import {
  EasingKind,
  ScalarKeyframe,
  Vec2Keyframe,
  VectorLayer2D,
  VectorProject2D,
} from '../types/studio';

function hexToNormalizedRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [
    Number.isFinite(r) ? Number(r.toFixed(4)) : 1,
    Number.isFinite(g) ? Number(g.toFixed(4)) : 1,
    Number.isFinite(b) ? Number(b.toFixed(4)) : 1,
  ];
}

function easingTangents(easing: EasingKind): {
  o: { x: number[]; y: number[] };
  i: { x: number[]; y: number[] };
} {
  switch (easing) {
    case 'easeInOut':
      return {
        o: { x: [0.42], y: [0] },
        i: { x: [0.58], y: [1] },
      };
    case 'easeOutBack':
      return {
        o: { x: [0.22], y: [1.18] },
        i: { x: [0.36], y: [1] },
      };
    case 'linear':
    default:
      return {
        o: { x: [0.167], y: [0.167] },
        i: { x: [0.833], y: [0.833] },
      };
  }
}

export function applyEasingProgress(t: number, easing: EasingKind): number {
  const clamped = Math.max(0, Math.min(1, t));
  if (easing === 'easeInOut') {
    return clamped < 0.5
      ? 4 * clamped * clamped * clamped
      : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
  }
  if (easing === 'easeOutBack') {
    const c1 = 1.45;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(clamped - 1, 3) + c1 * Math.pow(clamped - 1, 2);
  }
  return clamped;
}

export function evaluateScalarTrack(
  track: ScalarKeyframe[],
  frame: number,
  fallback: number
): number {
  if (!track || track.length === 0) return fallback;
  const sorted = [...track].sort((a, b) => a.frame - b.frame);
  if (frame <= sorted[0].frame) return sorted[0].value;
  if (frame >= sorted[sorted.length - 1].frame) {
    return sorted[sorted.length - 1].value;
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (frame >= cur.frame && frame <= next.frame) {
      const span = Math.max(0.0001, next.frame - cur.frame);
      const rawT = (frame - cur.frame) / span;
      const easedT = applyEasingProgress(rawT, cur.easing);
      return cur.value + (next.value - cur.value) * easedT;
    }
  }
  return fallback;
}

export function evaluateVec2Track(
  track: Vec2Keyframe[],
  frame: number,
  fallback: { x: number; y: number }
): { x: number; y: number } {
  if (!track || track.length === 0) return fallback;
  const sorted = [...track].sort((a, b) => a.frame - b.frame);
  if (frame <= sorted[0].frame) return { x: sorted[0].x, y: sorted[0].y };
  if (frame >= sorted[sorted.length - 1].frame) {
    const last = sorted[sorted.length - 1];
    return { x: last.x, y: last.y };
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (frame >= cur.frame && frame <= next.frame) {
      const span = Math.max(0.0001, next.frame - cur.frame);
      const rawT = (frame - cur.frame) / span;
      const easedT = applyEasingProgress(rawT, cur.easing);
      return {
        x: cur.x + (next.x - cur.x) * easedT,
        y: cur.y + (next.y - cur.y) * easedT,
      };
    }
  }
  return fallback;
}

function compileLottieScalarProp(track: ScalarKeyframe[], fallback: number) {
  const sorted = [...track].sort((a, b) => a.frame - b.frame);
  if (sorted.length <= 1) {
    return {
      a: 0,
      k: sorted.length === 1 ? sorted[0].value : fallback,
    };
  }

  const keyframes = sorted.map((kf, idx) => {
    const isLast = idx === sorted.length - 1;
    if (isLast) {
      return {
        t: kf.frame,
        s: [kf.value],
      };
    }
    const { i, o } = easingTangents(kf.easing);
    return {
      t: kf.frame,
      s: [kf.value],
      i,
      o,
    };
  });

  return {
    a: 1,
    k: keyframes,
  };
}

function compileLottieVec2Or3Prop(
  track: Vec2Keyframe[],
  fallback: { x: number; y: number },
  zValue: number | null
) {
  const sorted = [...track].sort((a, b) => a.frame - b.frame);
  const pack = (x: number, y: number) =>
    zValue !== null ? [x, y, zValue] : [x, y];

  if (sorted.length <= 1) {
    const pt = sorted.length === 1 ? sorted[0] : fallback;
    return {
      a: 0,
      k: pack(pt.x, pt.y),
    };
  }

  const keyframes = sorted.map((kf, idx) => {
    const isLast = idx === sorted.length - 1;
    if (isLast) {
      return {
        t: kf.frame,
        s: pack(kf.x, kf.y),
      };
    }
    const { i, o } = easingTangents(kf.easing);
    const dim = zValue !== null ? 3 : 2;
    return {
      t: kf.frame,
      s: pack(kf.x, kf.y),
      i: {
        x: Array(dim).fill(i.x[0]),
        y: Array(dim).fill(i.y[0]),
      },
      o: {
        x: Array(dim).fill(o.x[0]),
        y: Array(dim).fill(o.y[0]),
      },
    };
  });

  return {
    a: 1,
    k: keyframes,
  };
}

function buildShapeItemsForLayer(layer: VectorLayer2D): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];

  if (layer.kind === 'rect') {
    items.push({
      ty: 'rc',
      d: 1,
      s: { a: 0, k: [layer.width, layer.height] },
      p: { a: 0, k: [0, 0] },
      r: { a: 0, k: layer.cornerRadius },
      nm: 'Rectangle Path',
    });

    if (layer.inpaintCap) {
      const capDiameter = Math.min(layer.width, layer.height) * 0.96;
      const offsetAxis =
        layer.height >= layer.width
          ? [0, -layer.height * 0.5]
          : [-layer.width * 0.5, 0];
      items.push({
        ty: 'el',
        d: 1,
        s: { a: 0, k: [capDiameter, capDiameter] },
        p: { a: 0, k: offsetAxis },
        nm: 'Inpainted Joint Cap',
      });
    }
  } else if (layer.kind === 'ellipse') {
    items.push({
      ty: 'el',
      d: 1,
      s: { a: 0, k: [layer.width, layer.height] },
      p: { a: 0, k: [0, 0] },
      nm: 'Ellipse Path',
    });
  } else if (layer.kind === 'polygon') {
    const outerR = Math.max(layer.width, layer.height) * 0.5;
    items.push({
      ty: 'sr',
      sy: 2, // polygon
      d: 1,
      pt: { a: 0, k: Math.max(3, Math.round(layer.sides || 5)) },
      p: { a: 0, k: [0, 0] },
      r: { a: 0, k: 0 },
      or: { a: 0, k: outerR },
      os: { a: 0, k: 0 },
      nm: 'Polystar Path',
    });
  } else if (layer.kind === 'path') {
    const verts = layer.vertices.length >= 2
      ? layer.vertices
      : [
          { x: -40, y: 0, inX: 0, inY: 0, outX: 20, outY: -30 },
          { x: 40, y: 0, inX: -20, inY: -30, outX: 0, outY: 0 },
        ];
    items.push({
      ty: 'sh',
      d: 1,
      ks: {
        a: 0,
        k: {
          c: layer.closed,
          v: verts.map((v) => [Number(v.x.toFixed(2)), Number(v.y.toFixed(2))]),
          i: verts.map((v) => [Number(v.inX.toFixed(2)), Number(v.inY.toFixed(2))]),
          o: verts.map((v) => [Number(v.outX.toFixed(2)), Number(v.outY.toFixed(2))]),
        },
      },
      nm: 'Bezier Path',
    });
  }

  if (layer.strokeWidth > 0) {
    items.push({
      ty: 'st',
      c: { a: 0, k: [...hexToNormalizedRgb(layer.strokeColor), 1] },
      o: { a: 0, k: 100 },
      w: { a: 0, k: layer.strokeWidth },
      lc: 2, // round cap
      lj: 2, // round join
      nm: 'Stroke',
    });
  }

  if (layer.fillOpacity > 0 && (layer.kind !== 'path' || layer.closed)) {
    items.push({
      ty: 'fl',
      c: { a: 0, k: [...hexToNormalizedRgb(layer.fillColor), 1] },
      o: { a: 0, k: Math.round(layer.fillOpacity * 100) },
      r: 1,
      nm: 'Fill',
    });
  }

  // Group Transform required at the end of a Lottie 'gr' items array
  items.push({
    ty: 'tr',
    p: { a: 0, k: [0, 0] },
    a: { a: 0, k: [0, 0] },
    s: { a: 0, k: [100, 100] },
    r: { a: 0, k: 0 },
    o: { a: 0, k: 100 },
    sk: { a: 0, k: 0 },
    sa: { a: 0, k: 0 },
    nm: 'Transform',
  });

  return [
    {
      ty: 'gr',
      it: items,
      nm: `${layer.name} Group`,
      bm: 0,
    },
  ];
}

/**
 * Compiles a VectorProject2D into a compliant Bodymovin / Lottie v5.7.4 JSON structure.
 * Note: In Lottie, layers[0] renders ON TOP, while in our studio layers[last] is drawn on top
 * (or we reverse so top-most studio layer appears first in Lottie's render stack).
 */
export function compileProjectToLottieJSON(
  project: VectorProject2D,
  options?: { includeBackgroundSolid?: boolean }
): Record<string, unknown> {
  const visibleLayers = project.layers.filter((l) => l.visible);

  // Assign 1-based Lottie indices (`ind`)
  const indById = new Map<string, number>();
  visibleLayers.forEach((layer, i) => {
    indById.set(layer.id, i + 1);
  });

  // Reverse order so the last layer in our bottom-to-top studio stack renders on top in Lottie
  const orderedForLottie = [...visibleLayers].reverse();

  const lottieLayers: Record<string, unknown>[] = orderedForLottie.map((layer) => {
    const ind = indById.get(layer.id)!;
    const parentInd =
      layer.parentId && layer.parentId !== layer.id
        ? indById.get(layer.parentId)
        : undefined;

    const lottieLayer: Record<string, unknown> = {
      ddd: 0,
      ind,
      ty: 4, // Shape layer
      nm: layer.name,
      sr: 1,
      ks: {
        o: compileLottieScalarProp(layer.opacityTrack, 100),
        r: compileLottieScalarProp(layer.rotationTrack, 0),
        p: compileLottieVec2Or3Prop(
          layer.positionTrack,
          { x: project.width * 0.5, y: project.height * 0.5 },
          0
        ),
        a: {
          a: 0,
          k: [layer.anchor.x, layer.anchor.y, 0],
        },
        s: compileLottieVec2Or3Prop(layer.scaleTrack, { x: 100, y: 100 }, 100),
      },
      ao: 0,
      shapes: buildShapeItemsForLayer(layer),
      ip: 0,
      op: project.totalFrames,
      st: 0,
      bm: 0,
    };

    if (parentInd !== undefined) {
      lottieLayer.parent = parentInd;
    }

    return lottieLayer;
  });

  if (options?.includeBackgroundSolid && project.backgroundColor) {
    lottieLayers.push({
      ddd: 0,
      ind: visibleLayers.length + 1,
      ty: 1, // Solid layer
      nm: 'Background',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [project.width / 2, project.height / 2, 0] },
        a: { a: 0, k: [project.width / 2, project.height / 2, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      sw: project.width,
      sh: project.height,
      sc: project.backgroundColor,
      ip: 0,
      op: project.totalFrames,
      st: 0,
      bm: 0,
    });
  }

  return {
    v: '5.7.4',
    fr: project.fps,
    ip: 0,
    op: project.totalFrames,
    w: project.width,
    h: project.height,
    nm: project.name || 'RigCraft_2D_Animation',
    ddd: 0,
    assets: [],
    layers: lottieLayers,
  };
}

/**
 * Computes the local 2D affine matrix (3x3 homogeneous) of a layer at a given frame,
 * matching Lottie's transform order: Translate(position) * Rotate(rotation) * Scale(scale/100) * Translate(-anchor).
 */
export type Mat2D = [number, number, number, number, number, number]; // [a, b, c, d, tx, ty]

export function multiplyMat2D(m1: Mat2D, m2: Mat2D): Mat2D {
  const [a1, b1, c1, d1, tx1, ty1] = m1;
  const [a2, b2, c2, d2, tx2, ty2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * tx2 + c1 * ty2 + tx1,
    b1 * tx2 + d1 * ty2 + ty1,
  ];
}

export function invertMat2D(m: Mat2D): Mat2D {
  const [a, b, c, d, tx, ty] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-8) return [1, 0, 0, 1, 0, 0];
  const invDet = 1 / det;
  return [
    d * invDet,
    -b * invDet,
    -c * invDet,
    a * invDet,
    (c * ty - d * tx) * invDet,
    (b * tx - a * ty) * invDet,
  ];
}

export function transformPoint2D(m: Mat2D, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

export function getLayerLocalMatrix(
  layer: VectorLayer2D,
  frame: number,
  compCenter: { x: number; y: number }
): Mat2D {
  const pos = evaluateVec2Track(layer.positionTrack, frame, compCenter);
  const rotDeg = evaluateScalarTrack(layer.rotationTrack, frame, 0);
  const scl = evaluateVec2Track(layer.scaleTrack, frame, { x: 100, y: 100 });
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = scl.x / 100;
  const sy = scl.y / 100;

  // T(pos) * R(rad) * S(sx, sy) * T(-anchor)
  const mPos: Mat2D = [1, 0, 0, 1, pos.x, pos.y];
  const mRot: Mat2D = [cos, sin, -sin, cos, 0, 0];
  const mScl: Mat2D = [sx, 0, 0, sy, 0, 0];
  const mAnc: Mat2D = [1, 0, 0, 1, -layer.anchor.x, -layer.anchor.y];

  return multiplyMat2D(multiplyMat2D(multiplyMat2D(mPos, mRot), mScl), mAnc);
}

export function getLayerWorldMatrix(
  layer: VectorLayer2D,
  allLayers: VectorLayer2D[],
  frame: number,
  compCenter: { x: number; y: number },
  visited = new Set<string>()
): Mat2D {
  const local = getLayerLocalMatrix(layer, frame, compCenter);
  if (!layer.parentId || layer.parentId === layer.id || visited.has(layer.id)) {
    return local;
  }
  visited.add(layer.id);
  const parent = allLayers.find((l) => l.id === layer.parentId);
  if (!parent) return local;

  // Note: In After Effects & Lottie, child inherits parent's transform BEFORE parent's negative anchor offset?
  // Wait: in Lottie & AE, a child layer's position (0,0) is relative to the parent layer's local coordinate system
  // (where (0,0) is the parent's shape origin, and parent's anchor is at (parent.anchor.x, parent.anchor.y)!).
  // Specifically, Lottie computes parentWorldMatrix = T(pos) * R(rot) * S(scale) * T(-anchor), and childWorld = parentWorldMatrix * childLocalMatrix!
  const parentWorld = getLayerWorldMatrix(parent, allLayers, frame, compCenter, visited);
  return multiplyMat2D(parentWorld, local);
}
