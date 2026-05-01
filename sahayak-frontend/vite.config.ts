import path from "path"
import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const omnidimApiKey = env.VITE_OMNIDIM_API_KEY ?? ""

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        // ── Omnidim outbound call dispatch (MUST come before /api catch-all) ──
        // On Vercel production this is handled by api/call-dispatch.ts edge fn.
        // In local dev Vite proxies /api/call-dispatch here so the key stays
        // server-side and we avoid browser CORS errors.
        "/api/call-dispatch": {
          target: "https://backend.omnidim.io",
          changeOrigin: true,
          secure: true,
          rewrite: () => "/api/v1/calls/dispatch",
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (omnidimApiKey) {
                proxyReq.setHeader("Authorization", `Bearer ${omnidimApiKey}`)
              }
              proxyReq.setHeader("Accept", "application/json")
            })
          },
        },
        // ── Backend API ────────────────────────────────────────────────────────
        "/api": {
          target: "http://localhost:8001",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
        // ── Static audio files (TTS output) ───────────────────────────────────
        "/static": {
          target: "http://localhost:8001",
          changeOrigin: true,
        },
      },
    },
  }
})
