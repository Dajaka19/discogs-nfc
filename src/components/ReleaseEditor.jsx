import { useState } from 'react'

// Per-release editor: rename tracks, headings and discs, and toggle joining a
// disc's headings with " | ". Fields are PRE-FILLED with the current value (edit,
// don't create). Headings and disc names are visually distinct from tracks.
const keyOf = (t) => t.position || t.title

export default function ReleaseEditor({ baseDiscGroups, discLabels, initialEdits, onSave, onCancel }) {
  const [titles, setTitles] = useState({ ...(initialEdits.titles || {}) })
  const [discs, setDiscs] = useState({ ...(initialEdits.discs || {}) })
  const [joinHeadings, setJoinHeadings] = useState(!!initialEdits.joinHeadings)

  // Store an override only when it actually differs from the original value.
  const setTitle = (key, original, value) => {
    setTitles((prev) => {
      const next = { ...prev }
      if (!value.trim() || value === original) delete next[key]
      else next[key] = value
      return next
    })
  }
  const setDisc = (disc, original, value) => {
    setDiscs((prev) => {
      const next = { ...prev }
      if (!value.trim() || value === original) delete next[disc]
      else next[disc] = value
      return next
    })
  }

  const baseInput =
    'w-full bg-background rounded-md px-2.5 py-1.5 text-sm font-sans text-white focus:outline-none transition-colors'

  const discKeys = Object.keys(baseDiscGroups).sort((a, b) => Number(a) - Number(b))
  const multiDisc = discKeys.length > 1

  // A single editable row: heading (accent) or track (with position).
  function row(t, indent) {
    const k = keyOf(t)
    const isHeading = t._isIndex || t._isHeading
    const current = titles[k] ?? t.title
    return (
      <div key={k + (indent ? '-s' : '')} className={`flex items-center gap-2 ${indent ? 'ml-5' : ''}`}>
        {isHeading ? (
          <span className="text-[10px] uppercase tracking-wider text-accent font-sans w-12 shrink-0 leading-none">
            Encab.
          </span>
        ) : (
          <span className="font-mono text-xs text-text-secondary w-12 shrink-0 leading-none whitespace-nowrap">
            {t.position}
          </span>
        )}
        <input
          className={`${baseInput} ${
            isHeading
              ? 'border border-accent/50 text-accent font-medium focus:border-accent'
              : 'border border-border focus:border-accent/60'
          }`}
          defaultValue={current}
          onChange={(e) => setTitle(k, t.title, e.target.value)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-lg text-white">Editar release</h3>
        <span className="text-xs text-text-secondary font-sans">los cambios afectan a la lista y al scrobble</span>
      </div>

      {/* Join headings toggle */}
      <button
        onClick={() => setJoinHeadings((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left bg-card/60 border border-border rounded-xl px-3 py-2.5"
      >
        <span className="text-sm font-sans text-text-secondary">Unir encabezados del disco con “ | ”</span>
        <span className={`shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors ${joinHeadings ? 'bg-accent' : 'bg-border'}`}>
          <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${joinHeadings ? 'translate-x-4' : ''}`} />
        </span>
      </button>

      {discKeys.map((dk) => {
        const discLabel = discLabels[dk] || ''
        return (
          <div key={dk} className="rounded-xl border border-border bg-card/40 overflow-hidden">
            {/* Disc header — distinct from track/heading rows */}
            {multiDisc && (
              <div className="bg-accent/10 border-b border-accent/30 px-3 py-2.5">
                <label className="block text-[10px] uppercase tracking-wider text-accent font-sans mb-1">
                  Nombre del disco {dk}
                </label>
                <input
                  className={`${baseInput} border border-accent/40 font-medium focus:border-accent`}
                  defaultValue={discs[dk] ?? discLabel}
                  placeholder={discLabel || `Disco ${dk}`}
                  onChange={(e) => setDisc(dk, discLabel, e.target.value)}
                />
              </div>
            )}

            {/* Tracks + headings */}
            <div className="p-3 space-y-2">
              {baseDiscGroups[dk].map((t) =>
                t._hasSubTracks && t._subTracks ? (
                  <div key={keyOf(t)} className="space-y-2">
                    {row(t, false)}
                    {t._subTracks.map((s) => row(s, true))}
                  </div>
                ) : (
                  row(t, false)
                )
              )}
            </div>
          </div>
        )
      })}

      <div className="flex items-center gap-2 pb-6">
        <button
          onClick={() => onSave({ titles, discs, joinHeadings })}
          className="flex-1 py-2.5 rounded-lg bg-accent text-black font-sans font-medium text-sm hover:brightness-110 transition-all"
        >
          Guardar
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-lg border border-border text-text-secondary hover:text-white font-sans text-sm transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
