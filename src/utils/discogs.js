const RATE_LIMIT_MS = 1100
const BASE = 'https://api.discogs.com'

class RateLimitQueue {
  constructor(delayMs) {
    this.delayMs = delayMs
    this.queue = []
    this.running = false
  }

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      if (!this.running) this._run()
    })
  }

  async _run() {
    this.running = true
    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift()
      try {
        resolve(await fn())
      } catch (err) {
        reject(err)
      }
      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, this.delayMs))
      }
    }
    this.running = false
  }

  clear() {
    this.queue = []
  }
}

export const discogsQueue = new RateLimitQueue(RATE_LIMIT_MS)

function discogsHeaders(token) {
  return {
    Authorization: `Discogs token=${token}`,
    'User-Agent': 'VinylCollectionApp/1.0',
  }
}

export async function fetchCollection(username, token, onProgress) {
  const headers = discogsHeaders(token)
  let page = 1
  let allReleases = []
  let totalPages = 1

  do {
    const url = `${BASE}/users/${encodeURIComponent(username)}/collection/folders/0/releases?per_page=100&page=${page}&sort=added&sort_order=desc`
    const res = await fetch(url, { headers })

    if (!res.ok) {
      if (res.status === 401) throw new Error('Invalid Discogs token')
      if (res.status === 404) throw new Error('Discogs user not found')
      throw new Error(`Discogs API error: ${res.status}`)
    }

    const data = await res.json()
    totalPages = data.pagination.pages
    const total = data.pagination.items

    allReleases = allReleases.concat(data.releases)
    onProgress?.({ loaded: allReleases.length, total })

    if (page < totalPages) {
      await new Promise((r) => setTimeout(r, 500))
    }
    page++
  } while (page <= totalPages)

  return allReleases
}

export async function fetchReleaseDetail(releaseId, token) {
  const url = `${BASE}/releases/${releaseId}`
  const headers = discogsHeaders(token)

  return discogsQueue.enqueue(async () => {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      if (res.status === 404) throw new Error('Release not found')
      throw new Error(`Failed to fetch release: ${res.status}`)
    }
    return res.json()
  })
}
