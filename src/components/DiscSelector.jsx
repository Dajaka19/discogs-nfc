export default function DiscSelector({ discCount, selectedDisc, onSelect, onSelectDisc, discLabels = {} }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* All Discs — default first tab */}
      <button
        onClick={() => onSelect(0)}
        className={`px-4 py-1.5 rounded-full text-sm font-sans transition-all ${
          selectedDisc === 0
            ? 'bg-accent text-black font-medium'
            : 'bg-card text-text-secondary hover:text-white border border-border'
        }`}
      >
        All Discs
      </button>

      {/* Individual disc tabs */}
      {Array.from({ length: discCount }, (_, i) => i + 1).map((disc) => {
        const formatLabel = discLabels[disc]
        const label = formatLabel ? `Disc ${disc} — ${formatLabel}` : `Disc ${disc}`
        const isSelected = selectedDisc === disc

        return (
          <button
            key={disc}
            onClick={() => onSelect(disc)}
            className={`px-4 py-1.5 rounded-full text-sm font-sans transition-all ${
              isSelected
                ? 'bg-accent text-black font-medium'
                : 'bg-card text-text-secondary hover:text-white border border-border'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
