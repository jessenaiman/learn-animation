import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { sanitizeNodeName } from '../lib/geometryBuilder';
import { ScenePart3D, VectorProject2D } from '../types/studio';

interface PipelineDocsViewProps {
  active3DName: string;
  parts3D: ScenePart3D[];
  vectorProject: VectorProject2D;
  onOpenExport: () => void;
}

type DocSection = 'blender' | 'threejs' | 'lottie';
type ThreeLoaderTab = 'gltf' | 'fbx' | 'obj';
type LottieSnippetTab = 'react' | 'vanilla' | 'webcomponent';

function CodeSnippetCard({
  title,
  language,
  code,
}: {
  title: string;
  language: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback textarea copy if clipboard API restricted
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0B1120] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0F172A] border-b border-slate-800">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-200">{title}</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="font-mono text-slate-400">{language}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-sky-400" />
              <span>Copy Code</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function PipelineDocsView({
  active3DName,
  parts3D,
  vectorProject,
  onOpenExport,
}: PipelineDocsViewProps) {
  const [section, setSection] = useState<DocSection>('blender');
  const [threeTab, setThreeTab] = useState<ThreeLoaderTab>('gltf');
  const [lottieTab, setLottieTab] = useState<LottieSnippetTab>('react');

  const safe3DBase = sanitizeNodeName(active3DName || 'RigCraft_Model');
  const safe2DBase = sanitizeNodeName(vectorProject.name || 'Kinetic_Orbit_Emblem');
  const samplePartName = sanitizeNodeName(parts3D[1]?.name ?? parts3D[0]?.name ?? 'Chassis_Core');

  const blenderPythonCode = `import bpy

# Import RigCraft Studio Binary FBX 7.4 or glTF 2.0 directly in Blender 4.x
# Option A: Import .glb / .gltf (preserves PBR Roughness & Metalness natively)
bpy.ops.import_scene.gltf(filepath="/path/to/${safe3DBase}.glb")

# Option B: Import .fbx (preserves parent-child Model hierarchy & pivots)
# bpy.ops.import_scene.fbx(filepath="/path/to/${safe3DBase}.fbx", automatic_bone_orientation=True)

# Optional: Enable Auto Smooth normals on imported RigCraft meshes
for obj in bpy.context.selected_objects:
    if obj.type == 'MESH':
        bpy.ops.object.shade_smooth()
        print(f"Prepared mesh: {obj.name} ({len(obj.data.polygons)} tris)")`;

  const threeGltfCode = `import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2.8, 2.2, 3.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

// Studio PBR Reflections matching RigCraft Studio
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

let mixer: THREE.AnimationMixer | null = null;
const clock = new THREE.Clock();

const loader = new GLTFLoader();
loader.load('/models/${safe3DBase}.glb', (gltf) => {
  const model = gltf.scene;
  scene.add(model);

  // Access individual hierarchical part by name for procedural rigging
  const targetPart = model.getObjectByName('${samplePartName}');
  if (targetPart) {
    console.log('Loaded hierarchical part:', targetPart.name);
  }

  // Play exported Turntable_360 clip if included during export
  if (gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(gltf.animations[0]).play();
  }
});

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  renderer.render(scene, camera);
});`;

  const threeFbxCode = `import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const fbxLoader = new FBXLoader();
fbxLoader.load('/models/${safe3DBase}.fbx', (fbxGroup) => {
  fbxGroup.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Articulate child node directly in Three.js
  const part = fbxGroup.getObjectByName('${samplePartName}');
  if (part) {
    part.rotation.y = THREE.MathUtils.degToRad(25);
  }

  scene.add(fbxGroup);
});`;

  const threeObjCode = `import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const mtlLoader = new MTLLoader();
mtlLoader.load('/models/${safe3DBase}.mtl', (materials) => {
  materials.preload();

  const objLoader = new OBJLoader();
  objLoader.setMaterials(materials);
  objLoader.load('/models/${safe3DBase}.obj', (object) => {
    scene.add(object);
  });
});`;

  const lottieReactCode = `import { useEffect, useRef } from 'react';
import lottie, { AnimationItem } from 'lottie-web';
import animationData from './assets/${safe2DBase}.json';

export function RigCraftLottiePlayer({ loop = true }: { loop?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const anim: AnimationItem = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop,
      autoplay: true,
      animationData,
    });

    return () => anim.destroy();
  }, [loop]);

  return (
    <div
      ref={containerRef}
      style={{ width: ${vectorProject.width}, maxWidth: '100%', aspectRatio: '${vectorProject.width} / ${vectorProject.height}' }}
      aria-label="${safe2DBase} vector animation"
    />
  );
}`;

  const lottieVanillaCode = `import lottie from 'lottie-web';

// Mount exported ${safe2DBase}.json (${vectorProject.fps} FPS, ${vectorProject.totalFrames} frames)
const player = lottie.loadAnimation({
  container: document.getElementById('lottie-stage')!,
  renderer: 'svg',
  loop: true,
  autoplay: true,
  path: '/animations/${safe2DBase}.json',
});

// Interactive playback & scrubbing hooks
player.setSpeed(1.0);
document.getElementById('replay-btn')?.addEventListener('click', () => {
  player.goToAndPlay(0, true);
});`;

  const lottieWebCompCode = `<!-- Drop into any HTML page using LottieFiles Web Component -->
<script
  src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js"
  defer
></script>

<lottie-player
  src="/animations/${safe2DBase}.json"
  background="transparent"
  speed="1"
  style="width: ${vectorProject.width}px; max-width: 100%; height: auto;"
  loop
  autoplay
></lottie-player>`;

  return (
    <div className="w-full h-[calc(100vh-3.5rem)] overflow-y-auto bg-[#0B1120]">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Header & Quick Export CTA */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Production Pipeline Guides</span>
              <span aria-hidden="true">·</span>
              <span>Active 3D: {safe3DBase}</span>
              <span aria-hidden="true">·</span>
              <span>Active 2D: {safe2DBase}.json</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-50">
              Blender, Three.js & Lottie Integration Guide
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Every code snippet below dynamically updates to match your active 3D scene parts and 2D composition names so you can move directly from RigCraft Studio into local DCC tools or web codebases.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenExport}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-lg transition-colors cursor-pointer whitespace-nowrap self-start md:self-auto"
          >
            <Download className="w-4 h-4" />
            <span>Export Active Asset</span>
          </button>
        </div>

        {/* Primary Pipeline Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#111827] border border-slate-800 rounded-xl w-fit">
          {(
            [
              { id: 'blender', label: '01. Blender 3D Import (.fbx / .glb / .obj)' },
              { id: 'threejs', label: '02. Three.js Web Integration' },
              { id: 'lottie', label: '03. Lottie Web Players (.json)' },
            ] as { id: DocSection; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                section === tab.id
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* SECTION 1: BLENDER IMPORT GUIDE */}
        {section === 'blender' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-2">
                <div className="text-xs font-mono text-sky-400">Recommended PBR + Anim</div>
                <h2 className="text-base font-semibold text-slate-100">
                  glTF 2.0 (.glb / .gltf)
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  In Blender, choose <strong>File → Import → glTF 2.0</strong>. Preserves exact Metallic-Roughness Principled BSDF nodes, local pivots, parent hierarchies, and Turntable keyframes automatically.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-2">
                <div className="text-xs font-mono text-amber-400">DCC Rigging & Game Engines</div>
                <h2 className="text-base font-semibold text-slate-100">
                  Binary FBX 7.4 (.fbx)
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Choose <strong>File → Import → FBX (.fbx)</strong>. RigCraft writes native Binary FBX v7400 (`UnitScaleFactor: 100.0`) so 1m in the viewport imports at 1.000 scale in Blender without ASCII import errors.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-2">
                <div className="text-xs font-mono text-emerald-400">Universal Static Mesh</div>
                <h2 className="text-base font-semibold text-slate-100">
                  Wavefront (.obj + .mtl)
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Keep both <code>{safe3DBase}.obj</code> and <code>{safe3DBase}.mtl</code> in the same folder, then run <strong>File → Import → Wavefront (.obj)</strong> with Forward Axis <code>-Z</code> and Up Axis <code>Y</code>.
                </p>
              </div>
            </div>

            {/* Coordinate System & Scale Comparison Table */}
            <div className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-slate-100">
                  Coordinate Handedness & Scale Reference
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">Format</th>
                      <th className="px-5 py-2.5 font-medium">Source Axes</th>
                      <th className="px-5 py-2.5 font-medium">Blender Importer Setting</th>
                      <th className="px-5 py-2.5 font-medium">Hierarchy & Materials</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200 font-mono tabular-nums">
                    <tr>
                      <td className="px-5 py-2.5 text-sky-300">.glb / .gltf</td>
                      <td className="px-5 py-2.5">+Y Up · +Z Forward</td>
                      <td className="px-5 py-2.5 font-sans text-slate-300">
                        Automatic (+Y → +Z converted natively)
                      </td>
                      <td className="px-5 py-2.5 font-sans text-slate-300">
                        Full Principled BSDF + Parent Tree + Clips
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-2.5 text-amber-300">.fbx (v7400)</td>
                      <td className="px-5 py-2.5">+Y Up · Scale 100cm</td>
                      <td className="px-5 py-2.5 font-sans text-slate-300">
                        Default (-Z Forward, Y Up, Scale 1.0)
                      </td>
                      <td className="px-5 py-2.5 font-sans text-slate-300">
                        Named Mesh Nodes + Parent Links + Phong/BSDF
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-2.5 text-emerald-300">.obj + .mtl</td>
                      <td className="px-5 py-2.5">+Y Up (or Baked +Z)</td>
                      <td className="px-5 py-2.5 font-sans text-slate-300">
                        Forward: -Z, Up: Y (or Z if Baked +Z checked)
                      </td>
                      <td className="px-5 py-2.5 font-sans text-slate-300">
                        Named Object Groups (o) + MTL Diffuse/Roughness
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <CodeSnippetCard
              title="Blender Python Scripting Console (Optional Batch Import)"
              language="python (bpy)"
              code={blenderPythonCode}
            />
          </div>
        )}

        {/* SECTION 2: THREE.JS INTEGRATION GUIDE */}
        {section === 'threejs' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-slate-300">
                Install Three.js via <code className="px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800 text-sky-300">npm install three @types/three</code>, place your exported file in <code className="px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800 text-slate-200">public/models/</code>, and load with your preferred format:
              </p>

              <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg">
                {(
                  [
                    { id: 'gltf', label: 'GLTFLoader (.glb / .gltf)' },
                    { id: 'fbx', label: 'FBXLoader (.fbx)' },
                    { id: 'obj', label: 'OBJ + MTLLoader (.obj)' },
                  ] as { id: ThreeLoaderTab; label: string }[]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setThreeTab(t.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      threeTab === t.id
                        ? 'bg-slate-800 text-sky-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {threeTab === 'gltf' && (
              <CodeSnippetCard
                title={`Load ${safe3DBase}.glb with Studio PBR Reflections & AnimationMixer`}
                language="TypeScript"
                code={threeGltfCode}
              />
            )}
            {threeTab === 'fbx' && (
              <CodeSnippetCard
                title={`Load ${safe3DBase}.fbx and Articulate "${samplePartName}"`}
                language="TypeScript"
                code={threeFbxCode}
              />
            )}
            {threeTab === 'obj' && (
              <CodeSnippetCard
                title={`Load ${safe3DBase}.obj with Companion ${safe3DBase}.mtl Materials`}
                language="TypeScript"
                code={threeObjCode}
              />
            )}
          </div>
        )}

        {/* SECTION 3: LOTTIE WEB INTEGRATION GUIDE */}
        {section === 'lottie' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-slate-300">
                Animations exported from Vector Studio or 2D Rigging Labs conform to the Bodymovin <strong>v5.7.4</strong> specification ({vectorProject.width}×{vectorProject.height}px @ {vectorProject.fps} FPS) with zero external bitmap dependencies.
              </p>

              <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg">
                {(
                  [
                    { id: 'react', label: 'React + lottie-web' },
                    { id: 'vanilla', label: 'Vanilla JS / Vite' },
                    { id: 'webcomponent', label: '<lottie-player> HTML' },
                  ] as { id: LottieSnippetTab; label: string }[]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setLottieTab(t.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      lottieTab === t.id
                        ? 'bg-slate-800 text-sky-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {lottieTab === 'react' && (
              <CodeSnippetCard
                title={`React Component Rendering ${safe2DBase}.json`}
                language="TSX (lottie-web)"
                code={lottieReactCode}
              />
            )}
            {lottieTab === 'vanilla' && (
              <CodeSnippetCard
                title={`Vanilla TypeScript Playback & Scrubbing`}
                language="TypeScript"
                code={lottieVanillaCode}
              />
            )}
            {lottieTab === 'webcomponent' && (
              <CodeSnippetCard
                title={`Zero-Build HTML Web Component Embed`}
                language="HTML"
                code={lottieWebCompCode}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
