import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Polyfills for Buffer, stream, etc. required by ExcelJS in the browser
    nodePolyfills({ include: ['buffer', 'stream', 'util', 'events'] }),
  ],
  server: {
    port: 5173,
  },
})
