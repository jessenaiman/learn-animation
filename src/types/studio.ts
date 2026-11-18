export type WorkspaceTab = '3d-lessons' | '2d-rig-labs' | 'vector-studio' | 'pipeline-docs';

export type GeometryKind =
  | 'box'
  | 'cylinder'
  | 'sphere'
  | 'cone'
  | 'torus'
  | 'lathe'
  | 'extrude';

export type PivotAlignment = 'bottom-center' | 'center';

export interface Vec2Point {
  x: number;
  y: number;
}

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface GeometryParams {
  width: number;
  height: number;
  depth: number;
  radiusTop: number;
  radiusBottom: number;
  radialSegments: number;
  tubeRadius: number;
  lathePoints: Vec2Point[];
  extrudePoints: Vec2Point[];
  extrudeDepth: number;
  bevelEnabled: boolean;
  bevelThickness: number;
  bevelSize: number;
  bevelSegments: number;
}

export interface ScenePart3D {
  id: string;
  name: string;
  parentId: string | null;
  kind: GeometryKind;
  params: GeometryParams;
  pivot: PivotAlignment;
  position: Vec3Tuple;
  rotation: Vec3Tuple; // degrees for clean UI & inspector
  scale: Vec3Tuple;
  color: string;
  roughness: number;
  metalness: number;
  visible: boolean;
}

export interface Lesson3DStep {
  id: string;
  title: string;
  instruction: string;
  conceptNote: string;
  focusPartId?: string;
  actionLabel?: string;
  validate: (parts: ScenePart3D[], uiState: Viewport3DUIState) => boolean;
  hint: string;
}

export interface Lesson3DDefinition {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  difficulty: string;
  estimatedMinutes: number;
  summary: string;
  initialParts: ScenePart3D[];
  steps: Lesson3DStep[];
}

export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type ShadingMode = 'studio' | 'wireframe' | 'clay';
export type CameraPreset = 'perspective' | 'front' | 'side' | 'top';

export interface Viewport3DUIState {
  gizmoMode: GizmoMode;
  shadingMode: ShadingMode;
  cameraPreset: CameraPreset;
  showGrid: boolean;
  showAxes: boolean;
  turntable: boolean;
  explodedFactor: number;
}

// ─── 2D Vector Animation Studio Models ───────────────────────────────────────

export type VectorShapeKind = 'rect' | 'ellipse' | 'polygon' | 'path';
export type EasingKind = 'linear' | 'easeInOut' | 'easeOutBack';

export interface BezierVertex {
  x: number;
  y: number;
  inX: number; // relative tangent in
  inY: number;
  outX: number; // relative tangent out
  outY: number;
}

export interface ScalarKeyframe {
  frame: number;
  value: number;
  easing: EasingKind;
}

export interface Vec2Keyframe {
  frame: number;
  x: number;
  y: number;
  easing: EasingKind;
}

export interface VectorLayer2D {
  id: string;
  name: string;
  parentId: string | null;
  kind: VectorShapeKind;
  width: number;
  height: number;
  cornerRadius: number;
  sides: number;
  closed: boolean;
  vertices: BezierVertex[];
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  inpaintCap: boolean;
  anchor: Vec2Point; // local anchor offset from shape center
  positionTrack: Vec2Keyframe[];
  rotationTrack: ScalarKeyframe[];
  scaleTrack: Vec2Keyframe[];
  opacityTrack: ScalarKeyframe[];
  visible: boolean;
  locked: boolean;
}

export interface VectorProject2D {
  name: string;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  backgroundColor: string;
  layers: VectorLayer2D[];
}

// ─── 2D Rigging & Deformation Labs Models ────────────────────────────────────

export type RigDemoId = 'demo-a' | 'demo-b' | 'demo-c' | 'demo-d';
export type PuppetPinKind = 'position' | 'starch' | 'overlap' | 'bend';

export interface PuppetPin {
  id: string;
  kind: PuppetPinKind;
  label: string;
  restX: number;
  restY: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  inFront: number; // -100 to +100 depth priority
}

export interface RigReviewChecklist {
  demoAVectorSharpAndPrecomped: boolean;
  demoBInpaintedAndParented: boolean;
  demoCStarchCoreLocked: boolean;
  demoDAntennaFollowThroughAndOverlap: boolean;
}

// ─── Export Models ───────────────────────────────────────────────────────────

export type ExportFormat = 'gltf' | 'glb' | 'obj' | 'fbx' | 'lottie';

export interface ExportDiagnostics {
  assetName: string;
  sourceDomain: '3d' | '2d';
  partOrLayerCount: number;
  vertexCount: number;
  triangleCount: number;
  frameCount: number;
  fps: number;
}
