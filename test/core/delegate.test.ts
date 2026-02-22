import { describe, it, expect } from 'vitest';
import { parseDelegationOutput } from '../../src/core/delegate.js';

describe('parseDelegationOutput', () => {
  it('parses JSON from markdown code block', () => {
    const content = '```json\n{"steps":[{"command":"quick","args":"Fix the bug"}],"reasoning":"Quick task"}\n```';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('quick');
    expect(plan.steps[0].args).toBe('Fix the bug');
    expect(plan.reasoning).toBe('Quick task');
  });

  it('parses raw JSON without code block', () => {
    const content = '{"steps":[{"command":"add-phase","args":"Dark mode"}],"reasoning":"Phase 17"}';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('add-phase');
    expect(plan.steps[0].args).toBe('Dark mode');
    expect(plan.reasoning).toBe('Phase 17');
  });

  it('parses multi-step phase plan', () => {
    const content = '```json\n{"steps":[{"command":"add-phase","args":"Add OAuth"},{"command":"plan-phase","args":"17 --auto"},{"command":"execute-phase","args":"17"},{"command":"verify-phase","args":"17"}],"reasoning":"Adding as phase 17"}\n```';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(4);
    expect(plan.steps.map(s => s.command)).toEqual([
      'add-phase',
      'plan-phase',
      'execute-phase',
      'verify-phase',
    ]);
    expect(plan.steps[1].args).toBe('17 --auto');
    expect(plan.reasoning).toBe('Adding as phase 17');
  });

  it('throws on empty steps', () => {
    const content = '{"steps":[],"reasoning":"Nothing to do"}';
    expect(() => parseDelegationOutput(content)).toThrow('no steps');
  });

  it('throws on invalid JSON', () => {
    const content = 'This is not JSON at all';
    expect(() => parseDelegationOutput(content)).toThrow('Failed to parse');
  });

  it('throws on malformed step (missing command)', () => {
    const content = '{"steps":[{"args":"something"}],"reasoning":"Bad"}';
    expect(() => parseDelegationOutput(content)).toThrow('missing command or args');
  });

  it('throws on malformed step (missing args)', () => {
    const content = '{"steps":[{"command":"quick"}],"reasoning":"Bad"}';
    expect(() => parseDelegationOutput(content)).toThrow('missing command or args');
  });

  it('handles missing reasoning gracefully', () => {
    const content = '{"steps":[{"command":"quick","args":"Fix it"}]}';
    const plan = parseDelegationOutput(content);
    expect(plan.reasoning).toBe('');
    expect(plan.steps).toHaveLength(1);
  });

  it('handles surrounding text before/after JSON block', () => {
    const content = 'Here is the plan:\n\n```json\n{"steps":[{"command":"quick","args":"Do thing"}],"reasoning":"Simple"}\n```\n\nDone.';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('quick');
    expect(plan.steps[0].args).toBe('Do thing');
    expect(plan.reasoning).toBe('Simple');
  });

  it('parses milestone new-project step', () => {
    const content = '```json\n{"steps":[{"command":"new-project","args":"--auto Build a CRM tool"}],"reasoning":"New project, initializing with milestone scope"}\n```';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('new-project');
    expect(plan.steps[0].args).toBe('--auto Build a CRM tool');
  });

  it('parses milestone new-milestone step for existing project', () => {
    const content = '{"steps":[{"command":"new-milestone","args":"v2.0"}],"reasoning":"Existing project, creating new milestone"}';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('new-milestone');
    expect(plan.steps[0].args).toBe('v2.0');
  });

  it('throws when steps is not an array', () => {
    const content = '{"steps":"not-an-array","reasoning":"Bad"}';
    expect(() => parseDelegationOutput(content)).toThrow('no steps');
  });

  it('handles JSON with extra whitespace in code block', () => {
    const content = '```json\n  {\n    "steps": [\n      { "command": "quick", "args": "Fix bug" }\n    ],\n    "reasoning": "Formatted JSON"\n  }\n```';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('quick');
  });
});
