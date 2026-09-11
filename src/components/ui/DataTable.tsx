import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cx } from '@/utils/format';

export interface Column<Row> {
  key: string;
  header: string;
  /** Cell contents. */
  render: (row: Row) => React.ReactNode;
  /** Value used for sorting. Omit to make the column unsortable. */
  sortValue?: (row: Row) => number | string;
  align?: 'left' | 'right';
  /** Hidden below the `sm` breakpoint to keep narrow screens readable. */
  hideOnMobile?: boolean;
  title?: string;
}

/**
 * A sortable table.
 *
 * Sorting is client-side over an already-filtered array; the comparator is
 * memoised so re-sorting a large history does not re-render every cell twice.
 */
export function DataTable<Row>({
  rows,
  columns,
  defaultSort,
  rowKey,
  caption,
  emptyMessage = 'No rows match the current filters.',
}: {
  rows: Row[];
  columns: Array<Column<Row>>;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  rowKey: (row: Row, index: number) => string;
  caption?: string;
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
      return String(av).localeCompare(String(bv)) * direction;
    });
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' },
    );
  };

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-line px-4 py-6 text-center text-[11px] text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="-mx-3 overflow-x-auto sm:mx-0">
      <table className="wl-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => {
              const sortable = Boolean(column.sortValue);
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  title={column.title}
                  scope="col"
                  aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cx(
                    column.align === 'right' && 'text-right',
                    column.hideOnMobile && 'hidden sm:table-cell',
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={cx(
                        'wl-sortable inline-flex items-center gap-1 font-mono uppercase tracking-[0.12em]',
                        column.align === 'right' && 'flex-row-reverse',
                        active && 'text-ink',
                      )}
                    >
                      {column.header}
                      {active &&
                        (sort!.direction === 'asc' ? (
                          <ArrowUp size={9} strokeWidth={2.5} aria-hidden />
                        ) : (
                          <ArrowDown size={9} strokeWidth={2.5} aria-hidden />
                        ))}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cx(
                    column.align === 'right' && 'text-right',
                    column.hideOnMobile && 'hidden sm:table-cell',
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
