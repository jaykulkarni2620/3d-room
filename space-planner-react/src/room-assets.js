import * as THREE from 'three';

const oakColors = ['#927353', '#9a7957', '#a17f5d', '#947252', '#a48260', '#997657', '#a2805d', '#916f51', '#9d7958', '#a58360', '#957353', '#9c7958'];

export function makeOakMaps(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rng = (() => { let seed = 138912; return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const rows = 12;
  const rowHeight = size / rows;

  for (let row = 0; row < rows; row += 1) {
    const y = row * rowHeight;
    let x = 0;
    while (x < size) {
      const plankWidth = Math.min(size - x, size * (0.19 + rng() * 0.22));
      const base = oakColors[Math.floor(rng() * oakColors.length)];
      ctx.fillStyle = base;
      ctx.fillRect(x, y, plankWidth, rowHeight);
      const sheen = ctx.createLinearGradient(0, y, 0, y + rowHeight);
      sheen.addColorStop(0, 'rgba(255,239,211,.12)');
      sheen.addColorStop(.22, 'rgba(255,239,211,.02)');
      sheen.addColorStop(.86, 'rgba(43,27,16,.025)');
      sheen.addColorStop(1, 'rgba(35,23,15,.17)');
      ctx.fillStyle = sheen;
      ctx.fillRect(x, y, plankWidth, rowHeight);
      for (let line = 0; line < 20; line += 1) {
        const grainY = y + rng() * rowHeight;
        const amplitude = 1 + rng() * 3;
        ctx.strokeStyle = rng() > .5 ? 'rgba(65,39,22,.10)' : 'rgba(255,231,197,.13)';
        ctx.lineWidth = .5 + rng() * .7;
        ctx.beginPath();
        ctx.moveTo(x, grainY);
        ctx.bezierCurveTo(x + plankWidth * .25, grainY + (rng() - .5) * amplitude, x + plankWidth * .68, grainY + (rng() - .5) * amplitude, x + plankWidth, grainY);
        ctx.stroke();
      }
      if (rng() > .64) {
        const knotX = x + plankWidth * (.2 + rng() * .6);
        const knotY = y + rowHeight * (.3 + rng() * .4);
        ctx.strokeStyle = 'rgba(62,39,24,.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(knotX, knotY, 5 + rng() * 7, 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(28,20,14,.31)';
      ctx.fillRect(x, y, plankWidth, 1.5);
      ctx.fillRect(x, y, 1.4, rowHeight);
      ctx.fillStyle = 'rgba(255,235,205,.34)';
      ctx.fillRect(x + 1.5, y + 1.5, Math.max(0, plankWidth - 2), 1);
      ctx.fillRect(x + 1.5, y + 1.5, 1, rowHeight - 2);
      x += plankWidth;
    }
  }

  const albedo = new THREE.CanvasTexture(canvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
  albedo.anisotropy = 8;

  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  normalCanvas.width = normalCanvas.height = roughCanvas.width = roughCanvas.height = size;
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const normalCtx = normalCanvas.getContext('2d');
  const roughCtx = roughCanvas.getContext('2d');
  const normals = normalCtx.createImageData(size, size);
  const roughness = roughCtx.createImageData(size, size);
  const lum = (px, py) => {
    const ix = (Math.max(0, Math.min(size - 1, py)) * size + Math.max(0, Math.min(size - 1, px))) * 4;
    return pixels[ix] * .2126 + pixels[ix + 1] * .7152 + pixels[ix + 2] * .0722;
  };
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const i = (py * size + px) * 4;
      normals.data[i] = 128 - (lum(px + 1, py) - lum(px - 1, py)) * .42;
      normals.data[i + 1] = 128 - (lum(px, py + 1) - lum(px, py - 1)) * .42;
      normals.data[i + 2] = 250;
      normals.data[i + 3] = 255;
      const r = Math.max(178, Math.min(232, 216 + (128 - lum(px, py)) * .09));
      roughness.data[i] = roughness.data[i + 1] = roughness.data[i + 2] = r;
      roughness.data[i + 3] = 255;
    }
  }
  normalCtx.putImageData(normals, 0, 0);
  roughCtx.putImageData(roughness, 0, 0);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  [normalMap, roughnessMap].forEach((texture) => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
  });
  return { albedo, normalMap, roughnessMap };
}
