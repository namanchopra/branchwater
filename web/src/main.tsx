import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './theme';
import './index.css';

/**
 * Entry point for the Branchwater (bw) web UI.
 *
 * Mounts the application shell ({@link App}) into `#root`. The per-session API
 * token is injected by the bw server into `index.html` as `window.__BW_TOKEN__`
 * (or `null` under a raw `vite dev` run); the typed API client reads it from
 * there and attaches it to every `/api/*` request — so nothing token-related is
 * threaded through React state here.
 */

const container = document.getElementById('root');
if (!container) {
  throw new Error('Branchwater web UI: #root element not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
