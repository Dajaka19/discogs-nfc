import { useState } from 'react'

// NFC tag writing.
//
// Tag payload: https://discogs-nfc.vercel.app/?release={id}
//   We write a plain HTTPS URL (NOT the vinylnfc:// custom scheme). On iOS a
//   custom-scheme tag triggers an "Open in app?" confirmation; an HTTPS URL
//   opens straight away (in Safari / the installed PWA) with no extra prompt.
//   The app handles ?release={id} to jump to that record.
//
// Android Chrome: Web NFC API writes the tag directly from the page — one tap,
//   no app, no setup (the fastest path the platform allows).
// iOS: the browser can't write NFC. "Copiar enlace" copies the link to write with
//   an external NFC app (e.g. NFC Tools).
const URL_BASE = 'https://discogs-nfc.vercel.app/?release='

export default function NfcButton({ releaseId }) {
  const [status, setStatus] = useState('idle') // idle | writing | done | error | copied
  const [showHelp, setShowHelp] = useState(false)

  const supportsWebNfc = typeof window !== 'undefined' && 'NDEFReader' in window
  const tagUrl = `${URL_BASE}${releaseId}`

  const handleWrite = async () => {
    if (supportsWebNfc) {
      // Android Chrome — write directly from the page
      try {
        setStatus('writing')
        // eslint-disable-next-line no-undef
        const ndef = new NDEFReader()
        await ndef.write({ records: [{ recordType: 'url', data: tagUrl }] })
        setStatus('done')
        setTimeout(() => setStatus('idle'), 3000)
      } catch {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    } else {
      // iOS — no in-app writing; copy the link to write with an external NFC app.
      handleCopy()
    }
  }

  const handleCopy = () => {
    navigator.clipboard?.writeText(tagUrl).then(() => {
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 2500)
    })
  }

  const writeLabel = {
    idle: 'Grabar tag',
    writing: 'Acerca al tag…',
    done: '¡Grabado!',
    error: 'Error',
    copied: 'Grabar tag',
  }[status]

  return (
    <div className="space-y-2">
    <div className="flex items-center gap-2">
      {/* Direct write only where the browser can do it (Android Web NFC) */}
      {supportsWebNfc && (
        <button
          onClick={handleWrite}
          disabled={status === 'writing'}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-sans transition-all disabled:opacity-60 ${
            status === 'done'
              ? 'border-green-700/50 bg-green-900/30 text-green-400'
              : status === 'error'
              ? 'border-red-700/50 bg-red-900/30 text-red-400'
              : 'border-border bg-card text-text-secondary hover:text-white hover:border-accent/40'
          }`}
        >
          {status === 'done' ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          )}
          {writeLabel}
        </button>
      )}

      {/* Copy the HTTPS link (to write with an external NFC app) */}
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-card text-text-secondary hover:text-white transition-all text-sm font-sans"
      >
        {status === 'copied' ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copiado
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copiar enlace
          </>
        )}
      </button>

      {/* How-to toggle (iOS only — Android writes directly) */}
      {!supportsWebNfc && (
        <button
          onClick={() => setShowHelp((s) => !s)}
          title="Cómo grabar el tag"
          className="w-7 h-7 flex items-center justify-center rounded-full border border-border text-text-secondary hover:text-white hover:border-accent/40 transition-all text-xs font-mono"
        >
          ?
        </button>
      )}
    </div>

      {showHelp && !supportsWebNfc && (
        <div className="bg-card/80 border border-border rounded-xl p-3 text-xs font-sans text-text-secondary space-y-1.5 fade-in max-w-sm">
          <p className="text-white font-medium">Grabar el tag (gratis, con NFC Tools):</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>Toca <span className="text-white">Copiar enlace</span></li>
            <li>Abre <span className="text-white">NFC Tools</span> → pestaña <span className="text-white">Escribir</span></li>
            <li><span className="text-white">Añadir un registro</span> → <span className="text-white">URL/URI</span> → pega → OK</li>
            <li><span className="text-white">Escribir</span> → acerca el iPhone al tag</li>
          </ol>
          <p className="opacity-60 pt-0.5">
            Al escanearlo abrirá esta app en el disco. (Para escribir muchos a la vez, lo más rápido es un
            lector USB NFC en el PC con NFC Tools.)
          </p>
        </div>
      )}
    </div>
  )
}
