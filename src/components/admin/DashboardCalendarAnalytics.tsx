import React, { useState, useMemo } from 'react';

interface Props {
  articleDates: string[]; // ISO string dates of published articles
}

export default function DashboardCalendarAnalytics({ articleDates = [] }: Props) {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1-12

  // Month names
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // 1. Overall Stats Calculations
  const stats = useMemo(() => {
    const todayStr = now.toISOString().split('T')[0];
    const thisYearStr = now.getFullYear().toString();
    const thisMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    let todayCount = 0;
    let thisWeekCount = 0;
    let thisMonthCount = 0;
    let thisYearCount = 0;

    const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]; // 0=Sun..6=Sat

    articleDates.forEach(dateStr => {
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;

      // Today
      if (dateStr.startsWith(todayStr)) {
        todayCount++;
      }

      // This Week
      if (d >= sevenDaysAgo && d <= now) {
        thisWeekCount++;
      }

      // This Month
      if (dateStr.startsWith(thisMonthStr)) {
        thisMonthCount++;
      }

      // This Year
      if (dateStr.startsWith(thisYearStr)) {
        thisYearCount++;
      }

      // Day of Week
      const dayIdx = d.getDay();
      dayOfWeekCounts[dayIdx]++;
    });

    let maxDayIdx = 0;
    let minDayIdx = 0;
    let maxDayCount = -1;
    let minDayCount = Infinity;

    dayOfWeekCounts.forEach((count, idx) => {
      if (count > maxDayCount) {
        maxDayCount = count;
        maxDayIdx = idx;
      }
      if (count < minDayCount) {
        minDayCount = count;
        minDayIdx = idx;
      }
    });

    return {
      todayCount,
      thisWeekCount,
      thisMonthCount,
      thisYearCount,
      mostWrittenDay: { name: dayNames[maxDayIdx], count: maxDayCount > -1 ? maxDayCount : 0 },
      leastWrittenDay: { name: dayNames[minDayIdx], count: minDayCount < Infinity ? minDayCount : 0 },
      dayOfWeekCounts
    };
  }, [articleDates]);

  // 2. Selected Month Calendar Grid Calculation
  const calendarData = useMemo(() => {
    const monthStr = selectedMonth.toString().padStart(2, '0');
    const yearMonthPrefix = `${selectedYear}-${monthStr}`;

    const countsByDay: { [day: number]: number } = {};

    articleDates.forEach(dateStr => {
      if (dateStr && dateStr.startsWith(yearMonthPrefix)) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const dayNum = d.getDate();
          countsByDay[dayNum] = (countsByDay[dayNum] || 0) + 1;
        }
      }
    });

    const firstDayOfWeek = new Date(selectedYear, selectedMonth - 1, 1).getDay(); // 0=Sun
    const totalDaysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

    return {
      countsByDay,
      firstDayOfWeek,
      totalDaysInMonth
    };
  }, [articleDates, selectedYear, selectedMonth]);

  // Available Years for Selector (e.g. 2018 up to current year + 1)
  const availableYears = useMemo(() => {
    const years: number[] = [];
    const currentYr = now.getFullYear();
    for (let y = currentYr; y >= 2018; y--) {
      years.push(y);
    }
    return years;
  }, []);

  return (
    <div className="space-y-6">
      {/* 1. Quick Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <span className="text-xs font-bold text-muted-foreground uppercase">Hari Ini</span>
          <p className="text-2xl font-black text-primary mt-1">{stats.todayCount} <span className="text-xs font-normal text-muted-foreground">post</span></p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <span className="text-xs font-bold text-muted-foreground uppercase">7 Hari Terakhir</span>
          <p className="text-2xl font-black text-primary mt-1">{stats.thisWeekCount} <span className="text-xs font-normal text-muted-foreground">post</span></p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <span className="text-xs font-bold text-muted-foreground uppercase">Bulan Ini</span>
          <p className="text-2xl font-black text-primary mt-1">{stats.thisMonthCount} <span className="text-xs font-normal text-muted-foreground">post</span></p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <span className="text-xs font-bold text-muted-foreground uppercase">Tahun Ini ({now.getFullYear()})</span>
          <p className="text-2xl font-black text-primary mt-1">{stats.thisYearCount} <span className="text-xs font-normal text-muted-foreground">post</span></p>
        </div>
      </div>

      {/* 2. Main Calendar & Productivity Statistics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Interactive Calendar (2 cols) */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4 mb-4">
            <div>
              <h3 className="text-lg font-bold text-foreground">Kalender Penerbitan</h3>
              <p className="text-xs text-muted-foreground">Pilih Bulan & Tahun untuk melihat intensitas posting</p>
            </div>

            {/* Month & Year Controls */}
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                className="px-3 py-1.5 text-xs font-bold bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {monthNames.map((name, idx) => (
                  <option key={name} value={idx + 1}>{name}</option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="px-3 py-1.5 text-xs font-bold bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Calendar Grid Header */}
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-muted-foreground mb-2">
            <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-2 text-center text-xs">
            {Array.from({ length: calendarData.firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="p-2 min-h-[44px]"></div>
            ))}

            {Array.from({ length: calendarData.totalDaysInMonth }).map((_, i) => {
              const day = i + 1;
              const postCount = calendarData.countsByDay[day] || 0;
              const dayPadded = day.toString().padStart(2, '0');
              const monthPadded = selectedMonth.toString().padStart(2, '0');
              const archiveLink = `/${selectedYear}/${monthPadded}/${dayPadded}/`;

              return (
                <div
                  key={day}
                  className={`min-h-[44px] p-1.5 rounded-xl border flex flex-col items-center justify-between transition-all ${
                    postCount > 0
                      ? 'border-primary/40 bg-primary/10 hover:border-primary'
                      : 'border-border/40 bg-muted/20'
                  }`}
                >
                  <span className="font-bold text-[11px]">{day}</span>
                  {postCount > 0 ? (
                    <a
                      href={archiveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-primary text-primary-foreground hover:scale-105 transition-transform"
                      title={`${postCount} artikel diterbitkan pada ${day} ${monthNames[selectedMonth - 1]} ${selectedYear}`}
                    >
                      {postCount} post
                    </a>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40">-</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Writing Pattern Mini Statistics (1 col) */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground border-b border-border/60 pb-3 mb-4">Pola & Statistik Penulisan</h3>

            <div className="space-y-4">
              <div className="p-4 bg-muted/30 border border-border rounded-xl">
                <span className="text-xs font-bold text-muted-foreground uppercase block mb-1">Hari Paling Produktif</span>
                <p className="text-base font-black text-primary flex items-center justify-between">
                  <span>{stats.mostWrittenDay.name}</span>
                  <span className="text-xs font-bold bg-primary/20 px-2 py-0.5 rounded-full">{stats.mostWrittenDay.count} total post</span>
                </p>
              </div>

              <div className="p-4 bg-muted/30 border border-border rounded-xl">
                <span className="text-xs font-bold text-muted-foreground uppercase block mb-1">Hari Paling Sedikit</span>
                <p className="text-base font-bold text-muted-foreground flex items-center justify-between">
                  <span>{stats.leastWrittenDay.name}</span>
                  <span className="text-xs font-semibold bg-muted px-2 py-0.5 rounded-full">{stats.leastWrittenDay.count} total post</span>
                </p>
              </div>

              {/* Day of Week Distribution */}
              <div className="pt-2 space-y-2">
                <span className="text-xs font-bold text-muted-foreground uppercase block">Distribusi Penulisan Mingguan</span>
                {dayNames.map((dName, idx) => {
                  const count = stats.dayOfWeekCounts[idx];
                  const maxCount = Math.max(...stats.dayOfWeekCounts, 1);
                  const pct = Math.round((count / maxCount) * 100);

                  return (
                    <div key={dName} className="space-y-1 text-xs">
                      <div className="flex justify-between font-semibold">
                        <span>{dName}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                        <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
