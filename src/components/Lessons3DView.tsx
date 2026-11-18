import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Download,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { LESSONS_3D } from '../data/lessons3d';
import { DEFAULT_GEOMETRY_PARAMS } from '../lib/geometryBuilder';
import {
  GeometryKind,
  PivotAlignment,
  ScenePart3D,
  Vec3Tuple,
  Viewport3DUIState,
} from '../types/studio';
import { ThreeViewport } from './ThreeViewport';

interface Lessons3DViewProps {
  activeLessonId: string;
  onChangeLessonId: (id: string) => void;
  parts: ScenePart3D[];
  onChangeParts: (parts: ScenePart3D[]) => void;
  onResetLesson: (lessonId: string) => void;
  uiState: Viewport3DUIState;
  onChangeUIState: (patch: Partial<Viewport3DUIState>) => void;
  stats: { vertices: number; triangles: number };
  onStatsChange: (stats: { vertices: number; triangles: number }) => void;
  onOpenExport: () => void;
  onOpenShortcuts: () => void;
}

const GEOMETRY_KINDS: { id: GeometryKind; label: string }[] = [
  { id: 'box', label: 'Box' },
  { id: 'cylinder', label: 'Cylinder' },
  { id: 'sphere', label: 'Sphere' },
  { id: 'cone', label: 'Cone' },
  { id: 'torus', label: 'Torus' },
  { id: 'lathe', label: 'Lathe Profile' },
  { id: 'extrude', label: 'Extrude Spline' },
];

export function Lessons3DView({
  activeLessonId,
  onChangeLessonId,
  parts,
  onChangeParts,
  onResetLesson,
  uiState,
  onChangeUIState,
  stats,
  onStatsChange,
  onOpenExport,
  onOpenShortcuts,
}: Lessons3DViewProps) {
  const activeLesson = useMemo(
    () => LESSONS_3D.find((l) => l.id === activeLessonId) ?? LESSONS_3D[0],
    [activeLessonId]
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(
    parts[0]?.id ?? null
  );
  const [newPartKind, setNewPartKind] = useState<GeometryKind>('cylinder');

  const safeStepIndex = Math.min(
    Math.max(0, stepIndex),
    activeLesson.steps.length - 1
  );
  const currentStep = activeLesson.steps[safeStepIndex];

  const stepResults = useMemo(
    () => activeLesson.steps.map((step) => step.validate(parts, uiState)),
    [activeLesson, parts, uiState]
  );

  const allStepsCompleted = stepResults.every(Boolean);

  const selectedPart = useMemo(
    () => parts.find((p) => p.id === selectedPartId) ?? parts[0] ?? null,
    [parts, selectedPartId]
  );

  const handleSelectLesson = (id: string) => {
    onChangeLessonId(id);
    setStepIndex(0);
    const targetLesson = LESSONS_3D.find((l) => l.id === id);
    if (targetLesson && targetLesson.initialParts[0]) {
      setSelectedPartId(targetLesson.initialParts[0].id);
    }
  };

  const updatePart = (partId: string, updater: (prev: ScenePart3D) => ScenePart3D) => {
    onChangeParts(parts.map((p) => (p.id === partId ? updater(p) : p)));
  };

  const handleTransformFromGizmo = (
    partId: string,
    patch: { position?: Vec3Tuple; rotation?: Vec3Tuple; scale?: Vec3Tuple }
  ) => {
    updatePart(partId, (prev) => ({
      ...prev,
      position: patch.position ?? prev.position,
      rotation: patch.rotation ?? prev.rotation,
      scale: patch.scale ?? prev.scale,
    }));
  };

  const handleAddPart = () => {
    const idx = parts.length + 1;
    const created: ScenePart3D = {
      id: `part-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `Custom_${newPartKind}_${idx}`,
      parentId: parts[0]?.id ?? null,
      kind: newPartKind,
      params: {
        ...DEFAULT_GEOMETRY_PARAMS,
        width: 0.45,
        height: 0.45,
        depth: 0.45,
        radiusTop: 0.22,
        radiusBottom: 0.25,
        tubeRadius: 0.08,
        extrudeDepth: 0.3,
        lathePoints: DEFAULT_GEOMETRY_PARAMS.lathePoints.map((p) => ({
          x: Number((p.x * 0.45).toFixed(2)),
          y: Number((p.y * 0.45).toFixed(2)),
        })),
        extrudePoints: DEFAULT_GEOMETRY_PARAMS.extrudePoints.map((p) => ({
          x: Number((p.x * 0.45).toFixed(2)),
          y: Number((p.y * 0.45).toFixed(2)),
        })),
      },
      pivot: 'bottom-center',
      position: { x: 0.45, y: 0.2, z: 0.35 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#38BDF8',
      roughness: 0.3,
      metalness: 0.65,
      visible: true,
    };
    onChangeParts([...parts, created]);
    setSelectedPartId(created.id);
  };

  const handleDuplicatePart = (part: ScenePart3D) => {
    const copy: ScenePart3D = {
      ...part,
      id: `part-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `${part.name}_Copy`,
      params: {
        ...part.params,
        lathePoints: part.params.lathePoints.map((pt) => ({ ...pt })),
        extrudePoints: part.params.extrudePoints.map((pt) => ({ ...pt })),
      },
      position: {
        x: Number((part.position.x + 0.35).toFixed(2)),
        y: part.position.y,
        z: part.position.z,
      },
      rotation: { ...part.rotation },
      scale: { ...part.scale },
    };
    onChangeParts([...parts, copy]);
    setSelectedPartId(copy.id);
  };

  const handleDeletePart = (id: string) => {
    if (parts.length <= 1) return;
    const remaining = parts
      .filter((p) => p.id !== id)
      .map((p) => (p.parentId === id ? { ...p, parentId: null } : p));
    onChangeParts(remaining);
    if (selectedPartId === id) {
      setSelectedPartId(remaining[0]?.id ?? null);
    }
  };

  // Keyboard bindings for duplicating (Shift+D) and deleting (Delete/Backspace) active 3D part
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
      if (e.shiftKey && e.key.toLowerCase() === 'd') {
        if (selectedPart) {
          e.preventDefault();
          handleDuplicatePart(selectedPart);
        }
      } else if (!e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (selectedPart && parts.length > 1) {
          e.preventDefault();
          handleDeletePart(selectedPart.id);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="flex flex-col lg:flex-row w-full h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left 65% Interactive 3D Viewport Stage */}
      <section
        aria-label="Interactive 3D Modeling Stage"
        className="w-full lg:w-[64%] xl:w-[66%] h-[48vh] lg:h-full border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0"
      >
        <ThreeViewport
          parts={parts}
          selectedPartId={selectedPart?.id ?? null}
          onSelectPart={(id) => {
            if (id) setSelectedPartId(id);
          }}
          onTransformPart={handleTransformFromGizmo}
          uiState={uiState}
          onChangeUIState={onChangeUIState}
          stats={stats}
          onStatsChange={onStatsChange}
          onOpenShortcuts={onOpenShortcuts}
        />
      </section>

      {/* Right 35% Guided Lesson & Parametric Inspector Deck */}
      <aside className="w-full lg:w-[36%] xl:w-[34%] h-[52vh] lg:h-full bg-[#111827] overflow-y-auto p-5 space-y-6">
        {/* Lesson Module Switcher */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-medium text-slate-400">
              3D Modeling Fundamentals Curriculum
            </span>
            <button
              type="button"
              onClick={() => {
                onResetLesson(activeLesson.id);
                setStepIndex(0);
              }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Lesson</span>
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
            {LESSONS_3D.map((lesson) => {
              const active = lesson.id === activeLesson.id;
              return (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => handleSelectLesson(lesson.id)}
                  className={`px-2 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap truncate ${
                    active
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  Lesson {lesson.number}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Lesson Header & Step-by-Step Guide */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3.5">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <span>{activeLesson.difficulty}</span>
              <span aria-hidden="true">·</span>
              <span>{activeLesson.estimatedMinutes} min lab</span>
              <span aria-hidden="true">·</span>
              <span className="text-sky-400 font-medium">
                {stepResults.filter(Boolean).length}/{activeLesson.steps.length} Steps Verified
              </span>
            </div>
            <h1 className="text-lg font-semibold text-slate-50 leading-snug">
              {activeLesson.number}. {activeLesson.title}
            </h1>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              {activeLesson.summary}
            </p>
          </div>

          {/* Step Tabs */}
          <div className="flex items-center gap-1.5 pt-1">
            {activeLesson.steps.map((step, idx) => {
              const done = stepResults[idx];
              const isCurrent = idx === safeStepIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    setStepIndex(idx);
                    if (step.focusPartId) setSelectedPartId(step.focusPartId);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                    isCurrent
                      ? 'bg-slate-900 border-sky-500/60 text-slate-100'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                  <span>Step {idx + 1}</span>
                </button>
              );
            })}
          </div>

          {/* Current Step Instructions */}
          {currentStep && (
            <div className="pt-1 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-100">
                  {currentStep.title}
                </h2>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium shrink-0 ${
                    stepResults[safeStepIndex]
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {stepResults[safeStepIndex] ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Completed</span>
                    </>
                  ) : (
                    <span>In Progress</span>
                  )}
                </span>
              </div>

              <p className="text-sm text-slate-200 leading-relaxed">
                {currentStep.instruction}
              </p>

              <p className="text-xs text-slate-400 leading-relaxed pt-1 border-t border-slate-800/80">
                <strong className="text-slate-300 font-medium">Why this matters: </strong>
                {currentStep.conceptNote}
              </p>

              {!stepResults[safeStepIndex] && (
                <p className="text-xs text-sky-300/90">
                  Tip: {currentStep.hint}
                </p>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={safeStepIndex === 0}
                  onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                {safeStepIndex < activeLesson.steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const nextIdx = safeStepIndex + 1;
                      setStepIndex(nextIdx);
                      const focus = activeLesson.steps[nextIdx]?.focusPartId;
                      if (focus) setSelectedPartId(focus);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Next Step</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {allStepsCompleted
                        ? 'Export Finished 3D Asset'
                        : 'Export Current 3D Asset'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Scene Hierarchy & Part Builder */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              Scene Hierarchy ({parts.length})
            </h2>
            <div className="flex items-center gap-1.5">
              <select
                aria-label="New part primitive type"
                value={newPartKind}
                onChange={(e) => setNewPartKind(e.target.value as GeometryKind)}
                className="px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-sky-500"
              >
                {GEOMETRY_KINDS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddPart}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 text-sky-400" />
                <span>Add Part</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
            {parts.map((part) => {
              const isSelected = selectedPart?.id === part.id;
              const parentName = parts.find((p) => p.id === part.parentId)?.name;
              return (
                <div
                  key={part.id}
                  onClick={() => setSelectedPartId(part.id)}
                  className={`flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-sky-500/15 text-slate-50'
                      : 'text-slate-300 hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <svg
                      viewBox="0 0 10 10"
                      className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/20"
                      aria-hidden="true"
                    >
                      <rect width="10" height="10" fill={part.color} />
                    </svg>
                    <span className="font-medium truncate">{part.name}</span>
                    <span className="text-slate-500 truncate">
                      · {part.kind}
                      {parentName ? ` → ${parentName}` : ''}
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        updatePart(part.id, (prev) => ({
                          ...prev,
                          visible: !prev.visible,
                        }))
                      }
                      className="p-1 text-slate-400 hover:text-slate-100 rounded cursor-pointer"
                      title={part.visible ? 'Hide part' : 'Show part'}
                    >
                      {part.visible ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicatePart(part)}
                      className="p-1 text-slate-400 hover:text-slate-100 rounded cursor-pointer"
                      title="Duplicate part"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={parts.length <= 1}
                      onClick={() => handleDeletePart(part.id)}
                      className="p-1 text-slate-400 hover:text-rose-400 disabled:opacity-30 rounded cursor-pointer"
                      title="Delete part"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Part Inspector */}
        {selectedPart && (
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <h3 className="text-sm font-semibold text-slate-100 truncate">
                Inspector: {selectedPart.name}
              </h3>
              <span className="text-xs font-mono text-slate-400 capitalize">
                {selectedPart.kind}
              </span>
            </div>

            {/* Name, Parent & Pivot */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-slate-400">Object Name</span>
                <input
                  type="text"
                  value={selectedPart.name}
                  onChange={(e) =>
                    updatePart(selectedPart.id, (p) => ({ ...p, name: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-slate-400">Parent Link</span>
                <select
                  value={selectedPart.parentId ?? ''}
                  onChange={(e) =>
                    updatePart(selectedPart.id, (p) => ({
                      ...p,
                      parentId: e.target.value || null,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="">None (Scene Root)</option>
                  {parts
                    .filter((other) => other.id !== selectedPart.id)
                    .map((other) => (
                      <option key={other.id} value={other.id}>
                        {other.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            {/* Pivot Alignment Segmented Control */}
            <div className="space-y-1 text-xs">
              <span className="text-slate-400 block">Pivot Origin Alignment</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
                {(
                  [
                    { id: 'bottom-center', label: 'Bottom-Center (Grounded)' },
                    { id: 'center', label: 'Bounding Center' },
                  ] as { id: PivotAlignment; label: string }[]
                ).map((piv) => (
                  <button
                    key={piv.id}
                    type="button"
                    onClick={() =>
                      updatePart(selectedPart.id, (p) => ({ ...p, pivot: piv.id }))
                    }
                    className={`py-1.5 px-2 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap truncate ${
                      selectedPart.pivot === piv.id
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {piv.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Transform XYZ Coordinates */}
            <div className="space-y-2 text-xs">
              {(
                [
                  { key: 'position', label: 'Position (m)', step: 0.05 },
                  { key: 'rotation', label: 'Rotation (°)', step: 5 },
                  { key: 'scale', label: 'Scale', step: 0.05 },
                ] as const
              ).map(({ key, label, step }) => (
                <div key={key} className="grid grid-cols-4 items-center gap-1.5">
                  <span className="text-slate-400 truncate">{label}</span>
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <label
                      key={axis}
                      className="flex items-center bg-slate-900 border border-slate-800 rounded-md px-2 py-1"
                    >
                      <span className="text-slate-500 uppercase mr-1 font-mono">
                        {axis}
                      </span>
                      <input
                        type="number"
                        step={step}
                        value={selectedPart[key][axis]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (Number.isNaN(val)) return;
                          updatePart(selectedPart.id, (p) => ({
                            ...p,
                            [key]: { ...p[key], [axis]: val },
                          }));
                        }}
                        className="w-full bg-transparent text-right font-mono tabular-nums text-slate-100 focus:outline-none"
                      />
                    </label>
                  ))}
                </div>
              ))}
            </div>

            {/* Parametric Geometry Controls */}
            <div className="pt-2 border-t border-slate-800 space-y-2.5 text-xs">
              <span className="text-slate-300 font-semibold block">
                Geometry Parameters
              </span>

              {selectedPart.kind === 'box' && (
                <>
                  {(['width', 'height', 'depth'] as const).map((dim) => (
                    <label key={dim} className="block space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span className="capitalize">{dim}</span>
                        <span className="font-mono tabular-nums text-slate-200">
                          {selectedPart.params[dim].toFixed(2)} m
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={2.5}
                        step={0.05}
                        value={selectedPart.params[dim]}
                        onChange={(e) =>
                          updatePart(selectedPart.id, (p) => ({
                            ...p,
                            params: {
                              ...p.params,
                              [dim]: parseFloat(e.target.value),
                            },
                          }))
                        }
                        className="w-full accent-sky-400 cursor-pointer"
                      />
                    </label>
                  ))}
                </>
              )}

              {(selectedPart.kind === 'cylinder' ||
                selectedPart.kind === 'cone' ||
                selectedPart.kind === 'sphere' ||
                selectedPart.kind === 'torus' ||
                selectedPart.kind === 'lathe') && (
                <label className="block space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Radial Segments</span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {selectedPart.params.radialSegments} segs
                    </span>
                  </div>
                  <input
                    type="range"
                    min={6}
                    max={48}
                    step={2}
                    value={selectedPart.params.radialSegments}
                    onChange={(e) =>
                      updatePart(selectedPart.id, (p) => ({
                        ...p,
                        params: {
                          ...p.params,
                          radialSegments: parseInt(e.target.value, 10),
                        },
                      }))
                    }
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                </label>
              )}

              {selectedPart.kind === 'cylinder' && (
                <>
                  {(['radiusTop', 'radiusBottom', 'height'] as const).map((prop) => (
                    <label key={prop} className="block space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>{prop}</span>
                        <span className="font-mono tabular-nums text-slate-200">
                          {selectedPart.params[prop].toFixed(2)} m
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.04}
                        max={2.0}
                        step={0.02}
                        value={selectedPart.params[prop]}
                        onChange={(e) =>
                          updatePart(selectedPart.id, (p) => ({
                            ...p,
                            params: {
                              ...p.params,
                              [prop]: parseFloat(e.target.value),
                            },
                          }))
                        }
                        className="w-full accent-sky-400 cursor-pointer"
                      />
                    </label>
                  ))}
                </>
              )}

              {(selectedPart.kind === 'sphere' ||
                selectedPart.kind === 'cone' ||
                selectedPart.kind === 'torus') && (
                <label className="block space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Radius</span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {selectedPart.params.radiusBottom.toFixed(2)} m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={1.6}
                    step={0.02}
                    value={selectedPart.params.radiusBottom}
                    onChange={(e) =>
                      updatePart(selectedPart.id, (p) => ({
                        ...p,
                        params: {
                          ...p.params,
                          radiusBottom: parseFloat(e.target.value),
                        },
                      }))
                    }
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                </label>
              )}

              {selectedPart.kind === 'lathe' && (
                <div className="space-y-2 pt-1">
                  <span className="text-slate-400 block">
                    Lathe 2D Profile Radii (Bottom → Top)
                  </span>
                  {selectedPart.params.lathePoints.map((pt, idx) => {
                    if (idx === 0 || idx === selectedPart.params.lathePoints.length - 1) {
                      return null; // Keep axis caps closed at X=0
                    }
                    return (
                      <label key={idx} className="block space-y-0.5">
                        <div className="flex justify-between text-slate-400">
                          <span>
                            Point #{idx + 1} (Y={pt.y.toFixed(2)}m)
                          </span>
                          <span className="font-mono tabular-nums text-slate-200">
                            R = {pt.x.toFixed(2)} m
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.12}
                          max={1.15}
                          step={0.02}
                          value={pt.x}
                          onChange={(e) => {
                            const nextX = parseFloat(e.target.value);
                            updatePart(selectedPart.id, (p) => ({
                              ...p,
                              params: {
                                ...p.params,
                                lathePoints: p.params.lathePoints.map((item, i) =>
                                  i === idx ? { ...item, x: nextX } : item
                                ),
                              },
                            }));
                          }}
                          className="w-full accent-sky-400 cursor-pointer"
                        />
                      </label>
                    );
                  })}
                </div>
              )}

              {selectedPart.kind === 'extrude' && (
                <div className="space-y-2.5">
                  <label className="block space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Extrude Depth</span>
                      <span className="font-mono tabular-nums text-slate-200">
                        {selectedPart.params.extrudeDepth.toFixed(2)} m
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1.4}
                      step={0.02}
                      value={selectedPart.params.extrudeDepth}
                      onChange={(e) =>
                        updatePart(selectedPart.id, (p) => ({
                          ...p,
                          params: {
                            ...p.params,
                            extrudeDepth: parseFloat(e.target.value),
                          },
                        }))
                      }
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer py-1">
                    <span className="text-slate-300 font-medium">Enable Bevel Edges</span>
                    <input
                      type="checkbox"
                      checked={selectedPart.params.bevelEnabled}
                      onChange={(e) =>
                        updatePart(selectedPart.id, (p) => ({
                          ...p,
                          params: {
                            ...p.params,
                            bevelEnabled: e.target.checked,
                          },
                        }))
                      }
                      className="w-4 h-4 accent-sky-400 cursor-pointer"
                    />
                  </label>

                  {selectedPart.params.bevelEnabled && (
                    <>
                      <label className="block space-y-1">
                        <div className="flex justify-between text-slate-400">
                          <span>Bevel Thickness</span>
                          <span className="font-mono tabular-nums text-slate-200">
                            {selectedPart.params.bevelThickness.toFixed(2)} m
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.01}
                          max={0.2}
                          step={0.01}
                          value={selectedPart.params.bevelThickness}
                          onChange={(e) =>
                            updatePart(selectedPart.id, (p) => ({
                              ...p,
                              params: {
                                ...p.params,
                                bevelThickness: parseFloat(e.target.value),
                                bevelSize: Number(
                                  (parseFloat(e.target.value) * 0.85).toFixed(3)
                                ),
                              },
                            }))
                          }
                          className="w-full accent-sky-400 cursor-pointer"
                        />
                      </label>

                      <label className="block space-y-1">
                        <div className="flex justify-between text-slate-400">
                          <span>Bevel Segments</span>
                          <span className="font-mono tabular-nums text-slate-200">
                            {selectedPart.params.bevelSegments}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={6}
                          step={1}
                          value={selectedPart.params.bevelSegments}
                          onChange={(e) =>
                            updatePart(selectedPart.id, (p) => ({
                              ...p,
                              params: {
                                ...p.params,
                                bevelSegments: parseInt(e.target.value, 10),
                              },
                            }))
                          }
                          className="w-full accent-sky-400 cursor-pointer"
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* PBR Surface Material */}
            <div className="pt-2 border-t border-slate-800 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold">PBR Surface Material</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="font-mono text-slate-400">{selectedPart.color}</span>
                  <input
                    type="color"
                    value={selectedPart.color}
                    onChange={(e) =>
                      updatePart(selectedPart.id, (p) => ({
                        ...p,
                        color: e.target.value,
                      }))
                    }
                    className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Roughness</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {selectedPart.roughness.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={selectedPart.roughness}
                  onChange={(e) =>
                    updatePart(selectedPart.id, (p) => ({
                      ...p,
                      roughness: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </label>

              <label className="block space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Metalness</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {selectedPart.metalness.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selectedPart.metalness}
                  onChange={(e) =>
                    updatePart(selectedPart.id, (p) => ({
                      ...p,
                      metalness: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </label>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
