import { describe, expect, it } from 'vitest';
import { findImageRefs, findOrphanPages, findUnreferencedImages } from '../../src/lib/content-report';

describe('findImageRefs', () => {
  it('resolves relative image paths and skips URLs and empty refs', () => {
    const md = '![a](../images/x.png) ![](images/y.png "t") ![e]() ![w](https://x.dev/z.png)';
    expect(findImageRefs(md, 'lab/page.md')).toEqual(['images/x.png', 'lab/images/y.png']);
  });
});

describe('findOrphanPages', () => {
  it('lists markdown that is neither in the nav nor inside a linked folder', () => {
    const md = ['a/in-nav.md', 'a/orphan.md', 'apps/app/setup.md'];
    expect(findOrphanPages(md, new Set(['a/in-nav.md']), ['apps/app'])).toEqual(['a/orphan.md']);
  });
});

describe('findUnreferencedImages', () => {
  it('lists images nothing references', () => {
    expect(findUnreferencedImages(['i/a.png', 'i/b.png'], new Set(['i/a.png']))).toEqual(['i/b.png']);
  });
});
