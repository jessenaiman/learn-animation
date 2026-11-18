import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { ScenePart3D } from '../types/studio';
import { buildThreeSceneGraph, disposeSceneGraph, sanitizeNodeName } from './geometryBuilder';

export interface Export3DOptions {
  assetName: string;
  includeTurntableClip?: boolean;
  zUpForBlender?: boolean;
}

/**
 * Creates a smooth 360-degree turntable AnimationClip on the root node
 * so exported glTF/GLB files also carry a playable Three.js / Blender animation track when desired.
 */
function buildTurntableClip(rootName: string): THREE.AnimationClip {
  const times = [0, 1, 2, 3, 4];
  const values: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    values.push(q.x, q.y, q.z, q.w);
  }
  const track = new THREE.QuaternionKeyframeTrack(
    `${rootName}.quaternion`,
    times,
    values
  );
  return new THREE.AnimationClip('Turntable_360', 4, [track]);
}

export async function exportSceneToGLTF(
  parts: ScenePart3D[],
  binary: boolean,
  options: Export3DOptions
): Promise<{ blob: Blob; filename: string; byteLength: number }> {
  const { rootGroup } = buildThreeSceneGraph(parts);
  const safeBase = sanitizeNodeName(options.assetName || 'RigCraft_Model');
  rootGroup.name = safeBase;

  const animations = options.includeTurntableClip
    ? [buildTurntableClip(safeBase)]
    : [];

  const exporter = new GLTFExporter();

  try {
    const result = await exporter.parseAsync(rootGroup, {
      binary,
      animations,
      trs: true,
    });

    if (binary && result instanceof ArrayBuffer) {
      const blob = new Blob([result], { type: 'model/gltf-binary' });
      return {
        blob,
        filename: `${safeBase}.glb`,
        byteLength: result.byteLength,
      };
    }

    const jsonText = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonText], { type: 'model/gltf+json' });
    return {
      blob,
      filename: `${safeBase}.gltf`,
      byteLength: blob.size,
    };
  } finally {
    disposeSceneGraph(rootGroup);
  }
}

/**
 * Generates clean Wavefront .OBJ + companion .MTL strings preserving named objects,
 * world-space transformed vertices, normals, UVs, and PBR material colors.
 */
export function exportSceneToOBJ(
  parts: ScenePart3D[],
  options: Export3DOptions
): {
  objBlob: Blob;
  objFilename: string;
  mtlBlob: Blob;
  mtlFilename: string;
  objPreviewText: string;
} {
  const { rootGroup } = buildThreeSceneGraph(parts);
  const safeBase = sanitizeNodeName(options.assetName || 'RigCraft_Model');

  if (options.zUpForBlender) {
    // Rotate +Y up to +Z up when user specifically requests baked Z-up OBJ coordinates
    rootGroup.rotation.x = Math.PI / 2;
  }
  rootGroup.updateMatrixWorld(true);

  const objLines: string[] = [
    `# RigCraft Studio Wavefront OBJ Export`,
    `# Asset: ${safeBase}`,
    `mtllib ${safeBase}.mtl`,
    ``,
  ];
  const mtlLines: string[] = [
    `# RigCraft Studio Wavefront MTL Material Library`,
    ``,
  ];

  const seenMaterials = new Set<string>();
  let vertexOffset = 1;
  let normalOffset = 1;
  let uvOffset = 1;

  const vTmp = new THREE.Vector3();
  const nTmp = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  rootGroup.traverse((node) => {
    if (!(node as THREE.Mesh).isMesh || !node.visible) return;
    const mesh = node as THREE.Mesh;
    const geom = mesh.geometry;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const matName = sanitizeNodeName(mat.name || `${mesh.name}_Mat`);

    if (!seenMaterials.has(matName)) {
      seenMaterials.add(matName);
      const c = mat.color;
      mtlLines.push(`newmtl ${matName}`);
      mtlLines.push(`Ka 0.0800 0.0800 0.0800`);
      mtlLines.push(`Kd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}`);
      mtlLines.push(`Ks ${(1 - mat.roughness).toFixed(4)} ${(1 - mat.roughness).toFixed(4)} ${(1 - mat.roughness).toFixed(4)}`);
      mtlLines.push(`Pr ${mat.roughness.toFixed(4)}`);
      mtlLines.push(`Pm ${mat.metalness.toFixed(4)}`);
      mtlLines.push(`d 1.0000`);
      mtlLines.push(`illum 2`);
      mtlLines.push(``);
    }

    objLines.push(`o ${mesh.name}`);
    objLines.push(`usemtl ${matName}`);

    const pos = geom.getAttribute('position');
    const norm = geom.getAttribute('normal');
    const uv = geom.getAttribute('uv');
    normalMatrix.getNormalMatrix(mesh.matrixWorld);

    for (let i = 0; i < pos.count; i++) {
      vTmp.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      objLines.push(`v ${vTmp.x.toFixed(6)} ${vTmp.y.toFixed(6)} ${vTmp.z.toFixed(6)}`);
    }

    if (uv) {
      for (let i = 0; i < uv.count; i++) {
        objLines.push(`vt ${uv.getX(i).toFixed(6)} ${uv.getY(i).toFixed(6)}`);
      }
    }

    if (norm) {
      for (let i = 0; i < norm.count; i++) {
        nTmp.fromBufferAttribute(norm, i).applyMatrix3(normalMatrix).normalize();
        objLines.push(`vn ${nTmp.x.toFixed(6)} ${nTmp.y.toFixed(6)} ${nTmp.z.toFixed(6)}`);
      }
    }

    const indexAttr = geom.getIndex();
    const triCount = indexAttr ? indexAttr.count / 3 : pos.count / 3;

    for (let t = 0; t < triCount; t++) {
      const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
      const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;

      const formatVert = (idx: number) => {
        const vi = vertexOffset + idx;
        const ti = uv ? `${uvOffset + idx}` : '';
        const ni = norm ? `${normalOffset + idx}` : '';
        if (uv && norm) return `${vi}/${ti}/${ni}`;
        if (norm) return `${vi}//${ni}`;
        if (uv) return `${vi}/${ti}`;
        return `${vi}`;
      };

      objLines.push(`f ${formatVert(i0)} ${formatVert(i1)} ${formatVert(i2)}`);
    }

    objLines.push(``);
    vertexOffset += pos.count;
    if (uv) uvOffset += uv.count;
    if (norm) normalOffset += norm.count;
  });

  disposeSceneGraph(rootGroup);

  const objText = objLines.join('\n');
  const mtlText = mtlLines.join('\n');

  return {
    objBlob: new Blob([objText], { type: 'text/plain;charset=utf-8' }),
    objFilename: `${safeBase}.obj`,
    mtlBlob: new Blob([mtlText], { type: 'text/plain;charset=utf-8' }),
    mtlFilename: `${safeBase}.mtl`,
    objPreviewText: objText.slice(0, 2400),
  };
}

// ─── Binary Autodesk FBX 7.4 (v7400) Serializer ─────────────────────────────
// Produces native Binary FBX 7400 files directly importable in Blender, Three.js FBXLoader, Unity, and Unreal.

type FBXProp =
  | { type: 'C'; val: boolean }
  | { type: 'Y'; val: number }
  | { type: 'I'; val: number }
  | { type: 'L'; val: bigint }
  | { type: 'F'; val: number }
  | { type: 'D'; val: number }
  | { type: 'S'; val: string }
  | { type: 'R'; val: Uint8Array }
  | { type: 'd'; val: Float64Array }
  | { type: 'i'; val: Int32Array };

interface FBXNode {
  name: string;
  props?: FBXProp[];
  children?: FBXNode[];
  forceBlock?: boolean;
}

const textEncoder = new TextEncoder();

function encodeFBXProp(prop: FBXProp): Uint8Array {
  switch (prop.type) {
    case 'C': {
      const buf = new Uint8Array(2);
      buf[0] = 'C'.charCodeAt(0);
      buf[1] = prop.val ? 1 : 0;
      return buf;
    }
    case 'Y': {
      const buf = new Uint8Array(3);
      buf[0] = 'Y'.charCodeAt(0);
      new DataView(buf.buffer).setInt16(1, prop.val, true);
      return buf;
    }
    case 'I': {
      const buf = new Uint8Array(5);
      buf[0] = 'I'.charCodeAt(0);
      new DataView(buf.buffer).setInt32(1, prop.val, true);
      return buf;
    }
    case 'L': {
      const buf = new Uint8Array(9);
      buf[0] = 'L'.charCodeAt(0);
      new DataView(buf.buffer).setBigInt64(1, prop.val, true);
      return buf;
    }
    case 'F': {
      const buf = new Uint8Array(5);
      buf[0] = 'F'.charCodeAt(0);
      new DataView(buf.buffer).setFloat32(1, prop.val, true);
      return buf;
    }
    case 'D': {
      const buf = new Uint8Array(9);
      buf[0] = 'D'.charCodeAt(0);
      new DataView(buf.buffer).setFloat64(1, prop.val, true);
      return buf;
    }
    case 'S': {
      const strBytes = textEncoder.encode(prop.val);
      const buf = new Uint8Array(5 + strBytes.length);
      buf[0] = 'S'.charCodeAt(0);
      new DataView(buf.buffer).setUint32(1, strBytes.length, true);
      buf.set(strBytes, 5);
      return buf;
    }
    case 'R': {
      const buf = new Uint8Array(5 + prop.val.length);
      buf[0] = 'R'.charCodeAt(0);
      new DataView(buf.buffer).setUint32(1, prop.val.length, true);
      buf.set(prop.val, 5);
      return buf;
    }
    case 'd': {
      const byteLen = prop.val.byteLength;
      const buf = new Uint8Array(13 + byteLen);
      buf[0] = 'd'.charCodeAt(0);
      const dv = new DataView(buf.buffer);
      dv.setUint32(1, prop.val.length, true); // arrayLength
      dv.setUint32(5, 0, true); // encoding = 0 (uncompressed)
      dv.setUint32(9, byteLen, true); // compressedLength = raw byte length
      for (let i = 0; i < prop.val.length; i++) {
        dv.setFloat64(13 + i * 8, prop.val[i], true);
      }
      return buf;
    }
    case 'i': {
      const byteLen = prop.val.byteLength;
      const buf = new Uint8Array(13 + byteLen);
      buf[0] = 'i'.charCodeAt(0);
      const dv = new DataView(buf.buffer);
      dv.setUint32(1, prop.val.length, true);
      dv.setUint32(5, 0, true);
      dv.setUint32(9, byteLen, true);
      for (let i = 0; i < prop.val.length; i++) {
        dv.setInt32(13 + i * 4, prop.val[i], true);
      }
      return buf;
    }
  }
}

function serializeFBXNode(node: FBXNode, startOffset: number): Uint8Array {
  const nameBytes = textEncoder.encode(node.name);
  const propChunks = (node.props ?? []).map(encodeFBXProp);
  const propListLen = propChunks.reduce((acc, c) => acc + c.length, 0);

  const hasChildrenBlock =
    Boolean(node.forceBlock) ||
    Boolean(node.children && node.children.length > 0) ||
    propChunks.length === 0;

  const headerLen = 13 + nameBytes.length;
  let cursor = startOffset + headerLen + propListLen;

  const childChunks: Uint8Array[] = [];
  if (node.children) {
    for (const child of node.children) {
      const chunk = serializeFBXNode(child, cursor);
      childChunks.push(chunk);
      cursor += chunk.length;
    }
  }

  if (hasChildrenBlock) {
    // 13-byte NULL record marks end of nested node list in FBX 7400
    childChunks.push(new Uint8Array(13));
    cursor += 13;
  }

  const totalLen = cursor - startOffset;
  const out = new Uint8Array(totalLen);
  const dv = new DataView(out.buffer);

  dv.setUint32(0, cursor, true); // endOffset
  dv.setUint32(4, propChunks.length, true); // numProperties
  dv.setUint32(8, propListLen, true); // propertyListLen
  out[12] = nameBytes.length;
  out.set(nameBytes, 13);

  let writePos = headerLen;
  for (const pc of propChunks) {
    out.set(pc, writePos);
    writePos += pc.length;
  }
  for (const cc of childChunks) {
    out.set(cc, writePos);
    writePos += cc.length;
  }

  return out;
}

function p70(
  name: string,
  typeName: string,
  subType: string,
  flags: string,
  extraProps: FBXProp[]
): FBXNode {
  return {
    name: 'P',
    props: [
      { type: 'S', val: name },
      { type: 'S', val: typeName },
      { type: 'S', val: subType },
      { type: 'S', val: flags },
      ...extraProps,
    ],
  };
}

export function exportSceneToFBX(
  parts: ScenePart3D[],
  options: Export3DOptions
): { blob: Blob; filename: string; byteLength: number } {
  const { rootGroup, partMap } = buildThreeSceneGraph(parts);
  const safeBase = sanitizeNodeName(options.assetName || 'RigCraft_Model');

  let nextId = 100000n;
  const allocId = () => {
    nextId += 100n;
    return nextId;
  };

  const objectNodes: FBXNode[] = [];
  const connectionNodes: FBXNode[] = [];

  const modelIdByPartId = new Map<string, bigint>();
  let geometryCount = 0;
  let modelCount = 0;
  let materialCount = 0;

  for (const part of parts) {
    if (!part.visible) continue;
    const mesh = partMap.get(part.id);
    if (!mesh) continue;

    const geom = mesh.geometry;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const posAttr = geom.getAttribute('position');
    const normAttr = geom.getAttribute('normal');
    const uvAttr = geom.getAttribute('uv');
    const indexAttr = geom.getIndex();

    const geomId = allocId();
    const modelId = allocId();
    const matId = allocId();
    modelIdByPartId.set(part.id, modelId);

    geometryCount++;
    modelCount++;
    materialCount++;

    // Build Vertices (Float64Array x,y,z)
    const vertices = new Float64Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      vertices[i * 3] = posAttr.getX(i);
      vertices[i * 3 + 1] = posAttr.getY(i);
      vertices[i * 3 + 2] = posAttr.getZ(i);
    }

    // Build PolygonVertexIndex (last index of each triangle bitwise negated: ~idx = -idx - 1)
    const triCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);
    const polyIndices = new Int32Array(triCount * 3);
    const normalsByPolyVertex = new Float64Array(triCount * 3 * 3);
    const uvsByPolyVertex = new Float64Array(triCount * 3 * 2);

    for (let t = 0; t < triCount; t++) {
      const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
      const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;

      polyIndices[t * 3] = i0;
      polyIndices[t * 3 + 1] = i1;
      polyIndices[t * 3 + 2] = ~i2;

      const triIdxs = [i0, i1, i2];
      for (let k = 0; k < 3; k++) {
        const vi = triIdxs[k];
        const outBase = (t * 3 + k) * 3;
        if (normAttr) {
          normalsByPolyVertex[outBase] = normAttr.getX(vi);
          normalsByPolyVertex[outBase + 1] = normAttr.getY(vi);
          normalsByPolyVertex[outBase + 2] = normAttr.getZ(vi);
        } else {
          normalsByPolyVertex[outBase + 1] = 1;
        }
        const uvBase = (t * 3 + k) * 2;
        if (uvAttr) {
          uvsByPolyVertex[uvBase] = uvAttr.getX(vi);
          uvsByPolyVertex[uvBase + 1] = uvAttr.getY(vi);
        }
      }
    }

    const partSafeName = sanitizeNodeName(part.name);

    // 1. Geometry Node
    objectNodes.push({
      name: 'Geometry',
      props: [
        { type: 'L', val: geomId },
        { type: 'S', val: `${partSafeName}_Geo\x00\x01Geometry` },
        { type: 'S', val: 'Mesh' },
      ],
      children: [
        { name: 'GeometryVersion', props: [{ type: 'I', val: 124 }] },
        { name: 'Vertices', props: [{ type: 'd', val: vertices }] },
        { name: 'PolygonVertexIndex', props: [{ type: 'i', val: polyIndices }] },
        {
          name: 'LayerElementNormal',
          props: [{ type: 'I', val: 0 }],
          children: [
            { name: 'Version', props: [{ type: 'I', val: 101 }] },
            { name: 'Name', props: [{ type: 'S', val: '' }] },
            { name: 'MappingInformationType', props: [{ type: 'S', val: 'ByPolygonVertex' }] },
            { name: 'ReferenceInformationType', props: [{ type: 'S', val: 'Direct' }] },
            { name: 'Normals', props: [{ type: 'd', val: normalsByPolyVertex }] },
          ],
        },
        {
          name: 'LayerElementUV',
          props: [{ type: 'I', val: 0 }],
          children: [
            { name: 'Version', props: [{ type: 'I', val: 101 }] },
            { name: 'Name', props: [{ type: 'S', val: 'UVMap' }] },
            { name: 'MappingInformationType', props: [{ type: 'S', val: 'ByPolygonVertex' }] },
            { name: 'ReferenceInformationType', props: [{ type: 'S', val: 'Direct' }] },
            { name: 'UV', props: [{ type: 'd', val: uvsByPolyVertex }] },
          ],
        },
        {
          name: 'LayerElementMaterial',
          props: [{ type: 'I', val: 0 }],
          children: [
            { name: 'Version', props: [{ type: 'I', val: 101 }] },
            { name: 'Name', props: [{ type: 'S', val: '' }] },
            { name: 'MappingInformationType', props: [{ type: 'S', val: 'AllSame' }] },
            { name: 'ReferenceInformationType', props: [{ type: 'S', val: 'IndexToDirect' }] },
            { name: 'Materials', props: [{ type: 'i', val: new Int32Array([0]) }] },
          ],
        },
        {
          name: 'Layer',
          props: [{ type: 'I', val: 0 }],
          children: [
            { name: 'Version', props: [{ type: 'I', val: 100 }] },
            {
              name: 'LayerElement',
              children: [
                { name: 'Type', props: [{ type: 'S', val: 'LayerElementNormal' }] },
                { name: 'TypedIndex', props: [{ type: 'I', val: 0 }] },
              ],
            },
            {
              name: 'LayerElement',
              children: [
                { name: 'Type', props: [{ type: 'S', val: 'LayerElementMaterial' }] },
                { name: 'TypedIndex', props: [{ type: 'I', val: 0 }] },
              ],
            },
            {
              name: 'LayerElement',
              children: [
                { name: 'Type', props: [{ type: 'S', val: 'LayerElementUV' }] },
                { name: 'TypedIndex', props: [{ type: 'I', val: 0 }] },
              ],
            },
          ],
        },
      ],
    });

    // 2. Model Node (FBX default UnitScaleFactor=100.0 means 1 unit = 1 cm; using UnitScaleFactor=100.0 and scaling meters * 100 ensures 1m in Three.js = 1m in Blender!)
    objectNodes.push({
      name: 'Model',
      props: [
        { type: 'L', val: modelId },
        { type: 'S', val: `${partSafeName}\x00\x01Model` },
        { type: 'S', val: 'Mesh' },
      ],
      children: [
        { name: 'Version', props: [{ type: 'I', val: 232 }] },
        {
          name: 'Properties70',
          children: [
            p70('Lcl Translation', 'Lcl Translation', '', 'A', [
              { type: 'D', val: part.position.x },
              { type: 'D', val: part.position.y },
              { type: 'D', val: part.position.z },
            ]),
            p70('Lcl Rotation', 'Lcl Rotation', '', 'A', [
              { type: 'D', val: part.rotation.x },
              { type: 'D', val: part.rotation.y },
              { type: 'D', val: part.rotation.z },
            ]),
            p70('Lcl Scaling', 'Lcl Scaling', '', 'A', [
              { type: 'D', val: part.scale.x },
              { type: 'D', val: part.scale.y },
              { type: 'D', val: part.scale.z },
            ]),
            p70('DefaultAttributeIndex', 'int', 'Integer', '', [{ type: 'I', val: 0 }]),
            p70('InheritType', 'enum', '', '', [{ type: 'I', val: 1 }]),
          ],
        },
        { name: 'Shading', props: [{ type: 'C', val: true }] },
        { name: 'Culling', props: [{ type: 'S', val: 'CullingOff' }] },
      ],
    });

    // 3. Material Node
    const c = mat.color;
    const shininess = Math.max(2, Math.pow(2, (1 - mat.roughness) * 8));
    objectNodes.push({
      name: 'Material',
      props: [
        { type: 'L', val: matId },
        { type: 'S', val: `${partSafeName}_Mat\x00\x01Material` },
        { type: 'S', val: '' },
      ],
      children: [
        { name: 'Version', props: [{ type: 'I', val: 102 }] },
        { name: 'ShadingModel', props: [{ type: 'S', val: 'Phong' }] },
        { name: 'MultiLayer', props: [{ type: 'I', val: 0 }] },
        {
          name: 'Properties70',
          children: [
            p70('DiffuseColor', 'Color', '', 'A', [
              { type: 'D', val: c.r },
              { type: 'D', val: c.g },
              { type: 'D', val: c.b },
            ]),
            p70('SpecularColor', 'Color', '', 'A', [
              { type: 'D', val: 0.25 + mat.metalness * 0.6 },
              { type: 'D', val: 0.25 + mat.metalness * 0.6 },
              { type: 'D', val: 0.25 + mat.metalness * 0.6 },
            ]),
            p70('ShininessExponent', 'Number', '', 'A', [{ type: 'D', val: shininess }]),
            p70('ReflectionFactor', 'Number', '', 'A', [{ type: 'D', val: mat.metalness }]),
          ],
        },
      ],
    });

    // Connect Geometry -> Model and Material -> Model
    connectionNodes.push({
      name: 'C',
      props: [
        { type: 'S', val: 'OO' },
        { type: 'L', val: geomId },
        { type: 'L', val: modelId },
      ],
    });
    connectionNodes.push({
      name: 'C',
      props: [
        { type: 'S', val: 'OO' },
        { type: 'L', val: matId },
        { type: 'L', val: modelId },
      ],
    });
  }

  // Wire Model -> Parent Model or Root (0n)
  for (const part of parts) {
    if (!part.visible) continue;
    const modelId = modelIdByPartId.get(part.id);
    if (!modelId) continue;

    const parentModelId =
      part.parentId && part.parentId !== part.id
        ? modelIdByPartId.get(part.parentId) ?? 0n
        : 0n;

    connectionNodes.push({
      name: 'C',
      props: [
        { type: 'S', val: 'OO' },
        { type: 'L', val: modelId },
        { type: 'L', val: parentModelId },
      ],
    });
  }

  disposeSceneGraph(rootGroup);

  const topNodes: FBXNode[] = [
    {
      name: 'FBXHeaderExtension',
      children: [
        { name: 'FBXHeaderVersion', props: [{ type: 'I', val: 1003 }] },
        { name: 'FBXVersion', props: [{ type: 'I', val: 7400 }] },
        { name: 'EncryptionType', props: [{ type: 'I', val: 0 }] },
        { name: 'Creator', props: [{ type: 'S', val: 'RigCraft Studio FBX 7.4 Exporter' }] },
      ],
    },
    {
      name: 'GlobalSettings',
      children: [
        { name: 'Version', props: [{ type: 'I', val: 1000 }] },
        {
          name: 'Properties70',
          children: [
            p70('UpAxis', 'int', 'Integer', '', [{ type: 'I', val: 1 }]), // +Y Up
            p70('UpAxisSign', 'int', 'Integer', '', [{ type: 'I', val: 1 }]),
            p70('FrontAxis', 'int', 'Integer', '', [{ type: 'I', val: 2 }]), // +Z Front
            p70('FrontAxisSign', 'int', 'Integer', '', [{ type: 'I', val: 1 }]),
            p70('CoordAxis', 'int', 'Integer', '', [{ type: 'I', val: 0 }]), // +X Right
            p70('CoordAxisSign', 'int', 'Integer', '', [{ type: 'I', val: 1 }]),
            p70('UnitScaleFactor', 'double', 'Number', '', [{ type: 'D', val: 100.0 }]), // 1 unit = 1 meter in Blender
            p70('OriginalUnitScaleFactor', 'double', 'Number', '', [{ type: 'D', val: 100.0 }]),
          ],
        },
      ],
    },
    {
      name: 'Definitions',
      children: [
        { name: 'Version', props: [{ type: 'I', val: 100 }] },
        {
          name: 'Count',
          props: [{ type: 'I', val: 1 + geometryCount + modelCount + materialCount }],
        },
        {
          name: 'ObjectType',
          props: [{ type: 'S', val: 'GlobalSettings' }],
          children: [{ name: 'Count', props: [{ type: 'I', val: 1 }] }],
        },
        {
          name: 'ObjectType',
          props: [{ type: 'S', val: 'Geometry' }],
          children: [{ name: 'Count', props: [{ type: 'I', val: geometryCount }] }],
        },
        {
          name: 'ObjectType',
          props: [{ type: 'S', val: 'Model' }],
          children: [{ name: 'Count', props: [{ type: 'I', val: modelCount }] }],
        },
        {
          name: 'ObjectType',
          props: [{ type: 'S', val: 'Material' }],
          children: [{ name: 'Count', props: [{ type: 'I', val: materialCount }] }],
        },
      ],
    },
    {
      name: 'Objects',
      forceBlock: true,
      children: objectNodes,
    },
    {
      name: 'Connections',
      forceBlock: true,
      children: connectionNodes,
    },
  ];

  // Binary Header (27 bytes)
  const header = new Uint8Array(27);
  const magic = textEncoder.encode('Kaydara FBX Binary  ');
  header.set(magic, 0); // 20 bytes
  header[20] = 0x00;
  header[21] = 0x1a;
  header[22] = 0x00;
  new DataView(header.buffer).setUint32(23, 7400, true);

  let offset = 27;
  const serializedTopNodes: Uint8Array[] = [];
  for (const tn of topNodes) {
    const chunk = serializeFBXNode(tn, offset);
    serializedTopNodes.push(chunk);
    offset += chunk.length;
  }

  // End-of-file 13-byte NULL record + standard FBX binary footer
  const eofNull = new Uint8Array(13);
  offset += 13;

  const footerId = new Uint8Array([
    0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66,
    0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e,
  ]);
  offset += 16;

  const padLen = 16 - (offset % 16);
  const padBytes = new Uint8Array(padLen);
  const footerTail = new Uint8Array(4 + 120 + 16);
  new DataView(footerTail.buffer).setUint32(0, 7400, true);
  footerTail.set(
    [
      0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e,
      0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b,
    ],
    124
  );

  const totalSize =
    header.length +
    serializedTopNodes.reduce((s, c) => s + c.length, 0) +
    eofNull.length +
    footerId.length +
    padBytes.length +
    footerTail.length;

  const finalBuffer = new Uint8Array(totalSize);
  let pos = 0;
  finalBuffer.set(header, pos);
  pos += header.length;
  for (const chunk of serializedTopNodes) {
    finalBuffer.set(chunk, pos);
    pos += chunk.length;
  }
  finalBuffer.set(eofNull, pos);
  pos += eofNull.length;
  finalBuffer.set(footerId, pos);
  pos += footerId.length;
  finalBuffer.set(padBytes, pos);
  pos += padBytes.length;
  finalBuffer.set(footerTail, pos);

  const blob = new Blob([finalBuffer], { type: 'application/octet-stream' });
  return {
    blob,
    filename: `${safeBase}.fbx`,
    byteLength: finalBuffer.byteLength,
  };
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
