import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'

// Deployment target is chosen by Nitro at build time (NITRO_PRESET=node-server | vercel |
// netlify | cloudflare-module | bun ...), so the app code never changes per runtime.
export default defineConfig({
  server: { port: 3000 },
  plugins: [
    tanstackStart({
      // Belt and braces on top of the `server-only` marker in src/server/*.
      importProtection: { client: { files: ['**/src/server/**'] } },
    }),
    nitro(),
    // react's vite plugin must come after start's vite plugin
    viteReact(),
  ],
})
