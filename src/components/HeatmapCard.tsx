import Link from 'next/link'
import HeatmapYearGrid from './HeatmapYearGrid'
import HeatmapMonthGrid from './HeatmapMonthGrid'
import MonthDropdown from './MonthDropdown'
import { previousMonth, nextMonth } from '@/lib/calendar'
import type { YearCell, MonthCell } from '@/lib/calendar'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

type Props = {
  mode: 'year' | 'month'
  yearGrid: YearCell[][]
  yearLabelOffsets: { month: number; weekIndex: number }[]
  year: number
  currentYear: number
  yearEntryCount: number
  monthGrid: MonthCell[][]
  monthStr: string
  today: string
  monthDays: number
  monthEntryCount: number
  monthOptions: { value: string; label: string; disabled: boolean }[]
  currentMonth: string
}

const NAV_BTN =
  'hv-out w-8 h-[34px] border border-line-2 bg-transparent rounded-lg text-ink-2 text-[15px] leading-none flex items-center justify-center cursor-pointer'
const NAV_DISABLED =
  'w-8 h-[34px] border border-line-2 bg-transparent rounded-lg text-ink-3 text-[15px] leading-none flex items-center justify-center opacity-40 cursor-default'

export default function HeatmapCard({
  mode, yearGrid, yearLabelOffsets, year, currentYear, yearEntryCount,
  monthGrid, monthStr, today, monthDays, monthEntryCount, monthOptions,
  currentMonth,
}: Props) {
  const isYear = mode === 'year'

  const monthYear = Number(monthStr.slice(0, 4))
  const monthNum = Number(monthStr.slice(5, 7))
  const canGoPrevMonth = monthStr > '2020-01'
  const canGoNextMonth = monthStr < currentMonth

  const title = isYear
    ? `${year} in full`
    : `${MONTHS[monthNum - 1]} ${year}`
  const subtitle = isYear
    ? 'each square is a day \u2014 hover for details'
    : `${monthDays} days \u00B7 ${monthEntryCount} entries`

  const toMonthUrl = `/?hview=month&hm=${
    year === Number(currentMonth.slice(0, 4)) ? currentMonth : `${year}-01`
  }`
  const toYearUrl = `/?hview=year&y=${monthYear}`

  return (
    <section
      className="relative bg-card border border-line rounded-2xl shadow-[var(--shadow-2)] px-4 sm:px-[26px] py-5 sm:py-6 flex flex-col gap-5 overflow-hidden"
    >
      {/* Grain overlay */}
      <span
        className="absolute inset-0 pointer-events-none opacity-70"
        style={{ backgroundImage: 'var(--grain)' }}
      />

      {/* Header */}
      <div className="relative flex items-end justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-[3px]">
          <h2 className="m-0 font-serif text-[20px] font-medium tracking-tight">
            {title}
          </h2>
          <span className="font-serif italic text-[12.5px] text-ink-3">
            {subtitle}
          </span>
        </div>

        <div className="flex items-center gap-[9px] flex-wrap">
          {/* Toggle */}
          <div className="flex gap-[2px] bg-paper-2 rounded-[9px] p-[3px]">
            {isYear ? (
              <>
                <span className="bg-card text-ink shadow-[var(--shadow-1)] text-[12.5px] font-medium px-[15px] py-[7px] rounded-[7px]">
                  Year
                </span>
                <Link
                  href={toMonthUrl}
                  className="bg-transparent text-ink-3 hover:text-ink text-[12.5px] font-medium px-[15px] py-[7px] rounded-[7px] transition-colors"
                >
                  Month
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={toYearUrl}
                  className="bg-transparent text-ink-3 hover:text-ink text-[12.5px] font-medium px-[15px] py-[7px] rounded-[7px] transition-colors"
                >
                  Year
                </Link>
                <span className="bg-card text-ink shadow-[var(--shadow-1)] text-[12.5px] font-medium px-[15px] py-[7px] rounded-[7px]">
                  Month
                </span>
              </>
            )}
          </div>

          {/* Navigation */}
          {isYear ? (
            <div className="flex items-center gap-[6px]">
              <Link href={`/?hview=year&y=${year - 1}`} className={NAV_BTN}>
                &#8249;
              </Link>
              <span className="font-mono text-[13.5px] font-medium min-w-[48px] text-center">
                {year}
              </span>
              {year < currentYear ? (
                <Link href={`/?hview=year&y=${year + 1}`} className={NAV_BTN}>
                  &#8250;
                </Link>
              ) : (
                <span className={NAV_DISABLED}>&#8250;</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-[6px]">
              {canGoPrevMonth ? (
                <Link
                  href={`/?hview=month&hm=${previousMonth(monthStr)}`}
                  className={NAV_BTN}
                >
                  &#8249;
                </Link>
              ) : (
                <span className={NAV_DISABLED}>&#8249;</span>
              )}
              <MonthDropdown
                currentMonthStr={monthStr}
                options={monthOptions}
              />
              {canGoNextMonth ? (
                <Link
                  href={`/?hview=month&hm=${nextMonth(monthStr)}`}
                  className={NAV_BTN}
                >
                  &#8250;
                </Link>
              ) : (
                <span className={NAV_DISABLED}>&#8250;</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="relative">
        {isYear ? (
          <HeatmapYearGrid
            weeks={yearGrid}
            labelOffsets={yearLabelOffsets}
            today={today}
          />
        ) : (
          <HeatmapMonthGrid weeks={monthGrid} today={today} />
        )}
      </div>

      {/* Legend */}
      <div className="relative flex items-center gap-4 flex-wrap border-t border-line pt-[15px] text-[12px] text-ink-2">
        <LegendKey bg="var(--empty)">No entry</LegendKey>
        <LegendKey bg="var(--leaf)">Written on time</LegendKey>
        <LegendKey bg="var(--backfill-fill)">Backfilled</LegendKey>
        <LegendKey bg="var(--future)" border="1px dashed var(--line-2)">Future</LegendKey>

        <span className="flex items-center gap-[7px] ml-auto">
          <span
            className="w-[13px] h-[13px] rounded-[3.5px]"
            style={{ boxShadow: '0 0 0 2px var(--brass)' }}
          />
          Today
        </span>

        <span className="flex items-center gap-[6px] pl-[10px] border-l border-line">
          <MoodDot bg="var(--brass)" />happy
          <MoodDot bg="var(--ink-3)" />normal
          <MoodDot border="1.4px solid var(--ink-3)" />sad
        </span>
      </div>
    </section>
  )
}

function LegendKey({
  bg,
  border,
  children,
}: {
  bg: string
  border?: string
  children: React.ReactNode
}) {
  return (
    <span className="flex items-center gap-[7px]">
      <span
        className="w-[13px] h-[13px] rounded-[3.5px] box-border"
        style={{ background: bg, border: border ?? 'none' }}
      />
      {children}
    </span>
  )
}

function MoodDot({ bg, border }: { bg?: string; border?: string }) {
  return (
    <span
      className="w-2 h-2 rounded-full box-border"
      style={{ background: bg ?? 'transparent', border: border ?? '0' }}
    />
  )
}
