import * as THREE from 'three';
import { GeometryParams, PivotAlignment, ScenePart3D } from '../types/studio';

export const DEFAULT_GEOMETRY_PARAMS: GeometryParams = {
  width: 1.2,
  height: 1.2,
  depth: 1.2,
  radiusTop: 0.6,
  radiusBottom: 0.6,
  radialSegments: 24,
  tubeRadius: 0.22,
  lathePoints: [
    { x: 0.0, y: 0.0 },
    { x: 0.65, y: 0.0 },
    { x: 0.72, y: 0.25 },
    { x: 0.42, y: 0.65 },
    { x: 0.55, y: 1.15 },
    { x: 0.78, y: 1.45 },
    { x: 0.68, y: 1.6 },
    { x: 0.0, y: 1.6 },
  ],
  extrudePoints: [
    { x: -0.7, y: 0.0 },
    { x: 0.7, y: 0.0 },
    { x: 0.55, y: 0.9 },
    { x: 0.2, y: 1.25 },
    { x: -0.2, y: 1.25 },
    { x: -0.55, y: 0.9 },
  ],
  extrudeDepth: 0.45,
  bevelEnabled: true,
  bevelThickness: 0.08,
  bevelSize: 0.06,
  bevelSegments: 3,
};

export function createPartBufferGeometry(
  part: ScenePart3D
): THREE.BufferGeometry {
  const p = part.params;
  let geometry: THREE.BufferGeometry;

  switch (part.kind) {
    case 'box': {
      geometry = new THREE.BoxGeometry(
        Math.max(0.05, p.width),
        Math.max(0.05, p.height),
        Math.max(0.05, p.depth),
        2,
        2,
        2
      );
      break;
    }
    case 'cylinder': {
      geometry = new THREE.CylinderGeometry(
        Math.max(0.02, p.radiusTop),
        Math.max(0.02, p.radiusBottom),
        Math.max(0.05, p.height),
        Math.max(6, Math.round(p.radialSegments)),
        2
      );
      break;
    }
    case 'sphere': {
      const segs = Math.max(8, Math.round(p.radialSegments));
      geometry = new THREE.SphereGeometry(
        Math.max(0.05, p.radiusBottom),
        segs,
        Math.max(6, Math.round(segs * 0.75))
      );
      break;
    }
    case 'cone': {
      geometry = new THREE.ConeGeometry(
        Math.max(0.04, p.radiusBottom),
        Math.max(0.05, p.height),
        Math.max(6, Math.round(p.radialSegments)),
        2
      );
      break;
    }
    case 'torus': {
      const segs = Math.max(8, Math.round(p.radialSegments));
      geometry = new THREE.TorusGeometry(
        Math.max(0.1, p.radiusBottom),
        Math.max(0.02, p.tubeRadius),
        16,
        segs
      );
      break;
    }
    case 'lathe': {
      const pts =
        p.lathePoints.length >= 2
          ? p.lathePoints.map((pt) => new THREE.Vector2(Math.max(0, pt.x), pt.y))
          : [new THREE.Vector2(0, 0), new THREE.Vector2(0.5, 0.5), new THREE.Vector2(0, 1)];
      geometry = new THREE.LatheGeometry(
        pts,
        Math.max(8, Math.round(p.radialSegments))
      );
      break;
    }
    case 'extrude': {
      const shape = new THREE.Shape();
      const pts =
        p.extrudePoints.length >= 3
          ? p.extrudePoints
          : DEFAULT_GEOMETRY_PARAMS.extrudePoints;
      shape.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i].x, pts[i].y);
      }
      shape.closePath();

      geometry = new THREE.ExtrudeGeometry(shape, {
        steps: 2,
        depth: Math.max(0.05, p.extrudeDepth),
        bevelEnabled: p.bevelEnabled,
        bevelThickness: p.bevelEnabled ? Math.max(0.01, p.bevelThickness) : 0,
        bevelSize: p.bevelEnabled ? Math.max(0.01, p.bevelSize) : 0,
        bevelSegments: p.bevelEnabled ? Math.max(1, Math.round(p.bevelSegments)) : 1,
      });
      // Center along Z so extruded depth straddles local Z=0 cleanly
      geometry.computeBoundingBox();
      if (geometry.boundingBox) {
        const zCenter = (geometry.boundingBox.min.z + geometry.boundingBox.max.z) * 0.5;
        geometry.translate(0, 0, -zCenter);
      }
      break;
    }
  }

  applyPivotAlignment(geometry, part.pivot);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

export function applyPivotAlignment(
  geometry: THREE.BufferGeometry,
  pivot: PivotAlignment
): void {
  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return;
  const box = geometry.boundingBox;
  const centerX = (box.min.x + box.max.x) * 0.5;
  const centerZ = (box.min.z + box.max.z) * 0.5;

  if (pivot === 'bottom-center') {
    geometry.translate(-centerX, -box.min.y, -centerZ);
  } else {
    const centerY = (box.min.y + box.max.y) * 0.5;
    geometry.translate(-centerX, -centerY, -centerZ);
  }
}

export interface BuiltScene3DResult {
  rootGroup: THREE.Group;
  partMap: Map<string, THREE.Mesh>;
  vertexCount: number;
  triangleCount: number;
}

export function buildThreeSceneGraph(
  parts: ScenePart3D[],
  options?: {
    shadingMode?: 'studio' | 'wireframe' | 'clay';
    explodedFactor?: number;
  }
): BuiltScene3DResult {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'RigCraft_Asset_Root';

  const partMap = new Map<string, THREE.Mesh>();
  let vertexCount = 0;
  let triangleCount = 0;

  const shadingMode = options?.shadingMode ?? 'studio';
  const explodedFactor = options?.explodedFactor ?? 0;

  // First pass: instantiate meshes
  for (const part of parts) {
    const geometry = createPartBufferGeometry(part);
    const posAttr = geometry.getAttribute('position');
    if (posAttr) {
      vertexCount += posAttr.count;
      if (geometry.index) {
        triangleCount += Math.floor(geometry.index.count / 3);
      } else {
        triangleCount += Math.floor(posAttr.count / 3);
      }
    }

    const material = new THREE.MeshStandardMaterial({
      name: `${sanitizeNodeName(part.name)}_Mat`,
      color: shadingMode === 'clay' ? new THREE.Color('#CBD5E1') : new THREE.Color(part.color),
      roughness: shadingMode === 'clay' ? 0.65 : THREE.MathUtils.clamp(part.roughness, 0.05, 1),
      metalness: shadingMode === 'clay' ? 0.05 : THREE.MathUtils.clamp(part.metalness, 0, 1),
      wireframe: shadingMode === 'wireframe',
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = sanitizeNodeName(part.name);
    mesh.visible = part.visible;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { partId: part.id };

    const explodeOffset = new THREE.Vector3(
      part.position.x,
      part.position.y,
      part.position.z
    );
    if (explodedFactor > 0.001 && explodeOffset.lengthSq() > 0.0001) {
      explodeOffset.multiplyScalar(1 + explodedFactor * 0.85);
    } else if (explodedFactor > 0.001 && part.parentId) {
      explodeOffset.y += explodedFactor * 0.45;
    }

    mesh.position.set(explodeOffset.x, explodeOffset.y, explodeOffset.z);
    mesh.rotation.set(
      THREE.MathUtils.degToRad(part.rotation.x),
      THREE.MathUtils.degToRad(part.rotation.y),
      THREE.MathUtils.degToRad(part.rotation.z)
    );
    mesh.scale.set(part.scale.x, part.scale.y, part.scale.z);

    partMap.set(part.id, mesh);
  }

  // Second pass: wire parent-child hierarchy (preventing accidental cycles)
  for (const part of parts) {
    const mesh = partMap.get(part.id)!;
    if (part.parentId && part.parentId !== part.id && partMap.has(part.parentId)) {
      // Check cycle
      let cursor: string | null = part.parentId;
      let hasCycle = false;
      const visited = new Set<string>([part.id]);
      while (cursor) {
        if (visited.has(cursor)) {
          hasCycle = true;
          break;
        }
        visited.add(cursor);
        const parentObj = parts.find((item) => item.id === cursor);
        cursor = parentObj?.parentId ?? null;
      }
      if (!hasCycle) {
        partMap.get(part.parentId)!.add(mesh);
      } else {
        rootGroup.add(mesh);
      }
    } else {
      rootGroup.add(mesh);
    }
  }

  rootGroup.updateMatrixWorld(true);

  return {
    rootGroup,
    partMap,
    vertexCount,
    triangleCount,
  };
}

export function disposeSceneGraph(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material?.dispose();
      }
    }
  });
}

export function sanitizeNodeName(raw: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_.-]+/g, '_');
  return cleaned.length > 0 ? cleaned : 'Part';
}
