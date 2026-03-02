/**
 * PulseDot — animated pulsing status indicator.
 *
 * Alternates between bright and dim colors every 1 second when active.
 * Renders a steady dim dot when inactive. Used in RunningPanel to show
 * live process status.
 */

/* @jsxImportSource @opentui/solid */

import { createSignal, onMount, onCleanup } from 'solid-js';
import { statusColors } from '../theme.js';

export function PulseDot(props: { active?: boolean }) {
  const [bright, setBright] = createSignal(true);

  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    if (props.active !== false) {
      timer = setInterval(() => setBright((b) => !b), 1000);
    }
  });

  onCleanup(() => {
    if (timer) clearInterval(timer);
  });

  return (
    <text
      content="●"
      fg={
        props.active !== false
          ? bright()
            ? statusColors.running
            : statusColors.runningDim
          : statusColors.pending
      }
    />
  );
}
