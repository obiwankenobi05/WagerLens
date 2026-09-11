import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EquityPoint } from '@/analytics';
import {
  ChartEmpty,
  ChartFrame,
  TooltipBox,
  axisWidthFor,
  evenTimeTicks,
  makeAxisFormatter,
  makeTimeTickFormatter,
} from './ChartFrame';
import { formatDateTime } from '@/utils/format';

/**
 * Underwater plot: how far cumulative P&L sits below its running peak.
 *
 * Plotted as a negative magnitude so the shape hangs from the zero line, which
 * is the conventional reading of a drawdown curve.
 */
export function DrawdownChart({
  equity,
  currency,
  formatAmount,
}: {
  equity: EquityPoint[];
  currency: string;
  formatAmount: (value: number) => string;
}) {
  const code = currency.toUpperCase();
  const data = useMemo(
    () => equity.map((p) => ({ x: p.timestamp, value: -p.drawdown, peak: p.peak, cumulative: p.cumulative })),
    [equity],
  );

  const spanMs = data.length > 1 ? data[data.length - 1].x - data[0].x : 0;
  const tickTime = useMemo(() => makeTimeTickFormatter(spanMs), [spanMs]);
  const axisFormat = useMemo(() => makeAxisFormatter(data.map((d) => d.value)), [data]);
  // Fewer ticks on a narrow chart; the container is fluid so this is sized
  // from the data rather than the rendered width.
  const timeTicks = useMemo(
    () => (data.length > 1 ? evenTimeTicks(data[0].x, data[data.length - 1].x, 6) : []),
    [data],
  );
  const axisWidth = useMemo(
    () => axisWidthFor(data.map((d) => d.value), axisFormat),
    [data, axisFormat],
  );

  if (data.length < 2) {
    return (
      <ChartFrame height={140}>
        <ChartEmpty>At least two bets are needed to trace a drawdown.</ChartEmpty>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame height={150} className="text-neg">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="wl-dd-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.02} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 3" vertical={false} className="text-ink" />
          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={timeTicks.length > 0 ? timeTicks : undefined}
            tickFormatter={tickTime}
            tickLine={false}
            axisLine={false}
            minTickGap={64}
            tickMargin={8}
          />
          <YAxis tickFormatter={axisFormat} tickLine={false} axisLine={false} width={axisWidth} tickMargin={4} />
          <Tooltip
            cursor={{ stroke: 'currentColor', strokeOpacity: 0.3, strokeDasharray: '2 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as (typeof data)[number];
              return (
                <TooltipBox
                  title={formatDateTime(point.x)}
                  rows={[
                    ['Drawdown', `${formatAmount(Math.abs(point.value))} ${code}`],
                    ['Peak', `${formatAmount(point.peak)} ${code}`],
                  ]}
                />
              );
            }}
          />
          <Area
            type="stepAfter"
            dataKey="value"
            stroke="currentColor"
            strokeWidth={1.25}
            fill="url(#wl-dd-fill)"
            isAnimationActive
            animationDuration={520}
            dot={false}
            name="Drawdown"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
