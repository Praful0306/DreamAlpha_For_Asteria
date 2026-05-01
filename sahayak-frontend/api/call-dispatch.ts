/**
 * Vercel Edge Function — Omnidim call-dispatch proxy
 *
 * Proxies POST requests to Omnidim's outbound-call API server-side so:
 *   1. The Omnidim API key never reaches the browser
 *   2. CORS issues are avoided (Omnidim doesn't allow browser origins)
 *
 * Works in both demo mode and real (authenticated) mode.
 * Vercel deploys this automatically at /api/call-dispatch.
 * In local Vite dev, the vite.config.ts proxy intercepts /api/call-dispatch.
 */

export const config = { runtime: "edge" }

const OMNIDIM_API_KEY =
  process.env.OMNIDIM_API_KEY ??
  process.env.VITE_OMNIDIM_API_KEY ??
  "sNL3bHv3gjMlRwl_dXGB2ZHkLi1DAfPyGVBWDIQXIgk"

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    })
  }

  try {
    const body = await request.text()

    const upstream = await fetch(
      "https://backend.omnidim.io/api/v1/calls/dispatch",
      {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${OMNIDIM_API_KEY}`,
          "Content-Type":  "application/json",
          "Accept":        "application/json",
        },
        body,
      },
    )

    const data = await upstream.text()
    return new Response(data, {
      status:  upstream.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return new Response(
      JSON.stringify({ success: false, error: `Call dispatch failed: ${msg}` }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    )
  }
}
