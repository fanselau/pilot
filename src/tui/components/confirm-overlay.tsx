/**
 * ConfirmOverlay — modal overlay for y/n confirmation dialogs.
 *
 * Passive component: renders the message and key hint text.
 * All key handling is done in app.tsx (same pattern as HelpOverlay).
 */

/* @jsxImportSource @opentui/solid */

import { statusColors, theme } from '../theme.js';

export function ConfirmOverlay(props: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <box
      position="absolute"
      top="40%"
      left="25%"
      width="50%"
      height={5}
      borderStyle="rounded"
      border={true}
      borderColor={statusColors.failed}
      title=" Confirm "
      backgroundColor={theme.bg}
      zIndex={100}
      padding={1}
      flexDirection="column"
    >
      <text content={props.message} fg={theme.fg} />
      <text content="Press y to confirm, n or Esc to cancel" fg={theme.muted} />
    </box>
  );
}
