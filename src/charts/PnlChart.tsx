import { useMemo } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EquityPoint, PeriodStats, TimeBucket } from '@/analytics';
import { ChartEmpty, ChartFrame, TooltipBox, makeAxisFormatter, makeTimeTickFormatter } from './ChartFrame';
import { formatCount, formatDate, formatDateTime, formatSigned } from '@/utils/format';

export type PnlMode = 'cumulative' | TimeBucket;

interface PnlChartProps {
  mode: PnlMode;
  equity: EquityPoint[];
  periods: PeriodStats[];
  currency: string;
  formatAmount: (value: number) => string;
}

/**
 * Cumulative and per-period P&L.
 *
 * Cumulative mode plots one point per bet on a time axis, so clusters of
 * activity read as clusters rather than being evenly spaced. Period modes plot
 * one bar per calendar bucket, signed by result.
 */
export function PnlChart({ mode, equity, periods, currency, formatAmount }: PnlChartProps) {
  const code = currency.toUpperCase();

  const cumulative = useMemo(
    () => equity.map((p) => ({ x: p.timestamp, value: p.cumulative, wagered: p.wagered, index: p.index })),
    [equity],
  );

  const periodData = useMemo(
    () =>
      periods.map((p) => ({
        x: p.periodStart,
        value: p.netPnl,
        bets: p.bets,
        wagered: p.wagered,
        cumulative: p.cumulative,
        key: p.key,
      })),
    [periods],
  );

  const isCumulative = mode === 'cumulative';
  const data = isCumulative ? cumulative : periodData;

  const spanMs = data.length > 1 ? data[data.length - 1].x - data[0].x : 0;
  const tickTime = useMemo(() => makeTimeTickFormatter(spanMs), [spanMs]);
  const axisFormat = useMemo(() => makeAxisFormatter(data.map((d) => d.value)), [data]);

  if (data.length === 0) {
    return (
      <ChartFrame height={240}>
        <ChartEmpty>No bets in the current selection. Clear a filter to plot a series.</ChartEmpty>
      </ChartFrame>
    );
  }

  if (data.length === 1) {
    const only = data[0];
    return (
      <ChartFrame height={240}>
        <ChartEmpty>
          A single {isCumulative ? 'bet' : 'period'} at {formatDateTime(only.x)} — {formatSigned(only.value, formatAmount)}{' '}
          {code}. A trend needs at least two points.
        </ChartEmpty>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame height={260}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
          <defs>
            {/* Monochrome fill: the area reads as shading, not as a colour. */}
            <linearGradient id="wl-pnl-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.16} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="2 3" vertical={false} />

          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={tickTime}
            tickLine={false}
            axisLine={{ stroke: 'currentColor', strokeOpacity: 0.25 }}
            minTickGap={44}
            tickMargin={8}
          />
          <YAxis
            tickFormatter={axisFormat}
            tickLine={false}
            axisLine={false}
            width={52}
            tickMargin={4}
          />

          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.45} strokeWidth={1} />

          <Tooltip
            cursor={{ stroke: 'currentColor', strokeOpacity: 0.3, strokeDasharray: '2 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              // Both series feed the same tooltip, so read the union of the
              // two point shapes rather than narrowing on the mode.
              const point = payload[0].payload as {
                x: number;
                value: number;
                wagered: number;
                index?: number;
                bets?: number;
                cumulative?: number;
              };
              const rows: Array<[string, string]> = isCumulative
                ? [
                    ['Cumulative', `${formatSigned(point.value, formatAmount)} ${code}`],
                    ['Wagered', `${formatAmount(point.wagered ?? 0)} ${code}`],
                    ['Bet no.', formatCount((point.index ?? 0) + 1)],
                  ]
                : [
                    ['Period P&L', `${formatSigned(point.value, formatAmount)} ${code}`],
                    ['Cumulative', `${formatSigned(point.cumulative ?? 0, formatAmount)} ${code}`],
                    ['Wagered', `${formatAmount(point.wagered ?? 0)} ${code}`],
                    ['Bets', formatCount(point.bets ?? 0)],
                  ];
              return (
                <TooltipBox
                  title={isCumulative ? formatDateTime(point.x) : formatDate(point.x)}
                  rows={rows}
                />
              );
            }}
          />

          {isCumulative ? (
            <Area
              type="linear"
              dataKey="value"
              stroke="currentColor"
              strokeWidth={1.5}
              fill="url(#wl-pnl-fill)"
              isAnimationActive
              animationDuration={520}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 1, fill: 'currentColor' }}
              name="Cumulative P&L"
            />
          ) : (
            <Bar dataKey="value" isAnimationActive animationDuration={420} name="Period P&L">
              {periodData.map((entry) => (
                // Sign is the only thing distinguishing the bars; direction
                // relative to the zero line carries it without relying on hue.
                <Cell
                  key={entry.key}
                  fill="currentColor"
                  fillOpacity={entry.value >= 0 ? 0.85 : 0.35}
                />
              ))}
            </Bar>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
