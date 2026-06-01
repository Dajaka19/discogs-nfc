import { useState, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { scrobbleTracks } from '../utils/lastfm'
import { buildScrobblePayload } from '../utils/tracklist'

const INITIAL_STATE = {
  status: 'idle', // 'idle' | 'loading' | 'success' | 'partial' | 'error'
  progress: 0,
  total: 0,
  results: [],
  error: null,
}

export function useLastfm() {
  const { credentials } = useApp()
  const [scrobbleState, setScrobbleState] = useState(INITIAL_STATE)

  const scrobble = useCallback(
    async (selectedTracks, albumArtist, albumTitle) => {
      const { lastfmKey, lastfmSecret, lastfmSessionKey } = credentials

      if (!lastfmKey || !lastfmSecret || !lastfmSessionKey) {
        setScrobbleState({
          ...INITIAL_STATE,
          status: 'error',
          error: 'Last.fm credentials missing. Open Settings to authenticate.',
        })
        return
      }

      const endTime = Math.floor(Date.now() / 1000)
      const tracksWithMeta = selectedTracks.map((t) => ({
        ...t,
        _artist: t._artist || albumArtist,
        _album: t._album || albumTitle,
      }))

      const payload = buildScrobblePayload(tracksWithMeta, endTime)
      setScrobbleState({ status: 'loading', progress: 0, total: payload.length, results: [], error: null })

      try {
        const results = await scrobbleTracks(payload, lastfmKey, lastfmSecret, lastfmSessionKey)
        const failed = results.filter((r) => !r.accepted)
        setScrobbleState({
          status: failed.length === 0 ? 'success' : 'partial',
          progress: results.length,
          total: payload.length,
          results,
          error: failed.length > 0 ? `${failed.length} track${failed.length > 1 ? 's' : ''} ignored by Last.fm` : null,
        })
      } catch (err) {
        setScrobbleState((s) => ({ ...s, status: 'error', error: err.message }))
      }
    },
    [credentials]
  )

  const reset = useCallback(() => setScrobbleState(INITIAL_STATE), [])

  return { scrobbleState, scrobble, reset }
}
