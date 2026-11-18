import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Search, X } from 'lucide-react';
import { WorkspaceTab } from '../types/studio';

export type ShortcutCategory = 'all' | '3d' | '2d' | 'global';

export interface ShortcutItem {
  id: string;
  category: Exclude<ShortcutCategory, 'all'>;
  action: string;
  description: string;
  keys: string[];
}

export const STUDIO_SHORTCUTS: ShortcutItem[] = [
  // Global Studio Shortcuts
  {
    id: 'global-help',
    category: 'global',
    action: 'Toggle Shortcut Cheat-Sheet',
    description: 'Open or dismiss this keyboard reference overlay from any workspace',
    keys: ['?'],
  },
  {
    id: 'global-tabs',
    category: 'global',
    action: 'Switch Studio Workspaces',
    description: 'Jump between 3D Lessons (1), 2D Rig Labs (2), Vector Studio (3), and Docs (4)',
    keys: ['1', '2', '3', '4'],
  },
  {
    id: 'global-export',
    category: 'global',
    action: 'Open Asset Exporter',
    description: 'Launch .GLB, .GLTF, .FBX, .OBJ, and Lottie .JSON export modal',
    keys: ['Shift', 'E'],
  },
  {
    id: 'global-close',
    category: 'global',
    action: 'Dismiss Active Overlay',
    description: 'Close open modals, drawers, or clear input focus',
    keys: ['Esc'],
  },

  // 3D Viewport & Modeling Shortcuts
  {
    id: '3d-translate',
    category: '3d',
    action: 'Move / Translate Gizmo',
    description: 'Position selected 3D mesh along local X, Y, Z axes',
    keys: ['G'],
  },
  {
    id: '3d-rotate',
    category: '3d',
    action: 'Rotate Gizmo',
    description: 'Articulate joint or part rotation around its pivot point',
    keys: ['R'],
  },
  {
    id: '3d-scale',
    category: '3d',
    action: 'Scale Gizmo',
    description: 'Resize selected part along X, Y, Z dimensions',
    keys: ['S'],
  },
  {
    id: '3d-wireframe',
    category: '3d',
    action: 'Toggle Wireframe Topology',
    description: 'Switch between PBR Studio lighting and wireframe edge inspection',
    keys: ['W'],
  },
  {
    id: '3d-camera-cycle',
    category: '3d',
    action: 'Cycle Camera View Angle',
    description: 'Smoothly damp between Perspective, Front, Side, and Top views',
    keys: ['C'],
  },
  {
    id: '3d-turntable',
    category: '3d',
    action: 'Toggle 360° Turntable',
    description: 'Continuously spin the 3D assembly to verify silhouette balance',
    keys: ['T'],
  },
  {
    id: '3d-helpers',
    category: '3d',
    action: 'Toggle Floor Grid & XYZ Axes',
    description: 'Show or hide ground plane meter grid and coordinate origin axes',
    keys: ['X'],
  },
  {
    id: '3d-zen-dock',
    category: '3d',
    action: 'Hide / Show Bottom Control Dock',
    description: 'Collapse viewport controls for unobstructed full-frame inspection',
    keys: ['H'],
  },
  {
    id: '3d-duplicate',
    category: '3d',
    action: 'Duplicate Selected 3D Part',
    description: 'Clone geometry, material, and local hierarchy settings',
    keys: ['Shift', 'D'],
  },
  {
    id: '3d-delete',
    category: '3d',
    action: 'Delete Selected 3D Part',
    description: 'Remove active part while preserving remaining scene hierarchy',
    keys: ['Del / Backspace'],
  },
  {
    id: '3d-orbit',
    category: '3d',
    action: 'Orbit · Pan · Dolly Zoom',
    description: 'Left-drag to orbit, Right-drag to pan, Scroll wheel to zoom',
    keys: ['LMB', 'RMB', 'Scroll'],
  },

  // 2D Timeline & Vector Animation Shortcuts
  {
    id: '2d-play-pause',
    category: '2d',
    action: 'Play / Pause Timeline',
    description: 'Start or pause frame playback in Vector Studio and 2D Rig Labs',
    keys: ['Space'],
  },
  {
    id: '2d-step-prev',
    category: '2d',
    action: 'Step Backward 1 Frame',
    description: 'Nudge playhead one frame earlier for precise pose checking',
    keys: ['←', 'or ,'],
  },
  {
    id: '2d-step-next',
    category: '2d',
    action: 'Step Forward 1 Frame',
    description: 'Advance playhead one frame forward along the timeline',
    keys: ['→', 'or .'],
  },
  {
    id: '2d-jump-bounds',
    category: '2d',
    action: 'Jump to Start / End Frame',
    description: 'Snap playhead to Frame 0 or the composition Out Point',
    keys: ['Home', 'End'],
  },
  {
    id: '2d-insert-key',
    category: '2d',
    action: 'Stamp Keyframes at Playhead',
    description: 'Key Position, Rotation, Scale, and Opacity on selected vector layer',
    keys: ['K'],
  },
  {
    id: '2d-select-tool',
    category: '2d',
    action: 'Select / Move Layer Tool',
    description: 'Drag vector layers directly on the composition canvas',
    keys: ['V'],
  },
  {
    id: '2d-anchor-tool',
    category: '2d',
    action: 'Anchor Pivot (Pan Behind) Tool',
    description: 'Relocate anatomical joint rotation/scale crosshair without jumping',
    keys: ['Y'],
  },
  {
    id: '2d-pen-tool',
    category: '2d',
    action: 'Bezier Pen Path Tool',
    description: 'Click on the canvas to append smooth Bezier curve vertices',
    keys: ['P'],
  },
  {
    id: '2d-onion-skin',
    category: '2d',
    action: 'Toggle Onion Skin Ghosting',
    description: 'Overlay trailing 4-frame motion silhouette for spacing checks',
    keys: ['O'],
  },
  {
    id: '2d-layer-order',
    category: '2d',
    action: 'Send Backward / Bring Forward',
    description: 'Reorder selected vector layer down or up in the render stack',
    keys: ['[', ']'],
  },
  {
    id: '2d-delete-layer',
    category: '2d',
    action: 'Delete Selected Vector Layer',
    description: 'Remove active shape layer from the composition',
    keys: ['Del / Backspace'],
  },
];

interface ShortcutCheatSheetModalProps {
  isOpen: boolean;
  activeTab: WorkspaceTab;
  onClose: () => void;
}

const CATEGORY_META: {
  id: Exclude<ShortcutCategory, 'all'>;
  title: string;
  subtitle: string;
}[] = [
  {
    id: '3d',
    title: '3D Viewport & Modeling',
    subtitle: 'Active in 3D Lessons & Workbench',
  },
  {
    id: '2d',
    title: '2D Timeline & Vector Rigging',
    subtitle: 'Active in Vector Studio & 2D Rig Labs',
  },
  {
    id: 'global',
    title: 'Global Studio Navigation',
    subtitle: 'Available everywhere in RigCraft Studio',
  },
];

export function ShortcutCheatSheetModal({
  isOpen,
  activeTab,
  onClose,
}: ShortcutCheatSheetModalProps) {
  const [filter, setFilter] = useState<ShortcutCategory>('all');
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setFilter('all');
  }, [isOpen]);

  const activeContextCategory: Exclude<ShortcutCategory, 'all'> =
    activeTab === '3d-lessons'
      ? '3d'
      : activeTab === 'vector-studio' || activeTab === '2d-rig-labs'
      ? '2d'
      : 'global';

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STUDIO_SHORTCUTS.filter((item) => {
      if (filter !== 'all' && item.category !== filter) return false;
      if (!q) return true;
      return (
        item.action.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keys.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [filter, query]);

  const orderedCategories = useMemo(() => {
    // Surface the user's current workspace category first when viewing All
    return [...CATEGORY_META].sort((a, b) => {
      if (a.id === activeContextCategory) return -1;
      if (b.id === activeContextCategory) return 1;
      return 0;
    });
  }, [activeContextCategory]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Studio Keyboard Shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[86vh] flex flex-col bg-[#111827] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 bg-[#0F172A] border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-50">
                Keyboard Shortcut Cheat-Sheet
              </h2>
              <p className="text-xs text-slate-400">
                3D viewport navigation, gizmo transforms, 2D timeline scrubbing, and rigging key bindings
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close keyboard shortcuts"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-6 py-3 bg-[#0B1120] border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All Bindings' },
                { id: '3d', label: '3D Viewport' },
                { id: '2d', label: '2D Timeline & Vector' },
                { id: 'global', label: 'Global Studio' },
              ] as { id: ShortcutCategory; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === tab.id
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <label className="relative flex items-center sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by action or key..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
          </label>
        </div>

        {/* Shortcut Reference Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm font-medium text-slate-200">
                No shortcuts match "{query}"
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
                className="text-xs text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
              >
                Reset search filters
              </button>
            </div>
          ) : (
            orderedCategories.map((cat) => {
              const catItems = filteredItems.filter((i) => i.category === cat.id);
              if (catItems.length === 0) return null;
              const isCurrentWorkspace = cat.id === activeContextCategory;

              return (
                <section key={cat.id} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2 text-xs">
                      <h3 className="text-sm font-semibold text-slate-100">
                        {cat.title}
                      </h3>
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      <span className="text-slate-400">{cat.subtitle}</span>
                    </div>
                    {isCurrentWorkspace && (
                      <span className="text-xs font-medium text-sky-400">
                        Active Workspace
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {catItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800/90 hover:border-slate-700 transition-colors"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-xs font-semibold text-slate-100 truncate">
                            {item.action}
                          </div>
                          <div className="text-[11px] text-slate-400 leading-snug">
                            {item.description}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {item.keys.map((keyLabel, idx) => (
                            <kbd
                              key={idx}
                              className="px-2 py-1 min-w-[26px] text-center text-[11px] font-mono font-semibold text-sky-200 bg-slate-900 border border-slate-700 border-b-2 rounded-md shadow-inner whitespace-nowrap"
                            >
                              {keyLabel}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>

        {/* Footer Hint */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#0F172A] border-t border-slate-800 text-xs text-slate-400 shrink-0">
          <span>
            Press <kbd className="px-1.5 py-0.5 font-mono text-slate-200 bg-slate-900 border border-slate-700 rounded">?</kbd> anytime outside text fields to toggle this cheat-sheet.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
