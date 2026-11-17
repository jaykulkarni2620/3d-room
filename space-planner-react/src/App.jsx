import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Bounds, ContactShadows, Environment, Lightformer, OrbitControls, useGLTF } from '@react-three/drei';
import { ErrorBoundary } from 'react-error-boundary';
import * as THREE from 'three';
import { makeOakMaps } from './room-assets.js';

const API = import.meta.env.VITE_CATALOG_ENDPOINT || '/wp-json/siaan-planner/v1/products';
const presets = [
  ['Neutral standard', 247], ['Open spacious', 473], ['Bright spacious', 279],
  ['Cozy contemporary', 192], ['Warm contemporary', 172], ['Peaceful hideaway', 164],
  ['Refreshing oasis', 226], ['Inviting fresh', 226], ['Urban studio', 167],
  ['Single dorm', 118], ['Double dorm', 204], ['Vivid contemporary', 226],
  ['Cool brushed', 247], ['Bright contemporary', 166], ['Wood retreat', 166],
];
const wallColors = [
  ['Warm white', '#eeeae3'], ['Linen', '#e2d9ca'], ['Blush clay', '#dfcabd'],
  ['Burnt orange', '#b8622a'], ['Terracotta', '#9a5646'], ['Mist blue', '#b9c8ce'],
  ['Ivory cream', '#f1e8d2'], ['Pale sage', '#cfd8c4'], ['Powder blue', '#d0e0e9'],
  ['Dusty rose', '#c99c9b'], ['Charcoal', '#4b4e51'], ['Midnight navy', '#30455a'],
];
const money = (value, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value || 0);

function normalizeProduct(raw) {
  const dims = raw.dimensions_cm || {};
  const categories = Array.isArray(raw.categories) ? raw.categories.map((item) => typeof item === 'string' ? item : item.name).filter(Boolean) : [];
  return {
    id: String(raw.id), name: raw.name, price: Number(raw.price) || 0, currency: raw.currency || 'INR',
    image: raw.image || '', sku: raw.sku || '', categories,
    category: raw.planner_category || categories[0] || 'Other',
    widthCm: Number(dims.width) || 86, depthCm: Number(dims.length) || 80, heightCm: Number(dims.height) || 79,
    modelKey: raw.model_key || 'chair', modelUrl: raw.model_url || '', permalink: raw.permalink || '',
  };
}

function App() {
  const [step, setStep] = useState(1);
  const [preset, setPreset] = useState(presets[0]);
  const [room, setRoom] = useState({ width: 17.9, depth: 13.8, height: 9, wall: '#eeeae3', window: true, door: true, windowW: 4.8, windowH: 3.5, doorW: 3, doorH: 6.8 });
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [catalogState, setCatalogState] = useState('Connecting to store…');
  const [currency, setCurrency] = useState('INR');
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('angle');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}?per_page=80&page=1`, { headers: { Accept: 'application/json' }, signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(`Catalog request failed (${response.status})`); return response.json(); })
      .then((data) => {
        const rows = Array.isArray(data.products) ? data.products.map(normalizeProduct) : [];
        setProducts(rows);
        const cats = [...new Set(rows.map((product) => product.category))].sort((a, b) => a.localeCompare(b));
        setCategories(cats);
        setCategory(cats[0] || '');
        setCurrency(data.currency || 'INR');
        setCatalogState(`${rows.length} store products`);
      })
      .catch((error) => { if (error.name !== 'AbortError') setCatalogState('Store catalog unavailable · check planner endpoint'); });
    return () => controller.abort();
  }, []);

  const visibleProducts = useMemo(() => products.filter((product) => (!category || product.category === category)
    && `${product.name} ${product.sku} ${product.categories.join(' ')}`.toLowerCase().includes(search.toLowerCase())), [products, category, search]);
  const total = items.reduce((sum, item) => sum + (products.find((product) => product.id === item.productId)?.price || 0), 0);
  const countById = items.reduce((counts, item) => ({ ...counts, [item.productId]: (counts[item.productId] || 0) + 1 }), {});

  const addProduct = useCallback((product) => {
    const next = { id: crypto.randomUUID(), productId: product.id, x: (items.length % 3 - 1) * 2.1, z: Math.floor(items.length / 3) * 1.8, rotation: 0 };
    setItems((current) => [...current, next]);
    setSelected(next.id);
  }, [items.length]);
  const updateItem = useCallback((id, patch) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)), []);
  const removeSelected = () => { setItems((current) => current.filter((item) => item.id !== selected)); setSelected(null); };
  const startOver = () => { setItems([]); setSelected(null); setStep(1); };
  const next = () => setStep((current) => Math.min(4, current + 1));
  const back = () => setStep((current) => Math.max(1, current - 1));

  return (
    <main className="app-shell">
      <header className="hero">
        <div><p className="eyebrow">SIAAN GLOBAL · INTERIOR STUDIO</p><h1>Plan a space that feels like home.</h1></div>
        <p className="hero-copy">Choose a room plan, explore your space in 3D, and build an itemized estimate from the live store catalog.</p>
      </header>
      <nav className="steps" aria-label="Planner steps">
        {['Space type', 'Size', 'Your area', 'Design'].map((label, index) => <button key={label} className={step === index + 1 ? 'current' : step > index + 1 ? 'done' : ''} onClick={() => step > index + 1 && setStep(index + 1)}><span>{index + 1}</span>{label}</button>)}
      </nav>

      {step < 4 ? <section className="wizard panel">
        <div className="panel-title"><div><p className="eyebrow">STEP {step} OF 4</p><h2>{step === 1 ? 'Choose your room inspiration' : step === 2 ? 'Set your room size' : 'Add openings and wall finish'}</h2></div><span className="step-note">Your choices can be changed later</span></div>
        {step === 1 && <><div className="space-switch"><button className="chosen">Residential</button><button disabled>Commercial</button><button disabled>Hospitality</button></div><div className="preset-grid">{presets.map((item) => <button key={item[0]} className={`preset-card ${preset[0] === item[0] ? 'selected' : ''}`} onClick={() => { setPreset(item); setRoom((current) => ({ ...current, width: Math.round(Math.sqrt(item[1] * 1.3) * 10) / 10, depth: Math.round(Math.sqrt(item[1] / 1.3) * 10) / 10 })); }}><span className="preset-image"><RoomThumb /></span><strong>{item[0]}</strong><small>{item[1]} sq.ft</small><span className="hover-cta">✎ Design this room</span></button>)}</div></>}
        {step === 2 && <div className="size-form"><label>Room width <span>ft</span><input type="number" min="5" max="80" step="0.1" value={room.width} onChange={(e) => setRoom({ ...room, width: Number(e.target.value) })} /></label><label>Room length <span>ft</span><input type="number" min="5" max="80" step="0.1" value={room.depth} onChange={(e) => setRoom({ ...room, depth: Number(e.target.value) })} /></label><label>Ceiling height <span>ft</span><input type="number" min="7" max="20" step="0.1" value={room.height} onChange={(e) => setRoom({ ...room, height: Number(e.target.value) })} /></label><div className="area-preview"><span>Approximate area</span><strong>{Math.round(room.width * room.depth)} sq.ft</strong><small>Adjust the dimensions to match your room.</small></div></div>}
        {step === 3 && <div className="feature-grid"><section><h3>Room features</h3><label className="toggle"><input type="checkbox" checked={room.door} onChange={(e) => setRoom({ ...room, door: e.target.checked })} /> Add an interior door</label>{room.door && <div className="pair-fields"><label>Door width (ft)<input type="number" min="2" max="6" step="0.1" value={room.doorW} onChange={(e) => setRoom({ ...room, doorW: Number(e.target.value) })} /></label><label>Door height (ft)<input type="number" min="5" max="9" step="0.1" value={room.doorH} onChange={(e) => setRoom({ ...room, doorH: Number(e.target.value) })} /></label></div>}<label className="toggle"><input type="checkbox" checked={room.window} onChange={(e) => setRoom({ ...room, window: e.target.checked })} /> Add a glass window</label>{room.window && <div className="pair-fields"><label>Window width (ft)<input type="number" min="2" max="12" step="0.1" value={room.windowW} onChange={(e) => setRoom({ ...room, windowW: Number(e.target.value) })} /></label><label>Window height (ft)<input type="number" min="1" max="8" step="0.1" value={room.windowH} onChange={(e) => setRoom({ ...room, windowH: Number(e.target.value) })} /></label></div>}</section><section><h3>Wall color</h3><div className="wall-swatches">{wallColors.map(([name, color]) => <button key={color} title={name} aria-label={name} className={room.wall === color ? 'active' : ''} style={{ '--swatch': color }} onClick={() => setRoom({ ...room, wall: color })} />)}</div></section></div>}
        <footer className="wizard-footer"><button className="btn secondary" onClick={back} disabled={step === 1}>Back</button><button className="btn primary" onClick={next}>{step === 3 ? 'Design this room' : 'Next'}</button></footer>
      </section> : <>
        <div className="builder-meta"><div><span>{preset[0]}</span><span>/</span><span>{Math.round(room.width * room.depth)} sq.ft assigned</span></div><button className="btn secondary compact" onClick={startOver}>Start over</button></div>
        <section className="builder">
          <aside className="catalog panel">
            <div className="catalog-head"><strong>Shop the catalog</strong><small role="status">{catalogState}</small></div>
            <input className="search" placeholder="Search furniture" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="category-tabs">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="product-list">{visibleProducts.map((product) => <button className="product-card" key={product.id} onClick={() => addProduct(product)}><img src={product.image} alt="" loading="lazy" /><span><strong>{product.name}</strong><small>{Math.round(product.widthCm)} × {Math.round(product.depthCm)} cm</small><b>{money(product.price, currency)}</b></span></button>)}{!visibleProducts.length && <p className="empty">No products match this search.</p>}</div>
          </aside>
          <div className="stage-column">
            <div className="canvas-wrap">
              <div className="stage-controls"><button className={view === 'angle' ? 'active' : ''} onClick={() => setView('angle')}>Angle view</button><button className={view === 'top' ? 'active' : ''} onClick={() => setView('top')}>Top view</button><button onClick={removeSelected} disabled={!selected}>Remove selected</button></div>
              <Canvas shadows dpr={[1, 1.75]} camera={{ position: [room.width * .88, room.height * .9, room.depth * 1.05], fov: 38 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, outputColorSpace: THREE.SRGBColorSpace }}>
                <color attach="background" args={['#e8e6e0']} />
                <RoomScene room={room} items={items} products={products} selected={selected} onSelect={setSelected} onUpdate={updateItem} dragging={dragging} setDragging={setDragging} view={view} />
              </Canvas>
              <p className="canvas-hint">Drag furniture to move · drag empty space to look around · scroll to zoom</p>
            </div>
            <section className="estimate panel"><div className="estimate-head"><div><p className="eyebrow">LIVE ESTIMATE</p><h2>Your design</h2></div><span>{items.length} {items.length === 1 ? 'item' : 'items'}</span></div>{items.length ? <div className="estimate-list">{Object.entries(countById).map(([productId, count]) => { const product = products.find((entry) => entry.id === productId); return product && <div className="estimate-row" key={productId}><span><strong>{product.name}</strong><small>{money(product.price, currency)} each</small></span><div className="qty"><button onClick={() => setItems((current) => { const found = current.find((entry) => entry.productId === productId); return found ? current.filter((entry) => entry.id !== found.id) : current; })}>−</button><span>{count}</span><button onClick={() => addProduct(product)}>+</button></div><b>{money(product.price * count, currency)}</b></div>; })}<div className="total-row"><span>Estimated total</span><strong>{money(total, currency)}</strong></div></div> : <p className="empty">Add products to the room to see your itemized estimate.</p>}</section>
          </div>
        </section>
      </>}
    </main>
  );
}

function RoomThumb() {
  return <svg viewBox="0 0 180 100" aria-hidden="true"><path d="M20 37 91 15l68 24-70 44z" fill="#b58f69"/><path d="M20 37v39l69 22V83z" fill="#e7e1d7"/><path d="M89 83v15l70-27V39z" fill="#d6d0c7"/><path d="m42 43 49-16 45 16-47 17z" fill="#c7d0c7" opacity=".75"/><path d="M73 60v18M104 57v21M44 43v20" stroke="#fff" strokeWidth="2" opacity=".8"/></svg>;
}

function RoomScene({ room, items, products, selected, onSelect, onUpdate, dragging, setDragging, view }) {
  const maps = useMemo(() => makeOakMaps(), []);
  useEffect(() => {
    [maps.albedo, maps.normalMap, maps.roughnessMap].forEach((texture) => texture.repeat.set(room.width / 7, room.depth / 7));
  }, [maps, room.width, room.depth]);
  useEffect(() => () => { maps.albedo.dispose(); maps.normalMap.dispose(); maps.roughnessMap.dispose(); }, [maps]);
  return <>
    <ambientLight intensity={0.38} color="#fff8ee" />
    <hemisphereLight args={['#fffaf1', '#9b8f7d', 0.85]} />
    <directionalLight position={[room.width * .45, room.height * 1.8, room.depth * .35]} intensity={2.2} color="#fff3e2" castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-room.width} shadow-camera-right={room.width} shadow-camera-top={room.depth} shadow-camera-bottom={-room.depth} shadow-bias={-0.0002} shadow-normalBias={0.025} />
    <Environment resolution={128}>
      <Lightformer form="rect" intensity={2.4} color="#fff2dd" position={[-5, 7, 3]} scale={[8, 5, 1]} />
      <Lightformer form="rect" intensity={1.3} color="#f6f5f1" position={[5, 5, -4]} scale={[7, 4, 1]} />
      <Lightformer form="rect" intensity={.7} color="#fff8ee" position={[0, 3, 8]} scale={[5, 3, 1]} />
    </Environment>
    <group position={[0, -.04, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[room.width, room.depth]} />
        <meshPhysicalMaterial map={maps.albedo} normalMap={maps.normalMap} roughnessMap={maps.roughnessMap} roughness={.76} normalScale={new THREE.Vector2(.22, .22)} clearcoat={.08} clearcoatRoughness={.8} />
      </mesh>
      <mesh position={[0, -.26, 0]} receiveShadow><boxGeometry args={[room.width + .35, .42, room.depth + .35]} /><meshStandardMaterial color="#cfc8bd" roughness={.9} /></mesh>
      <RoomWall position={[0, room.height / 2, -room.depth / 2]} size={[room.width, room.height, .22]} color={room.wall} />
      <RoomWall position={[-room.width / 2, room.height / 2, 0]} size={[.22, room.height, room.depth]} color={room.wall} />
      <RoomWall position={[room.width / 2, room.height / 2, 0]} size={[.22, room.height, room.depth]} color={room.wall} />
      <Baseboard position={[0, .12, -room.depth / 2 + .12]} size={[room.width, .22, .16]} />
      <Baseboard position={[-room.width / 2 + .12, .12, 0]} size={[.16, .22, room.depth]} />
      <Baseboard position={[room.width / 2 - .12, .12, 0]} size={[.16, .22, room.depth]} />
      {room.window && <WindowFeature room={room} />}
      {room.door && <DoorFeature room={room} />}
      <ContactShadows position={[0, .012, 0]} opacity={.32} scale={[room.width * 1.25, room.depth * 1.25]} blur={2.8} far={10} resolution={512} color="#5d4b38" frames={dragging ? Infinity : 1} />
      <SuspenseFallbackBoundary>
        {items.map((item) => { const product = products.find((entry) => entry.id === item.productId); return product && <ProductInstance key={item.id} item={item} product={product} room={room} selected={selected === item.id} onSelect={() => onSelect(item.id)} onUpdate={onUpdate} setDragging={setDragging} />; })}
      </SuspenseFallbackBoundary>
    </group>
    <OrbitControls makeDefault enabled={!dragging} minPolarAngle={.12} maxPolarAngle={Math.PI / 2.03} target={[0, 2.2, 0]} enableDamping dampingFactor={.08} maxDistance={Math.max(room.width, room.depth) * 2.8} minDistance={4} />
    <ViewCamera view={view} room={room} />
  </>;
}

function RoomWall({ position, size, color }) { return <mesh position={position} receiveShadow castShadow={false}><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={.9} /></mesh>; }
function Baseboard({ position, size }) { return <mesh position={position} castShadow={false}><boxGeometry args={size} /><meshStandardMaterial color="#f4f1eb" roughness={.78} /></mesh>; }

function WindowFeature({ room }) {
  const width = Math.min(room.windowW, room.width * .6), height = Math.min(room.windowH, room.height * .58), y = Math.min(room.height * .61, room.height - height / 2 - .3);
  return <group position={[0, y, -room.depth / 2 + .13]}>
    <mesh castShadow={false}><boxGeometry args={[width + .18, height + .18, .16]} /><meshStandardMaterial color="#faf8f2" roughness={.65} /></mesh>
    <mesh position={[0, 0, .09]}><boxGeometry args={[width, height, .035]} /><meshPhysicalMaterial color="#a7d0dc" roughness={.13} metalness={.05} transmission={.16} transparent opacity={.78} /></mesh>
    <mesh position={[0, 0, .12]}><boxGeometry args={[.045, height, .025]} /><meshStandardMaterial color="#f7f5ef" /></mesh>
    <mesh position={[0, 0, .12]}><boxGeometry args={[width, .045, .025]} /><meshStandardMaterial color="#f7f5ef" /></mesh>
  </group>;
}

function DoorFeature({ room }) {
  const width = Math.min(room.doorW, room.depth * .4), height = Math.min(room.doorH, room.height - .3);
  return <group position={[room.width / 2 - .105, height / 2, -room.depth * .22]} rotation={[0, Math.PI / 2, 0]}>
    <mesh castShadow><boxGeometry args={[width + .17, height + .16, .14]} /><meshStandardMaterial color="#f6f3ed" roughness={.7} /></mesh>
    <mesh position={[0, 0, .09]} castShadow><boxGeometry args={[width, height, .07]} /><meshStandardMaterial color="#eeeae3" roughness={.76} /></mesh>
    <mesh position={[width * .36, 0, .14]}><sphereGeometry args={[.065, 16, 12]} /><meshStandardMaterial color="#9b7e56" metalness={.72} roughness={.3} /></mesh>
  </group>;
}

function ViewCamera({ view, room }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    const target = new THREE.Vector3(0, 2, 0);
    if (view === 'top') camera.position.set(0, Math.max(room.width, room.depth) * 1.45, .01);
    else camera.position.set(room.width * .88, room.height * .9, room.depth * 1.05);
    camera.lookAt(target);
    if (controls) { controls.target.copy(target); controls.update(); }
  }, [view, room.width, room.depth, room.height, camera, controls]);
  return null;
}

function ProductInstance({ item, product, room, selected, onSelect, onUpdate, setDragging }) {
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const handleDown = (event) => { event.stopPropagation(); onSelect(); setDragging(true); event.target.setPointerCapture?.(event.pointerId); };
  const handleMove = (event) => {
    if (event.buttons !== 1) return;
    event.stopPropagation();
    const point = new THREE.Vector3();
    if (event.ray.intersectPlane(plane, point)) onUpdate(item.id, { x: THREE.MathUtils.clamp(point.x, -room.width / 2 + product.widthCm / 60.96, room.width / 2 - product.widthCm / 60.96), z: THREE.MathUtils.clamp(point.z, -room.depth / 2 + product.depthCm / 60.96, room.depth / 2 - product.depthCm / 60.96) });
  };
  const width = product.widthCm / 30.48, depth = product.depthCm / 30.48, height = product.heightCm / 30.48;
  return <group position={[item.x, 0, item.z]} rotation={[0, item.rotation, 0]} onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
    <ErrorBoundary FallbackComponent={() => <FallbackProduct product={product} size={[width, height, depth]} />}>
      {product.modelUrl ? <Suspense fallback={<FallbackProduct product={product} size={[width, height, depth]} />}><GLBProduct url={product.modelUrl} size={[width, height, depth]} /></Suspense> : <FallbackProduct product={product} size={[width, height, depth]} />}
    </ErrorBoundary>
    {selected && <mesh position={[0, height / 2, 0]}><boxGeometry args={[width + .12, height + .12, depth + .12]} /><meshBasicMaterial color="#ffd400" wireframe transparent opacity={.9} depthTest={false} /></mesh>}
  </group>;
}

function GLBProduct({ url, size }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);
  const box = useMemo(() => new THREE.Box3().setFromObject(model), [model]);
  const dimensions = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = [size[0] / dimensions.x, size[1] / dimensions.y, size[2] / dimensions.z];
  return <group scale={scale}><primitive object={model} position={[-center.x, -box.min.y, -center.z]} /></group>;
}

function FallbackProduct({ product, size }) {
  const isTable = /table|desk|counter|cabinet|rack|stand/i.test(`${product.name} ${product.category}`);
  const isSofa = /sofa|couch|loveseat/i.test(`${product.name} ${product.category}`);
  const body = isTable ? '#8d6748' : isSofa ? '#a89b8b' : '#d5cec2';
  const leg = '#4b4035';
  return <group scale={size}>
    {isTable ? <>
      <mesh position={[0, .68, 0]} castShadow receiveShadow><boxGeometry args={[.96, .12, .92]} /><meshStandardMaterial color={body} roughness={.64} /></mesh>
      {[-.4, .4].flatMap((x) => [-.38, .38].map((z) => <mesh key={`${x}-${z}`} position={[x, .33, z]} castShadow><boxGeometry args={[.075, .66, .075]} /><meshStandardMaterial color={leg} roughness={.7} /></mesh>))}
    </> : <>
      <mesh position={[0, .42, .02]} castShadow receiveShadow><boxGeometry args={[.9, .14, .75]} /><meshStandardMaterial color={body} roughness={.88} /></mesh>
      <mesh position={[0, .73, -.31]} castShadow receiveShadow><boxGeometry args={[.9, .53, .12]} /><meshStandardMaterial color={body} roughness={.9} /></mesh>
      {[-.39, .39].flatMap((x) => [-.28, .31].map((z) => <mesh key={`${x}-${z}`} position={[x, .2, z]} castShadow><boxGeometry args={[.065, .4, .065]} /><meshStandardMaterial color={leg} roughness={.72} /></mesh>))}
    </>}
  </group>;
}

function SuspenseFallbackBoundary({ children }) { return <Suspense fallback={null}>{children}</Suspense>; }

export default App;
