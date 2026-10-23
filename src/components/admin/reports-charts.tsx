"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatHour } from "@/lib/dates";
import { toFaDigits } from "@/lib/digits";
import type { MonthlyStats } from "@/lib/types";

// Validated with the dataviz palette checker (light surface): CVD ΔE ≥ 9.
export const STATUS_SERIES = [
  { key: "held", label: "برگزار شده", color: "#2563eb" },
  { key: "pending", label: "در انتظار", color: "#d97706" },
  { key: "cancelled", label: "لغو شده", color: "#e11d48" },
] as const;

const AXIS = { fontSize: 11, fill: "#64748b", fontFamily: "inherit" };
const fa = (v: number | string) => toFaDigits(v);

function ChartTooltip({ active, payload, label, title }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string | number; title: (l: string | number) => string }) {
  if (!active || !payload?.length || label === undefined) return null;
  return (
    <div dir="rtl" className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{title(label)}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">{fa(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function StatusDonut({ stats }: { stats: MonthlyStats }) {
  const total = stats.bookings.total;
  const data = STATUS_SERIES.map((s) => ({ name: s.label, value: stats.bookings[s.key], color: s.color }));
  const heldPct = total ? Math.round((stats.bookings.held / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <div className="relative size-44" dir="ltr">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={total ? data : [{ name: "—", value: 1, color: "#e5e9f2" }]}
              dataKey="value"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={total ? 2 : 0}
              stroke="#ffffff"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {(total ? data : [{ color: "#e5e9f2" }]).map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            {total > 0 && <Tooltip content={<ChartTooltip title={() => "وضعیت جلسات"} />} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold">{fa(heldPct)}٪</span>
          <span className="text-[11px] text-muted-foreground">برگزار شده</span>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: d.color }} aria-hidden />
            <span className="w-20 text-muted-foreground">{d.name}</span>
            <span className="font-semibold tabular-nums">{fa(d.value)}</span>
            <span className="text-xs text-muted-foreground">({fa(total ? Math.round((d.value / total) * 100) : 0)}٪)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GenderSplit({ stats }: { stats: MonthlyStats }) {
  const { male, female, unknown } = stats.gender;
  const total = male + female + unknown;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <span>
          <span className="font-semibold" style={{ color: "#2563eb" }}>مرد</span> {fa(male)} ({fa(pct(male))}٪)
        </span>
        <span>
          <span className="font-semibold" style={{ color: "#db2777" }}>زن</span> {fa(female)} ({fa(pct(female))}٪)
        </span>
      </div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`مرد ${pct(male)} درصد، زن ${pct(female)} درصد`}>
        {male > 0 && <div className="h-full rounded-full" style={{ width: `${pct(male)}%`, background: "#2563eb" }} />}
        {female > 0 && <div className="h-full rounded-full" style={{ width: `${pct(female)}%`, background: "#db2777" }} />}
      </div>
      {unknown > 0 && <p className="text-xs text-muted-foreground">{fa(unknown)} کاربر بدون جنسیت ثبت‌شده</p>}
    </div>
  );
}

export function DailyChart({ stats }: { stats: MonthlyStats }) {
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer>
        <BarChart data={stats.daily} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="#eef1f6" />
          <XAxis dataKey="day" reversed tick={AXIS} tickFormatter={fa} tickLine={false} axisLine={{ stroke: "#e5e9f2" }} interval="preserveStartEnd" />
          <YAxis orientation="right" allowDecimals={false} tick={AXIS} tickFormatter={fa} tickLine={false} axisLine={false} width={28} />
          <Tooltip cursor={{ fill: "rgb(37 99 235 / 0.06)" }} content={<ChartTooltip title={(d) => `روز ${fa(d)}`} />} />
          {STATUS_SERIES.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={s.color}
              stroke="#ffffff"
              strokeWidth={1}
              radius={i === STATUS_SERIES.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HourlyChart({ stats }: { stats: MonthlyStats }) {
  const data = stats.hourly.filter((h) => h.count > 0 || (h.hour >= 7 && h.hour <= 21));
  return (
    <div className="h-56 w-full" dir="ltr">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef1f6" />
          <XAxis dataKey="hour" reversed tick={AXIS} tickFormatter={(h: number) => fa(h)} tickLine={false} axisLine={{ stroke: "#e5e9f2" }} />
          <YAxis orientation="right" allowDecimals={false} tick={AXIS} tickFormatter={fa} tickLine={false} axisLine={false} width={28} />
          <Tooltip
            cursor={{ fill: "rgb(37 99 235 / 0.06)" }}
            content={<ChartTooltip title={(h) => `${formatHour(Number(h))} تا ${formatHour(Number(h) + 1)}`} />}
          />
          <Bar dataKey="count" name="رزرو" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
