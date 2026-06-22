/**
 * Component tests for the Branchwater (bw) table-action (mutation) surface.
 *
 * These render the REAL editor components against a MOCKED `../../api` module —
 * no HTTP happens — and assert the *safety* contract of the write path end to
 * end through the UI:
 *
 *  - **Inline edit** (TablePreview): clicking a cell, editing, and Save calls
 *    `api.updateRow` with a non-empty `where` (the primary key when known) and
 *    the changed column in `set`.
 *  - **Delete a row** (TablePreview): the Delete button only calls
 *    `api.deleteRow` *after* the ConfirmDialog is confirmed — cancelling never
 *    touches the database.
 *  - **Add a row** (AddRowForm): submitting calls `api.insertRow` with the
 *    typed values and reports the returned `undoSnapshotId`.
 *  - **Export** (ExportMenu): `toCsv` / `toJson` produce valid, correctly
 *    escaped CSV and parseable JSON for tricky cell values.
 *  - **Undo** (UndoBanner): appears only after an action records an undo entry,
 *    and clicking Undo calls `api.restore` with that snapshot id, then hides.
 *
 * The mock keeps the real {@link BwApiError} class (components branch on
 * `err instanceof BwApiError`) and the real {@link UndoProvider} so the
 * record/restore wiring is exercised for real — only the network layer is faked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import type {
  ColumnInfo,
  MutationResDTO,
  SqlResDTO,
  StateDTO,
  TablePageDTO,
} from '@bw/dto';

/* -------------------------------------------------------------------------- */
/* Mock the API client                                                        */
/*                                                                            */
/* Mirrors components.test.tsx: keep the REAL BwApiError export, swap each api */
/* method for a vi.fn we program per test. We add the mutation + restore      */
/* methods (TASK-024's surface) on top of the read methods.                   */
/* -------------------------------------------------------------------------- */

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    api: {
      getState: vi.fn(),
      snapshot: vi.fn(),
      branch: vi.fn(),
      checkout: vi.fn(),
      deleteBranch: vi.fn(),
      getEngines: vi.fn(),
      getTables: vi.fn(),
      getTablePage: vi.fn(),
      getDiff: vi.fn(),
      executeSql: vi.fn(),
      insertRow: vi.fn(),
      updateRow: vi.fn(),
      deleteRow: vi.fn(),
      truncateTable: vi.fn(),
      dropTable: vi.fn(),
      restore: vi.fn(),
    },
  };
});

// Imported AFTER vi.mock so these resolve to the mocked module.
import { api } from '../../api';
import { UndoProvider, useUndo } from '../../undo';
import { TablePreview } from '../TablePreview';
import { AddRowForm } from '../AddRowForm';
import { SqlConsole } from '../SqlConsole';
import { UndoBanner } from '../UndoBanner';
import { ExportMenu, toCsv, toJson } from '../ExportMenu';

/** The api singleton, typed as a record of mocked methods for convenience. */
const mockApi = api as unknown as {
  getEngines: ReturnType<typeof vi.fn>;
  getTablePage: ReturnType<typeof vi.fn>;
  executeSql: ReturnType<typeof vi.fn>;
  insertRow: ReturnType<typeof vi.fn>;
  updateRow: ReturnType<typeof vi.fn>;
  deleteRow: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

/* -------------------------------------------------------------------------- */
/* Shared fixtures                                                            */
/* -------------------------------------------------------------------------- */

/** A minimal, valid StateDTO for mutation responses to carry. */
const state: StateDTO = {
  version: 1,
  head: 'main',
  branches: [],
  snapshots: [],
};

// `int` (not `integer`) so AddRowForm's numeric heuristic — `\b(int|...)\b` —
// recognizes the column and parses the entered text to a JS number.
const columns: ColumnInfo[] = [
  { name: 'id', type: 'int', nullable: false },
  { name: 'name', type: 'text', nullable: true },
];

/** Build a single-page TablePageDTO from the given rows. */
function pageOf(rows: Array<Record<string, unknown>>): TablePageDTO {
  return {
    engine: 'primary',
    table: 'users',
    page: {
      columns,
      rows,
      total: rows.length,
      offset: 0,
      limit: 25,
    },
  };
}

/** A MutationResDTO carrying the given undo snapshot id (and a command tag). */
function mutationRes(undoSnapshotId: string, command = 'UPDATE 1'): MutationResDTO {
  return {
    result: { command, rowCount: 1 },
    undoSnapshotId,
    state,
  };
}

/* -------------------------------------------------------------------------- */
/* TablePreview — inline edit                                                 */
/* -------------------------------------------------------------------------- */

describe('TablePreview inline edit', () => {
  it('calls api.updateRow with the PK where + changed set on Save', async () => {
    mockApi.getTablePage.mockResolvedValue(
      pageOf([{ id: 1, name: 'Ada' }]),
    );
    mockApi.updateRow.mockResolvedValue(mutationRes('snap_edit'));

    render(
      <UndoProvider>
        <TablePreview engine="primary" table="users" primaryKey={['id']} />
      </UndoProvider>,
    );

    // The first page renders; click the "name" cell to begin editing.
    const cell = await screen.findByText('Ada');
    fireEvent.click(cell);

    // The inline editor appears. Editing alone must NOT call the API.
    const input = await screen.findByDisplayValue('Ada');
    expect(mockApi.updateRow).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockApi.updateRow).toHaveBeenCalledTimes(1));

    // PK-keyed, non-empty where; only the changed column in set.
    const [engine, table, where, set] = mockApi.updateRow.mock.calls[0]!;
    expect(engine).toBe('primary');
    expect(table).toBe('users');
    expect(where).toEqual({ id: 1 });
    expect(set).toEqual({ name: 'Grace' });

    // The edit recorded an undo entry, so the banner can offer a rollback.
    await waitFor(() =>
      expect(mockApi.getTablePage).toHaveBeenCalledTimes(2),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* TablePreview — delete behind ConfirmDialog                                 */
/* -------------------------------------------------------------------------- */

describe('TablePreview delete', () => {
  it('does not call api.deleteRow until the ConfirmDialog is confirmed', async () => {
    mockApi.getTablePage.mockResolvedValue(pageOf([{ id: 7, name: 'Lin' }]));
    mockApi.deleteRow.mockResolvedValue(mutationRes('snap_del', 'DELETE 1'));

    render(
      <UndoProvider>
        <TablePreview engine="primary" table="users" primaryKey={['id']} />
      </UndoProvider>,
    );

    await screen.findByText('Lin');

    // Clicking the row's Delete button opens the confirm gate — no API call yet.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(mockApi.deleteRow).not.toHaveBeenCalled();

    // Cancel: still no delete, dialog closes.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(mockApi.deleteRow).not.toHaveBeenCalled();

    // Re-open and confirm: now the delete fires with a non-empty PK where.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog2 = await screen.findByRole('dialog');
    fireEvent.click(within(dialog2).getByRole('button', { name: 'Delete row' }));

    await waitFor(() => expect(mockApi.deleteRow).toHaveBeenCalledTimes(1));
    const [engine, table, where] = mockApi.deleteRow.mock.calls[0]!;
    expect(engine).toBe('primary');
    expect(table).toBe('users');
    expect(where).toEqual({ id: 7 });
  });
});

/* -------------------------------------------------------------------------- */
/* AddRowForm — insert                                                        */
/* -------------------------------------------------------------------------- */

describe('AddRowForm', () => {
  it('submits typed values via api.insertRow and reports the undo id', async () => {
    mockApi.insertRow.mockResolvedValue(mutationRes('snap_ins', 'INSERT 0 1'));
    const onDone = vi.fn();

    render(
      <AddRowForm engine="primary" table="users" columns={columns} onDone={onDone} />,
    );

    // `id` is NOT NULL (required); `name` is nullable and defaults to NULL.
    // Locate the `id` field by its label cell, then fill it.
    const idField = within(
      screen.getByText('id').closest('div') as HTMLElement,
    ).getByRole('textbox');
    fireEvent.change(idField, { target: { value: '42' } });

    expect(mockApi.insertRow).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Insert row' }));

    await waitFor(() => expect(mockApi.insertRow).toHaveBeenCalledTimes(1));

    const [engine, table, values] = mockApi.insertRow.mock.calls[0]!;
    expect(engine).toBe('primary');
    expect(table).toBe('users');
    // numeric column parsed to a number; nullable `name` defaulted to NULL.
    expect(values).toEqual({ id: 42, name: null });

    // The success path forwards the server's undo snapshot id.
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('snap_ins'));
  });

  it('blocks submit and never calls the API when a required field is blank', () => {
    const onDone = vi.fn();
    render(
      <AddRowForm engine="primary" table="users" columns={columns} onDone={onDone} />,
    );

    // `id` (NOT NULL) left blank — submit must be refused client-side.
    fireEvent.click(screen.getByRole('button', { name: 'Insert row' }));

    expect(mockApi.insertRow).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/required field/i);
  });
});

/* -------------------------------------------------------------------------- */
/* ExportMenu — CSV / JSON serialization                                      */
/* -------------------------------------------------------------------------- */

describe('ExportMenu serialization', () => {
  const exportColumns: ColumnInfo[] = [
    { name: 'id', type: 'integer' },
    { name: 'label', type: 'text' },
    { name: 'note', type: 'text' },
  ];
  const exportRows: Array<Record<string, unknown>> = [
    { id: 1, label: 'plain', note: null },
    { id: 2, label: 'has,comma', note: 'with "quotes"' },
    { id: 3, label: 'line\nbreak', note: { nested: true } },
  ];

  it('toCsv escapes commas, quotes and newlines per RFC 4180', () => {
    const csv = toCsv(exportColumns, exportRows);
    const lines = csv.split('\r\n');

    // Header, then one line per row (newlines inside a field are quoted, so the
    // field with an embedded LF does NOT add an extra split line).
    expect(lines[0]).toBe('id,label,note');
    expect(lines[1]).toBe('1,plain,'); // null -> empty, unquoted
    // comma + embedded doubled quotes both get wrapped.
    expect(lines[2]).toBe('2,"has,comma","with ""quotes"""');
    // newline-containing field is quoted; object is JSON-stringified then quoted
    // (the inner double quotes are doubled).
    expect(lines[3]).toBe('3,"line\nbreak","{""nested"":true}"');
  });

  it('toJson emits parseable JSON with null-filled missing cells', () => {
    const json = toJson(exportColumns, exportRows);
    const parsed = JSON.parse(json) as Array<Record<string, unknown>>;

    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({ id: 1, label: 'plain', note: null });
    expect(parsed[1]).toEqual({ id: 2, label: 'has,comma', note: 'with "quotes"' });
    expect(parsed[2]).toEqual({ id: 3, label: 'line\nbreak', note: { nested: true } });
  });

  it('renders two enabled export buttons when there are columns', () => {
    render(<ExportMenu columns={exportColumns} rows={exportRows} />);
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeEnabled();
  });
});

/* -------------------------------------------------------------------------- */
/* SqlConsole — confirm-gated run + result grid                               */
/* -------------------------------------------------------------------------- */

describe('SqlConsole', () => {
  it('runs only after confirm and renders the result grid', async () => {
    mockApi.getEngines.mockResolvedValue({
      engines: [{ name: 'primary', type: 'postgres', inspectable: true }],
    });
    const sqlRes: SqlResDTO = {
      result: {
        command: 'SELECT 1',
        rowCount: 1,
        columns: [{ name: 'n', type: 'integer' }],
        rows: [{ n: 1 }],
      },
      undoSnapshotId: 'snap_sql',
      state,
    };
    mockApi.executeSql.mockResolvedValue(sqlRes);
    const onMutated = vi.fn();

    render(
      <UndoProvider>
        <SqlConsole onMutated={onMutated} />
      </UndoProvider>,
    );

    // Wait for the engine list to populate the picker.
    await waitFor(() => expect(mockApi.getEngines).toHaveBeenCalled());

    const textarea = await screen.findByPlaceholderText('SELECT * FROM ...');
    fireEvent.change(textarea, { target: { value: 'SELECT * FROM users' } });

    // Clicking Run opens the confirm gate — nothing executes yet.
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    const dialog = await screen.findByRole('dialog');
    expect(mockApi.executeSql).not.toHaveBeenCalled();

    // Confirm inside the dialog actually executes.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(mockApi.executeSql).toHaveBeenCalledWith('primary', 'SELECT * FROM users'),
    );

    // The result grid renders the returned column + row.
    expect(await screen.findByText('SELECT 1')).toBeInTheDocument();
    const grid = await screen.findByRole('table');
    expect(within(grid).getByText('n')).toBeInTheDocument();
    expect(within(grid).getByText('1')).toBeInTheDocument();

    expect(onMutated).toHaveBeenCalledWith('snap_sql');
  });
});

/* -------------------------------------------------------------------------- */
/* UndoBanner — appears after a recorded undo, restores on click             */
/* -------------------------------------------------------------------------- */

/** Test helper exposing `recordUndo` so a test can simulate a prior mutation. */
function RecordUndo(props: { snapshotId: string; label: string }): React.JSX.Element {
  const { recordUndo } = useUndo();
  return (
    <button type="button" onClick={() => recordUndo(props.snapshotId, props.label)}>
      record
    </button>
  );
}

describe('UndoBanner', () => {
  it('is hidden until an undo is recorded, then restores via api.restore', async () => {
    mockApi.restore.mockResolvedValue({ state } satisfies MutationResDTO);
    const onRestored = vi.fn();

    render(
      <UndoProvider>
        <RecordUndo snapshotId="snap_undo" label="Delete row" />
        <UndoBanner onRestored={onRestored} />
      </UndoProvider>,
    );

    // Nothing recorded yet — the banner renders nothing.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mockApi.restore).not.toHaveBeenCalled();

    // Simulate a mutation recording its auto-snapshot.
    fireEvent.click(screen.getByRole('button', { name: 'record' }));

    // The banner now shows the action label + snapshot id.
    const banner = await screen.findByRole('status');
    expect(within(banner).getByText('Delete row')).toBeInTheDocument();
    expect(within(banner).getByText('snap_undo')).toBeInTheDocument();

    // Clicking Undo restores that exact snapshot.
    fireEvent.click(within(banner).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mockApi.restore).toHaveBeenCalledWith('snap_undo'));

    // On success the entry clears (banner disappears) and onRestored fires.
    await waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument(),
    );
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it('records an undo entry end-to-end after an inline edit', async () => {
    // Wires the real UndoBanner to a real TablePreview edit: the banner must
    // appear with the edit's label once updateRow resolves.
    mockApi.getTablePage.mockResolvedValue(pageOf([{ id: 1, name: 'Ada' }]));
    mockApi.updateRow.mockResolvedValue(mutationRes('snap_after_edit'));

    render(
      <UndoProvider>
        <TablePreview engine="primary" table="users" primaryKey={['id']} />
        <UndoBanner />
      </UndoProvider>,
    );

    fireEvent.click(await screen.findByText('Ada'));
    fireEvent.change(await screen.findByDisplayValue('Ada'), {
      target: { value: 'Grace' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const banner = await screen.findByRole('status');
    expect(within(banner).getByText('Edit name')).toBeInTheDocument();
    expect(within(banner).getByText('snap_after_edit')).toBeInTheDocument();
  });
});
