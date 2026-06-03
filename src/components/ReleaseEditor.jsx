import { useRef, useState } from 'react'

// Per-release editor: rename tracks, headings and discs, and toggle joining a
// disc's headings with " | ". Fields are PRE-FILLED with the current value.
//
// Performance: inputs are UNCONTROLLED (refs, no per-keystroke state) so typing
// never re-renders the (possibly long) list. Values are read only on Save.
const keyOf = (t) => t.position || t.title

export default function ReleaseEditor({ baseDiscGroups, discLabels, initialEdits, onSave, onCancel }) {
  const [joinHeadings, setJoinHeadings] = useState(!!initialEdits.joinHeadings)
  // Per-disc "use the disc name as the album" (for box sets where each disc is
  // a different album). Keyed by disc number.
  const [discAsAlbum, setDiscAsAlbum] = useState(() => ({ ...(initialEdits.discAsAlbum || {}) }))
  const refs = useRef({}) // id -> input element
  const meta = useRef([]) // [{ id, kind, key, original }]
  meta.current = []

  const initTitles = initialEdits.titles || {}
  const initDiscs = initialEdits.discs || {}

  const baseInput =
    'w-full bg-background rounded-md px-2.5 py-1.5 text-sm font-sans text-white focus:outline-none transition-colors'

  const discKeys = Object.keys(baseDiscGroups).sort((a, b) => Number(a) - Number(b))
  const multiDisc = discKeys.length > 1

  function register(id, kind, key, original) {
    meta.current.push({ id, kind, key, original })
    return (el) => {
      if (el) refs.current[id] = el
      else delete refs.current[id]
    }
  }

  function handleSave() {
    const titles = {}
    const discs = {}
    for (const f of meta.current) {
      const el = refs.current[f.id]
      if (!el) continue
      const v = el.value
      if (f.kind === 'title') {
        if (!v.trim() || v === f.original) continue
        titles[f.key] = v
      } else {
        // Disc name: an empty field intentionally REMOVES the auto-label
        // (shows just "Disc N"). Store '' so it overrides the default.
        const trimmed = v.trim()
        if (trimmed === (f.original || '')) continue
        discs[f.key] = trimmed ? v : ''
      }
    }
    // Keep only the discs actually marked as "use as album".
    const discAsAlbumClean = {}
    for (const [dk, on] of Object.entries(discAsAlbum)) if (on) discAsAlbumClean[dk] = true
    onSave({ titles, discs, joinHeadings, discAsAlbum: discAsAlbumClean })
  }

  // A single editable row: heading (accent) or track (with position).
  function row(t, indent) {
    const k = keyOf(t)
    const id = 'title:' + k + (indent ? ':s' : '')
    const isHeading = t._isIndex || t._isHeading
    const current = initTitles[k] ?? t.title
    return (
      <div key={id} className={`flex items-center gap-2 ${indent ? 'ml-5' : ''}`}>
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
          ref={register(id, 'title', k, t.title)}
          className={`${baseInput} ${
            isHeading
              ? 'border border-accent/50 text-accent font-medium focus:border-accent'
              : 'border border-border focus:border-accent/60'
          }`}
          defaultValue={current}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-lg text-white">Editar release</h3>
        <span className="text-xs text-text-secondary font-sans">afecta a la lista y al scrobble</span>
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

      {/* Quick toggle: mark ALL discs to use their name as the album (box sets) */}
      {multiDisc && (() => {
        const allOn = discKeys.length > 0 && discKeys.every((dk) => discAsAlbum[dk])
        return (
          <button
            onClick={() =>
              setDiscAsAlbum(() => {
                const next = {}
                if (!allOn) discKeys.forEach((dk) => (next[dk] = true))
                return next
              })
            }
            className="w-full flex items-center justify-between gap-3 text-left bg-card/60 border border-border rounded-xl px-3 py-2.5"
          >
            <span className="text-sm font-sans text-text-secondary">
              Usar el nombre de <span className="text-white">todos los discos</span> como álbum
            </span>
            <span className={`shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors ${allOn ? 'bg-accent' : 'bg-border'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${allOn ? 'translate-x-4' : ''}`} />
            </span>
          </button>
        )
      })()}

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
                  ref={register('disc:' + dk, 'disc', dk, discLabel)}
                  className={`${baseInput} border border-accent/40 font-medium focus:border-accent`}
                  defaultValue={initDiscs[dk] ?? discLabel}
                  placeholder={`Vacío → solo «Disco ${dk}»`}
                />
                <p className="mt-1 text-[10px] text-text-secondary font-sans">
                  Déjalo vacío para quitar el nombre (mostrará solo «Disco {dk}»).
                </p>
                {/* Use this disc's name as the scrobble album (box sets) */}
                <button
                  type="button"
                  onClick={() => setDiscAsAlbum((m) => ({ ...m, [dk]: !m[dk] }))}
                  className="mt-2 w-full flex items-center justify-between gap-3 text-left"
                >
                  <span className="text-xs font-sans text-text-secondary">
                    Usar el nombre del disco como nombre del álbum
                  </span>
                  <span className={`shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors ${discAsAlbum[dk] ? 'bg-accent' : 'bg-border'}`}>
                    <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${discAsAlbum[dk] ? 'translate-x-4' : ''}`} />
                  </span>
                </button>
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
          onClick={handleSave}
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
