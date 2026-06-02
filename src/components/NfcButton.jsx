import { useState } from 'react'

// NFC tag writing.
//
// Native iOS app: tapping "Grabar tag" navigates to vinylnfc://write/<id>, which
//   the app's AppDelegate intercepts to start a Core NFC write session that writes
//   vinylnfc://release/<id> to the tag. (Core NFC needs the NFC entitlement → a
//   paid Apple Developer account; without it the session ends with a sandbox error.)
// Android Chrome: Web NFC API writes directly from the page.
// Anywhere: "Copiar enlace" copies vinylnfc://release/<id> to write with another app.
//
// Tag payload: vinylnfc://release/{id} → opens the app at that release.
const SCHEME_BASE = 'vinylnfc://release'

export default function NfcButton({ releaseId }) {
  const [status, setStatus] = useState('idle') // idle | writing | done | error | copied

  const tagUrl = `${SCHEME_BASE}/${releaseId}`
  const supportsWebNfc = typeof window !== 'undefined' && 'NDEFReader' in window

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
      // Native iOS app — trigger the native Core NFC writer via the app's scheme.
      window.location.href = `vinylnfc://write/${releaseId}`
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
    <div className="flex items-center gap-2">
      {/* Write action (native NFC in the app, Web NFC on Android) */}
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

      {/* Copy the vinylnfc:// app link (to write with another NFC app) */}
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
    </div>
  )
}
