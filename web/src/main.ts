import '@fontsource-variable/hanken-grotesk';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/base.css';
import './styles/landing.css';
import './styles/studio.css';
import { initLang } from './i18n';

type View = 'landing' | 'studio';
let stopLanding: (() => void) | undefined;
let landingStarted = false;
let studioLoaded = false;

function viewFromHash(): View { return location.hash.startsWith('#/studio') ? 'studio' : 'landing'; }

async function route(): Promise<void> {
  const view = viewFromHash();
  document.body.dataset.view = view;
  const root = document.getElementById('studio-root')!;
  root.hidden = view !== 'studio';
  if (view === 'studio') {
    document.getElementById('veil')?.classList.add('gone');
    window.scrollTo(0, 0);
    if (!studioLoaded) {
      studioLoaded = true;
      const { mountStudio } = await import('./studio/mount');
      mountStudio(root);
    }
  } else if (!landingStarted) {
    landingStarted = true;
    try { stopLanding = await (await import('./landing')).startLanding(); }
    catch (err) {
      console.error(err);
      document.getElementById('veil')?.classList.add('gone');
      document.body.classList.add('no-webgl');
    }
  }
}

initLang();
window.addEventListener('hashchange', () => { void route(); });
void route();
void stopLanding;
