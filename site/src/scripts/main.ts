import { initThemeToggle } from './theme-toggle';
import { initVarPanel } from './var-panel';
import { initCopyButtons } from './copy';
import { initImageLinks } from './image-links';
import { initSideMenu } from './side-menu';
import { initTrackMap } from './track-map';
import { initSearch } from './search';

for (const init of [initThemeToggle, initVarPanel, initCopyButtons, initImageLinks, initSideMenu, initTrackMap, initSearch]) {
  try {
    init();
  } catch (error) {
    console.error('Agentic Field Guide: a page script failed to start', error);
  }
}
