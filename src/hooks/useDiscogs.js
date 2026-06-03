import { useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { fetchCollection, fetchReleaseDetail } from '../utils/discogs'

export function useDiscogs() {
  const {
    credentials,
    setCollection,
    setCollectionLoading,
    setCollectionProgress,
    setCollectionError,
    releaseCache,
    cacheRelease,
    setSelectedAlbum,
  } = useApp()

  const loadCollection = useCallback(async () => {
    if (!credentials.discogsToken || !credentials.discogsUsername) return
    setCollectionLoading(true)
    setCollectionError(null)
    setCollectionProgress({ loaded: 0, total: 0 })
    try {
      const releases = await fetchCollection(
        credentials.discogsUsername,
        credentials.discogsToken,
        (progress) => setCollectionProgress(progress)
      )
      setCollection(releases)
    } catch (err) {
      setCollectionError(err.message)
    } finally {
      setCollectionLoading(false)
    }
  }, [credentials, setCollection, setCollectionLoading, setCollectionProgress, setCollectionError])

  const selectAlbum = useCallback(
    async (release) => {
      const id = release.id || release.basic_information?.id
      if (!id) return

      if (releaseCache[id]) {
        setSelectedAlbum(releaseCache[id])
        return
      }

      // Show stub immediately so the panel opens right away
      const stub = {
        id,
        title: release.basic_information?.title || release.title,
        artists: release.basic_information?.artists || release.artists || [],
        images: release.basic_information?.cover_image
          ? [{ uri: release.basic_information.cover_image }]
          : [],
        year: release.basic_information?.year || release.year,
        _loading: true,
      }
      setSelectedAlbum(stub)

      try {
        const detail = await fetchReleaseDetail(id, credentials.discogsToken)
        cacheRelease(id, detail)
        setSelectedAlbum(detail)
      } catch (err) {
        setSelectedAlbum({ ...stub, _loading: false, _error: err.message })
      }
    },
    [credentials, releaseCache, cacheRelease, setSelectedAlbum]
  )

  // Force a fresh fetch from Discogs, ignoring the cache — picks up edits made
  // to the release on Discogs itself (new tracks, fixed titles, durations, …).
  const refreshRelease = useCallback(
    async (id) => {
      if (!id) return
      const detail = await fetchReleaseDetail(id, credentials.discogsToken)
      cacheRelease(id, detail)
      setSelectedAlbum(detail)
      return detail
    },
    [credentials, cacheRelease, setSelectedAlbum]
  )

  return { loadCollection, selectAlbum, refreshRelease }
}
