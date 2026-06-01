import { useState } from 'react'

export default function AlbumCard({ release, onClick, isSelected }) {
  const [imgError, setImgError] = useState(false)
  const info = release.basic_information
  const artUrl = !imgError && (info.cover_image || info.thumb)
  const artist = info.artists?.[0]?.name?.replace(/ \(\d+\)$/, '') || 'Unknown Artist'

  return (
    <button
      onClick={onClick}
      className={`album-card w-full text-left rounded-xl overflow-hidden transition-all ${
        isSelected
          ? 'ring-2 ring-accent ring-offset-1 ring-offset-background bg-card-hover'
          : 'bg-card'
      }`}
    >
      <div className="aspect-square relative bg-border overflow-hidden">
        {artUrl ? (
          <img
            src={artUrl}
            alt={info.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl text-text-secondary opacity-30">◉</span>
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="font-sans text-xs text-white truncate leading-snug">{info.title}</p>
        <p className="font-sans text-xs text-text-secondary truncate mt-0.5">{artist}</p>
        <p className="font-mono text-xs text-text-secondary mt-0.5 opacity-70">{info.year || '—'}</p>
      </div>
    </button>
  )
}
