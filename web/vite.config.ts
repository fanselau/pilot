import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: { port: 3100, allowedHosts: ['pilot.werkbank.ai', 'carsten.taile7d742.ts.net'] },
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    tanstackStart(),
    viteReact(),
  ],
})
