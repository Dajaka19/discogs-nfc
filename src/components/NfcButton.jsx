import { useState } from 'react'

// NFC tag writing — automatic per-tag flow.
//
// Android Chrome: Web NFC API (NDEFReader) writes directly from the page.
//   Tap button → hold to tag → done. Zero setup, no app.
//
// iOS: Safari/PWA cannot write NFC, and native Shortcuts has no write action.
//   Writing requires a third-party app. NFC.cool Tools exposes a Shortcuts
//   "Write Tag" action that accepts a dynamic URL via Shortcut Input.
//   One-time setup: user creates a "Write NFC" shortcut whose Write Tag action
//   reads Shortcut Input as the URL. After that, this button deep-links into
//   that shortcut with the release URL pre-passed:
//       shortcuts://run-shortcut?name=Write NFC&input=text&text=<releaseURL>
//   → Shortcuts opens, writes, user just holds the iPhone to the tag.
//
// Payload: https://discogs-nfc.vercel.app?release={id} — scanning opens the app.
const APP_BASE = 'https://discogs-nfc.vercel.app'
const SHORTCUT_NAME = 'Write NFC' // must match the user's Shortcut name exactly

export default function NfcButton({ releaseId }) {
  const [status, setStatus] = useState('idle') // idle | writing | done | error | copied
  const [showHelp, setShowHelp] = useState(false)

  const tagUrl = `${APP_BASE}?release=${releaseId}`
  const supportsWebNfc = typeof window !== 'undefined' && 'NDEFReader' in window

  const handleWrite = async () => {
    if (supportsWebNfc) {
      // Android Chrome — write directly
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
      // iOS — run the user's "Write NFC" shortcut with the URL as input
      const url =
        `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}` +
        `&input=text&text=${encodeURIComponent(tagUrl)}`
      window.location.href = url
    }
  }

  const handleCopy = () => {
    navigator.clipboard?.writeText(tagUrl).then(() => {
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 2500)
    })
  }

  const writeLabel = {
    idle: 'Write NFC',
    writing: 'Hold to tag…',
    done: 'Written!',
    error: 'Write failed',
    copied: 'Write NFC',
  }[status]

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Primary write action */}
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

        {/* Clipboard fallback */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-card text-text-secondary hover:text-white transition-all text-sm font-sans"
        >
          {status === 'copied' ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy URL
            </>
          )}
        </button>

        {/* How-to toggle */}
        <button
          onClick={() => setShowHelp((s) => !s)}
          title="One-time setup"
          className="w-7 h-7 flex items-center justify-center rounded-full border border-border text-text-secondary hover:text-white hover:border-accent/40 transition-all text-xs font-mono"
        >
          ?
        </button>
      </div>

      {/* One-time setup instructions (iPhone) */}
      {showHelp && (
        <div className="bg-card/80 border border-border rounded-xl p-3 text-xs font-sans text-text-secondary space-y-1.5 fade-in max-w-sm">
          <p className="text-white font-medium">Configuración única (solo una vez):</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>Instala <span className="text-white">NFC.cool Tools</span> (App Store)</li>
            <li>Abre <span className="text-white">Atajos</span> → nuevo atajo (<span className="text-white">+</span>)</li>
            <li>Añade acción → busca <span className="text-white">"NFC.cool"</span> → <span className="text-white">Write Tag</span></li>
            <li>Registro <span className="text-white">URL</span>; en el campo URL elige <span className="text-white">Entrada del atajo</span></li>
            <li>Nombra el atajo exactamente: <span className="text-accent font-mono">Write NFC</span></li>
          </ol>
          <p className="opacity-60 pt-0.5">
            Después: toca <span className="text-white">Write NFC</span> → se abre Atajos con la URL → acerca el iPhone al
            tag. Por cada disco, sin teclear nada.
          </p>
        </div>
      )}
    </div>
  )
}
