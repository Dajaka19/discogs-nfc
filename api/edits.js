// Cross-device storage for per-release edits (track/heading/disc names + the
// per-release "join headings" toggle). Keyed by the user's Discogs username.
// Same-origin with the app (web/PWA and the native app via server.url) → no CORS.
//
// Requires an Upstash Redis store connected to the Vercel project (free tier).
// It injects UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, read by fromEnv().
import { Redis } from '@upstash/redis'

export default async function handler(req, res) {
  const user = String(req.query.user || '').trim().toLowerCase()
  if (!user) {
    res.status(400).json({ error: 'missing user' })
    return
  }

  // Support both Vercel-KV (KV_REST_API_*) and Upstash-direct (UPSTASH_REDIS_REST_*)
  // env var names, depending on how the store was connected.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    // Not configured yet — let the client fall back to local-only storage.
    res.status(503).json({ error: 'storage not configured' })
    return
  }
  const redis = new Redis({ url, token })

  const key = `edits:${user}`
  try {
    if (req.method === 'GET') {
      const data = await redis.get(key)
      res.status(200).json(data || {})
      return
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
      await redis.set(key, body)
      res.status(200).json({ ok: true })
      return
    }
    res.status(405).end()
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
}
