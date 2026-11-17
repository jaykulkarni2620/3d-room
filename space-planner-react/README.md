# Siaan Space Planner · React build

React + Vite + React Three Fiber + Drei implementation of the Siaan room planner. It reads products and GLB model URLs from the existing WordPress endpoint at `/wp-json/siaan-planner/v1/products`.

## Local development

```bash
npm install
npm run dev
```

For local development against the test WordPress catalog, copy `.env.example` to `.env.local`. The Vite development server proxies `/wp-json` to the configured `VITE_WP_ORIGIN`.

## Production build and WordPress embed

```bash
npm run build
```

Upload **the contents of `dist/`** to a folder on the same WordPress domain, for example `/space-planner/`. Keep the generated `assets/` folder alongside `index.html`; Vite's relative asset paths are configured for this setup.

Embed the planner with a WPCode HTML snippet or Elementor HTML block:

```html
<iframe
  src="https://test.siaanglobal.com/space-planner/index.html"
  title="Siaan Global Space Planner"
  style="width:100%;height:900px;border:0;display:block"
  loading="lazy">
</iframe>
```

When the planner is served from the same WordPress domain as the REST endpoint, no extra API proxy or Node.js production server is needed. If the domain changes, update the iframe URL; the catalog endpoint remains same-origin.

## Rendering notes

- The room uses a procedural warm-oak albedo, normal, and roughness map.
- Studio environment lighting is built from Drei lightformers, with ACES tone mapping, a directional soft-shadow light, and floor contact shadows.
- Product GLB models are loaded from the product endpoint; a simple preview mesh is used while a model loads or when the product has no GLB.
- Room walls receive no shadows cast by the walls themselves; floor and product shadows remain enabled.
