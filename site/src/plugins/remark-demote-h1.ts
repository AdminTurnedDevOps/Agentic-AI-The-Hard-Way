import { visit } from 'unist-util-visit';
import type { Heading, Root } from 'mdast';

/** The page layout renders the lab title as the only H1. */
export function remarkDemoteH1() {
  return (tree: Root) => {
    visit(tree, 'heading', (node: Heading) => {
      if (node.depth === 1) node.depth = 2;
    });
  };
}
