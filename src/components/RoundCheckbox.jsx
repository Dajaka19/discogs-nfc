import { useRef, useEffect } from 'react'

/**
 * Circular checkbox with three visual states:
 *   unchecked  → hollow amber ring
 *   checked    → filled amber disc + checkmark
 *   indeterminate → filled amber disc + dash
 */
export default function RoundCheckbox({ checked, indeterminate, onChange, size = 'md' }) {
  const dim = size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'
  const iconSize = size === 'lg' ? 10 : 8

  const active = checked || indeterminate

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={(e) => { e.stopPropagation(); onChange?.() }}
      className={`${dim} rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150 ${
        active
          ? 'bg-accent border-accent'
          : 'border-[#555] bg-transparent hover:border-accent/70'
      }`}
    >
      {checked && !indeterminate && (
        <svg width={iconSize} height={iconSize} viewBox="0 0 10 8" fill="none">
          <polyline
            points="1.5,4 3.8,6.5 8.5,1"
            stroke="black"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {indeterminate && (
        <div
          style={{ width: iconSize - 1, height: 1.5 }}
          className="bg-black rounded-full"
        />
      )}
    </button>
  )
}
