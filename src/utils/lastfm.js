// Pure JS MD5 — RFC 1321, no external dependencies.
// Required for Last.fm api_sig signing.
function md5(str) {
  function safeAdd(x, y) {
    const lsw = (x & 0xffff) + (y & 0xffff)
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16)
    return (msw << 16) | (lsw & 0xffff)
  }
  function rol(n, c) { return (n << c) | (n >>> (32 - c)) }
  function cmn(q, a, b, x, s, t) { return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b) }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t) }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t) }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t) }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t) }

  // Encode string as UTF-8 bytes
  const utf8 = unescape(encodeURIComponent(str))
  const n = utf8.length
  const words = []

  for (let i = 0; i < n; i++) {
    words[i >> 2] = (words[i >> 2] | 0) | (utf8.charCodeAt(i) << ((i % 4) * 8))
  }
  words[n >> 2] |= 0x80 << ((n % 4) * 8)
  words[(((n + 8) >> 6) << 4) + 14] = n * 8

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476

  for (let i = 0; i < words.length; i += 16) {
    const M = Array.from({ length: 16 }, (_, j) => words[i + j] | 0)
    let [A, B, C, D] = [a, b, c, d]

    // Round 1
    A=ff(A,B,C,D,M[0],7,-680876936);   D=ff(D,A,B,C,M[1],12,-389564586)
    C=ff(C,D,A,B,M[2],17,606105819);   B=ff(B,C,D,A,M[3],22,-1044525330)
    A=ff(A,B,C,D,M[4],7,-176418897);   D=ff(D,A,B,C,M[5],12,1200080426)
    C=ff(C,D,A,B,M[6],17,-1473231341); B=ff(B,C,D,A,M[7],22,-45705983)
    A=ff(A,B,C,D,M[8],7,1770035416);   D=ff(D,A,B,C,M[9],12,-1958414417)
    C=ff(C,D,A,B,M[10],17,-42063);     B=ff(B,C,D,A,M[11],22,-1990404162)
    A=ff(A,B,C,D,M[12],7,1804603682);  D=ff(D,A,B,C,M[13],12,-40341101)
    C=ff(C,D,A,B,M[14],17,-1502002290);B=ff(B,C,D,A,M[15],22,1236535329)
    // Round 2
    A=gg(A,B,C,D,M[1],5,-165796510);   D=gg(D,A,B,C,M[6],9,-1069501632)
    C=gg(C,D,A,B,M[11],14,643717713);  B=gg(B,C,D,A,M[0],20,-373897302)
    A=gg(A,B,C,D,M[5],5,-701558691);   D=gg(D,A,B,C,M[10],9,38016083)
    C=gg(C,D,A,B,M[15],14,-660478335); B=gg(B,C,D,A,M[4],20,-405537848)
    A=gg(A,B,C,D,M[9],5,568446438);    D=gg(D,A,B,C,M[14],9,-1019803690)
    C=gg(C,D,A,B,M[3],14,-187363961);  B=gg(B,C,D,A,M[8],20,1163531501)
    A=gg(A,B,C,D,M[13],5,-1444681467); D=gg(D,A,B,C,M[2],9,-51403784)
    C=gg(C,D,A,B,M[7],14,1735328473);  B=gg(B,C,D,A,M[12],20,-1926607734)
    // Round 3
    A=hh(A,B,C,D,M[5],4,-378558);      D=hh(D,A,B,C,M[8],11,-2022574463)
    C=hh(C,D,A,B,M[11],16,1839030562); B=hh(B,C,D,A,M[14],23,-35309556)
    A=hh(A,B,C,D,M[1],4,-1530992060);  D=hh(D,A,B,C,M[4],11,1272893353)
    C=hh(C,D,A,B,M[7],16,-155497632);  B=hh(B,C,D,A,M[10],23,-1094730640)
    A=hh(A,B,C,D,M[13],4,681279174);   D=hh(D,A,B,C,M[0],11,-358537222)
    C=hh(C,D,A,B,M[3],16,-722521979);  B=hh(B,C,D,A,M[6],23,76029189)
    A=hh(A,B,C,D,M[9],4,-640364487);   D=hh(D,A,B,C,M[12],11,-421815835)
    C=hh(C,D,A,B,M[15],16,530742520);  B=hh(B,C,D,A,M[2],23,-995338651)
    // Round 4
    A=ii(A,B,C,D,M[0],6,-198630844);   D=ii(D,A,B,C,M[7],10,1126891415)
    C=ii(C,D,A,B,M[14],15,-1416354905);B=ii(B,C,D,A,M[5],21,-57434055)
    A=ii(A,B,C,D,M[12],6,1700485571);  D=ii(D,A,B,C,M[3],10,-1894986606)
    C=ii(C,D,A,B,M[10],15,-1051523);   B=ii(B,C,D,A,M[1],21,-2054922799)
    A=ii(A,B,C,D,M[8],6,1873313359);   D=ii(D,A,B,C,M[15],10,-30611744)
    C=ii(C,D,A,B,M[6],15,-1560198380); B=ii(B,C,D,A,M[13],21,1309151649)
    A=ii(A,B,C,D,M[4],6,-145523070);   D=ii(D,A,B,C,M[11],10,-1120210379)
    C=ii(C,D,A,B,M[2],15,718787259);   B=ii(B,C,D,A,M[9],21,-343485551)

    a = safeAdd(a, A); b = safeAdd(b, B); c = safeAdd(c, C); d = safeAdd(d, D)
  }

  return [a, b, c, d]
    .map((n) => Array.from({ length: 4 }, (_, i) => ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0')).join(''))
    .join('')
}

// Build api_sig per Last.fm spec:
// Sort all param keys alphabetically, concat key+value (no separators), append secret, MD5.
// IMPORTANT: `format` and `callback` must NOT be included in signature params.
export function buildApiSig(params, secret) {
  const sig = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], '')
  return md5(sig + secret)
}

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/'

async function lastfmPost(params) {
  const body = new URLSearchParams({ ...params, format: 'json' })
  const res = await fetch(LASTFM_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Last.fm HTTP error: ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`Last.fm error ${data.error}: ${data.message}`)
  return data
}

// Desktop web auth flow — works from browsers without a backend.
//
// auth.getMobileSession was rejected (HTTP 403) because Last.fm restricts that
// endpoint to server-side callers. The desktop flow uses GET requests only:
//   1. getToken  → signed GET → returns a short-lived token
//   2. User visits https://www.last.fm/api/auth/?api_key=KEY&token=TOKEN and clicks Allow
//   3. getSession → signed GET → exchanges the now-authorised token for a persistent session key
//
// No callback URL or backend required.

export async function getToken(apiKey, apiSecret) {
  const params = { method: 'auth.getToken', api_key: apiKey }
  params.api_sig = buildApiSig(params, apiSecret)
  const url = `${LASTFM_BASE}?${new URLSearchParams({ ...params, format: 'json' })}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Last.fm HTTP error: ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`Last.fm error ${data.error}: ${data.message}`)
  return data.token
}

export async function getSession(token, apiKey, apiSecret) {
  const params = { method: 'auth.getSession', api_key: apiKey, token }
  params.api_sig = buildApiSig(params, apiSecret)
  const url = `${LASTFM_BASE}?${new URLSearchParams({ ...params, format: 'json' })}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Last.fm HTTP error: ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`Last.fm error ${data.error}: ${data.message}`)
  return data.session.key
}

// Scrobble an array of track objects. Auto-batches at 50 per request.
// Each track: { artist, track, album, timestamp, duration }
// Returns array of { track, accepted, ignoredMessage }
export async function scrobbleTracks(tracks, apiKey, apiSecret, sessionKey) {
  const BATCH = 50
  const results = []

  for (let i = 0; i < tracks.length; i += BATCH) {
    const batch = tracks.slice(i, i + BATCH)
    const params = {
      method: 'track.scrobble',
      api_key: apiKey,
      sk: sessionKey,
    }

    batch.forEach((t, idx) => {
      params[`artist[${idx}]`] = t.artist
      params[`track[${idx}]`] = t.track
      params[`album[${idx}]`] = t.album || ''
      params[`timestamp[${idx}]`] = String(t.timestamp)
      if (t.duration) params[`duration[${idx}]`] = String(t.duration)
    })

    params.api_sig = buildApiSig(params, apiSecret)

    const data = await lastfmPost(params)
    const scrobbles = [].concat(data.scrobbles?.scrobble ?? [])

    scrobbles.forEach((s, idx) => {
      // @attr.accepted/ignored lives on the batch container, not on individual scrobbles.
      // The per-track signal is ignoredMessage.code: "0" = accepted, anything else = ignored.
      const code = s.ignoredMessage?.code
      const accepted = !code || code === '0'
      results.push({
        track: batch[idx],
        accepted,
        ignoredMessage: accepted ? null : (s.ignoredMessage?.['#text'] || 'Ignored by Last.fm'),
      })
    })

    // If batch returned fewer scrobble confirmations than sent, mark remainder as accepted
    if (scrobbles.length < batch.length) {
      for (let j = scrobbles.length; j < batch.length; j++) {
        results.push({ track: batch[j], accepted: true, ignoredMessage: null })
      }
    }
  }

  return results
}
