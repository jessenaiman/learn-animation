import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ChevronDown,
  ChevronUp,
  Grid3X3,
  Keyboard,
  Move,
  Rotate3D,
  RotateCw,
  Scaling,
} from 'lucide-react';
import {
  buildThreeSceneGraph,
  disposeSceneGraph,
} from '../lib/geometryBuilder';
import {
  CameraPreset,
  GizmoMode,
  ScenePart3D,
  ShadingMode,
  Vec3Tuple,
  Viewport3DUIState,
} from '../types/studio';

interface ThreeViewportProps {
  parts: ScenePart3D[];
  selectedPartId: string | null;
  onSelectPart: (id: string | null) => void;
  onTransformPart: (
    partId: string,
    patch: { position?: Vec3Tuple; rotation?: Vec3Tuple; scale?: Vec3Tuple }
  ) => void;
  uiState: Viewport3DUIState;
  onChangeUIState: (patch: Partial<Viewport3DUIState>) => void;
  stats: { vertices: number; triangles: number };
  onStatsChange: (stats: { vertices: number; triangles: number }) => void;
  onOpenShortcuts: () => void;
}

const CAMERA_PRESET_TARGETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  perspective: { pos: [2.8, 2.25, 3.3], target: [0, 0.85, 0] },
  front: { pos: [0, 1.05, 4.2], target: [0, 0.9, 0] },
  side: { pos: [4.2, 1.05, 0], target: [0, 0.9, 0] },
  top: { pos: [0.01, 4.8, 0.01], target: [0, 0.5, 0] },
};

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.65)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.25)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function ThreeViewport({
  parts,
  selectedPartId,
  onSelectPart,
  onTransformPart,
  uiState,
  onChangeUIState,
  stats,
  onStatsChange,
  onOpenShortcuts,
}: ThreeViewportProps) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [webglError, setWebglError] = useState(false);

  // Mutable refs so the WebGL lifecycle initializes once and never tears down on UI updates
  const callbacksRef = useRef({
    onSelectPart,
    onTransformPart,
    onChangeUIState,
    onStatsChange,
  });
  callbacksRef.current = {
    onSelectPart,
    onTransformPart,
    onChangeUIState,
    onStatsChange,
  };

  const uiStateRef = useRef(uiState);
  uiStateRef.current = uiState;

  const sceneBridgeRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    orbit: OrbitControls;
    transform: TransformControls;
    assetHolder: THREE.Group;
    gridHelper: THREE.GridHelper;
    axesHelper: THREE.AxesHelper;
    selectionBox: THREE.BoxHelper;
    partMap: Map<string, THREE.Mesh>;
    desiredCameraPos: THREE.Vector3 | null;
    desiredCameraTarget: THREE.Vector3 | null;
    isDraggingGizmo: boolean;
    requestRender: () => void;
  } | null>(null);

  // Initialize Three.js WebGL scene once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initWidth = Math.max(320, container.clientWidth);
    const initHeight = Math.max(280, container.clientHeight);
    renderer.setSize(initWidth, initHeight);
    renderer.domElement.className = 'block w-full h-full outline-none';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0B1120');
    scene.fog = new THREE.FogExp2('#0B1120', 0.045);

    // Mandatory Studio Environment Reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, initWidth / initHeight, 0.1, 100);
    camera.position.set(2.8, 2.25, 3.3);

    // Balanced 3-Point Warm/Cool Studio Lighting
    const hemiLight = new THREE.HemisphereLight('#BAE6FD', '#1E293B', 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#FFF7ED', 1.85);
    keyLight.position.set(4.5, 6.5, 4.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    const d = 3.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#38BDF8', 0.95);
    rimLight.position.set(-4.0, 3.2, -4.5);
    scene.add(rimLight);

    // Contact Shadow Grounding Disc
    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(3.4, 3.4);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.003;
    scene.add(contactShadow);

    // Subtle Studio Floor Grid & Axes
    const gridHelper = new THREE.GridHelper(10, 20, '#334155', '#1E293B');
    gridHelper.position.y = 0.001;
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(1.6);
    axesHelper.position.y = 0.008;
    axesHelper.visible = false;
    scene.add(axesHelper);

    const assetHolder = new THREE.Group();
    assetHolder.name = 'Viewport_Asset_Holder';
    scene.add(assetHolder);

    const selectionBox = new THREE.BoxHelper(assetHolder, '#38BDF8');
    selectionBox.visible = false;
    scene.add(selectionBox);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = !isSoftwareGl;
    orbit.dampingFactor = 0.07;
    orbit.minDistance = 1.2;
    orbit.maxDistance = 14;
    orbit.target.set(0, 0.85, 0);
    orbit.update();

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.82);
    transform.setSpace('local');
    // In Three.js r169+, TransformControls extends Controls and provides getHelper() for the Object3D gizmo;
    // in older versions TransformControls itself extends Object3D. Handle both cleanly:
    const gizmoHelper =
      typeof (transform as unknown as { getHelper?: () => THREE.Object3D }).getHelper === 'function'
        ? (transform as unknown as { getHelper: () => THREE.Object3D }).getHelper()
        : (transform as unknown as THREE.Object3D);
    scene.add(gizmoHelper);

    let frameId = 0;
    let unmounted = false;
    const clock = new THREE.Clock();

    const bridge = {
      scene,
      camera,
      orbit,
      transform,
      assetHolder,
      gridHelper,
      axesHelper,
      selectionBox,
      partMap: new Map<string, THREE.Mesh>(),
      desiredCameraPos: null as THREE.Vector3 | null,
      desiredCameraTarget: null as THREE.Vector3 | null,
      isDraggingGizmo: false,
      requestRender: () => {},
    };

    orbit.addEventListener('start', () => {
      bridge.desiredCameraPos = null;
      bridge.desiredCameraTarget = null;
      bridge.requestRender();
    });

    orbit.addEventListener('change', () => {
      bridge.requestRender();
    });

    transform.addEventListener('dragging-changed', (event) => {
      const dragging = Boolean((event as unknown as { value: boolean }).value);
      bridge.isDraggingGizmo = dragging;
      orbit.enabled = !dragging;
      if (!dragging && transform.object) {
        const obj = transform.object;
        const partId = obj.userData?.partId as string | undefined;
        if (partId) {
          callbacksRef.current.onTransformPart(partId, {
            position: {
              x: Number(obj.position.x.toFixed(3)),
              y: Number(obj.position.y.toFixed(3)),
              z: Number(obj.position.z.toFixed(3)),
            },
            rotation: {
              x: Number(THREE.MathUtils.radToDeg(obj.rotation.x).toFixed(1)),
              y: Number(THREE.MathUtils.radToDeg(obj.rotation.y).toFixed(1)),
              z: Number(THREE.MathUtils.radToDeg(obj.rotation.z).toFixed(1)),
            },
            scale: {
              x: Number(obj.scale.x.toFixed(3)),
              y: Number(obj.scale.y.toFixed(3)),
              z: Number(obj.scale.z.toFixed(3)),
            },
          });
        }
      }
      bridge.requestRender();
    });

    transform.addEventListener('change', () => {
      if (selectionBox.visible && transform.object) {
        selectionBox.setFromObject(transform.object);
      }
      bridge.requestRender();
    });

    // Raycast click selection
    const raycaster = new THREE.Raycaster();
    const pointerDownPos = new THREE.Vector2();
    const ndcPos = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos.set(e.clientX, e.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (bridge.isDraggingGizmo) return;
      const moveDist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      if (moveDist > 5) return;

      const rect = renderer.domElement.getBoundingClientRect();
      ndcPos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndcPos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(ndcPos, camera);
      const meshes = Array.from(bridge.partMap.values()).filter((m) => m.visible);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const hitPartId = hits[0].object.userData?.partId as string | undefined;
        if (hitPartId) {
          callbacksRef.current.onSelectPart(hitPartId);
        }
      } else {
        callbacksRef.current.onSelectPart(null);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Software WebGL GPU fence pacing + on-demand / continuous animation scheduler
    let renderBusy = false;
    let renderDirty = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (unmounted) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function stepAndDraw(): boolean {
      const dt = Math.min(0.1, clock.getDelta());
      let needsMoreFrames = false;

      if (bridge.desiredCameraPos && bridge.desiredCameraTarget) {
        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          bridge.desiredCameraPos.x,
          7,
          dt
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          bridge.desiredCameraPos.y,
          7,
          dt
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          bridge.desiredCameraPos.z,
          7,
          dt
        );
        orbit.target.x = THREE.MathUtils.damp(
          orbit.target.x,
          bridge.desiredCameraTarget.x,
          7,
          dt
        );
        orbit.target.y = THREE.MathUtils.damp(
          orbit.target.y,
          bridge.desiredCameraTarget.y,
          7,
          dt
        );
        orbit.target.z = THREE.MathUtils.damp(
          orbit.target.z,
          bridge.desiredCameraTarget.z,
          7,
          dt
        );

        if (
          camera.position.distanceTo(bridge.desiredCameraPos) < 0.015 &&
          orbit.target.distanceTo(bridge.desiredCameraTarget) < 0.015
        ) {
          camera.position.copy(bridge.desiredCameraPos);
          orbit.target.copy(bridge.desiredCameraTarget);
          bridge.desiredCameraPos = null;
          bridge.desiredCameraTarget = null;
        } else {
          needsMoreFrames = true;
        }
      }

      if (uiStateRef.current.turntable && !bridge.isDraggingGizmo) {
        assetHolder.rotation.y += dt * 0.75;
        if (selectionBox.visible && transform.object) {
          selectionBox.setFromObject(transform.object);
        }
        needsMoreFrames = true;
      }

      if (orbit.enableDamping) {
        const moved = orbit.update();
        if (moved) needsMoreFrames = true;
      } else {
        orbit.update();
      }

      renderer.render(scene, camera);
      return needsMoreFrames;
    }

    function requestRender() {
      if (unmounted) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (unmounted) return;
        renderDirty = false;
        const keepGoing = stepAndDraw();
        const done = () => {
          renderBusy = false;
          if (renderDirty || keepGoing || uiStateRef.current.turntable) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    bridge.requestRender = requestRender;
    sceneBridgeRef.current = bridge;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(280, Math.floor(entry.contentRect.width));
        const h = Math.max(240, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      }
    });
    resizeObserver.observe(container);

    // Keyboard shortcuts (G / R / S / W / C / T / X / H) when not typing in an input
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'g') {
        callbacksRef.current.onChangeUIState({ gizmoMode: 'translate' });
      } else if (key === 'r') {
        callbacksRef.current.onChangeUIState({ gizmoMode: 'rotate' });
      } else if (key === 's') {
        callbacksRef.current.onChangeUIState({ gizmoMode: 'scale' });
      } else if (key === 'w') {
        const nextMode =
          uiStateRef.current.shadingMode === 'wireframe' ? 'studio' : 'wireframe';
        callbacksRef.current.onChangeUIState({ shadingMode: nextMode });
      } else if (key === 't') {
        callbacksRef.current.onChangeUIState({
          turntable: !uiStateRef.current.turntable,
        });
      } else if (key === 'x') {
        const nextAxes = !uiStateRef.current.showAxes;
        callbacksRef.current.onChangeUIState({
          showAxes: nextAxes,
          showGrid: nextAxes,
        });
      } else if (key === 'c') {
        const order: CameraPreset[] = ['perspective', 'front', 'side', 'top'];
        const idx = order.indexOf(uiStateRef.current.cameraPreset);
        const nextCam = order[(idx + 1) % order.length];
        callbacksRef.current.onChangeUIState({ cameraPreset: nextCam });
        const cfg = CAMERA_PRESET_TARGETS[nextCam];
        bridge.desiredCameraPos = new THREE.Vector3(...cfg.pos);
        bridge.desiredCameraTarget = new THREE.Vector3(...cfg.target);
        bridge.requestRender();
      } else if (key === 'h') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    requestRender();

    return () => {
      unmounted = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      resizeObserver.disconnect();
      transform.detach();
      transform.dispose();
      orbit.dispose();
      disposeSceneGraph(assetHolder);
      shadowGeo.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      envTexture.dispose();
      renderer.dispose();
      sceneBridgeRef.current = null;
    };
  }, []);

  // Rebuild 3D geometry graph whenever parts, shadingMode, or explodedFactor change
  useEffect(() => {
    const bridge = sceneBridgeRef.current;
    if (!bridge) return;

    bridge.transform.detach();
    disposeSceneGraph(bridge.assetHolder);
    bridge.assetHolder.clear();

    const { rootGroup, partMap, vertexCount, triangleCount } = buildThreeSceneGraph(
      parts,
      {
        shadingMode: uiState.shadingMode,
        explodedFactor: uiState.explodedFactor,
      }
    );

    bridge.assetHolder.add(rootGroup);
    bridge.partMap = partMap;
    callbacksRef.current.onStatsChange({
      vertices: vertexCount,
      triangles: triangleCount,
    });

    if (selectedPartId && partMap.has(selectedPartId)) {
      const targetMesh = partMap.get(selectedPartId)!;
      if (targetMesh.visible) {
        bridge.transform.attach(targetMesh);
        bridge.selectionBox.setFromObject(targetMesh);
        bridge.selectionBox.visible = true;
      } else {
        bridge.selectionBox.visible = false;
      }
    } else {
      bridge.selectionBox.visible = false;
    }

    bridge.requestRender();
  }, [parts, uiState.shadingMode, uiState.explodedFactor, selectedPartId]);

  // Sync gizmo mode, helpers, and turntable
  useEffect(() => {
    const bridge = sceneBridgeRef.current;
    if (!bridge) return;
    bridge.transform.setMode(uiState.gizmoMode);
    bridge.gridHelper.visible = uiState.showGrid;
    bridge.axesHelper.visible = uiState.showAxes;
    if (!uiState.turntable) {
      bridge.assetHolder.rotation.y = 0;
      if (bridge.selectionBox.visible && bridge.transform.object) {
        bridge.selectionBox.setFromObject(bridge.transform.object);
      }
    }
    bridge.requestRender();
  }, [uiState.gizmoMode, uiState.showGrid, uiState.showAxes, uiState.turntable]);

  // Smooth camera preset transitions
  const triggerCameraPreset = (preset: CameraPreset) => {
    onChangeUIState({ cameraPreset: preset });
    const bridge = sceneBridgeRef.current;
    if (!bridge) return;
    const cfg = CAMERA_PRESET_TARGETS[preset];
    bridge.desiredCameraPos = new THREE.Vector3(...cfg.pos);
    bridge.desiredCameraTarget = new THREE.Vector3(...cfg.target);
    bridge.requestRender();
  };

  return (
    <div className="relative w-full h-full min-h-[460px] bg-[#0B1120] overflow-hidden select-none">
      {/* Dedicated WebGL Mount Container */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {webglError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950">
          <p className="text-base font-semibold text-slate-100">
            3D Viewport Preview Unavailable
          </p>
          <p className="mt-1 text-sm text-slate-400 max-w-md">
            WebGL hardware or software context could not be initialized in this browser, but all parametric scene controls and .gltf / .fbx / .obj exports remain active.
          </p>
        </div>
      )}

      {/* Minimal Top-Left Topology Readout (Unboxed clean telemetry text) */}
      <div className="absolute top-3 left-4 z-10 pointer-events-none flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400 bg-[#0F172A]/90 px-3 py-1.5 rounded-md border border-slate-800">
        <span className="text-slate-200 font-medium">{parts.length} Parts</span>
        <span aria-hidden="true">·</span>
        <span>{stats.vertices.toLocaleString()} Verts</span>
        <span aria-hidden="true">·</span>
        <span>{stats.triangles.toLocaleString()} Tris</span>
        <span aria-hidden="true">·</span>
        <span>+Y Up (Meters)</span>
      </div>

      {/* Collapsible Unified Bottom Control Dock (Zero Side-Panel Occlusion, No backdrop-blur over WebGL) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center max-w-[95vw]">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-300 hover:text-white bg-[#111827] border border-slate-800 border-b-0 rounded-t-lg cursor-pointer transition-colors whitespace-nowrap"
          title="Toggle Viewport Controls (Shortcut: H)"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
              <span>Show Controls (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              <span>Hide Controls (H)</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="flex flex-wrap items-center justify-center gap-3 px-3.5 py-2.5 bg-[#111827] border border-slate-800 rounded-xl shadow-xl">
            {/* Gizmo Modes */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800/80">
              {(
                [
                  { id: 'translate', label: 'Move (G)', Icon: Move },
                  { id: 'rotate', label: 'Rotate (R)', Icon: RotateCw },
                  { id: 'scale', label: 'Scale (S)', Icon: Scaling },
                ] as { id: GizmoMode; label: string; Icon: typeof Move }[]
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChangeUIState({ gizmoMode: id })}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    uiState.gizmoMode === id
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Shading Switcher */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800/80">
              {(['studio', 'wireframe', 'clay'] as ShadingMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChangeUIState({ shadingMode: mode })}
                  className={`px-2.5 py-1.5 text-xs font-medium capitalize rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    uiState.shadingMode === mode
                      ? 'bg-slate-800 text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Camera Angle Presets */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800/80">
              {(
                [
                  { id: 'perspective', label: 'Persp' },
                  { id: 'front', label: 'Front' },
                  { id: 'side', label: 'Side' },
                  { id: 'top', label: 'Top' },
                ] as { id: CameraPreset; label: string }[]
              ).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => triggerCameraPreset(cam.id)}
                  className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    uiState.cameraPreset === cam.id
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cam.label}
                </button>
              ))}
            </div>

            {/* Exploded View Slider */}
            <label className="flex items-center gap-2 px-2 py-1 text-xs text-slate-300 whitespace-nowrap">
              <span>Explode:</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={uiState.explodedFactor}
                onChange={(e) =>
                  onChangeUIState({ explodedFactor: parseFloat(e.target.value) })
                }
                className="w-20 accent-sky-400 cursor-pointer"
              />
              <span className="font-mono tabular-nums text-slate-200 w-9 text-right">
                {Math.round(uiState.explodedFactor * 100)}%
              </span>
            </label>

            {/* Grid, Axes & Turntable Toggles */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChangeUIState({ showGrid: !uiState.showGrid })}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  uiState.showGrid
                    ? 'bg-slate-800 border-slate-700 text-slate-100'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeUIState({ showAxes: !uiState.showAxes })}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  uiState.showAxes
                    ? 'bg-slate-800 border-slate-700 text-slate-100'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Axes
              </button>

              <button
                type="button"
                onClick={() => onChangeUIState({ turntable: !uiState.turntable })}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  uiState.turntable
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle 360° Turntable (Shortcut: T)"
              >
                <Rotate3D className="w-3.5 h-3.5" />
                <span>Turntable</span>
              </button>

              <button
                type="button"
                onClick={onOpenShortcuts}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Open Keyboard Shortcut Cheat-Sheet (?)"
              >
                <Keyboard className="w-3.5 h-3.5 text-sky-400" />
                <span>Keys (?)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
