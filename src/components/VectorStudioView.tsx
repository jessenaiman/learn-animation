import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Circle as CircleIcon,
  Crosshair,
  Diamond,
  Download,
  Eye,
  EyeOff,
  Hexagon,
  Keyboard,
  MousePointer,
  Pause,
  PenTool,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import {
  createNewVectorLayer,
  VECTOR_TEMPLATES_2D,
} from '../data/vectorTemplates2d';
import { triggerBrowserDownload } from '../lib/exporters3d';
import {
  compileProjectToLottieJSON,
  evaluateScalarTrack,
  evaluateVec2Track,
  getLayerWorldMatrix,
  invertMat2D,
  transformPoint2D,
} from '../lib/lottieCompiler';
import {
  BezierVertex,
  EasingKind,
  VectorLayer2D,
  VectorProject2D,
  VectorShapeKind,
} from '../types/studio';

interface VectorStudioViewProps {
  project: VectorProject2D;
  onChangeProject: (project: VectorProject2D) => void;
  onOpenExportModal: () => void;
  onNotify: (msg: string) => void;
  onOpenShortcuts: () => void;
}

type StudioTool = 'select' | 'anchor' | 'pen';

function buildPolygonPoints(sides: number, rx: number, ry: number): string {
  const count = Math.max(3, Math.round(sides));
  const pts: string[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(Math.cos(angle) * rx).toFixed(2)},${(Math.sin(angle) * ry).toFixed(2)}`);
  }
  return pts.join(' ');
}

function buildBezierSvgPath(vertices: BezierVertex[], closed: boolean): string {
  if (vertices.length === 0) return '';
  if (vertices.length === 1) {
    return `M ${vertices[0].x} ${vertices[0].y}`;
  }
  const cmds: string[] = [`M ${vertices[0].x.toFixed(1)} ${vertices[0].y.toFixed(1)}`];
  for (let i = 0; i < vertices.length - 1; i++) {
    const cur = vertices[i];
    const next = vertices[i + 1];
    const c1x = cur.x + cur.outX;
    const c1y = cur.y + cur.outY;
    const c2x = next.x + next.inX;
    const c2y = next.y + next.inY;
    cmds.push(
      `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`
    );
  }
  if (closed && vertices.length >= 3) {
    const last = vertices[vertices.length - 1];
    const first = vertices[0];
    cmds.push(
      `C ${(last.x + last.outX).toFixed(1)} ${(last.y + last.outY).toFixed(1)}, ${(first.x + first.inX).toFixed(1)} ${(first.y + first.inY).toFixed(1)}, ${first.x.toFixed(1)} ${first.y.toFixed(1)} Z`
    );
  }
  return cmds.join(' ');
}

export function VectorStudioView({
  project,
  onChangeProject,
  onOpenExportModal,
  onNotify,
  onOpenShortcuts,
}: VectorStudioViewProps) {
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    project.layers[project.layers.length - 1]?.id ?? null
  );
  const [tool, setTool] = useState<StudioTool>('select');
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [onionSkin, setOnionSkin] = useState<boolean>(false);
  const [defaultEasing, setDefaultEasing] = useState<EasingKind>('easeInOut');

  const [dragState, setDragState] = useState<{
    mode: 'move-layer' | 'move-anchor';
    layerId: string;
    startSvgX: number;
    startSvgY: number;
    origPosX: number;
    origPosY: number;
    origAnchorX: number;
    origAnchorY: number;
  } | null>(null);

  const compCenter = useMemo(
    () => ({ x: project.width * 0.5, y: project.height * 0.5 }),
    [project.width, project.height]
  );

  const selectedLayer = useMemo(
    () =>
      project.layers.find((l) => l.id === selectedLayerId) ??
      project.layers[project.layers.length - 1] ??
      null,
    [project.layers, selectedLayerId]
  );

  // Playback loop
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastTime = performance.now();
    const frameDurationMs = 1000 / Math.max(1, project.fps);

    const tick = (now: number) => {
      const elapsed = now - lastTime;
      if (elapsed >= frameDurationMs) {
        const steps = Math.max(1, Math.floor(elapsed / frameDurationMs));
        lastTime = now - (elapsed % frameDurationMs);
        setCurrentFrame((f) => (f + steps) % (project.totalFrames + 1));
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, project.fps, project.totalFrames]);

  const updateLayer = (
    layerId: string,
    updater: (prev: VectorLayer2D) => VectorLayer2D
  ) => {
    onChangeProject({
      ...project,
      layers: project.layers.map((l) => (l.id === layerId ? updater(l) : l)),
    });
  };

  const upsertVec2Keyframe = (
    track: VectorLayer2D['positionTrack'],
    frame: number,
    x: number,
    y: number
  ) => {
    const roundedFrame = Math.round(frame);
    const existingIdx = track.findIndex((k) => k.frame === roundedFrame);
    if (existingIdx >= 0) {
      return track.map((k, i) =>
        i === existingIdx ? { ...k, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) } : k
      );
    }
    return [
      ...track,
      {
        frame: roundedFrame,
        x: Number(x.toFixed(1)),
        y: Number(y.toFixed(1)),
        easing: defaultEasing,
      },
    ].sort((a, b) => a.frame - b.frame);
  };

  const upsertScalarKeyframe = (
    track: VectorLayer2D['rotationTrack'],
    frame: number,
    value: number
  ) => {
    const roundedFrame = Math.round(frame);
    const existingIdx = track.findIndex((k) => k.frame === roundedFrame);
    if (existingIdx >= 0) {
      return track.map((k, i) =>
        i === existingIdx ? { ...k, value: Number(value.toFixed(1)) } : k
      );
    }
    return [
      ...track,
      {
        frame: roundedFrame,
        value: Number(value.toFixed(1)),
        easing: defaultEasing,
      },
    ].sort((a, b) => a.frame - b.frame);
  };

  const handleAddShape = (kind: VectorShapeKind) => {
    const newLayer = createNewVectorLayer(
      kind,
      project.layers.length,
      compCenter
    );
    onChangeProject({
      ...project,
      layers: [...project.layers, newLayer],
    });
    setSelectedLayerId(newLayer.id);
    if (kind === 'path') {
      setTool('pen');
    } else {
      setTool('select');
    }
  };

  const handleQuickLottieDownload = () => {
    const jsonObj = compileProjectToLottieJSON(project);
    const blob = new Blob([JSON.stringify(jsonObj, null, 2)], {
      type: 'application/json',
    });
    const safeName =
      project.name.trim().replace(/[^a-zA-Z0-9_.-]+/g, '_') || 'Vector_Animation';
    triggerBrowserDownload(blob, `${safeName}.json`);
    onNotify(`Downloaded ${safeName}.json (Lottie v5.7.4)`);
  };

  const moveLayerOrder = (layerId: string, dir: -1 | 1) => {
    const idx = project.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= project.layers.length) return;
    const copy = [...project.layers];
    const [item] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, item);
    onChangeProject({ ...project, layers: copy });
  };

  const renderShapeGeometry = (layer: VectorLayer2D, opacityMult = 1) => {
    const op =
      (evaluateScalarTrack(layer.opacityTrack, currentFrame, 100) / 100) *
      opacityMult;
    const fill =
      layer.fillOpacity > 0 && (layer.kind !== 'path' || layer.closed)
        ? layer.fillColor
        : 'none';

    return (
      <g opacity={op}>
        {layer.kind === 'rect' && (
          <>
            <rect
              x={-layer.width / 2}
              y={-layer.height / 2}
              width={layer.width}
              height={layer.height}
              rx={layer.cornerRadius}
              fill={fill}
              fillOpacity={layer.fillOpacity}
              stroke={layer.strokeWidth > 0 ? layer.strokeColor : 'none'}
              strokeWidth={layer.strokeWidth}
            />
            {layer.inpaintCap && (
              <circle
                cx={layer.height >= layer.width ? 0 : -layer.width / 2}
                cy={layer.height >= layer.width ? -layer.height / 2 : 0}
                r={Math.min(layer.width, layer.height) * 0.48}
                fill={fill}
                fillOpacity={layer.fillOpacity}
              />
            )}
          </>
        )}

        {layer.kind === 'ellipse' && (
          <ellipse
            cx={0}
            cy={0}
            rx={layer.width / 2}
            ry={layer.height / 2}
            fill={fill}
            fillOpacity={layer.fillOpacity}
            stroke={layer.strokeWidth > 0 ? layer.strokeColor : 'none'}
            strokeWidth={layer.strokeWidth}
          />
        )}

        {layer.kind === 'polygon' && (
          <polygon
            points={buildPolygonPoints(
              layer.sides,
              layer.width / 2,
              layer.height / 2
            )}
            fill={fill}
            fillOpacity={layer.fillOpacity}
            stroke={layer.strokeWidth > 0 ? layer.strokeColor : 'none'}
            strokeWidth={layer.strokeWidth}
            strokeLinejoin="round"
          />
        )}

        {layer.kind === 'path' && (
          <path
            d={buildBezierSvgPath(layer.vertices, layer.closed)}
            fill={fill}
            fillOpacity={layer.fillOpacity}
            stroke={layer.strokeWidth > 0 ? layer.strokeColor : 'none'}
            strokeWidth={layer.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </g>
    );
  };

  // Evaluated values of selected layer at currentFrame
  const selEval = useMemo(() => {
    if (!selectedLayer) return null;
    return {
      pos: evaluateVec2Track(selectedLayer.positionTrack, currentFrame, compCenter),
      rot: evaluateScalarTrack(selectedLayer.rotationTrack, currentFrame, 0),
      scale: evaluateVec2Track(selectedLayer.scaleTrack, currentFrame, {
        x: 100,
        y: 100,
      }),
      opacity: evaluateScalarTrack(selectedLayer.opacityTrack, currentFrame, 100),
    };
  }, [selectedLayer, currentFrame, compCenter]);

  // 2D Timeline & Vector Tool Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === ',') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentFrame(
          (f) => (f - 1 + project.totalFrames + 1) % (project.totalFrames + 1)
        );
        return;
      }
      if (e.key === 'ArrowRight' || e.key === '.') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentFrame((f) => (f + 1) % (project.totalFrames + 1));
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentFrame(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentFrame(project.totalFrames);
        return;
      }

      if (e.shiftKey) return;
      const key = e.key.toLowerCase();

      if (key === 'v') {
        setTool('select');
      } else if (key === 'y') {
        setTool('anchor');
      } else if (key === 'p') {
        setTool('pen');
      } else if (key === 'o') {
        setOnionSkin((prev) => !prev);
      } else if (key === 'k' && selectedLayer && selEval) {
        e.preventDefault();
        updateLayer(selectedLayer.id, (l) => ({
          ...l,
          positionTrack: upsertVec2Keyframe(
            l.positionTrack,
            currentFrame,
            selEval.pos.x,
            selEval.pos.y
          ),
          rotationTrack: upsertScalarKeyframe(
            l.rotationTrack,
            currentFrame,
            selEval.rot
          ),
          scaleTrack: upsertVec2Keyframe(
            l.scaleTrack,
            currentFrame,
            selEval.scale.x,
            selEval.scale.y
          ),
          opacityTrack: upsertScalarKeyframe(
            l.opacityTrack,
            currentFrame,
            selEval.opacity
          ),
        }));
        onNotify(`Stamped keyframes on "${selectedLayer.name}" at Frame ${currentFrame}`);
      } else if (e.key === '[' && selectedLayer) {
        e.preventDefault();
        moveLayerOrder(selectedLayer.id, -1);
      } else if (e.key === ']' && selectedLayer) {
        e.preventDefault();
        moveLayerOrder(selectedLayer.id, 1);
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedLayer &&
        project.layers.length > 1
      ) {
        e.preventDefault();
        const nextLayers = project.layers
          .filter((l) => l.id !== selectedLayer.id)
          .map((l) =>
            l.parentId === selectedLayer.id ? { ...l, parentId: null } : l
          );
        onChangeProject({ ...project, layers: nextLayers });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="flex flex-col lg:flex-row w-full h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left 65% Interactive Vector Stage + Bottom Timeline */}
      <div className="w-full lg:w-[64%] xl:w-[66%] h-full flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 bg-[#0B1120] overflow-hidden">
        {/* Vector Creation & Manipulation Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#0F172A] border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-1.5">
            {/* Pointer / Anchor / Pen Tools */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800">
              {(
                [
                  { id: 'select', label: 'Select (V)', Icon: MousePointer },
                  { id: 'anchor', label: 'Anchor (Y)', Icon: Crosshair },
                  { id: 'pen', label: 'Pen (P)', Icon: PenTool },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTool(id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    tool === id
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Add Vector Shape Buttons */}
            <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
              <button
                type="button"
                onClick={() => handleAddShape('rect')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5 text-sky-400" />
                <span>+ Rect</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddShape('ellipse')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <CircleIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>+ Ellipse</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddShape('polygon')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Hexagon className="w-3.5 h-3.5 text-emerald-400" />
                <span>+ Polygon</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddShape('path')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <PenTool className="w-3.5 h-3.5 text-pink-400" />
                <span>+ Bezier Path</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOnionSkin((v) => !v)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                onionSkin
                  ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle Onion Skin Ghosting (Shortcut: O)"
            >
              Onion Skin (O)
            </button>
            <button
              type="button"
              onClick={onOpenShortcuts}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              title="Open Keyboard Shortcut Cheat-Sheet (?)"
            >
              <Keyboard className="w-3.5 h-3.5 text-sky-400" />
              <span>Keys (?)</span>
            </button>
            <button
              type="button"
              onClick={handleQuickLottieDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Lottie .json</span>
            </button>
          </div>
        </div>

        {/* Interactive SVG Composition Canvas */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden bg-[#080D1A]">
          <svg
            viewBox={`0 0 ${project.width} ${project.height}`}
            className="w-full max-w-[700px] max-h-full rounded-xl border border-slate-800 shadow-2xl select-none touch-none"
            onPointerMove={(e) => {
              if (!dragState) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const sx = ((e.clientX - rect.left) / rect.width) * project.width;
              const sy = ((e.clientY - rect.top) / rect.height) * project.height;
              const dx = sx - dragState.startSvgX;
              const dy = sy - dragState.startSvgY;

              if (dragState.mode === 'move-layer') {
                updateLayer(dragState.layerId, (l) => ({
                  ...l,
                  positionTrack: upsertVec2Keyframe(
                    l.positionTrack,
                    currentFrame,
                    dragState.origPosX + dx,
                    dragState.origPosY + dy
                  ),
                }));
              } else if (dragState.mode === 'move-anchor') {
                updateLayer(dragState.layerId, (l) => ({
                  ...l,
                  anchor: {
                    x: Number((dragState.origAnchorX + dx).toFixed(1)),
                    y: Number((dragState.origAnchorY + dy).toFixed(1)),
                  },
                  positionTrack: upsertVec2Keyframe(
                    l.positionTrack,
                    currentFrame,
                    dragState.origPosX + dx,
                    dragState.origPosY + dy
                  ),
                }));
              }
            }}
            onPointerUp={() => setDragState(null)}
            onPointerLeave={() => setDragState(null)}
            onClick={(e) => {
              if (tool !== 'pen' || !selectedLayer) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const sx = ((e.clientX - rect.left) / rect.width) * project.width;
              const sy = ((e.clientY - rect.top) / rect.height) * project.height;

              // Convert SVG world point into selected layer's local coordinate space
              const worldMat = getLayerWorldMatrix(
                selectedLayer,
                project.layers,
                currentFrame,
                compCenter
              );
              const inv = invertMat2D(worldMat);
              const localPt = transformPoint2D(inv, sx, sy);

              updateLayer(selectedLayer.id, (prev) => ({
                ...prev,
                kind: 'path',
                vertices: [
                  ...prev.vertices,
                  {
                    x: Number(localPt.x.toFixed(1)),
                    y: Number(localPt.y.toFixed(1)),
                    inX: -16,
                    inY: 0,
                    outX: 16,
                    outY: 0,
                  },
                ],
              }));
            }}
          >
            {/* Subtle Composition Safe Grid */}
            <defs>
              <pattern
                id="vectorCompGrid"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.08)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect
              width={project.width}
              height={project.height}
              fill={project.backgroundColor}
            />
            <rect
              width={project.width}
              height={project.height}
              fill="url(#vectorCompGrid)"
            />

            {/* Optional Onion Skin Ghost (4 frames earlier) */}
            {onionSkin &&
              currentFrame >= 4 &&
              project.layers
                .filter((l) => l.visible)
                .map((layer) => {
                  const ghostMat = getLayerWorldMatrix(
                    layer,
                    project.layers,
                    currentFrame - 4,
                    compCenter
                  );
                  return (
                    <g
                      key={`ghost-${layer.id}`}
                      transform={`matrix(${ghostMat.map((n) => n.toFixed(4)).join(',')})`}
                      pointerEvents="none"
                    >
                      {renderShapeGeometry(layer, 0.22)}
                    </g>
                  );
                })}

            {/* Active Frame Vector Layers */}
            {project.layers
              .filter((l) => l.visible)
              .map((layer) => {
                const mat = getLayerWorldMatrix(
                  layer,
                  project.layers,
                  currentFrame,
                  compCenter
                );
                const isSelected = selectedLayer?.id === layer.id;
                const evalPos = evaluateVec2Track(
                  layer.positionTrack,
                  currentFrame,
                  compCenter
                );
                const anchorWorld = transformPoint2D(
                  mat,
                  layer.anchor.x,
                  layer.anchor.y
                );

                return (
                  <g key={layer.id}>
                    <g
                      transform={`matrix(${mat.map((n) => n.toFixed(4)).join(',')})`}
                      className={
                        tool === 'select'
                          ? 'cursor-move'
                          : tool === 'pen'
                          ? 'cursor-crosshair'
                          : 'cursor-pointer'
                      }
                      onPointerDown={(e) => {
                        if (tool === 'pen') return;
                        e.stopPropagation();
                        setSelectedLayerId(layer.id);
                        const svg = e.currentTarget.ownerSVGElement!;
                        const rect = svg.getBoundingClientRect();
                        const sx =
                          ((e.clientX - rect.left) / rect.width) * project.width;
                        const sy =
                          ((e.clientY - rect.top) / rect.height) * project.height;

                        setDragState({
                          mode: tool === 'anchor' ? 'move-anchor' : 'move-layer',
                          layerId: layer.id,
                          startSvgX: sx,
                          startSvgY: sy,
                          origPosX: evalPos.x,
                          origPosY: evalPos.y,
                          origAnchorX: layer.anchor.x,
                          origAnchorY: layer.anchor.y,
                        });
                      }}
                    >
                      {renderShapeGeometry(layer)}

                      {/* Selection Outline & Bezier Control Vertices */}
                      {isSelected && (
                        <>
                          <rect
                            x={-layer.width / 2 - 6}
                            y={-layer.height / 2 - 6}
                            width={layer.width + 12}
                            height={layer.height + 12}
                            fill="none"
                            stroke="#38BDF8"
                            strokeDasharray="4 3"
                            strokeWidth="1.25"
                            pointerEvents="none"
                          />
                          {layer.kind === 'path' &&
                            layer.vertices.map((v, vi) => (
                              <circle
                                key={vi}
                                cx={v.x}
                                cy={v.y}
                                r="4.5"
                                fill="#F8FAFC"
                                stroke="#0EA5E9"
                                strokeWidth="2"
                                pointerEvents="none"
                              />
                            ))}
                        </>
                      )}
                    </g>

                    {/* Anatomical Anchor Point Crosshair Handle */}
                    {isSelected && (
                      <g
                        transform={`translate(${anchorWorld.x}, ${anchorWorld.y})`}
                        className="cursor-crosshair"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const svg = e.currentTarget.ownerSVGElement!;
                          const rect = svg.getBoundingClientRect();
                          const sx =
                            ((e.clientX - rect.left) / rect.width) * project.width;
                          const sy =
                            ((e.clientY - rect.top) / rect.height) * project.height;
                          setDragState({
                            mode: 'move-anchor',
                            layerId: layer.id,
                            startSvgX: sx,
                            startSvgY: sy,
                            origPosX: evalPos.x,
                            origPosY: evalPos.y,
                            origAnchorX: layer.anchor.x,
                            origAnchorY: layer.anchor.y,
                          });
                        }}
                      >
                        <circle
                          r="7"
                          fill="#0B1120"
                          stroke="#FBBF24"
                          strokeWidth="2"
                        />
                        <line
                          x1="-11"
                          y1="0"
                          x2="11"
                          y2="0"
                          stroke="#FBBF24"
                          strokeWidth="1.5"
                        />
                        <line
                          x1="0"
                          y1="-11"
                          x2="0"
                          y2="11"
                          stroke="#FBBF24"
                          strokeWidth="1.5"
                        />
                      </g>
                    )}
                  </g>
                );
              })}
          </svg>
        </div>

        {/* Multi-Track Keyframe Timeline Panel */}
        <div className="h-60 bg-[#111827] border-t border-slate-800 flex flex-col shrink-0">
          {/* Timeline Transport Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[#0F172A] border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Play</span>
                  </>
                )}
              </button>

              <span className="font-mono tabular-nums text-slate-200 px-2 py-1 bg-slate-950 rounded border border-slate-800">
                Frame {String(currentFrame).padStart(3, '0')} / {project.totalFrames}
              </span>

              <select
                aria-label="Composition Frame Rate"
                value={project.fps}
                onChange={(e) =>
                  onChangeProject({
                    ...project,
                    fps: parseInt(e.target.value, 10),
                  })
                }
                className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono"
              >
                <option value={24}>24 FPS</option>
                <option value={30}>30 FPS</option>
                <option value={60}>60 FPS</option>
              </select>

              <select
                aria-label="New keyframe easing"
                value={defaultEasing}
                onChange={(e) => setDefaultEasing(e.target.value as EasingKind)}
                className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200"
              >
                <option value="easeInOut">Ease In-Out</option>
                <option value="linear">Linear</option>
                <option value="easeOutBack">Overshoot Bounce</option>
              </select>
            </div>

            {/* Frame Scrubber Slider */}
            <div className="flex items-center gap-2 flex-1 min-w-[180px] max-w-md">
              <span className="text-slate-400 whitespace-nowrap">Scrub:</span>
              <input
                type="range"
                min={0}
                max={project.totalFrames}
                step={1}
                value={currentFrame}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentFrame(parseInt(e.target.value, 10));
                }}
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Selected Layer Keyframe Tracks */}
          {selectedLayer && selEval ? (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70 px-4 py-1 text-xs">
              {(
                [
                  {
                    id: 'pos',
                    label: 'Position (X, Y)',
                    frames: selectedLayer.positionTrack.map((k) => k.frame),
                    onAddKey: () =>
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        positionTrack: upsertVec2Keyframe(
                          l.positionTrack,
                          currentFrame,
                          selEval.pos.x,
                          selEval.pos.y
                        ),
                      })),
                    onRemoveKey: (f: number) =>
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        positionTrack:
                          l.positionTrack.length > 1
                            ? l.positionTrack.filter((k) => k.frame !== f)
                            : l.positionTrack,
                      })),
                  },
                  {
                    id: 'rot',
                    label: 'Rotation (°)',
                    frames: selectedLayer.rotationTrack.map((k) => k.frame),
                    onAddKey: () =>
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        rotationTrack: upsertScalarKeyframe(
                          l.rotationTrack,
                          currentFrame,
                          selEval.rot
                        ),
                      })),
                    onRemoveKey: (f: number) =>
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        rotationTrack:
                          l.rotationTrack.length > 1
                            ? l.rotationTrack.filter((k) => k.frame !== f)
                            : l.rotationTrack,
                      })),
                  },
                  {
                    id: 'scale',
                    label: 'Scale (%)',
                    frames: selectedLayer.scaleTrack.map((k) => k.frame),
                    onAddKey: () =>
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        scaleTrack: upsertVec2Keyframe(
                          l.scaleTrack,
                          currentFrame,
                          selEval.scale.x,
                          selEval.scale.y
                        ),
                      })),
                    onRemoveKey: (f: number) =>
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        scaleTrack:
                          l.scaleTrack.length > 1
                            ? l.scaleTrack.filter((k) => k.frame !== f)
                            : l.scaleTrack,
                      })),
                  },
                  {
                    id: 'opacity',
                    label: 'Opacity (%)',
                    frames: selectedLayer.opacityTrack.map((k) => k.frame),
                    onAddKey: () =>
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        opacityTrack: upsertScalarKeyframe(
                          l.opacityTrack,
                          currentFrame,
                          selEval.opacity
                        ),
                      })),
                    onRemoveKey: (f: number) =>
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        opacityTrack:
                          l.opacityTrack.length > 1
                            ? l.opacityTrack.filter((k) => k.frame !== f)
                            : l.opacityTrack,
                      })),
                  },
                ] as const
              ).map((row) => {
                const hasKeyAtCurrent = row.frames.includes(currentFrame);
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 py-2"
                  >
                    <div className="w-44 flex items-center justify-between shrink-0">
                      <span className="text-slate-300 font-medium">{row.label}</span>
                      <button
                        type="button"
                        onClick={() =>
                          hasKeyAtCurrent
                            ? row.onRemoveKey(currentFrame)
                            : row.onAddKey()
                        }
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                          hasKeyAtCurrent
                            ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                        title={
                          hasKeyAtCurrent
                            ? 'Remove keyframe at playhead (min 1 kept)'
                            : 'Insert keyframe at playhead'
                        }
                      >
                        <Diamond className="w-3 h-3" />
                        <span>{hasKeyAtCurrent ? 'Keyed' : '+ Key'}</span>
                      </button>
                    </div>

                    {/* Visual Track Bar with Clickable Keyframe Diamonds */}
                    <svg
                      viewBox="0 0 1000 24"
                      preserveAspectRatio="none"
                      className="flex-1 h-6 bg-slate-950 rounded border border-slate-800/90 cursor-pointer overflow-visible"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(
                          0,
                          Math.min(1, (e.clientX - rect.left) / rect.width)
                        );
                        setIsPlaying(false);
                        setCurrentFrame(Math.round(ratio * project.totalFrames));
                      }}
                    >
                      <line
                        x1={(currentFrame / Math.max(1, project.totalFrames)) * 1000}
                        y1={0}
                        x2={(currentFrame / Math.max(1, project.totalFrames)) * 1000}
                        y2={24}
                        stroke="#38BDF8"
                        strokeWidth={3}
                        vectorEffect="non-scaling-stroke"
                      />

                      {row.frames.map((kfFrame) => {
                        const cx =
                          (kfFrame / Math.max(1, project.totalFrames)) * 1000;
                        const isAtHead = kfFrame === currentFrame;
                        return (
                          <g
                            key={kfFrame}
                            transform={`translate(${cx}, 12)`}
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsPlaying(false);
                              setCurrentFrame(kfFrame);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              row.onRemoveKey(kfFrame);
                            }}
                          >
                            <title>{`Frame ${kfFrame} (Double-click to remove)`}</title>
                            <polygon
                              points="0,-6 12,0 0,6 -12,0"
                              fill={isAtHead ? '#FBBF24' : '#38BDF8'}
                              stroke="#020617"
                              strokeWidth={1.5}
                              vectorEffect="non-scaling-stroke"
                            />
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
              Select or add a vector layer to edit timeline keyframes.
            </div>
          )}
        </div>
      </div>

      {/* Right 35% Vector Project, Layer Stack & Property Deck */}
      <aside className="w-full lg:w-[36%] xl:w-[34%] h-full bg-[#111827] overflow-y-auto p-5 space-y-5">
        {/* Composition Presets & Settings */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold text-slate-100">
              2D Vector & Lottie Studio
            </h1>
            <button
              type="button"
              onClick={onOpenExportModal}
              className="text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
            >
              Verify & Export →
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'kineticBadge', label: 'Orbit Badge' },
                { id: 'articulatedWaveArm', label: 'Wave Arm Rig' },
                { id: 'blankCanvas', label: 'Blank Scene' },
              ] as const
            ).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  const chosen = JSON.parse(
                    JSON.stringify(VECTOR_TEMPLATES_2D[tpl.id])
                  ) as VectorProject2D;
                  onChangeProject(chosen);
                  setCurrentFrame(0);
                  setSelectedLayerId(
                    chosen.layers[chosen.layers.length - 1]?.id ?? null
                  );
                }}
                className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md text-slate-200 font-medium transition-colors cursor-pointer truncate"
              >
                {tpl.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="space-y-1">
              <span className="text-slate-400">Composition Name</span>
              <input
                type="text"
                value={project.name}
                onChange={(e) =>
                  onChangeProject({ ...project, name: e.target.value })
                }
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </label>

            <label className="space-y-1">
              <span className="text-slate-400">Duration (Frames)</span>
              <input
                type="number"
                min={15}
                max={240}
                value={project.totalFrames}
                onChange={(e) => {
                  const val = Math.max(
                    15,
                    Math.min(240, parseInt(e.target.value, 10) || 60)
                  );
                  onChangeProject({ ...project, totalFrames: val });
                }}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md font-mono tabular-nums text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </label>
          </div>
        </div>

        {/* Layer Stack (Top of UI = Top of Render Stack) */}
        <div className="space-y-2 text-xs">
          <h2 className="text-sm font-semibold text-slate-100">
            Vector Layers ({project.layers.length})
          </h2>

          <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
            {[...project.layers].reverse().map((layer) => {
              const isSelected = selectedLayer?.id === layer.id;
              const parentName = project.layers.find(
                (p) => p.id === layer.parentId
              )?.name;
              return (
                <div
                  key={layer.id}
                  onClick={() => setSelectedLayerId(layer.id)}
                  className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-sky-500/15 text-slate-50'
                      : 'text-slate-300 hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <svg
                      viewBox="0 0 10 10"
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/25"
                      aria-hidden="true"
                    >
                      <circle
                        cx="5"
                        cy="5"
                        r="5"
                        fill={
                          layer.fillOpacity > 0 ? layer.fillColor : layer.strokeColor
                        }
                      />
                    </svg>
                    <span className="font-medium truncate">{layer.name}</span>
                    <span className="text-slate-500 truncate">
                      · {layer.kind}
                      {parentName ? ` → ${parentName}` : ''}
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => moveLayerOrder(layer.id, 1)}
                      className="p-1 text-slate-400 hover:text-slate-100 cursor-pointer"
                      title="Bring forward"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLayerOrder(layer.id, -1)}
                      className="p-1 text-slate-400 hover:text-slate-100 cursor-pointer"
                      title="Send backward"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateLayer(layer.id, (l) => ({ ...l, visible: !l.visible }))
                      }
                      className="p-1 text-slate-400 hover:text-slate-100 cursor-pointer"
                    >
                      {layer.visible ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={project.layers.length <= 1}
                      onClick={() => {
                        if (project.layers.length <= 1) return;
                        const nextLayers = project.layers
                          .filter((l) => l.id !== layer.id)
                          .map((l) =>
                            l.parentId === layer.id ? { ...l, parentId: null } : l
                          );
                        onChangeProject({ ...project, layers: nextLayers });
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Vector Layer Inspector */}
        {selectedLayer && selEval && (
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-semibold text-slate-100 truncate">
                Layer: {selectedLayer.name}
              </h3>
              <span className="font-mono text-slate-400">@ Frame {currentFrame}</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="space-y-1">
                <span className="text-slate-400">Layer Name</span>
                <input
                  type="text"
                  value={selectedLayer.name}
                  onChange={(e) =>
                    updateLayer(selectedLayer.id, (l) => ({
                      ...l,
                      name: e.target.value,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-slate-400">Parent Link</span>
                <select
                  value={selectedLayer.parentId ?? ''}
                  onChange={(e) =>
                    updateLayer(selectedLayer.id, (l) => ({
                      ...l,
                      parentId: e.target.value || null,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="">None (Composition Root)</option>
                  {project.layers
                    .filter((other) => other.id !== selectedLayer.id)
                    .map((other) => (
                      <option key={other.id} value={other.id}>
                        {other.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            {/* Keyframed Transform Inputs (Auto-Key on Edit) */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <span className="text-slate-300 font-semibold block">
                Animated Transform (Auto-Keys Frame {currentFrame})
              </span>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5">
                  <span className="text-slate-400">Pos X</span>
                  <input
                    type="number"
                    value={Math.round(selEval.pos.x)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (Number.isNaN(val)) return;
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        positionTrack: upsertVec2Keyframe(
                          l.positionTrack,
                          currentFrame,
                          val,
                          selEval.pos.y
                        ),
                      }));
                    }}
                    className="w-16 bg-transparent text-right font-mono tabular-nums text-slate-100 focus:outline-none"
                  />
                </label>

                <label className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5">
                  <span className="text-slate-400">Pos Y</span>
                  <input
                    type="number"
                    value={Math.round(selEval.pos.y)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (Number.isNaN(val)) return;
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        positionTrack: upsertVec2Keyframe(
                          l.positionTrack,
                          currentFrame,
                          selEval.pos.x,
                          val
                        ),
                      }));
                    }}
                    className="w-16 bg-transparent text-right font-mono tabular-nums text-slate-100 focus:outline-none"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Rotation</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {selEval.rot.toFixed(1)}°
                  </span>
                </div>
                <input
                  type="range"
                  min={-180}
                  max={360}
                  step={1}
                  value={selEval.rot}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    updateLayer(selectedLayer.id, (l) => ({
                      ...l,
                      rotationTrack: upsertScalarKeyframe(
                        l.rotationTrack,
                        currentFrame,
                        val
                      ),
                    }));
                  }}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Scale %</span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {Math.round(selEval.scale.x)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={220}
                    value={selEval.scale.x}
                    onChange={(e) => {
                      const s = parseFloat(e.target.value);
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        scaleTrack: upsertVec2Keyframe(
                          l.scaleTrack,
                          currentFrame,
                          s,
                          s
                        ),
                      }));
                    }}
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                </label>

                <label className="block space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Opacity %</span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {Math.round(selEval.opacity)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={selEval.opacity}
                    onChange={(e) => {
                      const op = parseFloat(e.target.value);
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        opacityTrack: upsertScalarKeyframe(
                          l.opacityTrack,
                          currentFrame,
                          op
                        ),
                      }));
                    }}
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Shape Dimensions, Fill & Stroke */}
            <div className="space-y-2.5 pt-2 border-t border-slate-800">
              <span className="text-slate-300 font-semibold block">
                Vector Shape & Styling
              </span>

              {selectedLayer.kind !== 'path' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5">
                    <span className="text-slate-400">Width</span>
                    <input
                      type="number"
                      min={8}
                      max={600}
                      value={selectedLayer.width}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, (l) => ({
                          ...l,
                          width: Math.max(8, parseFloat(e.target.value) || 40),
                        }))
                      }
                      className="w-16 bg-transparent text-right font-mono tabular-nums text-slate-100 focus:outline-none"
                    />
                  </label>
                  <label className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5">
                    <span className="text-slate-400">Height</span>
                    <input
                      type="number"
                      min={8}
                      max={600}
                      value={selectedLayer.height}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, (l) => ({
                          ...l,
                          height: Math.max(8, parseFloat(e.target.value) || 40),
                        }))
                      }
                      className="w-16 bg-transparent text-right font-mono tabular-nums text-slate-100 focus:outline-none"
                    />
                  </label>
                </div>
              )}

              {selectedLayer.kind === 'rect' && (
                <label className="flex items-center justify-between cursor-pointer py-0.5">
                  <span className="text-slate-300">
                    Inpainted Rounded Joint Cap
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedLayer.inpaintCap}
                    onChange={(e) =>
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        inpaintCap: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-sky-400 cursor-pointer"
                  />
                </label>
              )}

              {selectedLayer.kind === 'path' && (
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedLayer.closed}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, (l) => ({
                          ...l,
                          closed: e.target.checked,
                          fillOpacity: e.target.checked
                            ? Math.max(0.85, l.fillOpacity)
                            : 0,
                        }))
                      }
                      className="w-4 h-4 accent-sky-400 cursor-pointer"
                    />
                    <span className="text-slate-300">Closed Bezier Loop</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateLayer(selectedLayer.id, (l) => ({
                        ...l,
                        vertices: l.vertices.slice(0, -1),
                      }))
                    }
                    disabled={selectedLayer.vertices.length <= 2}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-200 cursor-pointer"
                  >
                    Undo Last Point
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <label className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5 cursor-pointer">
                  <span className="text-slate-400">Fill</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={selectedLayer.fillOpacity > 0}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, (l) => ({
                          ...l,
                          fillOpacity: e.target.checked ? 1 : 0,
                        }))
                      }
                      className="w-3.5 h-3.5 accent-sky-400"
                    />
                    <input
                      type="color"
                      value={selectedLayer.fillColor}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, (l) => ({
                          ...l,
                          fillColor: e.target.value,
                        }))
                      }
                      className="w-5 h-5 bg-transparent border-0 cursor-pointer"
                    />
                  </div>
                </label>

                <label className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5 cursor-pointer">
                  <span className="text-slate-400">Stroke</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={24}
                      step={0.5}
                      value={selectedLayer.strokeWidth}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, (l) => ({
                          ...l,
                          strokeWidth: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-10 bg-transparent text-right font-mono text-slate-100 focus:outline-none"
                    />
                    <input
                      type="color"
                      value={selectedLayer.strokeColor}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, (l) => ({
                          ...l,
                          strokeColor: e.target.value,
                        }))
                      }
                      className="w-5 h-5 bg-transparent border-0 cursor-pointer"
                    />
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
