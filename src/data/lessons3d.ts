import { DEFAULT_GEOMETRY_PARAMS } from '../lib/geometryBuilder';
import { Lesson3DDefinition, ScenePart3D } from '../types/studio';

function cloneParams(overrides: Partial<typeof DEFAULT_GEOMETRY_PARAMS> = {}) {
  return {
    ...DEFAULT_GEOMETRY_PARAMS,
    lathePoints: DEFAULT_GEOMETRY_PARAMS.lathePoints.map((p) => ({ ...p })),
    extrudePoints: DEFAULT_GEOMETRY_PARAMS.extrudePoints.map((p) => ({ ...p })),
    ...overrides,
  };
}

export const LESSONS_3D: Lesson3DDefinition[] = [
  {
    id: 'lesson-01-primitives',
    number: '01',
    title: 'Primitive Blocking & Pivot Grounding',
    subtitle: 'Build a grounded 5-part Surveyor Bot from multi-scale primitives and parent hierarchies',
    difficulty: 'Beginner',
    estimatedMinutes: 6,
    summary:
      'Every production 3D asset begins with clean blockout silhouettes, bottom-center pivot grounding so objects rest flush on the floor plane, and parent-child hierarchy chains.',
    initialParts: [
      {
        id: 'bot-pedestal',
        name: 'Pedestal_Base',
        parentId: null,
        kind: 'cylinder',
        params: cloneParams({ radiusTop: 0.72, radiusBottom: 0.88, height: 0.28, radialSegments: 28 }),
        pivot: 'bottom-center',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#334155',
        roughness: 0.65,
        metalness: 0.35,
        visible: true,
      },
      {
        id: 'bot-torso',
        name: 'Chassis_Core',
        parentId: 'bot-pedestal',
        kind: 'box',
        // Starts intentionally center-pivoted and slightly floating so Step 1 teaches bottom-center grounding!
        params: cloneParams({ width: 1.05, height: 1.15, depth: 0.85 }),
        pivot: 'center',
        position: { x: 0, y: 0.95, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#0EA5E9',
        roughness: 0.32,
        metalness: 0.2,
        visible: true,
      },
      {
        id: 'bot-head',
        name: 'Sensor_Turret',
        parentId: null, // Unparented initially so Step 3 teaches parenting!
        kind: 'box',
        params: cloneParams({ width: 0.86, height: 0.62, depth: 0.74 }),
        pivot: 'bottom-center',
        position: { x: 0, y: 1.43, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#E2E8F0',
        roughness: 0.28,
        metalness: 0.15,
        visible: true,
      },
      {
        id: 'bot-visor',
        name: 'Optical_Visor',
        parentId: 'bot-head',
        kind: 'box',
        params: cloneParams({ width: 0.68, height: 0.24, depth: 0.14 }),
        pivot: 'center',
        position: { x: 0, y: 0.33, z: 0.36 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#0F172A',
        roughness: 0.1,
        metalness: 0.88,
        visible: true,
      },
      {
        id: 'bot-antenna',
        name: 'Telemetry_Mast',
        parentId: 'bot-head',
        kind: 'cone',
        params: cloneParams({ radiusBottom: 0.11, height: 0.52, radialSegments: 18 }),
        pivot: 'bottom-center',
        position: { x: 0.24, y: 0.62, z: -0.1 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#F59E0B',
        roughness: 0.35,
        metalness: 0.7,
        visible: true,
      },
    ],
    steps: [
      {
        id: 's1-pivot-ground',
        title: 'Ground the Chassis Pivot to Bottom-Center',
        instruction:
          'Select Chassis_Core, switch its Pivot Alignment to Bottom-Center, and set Position Y to 0.28 so it rests flush on top of Pedestal_Base (height 0.28m).',
        conceptNote:
          'Bottom-center pivots prevent floating geometry and allow height scaling upward from the contact surface without sinking through the floor.',
        focusPartId: 'bot-torso',
        validate: (parts) => {
          const torso = parts.find((p) => p.id === 'bot-torso');
          return Boolean(
            torso &&
              torso.pivot === 'bottom-center' &&
              Math.abs(torso.position.y - 0.28) <= 0.08
          );
        },
        hint: 'Click Chassis_Core in the hierarchy list, set Pivot to Bottom-Center, and adjust Position Y near 0.28.',
      },
      {
        id: 's2-proportion-scale',
        title: 'Refine Primary Silhouette Proportions',
        instruction:
          'Adjust Chassis_Core Width to at least 1.15m (or Scale X >= 1.1) to establish a sturdy primary silhouette contrast against the narrower Sensor_Turret.',
        conceptNote:
          'Strong 3D designs read across three silhouette scales: primary hull, secondary turret, and small high-contrast accent details like the visor and antenna.',
        focusPartId: 'bot-torso',
        validate: (parts) => {
          const torso = parts.find((p) => p.id === 'bot-torso');
          return Boolean(
            torso && (torso.params.width >= 1.15 || torso.scale.x >= 1.1)
          );
        },
        hint: 'Increase Width to 1.15+ in Geometry Parameters (or Scale X to 1.1+) on Chassis_Core.',
      },
      {
        id: 's3-parent-link',
        title: 'Link Sensor_Turret to Chassis_Core & Rotate',
        instruction:
          'Set Sensor_Turret Parent to Chassis_Core (adjusting local Position Y near 1.15m if needed) and rotate Sensor_Turret Y by at least 15° so the robot scans the horizon.',
        conceptNote:
          'Parenting ensures child parts inherit transforms from the core hull when exported to Blender (.fbx/.gltf) or animated in Three.js.',
        focusPartId: 'bot-head',
        validate: (parts) => {
          const head = parts.find((p) => p.id === 'bot-head');
          return Boolean(
            head &&
              head.parentId === 'bot-torso' &&
              Math.abs(head.rotation.y) >= 15
          );
        },
        hint: 'Select Sensor_Turret, choose Chassis_Core in the Parent dropdown, and set Rotation Y >= 15° or <= -15°.',
      },
    ],
  },
  {
    id: 'lesson-02-lathe',
    number: '02',
    title: 'Profile Lathe & Revolve Modeling',
    subtitle: 'Revolve 2D silhouette curves into cylindrical vessels and aerospace thruster nozzles',
    difficulty: 'Beginner – Intermediate',
    estimatedMinutes: 7,
    summary:
      'Lathe (Revolve) modeling spins a 2D X/Y profile curve 360° around the vertical Y axis—ideal for vases, goblets, chess pieces, rocket bells, and turned mechanical parts.',
    initialParts: [
      {
        id: 'nozzle-stand',
        name: 'Test_Rig_Plinth',
        parentId: null,
        kind: 'cylinder',
        params: cloneParams({ radiusTop: 0.92, radiusBottom: 1.0, height: 0.2, radialSegments: 32 }),
        pivot: 'bottom-center',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#1E293B',
        roughness: 0.72,
        metalness: 0.25,
        visible: true,
      },
      {
        id: 'nozzle-bell',
        name: 'Thruster_Bell_Lathe',
        parentId: 'nozzle-stand',
        kind: 'lathe',
        params: cloneParams({
          radialSegments: 10, // Intentionally faceted so Step 1 teaches segment refinement!
          lathePoints: [
            { x: 0.0, y: 0.0 },
            { x: 0.62, y: 0.0 },
            { x: 0.72, y: 0.35 },
            { x: 0.38, y: 0.95 },
            { x: 0.46, y: 1.35 },
            { x: 0.64, y: 1.65 },
            { x: 0.56, y: 1.72 },
            { x: 0.0, y: 1.72 },
          ],
        }),
        pivot: 'bottom-center',
        position: { x: 0, y: 0.2, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#94A3B8',
        roughness: 0.48,
        metalness: 0.45,
        visible: true,
      },
      {
        id: 'nozzle-collar',
        name: 'Cooling_Manifold_Ring',
        parentId: 'nozzle-bell',
        kind: 'torus',
        params: cloneParams({ radiusBottom: 0.44, tubeRadius: 0.075, radialSegments: 28 }),
        pivot: 'center',
        position: { x: 0, y: 0.95, z: 0 },
        rotation: { x: 90, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#0EA5E9',
        roughness: 0.22,
        metalness: 0.82,
        visible: true,
      },
      {
        id: 'nozzle-injector',
        name: 'Injector_Cap',
        parentId: 'nozzle-bell',
        kind: 'cylinder',
        params: cloneParams({ radiusTop: 0.34, radiusBottom: 0.48, height: 0.26, radialSegments: 28 }),
        pivot: 'bottom-center',
        position: { x: 0, y: 1.72, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#F59E0B',
        roughness: 0.3,
        metalness: 0.75,
        visible: true,
      },
    ],
    steps: [
      {
        id: 's1-wireframe-inspect',
        title: 'Inspect Topology & Increase Radial Segments',
        instruction:
          'Toggle Wireframe shading in the bottom viewport dock (or inspect Thruster_Bell_Lathe) and increase its Radial Segments from 10 to at least 28 for a smooth revolved silhouette.',
        conceptNote:
          'Radial segments control circumferential tessellation. Too few segments produce visible faceting along silhouette edges; 24–36 balances smooth curvature with lean web polycounts.',
        focusPartId: 'nozzle-bell',
        validate: (parts) => {
          const bell = parts.find((p) => p.id === 'nozzle-bell');
          return Boolean(bell && bell.params.radialSegments >= 28);
        },
        hint: 'Select Thruster_Bell_Lathe and drag the Radial Segments slider to 28 or higher.',
      },
      {
        id: 's2-sculpt-throat',
        title: 'Sculpt the Venturi Throat & Exit Flare Profile',
        instruction:
          'In the Lathe Profile Editor for Thruster_Bell_Lathe, widen Point #3 (lower flare) X radius to >= 0.82m OR narrow Point #4 (throat) X radius to <= 0.32m.',
        conceptNote:
          'Editing a single 2D profile point reshapes an entire ring of 3D vertices simultaneously, preserving perfect axial symmetry.',
        focusPartId: 'nozzle-bell',
        validate: (parts) => {
          const bell = parts.find((p) => p.id === 'nozzle-bell');
          if (!bell || bell.params.lathePoints.length < 5) return false;
          return (
            bell.params.lathePoints[2].x >= 0.82 ||
            bell.params.lathePoints[3].x <= 0.32
          );
        },
        hint: 'Use the Lathe Profile sliders on Thruster_Bell_Lathe to flare Point 3 (>= 0.82) or pinch Point 4 (<= 0.32).',
      },
      {
        id: 's3-pbr-finish',
        title: 'Calibrate Brushed Alloy PBR Material',
        instruction:
          'Switch back to Studio shading if in Wireframe, then set Thruster_Bell_Lathe Metalness >= 0.75 and Roughness <= 0.28 for high-temperature titanium sheen.',
        conceptNote:
          'Contrasting low-roughness metallic alloys against matte structural plinths (>= 0.25 roughness delta) creates realistic light separation in Three.js and Blender.',
        focusPartId: 'nozzle-bell',
        validate: (parts, ui) => {
          const bell = parts.find((p) => p.id === 'nozzle-bell');
          return Boolean(
            bell &&
              ui.shadingMode === 'studio' &&
              bell.metalness >= 0.75 &&
              bell.roughness <= 0.28
          );
        },
        hint: 'Ensure Shading is Studio, then set Metalness >= 0.75 and Roughness <= 0.28 on Thruster_Bell_Lathe.',
      },
    ],
  },
  {
    id: 'lesson-03-extrude-bevel',
    number: '03',
    title: 'Spline Extrusion & Hard-Surface Bevels',
    subtitle: 'Extrude 2D CAD silhouettes into beveled mechanical brackets that catch studio rim light',
    difficulty: 'Intermediate',
    estimatedMinutes: 8,
    summary:
      'Real-world manufactured objects never have infinitely sharp 90° edges. Extruding 2D shapes with calibrated bevels creates realistic specular edge highlights without manual polygon beveling.',
    initialParts: [
      {
        id: 'mount-plate',
        name: 'Base_Mounting_Plate',
        parentId: null,
        kind: 'box',
        params: cloneParams({ width: 1.75, height: 0.18, depth: 1.15 }),
        pivot: 'bottom-center',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#1E293B',
        roughness: 0.7,
        metalness: 0.3,
        visible: true,
      },
      {
        id: 'extrude-arch',
        name: 'Clevis_Yoke_Extrude',
        parentId: 'mount-plate',
        kind: 'extrude',
        params: cloneParams({
          extrudeDepth: 0.36,
          bevelEnabled: false, // Disabled initially so Step 1 teaches beveling!
          bevelThickness: 0.06,
          bevelSize: 0.05,
          bevelSegments: 2,
          extrudePoints: [
            { x: -0.68, y: 0.0 },
            { x: 0.68, y: 0.0 },
            { x: 0.52, y: 0.85 },
            { x: 0.22, y: 1.32 },
            { x: -0.22, y: 1.32 },
            { x: -0.52, y: 0.85 },
          ],
        }),
        pivot: 'bottom-center',
        position: { x: 0, y: 0.18, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#38BDF8',
        roughness: 0.26,
        metalness: 0.65,
        visible: true,
      },
      {
        id: 'axle-pin',
        name: 'Titanium_Axle_Pin',
        parentId: 'extrude-arch',
        kind: 'cylinder',
        params: cloneParams({ radiusTop: 0.16, radiusBottom: 0.16, height: 0.78, radialSegments: 24 }),
        pivot: 'center',
        position: { x: 0, y: 0.96, z: 0 },
        rotation: { x: 90, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#F8FAFC',
        roughness: 0.16,
        metalness: 0.92,
        visible: true,
      },
      {
        id: 'bushing-front',
        name: 'Lock_Collar_Front',
        parentId: 'extrude-arch',
        kind: 'torus',
        params: cloneParams({ radiusBottom: 0.21, tubeRadius: 0.055, radialSegments: 24 }),
        pivot: 'center',
        position: { x: 0, y: 0.96, z: 0.28 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#F59E0B',
        roughness: 0.32,
        metalness: 0.78,
        visible: true,
      },
    ],
    steps: [
      {
        id: 's1-enable-bevel',
        title: 'Enable Edge Bevels on Clevis_Yoke_Extrude',
        instruction:
          'Select Clevis_Yoke_Extrude, toggle Bevel Edges ON, and set Bevel Segments >= 3 with Bevel Thickness >= 0.07m.',
        conceptNote:
          'Unbeveled 90° edges have discontinuous face normals that miss specular reflections. A 3-segment bevel produces crisp machined chamfers.',
        focusPartId: 'extrude-arch',
        validate: (parts) => {
          const yoke = parts.find((p) => p.id === 'extrude-arch');
          return Boolean(
            yoke &&
              yoke.params.bevelEnabled &&
              yoke.params.bevelSegments >= 3 &&
              yoke.params.bevelThickness >= 0.07
          );
        },
        hint: 'Select Clevis_Yoke_Extrude, check Enable Bevel, set Bevel Thickness >= 0.07 and Bevel Segments >= 3.',
      },
      {
        id: 's2-extrude-depth',
        title: 'Thicken Structural Extrusion Depth',
        instruction:
          'Increase Clevis_Yoke_Extrude Extrude Depth to at least 0.52m so the bracket firmly houses the central axle pin.',
        conceptNote:
          'Parametric extrusion keeps the 2D profile editable while generating watertight side walls and end caps automatically.',
        focusPartId: 'extrude-arch',
        validate: (parts) => {
          const yoke = parts.find((p) => p.id === 'extrude-arch');
          return Boolean(yoke && yoke.params.extrudeDepth >= 0.52);
        },
        hint: 'Drag Extrude Depth on Clevis_Yoke_Extrude to 0.52 or higher.',
      },
      {
        id: 's3-exploded-check',
        title: 'Verify Sub-Assembly Fit with Exploded View',
        instruction:
          'Use the Exploded View slider in the bottom viewport dock (>= 35%) to inspect internal clearance around Titanium_Axle_Pin.',
        conceptNote:
          'Exploded inspection reveals intersecting faces or hidden internal gaps before exporting multi-part hierarchies to Blender or Three.js.',
        focusPartId: 'axle-pin',
        validate: (_parts, ui) => ui.explodedFactor >= 0.35,
        hint: 'Slide Explode in the bottom viewport dock to 35% or higher.',
      },
    ],
  },
  {
    id: 'lesson-04-articulated',
    number: '04',
    title: 'Articulated Arm Assembly & Export Prep',
    subtitle: 'Pose a 6-part articulated architect lamp using 3D gizmos and export to Blender or Three.js',
    difficulty: 'Intermediate',
    estimatedMinutes: 8,
    summary:
      'Combine multi-part hierarchy chains, anatomical joint pivots, and interactive 3D Rotate/Translate gizmos to pose an articulated asset ready for .gltf, .fbx, or .obj export.',
    initialParts: [
      {
        id: 'lamp-base',
        name: 'Weighted_Base',
        parentId: null,
        kind: 'cylinder',
        params: cloneParams({ radiusTop: 0.62, radiusBottom: 0.72, height: 0.16, radialSegments: 32 }),
        pivot: 'bottom-center',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#1E293B',
        roughness: 0.55,
        metalness: 0.45,
        visible: true,
      },
      {
        id: 'lamp-lower-arm',
        name: 'Lower_Boom_Arm',
        parentId: 'lamp-base',
        kind: 'cylinder',
        params: cloneParams({ radiusTop: 0.08, radiusBottom: 0.095, height: 1.15, radialSegments: 20 }),
        pivot: 'bottom-center',
        position: { x: 0, y: 0.16, z: 0 },
        rotation: { x: 0, y: 0, z: 14 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#E2E8F0',
        roughness: 0.3,
        metalness: 0.65,
        visible: true,
      },
      {
        id: 'lamp-elbow',
        name: 'Elbow_Hinge_Joint',
        parentId: 'lamp-lower-arm',
        kind: 'sphere',
        params: cloneParams({ radiusBottom: 0.14, radialSegments: 24 }),
        pivot: 'center',
        position: { x: 0, y: 1.15, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#F59E0B',
        roughness: 0.25,
        metalness: 0.8,
        visible: true,
      },
      {
        id: 'lamp-upper-arm',
        name: 'Upper_Reach_Arm',
        parentId: 'lamp-elbow',
        kind: 'cylinder',
        params: cloneParams({ radiusTop: 0.065, radiusBottom: 0.08, height: 1.05, radialSegments: 20 }),
        pivot: 'bottom-center',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: -42 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#E2E8F0',
        roughness: 0.3,
        metalness: 0.65,
        visible: true,
      },
      {
        id: 'lamp-shade',
        name: 'Reflector_Hood',
        parentId: 'lamp-upper-arm',
        kind: 'cone',
        params: cloneParams({ radiusBottom: 0.42, height: 0.52, radialSegments: 28 }),
        pivot: 'center',
        position: { x: 0, y: 1.05, z: 0 },
        rotation: { x: 0, y: 0, z: -55 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#0EA5E9',
        roughness: 0.24,
        metalness: 0.4,
        visible: true,
      },
      {
        id: 'lamp-bulb',
        name: 'Warm_Filament_Bulb',
        parentId: 'lamp-shade',
        kind: 'sphere',
        params: cloneParams({ radiusBottom: 0.15, radialSegments: 20 }),
        pivot: 'center',
        position: { x: 0, y: -0.16, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#FEF08A',
        roughness: 0.1,
        metalness: 0.05,
        visible: true,
      },
    ],
    steps: [
      {
        id: 's1-elbow-pose',
        title: 'Pose the Articulated Chain with Rotate Gizmo',
        instruction:
          'Switch Gizmo Mode to Rotate (R), select Lower_Boom_Arm or Elbow_Hinge_Joint, and adjust its Z rotation by at least 12° from its starting angle to see child parts follow automatically.',
        conceptNote:
          'Because Upper_Reach_Arm and Reflector_Hood are parented down the chain, rotating any upstream joint pivots the entire downstream assembly cleanly.',
        focusPartId: 'lamp-elbow',
        validate: (parts) => {
          const lower = parts.find((p) => p.id === 'lamp-lower-arm');
          const elbow = parts.find((p) => p.id === 'lamp-elbow');
          const lowerMoved = lower ? Math.abs(lower.rotation.z - 14) >= 12 : false;
          const elbowMoved = elbow ? Math.abs(elbow.rotation.z) >= 12 : false;
          return lowerMoved || elbowMoved;
        },
        hint: 'Click Rotate in the bottom dock, select Elbow_Hinge_Joint, and rotate Z >= 12° (via gizmo ring or Rotation Z input).',
      },
      {
        id: 's2-add-detail-part',
        title: 'Add a Custom Counterweight or Switch Detail',
        instruction:
          'Click "+ Add Part" in the Scene Hierarchy panel to add a 7th accent component (such as a counterweight cylinder or base switch) so your model has custom geometry.',
        conceptNote:
          'Adding small secondary/tertiary mechanical accents gives 3D props authentic scale cues before exporting.',
        validate: (parts) => parts.length >= 7,
        hint: 'Click the "+ Add Part" button at the top of the Scene Hierarchy list.',
      },
      {
        id: 's3-turntable-preview',
        title: 'Enable 360° Turntable Silhouette Check',
        instruction:
          'Toggle Turntable ON in the bottom viewport dock to verify your posed silhouette from every angle—then click Export Asset to download .gltf, .fbx, or .obj!',
        conceptNote:
          'A full 360° silhouette pass catches awkward off-axis leans before bringing the asset into Blender or Three.js.',
        validate: (_parts, ui) => ui.turntable,
        hint: 'Click the Turntable toggle in the bottom viewport dock.',
      },
    ],
  },
];
