import { WorkspaceTab } from '../types/studio';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onOpenExport: () => void;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string }[] = [
  { id: '3d-lessons', label: '3D Lessons' },
  { id: '2d-rig-labs', label: '2D Rig & Motion' },
  { id: 'vector-studio', label: 'Vector Studio' },
  { id: 'pipeline-docs', label: 'Pipeline Docs' },
];

export function TopBar({ activeTab, onSelectTab, onOpenExport }: TopBarProps) {
  return (
    <header className="flex items-center justify-between gap-8 px-6 h-14 bg-[#0B1120] border-b border-slate-800 shrink-0 z-30">
      <a
        href="#3d-lessons"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab('3d-lessons');
        }}
        className="font-display text-lg font-semibold tracking-tight text-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 rounded"
      >
        RigCraft Studio
      </a>

      <nav
        aria-label="Primary Workspace Navigation"
        className="flex items-center gap-6 overflow-x-auto text-sm font-medium text-slate-400"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`relative py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-500 rounded ${
                isActive
                  ? 'text-slate-50 after:absolute after:left-0 after:right-0 after:-bottom-3.5 after:h-0.5 after:bg-sky-400'
                  : 'hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenExport}
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 active:bg-sky-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          Export Asset
        </button>
      </div>
    </header>
  );
}
