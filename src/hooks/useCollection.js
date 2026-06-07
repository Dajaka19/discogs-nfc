import { useMemo } from 'react'
import { useApp } from '../context/AppContext'

const stripDisambig = (name) => (name || '').replace(/ \(\d+\)$/, '')
const releaseId = (r) => r.id || r.basic_information?.id

export function useCollection(
  searchQuery = '',
  sortBy = 'added',
  filterArtist = '',
  filterFormat = '',
  filterNfc = '' // '' | 'yes' | 'no'
) {
  const { collection, edits } = useApp()

  // A Discogs collection can hold several copies (instances) of the exact same
  // release — same release id. Show each release only once.
  const deduped = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const r of collection) {
      const id = releaseId(r)
      if (id == null) { out.push(r); continue }
      if (seen.has(id)) continue
      seen.add(id)
      out.push(r)
    }
    return out
  }, [collection])

  // Unique artists & formats for the filter dropdowns.
  const { artists, formats } = useMemo(() => {
    const aSet = new Set()
    const fSet = new Set()
    for (const r of deduped) {
      const info = r.basic_information || {}
      const a = stripDisambig(info.artists?.[0]?.name)
      if (a) aSet.add(a)
      for (const f of info.formats || []) if (f.name) fSet.add(f.name)
    }
    return {
      artists: [...aSet].sort((x, y) => x.localeCompare(y)),
      formats: [...fSet].sort((x, y) => x.localeCompare(y)),
    }
  }, [deduped])

  const filtered = useMemo(() => {
    let result = deduped

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((r) => {
        const info = r.basic_information
        return (
          info.title?.toLowerCase().includes(q) ||
          info.artists?.[0]?.name?.toLowerCase().includes(q) ||
          info.labels?.[0]?.name?.toLowerCase().includes(q) ||
          String(info.year).includes(q) ||
          info.genres?.some((g) => g.toLowerCase().includes(q)) ||
          info.styles?.some((s) => s.toLowerCase().includes(q))
        )
      })
    }

    if (filterArtist) {
      result = result.filter((r) => stripDisambig(r.basic_information?.artists?.[0]?.name) === filterArtist)
    }

    if (filterFormat) {
      result = result.filter((r) =>
        (r.basic_information?.formats || []).some((f) => f.name === filterFormat)
      )
    }

    if (filterNfc === 'yes' || filterNfc === 'no') {
      const want = filterNfc === 'yes'
      result = result.filter((r) => !!edits?.[releaseId(r)]?.nfc === want)
    }

    return [...result].sort((a, b) => {
      const ai = a.basic_information
      const bi = b.basic_information
      switch (sortBy) {
        case 'artist':
          return (ai.artists?.[0]?.name || '').localeCompare(bi.artists?.[0]?.name || '')
        case 'title':
          return (ai.title || '').localeCompare(bi.title || '')
        case 'year':
          return (bi.year || 0) - (ai.year || 0)
        case 'added':
        default:
          return (b.date_added || '').localeCompare(a.date_added || '')
      }
    })
  }, [deduped, searchQuery, sortBy, filterArtist, filterFormat, filterNfc, edits])

  return { filtered, total: deduped.length, artists, formats }
}
