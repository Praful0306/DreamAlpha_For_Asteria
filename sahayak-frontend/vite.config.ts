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
        "/api": {
          target: "http://localhost:8001",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
        // Proxy static audio files (TTS output) to the backend
        "/static": {
          target: "http://localhost:8001",
          changeOrigin: true,
        },
        // ── Omnidim outbound call dispatch ───────────────────────────────────
        // Proxied server-side so auth header is injected without CORS issues.
        // Frontend calls /call-dispatch; Vite forwards to:
        //   https://backend.omnidim.io/api/v1/calls/dispatch
        "/call-dispatch": {
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
      },
    },
  }
})
