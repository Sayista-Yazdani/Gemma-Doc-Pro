import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      // Allows the Vite dev server to call the local XAMPP/Apache PHP API.
      '/api': {
        target: 'http://localhost',
        changeOrigin: true,
        rewrite: (p) => {
          const projectSlug = path.basename(process.cwd())
          return p.replace(/^\/api/, `/${projectSlug}/api`)
        },
      },
    },
  },
})
