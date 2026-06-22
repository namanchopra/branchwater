/**
 * Contract tests for the REAL {@link api} client (no module mock): they stub the
 * global `fetch` and assert the exact HTTP **method + path + body** each method
 * issues, plus that the session token is attached.
 *
 * This is the regression guard for a contract drift that shipped once: the
 * client sent `DELETE`/`PATCH` to `.../rows`, but the server only registers
 * `POST .../rows/delete` and `POST .../rows/update` — so deletes/updates 405'd
 * with "Method DELETE not allowed". The component tests mock `../api` wholesale
 * and therefore could never catch this; these tests pin the wire contract so the
 * client and the server routes (see `test/server/server-mutate.test.ts`) cannot
 * silently diverge again.
 *
 * @module api.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

/** A minimal 2xx JSON Response stand-in for the stubbed `fetch`. */
function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('api client wire contract (method + path + token)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (window as unknown as { __BW_TOKEN__?: string }).__BW_TOKEN__ = 'tok-123';
    fetchMock = vi.fn(async () => okJson({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { __BW_TOKEN__?: string }).__BW_TOKEN__;
  });

  /** The (url, init) of the most recent fetch call. */
  function lastCall(): { url: string; method: string; body: unknown; token: string | undefined } {
    const call = fetchMock.mock.calls.at(-1);
    if (call === undefined) throw new Error('fetch was not called');
    const [url, init] = call as [string, RequestInit];
    const headers = (init.headers ?? {}) as Record<string, string>;
    return {
      url: String(url),
      method: String(init.method),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      token: headers['x-bw-token'],
    };
  }

  it('deleteRow → POST .../rows/delete with confirm + token (was DELETE → 405)', async () => {
    await api.deleteRow('pg', 'users', { id: 3 }, 'public');
    const c = lastCall();
    expect(c.method).toBe('POST');
    expect(c.url).toBe('/api/engines/pg/tables/users/rows/delete?schema=public');
    expect(c.body).toEqual({ where: { id: 3 }, confirm: true });
    expect(c.token).toBe('tok-123');
  });

  it('updateRow → POST .../rows/update with confirm (was PATCH → 405)', async () => {
    await api.updateRow('pg', 'users', { id: 3 }, { email: 'a@b.c' });
    const c = lastCall();
    expect(c.method).toBe('POST');
    expect(c.url).toBe('/api/engines/pg/tables/users/rows/update');
    expect(c.body).toEqual({ where: { id: 3 }, set: { email: 'a@b.c' }, confirm: true });
  });

  it('insertRow → POST .../rows (no action sub-path) with confirm', async () => {
    await api.insertRow('pg', 'users', { email: 'a@b.c' }, 'public');
    const c = lastCall();
    expect(c.method).toBe('POST');
    expect(c.url).toBe('/api/engines/pg/tables/users/rows?schema=public');
    expect(c.body).toEqual({ values: { email: 'a@b.c' }, confirm: true });
  });

  it('truncateTable / dropTable → POST their sub-paths with confirm', async () => {
    await api.truncateTable('pg', 'users', 'public');
    expect(lastCall()).toMatchObject({
      method: 'POST',
      url: '/api/engines/pg/tables/users/truncate?schema=public',
      body: { confirm: true },
    });

    await api.dropTable('pg', 'users');
    expect(lastCall()).toMatchObject({
      method: 'POST',
      url: '/api/engines/pg/tables/users/drop',
      body: { confirm: true },
    });
  });

  it('executeSql / restore → POST with confirm', async () => {
    await api.executeSql('pg', 'SELECT 1');
    expect(lastCall()).toMatchObject({
      method: 'POST',
      url: '/api/engines/pg/sql',
      body: { sql: 'SELECT 1', confirm: true },
    });

    await api.restore('snap_abc');
    expect(lastCall()).toMatchObject({
      method: 'POST',
      url: '/api/restore',
      body: { snapshotId: 'snap_abc', confirm: true },
    });
  });
});
