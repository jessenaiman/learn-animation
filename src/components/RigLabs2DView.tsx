import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Keyboard,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  buildDemoBLottieProject,
  buildDemoDLottieProject,
  deformMeshPoint,
  INITIAL_DEMO_C_PINS,
  RIG_DEMOS_META,
} from '../data/rigDemos2d';
import {
  compileProjectToLottieJSON,
  evaluateScalarTrack,
  getLayerWorldMatrix,
  transformPoint2D,
} from '../lib/lottieCompiler';
import { triggerBrowserDownload } from '../lib/exporters3d';
import {
  PuppetPin,
  PuppetPinKind,
  RigDemoId,
  RigReviewChecklist,
  VectorProject2D,
} from '../types/studio';

interface RigLabs2DViewProps {
  onLoadProjectIntoStudio: (project: VectorProject2D) => void;
  onChecklistChange: (checklist: RigReviewChecklist) => void;
  onNotify: (msg: string) => void;
  onOpenShortcuts: () => void;
}

export function RigLabs2DView({
  onLoadProjectIntoStudio,
  onChecklistChange,
  onNotify,
  onOpenShortcuts,
}: RigLabs2DViewProps) {
  const [activeDemo, setActiveDemo] = useState<RigDemoId>('demo-a');
  const [showDocDrawer, setShowDocDrawer] = useState(false);
  const [docText, setDocText] = useState<string>('');

  // Demo A state (Vector vs Raster Scaling & Precomp)
  const [scalePct, setScalePct] = useState<number>(180);
  const [contRasterize, setContRasterize] = useState<boolean>(false);
  const [precomposed, setPrecomposed] = useState<boolean>(false);
  const [puppetBendTest, setPuppetBendTest] = useState<number>(24);
  const demoACanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Demo B state (Inpainted Cutout Rig: Pivot & Hierarchy)
  const [inpaintCaps, setInpaintCaps] = useState<boolean>(false);
  const [pivotsSnapped, setPivotsSnapped] = useState<boolean>(false);
  const [hierarchyLinked, setHierarchyLinked] = useState<boolean>(false);
  const [shoulderSwing, setShoulderSwing] = useState<number>(42);
  const [elbowFlex, setElbowFlex] = useState<number>(48);
  const [demoBPlaying, setDemoBPlaying] = useState<boolean>(true);
  const [demoBFrame, setDemoBFrame] = useState<number>(24);

  // Demo C state (Puppet Position + Starch Pins on Triangulated Mesh)
  const [demoCPins, setDemoCPins] = useState<PuppetPin[]>(INITIAL_DEMO_C_PINS);
  const [pinToolMode, setPinToolMode] = useState<'drag-position' | 'place-starch'>(
    'drag-position'
  );
  const [showMeshWireframe, setShowMeshWireframe] = useState<boolean>(true);
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);

  // Demo D state (Bee Antennae Follow-Through & Depth Overlap)
  const [frameLag, setFrameLag] = useState<number>(0);
  const [swayAmplitude, setSwayAmplitude] = useState<number>(28);
  const [starchHeadBase, setStarchHeadBase] = useState<boolean>(false);
  const [frontAntennaOverlap, setFrontAntennaOverlap] = useState<boolean>(false);
  const [demoDPlaying, setDemoDPlaying] = useState<boolean>(true);
  const [demoDFrame, setDemoDFrame] = useState<number>(20);

  // Load attached reference document if user opens drawer
  useEffect(() => {
    if (!showDocDrawer || docText) return;
    fetch('/assets/aistudio/After_Effects_2D_Animation___Rigging_Design_Document_89cec882')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('Failed'))))
      .then((txt) => setDocText(txt))
      .catch(() =>
        setDocText(
          'Reference document summarizes Rigid Core vs. Flexible Motion across Vector/Raster workflows, Inpainted Cutout Joints, Anchor & Parenting Hierarchies, and Native Puppet Position/Starch/Overlap/Bend Pins.'
        )
      );
  }, [showDocDrawer, docText]);

  // Compute torso shear metric in Demo C
  const torsoShearPct = useMemo(() => {
    const samplePoints = [
      { x: 315, y: 175 },
      { x: 315, y: 225 },
      { x: 315, y: 270 },
    ];
    let totalDisp = 0;
    for (const pt of samplePoints) {
      const def = deformMeshPoint(pt.x, pt.y, demoCPins);
      totalDisp += Math.hypot(def.x - pt.x, def.y - pt.y);
    }
    const avgDisp = totalDisp / samplePoints.length;
    return Math.min(100, Math.round((avgDisp / 32) * 100));
  }, [demoCPins]);

  const starchPinCount = useMemo(
    () => demoCPins.filter((p) => p.kind === 'starch').length,
    [demoCPins]
  );

  // Live Review Checklist Calculation (Section 7 of Design Document)
  const checklist: RigReviewChecklist = useMemo(
    () => ({
      demoAVectorSharpAndPrecomped:
        scalePct >= 280 && contRasterize && precomposed,
      demoBInpaintedAndParented:
        inpaintCaps && pivotsSnapped && hierarchyLinked,
      demoCStarchCoreLocked: starchPinCount >= 2 && torsoShearPct <= 10,
      demoDAntennaFollowThroughAndOverlap:
        frameLag >= 2 && starchHeadBase && frontAntennaOverlap,
    }),
    [
      scalePct,
      contRasterize,
      precomposed,
      inpaintCaps,
      pivotsSnapped,
      hierarchyLinked,
      starchPinCount,
      torsoShearPct,
      frameLag,
      starchHeadBase,
      frontAntennaOverlap,
    ]
  );

  useEffect(() => {
    onChecklistChange(checklist);
  }, [checklist, onChecklistChange]);

  // Animation loop for Demo B & Demo D
  useEffect(() => {
    const isPlaying =
      (activeDemo === 'demo-b' && demoBPlaying) ||
      (activeDemo === 'demo-d' && demoDPlaying);
    if (!isPlaying) return;

    let rafId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      if (dt >= 1 / 30) {
        lastTime = now;
        if (activeDemo === 'demo-b') {
          setDemoBFrame((f) => (f + 1) % 60);
        } else if (activeDemo === 'demo-d') {
          setDemoDFrame((f) => (f + 1) % 60);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [activeDemo, demoBPlaying, demoDPlaying]);

  // Timeline playback & frame-stepping keyboard shortcuts for Demo B & Demo D
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
      if (activeDemo !== 'demo-b' && activeDemo !== 'demo-d') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (activeDemo === 'demo-b') setDemoBPlaying((p) => !p);
        else setDemoDPlaying((p) => !p);
      } else if (e.key === 'ArrowLeft' || e.key === ',') {
        e.preventDefault();
        if (activeDemo === 'demo-b') {
          setDemoBPlaying(false);
          setDemoBFrame((f) => (f - 1 + 60) % 60);
        } else {
          setDemoDPlaying(false);
          setDemoDFrame((f) => (f - 1 + 60) % 60);
        }
      } else if (e.key === 'ArrowRight' || e.key === '.') {
        e.preventDefault();
        if (activeDemo === 'demo-b') {
          setDemoBPlaying(false);
          setDemoBFrame((f) => (f + 1) % 60);
        } else {
          setDemoDPlaying(false);
          setDemoDFrame((f) => (f + 1) % 60);
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (activeDemo === 'demo-b') {
          setDemoBPlaying(false);
          setDemoBFrame(0);
        } else {
          setDemoDPlaying(false);
          setDemoDFrame(0);
        }
      } else if (e.key === 'End') {
        e.preventDefault();
        if (activeDemo === 'demo-b') {
          setDemoBPlaying(false);
          setDemoBFrame(59);
        } else {
          setDemoDPlaying(false);
          setDemoDFrame(59);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeDemo]);

  // Render Demo A Comparison Canvas (Raster .PSD pixelation vs Vector .AI Continuously Rasterize + Precomp)
  useEffect(() => {
    if (activeDemo !== 'demo-a') return;
    const canvas = demoACanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0B1120';
    ctx.fillRect(0, 0, w, h);

    // Subtle divider
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2, 16);
    ctx.lineTo(w / 2, h - 16);
    ctx.stroke();

    const zoom = scalePct / 100;
    const bendOffset = (puppetBendTest / 100) * 28;

    // Helper drawing character badge emblem
    const drawBadgeArtwork = (
      targetCtx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      radius: number,
      bendPx: number,
      brokenTransformConflict: boolean
    ) => {
      targetCtx.save();
      targetCtx.translate(cx, cy);
      if (brokenTransformConflict) {
        // Illustrates spatial pin mesh tear when animating transform + puppet on un-precomped vector
        targetCtx.transform(1, 0.18, -0.22, 1, bendPx * 0.65, -10);
      }

      // Outer emblem
      targetCtx.fillStyle = '#0EA5E9';
      targetCtx.strokeStyle = '#E0F2FE';
      targetCtx.lineWidth = Math.max(1.5, radius * 0.06);
      targetCtx.beginPath();
      targetCtx.arc(0, 0, radius, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.stroke();

      // Swaying crest plume (affected by puppet bend)
      targetCtx.fillStyle = '#F59E0B';
      targetCtx.beginPath();
      targetCtx.moveTo(-radius * 0.25, -radius * 0.85);
      targetCtx.quadraticCurveTo(
        bendPx,
        -radius * 1.55,
        radius * 0.35 + bendPx * 1.15,
        -radius * 1.35
      );
      targetCtx.quadraticCurveTo(
        radius * 0.28,
        -radius * 0.9,
        radius * 0.22,
        -radius * 0.85
      );
      targetCtx.closePath();
      targetCtx.fill();

      // Eyes
      targetCtx.fillStyle = '#0F172A';
      targetCtx.beginPath();
      targetCtx.arc(-radius * 0.32, -radius * 0.1, radius * 0.13, 0, Math.PI * 2);
      targetCtx.arc(radius * 0.32, -radius * 0.1, radius * 0.13, 0, Math.PI * 2);
      targetCtx.fill();

      // Smile curve
      targetCtx.strokeStyle = '#0F172A';
      targetCtx.lineWidth = Math.max(1.5, radius * 0.08);
      targetCtx.lineCap = 'round';
      targetCtx.beginPath();
      targetCtx.arc(0, radius * 0.06, radius * 0.38, 0.2, Math.PI - 0.2);
      targetCtx.stroke();

      targetCtx.restore();
    };

    // LEFT SIDE: Raster .PSD Workflow (Fixed 68x68 source pixel buffer scaled up -> nearest/pixelated degradation)
    const offRaster = document.createElement('canvas');
    offRaster.width = 76;
    offRaster.height = 76;
    const rCtx = offRaster.getContext('2d')!;
    drawBadgeArtwork(rCtx, 38, 44, 20, bendOffset * 0.35, false);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const rasterDrawSize = 76 * zoom;
    ctx.drawImage(
      offRaster,
      w * 0.25 - rasterDrawSize / 2,
      h * 0.54 - rasterDrawSize / 2,
      rasterDrawSize,
      rasterDrawSize
    );
    ctx.restore();

    // Labels for Left
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Raster Layer (.PSD)', 24, 30);
    ctx.fillStyle = scalePct > 150 ? '#F87171' : '#94A3B8';
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillText(
      scalePct > 150
        ? `Scale ${scalePct}% · PixelGrid Degradation`
        : `Scale ${scalePct}% · Within Native Resolution`,
      24,
      48
    );

    // RIGHT SIDE: Vector .AI / Shape Workflow
    const hasConflict = contRasterize && !precomposed && puppetBendTest > 5;
    if (!contRasterize) {
      // Un-rasterized vector acts like soft bitmap buffer when scaled up
      const offSoft = document.createElement('canvas');
      offSoft.width = 88;
      offSoft.height = 88;
      const sCtx = offSoft.getContext('2d')!;
      drawBadgeArtwork(sCtx, 44, 50, 22, bendOffset * 0.35, false);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.filter = `blur(${Math.max(0, (zoom - 1) * 1.4).toFixed(1)}px)`;
      const drawSz = 88 * zoom;
      ctx.drawImage(
        offSoft,
        w * 0.75 - drawSz / 2,
        h * 0.54 - drawSz / 2,
        drawSz,
        drawSz
      );
      ctx.restore();
    } else {
      // Crisp vector path rendering at native target resolution!
      drawBadgeArtwork(
        ctx,
        w * 0.75,
        h * 0.57,
        22 * zoom,
        bendOffset * zoom * 0.4,
        hasConflict
      );
    }

    ctx.fillStyle = '#E2E8F0';
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Vector Layer (.AI / Shape)', w / 2 + 24, 30);
    ctx.fillStyle = hasConflict
      ? '#FBBF24'
      : contRasterize
      ? '#34D399'
      : '#94A3B8';
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillText(
      hasConflict
        ? 'Transform + Puppet Conflict (Precompose First!)'
        : contRasterize
        ? `Scale ${scalePct}% · Crisp Vector Edges`
        : 'Continuously Rasterize OFF (Soft Blur)',
      w / 2 + 24,
      48
    );
  }, [activeDemo, scalePct, contRasterize, precomposed, puppetBendTest]);

  // Export Demo B or Demo D directly as a Lottie .json file
  const handleExportDemoLottie = (demo: 'demo-b' | 'demo-d') => {
    const project =
      demo === 'demo-b'
        ? buildDemoBLottieProject({
            inpaintCaps,
            shoulderSwingDeg: shoulderSwing,
            elbowFlexDeg: elbowFlex,
          })
        : buildDemoDLottieProject({
            frameLag,
            swayAmplitude,
            frontAntennaOverlap,
          });

    const jsonObj = compileProjectToLottieJSON(project);
    const blob = new Blob([JSON.stringify(jsonObj, null, 2)], {
      type: 'application/json',
    });
    const filename = `${project.name}.json`;
    triggerBrowserDownload(blob, filename);
    onNotify(`Exported ${filename} (Lottie v5.7.4 animation)`);
  };

  const activeMeta =
    RIG_DEMOS_META.find((d) => d.id === activeDemo) ?? RIG_DEMOS_META[0];

  // Precompute Demo C mesh grid
  const meshGrid = useMemo(() => {
    const cols = 7;
    const rows = 9;
    const startX = 245;
    const startY = 95;
    const stepX = 24;
    const stepY = 32;
    const pts: { gx: number; gy: number; x: number; y: number; strain: number }[][] = [];
    for (let r = 0; r < rows; r++) {
      const rowArr = [];
      for (let c = 0; c < cols; c++) {
        const rx = startX + c * stepX;
        const ry = startY + r * stepY;
        const def = deformMeshPoint(rx, ry, demoCPins);
        rowArr.push({ gx: rx, gy: ry, x: def.x, y: def.y, strain: def.strain });
      }
      pts.push(rowArr);
    }
    return pts;
  }, [demoCPins]);

  // Demo D evaluated bee layers
  const demoDProject = useMemo(
    () =>
      buildDemoDLottieProject({
        frameLag,
        swayAmplitude,
        frontAntennaOverlap,
      }),
    [frameLag, swayAmplitude, frontAntennaOverlap]
  );

  return (
    <div className="flex flex-col lg:flex-row w-full h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left 65% Interactive 2D Rigging Sandbox Stage */}
      <section className="relative w-full lg:w-[64%] xl:w-[66%] h-[48vh] lg:h-full bg-[#0B1120] border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col">
        {/* Sub-Toolbar for Demo Selection */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-800 bg-[#0F172A]">
          <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800 overflow-x-auto">
            {RIG_DEMOS_META.map((demo) => {
              const isSelected = demo.id === activeDemo;
              return (
                <button
                  key={demo.id}
                  type="button"
                  onClick={() => setActiveDemo(demo.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {demo.code}: {demo.title.split(':')[0].split('(')[0].trim()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenShortcuts}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              title="Open Keyboard Shortcut Cheat-Sheet (?)"
            >
              <Keyboard className="w-3.5 h-3.5 text-sky-400" />
              <span>Keys (?)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDocDrawer((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>{showDocDrawer ? 'Close Design Brief' : 'Read Rigging Brief'}</span>
            </button>
          </div>
        </div>

        {/* Interactive Demo Stage Area */}
        <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
          {/* DEMO A STAGE */}
          {activeDemo === 'demo-a' && (
            <canvas
              ref={demoACanvasRef}
              width={760}
              height={420}
              className="w-full max-w-[760px] h-auto rounded-xl border border-slate-800 bg-[#0B1120] shadow-lg"
            />
          )}

          {/* DEMO B STAGE: Cutout Rig Pivot, Inpaint Caps & Hierarchy */}
          {activeDemo === 'demo-b' && (() => {
            const t = Math.sin((demoBFrame / 60) * Math.PI * 2) * 0.5 + 0.5;
            const upperRot = -12 - shoulderSwing * t;
            const lowerRot = hierarchyLinked ? -16 - elbowFlex * t : -16;
            const handRot = hierarchyLinked
              ? Math.sin((demoBFrame / 60) * Math.PI * 4) * 22
              : 0;

            // If pivots are NOT snapped, limbs rotate around center (0,0) causing comical detachment!
            const upperPivotX = pivotsSnapped ? 280 : 335;
            const upperPivotY = pivotsSnapped ? 195 : 195;

            return (
              <svg
                viewBox="0 0 680 420"
                className="w-full max-w-[740px] h-auto rounded-xl border border-slate-800 bg-[#0B1120] shadow-lg select-none"
              >
                <defs>
                  <pattern
                    id="rigGridB"
                    width="32"
                    height="32"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 32 0 L 0 0 0 32"
                      fill="none"
                      stroke="#1E293B"
                      strokeWidth="0.75"
                    />
                  </pattern>
                </defs>
                <rect width="680" height="420" fill="url(#rigGridB)" />

                {/* Status Callout */}
                <text
                  x="24"
                  y="32"
                  fill="#94A3B8"
                  fontSize="12"
                  fontFamily="JetBrains Mono, monospace"
                >
                  Frame {String(demoBFrame).padStart(2, '0')} / 60 ·{' '}
                  {inpaintCaps ? 'Inpainted Joint Caps ON' : 'Flat Cut Edges (Joint Gaps Visible)'}{' '}
                  · {hierarchyLinked ? 'Parent Chain Active' : 'Unlinked Layers'}
                </text>

                {/* Torso Core */}
                <g transform="translate(235, 255)">
                  <rect
                    x="-56"
                    y="-86"
                    width="112"
                    height="172"
                    rx="26"
                    fill="#334155"
                    stroke="#64748B"
                    strokeWidth="3"
                  />
                  {/* Shoulder socket inpaint backing */}
                  {inpaintCaps && (
                    <circle
                      cx="45"
                      cy="-60"
                      r="20"
                      fill="#475569"
                      stroke="#64748B"
                      strokeWidth="1.5"
                    />
                  )}
                  <text
                    x="0"
                    y="10"
                    textAnchor="middle"
                    fill="#CBD5E1"
                    fontSize="11"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    Torso_Core
                  </text>
                </g>

                {/* Upper Arm + Downstream Chain */}
                <g
                  transform={`translate(${upperPivotX}, ${upperPivotY}) rotate(${upperRot}) translate(${
                    pivotsSnapped ? 0 : -55
                  }, 0)`}
                >
                  {/* Gap warning highlight when inpaintCaps is OFF */}
                  {!inpaintCaps && (
                    <circle
                      cx="0"
                      cy="0"
                      r="22"
                      fill="none"
                      stroke="#F87171"
                      strokeDasharray="4 3"
                      strokeWidth="1.5"
                    />
                  )}

                  {/* Upper Limb */}
                  <rect
                    x={inpaintCaps ? -18 : 6}
                    y="-18"
                    width={inpaintCaps ? 132 : 108}
                    height="36"
                    rx={inpaintCaps ? 18 : 2}
                    fill="#0EA5E9"
                    stroke="#BAE6FD"
                    strokeWidth="2.5"
                  />

                  {/* Shoulder Anchor Crosshair */}
                  <g
                    transform={`translate(${pivotsSnapped ? 0 : 55}, 0)`}
                  >
                    <circle r="6" fill="#0B1120" stroke="#FBBF24" strokeWidth="2" />
                    <line x1="-9" y1="0" x2="9" y2="0" stroke="#FBBF24" strokeWidth="1.5" />
                    <line x1="0" y1="-9" x2="0" y2="9" stroke="#FBBF24" strokeWidth="1.5" />
                  </g>

                  {/* Lower Arm (Inherits Upper Arm if hierarchyLinked, else detached in world space) */}
                  {hierarchyLinked && (
                    <g transform="translate(102, 0)">
                      <g
                        transform={`rotate(${lowerRot}) translate(${
                          pivotsSnapped ? 0 : -45
                        }, 0)`}
                      >
                        {!inpaintCaps && (
                          <circle
                            cx="0"
                            cy="0"
                            r="18"
                            fill="none"
                            stroke="#F87171"
                            strokeDasharray="4 3"
                            strokeWidth="1.5"
                          />
                        )}
                        <rect
                          x={inpaintCaps ? -15 : 5}
                          y="-15"
                          width={inpaintCaps ? 114 : 94}
                          height="30"
                          rx={inpaintCaps ? 15 : 2}
                          fill="#38BDF8"
                          stroke="#E0F2FE"
                          strokeWidth="2"
                        />
                        {/* Elbow Anchor Crosshair */}
                        <g transform={`translate(${pivotsSnapped ? 0 : 48}, 0)`}>
                          <circle r="5" fill="#0B1120" stroke="#FBBF24" strokeWidth="2" />
                        </g>

                        {/* Hand */}
                        <g transform={`translate(94, 0) rotate(${handRot})`}>
                          <ellipse
                            cx="14"
                            cy="0"
                            rx="22"
                            ry="16"
                            fill="#F59E0B"
                            stroke="#FEF3C7"
                            strokeWidth="2"
                          />
                        </g>
                      </g>
                    </g>
                  )}
                </g>

                {/* Detached Lower Arm if hierarchy is NOT linked */}
                {!hierarchyLinked && (
                  <g transform="translate(405, 195)">
                    <rect
                      x="0"
                      y="-15"
                      width="96"
                      height="30"
                      rx={inpaintCaps ? 15 : 2}
                      fill="#38BDF8"
                      opacity="0.78"
                      stroke="#F87171"
                      strokeDasharray="5 3"
                      strokeWidth="2"
                    />
                    <ellipse
                      cx="112"
                      cy="0"
                      rx="20"
                      ry="15"
                      fill="#F59E0B"
                      opacity="0.78"
                    />
                    <text
                      x="48"
                      y="32"
                      textAnchor="middle"
                      fill="#F87171"
                      fontSize="11"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                    >
                      Unlinked Child
                    </text>
                  </g>
                )}
              </svg>
            );
          })()}

          {/* DEMO C STAGE: Deformable Triangle Mesh + Position (Yellow) & Starch (Red) Pins */}
          {activeDemo === 'demo-c' && (() => {
            const headCenter = deformMeshPoint(315, 118, demoCPins);
            const chestTopL = deformMeshPoint(272, 162, demoCPins);
            const chestTopR = deformMeshPoint(358, 162, demoCPins);
            const waistL = deformMeshPoint(278, 268, demoCPins);
            const waistR = deformMeshPoint(352, 268, demoCPins);
            const footL = deformMeshPoint(278, 356, demoCPins);
            const footR = deformMeshPoint(352, 356, demoCPins);
            const shoulderR = deformMeshPoint(358, 170, demoCPins);
            const elbowR = deformMeshPoint(396, 168, demoCPins);
            const handR = deformMeshPoint(430, 165, demoCPins);
            const shoulderL = deformMeshPoint(272, 170, demoCPins);
            const handL = deformMeshPoint(225, 225, demoCPins);

            return (
              <svg
                viewBox="0 0 680 420"
                className="w-full max-w-[740px] h-auto rounded-xl border border-slate-800 bg-[#0B1120] shadow-lg select-none touch-none"
                onPointerMove={(e) => {
                  if (!draggingPinId) return;
                  const svg = e.currentTarget;
                  const rect = svg.getBoundingClientRect();
                  const nx = ((e.clientX - rect.left) / rect.width) * 680;
                  const ny = ((e.clientY - rect.top) / rect.height) * 420;
                  setDemoCPins((prev) =>
                    prev.map((p) =>
                      p.id === draggingPinId
                        ? {
                            ...p,
                            x: Math.max(80, Math.min(600, nx)),
                            y: Math.max(40, Math.min(390, ny)),
                          }
                        : p
                    )
                  );
                }}
                onPointerUp={() => setDraggingPinId(null)}
                onPointerLeave={() => setDraggingPinId(null)}
                onClick={(e) => {
                  if (pinToolMode !== 'place-starch') return;
                  const svg = e.currentTarget;
                  const rect = svg.getBoundingClientRect();
                  const nx = ((e.clientX - rect.left) / rect.width) * 680;
                  const ny = ((e.clientY - rect.top) / rect.height) * 420;
                  const newPin: PuppetPin = {
                    id: `starch-${Date.now()}`,
                    kind: 'starch',
                    label: 'Core Starch Pin',
                    restX: nx,
                    restY: ny,
                    x: nx,
                    y: ny,
                    rotation: 0,
                    scale: 1,
                    inFront: 0,
                  };
                  setDemoCPins((prev) => [...prev, newPin]);
                }}
              >
                <rect width="680" height="420" fill="#0B1120" />

                <text
                  x="24"
                  y="32"
                  fill="#94A3B8"
                  fontSize="12"
                  fontFamily="JetBrains Mono, monospace"
                >
                  Torso Shear: {torsoShearPct}% · Starch Pins: {starchPinCount} · Mode:{' '}
                  {pinToolMode === 'drag-position'
                    ? 'Drag Yellow Position Pins'
                    : 'Click Torso to Place Red Starch Pins'}
                </text>

                {/* Deformed Character Body Silhouette */}
                <path
                  d={`M ${chestTopL.x} ${chestTopL.y} L ${chestTopR.x} ${chestTopR.y} L ${waistR.x} ${waistR.y} L ${waistL.x} ${waistL.y} Z`}
                  fill="#334155"
                  stroke="#64748B"
                  strokeWidth="3"
                />

                {/* Legs */}
                <line
                  x1={waistL.x + 10}
                  y1={waistL.y}
                  x2={footL.x}
                  y2={footL.y}
                  stroke="#475569"
                  strokeWidth="22"
                  strokeLinecap="round"
                />
                <line
                  x1={waistR.x - 10}
                  y1={waistR.y}
                  x2={footR.x}
                  y2={footR.y}
                  stroke="#475569"
                  strokeWidth="22"
                  strokeLinecap="round"
                />

                {/* Left Resting Arm */}
                <line
                  x1={shoulderL.x}
                  y1={shoulderL.y}
                  x2={handL.x}
                  y2={handL.y}
                  stroke="#0EA5E9"
                  strokeWidth="20"
                  strokeLinecap="round"
                />

                {/* Right Deforming Arm */}
                <path
                  d={`M ${shoulderR.x} ${shoulderR.y} Q ${elbowR.x} ${elbowR.y} ${handR.x} ${handR.y}`}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="22"
                  strokeLinecap="round"
                />

                {/* Head */}
                <circle
                  cx={headCenter.x}
                  cy={headCenter.y}
                  r="30"
                  fill="#E2E8F0"
                  stroke="#94A3B8"
                  strokeWidth="2.5"
                />

                {/* Triangulated Puppet Mesh Overlay */}
                {showMeshWireframe &&
                  meshGrid.map((row, r) =>
                    row.map((pt, c) => {
                      if (r >= meshGrid.length - 1 || c >= row.length - 1) return null;
                      const right = meshGrid[r][c + 1];
                      const down = meshGrid[r + 1][c];
                      const diag = meshGrid[r + 1][c + 1];
                      const highStrain =
                        (pt.strain + right.strain + down.strain) / 3 > 0.35;
                      const strokeCol = highStrain
                        ? 'rgba(248, 113, 113, 0.48)'
                        : 'rgba(56, 189, 248, 0.25)';
                      return (
                        <g key={`${r}-${c}`} pointerEvents="none">
                          <polygon
                            points={`${pt.x},${pt.y} ${right.x},${right.y} ${down.x},${down.y}`}
                            fill={highStrain ? 'rgba(239, 68, 68, 0.08)' : 'none'}
                            stroke={strokeCol}
                            strokeWidth="1"
                          />
                          <polygon
                            points={`${right.x},${right.y} ${diag.x},${diag.y} ${down.x},${down.y}`}
                            fill="none"
                            stroke={strokeCol}
                            strokeWidth="1"
                          />
                        </g>
                      );
                    })
                  )}

                {/* Render Puppet Pins (Yellow Position & Red Starch) */}
                {demoCPins.map((pin) => {
                  const isStarch = pin.kind === 'starch';
                  return (
                    <g
                      key={pin.id}
                      transform={`translate(${pin.x}, ${pin.y})`}
                      className={
                        isStarch ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
                      }
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (!isStarch) {
                          setDraggingPinId(pin.id);
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (isStarch) {
                          setDemoCPins((prev) => prev.filter((p) => p.id !== pin.id));
                        }
                      }}
                    >
                      <circle
                        r="9"
                        fill={isStarch ? '#EF4444' : '#EAB308'}
                        stroke="#0B1120"
                        strokeWidth="2.5"
                      />
                      <circle r="3" fill="#0B1120" />
                      <text
                        x="13"
                        y="4"
                        fill={isStarch ? '#FCA5A5' : '#FEF08A'}
                        fontSize="10"
                        fontFamily="Plus Jakarta Sans, sans-serif"
                        pointerEvents="none"
                      >
                        {isStarch ? 'Starch' : 'Position'}
                      </text>
                    </g>
                  );
                })}
              </svg>
            );
          })()}

          {/* DEMO D STAGE: Bee Antennae Follow-Through & Overlap Depth */}
          {activeDemo === 'demo-d' && (() => {
            const compCenter = { x: 320, y: 210 };
            return (
              <svg
                viewBox="0 0 640 420"
                className="w-full max-w-[740px] h-auto rounded-xl border border-slate-800 bg-[#0B1120] shadow-lg select-none"
              >
                <rect width="640" height="420" fill="#0B1120" />
                <text
                  x="24"
                  y="32"
                  fill="#94A3B8"
                  fontSize="12"
                  fontFamily="JetBrains Mono, monospace"
                >
                  Frame {String(demoDFrame).padStart(2, '0')} / 60 · Lag: {frameLag}f ·{' '}
                  {frontAntennaOverlap
                    ? 'Overlap Pin: Front Antenna In Front (+50)'
                    : 'No Overlap Pin: Front Antenna Clipped Behind Head'}
                </text>

                {/* If Starch Head Base is OFF, simulate unwanted head wobble shear */}
                <g
                  transform={
                    starchHeadBase
                      ? ''
                      : `translate(320, 275) skewX(${(
                          Math.sin((demoDFrame / 60) * Math.PI * 2) * 14
                        ).toFixed(1)}) translate(-320, -275)`
                  }
                >
                  {demoDProject.layers.map((layer) => {
                    const mat = getLayerWorldMatrix(
                      layer,
                      demoDProject.layers,
                      demoDFrame,
                      compCenter
                    );
                    const cssMat = `matrix(${mat.map((n) => n.toFixed(4)).join(',')})`;
                    const isHead = layer.id === 'bee-head';
                    const anchorWorld = transformPoint2D(
                      mat,
                      layer.anchor.x,
                      layer.anchor.y
                    );

                    return (
                      <g key={layer.id}>
                        <g transform={cssMat}>
                          {layer.kind === 'ellipse' ? (
                            <ellipse
                              cx="0"
                              cy="0"
                              rx={layer.width / 2}
                              ry={layer.height / 2}
                              fill={layer.fillColor}
                              stroke={layer.strokeColor}
                              strokeWidth={layer.strokeWidth}
                            />
                          ) : (
                            <rect
                              x={-layer.width / 2}
                              y={-layer.height / 2}
                              width={layer.width}
                              height={layer.height}
                              rx={layer.cornerRadius}
                              fill={layer.fillColor}
                              stroke={layer.strokeColor}
                              strokeWidth={layer.strokeWidth}
                            />
                          )}

                          {/* Bee stripes/eye details on head */}
                          {isHead && (
                            <g>
                              <circle cx="28" cy="-10" r="9" fill="#0F172A" />
                              <circle cx="31" cy="-13" r="3" fill="#F8FAFC" />
                              <path
                                d="M 14 16 Q 28 26 42 14"
                                fill="none"
                                stroke="#0F172A"
                                strokeWidth="3.5"
                                strokeLinecap="round"
                              />
                            </g>
                          )}
                        </g>

                        {/* Pin indicators */}
                        {isHead && starchHeadBase && (
                          <g transform={`translate(${anchorWorld.x}, ${anchorWorld.y})`}>
                            <circle r="7" fill="#EF4444" stroke="#0B1120" strokeWidth="2" />
                            <text
                              x="11"
                              y="4"
                              fill="#FCA5A5"
                              fontSize="10"
                              fontFamily="Plus Jakarta Sans, sans-serif"
                            >
                              Starch Lock
                            </text>
                          </g>
                        )}
                        {layer.id === 'bee-ant-front' && (
                          <g transform={`translate(${anchorWorld.x}, ${anchorWorld.y})`}>
                            <circle
                              r="7"
                              fill={frontAntennaOverlap ? '#06B6D4' : '#F59E0B'}
                              stroke="#0B1120"
                              strokeWidth="2"
                            />
                            <text
                              x="11"
                              y="4"
                              fill="#67E8F9"
                              fontSize="10"
                              fontFamily="Plus Jakarta Sans, sans-serif"
                            >
                              {frontAntennaOverlap ? 'Overlap (+50) + Bend' : 'Bend Pin'}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            );
          })()}
        </div>

        {/* Optional Reference Document Drawer Overlay */}
        {showDocDrawer && (
          <div className="absolute inset-x-4 bottom-4 top-16 bg-[#0F172A] border border-slate-700 rounded-xl p-5 overflow-y-auto shadow-2xl z-20">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <h3 className="text-sm font-semibold text-slate-100">
                Reference: 2D Animation & Rigging Design Document
              </h3>
              <button
                type="button"
                onClick={() => setShowDocDrawer(false)}
                className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md cursor-pointer"
              >
                Close
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-xs text-slate-300 leading-relaxed">
              {docText || 'Loading design document...'}
            </pre>
          </div>
        )}
      </section>

      {/* Right 35% Rigging Controls & Review Checklist Deck */}
      <aside className="w-full lg:w-[36%] xl:w-[34%] h-[52vh] lg:h-full bg-[#111827] overflow-y-auto p-5 space-y-5">
        {/* Rigid Core vs Flexible Motion Header */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
          <div className="text-xs text-sky-400 font-medium">
            {activeMeta.code} · Rigid Core vs. Flexible Parameters
          </div>
          <h1 className="text-lg font-semibold text-slate-50 leading-snug">
            {activeMeta.title}
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            {activeMeta.objective}
          </p>
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs">
            <p className="text-slate-400">
              <strong className="text-slate-200 font-medium">Rigid / Locked Rule: </strong>
              {activeMeta.rigidCoreRule}
            </p>
            <p className="text-slate-400">
              <strong className="text-slate-200 font-medium">Lab Goal: </strong>
              {activeMeta.checklistPrompt}
            </p>
          </div>
        </div>

        {/* DEMO A CONTROLS */}
        {activeDemo === 'demo-a' && (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3.5 text-xs">
            <h2 className="text-sm font-semibold text-slate-100">
              Scaling & Precomposition Controls
            </h2>

            <label className="block space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>Layer Scale Factor</span>
                <span className="font-mono tabular-nums text-sky-300">{scalePct}%</span>
              </div>
              <input
                type="range"
                min={100}
                max={340}
                step={10}
                value={scalePct}
                onChange={(e) => setScalePct(parseInt(e.target.value, 10))}
                className="w-full accent-sky-400 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between py-1.5 cursor-pointer border-t border-slate-800/70">
              <div>
                <span className="text-slate-200 font-medium block">
                  Continuously Rasterize (Vector Switch)
                </span>
                <span className="text-slate-400">
                  Re-rasterizes vector paths sharply at every zoom level
                </span>
              </div>
              <input
                type="checkbox"
                checked={contRasterize}
                onChange={(e) => setContRasterize(e.target.checked)}
                className="w-4 h-4 accent-sky-400 cursor-pointer shrink-0 ml-2"
              />
            </label>

            <label className="flex items-center justify-between py-1.5 cursor-pointer border-t border-slate-800/70">
              <div>
                <span className="text-slate-200 font-medium block">
                  Precompose Vector Before Puppet Pinning
                </span>
                <span className="text-slate-400">
                  Prevents render-order mesh tearing when transforming scale/position
                </span>
              </div>
              <input
                type="checkbox"
                checked={precomposed}
                onChange={(e) => setPrecomposed(e.target.checked)}
                className="w-4 h-4 accent-sky-400 cursor-pointer shrink-0 ml-2"
              />
            </label>

            <label className="block space-y-1 pt-1 border-t border-slate-800/70">
              <div className="flex justify-between text-slate-300">
                <span>Crest Puppet Pin Bend</span>
                <span className="font-mono tabular-nums">{puppetBendTest}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={puppetBendTest}
                onChange={(e) => setPuppetBendTest(parseInt(e.target.value, 10))}
                className="w-full accent-sky-400 cursor-pointer"
              />
            </label>
          </div>
        )}

        {/* DEMO B CONTROLS */}
        {activeDemo === 'demo-b' && (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                Cutout Joint & Hierarchy Parameters
              </h2>
              <button
                type="button"
                onClick={() => setDemoBPlaying((p) => !p)}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-100 cursor-pointer"
              >
                {demoBPlaying ? (
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
            </div>

            <label className="flex items-center justify-between py-1 cursor-pointer">
              <div>
                <span className="text-slate-200 font-medium block">
                  1. Inpainted Rounded Joint Caps
                </span>
                <span className="text-slate-400">
                  Extends hidden overlap ellipses so rotation exposes zero gaps
                </span>
              </div>
              <input
                type="checkbox"
                checked={inpaintCaps}
                onChange={(e) => setInpaintCaps(e.target.checked)}
                className="w-4 h-4 accent-sky-400 cursor-pointer ml-2"
              />
            </label>

            <label className="flex items-center justify-between py-1 cursor-pointer border-t border-slate-800/70">
              <div>
                <span className="text-slate-200 font-medium block">
                  2. Snap Anchor Points to Anatomical Pivots (Y)
                </span>
                <span className="text-slate-400">
                  Moves pivots from layer centers to shoulder & elbow sockets
                </span>
              </div>
              <input
                type="checkbox"
                checked={pivotsSnapped}
                onChange={(e) => setPivotsSnapped(e.target.checked)}
                className="w-4 h-4 accent-sky-400 cursor-pointer ml-2"
              />
            </label>

            <label className="flex items-center justify-between py-1 cursor-pointer border-t border-slate-800/70">
              <div>
                <span className="text-slate-200 font-medium block">
                  3. Parent & Link Hierarchy Chain
                </span>
                <span className="text-slate-400">
                  Links Hand → Lower_Limb → Upper_Limb → Torso
                </span>
              </div>
              <input
                type="checkbox"
                checked={hierarchyLinked}
                onChange={(e) => setHierarchyLinked(e.target.checked)}
                className="w-4 h-4 accent-sky-400 cursor-pointer ml-2"
              />
            </label>

            <label className="block space-y-1 pt-1 border-t border-slate-800/70">
              <div className="flex justify-between text-slate-300">
                <span>Shoulder Rotation Arc</span>
                <span className="font-mono tabular-nums">{shoulderSwing}°</span>
              </div>
              <input
                type="range"
                min={10}
                max={75}
                value={shoulderSwing}
                onChange={(e) => setShoulderSwing(parseInt(e.target.value, 10))}
                className="w-full accent-sky-400 cursor-pointer"
              />
            </label>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleExportDemoLottie('demo-b')}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Lottie (.json)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onLoadProjectIntoStudio(
                    buildDemoBLottieProject({
                      inpaintCaps: true,
                      shoulderSwingDeg: shoulderSwing,
                      elbowFlexDeg: elbowFlex,
                    })
                  )
                }
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>Edit in Vector Studio</span>
              </button>
            </div>
          </div>
        )}

        {/* DEMO C CONTROLS */}
        {activeDemo === 'demo-c' && (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                Puppet Mesh & Starch Stiffness Toolset
              </h2>
              <button
                type="button"
                onClick={() => setDemoCPins(INITIAL_DEMO_C_PINS)}
                className="flex items-center gap-1 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Pins</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setPinToolMode('drag-position')}
                className={`py-2 px-2 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  pinToolMode === 'drag-position'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Position Pin (Yellow)
              </button>
              <button
                type="button"
                onClick={() => setPinToolMode('place-starch')}
                className={`py-2 px-2 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  pinToolMode === 'place-starch'
                    ? 'bg-rose-500 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                + Starch Pin (Red)
              </button>
            </div>

            <p className="text-slate-400 leading-relaxed">
              {pinToolMode === 'drag-position'
                ? 'Drag the yellow Right Hand pin on the canvas to observe torso shear. Then switch to "+ Starch Pin (Red)" and click along the chest and spine to stiffen the core.'
                : 'Click directly on the character chest and pelvis in the canvas to place red Starch Pins. Double-click any Starch pin to remove it.'}
            </p>

            <button
              type="button"
              onClick={() => {
                setDemoCPins([
                  ...INITIAL_DEMO_C_PINS,
                  {
                    id: 'auto-starch-chest',
                    kind: 'starch' as PuppetPinKind,
                    label: 'Chest Starch',
                    restX: 315,
                    restY: 175,
                    x: 315,
                    y: 175,
                    rotation: 0,
                    scale: 1,
                    inFront: 0,
                  },
                  {
                    id: 'auto-starch-spine',
                    kind: 'starch' as PuppetPinKind,
                    label: 'Spine Starch',
                    restX: 315,
                    restY: 225,
                    x: 315,
                    y: 225,
                    rotation: 0,
                    scale: 1,
                    inFront: 0,
                  },
                  {
                    id: 'auto-starch-pelvis',
                    kind: 'starch' as PuppetPinKind,
                    label: 'Pelvis Starch',
                    restX: 315,
                    restY: 268,
                    x: 315,
                    y: 268,
                    rotation: 0,
                    scale: 1,
                    inFront: 0,
                  },
                ]);
              }}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium rounded-lg transition-colors cursor-pointer"
            >
              Auto-Place Spine Starch Pins (Quick Demo)
            </button>

            <label className="flex items-center justify-between pt-1 cursor-pointer">
              <span className="text-slate-300">Show Triangle Deformation Mesh</span>
              <input
                type="checkbox"
                checked={showMeshWireframe}
                onChange={(e) => setShowMeshWireframe(e.target.checked)}
                className="w-4 h-4 accent-sky-400 cursor-pointer"
              />
            </label>
          </div>
        )}

        {/* DEMO D CONTROLS */}
        {activeDemo === 'demo-d' && (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                Antennae Inertia & Overlap Controls
              </h2>
              <button
                type="button"
                onClick={() => setDemoDPlaying((p) => !p)}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-100 cursor-pointer"
              >
                {demoDPlaying ? (
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
            </div>

            <label className="flex items-center justify-between py-1 cursor-pointer">
              <div>
                <span className="text-slate-200 font-medium block">
                  1. Anchor Head Base with Starch Pins
                </span>
                <span className="text-slate-400">
                  Eliminates jelly-like head skew during antenna sway
                </span>
              </div>
              <input
                type="checkbox"
                checked={starchHeadBase}
                onChange={(e) => setStarchHeadBase(e.target.checked)}
                className="w-4 h-4 accent-sky-400 cursor-pointer ml-2"
              />
            </label>

            <label className="block space-y-1 pt-1 border-t border-slate-800/70">
              <div className="flex justify-between text-slate-300">
                <span>2. Follow-Through Keyframe Lag</span>
                <span className="font-mono tabular-nums text-sky-300">
                  {frameLag} frames
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={6}
                step={1}
                value={frameLag}
                onChange={(e) => setFrameLag(parseInt(e.target.value, 10))}
                className="w-full accent-sky-400 cursor-pointer"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>Bend Pin Sway Amplitude</span>
                <span className="font-mono tabular-nums">
                  {evaluateScalarTrack([], 0, swayAmplitude)}°
                </span>
              </div>
              <input
                type="range"
                min={12}
                max={48}
                step={2}
                value={swayAmplitude}
                onChange={(e) => setSwayAmplitude(parseInt(e.target.value, 10))}
                className="w-full accent-sky-400 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between py-1 cursor-pointer border-t border-slate-800/70">
              <div>
                <span className="text-slate-200 font-medium block">
                  3. Blue Overlap Pin: Foreground Antenna In Front (+50)
                </span>
                <span className="text-slate-400">
                  Keeps near antenna crossing cleanly in front of head silhouette
                </span>
              </div>
              <input
                type="checkbox"
                checked={frontAntennaOverlap}
                onChange={(e) => setFrontAntennaOverlap(e.target.checked)}
                className="w-4 h-4 accent-sky-400 cursor-pointer ml-2"
              />
            </label>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleExportDemoLottie('demo-d')}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Lottie (.json)</span>
              </button>
              <button
                type="button"
                onClick={() => onLoadProjectIntoStudio(demoDProject)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>Edit in Vector Studio</span>
              </button>
            </div>
          </div>
        )}

        {/* Section 7 Live Review Checklist */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5 text-xs">
          <h2 className="text-sm font-semibold text-slate-100">
            Session Review Checklist
          </h2>
          {(
            [
              {
                done: checklist.demoAVectorSharpAndPrecomped,
                label:
                  'Vector layer stays sharp at 300% scale and is precomposed before Puppet pinning (Demo A)',
                target: 'demo-a' as RigDemoId,
              },
              {
                done: checklist.demoBInpaintedAndParented,
                label:
                  'Rotated cutout joints show zero gaps (inpainted caps) with snapped pivots & parent links (Demo B)',
                target: 'demo-b' as RigDemoId,
              },
              {
                done: checklist.demoCStarchCoreLocked,
                label:
                  'Torso core stays stationary (<10% shear) via Starch pins during limb bending (Demo C)',
                target: 'demo-c' as RigDemoId,
              },
              {
                done: checklist.demoDAntennaFollowThroughAndOverlap,
                label:
                  'Bee antennae exhibit 2–4f delayed sway and clean front/back Overlap layering (Demo D)',
                target: 'demo-d' as RigDemoId,
              },
            ] as const
          ).map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveDemo(item.target)}
              className="w-full flex items-start gap-2.5 text-left py-1.5 px-2 rounded-lg hover:bg-slate-900 transition-colors cursor-pointer"
            >
              {item.done ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              )}
              <span
                className={
                  item.done ? 'text-slate-200 line-through decoration-slate-600' : 'text-slate-300'
                }
              >
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
