import { useState } from 'react'
import { useApp } from '../context/AppContext'

// NFC tag writing.
//
// Tag payload: TWO records on one tag —
//   1) vinylnfc://release/{id}  → iPhone reads the FIRST record and opens the app.
//   2) https://…/?release={id}  → a USB NFC reader on a PC opens this web URL.
//   This way the same tag opens the native app on iOS AND the web on a computer.
//   (A single HTTPS-only tag would open the browser on iOS, not the app; opening
//   the app with no prompt needs Universal Links = a paid Apple ID.)
//
// Android Chrome: Web NFC API writes the tag directly from the page — one tap,
//   no app, no setup (the fastest path the platform allows).
// iOS: the browser can't write NFC. "Copiar enlace" copies the link to write with
//   an external NFC app (e.g. NFC Tools).
const SCHEME_BASE = 'vinylnfc://release'
const WEB_BASE = 'https://discogs-nfc.vercel.app/?release='

export default function NfcButton({ releaseId }) {
  const [status, setStatus] = useState('idle') // idle | writing | done | error | copied
  const [showHelp, setShowHelp] = useState(false)
  const { edits, setReleaseNfc } = useApp()
  const nfcWritten = !!edits?.[releaseId]?.nfc

  const supportsWebNfc = typeof window !== 'undefined' && 'NDEFReader' in window
  const tagUrl = `${SCHEME_BASE}/${releaseId}`
  const webUrl = `${WEB_BASE}${releaseId}`

  const handleWrite = async () => {
    if (supportsWebNfc) {
      // Android Chrome — write directly from the page.
      try {
        setStatus('writing')
        // eslint-disable-next-line no-undef
        const ndef = new NDEFReader()
        // Preferred: two URL records — the app scheme first (iPhone uses it) and
        // the web URL second (PC NFC readers use it).
        try {
          await ndef.write({
            records: [
              { recordType: 'url', data: tagUrl },
              { recordType: 'url', data: webUrl },
            ],
          })
        } catch {
          // Some tags/devices reject a multi-record write — fall back to a single
          // record (the app scheme) so the tag still works on the phone.
          await ndef.write({ records: [{ recordType: 'url', data: tagUrl }] })
        }
        setStatus('done')
        setReleaseNfc(releaseId, true) // auto-mark as written
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
    <div className="flex items-center gap-2 flex-wrap">
      {/* Written-status indicator — shown on every platform, tap to toggle by hand */}
      <button
        onClick={() => setReleaseNfc(releaseId, !nfcWritten)}
        title={nfcWritten ? 'Marcado como grabado (tocar para desmarcar)' : 'Sin grabar (tocar para marcar)'}
        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-sans transition-all ${
          nfcWritten
            ? 'border-green-700/50 bg-green-900/30 text-green-400'
            : 'border-border bg-card text-text-secondary hover:text-white'
        }`}
      >
        {nfcWritten ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
          </svg>
        )}
        {nfcWritten ? 'NFC grabado' : 'NFC sin grabar'}
      </button>

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

      {/* Copy the vinylnfc:// app link (to write with an external NFC app) */}
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
            <li><span className="text-white">Añadir un registro</span> → <span className="text-white">URL/URI</span> → pega el enlace <span className="text-white">vinylnfc://</span> → OK</li>
            <li>(Opcional, para el PC) <span className="text-white">Añadir un registro</span> → <span className="text-white">URL/URI</span> → <span className="text-white break-all">{webUrl}</span></li>
            <li><span className="text-white">Escribir</span> → acerca el iPhone al tag</li>
          </ol>
          <p className="opacity-60 pt-0.5">
            El primer registro abre la app en iPhone; el segundo (https) deja que un
            lector USB NFC en el PC abra la web del disco. Con la grabación directa
            desde Android se escriben los dos automáticamente.
          </p>
        </div>
      )}
    </div>
  )
}
