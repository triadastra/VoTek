import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The broker (Node) runs on :8787. Proxy the vision socket + token endpoint in dev
// so the web app can talk to it without CORS gymnastics.
export default defineConfig({
  plugins: [react()],
  build: {
    // Split the heavy map engine and React into their own chunks. They rarely change, so
    // browsers keep them cached across app updates — only the small app chunk re-downloads.
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/vision': {
        target: 'ws://localhost:8787',
        ws: true,
      },
    },
  },
})
