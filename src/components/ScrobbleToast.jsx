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

// A spinning disc whose look depends on the release format. Size-aware so it can
// be reused both in the scrobble toast (small) and the cover easter egg (large).
export function Disc({ kind, color, translucent, size = 84, image }) {
  const hub = Math.round(size * 0.38)

  // Picture disc — the album artwork is printed across the whole vinyl.
  if (image) {
    const spindle = Math.max(4, Math.round(size * 0.05))
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full scrobble-disc-spin overflow-hidden"
          style={{
            backgroundImage: `url(${image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12), 0 6px 18px rgba(0,0,0,0.55)',
          }}
        >
          {/* faint vinyl grooves over the artwork */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              backgroundImage:
                'repeating-radial-gradient(circle at 50% 50%, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, rgba(255,255,255,0.05) 1.6px, rgba(255,255,255,0.05) 2.2px)',
              mixBlendMode: 'overlay',
            }}
          />
          {/* rotating light wedge → reflective shine */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.16) 0deg, transparent 30deg, transparent 185deg, rgba(255,255,255,0.09) 210deg, transparent 260deg, transparent 360deg)',
            }}
          />
          {/* centre spindle hole */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/85"
            style={{ width: spindle, height: spindle, boxShadow: '0 0 0 3px rgba(0,0,0,0.3)' }}
          />
        </div>
        {/* fixed specular sweep */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: 'linear-gradient(125deg, rgba(255,255,255,0.26), transparent 42%)' }}
        />
      </div>
    )
  }

  if (kind === 'vinyl') {
    const body = color || '#15151a'
    const spindle = Math.max(4, Math.round(size * 0.06))
    // Translucent / transparent vinyl reads like stained glass: lighter, glassier
    // grooves and a uniform brightening of the hue.
    const grooves = translucent
      ? 'repeating-radial-gradient(circle at 50% 50%, rgba(0,0,0,0.10) 0px, rgba(0,0,0,0.10) 1px, rgba(255,255,255,0.12) 1.6px, rgba(255,255,255,0.12) 2px)'
      : 'repeating-radial-gradient(circle at 50% 50%, rgba(0,0,0,0.14) 0px, rgba(0,0,0,0.14) 1px, rgba(255,255,255,0.05) 1.6px, rgba(255,255,255,0.05) 2px)'
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full scrobble-disc-spin overflow-hidden"
          style={{
            backgroundColor: body,
            backgroundImage: [
              // brighten the hue uniformly so it looks "see-through"
              ...(translucent ? ['linear-gradient(rgba(255,255,255,0.22), rgba(255,255,255,0.22))'] : []),
              // rotating light wedges — make the spin visible (grooves alone are
              // radially symmetric, so rotation wouldn't show otherwise)
              'conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.16) 0deg, transparent 28deg, transparent 175deg, rgba(255,255,255,0.09) 200deg, transparent 250deg, transparent 360deg)',
              grooves,
              // subtle reflective play-area band
              'radial-gradient(circle at 50% 50%, transparent 38%, rgba(255,255,255,0.07) 46%, transparent 60%)',
              // depth: gentle highlight in the middle fading to a darker rim
              translucent
                ? 'radial-gradient(circle at 50% 42%, rgba(255,255,255,0.18), transparent 55%, rgba(0,0,0,0.16) 100%)'
                : 'radial-gradient(circle at 50% 42%, rgba(255,255,255,0.10), transparent 48%, rgba(0,0,0,0.30) 100%)',
            ].join(', '),
            boxShadow: 'inset 0 0 1px 1px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.06), 0 6px 18px rgba(0,0,0,0.55)',
          }}
        >
          {/* centre label + spindle hole */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center"
            style={{
              width: hub,
              height: hub,
              background: color ? '#0e0e12' : '#f5a623',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
            }}
          >
            <div className="rounded-full bg-black/85" style={{ width: spindle, height: spindle }} />
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
  const innerHole = Math.max(11, Math.round(size * 0.155))
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full scrobble-disc-spin"
        style={{
          background: OPTICAL_GRADIENT[kind] || OPTICAL_GRADIENT.cd,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25), 0 6px 18px rgba(0,0,0,0.55)',
        }}
      >
        {/* clear hub + spindle */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0d0d12] flex items-center justify-center"
          style={{ width: hub, height: hub, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.28)' }}
        >
          <div
            className="rounded-full bg-[#1a1a22]"
            style={{ width: innerHole, height: innerHole, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)' }}
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

export default function ScrobbleToast({ kind = 'cd', color, translucent, image, count = 0, partial, onDone }) {
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
          <Disc kind={kind} color={color} translucent={translucent} image={image} />
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
