import { useState } from 'react'

// Per-release editor: rename tracks, headings and discs, and toggle joining a
// disc's headings with " | ". Built from the ORIGINAL grouped tracks so keys are
// stable (position || original title). Saves a compact { titles, discs, joinHeadings }.
const keyOf = (t) => t.position || t.title

export default function ReleaseEditor({ baseDiscGroups, discLabels, initialEdits, onSave, onCancel }) {
  const [titles, setTitles] = useState({ ...(initialEdits.titles || {}) })
  const [discs, setDiscs] = useState({ ...(initialEdits.discs || {}) })
  const [joinHeadings, setJoinHeadings] = useState(!!initialEdits.joinHeadings)

  const setTitle = (key, original, value) => {
    setTitles((prev) => {
      const next = { ...prev }
      if (!value.trim() || value === original) delete next[key]
      else next[key] = value
      return next
    })
  }
  const setDisc = (disc, value) => {
    setDiscs((prev) => {
      const next = { ...prev }
      if (!value.trim()) delete next[disc]
      else next[disc] = value
      return next
    })
  }

  const inputCls =
    'w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm font-sans text-white placeholder-text-secondary focus:outline-none focus:border-accent/60'

  const discKeys = Object.keys(baseDiscGroups).sort((a, b) => Number(a) - Number(b))
  const multiDisc = discKeys.length > 1

  function titleRow(t, indent) {
    const k = keyOf(t)
    const isHeading = t._isIndex || t._isHeading
    return (
      <div key={k + (indent ? '-s' : '')} className={indent ? 'ml-4 pl-3 border-l border-border' : ''}>
        {isHeading && <span className="text-[10px] uppercase tracking-wider text-accent font-sans">Encabezado</span>}
        <input
          className={inputCls}
          defaultValue={titles[k] || ''}
          placeholder={t.title}
          onChange={(e) => setTitle(k, t.title, e.target.value)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
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

      {discKeys.map((dk) => (
        <div key={dk} className="bg-card/60 border border-border/50 rounded-xl p-3 space-y-2">
          {multiDisc && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-text-secondary font-sans">Nombre del disco {dk}</span>
              <input
                className={inputCls}
                defaultValue={discs[dk] || ''}
                placeholder={discLabels[dk] || `Disc ${dk}`}
                onChange={(e) => setDisc(dk, e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5 pt-1">
            {baseDiscGroups[dk].map((t) =>
              t._hasSubTracks && t._subTracks ? (
                <div key={keyOf(t)} className="space-y-1.5">
                  {titleRow(t, false)}
                  {t._subTracks.map((s) => titleRow(s, true))}
                </div>
              ) : (
                titleRow(t, false)
              )
            )}
          </div>
        </div>
      ))}

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
