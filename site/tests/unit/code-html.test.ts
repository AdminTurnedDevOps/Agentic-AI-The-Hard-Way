import { describe, expect, it } from 'vitest';
import { escapeHtml, renderCodeBlock } from '../../src/lib/code-html';

describe('escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});

describe('renderCodeBlock', () => {
  it('wraps vars in spans and escapes everything else', () => {
    expect(renderCodeBlock('echo "<b>" $FOO', 'bash')).toBe(
      '<figure class="code" data-lang="bash"><pre><code>echo &quot;&lt;b&gt;&quot; <span class="var" data-var="FOO" data-raw="$FOO">$FOO</span></code></pre></figure>',
    );
  });
  it('adds a title and omits data-lang when no language', () => {
    expect(renderCodeBlock('x', null, 'main.tf')).toBe(
      '<figure class="code"><figcaption class="code-title">main.tf</figcaption><pre><code>x</code></pre></figure>',
    );
  });
});
