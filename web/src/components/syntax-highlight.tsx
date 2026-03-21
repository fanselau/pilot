/**
 * Lazy-loaded syntax highlighting component using shiki.
 *
 * Detects content type (JSON, shell, TypeScript, stack traces) via heuristics
 * and applies shiki syntax highlighting. Falls back to plain monospace text
 * when content doesn't match any known language or when highlighting fails.
 *
 * Performance:
 * - shiki is lazy-imported only when content matches a detectable language
 * - A module-level highlighter promise is shared across all instances
 * - Content >5000 chars bypasses highlighting entirely (plain <pre>)
 */

import { useState, useEffect } from 'react'

/** Max content length before bypassing syntax highlighting. */
const MAX_HIGHLIGHT_LENGTH = 5000

/** Detect language from content heuristics. */
export function detectLanguage(content: string): string | null {
  const trimmed = content.trimStart()

  // JSON detection
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {
      /* not valid JSON */
    }
  }

  // Shell/bash detection
  if (
    trimmed.startsWith('$') ||
    trimmed.startsWith('#!') ||
    /^(cd|ls|npm|git|cat|grep|mkdir|rm|curl|wget|echo|export)\s/.test(trimmed)
  ) {
    return 'shellscript'
  }

  // Stack trace detection
  if (/^\s*(at\s|Error:|TypeError:|SyntaxError:|ReferenceError:)/.test(trimmed)) {
    return 'javascript'
  }

  // TypeScript/JavaScript detection
  if (/^(import|export|const|let|var|function|class|interface|type)\s/.test(trimmed)) {
    return 'typescript'
  }

  return null
}

// ── Module-level shared highlighter ──────────────────────────────────────

let highlighterPromise: Promise<any> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-dark-default'],
        langs: ['json', 'shellscript', 'typescript', 'javascript'],
      }),
    )
  }
  return highlighterPromise
}

// ── Component ────────────────────────────────────────────────────────────

/** Highlighted code block — lazy loads shiki only when content is detectable. */
export function SyntaxHighlight({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const [html, setHtml] = useState<string | null>(null)
  const lang = detectLanguage(content)

  // Skip highlighting for very long content
  if (content.length > MAX_HIGHLIGHT_LENGTH) {
    return (
      <pre
        className={`text-xs font-mono whitespace-pre-wrap break-all ${className ?? ''}`}
      >
        {content}
      </pre>
    )
  }

  useEffect(() => {
    if (!lang) return
    let cancelled = false

    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return
        const highlighted = highlighter.codeToHtml(content, {
          lang,
          theme: 'github-dark-default',
        })
        setHtml(highlighted)
      })
      .catch(() => {
        // Fallback: no highlighting
      })

    return () => {
      cancelled = true
    }
  }, [content, lang])

  if (!lang || !html) {
    // Fallback: plain monospace
    return (
      <pre
        className={`text-xs font-mono whitespace-pre-wrap break-all ${className ?? ''}`}
      >
        {content}
      </pre>
    )
  }

  return (
    <div
      className={`text-xs [&_pre]:!bg-transparent [&_pre]:!p-0 [&_code]:text-xs ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
