import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Plugin to remove crossorigin from stylesheet links (fixes Electron file:// protocol)
function removeStylesheetCrossorigin() {
  return {
    name: 'remove-stylesheet-crossorigin',
    transformIndexHtml(html: string) {
      return html.replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"');
    },
  };
}

/** Vendor chunk for a node_modules id; undefined lets the bundler split it along dynamic imports. */
function vendorChunk(id: string): string | undefined {
  // `?url` imports (pdf.worker) are just a URL string: grouping them with pdfjs-dist would load all of pdf.js at startup.
  if (id.includes('?url')) return undefined;
  if (id.includes('node_modules')) {
    if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
    // dompurify is shared (jspdf loads it too): its own small chunk so the lazy mermaid chunk does not drag it into the PDF export path.
    if (/node_modules[\\/]dompurify[\\/]/.test(id)) return 'dompurify-vendor';
    // Chat renderer (mermaid, KaTeX, markdown): no manual chunk, so the bundler splits it along the
    // dynamic imports and it loads on demand (first AI reply / first diagram / first formula).
    // Must come before the generic 'react' rule, which would pull react-markdown into the eager bundle.
    if (/node_modules[\\/](mermaid|@mermaid-js|@braintree|@iconify|@upsetjs|cytoscape[^\\/]*|d3|d3-[^\\/]+|internmap|delaunator|robust-predicates|dagre-d3-es|elkjs|layout-base|cose-base|khroma|langium|@chevrotain|chevrotain[^\\/]*|roughjs|stylis|dayjs|marked|uuid|ts-dedent|lodash-es|vscode-[^\\/]+)[\\/]/.test(id)) return undefined;
    if (/node_modules[\\/]katex[\\/]/.test(id)) return undefined;
    if (/node_modules[\\/](react-markdown|remark-[^\\/]+|rehype-[^\\/]+|unified|micromark[^\\/]*|mdast-[^\\/]+|hast-[^\\/]+|hastscript|unist-[^\\/]+|vfile[^\\/]*|bail|trough|devlop|ccount|zwitch|markdown-table|longest-streak|parse-entities|stringify-entities|property-information|space-separated-tokens|comma-separated-tokens|decode-named-character-reference|character-entities[^\\/]*|html-url-attributes|trim-lines|is-plain-obj|estree-util-[^\\/]+)[\\/]/.test(id)) return undefined;
    if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
    if (id.includes('react-router')) return 'router-vendor';
    if (id.includes('framer-motion')) return 'motion-vendor';
    if (id.includes('recharts/es6/chart') || id.includes('recharts/es6/cartesian') || id.includes('recharts/es6/component/Tooltip') || id.includes('recharts/es6/component/ResponsiveContainer')) return 'charts-core-vendor';
    if (id.includes('recharts/es6/polar') || id.includes('recharts/es6/component/Legend')) return 'charts-polar-vendor';
    if (id.includes('recharts')) return 'charts-vendor';
    if (id.includes('tesseract.js')) return 'ocr-vendor';
    if (id.includes('pdfjs-dist')) return 'pdfjs-vendor';
    if (id.includes('pdf-parse')) return 'pdf-vendor';
    if (id.includes('mammoth')) return 'docx-vendor';
    if (id.includes('jszip')) return 'archive-vendor';
    if (id.includes('canvg')) return 'svg-export-vendor';
    if (id.includes('jspdf')) return 'jspdf-vendor';
    if (id.includes('html2canvas')) return 'html2canvas-vendor';
    if (id.includes('zustand')) return 'state-vendor';
    if (id.includes('canvas-confetti')) return 'effects-vendor';
    if (id.includes('lucide-react')) return 'icons-vendor';
    if (id.includes('@dnd-kit')) return 'drag-drop-vendor';
    // Everything else: no catch-all chunk, so libraries used only by lazy pages stay out of the startup bundle.
    return undefined;
  }
  return undefined;
}

export default defineConfig({
  plugins: [react(), tailwindcss(), removeStylesheetCrossorigin()],
  base: './',
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        codeSplitting: {
          // Rolldown groups pull every dependency of their modules in by default, so small shared helpers (Vite's preload
          // helper, tiny utils) ended up inside jspdf/pdfjs/recharts and those ~1.7 MB loaded at startup.
          includeDependenciesRecursively: false,
          groups: [{ name: (id: string) => vendorChunk(id) ?? null }],
        },
        // Fixed filenames (no content hashes) so update patches are predictable
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) return 'assets/index.css';
          return 'assets/[name][extname]';
        },
      },
    },
  },
})
