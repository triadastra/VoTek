import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The broker (Node) runs on :8787. Proxy the vision socket + token endpoint in dev
// so the web app can talk to it without CORS gymnastics.
export default defineConfig({
  plugins: [react()],
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
