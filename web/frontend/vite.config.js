// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'] // ✅ ensures only one React instance
  },
  build: {
    rollupOptions: {
      output: {
        // React/react-dom/react-router are used by every route, so they get
        // one shared, cacheable chunk. Everything else (MUI, ECharts, jsPDF)
        // is used only behind a React.lazy() boundary in App.jsx — Rollup
        // already keeps those out of the entry and puts them on the async
        // chunk that needs them without any help. Manually bucketing an
        // async-only dependency by a broad id match is a known Rollup/Vite
        // footgun: it can force a facade import back into the eager entry
        // chunk, which is the opposite of what code-splitting is for here —
        // verified by building and checking dist/index.html's script tags.
        manualChunks(id) {
          if (id.includes('node_modules') && (id.includes('react-router') || id.includes('/react-dom/') || id.includes('/react/'))) {
            return 'react-vendor'
          }
        },
      },
    },
  },
  // Mirrors the dev server's /api proxy so `npm run preview` — a real
  // production build, unlike `npm run dev` — can be exercised locally
  // against a running backend instead of only ever being tested after a
  // deploy.
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  server: {
    port: 5173, // frontend dev server
    proxy: {
      '/api': {
        target: 'https://vortex5-capstone.onrender.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
