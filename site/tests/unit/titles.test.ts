import { describe, expect, it } from 'vitest';
import { pageTitle } from '../../src/lib/titles';

describe('pageTitle', () => {
  it('prefers the README title', () => {
    expect(pageTitle('Deploy kagent', '# Installation', 'x/deploy-kagent.md')).toBe('Deploy kagent');
  });
  it('falls back to the first H1 outside code fences', () => {
    expect(pageTitle(null, '```bash\n# a comment\n```\n\n# Real Title\n', 'x/y.md')).toBe('Real Title');
  });
  it('falls back to the file name', () => {
    expect(pageTitle(null, 'no heading', 'platform-engineering-assistant/prompt-guard.md')).toBe('Prompt guard');
  });
});
