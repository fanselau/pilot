/**
 * Copy-to-clipboard button with inline feedback.
 *
 * Uses navigator.clipboard API with a brief "Copied!" confirmation.
 * Compact inline design — no toast dependency, no modal interruption.
 */

import { useState, useCallback } from 'react'

export function CopyButton({ text, label = 'Copy', className }: {
  text: string; label?: string; className?: string
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [text])
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ${className ?? ''}`}
      title={label}
    >
      {copied ? (
        <span className="text-emerald-400 text-[10px]">Copied!</span>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5" y="5" width="9" height="9" rx="1.5" />
          <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
        </svg>
      )}
    </button>
  )
}
