import { useState } from 'react';
import { Panel } from './ui/Panel';
import { Segmented } from './ui/Segmented';
import { GroupBars, GroupStatsTable } from './GroupStatsTable';
import type { GroupStats } from '@/analytics';

type View = 'wagered' | 'pnl';

/** Performance per game, as a visual summary plus a sortable table. */
export function GameBreakdown({
  rows,
  currency,
  formatAmount,
}: {
  rows: GroupStats[];
  currency: string;
  formatAmount: (value: number) => string;
}) {
  const [view, setView] = useState<View>('wagered');

  return (
    <Panel
      index="06"
      label="By game"
      actions={
        <Segmented
          label="Comparison metric"
          value={view}
          onChange={setView}
          options={[
            { value: 'wagered', label: 'Volume' },
            { value: 'pnl', label: 'P&L' },
          ]}
        />
      }
    >
      <div className="mb-4 border-b border-line pb-4">
        <GroupBars rows={rows} formatAmount={formatAmount} currency={currency} metric={view} />
      </div>
      <GroupStatsTable
        rows={rows}
        headerLabel="Game"
        formatAmount={formatAmount}
        currency={currency}
        caption="Performance by game"
      />
    </Panel>
  );
}
