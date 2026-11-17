import { useEffect, useMemo, useRef, useState } from 'react';
import './room-editor.css';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const snapLength = (feet, unit) => unit === 'cm' ? Math.round(feet * 30.48) / 30.48 : Math.round(feet * 12) / 12;

function formatLength(feet, unit) {
  if (unit === 'cm') return `${Math.round(feet * 30.48)} cm`;
  const inches = Math.round(feet * 12);
  return `${Math.floor(inches / 12)}' ${inches % 12}"`;
}

function RoomEditor({ room, wallColors, onApply, onClose }) {
  const [draft, setDraft] = useState({ ...room });
  const [step, setStep] = useState(1);
  const [unit, setUnit] = useState('ft');
  const [mode, setMode] = useState('plan');
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [activeEdge, setActiveEdge] = useState('');
  const [selectedOpening, setSelectedOpening] = useState('');
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const rotated = (draft.rotation || 0) % 2 === 1;
  const displayWidth = rotated ? draft.depth : draft.width;
  const displayDepth = rotated ? draft.width : draft.depth;
  const geometry = useMemo(() => {
    const scale = Math.min(600 / displayWidth, 480 / displayDepth, 40);
    const width = displayWidth * scale;
    const depth = displayDepth * scale;
    return { scale, width, depth, x: (800 - width) / 2, y: (720 - depth) / 2 };
  }, [displayWidth, displayDepth]);

  const saveHistory = (snapshot) => {
    setPast((items) => [...items.slice(-49), snapshot]);
    setFuture([]);
  };
  const updateDraft = (patch) => {
    saveHistory(draft);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const undo = () => {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [draft, ...items]);
    setDraft(previous);
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture((items) => items.slice(1));
    setPast((items) => [...items, draft]);
    setDraft(next);
  };
  const startDrag = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!svgRef.current) return;
    const point = svgRef.current.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(svgRef.current.getScreenCTM().inverse());
    const opening = event.target.closest('[data-opening]');
    if (opening) {
      const kind = opening.getAttribute('data-opening');
      const axis = mode === 'ceiling'
        ? (kind === 'window' ? [290, -140] : [270, 120])
        : (kind === 'window' ? [geometry.width, 0] : [0, geometry.depth]);
      dragRef.current = {
        kind: 'opening',
        opening: kind,
        mode,
        x: svgPoint.x,
        y: svgPoint.y,
        axis,
        reverse: kind === 'window' ? Boolean(draft.flipH) : Boolean(draft.flipV),
        position: draft[`${kind}Position`] || (kind === 'window' ? .42 : .7),
        room: { ...draft },
      };
      setSelectedOpening(kind);
      setActiveEdge('');
      svgRef.current.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    const target = event.target.closest('[data-edges]');
    if (!target) return;
    dragRef.current = {
      kind: 'wall',
      edges: target.getAttribute('data-edges'),
      mode,
      x: svgPoint.x,
      y: svgPoint.y,
      room: { ...draft },
      scale: mode === 'ceiling' ? 12 : geometry.scale,
    };
    setActiveEdge(target.getAttribute('data-edges'));
    svgRef.current.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || !svgRef.current) return;
    const point = svgRef.current.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(svgRef.current.getScreenCTM().inverse());
    if (drag.kind === 'opening') {
      const [axisX, axisY] = drag.axis;
      const distance = axisX * axisX + axisY * axisY;
      const direction = drag.reverse ? -1 : 1;
      const positionDelta = direction * (((svgPoint.x - drag.x) * axisX + (svgPoint.y - drag.y) * axisY) / distance);
      const wallLength = drag.opening === 'window'
        ? (drag.mode === 'ceiling' ? drag.room.width : displayWidth)
        : (drag.mode === 'ceiling' ? drag.room.depth : displayDepth);
      const openingWidth = drag.opening === 'window'
        ? Math.min(drag.room.windowW, wallLength * .6)
        : Math.min(drag.room.doorW, wallLength * .4);
      const maximumHalf = drag.mode === 'ceiling' ? .24 : .35;
      const half = clamp(openingWidth / (2 * wallLength), .035, maximumHalf);
      const position = clamp(drag.position + positionDelta, half + .02, .98 - half);
      setDraft((current) => ({ ...current, [`${drag.opening}Position`]: position }));
      return;
    }
    if (drag.mode === 'ceiling') {
      const height = snapLength(drag.room.height - (svgPoint.y - drag.y) / drag.scale, unit);
      setDraft((current) => ({ ...current, height: clamp(height, 7, 20) }));
      return;
    }

    const horizontalKey = rotated ? 'depth' : 'width';
    const verticalKey = rotated ? 'width' : 'depth';
    const horizontalChange = (svgPoint.x - drag.x) / drag.scale;
    const verticalChange = (svgPoint.y - drag.y) / drag.scale;
    let width = drag.room[horizontalKey];
    let depth = drag.room[verticalKey];
    if (drag.edges.includes('w')) width -= horizontalChange;
    if (drag.edges.includes('e')) width += horizontalChange;
    if (drag.edges.includes('n')) depth -= verticalChange;
    if (drag.edges.includes('s')) depth += verticalChange;
    setDraft((current) => ({
      ...current,
      [horizontalKey]: clamp(snapLength(width, unit), 5, 80),
      [verticalKey]: clamp(snapLength(depth, unit), 5, 80),
    }));
  };
  const endDrag = () => {
    const drag = dragRef.current;
    if (drag && ['width', 'depth', 'height', 'windowPosition', 'doorPosition'].some((key) => drag.room[key] !== draft[key])) saveHistory(drag.room);
    dragRef.current = null;
    setActiveEdge('');
  };
  const side = (edges, x1, y1, x2, y2, cursor) => (
    <g key={edges} data-edges={edges} style={{ cursor }} className={activeEdge === edges ? 'active' : ''}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="room-plan-wall-highlight" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="room-plan-hit" />
    </g>
  );
  const dimensionLines = (x, y, width, depth, horizontalLabel, verticalLabel) => <>
    <line x1={x} y1={y - 42} x2={x + width} y2={y - 42} className="room-plan-dimension" />
    <line x1={x} y1={y - 50} x2={x} y2={y - 34} className="room-plan-dimension" />
    <line x1={x + width} y1={y - 50} x2={x + width} y2={y - 34} className="room-plan-dimension" />
    <text x={x + width / 2} y={y - 50} className="room-plan-label">{horizontalLabel}</text>
    <line x1={x - 42} y1={y} x2={x - 42} y2={y + depth} className="room-plan-dimension" />
    <line x1={x - 50} y1={y} x2={x - 34} y2={y} className="room-plan-dimension" />
    <line x1={x - 50} y1={y + depth} x2={x - 34} y2={y + depth} className="room-plan-dimension" />
    <text x={x - 55} y={y + depth / 2} className="room-plan-label vertical">{verticalLabel}</text>
  </>;
  const openingLabel = (cx, cy, text, selected) => (
    <g className={`room-opening-dimensions${selected ? ' selected' : ''}`} pointerEvents="none">
      <rect x={cx - 66} y={cy - 38} width="132" height="24" rx="5" />
      <text x={cx} y={cy - 22}>{text}</text>
    </g>
  );

  const renderPlan = () => {
    const { x, y, width, depth } = geometry;
    const wall = 18;
    const doorX = draft.flipH ? x + wall : x + width - wall;
    const doorPosition = draft.flipV ? 1 - (draft.doorPosition || .7) : draft.doorPosition || .7;
    const windowPosition = draft.flipH ? 1 - (draft.windowPosition || .42) : draft.windowPosition || .42;
    const doorY = y + depth * doorPosition;
    const windowY = draft.flipV ? y + depth - wall / 2 : y + wall / 2;
    const windowX = x + width * windowPosition;
    const windowWidth = Math.min(draft.windowW, displayWidth * .6);
    const windowHeight = Math.min(draft.windowH, draft.height * .58);
    const doorWidth = Math.min(draft.doorW, displayDepth * .4);
    const doorHeight = Math.min(draft.doorH, draft.height - .3);
    const windowLength = windowWidth * geometry.scale;
    const doorLength = Math.min(draft.doorW * geometry.scale, depth * .4);
    const horizontalLabel = formatLength(displayWidth, unit);
    const verticalLabel = formatLength(displayDepth, unit);
    return <>
      <defs>
        <pattern id="oak-planks" width="72" height="40" patternUnits="userSpaceOnUse">
          <rect width="72" height="40" fill="#c69a68" />
          <path d="M0 0h72v19H0zM0 21h36v19H0zM38 21h34v19H38z" fill="#d2aa78" />
          <path d="M0 20h72M36 21v19M37 0v19" stroke="#9e754d" strokeWidth="1.2" opacity=".8" />
          <path d="M4 5h25m13 8h24M5 31h19m23-4h18" stroke="#e0bd8e" strokeWidth="1" opacity=".75" />
        </pattern>
      </defs>
      {dimensionLines(x, y, width, depth, horizontalLabel, verticalLabel)}
      <rect x={x - wall} y={y - wall} width={width + wall * 2} height={depth + wall * 2} fill="#171717" />
      <rect x={x - wall + 5} y={y - wall + 5} width={width + wall * 2 - 10} height={depth + wall * 2 - 10} fill={draft.wall} />
      <rect x={x} y={y} width={width} height={depth} fill="url(#oak-planks)" stroke="#eee9e1" strokeWidth="8" />
      <text x={x + width / 2} y={y + depth / 2} className="room-plan-area">{Math.round(draft.width * draft.depth)} sq ft</text>
      {side('n', x, y, x + width, y, 'ns-resize')}
      {side('s', x, y + depth, x + width, y + depth, 'ns-resize')}
      {side('w', x, y, x, y + depth, 'ew-resize')}
      {side('e', x + width, y, x + width, y + depth, 'ew-resize')}
      {[
        ['nw', x, y, 'nwse-resize'], ['ne', x + width, y, 'nesw-resize'],
        ['sw', x, y + depth, 'nesw-resize'], ['se', x + width, y + depth, 'nwse-resize'],
      ].map(([edges, cx, cy, cursor]) =>       <circle key={edges} data-edges={edges} cx={cx} cy={cy} r="7" className="room-plan-handle" style={{ cursor }} />)}
      {draft.window && <g data-opening="window" className="room-opening-drag">
        <rect x={windowX - windowLength / 2} y={windowY - 7} width={windowLength} height={14} className={selectedOpening === 'window' ? 'room-opening-shape selected' : 'room-opening-shape'} />
        <line x1={windowX} y1={windowY - 8} x2={windowX} y2={windowY + 8} stroke="#fff" strokeWidth="2" pointerEvents="none" />
        {openingLabel(windowX, windowY, `${formatLength(windowWidth, unit)} × ${formatLength(windowHeight, unit)}`, selectedOpening === 'window')}
      </g>}
      {draft.door && <g data-opening="door" className="room-opening-drag">
        <rect x={doorX - 7} y={doorY - doorLength / 2} width={14} height={doorLength} className={selectedOpening === 'door' ? 'room-opening-shape door selected' : 'room-opening-shape door'} />
        <circle cx={draft.flipH ? doorX - 1 : doorX + 1} cy={doorY} r="5" fill="#ae9a7f" pointerEvents="none" />
        {openingLabel(doorX + (draft.flipH ? 46 : -46), doorY, `${formatLength(doorWidth, unit)} × ${formatLength(doorHeight, unit)}`, selectedOpening === 'door')}
      </g>}
    </>;
  };

  const renderCeiling = () => {
    const lift = (draft.height - 9) * 12;
    const left = [130, 520];
    const back = [420, 380];
    const right = [690, 500];
    const front = [420, 670];
    const topLeft = [130, 320 - lift];
    const topBack = [420, 185 - lift];
    const topRight = [690, 300 - lift];
    const makeOpening = (position, openingWidth, openingHeight, wallLength, floorStart, floorEnd, topStart, topEnd, door) => {
      const half = clamp(openingWidth / (2 * wallLength), .035, .24);
      const centerT = clamp(position, half + .02, .98 - half);
      const start = centerT - half;
      const end = centerT + half;
      const interpolate = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const atHeight = (t, ratio) => {
        const top = interpolate(topStart, topEnd, t);
        const floor = interpolate(floorStart, floorEnd, t);
        return [top[0] + (floor[0] - top[0]) * ratio, top[1] + (floor[1] - top[1]) * ratio];
      };
      const heightRatio = clamp(openingHeight / draft.height, .1, .9);
      const topRatio = door ? 1 - heightRatio : .52 - heightRatio / 2;
      const bottomRatio = door ? .985 : .52 + heightRatio / 2;
      const points = [atHeight(start, topRatio), atHeight(end, topRatio), atHeight(end, bottomRatio), atHeight(start, bottomRatio)];
      const centroid = points.reduce((sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length], [0, 0]);
      return { points: points.map((point) => point.join(',')).join(' '), center: centroid };
    };
    const windowShape = makeOpening(
      draft.flipH ? 1 - (draft.windowPosition || .42) : draft.windowPosition || .42,
      Math.min(draft.windowW, draft.width * .6),
      Math.min(draft.windowH, draft.height * .58),
      draft.width, left, back, topLeft, topBack, false,
    );
    const doorShape = makeOpening(
      draft.flipV ? 1 - (draft.doorPosition || .7) : draft.doorPosition || .7,
      Math.min(draft.doorW, draft.depth * .4),
      Math.min(draft.doorH, draft.height - .3),
      draft.depth, back, right, topBack, topRight, true,
    );
    const windowWidth = Math.min(draft.windowW, draft.width * .6);
    const windowHeight = Math.min(draft.windowH, draft.height * .58);
    const doorWidth = Math.min(draft.doorW, draft.depth * .4);
    const doorHeight = Math.min(draft.doorH, draft.height - .3);
    return <>
      <defs>
        <pattern id="ceiling-oak-planks" width="72" height="40" patternUnits="userSpaceOnUse">
          <rect width="72" height="40" fill="#b68b5c" />
          <path d="M0 0h72v19H0zM0 21h36v19H0zM38 21h34v19H38z" fill="#cca373" />
          <path d="M0 20h72M36 21v19M37 0v19" stroke="#99734e" strokeWidth="1.2" />
        </pattern>
      </defs>
      <polygon points={`${left[0]},${left[1]} ${back[0]},${back[1]} ${back[0]},${topBack[1]} ${topLeft[0]},${topLeft[1]}`} fill={draft.wall} />
      <polygon points={`${back[0]},${back[1]} ${right[0]},${right[1]} ${topRight[0]},${topRight[1]} ${topBack[0]},${topBack[1]}`} fill={draft.wall} opacity=".92" />
      <polygon points={`${left[0]},${left[1]} ${back[0]},${back[1]} ${right[0]},${right[1]} ${front[0]},${front[1]}`} fill="url(#ceiling-oak-planks)" stroke="#f4f1eb" strokeWidth="10" />
      <polyline points={`${left[0]},${left[1]} ${back[0]},${back[1]} ${right[0]},${right[1]}`} fill="none" stroke="#f4f1eb" strokeWidth="8" />
      {draft.window && <g data-opening="window" className="room-opening-drag">
        <polygon points={windowShape.points} className={selectedOpening === 'window' ? 'room-opening-shape window selected' : 'room-opening-shape window'} />
        {openingLabel(windowShape.center[0], windowShape.center[1], `${formatLength(windowWidth, unit)} × ${formatLength(windowHeight, unit)}`, selectedOpening === 'window')}
      </g>}
      {draft.door && <g data-opening="door" className="room-opening-drag">
        <polygon points={doorShape.points} className={selectedOpening === 'door' ? 'room-opening-shape door selected' : 'room-opening-shape door'} />
        <circle cx={doorShape.center[0] + 12} cy={doorShape.center[1]} r="4" fill="#9b7e56" pointerEvents="none" />
        {openingLabel(doorShape.center[0], doorShape.center[1], `${formatLength(doorWidth, unit)} × ${formatLength(doorHeight, unit)}`, selectedOpening === 'door')}
      </g>}
      <polyline points={`${topLeft[0]},${topLeft[1]} ${topBack[0]},${topBack[1]} ${topRight[0]},${topRight[1]}`} className="ceiling-outline" />
      <polyline points={`${topLeft[0]},${topLeft[1]} ${topBack[0]},${topBack[1]} ${topRight[0]},${topRight[1]}`} data-edges="top" className="room-plan-hit ceiling-handle" />
      {[topLeft, topBack, topRight].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r="8" data-edges="top" className="room-plan-height-handle" />)}
      <line x1={right[0] + 32} y1={topRight[1]} x2={right[0] + 32} y2={right[1]} className="room-plan-dimension" />
      <line x1={right[0] + 24} y1={topRight[1]} x2={right[0] + 40} y2={topRight[1]} className="room-plan-dimension" />
      <line x1={right[0] + 24} y1={right[1]} x2={right[0] + 40} y2={right[1]} className="room-plan-dimension" />
      <text x={right[0] + 48} y={(topRight[1] + right[1]) / 2} className="room-plan-label vertical">{formatLength(draft.height, unit)}</text>
    </>;
  };

  const goNext = () => {
    if (step < 3) setStep((current) => current + 1);
    else onApply(draft);
  };

  return (
    <div className="room-editor-screen" role="dialog" aria-modal="true" aria-labelledby="room-editor-title">
      <aside className="room-editor-sidebar">
        <div className="room-editor-content">
          <p className="room-editor-step">Step {step} of 3</p>
          <div className="room-editor-progress" aria-hidden="true">
            {[1, 2, 3].map((item) => <i key={item} className={item <= step ? 'on' : ''} />)}
          </div>
          <h2 id="room-editor-title">{step === 1 ? 'Edit room dimensions' : step === 2 ? 'Add openings and wall finish' : 'Review your room'}</h2>
          {step === 1 ? <>
            <p>Click and drag each wall to adjust the dimensions of your floor plan.</p>
            <p>Drag a door or window along its wall. Select it to view its dimensions.</p>
            <p>Toggle to ceiling height. Click and drag the top of the walls up or down to adjust their height.</p>
            <svg className="room-editor-demo" viewBox="0 0 260 130" aria-hidden="true">
              <rect x="50" y="16" width="170" height="98" fill="#f3f3f1" stroke="#111" strokeWidth="4" />
              <line x1="50" y1="16" x2="50" y2="114" stroke="#ffd200" strokeWidth="5" />
              {[['50', '16'], ['50', '114'], ['220', '16'], ['220', '114']].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="#fff" stroke="#111" />)}
              <path d="M28 65h14M28 65l5-4M28 65l5 4M72 65h-14M72 65l-5-4M72 65l-5 4" stroke="#111" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
            <div className="room-editor-row">
              <strong>Unit</strong>
              <div className="room-editor-segment" role="group" aria-label="Room dimension units">
                <button aria-pressed={unit === 'ft'} onClick={() => setUnit('ft')}>ft / in</button>
                <button aria-pressed={unit === 'cm'} onClick={() => setUnit('cm')}>cm</button>
              </div>
            </div>
            <h3>Room orientation</h3>
            <button className="room-editor-action" aria-pressed={Boolean(draft.flipH)} onClick={() => updateDraft({ flipH: !draft.flipH })}><span aria-hidden="true">⇋</span> Flip horizontal</button>
            <button className="room-editor-action" aria-pressed={Boolean(draft.flipV)} onClick={() => updateDraft({ flipV: !draft.flipV })}><span aria-hidden="true">⇅</span> Flip vertical</button>
            <button className="room-editor-action" onClick={() => updateDraft({ rotation: ((draft.rotation || 0) + 1) % 4 })}><span aria-hidden="true">↻</span> Rotate 90°</button>
          </> : step === 2 ? <>
            <p>Your choices can be changed later.</p>
            <h3>Room features</h3>
            <label className="room-editor-check"><input type="checkbox" checked={draft.door} onChange={(event) => updateDraft({ door: event.target.checked })} /> Add an interior door</label>
            {draft.door && <div className="room-editor-fields two">
              <label>Door width (ft)<input type="number" min="2" max="6" step="0.1" value={draft.doorW} onChange={(event) => updateDraft({ doorW: Number(event.target.value) })} /></label>
              <label>Door height (ft)<input type="number" min="5" max="9" step="0.1" value={draft.doorH} onChange={(event) => updateDraft({ doorH: Number(event.target.value) })} /></label>
            </div>}
            <label className="room-editor-check"><input type="checkbox" checked={draft.window} onChange={(event) => updateDraft({ window: event.target.checked })} /> Add a glass window</label>
            {draft.window && <div className="room-editor-fields two">
              <label>Window width (ft)<input type="number" min="2" max="12" step="0.1" value={draft.windowW} onChange={(event) => updateDraft({ windowW: Number(event.target.value) })} /></label>
              <label>Window height (ft)<input type="number" min="1" max="8" step="0.1" value={draft.windowH} onChange={(event) => updateDraft({ windowH: Number(event.target.value) })} /></label>
            </div>}
            <h3>Wall color</h3>
            <div className="room-editor-swatches">{wallColors.map(([name, color]) => <button key={color} type="button" title={name} aria-label={name} aria-pressed={draft.wall === color} style={{ '--swatch': color }} className={draft.wall === color ? 'active' : ''} onClick={() => updateDraft({ wall: color })} />)}</div>
          </> : <>
            <p>Review your room setup before applying the changes.</p>
            <dl className="room-editor-summary">
              <div><dt>Room size</dt><dd>{formatLength(draft.width, unit)} × {formatLength(draft.depth, unit)}</dd></div>
              <div><dt>Ceiling height</dt><dd>{formatLength(draft.height, unit)}</dd></div>
              <div><dt>Interior door</dt><dd>{draft.door ? 'Added' : 'Not added'}</dd></div>
              <div><dt>Glass window</dt><dd>{draft.window ? 'Added' : 'Not added'}</dd></div>
              <div><dt>Wall color</dt><dd><span className="room-editor-color" style={{ '--wall-color': draft.wall }} />{wallColors.find(([, color]) => color === draft.wall)?.[0] || 'Custom'}</dd></div>
            </dl>
          </>}
        </div>
        <footer className="room-editor-footer">
          {step > 1 && <button className="room-editor-back" onClick={() => setStep((current) => current - 1)}>Back</button>}
          <button className="room-editor-next" onClick={goNext}>{step === 3 ? 'Apply to room' : 'Next'}</button>
        </footer>
      </aside>
      <section className="room-editor-stage" aria-label="Room plan preview">
        <div className="room-editor-pill left">
          <button onClick={undo} aria-label="Undo" disabled={!past.length}>↶</button>
          <button onClick={redo} aria-label="Redo" disabled={!future.length}>↷</button>
        </div>
        <div className="room-editor-pill center">
          <button aria-pressed={mode === 'plan'} onClick={() => setMode('plan')}>Floor plan</button>
          <button aria-pressed={mode === 'ceiling'} onClick={() => setMode('ceiling')}>Ceiling height</button>
        </div>
        <div className="room-editor-pill right">
          <button onClick={onClose} aria-label="Close room editor">×</button>
        </div>
        <svg
          ref={svgRef}
          className="room-editor-plan"
          viewBox="0 0 800 720"
          preserveAspectRatio="xMidYMid meet"
          aria-label={mode === 'plan' ? 'Room floor plan. Drag a wall to resize it.' : 'Room wall elevation. Drag the top wall to change ceiling height.'}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {mode === 'plan' ? renderPlan() : renderCeiling()}
        </svg>
      </section>
    </div>
  );
}

export default RoomEditor;
