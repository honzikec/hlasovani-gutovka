'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Users,
  XCircle,
  AlertTriangle,
  BarChart3,
  Trophy,
} from 'lucide-react';
import {
  DayData,
  PlayerAttendanceStats,
  WednesdayOverviewRow,
  calculateEnoughPlayers,
  createEmptySummary,
  formatGuestsCzech,
  formatPlayersCzech,
  formatVotersCzech,
} from '@/lib/types';
import {
  addDaysToDateString,
  formatDateCzechFromString,
  formatDateCzechShort,
  getCurrentWednesdayString,
  getTodayCzechString,
  isWednesdayString,
  snapToWednesday,
} from '@/lib/dates';

interface DateBounds {
  earliest: string | null;
  latest: string | null;
}

interface AdminDashboardProps {
  authRequired: boolean;
  initialAuthenticated: boolean;
  initialSelectedDate: string;
  initialDayData: DayData | null;
  initialWednesdays: WednesdayOverviewRow[];
  initialPlayers: PlayerAttendanceStats[];
  initialBounds: DateBounds;
  initialError?: string;
}

type RangePreset = '30d' | '90d' | 'year' | 'all' | 'custom';
type ExportType = 'day' | 'range-summary' | 'range-players' | 'range-detail';

function emptyDay(date: string): DayData {
  return {
    date,
    votes: [],
    summary: createEmptySummary(),
    comments: [],
  };
}

function formatDateTimeCs(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminDashboard({
  authRequired,
  initialAuthenticated,
  initialSelectedDate,
  initialDayData,
  initialWednesdays,
  initialPlayers,
  initialBounds,
  initialError = '',
}: AdminDashboardProps) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Selected Wednesday detail state
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [dayData, setDayData] = useState<DayData>(
    initialDayData ?? emptyDay(initialSelectedDate)
  );
  const [loadingDay, setLoadingDay] = useState(false);
  const [snappedNotice, setSnappedNotice] = useState<string | null>(null);

  // Range overview state
  const [preset, setPreset] = useState<RangePreset>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [wednesdays, setWednesdays] =
    useState<WednesdayOverviewRow[]>(initialWednesdays);
  const [players, setPlayers] = useState<PlayerAttendanceStats[]>(initialPlayers);
  const [bounds, setBounds] = useState<DateBounds>(initialBounds);
  const [loadingRange, setLoadingRange] = useState(false);
  const [activeTab, setActiveTab] = useState<'wednesdays' | 'players'>('wednesdays');
  const [searchQuery, setSearchQuery] = useState('');

  // Export & general feedback state
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [error, setError] = useState(initialError);

  const detailSectionRef = useRef<HTMLElement | null>(null);
  const dayAbortRef = useRef<AbortController | null>(null);
  const rangeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      dayAbortRef.current?.abort();
      rangeAbortRef.current?.abort();
    };
  }, []);

  const fetchDayDetail = useCallback(async (dateStr: string) => {
    dayAbortRef.current?.abort();
    const controller = new AbortController();
    dayAbortRef.current = controller;

    setLoadingDay(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/wednesdays?date=${encodeURIComponent(dateStr)}`,
        { signal: controller.signal }
      );
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba při načítání středy');
      setDayData(data);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message || 'Chyba při načítání dat');
    } finally {
      if (dayAbortRef.current === controller) {
        setLoadingDay(false);
      }
    }
  }, []);

  const fetchRangeOverview = useCallback(async (from: string, to: string) => {
    if (from && to && from > to) {
      setError('Počáteční datum nemůže být po koncovém datu');
      return;
    }

    rangeAbortRef.current?.abort();
    const controller = new AbortController();
    rangeAbortRef.current = controller;

    setLoadingRange(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      const res = await fetch(`/api/admin/wednesdays${qs ? `?${qs}` : ''}`, {
        signal: controller.signal,
      });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba při načítání přehledu');
      setWednesdays(data.wednesdays ?? []);
      setPlayers(data.players ?? []);
      if (data.bounds) setBounds(data.bounds);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message || 'Chyba při načítání přehledu');
    } finally {
      if (rangeAbortRef.current === controller) {
        setLoadingRange(false);
      }
    }
  }, []);

  const loadAllData = useCallback(async () => {
    await Promise.all([
      fetchDayDetail(selectedDate),
      fetchRangeOverview(fromDate, toDate),
    ]);
  }, [fetchDayDetail, fetchRangeOverview, selectedDate, fromDate, toDate]);

  const selectWednesday = (nextDate: string, notice: string | null = null) => {
    setSnappedNotice(notice);
    setSelectedDate(nextDate);
    fetchDayDetail(nextDate);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Přihlášení se nezdařilo');
        return;
      }
      setPassword('');
      setAuthenticated(true);
      await Promise.all([
        fetchDayDetail(selectedDate),
        fetchRangeOverview(fromDate, toDate),
      ]);
    } catch {
      setAuthError('Chyba připojení k serveru');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    setAuthenticated(false);
  };

  const handleDatePickerChange = (rawDate: string) => {
    if (!rawDate) return;
    if (isWednesdayString(rawDate)) {
      selectWednesday(rawDate, null);
    } else {
      const wed = snapToWednesday(rawDate);
      selectWednesday(
        wed,
        `Vybraný den nebyl středa — zobrazena středa ${formatDateCzechShort(wed)}`
      );
    }
  };

  const updateRange = (nextFrom: string, nextTo: string, nextPreset: RangePreset) => {
    setPreset(nextPreset);
    setFromDate(nextFrom);
    setToDate(nextTo);
    fetchRangeOverview(nextFrom, nextTo);
  };

  const applyPreset = (nextPreset: RangePreset) => {
    const today = getTodayCzechString();
    if (nextPreset === '30d') {
      updateRange(addDaysToDateString(today, -30), addDaysToDateString(today, 30), nextPreset);
    } else if (nextPreset === '90d') {
      updateRange(addDaysToDateString(today, -90), addDaysToDateString(today, 30), nextPreset);
    } else if (nextPreset === 'year') {
      const year = today.slice(0, 4);
      updateRange(`${year}-01-01`, `${year}-12-31`, nextPreset);
    } else if (nextPreset === 'all') {
      updateRange('', '', nextPreset);
    }
  };

  const handleExportCsv = async (type: ExportType, overrideDate?: string) => {
    const key = overrideDate ? `${type}-${overrideDate}` : type;
    setExportingKey(key);
    setError('');

    try {
      const params = new URLSearchParams({ type });
      if (type === 'day') {
        params.set('date', overrideDate || selectedDate);
      } else {
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
      }

      const res = await fetch(`/api/admin/export?${params.toString()}`);
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Export CSV selhal');
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `gutovka-${type}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message || 'Chyba při exportu CSV');
    } finally {
      setExportingKey(null);
    }
  };

  const inspectWednesday = (dateStr: string) => {
    selectWednesday(dateStr, null);
    detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Login screen when ADMIN_PASSWORD is configured
  if (authRequired && !authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200/70 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-lg">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              Admin — Hlasování Gutovka
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Zadejte administrátorské heslo pro přístup k přehledům a CSV exportům.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-password"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Heslo
              </label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-emerald-500/20"
                placeholder="••••••••"
              />
            </div>

            {authError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || !password}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              {authLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ověřuji…
                </>
              ) : (
                'Přihlásit se'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-emerald-700 transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Zpět na hlasování
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Computed metrics for selected range
  const totalWednesdays = wednesdays.length;
  const gamesPlayed = wednesdays.filter((w) => w.enough_players).length;
  const avgPlayers =
    totalWednesdays > 0
      ? (
          wednesdays.reduce((sum, w) => sum + w.total_players, 0) /
          totalWednesdays
        ).toFixed(1)
      : '0';
  const uniqueActivePlayers = players.filter((p) => p.yes_count > 0).length;

  // Filtered tables
  const q = searchQuery.trim().toLowerCase();
  const filteredWednesdays = q
    ? wednesdays.filter(
        (w) =>
          w.vote_date.includes(q) ||
          formatDateCzechShort(w.vote_date).toLowerCase().includes(q) ||
          w.attendees.some((a) => a.toLowerCase().includes(q))
      )
    : wednesdays;

  const filteredPlayers = q
    ? players.filter((p) => p.user_name.toLowerCase().includes(q))
    : players;

  const dayEnough = calculateEnoughPlayers(dayData.summary);
  const sortedDayVotes = [...dayData.votes].sort((a, b) => {
    if (a.attendance !== b.attendance) return a.attendance === 'yes' ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100/90">
      {/* Top Loading Bar */}
      {(loadingDay || loadingRange) && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-emerald-100 overflow-hidden">
          <div className="h-full w-1/2 bg-emerald-600 animate-loading-bar rounded-full" />
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Administrace & Přehledy
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Procházení libovolných střed, historie účasti a exporty do CSV
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={loadAllData}
              disabled={loadingDay || loadingRange}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`h-4 w-4 ${loadingDay || loadingRange ? 'animate-spin text-emerald-600' : ''}`}
              />
              Obnovit
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Zpět na hlasování
            </Link>
            {authRequired && (
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-rose-700 shadow-xs transition hover:bg-rose-50 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Odhlásit
              </button>
            )}
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-6 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* SECTION 1: Browse Any Wednesday */}
        <section
          ref={detailSectionRef}
          className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm"
        >
          <div className="mb-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">
                  Detail libovolné středy
                </h2>
              </div>
              <p className="mt-0.5 text-sm capitalize text-slate-600">
                {formatDateCzechFromString(selectedDate)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  selectWednesday(addDaysToDateString(selectedDate, -7))
                }
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">-1 týden</span>
              </button>

              <input
                type="date"
                aria-label="Vybrat datum středy"
                value={selectedDate}
                onChange={(e) => handleDatePickerChange(e.target.value)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />

              <button
                type="button"
                onClick={() =>
                  selectWednesday(addDaysToDateString(selectedDate, 7))
                }
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 cursor-pointer"
              >
                <span className="hidden sm:inline">+1 týden</span>
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => selectWednesday(getCurrentWednesdayString())}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 cursor-pointer"
              >
                Nejbližší
              </button>

              <button
                type="button"
                onClick={() => handleExportCsv('day')}
                disabled={exportingKey === 'day' || loadingDay}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                {exportingKey === 'day' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                CSV této středy
              </button>
            </div>
          </div>

          {snappedNotice && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-800">
              {snappedNotice}
            </div>
          )}

          {loadingDay ? (
            <div className="space-y-4 animate-pulse">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="h-20 rounded-xl bg-slate-100" />
                <div className="h-20 rounded-xl bg-slate-100" />
                <div className="h-20 rounded-xl bg-slate-100" />
                <div className="h-20 rounded-xl bg-slate-100" />
              </div>
              <div className="h-40 rounded-xl bg-slate-100" />
            </div>
          ) : (
            <>
              {/* Day KPI Row */}
              <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3.5">
                  <div className="text-xs font-medium text-emerald-700">
                    Celkem hráčů (Přijdou)
                  </div>
                  <div className="mt-1 text-2xl font-extrabold text-emerald-900">
                    {dayData.summary.yes.totalPlayers}
                  </div>
                  <div className="text-xs text-emerald-700/80">
                    {formatVotersCzech(dayData.summary.yes.count)}
                    {dayData.summary.yes.guestsCount > 0
                      ? ` + ${formatGuestsCzech(dayData.summary.yes.guestsCount)}`
                      : ''}
                  </div>
                </div>

                <div className="rounded-xl border border-rose-200/80 bg-rose-50/50 p-3.5">
                  <div className="text-xs font-medium text-rose-700">Nepřijdou</div>
                  <div className="mt-1 text-2xl font-extrabold text-rose-900">
                    {dayData.summary.no.count}
                  </div>
                  <div className="text-xs text-rose-700/80">omluvených</div>
                </div>

                <div
                  className={`rounded-xl border p-3.5 ${
                    dayEnough
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-amber-200 bg-amber-50/50'
                  }`}
                >
                  <div className="text-xs font-medium text-slate-600">Stav hry</div>
                  <div
                    className={`mt-1.5 inline-flex items-center gap-1.5 text-sm font-bold ${
                      dayEnough ? 'text-emerald-800' : 'text-amber-800'
                    }`}
                  >
                    {dayEnough ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Dostatek hráčů
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4" />
                        Málo hráčů
                      </>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {formatPlayersCzech(dayData.summary.yes.totalPlayers)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <div className="text-xs font-medium text-slate-600">Komentáře</div>
                  <div className="mt-1 text-2xl font-extrabold text-slate-900">
                    {dayData.comments.length}
                  </div>
                  <div className="text-xs text-slate-500">zpráv u termínu</div>
                </div>
              </div>

              {/* Day Roster Table */}
              {sortedDayVotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-8 text-center text-sm text-slate-500">
                  Pro středu {formatDateCzechShort(selectedDate)} nejsou žádné záznamy o hlasování.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Jméno</th>
                        <th className="px-4 py-3">Účast</th>
                        <th className="px-4 py-3 text-right">Hosté</th>
                        <th className="px-4 py-3 text-right">Celkem míst</th>
                        <th className="px-4 py-3">Minimum</th>
                        <th className="px-4 py-3">Upraveno</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {sortedDayVotes.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2.5 font-medium text-slate-900">
                            {v.user_name}
                          </td>
                          <td className="px-4 py-2.5">
                            {v.attendance === 'yes' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Přijde
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                                <XCircle className="h-3.5 w-3.5" />
                                Nepřijde
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                            {v.attendance === 'yes' && v.guests > 0 ? `+${v.guests}` : '0'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                            {v.attendance === 'yes' ? 1 + v.guests : 0}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {v.attendance === 'yes'
                              ? v.min_players === 'any'
                                ? 'Bez minima'
                                : `Min. ${v.min_players}`
                              : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">
                            {formatDateTimeCs(v.updated_at || v.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Day Comments */}
              {dayData.comments.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Komentáře ({dayData.comments.length})
                  </h3>
                  <div className="space-y-2">
                    {dayData.comments.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/70"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-800">
                            {c.user_name}
                          </span>
                          <span className="text-slate-400">
                            {formatDateTimeCs(c.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-slate-700">{c.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* SECTION 2: Date Range Overview & Multi-Wednesday CSV Reports */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
          <div className="mb-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">
                  Přehled období & CSV reporty
                </h2>
              </div>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
                {bounds.earliest && bounds.latest
                  ? `Záznamy v databázi od ${formatDateCzechShort(
                      bounds.earliest
                    )} do ${formatDateCzechShort(bounds.latest)}`
                  : 'Vyberte rozsah dat pro přehled a hromadný export'}
              </p>
            </div>

            {/* Preset buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: '30d', label: '30 dní' },
                  { id: '90d', label: '3 měsíce' },
                  { id: 'year', label: 'Tento rok' },
                  { id: 'all', label: 'Vše' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    preset === p.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range Inputs + Export Actions */}
          <div className="mb-5 flex flex-col md:flex-row md:items-end justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label
                  htmlFor="range-from"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Od data
                </label>
                <input
                  id="range-from"
                  type="date"
                  value={fromDate}
                  onChange={(e) => updateRange(e.target.value, toDate, 'custom')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <label
                  htmlFor="range-to"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Do data
                </label>
                <input
                  id="range-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => updateRange(fromDate, e.target.value, 'custom')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleExportCsv('range-summary')}
                disabled={exportingKey !== null || loadingRange}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                {exportingKey === 'range-summary' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                Přehled střed (CSV)
              </button>

              <button
                type="button"
                onClick={() => handleExportCsv('range-players')}
                disabled={exportingKey !== null || loadingRange}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs sm:text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60 cursor-pointer"
              >
                {exportingKey === 'range-players' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trophy className="h-4 w-4" />
                )}
                Statistiky hráčů (CSV)
              </button>

              <button
                type="button"
                onClick={() => handleExportCsv('range-detail')}
                disabled={exportingKey !== null || loadingRange}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
              >
                {exportingKey === 'range-detail' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Všechny hlasy (CSV)
              </button>
            </div>
          </div>

          {/* Range KPI Cards */}
          <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="text-xs font-medium text-slate-500">Střed s daty</div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">
                {totalWednesdays}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="text-xs font-medium text-slate-500">
                Dostatek hráčů
              </div>
              <div className="mt-1 text-2xl font-extrabold text-emerald-700">
                {gamesPlayed}
                <span className="ml-1 text-xs font-medium text-slate-400">
                  / {totalWednesdays}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="text-xs font-medium text-slate-500">
                Průměr hráčů / středu
              </div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">
                {avgPlayers}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="text-xs font-medium text-slate-500">
                Unikátních hráčů
              </div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">
                {uniqueActivePlayers}
              </div>
            </div>
          </div>

          {/* Tabs + Search */}
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('wednesdays')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition cursor-pointer ${
                  activeTab === 'wednesdays'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="h-4 w-4" />
                Podle střed ({wednesdays.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('players')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition cursor-pointer ${
                  activeTab === 'players'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="h-4 w-4" />
                Podle hráčů ({players.length})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === 'wednesdays'
                    ? 'Hledat datum nebo hráče…'
                    : 'Hledat jméno hráče…'
                }
                className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {/* Tables */}
          {loadingRange ? (
            <div className="space-y-2.5 animate-pulse">
              <div className="h-12 rounded-xl bg-slate-100" />
              <div className="h-12 rounded-xl bg-slate-100" />
              <div className="h-12 rounded-xl bg-slate-100" />
              <div className="h-12 rounded-xl bg-slate-100" />
            </div>
          ) : activeTab === 'wednesdays' ? (
            filteredWednesdays.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
                V zadaném období nebyly nalezeny žádné záznamy.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Středa</th>
                      <th className="px-4 py-3 text-right">Hráčů celkem</th>
                      <th className="px-4 py-3 text-right">Hlasující / Hosté</th>
                      <th className="px-4 py-3 text-right">Ne</th>
                      <th className="px-4 py-3">Stav</th>
                      <th className="px-4 py-3">Účastníci</th>
                      <th className="px-4 py-3 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredWednesdays.map((w) => {
                      const isCurrentSelected = w.vote_date === selectedDate;
                      return (
                        <tr
                          key={w.vote_date}
                          className={`transition hover:bg-slate-50 ${
                            isCurrentSelected ? 'bg-emerald-50/40' : ''
                          }`}
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                            <button
                              type="button"
                              onClick={() => inspectWednesday(w.vote_date)}
                              className="text-left hover:text-emerald-700 hover:underline cursor-pointer"
                            >
                              {formatDateCzechShort(w.vote_date)}
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-base font-bold tabular-nums text-emerald-800">
                            {w.total_players}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-slate-600">
                            {w.yes_voters}
                            {w.yes_guests > 0 ? ` + ${w.yes_guests}` : ''}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-rose-600">
                            {w.no_voters}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {w.enough_players ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                                <CheckCircle2 className="h-3 w-3" />
                                Hrálo se
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                Málo
                              </span>
                            )}
                          </td>
                          <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-600">
                            {w.attendees.length > 0 ? w.attendees.join(', ') : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => inspectWednesday(w.vote_date)}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer"
                              >
                                Detail
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExportCsv('day', w.vote_date)}
                                disabled={exportingKey === `day-${w.vote_date}`}
                                title="Stáhnout CSV"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                              >
                                {exportingKey === `day-${w.vote_date}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                                CSV
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : filteredPlayers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
              V zadaném období nebyli nalezeni žádní hráči.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Jméno</th>
                    <th className="px-4 py-3 text-right">Účastí (Ano)</th>
                    <th className="px-4 py-3 text-right">Nepřítomností (Ne)</th>
                    <th className="px-4 py-3 text-right">Hosté</th>
                    <th className="px-4 py-3 text-right">Celkem míst</th>
                    <th className="px-4 py-3 text-right">Účast %</th>
                    <th className="px-4 py-3">Poslední účast</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredPlayers.map((p, idx) => (
                    <tr key={p.user_name} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs font-medium text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">
                        {p.user_name}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-emerald-700">
                        {p.yes_count}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-rose-600">
                        {p.no_count}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {p.guests_brought > 0 ? `+${p.guests_brought}` : '0'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                        {p.total_spots}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {p.attendance_rate}%
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                        {p.last_attended ? (
                          <button
                            type="button"
                            onClick={() => inspectWednesday(p.last_attended!)}
                            className="hover:text-emerald-700 hover:underline cursor-pointer"
                          >
                            {formatDateCzechShort(p.last_attended)}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
