import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// A short, flashy confirmation that a scrobble succeeded. The spinning disc
// changes look depending on the release format:
//   vinyl  → black (or its Discogs colour) record with grooves + label
//   cd     → silvery rainbow disc
//   dvd    → purple-tinted disc
//   bluray → blue disc
//   sacd   → golden disc
const KIND_META = {
  vinyl: { label: 'Vinilo', glow: '#f5a623' },
  cd: { label: 'CD', glow: '#cdd9e6' },
  dvd: { label: 'DVD', glow: '#cdc6d4' },
  bluray: { label: 'Blu-ray', glow: '#3b82f6' },
  sacd: { label: 'SACD', glow: '#e8c34a' },
}

const OPTICAL_GRADIENT = {
  cd: 'conic-gradient(from 0deg, #b9c7d6, #f3c6e0, #c6e0f3, #c6f3d6, #f3edc6, #d6c6f3, #b9c7d6)',
  dvd: 'conic-gradient(from 0deg, #b8b8c0, #e6dce8, #cfc4d2, #d8d4dc, #efe6ee, #c6bcca, #b8b8c0)',
  bluray: 'conic-gradient(from 0deg, #0e2a6a, #2b6ef0, #69b0ff, #134fd0, #0e2a6a, #2b6ef0, #0e2a6a)',
  sacd: 'conic-gradient(from 0deg, #8a6a16, #e8c34a, #fff0b0, #d4af37, #a37b1e, #e8c34a, #8a6a16)',
}

function Disc({ kind, color }) {
  if (kind === 'vinyl') {
    const body = color || '#15151a'
    return (
      <div className="relative w-[84px] h-[84px]">
        <div
          className="absolute inset-0 rounded-full scrobble-disc-spin overflow-hidden"
          style={{
            backgroundColor: body,
            backgroundImage: [
              // fine, soft concentric grooves
              'repeating-radial-gradient(circle at 50% 50%, rgba(0,0,0,0.14) 0px, rgba(0,0,0,0.14) 1px, rgba(255,255,255,0.05) 1.6px, rgba(255,255,255,0.05) 2px)',
              // subtle reflective play-area band
              'radial-gradient(circle at 50% 50%, transparent 38%, rgba(255,255,255,0.07) 46%, transparent 60%)',
              // depth: gentle highlight in the middle fading to a darker rim
              'radial-gradient(circle at 50% 42%, rgba(255,255,255,0.10), transparent 48%, rgba(0,0,0,0.30) 100%)',
            ].join(', '),
            boxShadow: 'inset 0 0 1px 1px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.06), 0 6px 18px rgba(0,0,0,0.55)',
          }}
        >
          {/* centre label + spindle hole */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[32px] h-[32px] rounded-full flex items-center justify-center"
            style={{
              background: color ? '#0e0e12' : '#f5a623',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
            }}
          >
            <div className="w-[5px] h-[5px] rounded-full bg-black/85" />
          </div>
        </div>
        {/* fixed specular sweep — light reflecting off the surface */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              'linear-gradient(125deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.04) 26%, transparent 46%, transparent 60%, rgba(255,255,255,0.10) 78%, transparent 90%)',
          }}
        />
      </div>
    )
  }

  // optical disc
  return (
    <div className="relative w-[84px] h-[84px]">
      <div
        className="absolute inset-0 rounded-full scrobble-disc-spin"
        style={{
          background: OPTICAL_GRADIENT[kind] || OPTICAL_GRADIENT.cd,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25), 0 6px 18px rgba(0,0,0,0.55)',
        }}
      >
        {/* clear hub + spindle */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[32px] h-[32px] rounded-full bg-[#0d0d12] flex items-center justify-center"
          style={{ boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.28)' }}
        >
          <div
            className="w-[13px] h-[13px] rounded-full bg-[#1a1a22]"
            style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)' }}
          />
        </div>
      </div>
      {/* fixed glassy glint */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.4), transparent 45%)' }}
      />
    </div>
  )
}

export default function ScrobbleToast({ kind = 'cd', color, count = 0, partial, onDone }) {
  const [show, setShow] = useState(false)
  const meta = KIND_META[kind] || KIND_META.cd

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true))
    const hide = setTimeout(() => setShow(false), 2300)
    const done = setTimeout(() => onDone?.(), 2750)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(hide)
      clearTimeout(done)
    }
  }, [onDone])

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 pointer-events-none">
      <div
        className={`pointer-events-auto flex items-center gap-4 rounded-2xl border px-5 py-3.5 ${
          show ? 'scrobble-toast-in' : 'scrobble-toast-out'
        }`}
        style={{
          background: 'rgba(18,18,22,0.62)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderColor: meta.glow + '66',
          boxShadow: `0 12px 44px ${meta.glow}33, 0 4px 20px rgba(0,0,0,0.45)`,
        }}
      >
        <div className="relative shrink-0">
          {/* pulsing glow behind the disc */}
          <div
            className="absolute inset-0 rounded-full scrobble-glow"
            style={{ boxShadow: `0 0 24px 5px ${meta.glow}` }}
          />
          <Disc kind={kind} color={color} />
          {/* success check badge */}
          <div className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center border-2 border-[#121216] scrobble-check-pop">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        </div>

        <div className="min-w-0 pr-1">
          <p className="font-serif text-white text-base leading-tight">¡Scrobbleado!</p>
          <p className="text-sm text-text-secondary font-sans leading-tight mt-0.5">
            {count} pista{count !== 1 ? 's' : ''} · {meta.label}
          </p>
          {partial && (
            <p className="text-xs text-amber-400 font-sans leading-tight mt-0.5">
              Algunas pistas rechazadas por Last.fm
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
