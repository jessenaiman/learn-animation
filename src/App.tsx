/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Keyboard } from 'lucide-react';
import { ExportModal } from './components/ExportModal';
import { Lessons3DView } from './components/Lessons3DView';
import { PipelineDocsView } from './components/PipelineDocsView';
import { RigLabs2DView } from './components/RigLabs2DView';
import { ShortcutCheatSheetModal } from './components/ShortcutCheatSheetModal';
import { TopBar } from './components/TopBar';
import { VectorStudioView } from './components/VectorStudioView';
import { LESSONS_3D } from './data/lessons3d';
import { VECTOR_TEMPLATES_2D } from './data/vectorTemplates2d';
import {
  RigReviewChecklist,
  ScenePart3D,
  VectorProject2D,
  Viewport3DUIState,
  WorkspaceTab,
} from './types/studio';

const STORAGE_KEY_3D = 'rigcraft_studio_3d_parts_v1';
const STORAGE_KEY_LESSON = 'rigcraft_studio_lesson_id_v1';
const STORAGE_KEY_2D = 'rigcraft_studio_2d_project_v1';

function cloneParts(parts: ScenePart3D[]): ScenePart3D[] {
  return JSON.parse(JSON.stringify(parts)) as ScenePart3D[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('3d-lessons');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 3D Lessons & Scene Graph State
  const [activeLessonId, setActiveLessonId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LESSON);
      if (saved && LESSONS_3D.some((l) => l.id === saved)) return saved;
    } catch {
      // ignore storage errors
    }
    return LESSONS_3D[0].id;
  });

  const [partsByLesson, setPartsByLesson] = useState<Record<string, ScenePart3D[]>>(() => {
    const initialMap: Record<string, ScenePart3D[]> = {};
    for (const lesson of LESSONS_3D) {
      initialMap[lesson.id] = cloneParts(lesson.initialParts);
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY_3D);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, ScenePart3D[]>;
        for (const key of Object.keys(parsed)) {
          if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
            initialMap[key] = parsed[key];
          }
        }
      }
    } catch {
      // ignore invalid cache
    }
    return initialMap;
  });

  const [uiState3D, setUiState3D] = useState<Viewport3DUIState>({
    gizmoMode: 'translate',
    shadingMode: 'studio',
    cameraPreset: 'perspective',
    showGrid: true,
    showAxes: false,
    turntable: false,
    explodedFactor: 0,
  });

  const [stats3D, setStats3D] = useState<{ vertices: number; triangles: number }>({
    vertices: 0,
    triangles: 0,
  });

  // 2D Vector Animation Studio State
  const [vectorProject, setVectorProject] = useState<VectorProject2D>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_2D);
      if (saved) {
        const parsed = JSON.parse(saved) as VectorProject2D;
        if (parsed && Array.isArray(parsed.layers) && parsed.layers.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore invalid cache
    }
    return JSON.parse(JSON.stringify(VECTOR_TEMPLATES_2D.kineticBadge)) as VectorProject2D;
  });

  const [, setRigChecklist] = useState<RigReviewChecklist>({
    demoAVectorSharpAndPrecomped: false,
    demoBInpaintedAndParented: false,
    demoCStarchCoreLocked: false,
    demoDAntennaFollowThroughAndOverlap: false,
  });

  // Persist state updates cleanly
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_LESSON, activeLessonId);
    } catch {
      // ignore
    }
  }, [activeLessonId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_3D, JSON.stringify(partsByLesson));
    } catch {
      // ignore
    }
  }, [partsByLesson]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_2D, JSON.stringify(vectorProject));
    } catch {
      // ignore
    }
  }, [vectorProject]);

  const notify = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  // Global Studio Keyboard Bindings (?, Esc, 1-4 Workspace Tabs, Shift+E Export)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditingField =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(target?.isContentEditable);

      if (e.key === 'Escape') {
        if (shortcutsOpen) {
          e.preventDefault();
          setShortcutsOpen(false);
          return;
        }
        if (exportModalOpen) {
          e.preventDefault();
          setExportModalOpen(false);
          return;
        }
        if (isEditingField && target) {
          target.blur();
        }
        return;
      }

      if (isEditingField || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      } else if (e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setShortcutsOpen(false);
        setExportModalOpen(true);
      } else if (!e.shiftKey && !shortcutsOpen && !exportModalOpen) {
        if (e.key === '1') setActiveTab('3d-lessons');
        else if (e.key === '2') setActiveTab('2d-rig-labs');
        else if (e.key === '3') setActiveTab('vector-studio');
        else if (e.key === '4') setActiveTab('pipeline-docs');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcutsOpen, exportModalOpen]);

  const activeLesson = useMemo(
    () => LESSONS_3D.find((l) => l.id === activeLessonId) ?? LESSONS_3D[0],
    [activeLessonId]
  );

  const activeParts3D = useMemo(
    () => partsByLesson[activeLesson.id] ?? activeLesson.initialParts,
    [partsByLesson, activeLesson]
  );

  const handleUpdateActiveParts = useCallback(
    (nextParts: ScenePart3D[]) => {
      setPartsByLesson((prev) => ({
        ...prev,
        [activeLesson.id]: nextParts,
      }));
    },
    [activeLesson.id]
  );

  const handleResetLesson = useCallback((lessonId: string) => {
    const target = LESSONS_3D.find((l) => l.id === lessonId);
    if (!target) return;
    setPartsByLesson((prev) => ({
      ...prev,
      [lessonId]: cloneParts(target.initialParts),
    }));
    setUiState3D((prev) => ({
      ...prev,
      explodedFactor: 0,
      turntable: false,
      shadingMode: 'studio',
    }));
  }, []);

  const handleChangeUIState3D = useCallback(
    (patch: Partial<Viewport3DUIState>) => {
      setUiState3D((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const active3DAssetTitle = useMemo(() => {
    const slug = activeLesson.title.replace(/[^a-zA-Z0-9]+/g, '_');
    return `Lesson${activeLesson.number}_${slug}`;
  }, [activeLesson]);

  const defaultExportDomain: '3d' | '2d' =
    activeTab === '2d-rig-labs' || activeTab === 'vector-studio' ? '2d' : '3d';

  return (
    <div className="min-h-screen flex flex-col bg-[#0B1120] text-slate-100">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenExport={() => setExportModalOpen(true)}
      />

      <main className="flex-1 overflow-hidden">
        {activeTab === '3d-lessons' && (
          <Lessons3DView
            activeLessonId={activeLesson.id}
            onChangeLessonId={setActiveLessonId}
            parts={activeParts3D}
            onChangeParts={handleUpdateActiveParts}
            onResetLesson={handleResetLesson}
            uiState={uiState3D}
            onChangeUIState={handleChangeUIState3D}
            stats={stats3D}
            onStatsChange={setStats3D}
            onOpenExport={() => setExportModalOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />
        )}

        {activeTab === '2d-rig-labs' && (
          <RigLabs2DView
            onLoadProjectIntoStudio={(proj) => {
              setVectorProject(JSON.parse(JSON.stringify(proj)) as VectorProject2D);
              setActiveTab('vector-studio');
              notify(`Loaded "${proj.name}" into Vector Studio for custom editing`);
            }}
            onChecklistChange={setRigChecklist}
            onNotify={notify}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />
        )}

        {activeTab === 'vector-studio' && (
          <VectorStudioView
            project={vectorProject}
            onChangeProject={setVectorProject}
            onOpenExportModal={() => setExportModalOpen(true)}
            onNotify={notify}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />
        )}

        {activeTab === 'pipeline-docs' && (
          <div className="relative h-full">
            <PipelineDocsView
              active3DName={active3DAssetTitle}
              parts3D={activeParts3D}
              vectorProject={vectorProject}
              onOpenExport={() => setExportModalOpen(true)}
            />
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="fixed bottom-5 left-5 z-30 flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#111827] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 rounded-xl shadow-lg transition-colors cursor-pointer whitespace-nowrap"
              title="Open Keyboard Shortcut Cheat-Sheet (?)"
            >
              <Keyboard className="w-3.5 h-3.5 text-sky-400" />
              <span>Shortcuts (?)</span>
            </button>
          </div>
        )}
      </main>

      <ExportModal
        isOpen={exportModalOpen}
        defaultDomain={defaultExportDomain}
        active3DName={active3DAssetTitle}
        parts3D={activeParts3D}
        stats3D={stats3D}
        vectorProject={vectorProject}
        onClose={() => setExportModalOpen(false)}
        onJumpToDocs={() => setActiveTab('pipeline-docs')}
        onNotify={notify}
      />

      <ShortcutCheatSheetModal
        isOpen={shortcutsOpen}
        activeTab={activeTab}
        onClose={() => setShortcutsOpen(false)}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F172A] border border-sky-500/40 text-xs font-medium text-slate-100 shadow-2xl"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
