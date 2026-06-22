/**
 * Small, dependency-free data-fetching hooks for the Branchwater (bw) web UI.
 *
 * These wrap the typed {@link api} client (see `../api`) with the bare minimum
 * of a query/mutation library — no React Query, no SWR — implemented on plain
 * `useState`/`useEffect`/`useRef`. They guarantee three things callers rely on:
 *
 * 1. **Stale-response safety.** Every in-flight {@link useQuery} request carries a
 *    monotonically increasing sequence number; when a response lands, it is only
 *    committed if it belongs to the *latest* request. A slow earlier fetch can
 *    therefore never clobber a newer one (the classic out-of-order race).
 * 2. **No setState after unmount.** A per-hook `mounted` ref gates every state
 *    write, so a request that resolves after the component has gone away is
 *    silently dropped instead of warning / leaking.
 * 3. **Coordinated refetch.** A lightweight pub/sub {@link RefetchBus} lets a
 *    mutation invalidate dependent queries: queries subscribe via
 *    {@link useQuery}'s `bus` option, and {@link useMutation} (or any caller)
 *    fires {@link RefetchBus.invalidate} after a successful write to refresh them.
 *
 * Errors are normalized to a human-readable string (preferring
 * {@link BwApiError.message}) so views can render `error` directly.
 *
 * @module hooks/useApi
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BwApiError } from '../api';

/* -------------------------------------------------------------------------- */
/* Error normalization                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Coerce any thrown value into a display-ready message, preferring the typed
 * {@link BwApiError.message} the api client raises for non-2xx / transport /
 * malformed responses.
 */
export function toErrorMessage(err: unknown, fallback = 'Unexpected error'): string {
  if (err instanceof BwApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

/* -------------------------------------------------------------------------- */
/* Refetch bus — coordinated invalidation across queries                      */
/* -------------------------------------------------------------------------- */

/** A subscriber notified when (matching) data should be refetched. */
type RefetchListener = (key: string) => void;

/**
 * A tiny synchronous pub/sub used to coordinate refetches: queries subscribe and
 * refetch when a (matching) key is invalidated; mutations call
 * {@link RefetchBus.invalidate} after a successful write.
 *
 * The wildcard `"*"` invalidates every subscriber. A subscriber listening on a
 * specific key is also woken by a `"*"` invalidation.
 */
export interface RefetchBus {
  /** Register a listener; returns an unsubscribe function. */
  subscribe(listener: RefetchListener): () => void;
  /**
   * Notify subscribers that data under `key` is stale. Pass `"*"` (the default)
   * to refetch everything subscribed to this bus.
   */
  invalidate(key?: string): void;
}

/** Construct a standalone {@link RefetchBus} (mainly useful for tests). */
export function createRefetchBus(): RefetchBus {
  const listeners = new Set<RefetchListener>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    invalidate(key = '*') {
      // Snapshot first: a listener may (un)subscribe during iteration.
      for (const listener of [...listeners]) listener(key);
    },
  };
}

/**
 * Get a {@link RefetchBus} whose identity is stable for the lifetime of the
 * component. Share the returned bus between a {@link useQuery} and the
 * {@link useMutation}s that should refresh it.
 */
export function useRefetchBus(): RefetchBus {
  const ref = useRef<RefetchBus | null>(null);
  if (ref.current === null) ref.current = createRefetchBus();
  return ref.current;
}

/* -------------------------------------------------------------------------- */
/* useQuery                                                                   */
/* -------------------------------------------------------------------------- */

/** The state surface returned by {@link useQuery}. */
export interface QueryResult<T> {
  /** The latest successfully-fetched value, or `undefined` before first success. */
  data: T | undefined;
  /** `true` while a request is in flight (including the initial load). */
  loading: boolean;
  /** A display-ready message for the most recent failure, else `undefined`. */
  error: string | undefined;
  /** Imperatively re-run the fetcher (e.g. a manual "Refresh" button). */
  refetch: () => void;
}

/** Options for {@link useQuery}. */
export interface QueryOptions {
  /**
   * When `false`, the query does not fetch (and reports `loading: false`). Use
   * for dependent queries whose inputs are not yet available. Defaults to `true`.
   */
  enabled?: boolean;
  /**
   * A {@link RefetchBus} to listen on: an `invalidate(key)` matching this query's
   * {@link QueryOptions.key} (or `"*"`) triggers a refetch. Pair with
   * {@link useMutation}'s `bus` to coordinate post-write refreshes.
   */
  bus?: RefetchBus;
  /**
   * The invalidation key this query answers to (e.g. `"state"`). A bare
   * `invalidate()` / `invalidate("*")` always matches. Defaults to `"*"`.
   */
  key?: string;
}

/**
 * Run an async fetcher and expose `{ data, loading, error, refetch }`.
 *
 * @typeParam T - The resolved value type of `fetcher`.
 * @param fetcher - Produces the data. **Stabilize it** (e.g. `useCallback`) — the
 *   query re-runs whenever its identity changes, which is how parameter changes
 *   (a new table name, offset, …) drive a refetch.
 * @param options - See {@link QueryOptions}.
 *
 * Guarantees: stale responses are dropped (sequence-checked), and no state is
 * written after unmount.
 */
export function useQuery<T>(
  fetcher: () => Promise<T>,
  options: QueryOptions = {},
): QueryResult<T> {
  const { enabled = true, bus, key = '*' } = options;

  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(enabled);

  // Tracks mount status so a late-resolving request never setStates after unmount.
  const mounted = useRef(true);
  // Monotonic request id; only the newest response is allowed to commit.
  const seq = useRef(0);
  // Latest fetcher, so the stable `run` callback always calls the current one
  // without itself changing identity (which would loop the bus subscription).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(() => {
    if (!enabled) {
      // Disabled: settle to an idle, non-loading state.
      if (mounted.current) setLoading(false);
      return;
    }
    const id = ++seq.current;
    if (mounted.current) {
      setLoading(true);
      setError(undefined);
    }
    void fetcherRef.current().then(
      (value) => {
        // Drop if unmounted or superseded by a newer request.
        if (!mounted.current || id !== seq.current) return;
        setData(value);
        setError(undefined);
        setLoading(false);
      },
      (err: unknown) => {
        if (!mounted.current || id !== seq.current) return;
        setError(toErrorMessage(err));
        setLoading(false);
      },
    );
  }, [enabled]);

  // Initial load + re-run on dependency change (fetcher identity / enabled).
  useEffect(() => {
    run();
  }, [run, fetcher]);

  // Subscribe to coordinated invalidation, if a bus was provided.
  useEffect(() => {
    if (!bus) return undefined;
    return bus.subscribe((invalidatedKey) => {
      if (invalidatedKey === '*' || invalidatedKey === key) run();
    });
  }, [bus, key, run]);

  // Own the mounted ref's lifecycle. Set true on (re)mount to be resilient to
  // React StrictMode's mount→unmount→remount in development.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return { data, loading, error, refetch: run };
}

/* -------------------------------------------------------------------------- */
/* useMutation                                                                */
/* -------------------------------------------------------------------------- */

/** The state surface returned by {@link useMutation}. */
export interface MutationResult<TArgs extends unknown[], TResult> {
  /**
   * Invoke the mutation. Resolves with the result on success; on failure it sets
   * {@link MutationResult.error} and rejects (so callers may `try/catch` too).
   */
  mutate: (...args: TArgs) => Promise<TResult>;
  /** `true` while the mutation is in flight. */
  loading: boolean;
  /** A display-ready message for the most recent failure, else `undefined`. */
  error: string | undefined;
  /** Clear any prior {@link MutationResult.error}. */
  reset: () => void;
}

/** Options for {@link useMutation}. */
export interface MutationOptions {
  /**
   * A {@link RefetchBus} to fire after a successful mutation, refreshing any
   * {@link useQuery} subscribed to it — the coordinated-refetch path.
   */
  bus?: RefetchBus;
  /**
   * Key to pass to {@link RefetchBus.invalidate} on success. Defaults to `"*"`
   * (refetch everything on the bus).
   */
  invalidateKey?: string;
}

/**
 * Wrap a write operation (e.g. `api.checkout`) with `{ mutate, loading, error }`
 * and, when a `bus` is supplied, trigger a coordinated refetch of dependent
 * queries on success.
 *
 * @typeParam TArgs - The mutator's argument tuple.
 * @typeParam TResult - The mutator's resolved value.
 * @param mutator - Performs the write. **Stabilize it** (e.g. `useCallback`).
 */
export function useMutation<TArgs extends unknown[], TResult>(
  mutator: (...args: TArgs) => Promise<TResult>,
  options: MutationOptions = {},
): MutationResult<TArgs, TResult> {
  const { bus, invalidateKey = '*' } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const mounted = useRef(true);
  const mutatorRef = useRef(mutator);
  mutatorRef.current = mutator;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reset = useCallback(() => {
    if (mounted.current) setError(undefined);
  }, []);

  const mutate = useCallback(
    async (...args: TArgs): Promise<TResult> => {
      if (mounted.current) {
        setLoading(true);
        setError(undefined);
      }
      try {
        const result = await mutatorRef.current(...args);
        if (mounted.current) setLoading(false);
        // Refresh dependent queries only on success.
        bus?.invalidate(invalidateKey);
        return result;
      } catch (err) {
        if (mounted.current) {
          setError(toErrorMessage(err));
          setLoading(false);
        }
        throw err;
      }
    },
    [bus, invalidateKey],
  );

  return { mutate, loading, error, reset };
}

/* -------------------------------------------------------------------------- */
/* Convenience: a stable fetcher helper                                       */
/* -------------------------------------------------------------------------- */

/**
 * Memoize an async fetcher by its dependency list, mirroring `useCallback` but
 * named for query usage. Pass the result straight to {@link useQuery}; changing
 * a dependency (a new table, a new offset) changes the fetcher identity and so
 * re-runs the query.
 */
export function useFetcher<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
): () => Promise<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are caller-owned.
  return useMemo(() => fetcher, deps);
}
