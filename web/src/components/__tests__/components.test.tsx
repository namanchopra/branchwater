/**
 * Component tests for the Branchwater (bw) web UI (vitest + Testing Library).
 *
 * These render the real components against a MOCKED `../api` module, so no HTTP
 * happens. The mock replaces the `api` client object's methods with `vi.fn()`s
 * (overridable per test) and keeps the real {@link BwApiError} class, because the
 * components branch on `err instanceof BwApiError`.
 *
 * Coverage (per TASK-029 acceptance criteria):
 *  - ConfirmDialog does not fire its action until the user clicks Confirm.
 *  - TableBrowser renders tables / row counts and the non-inspectable note.
 *  - DiffView renders add / remove / changed markers from a mocked diff.
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
  BranchDiffDTO,
  BranchDTO,
  EngineListDTO,
  TableListDTO,
} from '@bw/dto';

/* -------------------------------------------------------------------------- */
/* Mock the API client                                                        */
/*                                                                            */
/* The components import the `api` singleton + `BwApiError` from `../api`. We  */
/* keep the REAL error class (components do `err instanceof BwApiError`) and   */
/* swap each api method for a vi.fn we can program per test.                   */
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
    },
  };
});

// Imported AFTER vi.mock so these resolve to the mocked module.
import { api } from '../../api';
import { ConfirmDialog } from '../ConfirmDialog';
import { TableBrowser } from '../TableBrowser';
import { DiffView } from '../DiffView';
import { UndoProvider } from '../../undo';

/** The api singleton, typed as a record of mocked methods for convenience. */
const mockApi = api as unknown as {
  getEngines: ReturnType<typeof vi.fn>;
  getTables: ReturnType<typeof vi.fn>;
  getTablePage: ReturnType<typeof vi.fn>;
  getDiff: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

/* -------------------------------------------------------------------------- */
/* ConfirmDialog                                                              */
/* -------------------------------------------------------------------------- */

describe('ConfirmDialog', () => {
  it('does not fire onConfirm until the user clicks Confirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open
        title="Delete branch feature?"
        description="This permanently removes the branch."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    // Merely rendering the (open) dialog must not trigger the destructive action.
    expect(onConfirm).not.toHaveBeenCalled();

    // Cancelling must invoke onCancel and STILL never invoke onConfirm.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    // Only an explicit Confirm click fires the action.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Hidden"
        description="nope"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

/* -------------------------------------------------------------------------- */
/* TableBrowser                                                               */
/* -------------------------------------------------------------------------- */

describe('TableBrowser', () => {
  const engines: EngineListDTO = {
    engines: [
      { name: 'primary', type: 'postgres', inspectable: true },
      { name: 'cache', type: 'redis', inspectable: false },
    ],
  };

  const tables: TableListDTO = {
    engine: 'primary',
    tables: [
      {
        name: 'users',
        schema: 'public',
        rowCount: 1234,
        columns: [{ name: 'id', type: 'integer', nullable: false }],
      },
      {
        name: 'sessions',
        rowCount: 1,
        columns: [{ name: 'token', type: 'text' }],
      },
      {
        name: 'audit_log',
        rowCount: null,
        columns: [],
      },
    ],
  };

  it('renders tables and row counts from a mocked response', async () => {
    mockApi.getEngines.mockResolvedValue(engines);
    mockApi.getTables.mockResolvedValue(tables);

    render(
      <UndoProvider>
        <TableBrowser />
      </UndoProvider>,
    );

    // Engine list loads first.
    const primaryButton = await screen.findByRole('button', { name: /primary/i });

    fireEvent.click(primaryButton);

    // Tables fetched only for the inspectable engine.
    await waitFor(() => expect(mockApi.getTables).toHaveBeenCalledWith('primary'));

    // Table names render (schema-qualified where present).
    expect(await screen.findByText('users')).toBeInTheDocument();
    expect(screen.getByText('public.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('sessions')).toBeInTheDocument();
    expect(screen.getByText('audit_log')).toBeInTheDocument();

    // Row counts render, including the singular/plural and unknown variants.
    expect(screen.getByText('1,234 rows')).toBeInTheDocument();
    expect(screen.getByText('1 row')).toBeInTheDocument();
    expect(screen.getByText('count unknown')).toBeInTheDocument();
  });

  it('shows the non-inspectable note and never fetches tables for it', async () => {
    mockApi.getEngines.mockResolvedValue(engines);
    mockApi.getTables.mockResolvedValue(tables);

    render(
      <UndoProvider>
        <TableBrowser />
      </UndoProvider>,
    );

    const cacheButton = await screen.findByRole('button', { name: /cache/i });
    fireEvent.click(cacheButton);

    // The "Browsing not supported" note is shown for a non-inspectable engine.
    expect(await screen.findByText('Browsing not supported')).toBeInTheDocument();
    expect(screen.getByText(/does not support table inspection/i)).toBeInTheDocument();

    // And the tables endpoint is never hit for that engine.
    expect(mockApi.getTables).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* DiffView                                                                   */
/* -------------------------------------------------------------------------- */

describe('DiffView', () => {
  const branches: BranchDTO[] = [
    {
      name: 'main',
      snapshotId: 'snap_a',
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    },
    {
      name: 'feature',
      snapshotId: 'snap_b',
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    },
  ];

  const diff: BranchDiffDTO = {
    from: 'feature',
    to: 'main',
    addedTables: [
      { name: 'invoices', schema: 'public', rowCount: 42, columns: [] },
    ],
    removedTables: [{ name: 'legacy', rowCount: 0, columns: [] }],
    changedTables: [
      {
        name: 'users',
        schema: 'public',
        fromRowCount: 10,
        toRowCount: 15,
        rowCountDelta: 5,
        columnChanges: [],
      },
    ],
  };

  it('renders add / remove / changed markers from a mocked diff', async () => {
    mockApi.getDiff.mockResolvedValue(diff);

    render(<DiffView branches={branches} initialFrom="feature" initialTo="main" />);

    // Auto-runs the diff for the two selected branches.
    await waitFor(() =>
      expect(mockApi.getDiff).toHaveBeenCalledWith('feature', 'main'),
    );

    // The grouped summary appears with one entry per change kind.
    const summary = await screen.findByTestId('diff-summary');

    const addedGroup = within(summary).getByTestId('diff-group-added');
    expect(within(addedGroup).getByText('public.invoices')).toBeInTheDocument();
    // The added marker carries the "+" sign.
    expect(
      within(within(summary).getByTestId('diff-added-public.invoices')).getByText('+'),
    ).toBeInTheDocument();

    const removedGroup = within(summary).getByTestId('diff-group-removed');
    expect(within(removedGroup).getByText('legacy')).toBeInTheDocument();
    expect(
      within(within(summary).getByTestId('diff-removed-legacy')).getByText('−'),
    ).toBeInTheDocument();

    const changedGroup = within(summary).getByTestId('diff-group-changed');
    expect(within(changedGroup).getByText('public.users')).toBeInTheDocument();
    expect(
      within(within(summary).getByTestId('diff-changed-public.users')).getByText('~'),
    ).toBeInTheDocument();
  });

  it('renders the no-differences state for an empty diff', async () => {
    mockApi.getDiff.mockResolvedValue({
      from: 'main',
      to: 'main',
      addedTables: [],
      removedTables: [],
      changedTables: [],
    } satisfies BranchDiffDTO);

    render(<DiffView branches={branches} initialFrom="main" initialTo="main" />);

    expect(await screen.findByTestId('diff-no-differences')).toBeInTheDocument();
    expect(screen.getByText('No differences')).toBeInTheDocument();
  });
});
