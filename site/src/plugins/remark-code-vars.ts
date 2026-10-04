import { visit } from 'unist-util-visit';
import type { Code, Html, Root } from 'mdast';
import { renderCodeBlock } from '../lib/code-html';

/** Replace fenced code with HTML whose $VARS the client can fill in. */
export function remarkCodeVars() {
  return (tree: Root) => {
    visit(tree, 'code', (node: Code, index, parent) => {
      if (!parent || index === undefined) return;
      const html: Html = { type: 'html', value: renderCodeBlock(node.value, node.lang) };
      parent.children.splice(index, 1, html);
    });
  };
}
