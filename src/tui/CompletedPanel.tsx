/**
 * Completed sessions panel for the TUI dashboard.
 *
 * Shows recent session completions with relative time (e.g., "5m ago").
 * New completions flash green briefly (3s) before settling.
 *
 * TUI module — depends on React + Ink. No picocolors, no cli-table3.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import type { SessionInfo } from '../core/types.js';

export interface CompletedPanelProps {
  sessions: SessionInfo[];
  active: boolean;
  selectedIndex: number;
  width: number;
  height: number;
}

function relativeTime(epochMs: number): string {
  const ago = Date.now() - epochMs;
  if (ago < 60_000) {
    return `${Math.round(ago / 1000)}s ago`;
  }
  if (ago < 3_600_000) {
    return `${Math.round(ago / 60_000)}m ago`;
  }
  return `${Math.round(ago / 3_600_000)}h ago`;
}

export function CompletedPanel({
  sessions,
  active,
  selectedIndex,
  width,
  height,
}: CompletedPanelProps): React.ReactElement {
  const borderColor = active ? 'green' : 'gray';
  const maxVisible = Math.max(1, height - 2);

  // Flash effect: track previously-seen session IDs
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(sessions.map((s) => s.id));
    const newIds: string[] = [];

    for (const id of currentIds) {
      if (!prevIdsRef.current.has(id)) {
        newIds.push(id);
      }
    }

    if (newIds.length > 0) {
      setFlashIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) {
          next.add(id);
        }
        return next;
      });

      // Remove flash after 3 seconds
      const timer = setTimeout(() => {
        setFlashIds((prev) => {
          const next = new Set(prev);
          for (const id of newIds) {
            next.delete(id);
          }
          return next;
        });
      }, 3000);

      // Cleanup in case component unmounts
      return () => {
        clearTimeout(timer);
      };
    }

    prevIdsRef.current = currentIds;
    return undefined;
  }, [sessions]);

  // Also update prevIds when sessions change without new items
  useEffect(() => {
    prevIdsRef.current = new Set(sessions.map((s) => s.id));
  }, [sessions]);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      width={width}
      height={height}
    >
      <Text bold> Completed</Text>
      {sessions.length === 0 ? (
        <Text dimColor>  No recent completions</Text>
      ) : (
        sessions.slice(0, maxVisible).map((s, i) => {
          const isSelected = active && i === selectedIndex;
          const isFlashing = flashIds.has(s.id);
          const prefix = isSelected ? '> ' : '  ';
          const time = relativeTime(s.updated);
          const maxTitleLen = Math.max(10, width - time.length - 10);
          const title = s.title.length > maxTitleLen
            ? s.title.slice(0, maxTitleLen - 1) + '\u2026'
            : s.title;

          return (
            <Box key={s.id}>
              <Text bold={isSelected || isFlashing} inverse={isSelected} color={isFlashing ? 'green' : undefined}>
                {prefix}<Text color="green">✓</Text> {title}  <Text dimColor>{time}</Text>
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}
