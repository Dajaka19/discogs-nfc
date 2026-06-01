import { useMemo } from 'react'
import { useApp } from '../context/AppContext'

export function useCollection(searchQuery = '', sortBy = 'added') {
  const { collection } = useApp()

  const filtered = useMemo(() => {
    let result = collection

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
  }, [collection, searchQuery, sortBy])

  return { filtered, total: collection.length }
}
