// Tiny same-origin image proxy for Discogs cover art.
//
// Reading pixel data from a remote image to derive an accent colour taints the
// <canvas> (Discogs images send no CORS headers). Proxying the image through our
// own origin makes it same-origin, so the canvas stays readable.
//
// Restricted to Discogs image hosts so it can't be used as an open proxy.
export default async function handler(req, res) {
  const url = String(req.query.url || '')
  if (!/^https:\/\/([a-z0-9-]+\.)?discogs\.com\//i.test(url)) {
    res.status(400).json({ error: 'only discogs.com images' })
    return
  }
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'vinyl-nfc/1.0 +https://discogs-nfc.vercel.app' } })
    if (!r.ok) {
      res.status(r.status).end()
      return
    }
    const buf = Buffer.from(await r.arrayBuffer())
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
    res.status(200).send(buf)
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) })
  }
}
