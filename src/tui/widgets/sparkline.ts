/**
 * Sparkline chart widget — renders a mini bar chart from an array of numbers.
 *
 * Pure function, no UI dependencies. Returns a single-line string of
 * Unicode block characters suitable for inline display in TUI panels.
 */

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export function sparkline(data: number[], width?: number): string {
  if (data.length === 0) return '';
  const values = width && data.length > width ? data.slice(-width) : data;
  const max = Math.max(...values, 1); // avoid division by zero
  return values
    .map((v) => {
      const idx = Math.round((v / max) * (BLOCKS.length - 1));
      return BLOCKS[Math.min(idx, BLOCKS.length - 1)];
    })
    .join('');
}
