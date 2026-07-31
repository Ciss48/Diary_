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
  // Year mode
  yearGrid: YearCell[][]
  yearLabelOffsets: { month: number; weekIndex: number }[]
  year: number
  currentYear: number
  yearEntryCount: number
  // Month mode
  monthGrid: MonthCell[][]
  monthStr: string
  today: string
  monthDays: number
  monthEntryCount: number
  monthOptions: { value: string; label: string; disabled: boolean }[]
  // Shared
  currentMonth: string // 'YYYY-MM' — for toggle URL + canGoNext
}

const NAV_BTN = 'w-8 h-[34px] border border-stone-200 bg-white rounded-lg text-stone-500 text-[15px] flex items-center justify-center hover:border-stone-800 hover:text-stone-800 transition-colors'
const NAV_DISABLED = 'w-8 h-[34px] border border-stone-200 bg-white rounded-lg text-stone-500 text-[15px] flex items-center justify-center opacity-40 cursor-default'

export default function HeatmapCard({
  mode, yearGrid, yearLabelOffsets, year, currentYear, yearEntryCount,
  monthGrid, monthStr, today, monthDays, monthEntryCount, monthOptions,
  currentMonth,
}: Props) {
  const isYear = mode === 'year'
  const weekCount = yearGrid.length

  // Month mode navigation
  const monthYear = Number(monthStr.slice(0, 4))
  const monthNum = Number(monthStr.slice(5, 7))
  const canGoPrevMonth = monthStr > '2020-01'
  const canGoNextMonth = monthStr < currentMonth

  // Header
  const title = isYear
    ? `${year} \u00B7 full year`
    : `${MONTHS[monthNum - 1]} ${monthYear}`
  const subtitle = isYear
    ? `${weekCount} weeks \u00B7 hover a day for details`
    : `${monthDays} days \u00B7 ${monthEntryCount} entries logged`

  // Toggle URLs
  const toMonthUrl = `/?hview=month&hm=${
    year === Number(currentMonth.slice(0, 4)) ? currentMonth : `${year}-01`
  }`
  const toYearUrl = `/?hview=year&y=${monthYear}`

  return (
    <section className="bg-white border border-stone-200 rounded-[14px] shadow-sm px-4 sm:px-6 py-5 flex flex-col gap-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h2 className="text-[17px] font-semibold tracking-tight m-0">
            {title}
          </h2>
          <span className="text-[13px] text-stone-400">{subtitle}</span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Toggle */}
          <div className="flex bg-stone-100 rounded-[9px] p-[3px] gap-0.5">
            {isYear ? (
              <>
                <span className="bg-white text-stone-800 shadow-sm text-[13px] font-medium px-4 py-[7px] rounded-[7px]">
                  Year
                </span>
                <Link
                  href={toMonthUrl}
                  className="bg-transparent text-stone-500 hover:text-stone-700 text-[13px] font-medium px-4 py-[7px] rounded-[7px] transition-colors"
                >
                  Month
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={toYearUrl}
                  className="bg-transparent text-stone-500 hover:text-stone-700 text-[13px] font-medium px-4 py-[7px] rounded-[7px] transition-colors"
                >
                  Year
                </Link>
                <span className="bg-white text-stone-800 shadow-sm text-[13px] font-medium px-4 py-[7px] rounded-[7px]">
                  Month
                </span>
              </>
            )}
          </div>

          {/* Navigation */}
          {isYear ? (
            <div className="flex items-center gap-1.5">
              <Link href={`/?hview=year&y=${year - 1}`} className={NAV_BTN}>
                &#8249;
              </Link>
              <span className="text-[13.5px] font-medium min-w-[46px] text-center">
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
            <div className="flex items-center gap-1.5">
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
      {isYear ? (
        <HeatmapYearGrid
          weeks={yearGrid}
          labelOffsets={yearLabelOffsets}
          today={today}
        />
      ) : (
        <HeatmapMonthGrid weeks={monthGrid} today={today} />
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap border-t border-stone-100 pt-4">
        <LegendItem color="bg-stone-200">No entry</LegendItem>
        <LegendItem color="bg-emerald-500">Written on time</LegendItem>
        <LegendItem color="bg-emerald-300">Backfilled</LegendItem>
        <LegendItem color="bg-stone-50" border>Future</LegendItem>
        <div className="ml-auto">
          <LegendItem color="bg-white" ring>Today</LegendItem>
        </div>
      </div>
    </section>
  )
}

function LegendItem({
  color,
  border,
  ring,
  children,
}: {
  color: string
  border?: boolean
  ring?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 text-[12.5px] text-stone-500">
      <span
        className={`w-[13px] h-[13px] rounded-[3px] ${color} inline-block box-border ${
          border ? 'border border-stone-200' : ''
        } ${ring ? 'ring-[1.8px] ring-amber-500' : ''}`}
      />
      {children}
    </div>
  )
}
