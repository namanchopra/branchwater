/**
 * Application shell for the Branchwater (bw) local web UI.
 *
 * Renders the persistent two-pane layout — a left sidebar (branding + branches)
 * and a main panel (action bar + the active tab: Snapshots / Tables / SQL /
 * Diff) — and proves the client/server loop end-to-end by loading
 * `GET /api/state` through the typed {@link api} client on mount.
 *
 * Loading, error (surfacing {@link BwApiError.message}), and empty states are all
 * handled so a failed or non-JSON response never crashes the app — it just shows
 * a retryable error banner.
 *
 * Theming: the whole tree is wrapped in a {@link ThemeProvider} (in `main.tsx`),
 * and the header exposes a {@link ThemeToggle}; all colors come from semantic
 * tokens so light/dark are a single attribute flip.
 *
 * @module App
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StateDTO } from '@bw/dto';
import { api, BwApiError } from './api';
import { TableBrowser } from './components/TableBrowser';
import { DiffView } from './components/DiffView';
import { SqlConsole } from './components/SqlConsole';
import { Actions } from './components/Actions';
import { UndoBanner } from './components/UndoBanner';
import { ThemeToggle } from './components/ThemeToggle';
import { Card, IconButton, cx } from './components/ui';
import { UndoProvider } from './undo';

/** Discriminated load state for the manifest fetch. */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; state: StateDTO }
  | { status: 'error'; message: string };

/** Which main-panel view is active. */
type Tab = 'snapshots' | 'tables' | 'sql' | 'diff';

export default function App(): React.JSX.Element {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [tab, setTab] = useState<Tab>('snapshots');

  const refresh = useCallback(async () => {
    // Refetch WITHOUT flipping back to the full-screen `loading` state on every
    // call: that would unmount the active tab (TableBrowser / SqlConsole) and
    // discard its local state — e.g. a SQL result grid — on each post-mutation
    // refresh, and flash the view on a checkout/snapshot. The initial mount
    // already starts in `loading`; subsequent refreshes swap the state in place.
    try {
      const state = await api.getState();
      setLoad({ status: 'ready', state });
    } catch (err) {
      const message =
        err instanceof BwApiError
          ? err.message
          : 'Unexpected error loading state';
      // A failed *background* refresh keeps the last good state mounted; only an
      // initial load (no ready state yet) surfaces the full error screen.
      setLoad((prev) => (prev.status === 'ready' ? prev : { status: 'error', message }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const state = load.status === 'ready' ? load.state : null;

  // The action bar wants a flat list of branch names; the diff view wants the
  // full BranchDTO list. Derive the names list once per state.
  const branchNames = useMemo(
    () => (state ? state.branches.map((b) => b.name) : []),
    [state],
  );

  // Any successful mutation (table action / SQL write / branch op) records an
  // Undo entry inside the UndoProvider; we refetch state so the UI reflects it.
  const onMutated = useCallback(() => {
    void refresh();
  }, [refresh]);

  return (
    // The whole shell shares one Undo context: the SQL console + table actions
    // record entries into it, and the app-wide UndoBanner reads from it.
    <UndoProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-bg text-content">
        <Sidebar load={load} />
        <main className="flex min-w-0 flex-1 flex-col">
          <Header head={state?.head} tab={tab} onTab={setTab} onRefresh={() => void refresh()} />

          {/* Manifest-mutating controls (snapshot / branch / checkout / delete).
              checkout + delete are gated by Actions' own ConfirmDialog. */}
          {state && (
            <Actions head={state.head} branches={branchNames} onRefresh={onMutated} />
          )}

          {load.status === 'loading' && (
            <section className="min-h-0 flex-1 overflow-auto p-6">
              <CenteredMessage>Loading state…</CenteredMessage>
            </section>
          )}
          {load.status === 'error' && (
            <section className="min-h-0 flex-1 overflow-auto p-6">
              <ErrorBanner message={load.message} onRetry={() => void refresh()} />
            </section>
          )}
          {load.status === 'ready' && tab === 'snapshots' && (
            <section className="min-h-0 flex-1 overflow-auto p-6">
              <Snapshots snapshots={load.state.snapshots} head={load.state.head} branches={load.state.branches} />
            </section>
          )}
          {/* TableBrowser, SqlConsole and DiffView own their own scroll/layout. */}
          {load.status === 'ready' && tab === 'tables' && <TableBrowser />}
          {load.status === 'ready' && tab === 'sql' && (
            <SqlConsole onMutated={onMutated} />
          )}
          {load.status === 'ready' && tab === 'diff' && (
            <DiffView branches={load.state.branches} initialTo={load.state.head} />
          )}
        </main>

        {/* App-wide Undo: visible over any tab once a mutation has been recorded.
            A successful restore refetches state. */}
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
          <UndoBanner onRestored={onMutated} />
        </div>
      </div>
    </UndoProvider>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout pieces                                                              */
/* -------------------------------------------------------------------------- */

/** The Branchwater wordmark + gradient glyph, reused in the sidebar header. */
function Brand(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 flex-none place-items-center rounded-lg text-base shadow-card"
        style={{ background: 'linear-gradient(150deg, var(--bw-accent), var(--bw-head))' }}
      >
        🌊
      </span>
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold tracking-tight">Branchwater</h1>
        <p className="truncate text-[11px] text-content-faint">git for your local databases</p>
      </div>
    </div>
  );
}

function Header(props: {
  head: string | undefined;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onRefresh: () => void;
}): React.JSX.Element {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'snapshots', label: 'Snapshots' },
    { id: 'tables', label: 'Tables' },
    { id: 'sql', label: 'SQL' },
    { id: 'diff', label: 'Diff' },
  ];
  return (
    <header className="flex items-center gap-4 border-b border-line bg-surface px-4 py-2.5">
      <nav className="flex gap-1" role="tablist">
        {tabs.map((t) => {
          const active = props.tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => props.onTab(t.id)}
              className={cx(
                'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                active
                  ? 'bg-accent-weak text-accent-text'
                  : 'text-content-muted hover:bg-surface-muted hover:text-content',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
      {props.head && (
        <span className="hidden items-center gap-2 rounded-full border border-line bg-surface-muted px-3 py-1 font-mono text-xs text-content-muted sm:inline-flex">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-head" />
          on <span className="text-content">{props.head}</span>
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <IconButton aria-label="Refresh" title="Refresh" onClick={props.onRefresh}>
          ⟳
        </IconButton>
      </div>
    </header>
  );
}

function Sidebar(props: { load: LoadState }): React.JSX.Element {
  const { load } = props;
  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-line bg-surface">
      <div className="border-b border-line px-4 py-4">
        <Brand />
      </div>
      <nav className="min-h-0 flex-1 overflow-auto p-3">
        <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-content-faint">
          Branches
        </p>
        {load.status === 'loading' && <p className="px-1 text-sm text-content-faint">Loading…</p>}
        {load.status === 'error' && (
          <p className="px-1 text-sm text-danger">Unavailable</p>
        )}
        {load.status === 'ready' &&
          (load.state.branches.length === 0 ? (
            <p className="px-1 text-sm text-content-faint">No branches yet</p>
          ) : (
            <ul className="space-y-0.5">
              {load.state.branches.map((branch) => {
                const isHead = branch.name === load.state.head;
                return (
                  <li key={branch.name}>
                    <div
                      className={cx(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                        isHead
                          ? 'bg-surface-muted text-content shadow-card'
                          : 'text-content-muted hover:bg-surface-muted hover:text-content',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cx(
                          'h-2.5 w-2.5 flex-none rounded-full border-2',
                          isHead ? 'border-head bg-head' : 'border-line-strong',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono">{branch.name}</span>
                      {isHead && (
                        <span className="flex-none rounded-full bg-head-weak px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-head">
                          head
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}
      </nav>
      <div className="mt-auto flex items-center gap-2 border-t border-line px-4 py-3 text-xs text-content-faint">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
        local · 127.0.0.1
      </div>
    </aside>
  );
}

function Snapshots(props: {
  snapshots: StateDTO['snapshots'];
  head: StateDTO['head'];
  branches: StateDTO['branches'];
}): React.JSX.Element {
  if (props.snapshots.length === 0) {
    return <CenteredMessage>No snapshots yet.</CenteredMessage>;
  }
  // The snapshot a branch (esp. HEAD) currently points at, for highlighting.
  const headSnapshotId =
    props.branches.find((b) => b.name === props.head)?.snapshotId ?? null;

  return (
    <ol className="relative ml-1 space-y-3 border-l-2 border-line pl-6">
      {props.snapshots.map((snap) => {
        const isHead = snap.id === headSnapshotId;
        return (
          <li key={snap.id} className="relative">
            <span
              aria-hidden="true"
              className={cx(
                'absolute -left-[1.95rem] top-3 h-3 w-3 rounded-full border-2 bg-surface',
                isHead ? 'border-head bg-head' : 'border-accent',
              )}
            />
            <Card className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm text-content-muted">{snap.id}</span>
                <span className="flex items-center gap-2 text-xs text-content-faint">
                  {isHead && (
                    <span className="rounded-full bg-head-weak px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-head">
                      head
                    </span>
                  )}
                  {snap.createdAt}
                </span>
              </div>
              {snap.message && <p className="mt-1 text-sm text-content">{snap.message}</p>}
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* Small shared bits                                                          */
/* -------------------------------------------------------------------------- */

function CenteredMessage(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center text-sm text-content-faint">
      {props.children}
    </div>
  );
}

function ErrorBanner(props: { message: string; onRetry: () => void }): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-4 rounded-xl border border-danger-weak bg-danger-weak px-4 py-3"
    >
      <div>
        <p className="text-sm font-semibold text-danger">Could not load state</p>
        <p className="mt-0.5 text-sm text-danger-text">{props.message}</p>
      </div>
      <button
        type="button"
        onClick={props.onRetry}
        className="flex-shrink-0 rounded-lg border border-danger-weak bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-weak"
      >
        Retry
      </button>
    </div>
  );
}
