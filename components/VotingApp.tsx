'use client';

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Lock,
  MessageSquare,
  Minus,
  Plus,
  Send,
  Shield,
  User,
  UserPlus,
  Users,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  DayData,
  buildVoteSummary,
  calculateEnoughPlayers,
  createEmptySummary,
  formatGuestsCzech,
  formatPlayersCzech,
  formatVotersCzech,
} from '@/lib/types';
import {
  formatDateCzechFromString,
  formatDateCzechShort,
  isDateStringInPast,
  isDateStringToday,
} from '@/lib/dates';

interface VotingAppProps {
  wednesdays: string[];
  initialDate: string;
  initialDayData: DayData | null;
  initialError?: string;
}

type VoteKey = 'yes-any' | 'yes-6' | 'yes-8' | 'no-any';

const USERNAME_STORAGE_KEY = 'footballVotingUsername';
const usernameListeners = new Set<() => void>();

function subscribeUsername(listener: () => void) {
  usernameListeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === USERNAME_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    usernameListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function getClientUsername(): string {
  try {
    return localStorage.getItem(USERNAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerUsername(): string {
  return '';
}

function writeStoredUsername(value: string) {
  try {
    localStorage.setItem(USERNAME_STORAGE_KEY, value);
  } catch {
    // Ignore storage errors
  }
  usernameListeners.forEach((l) => l());
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function emptyDay(date: string): DayData {
  return {
    date,
    votes: [],
    summary: createEmptySummary(),
    comments: [],
  };
}

export default function VotingApp({
  wednesdays,
  initialDate,
  initialDayData,
  initialError = '',
}: VotingAppProps) {
  const initialIndex = Math.max(0, wednesdays.indexOf(initialDate));
  const [currentDateIndex, setCurrentDateIndex] = useState(initialIndex);

  // In-memory cache keyed by YYYY-MM-DD for instant week switching
  const cacheRef = useRef<Map<string, DayData>>(
    new Map(initialDayData ? [[initialDate, initialDayData]] : [])
  );

  const [dayData, setDayData] = useState<DayData>(
    initialDayData ?? emptyDay(initialDate)
  );
  const [isLoadingDate, setIsLoadingDate] = useState(!initialDayData && !initialError);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [submittingVote, setSubmittingVote] = useState<VoteKey | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);

  const userName = useSyncExternalStore(
    subscribeUsername,
    getClientUsername,
    getServerUsername
  );

  const [guestDraft, setGuestDraft] = useState<{ key: string; value: number } | null>(
    null
  );
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState(initialError);
  const [toast, setToast] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchedRef = useRef<Set<string>>(new Set(initialDayData ? [initialDate] : []));

  const currentDateString = wednesdays[currentDateIndex] ?? initialDate;
  const isPastDate = isDateStringInPast(currentDateString);
  const isToday = isDateStringToday(currentDateString);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // Fetch a specific date's combined data (votes + summary + comments in 1 request)
  const fetchDay = useCallback(async (dateStr: string, background = false) => {
    if (!background) {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const cached = cacheRef.current.get(dateStr);
      if (cached) {
        setDayData(cached);
        setIsLoadingDate(false);
        setIsRefreshing(true);
      } else {
        setIsLoadingDate(true);
        setIsRefreshing(false);
      }
      setError('');

      try {
        const res = await fetch(`/api/day?date=${encodeURIComponent(dateStr)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Chyba při načítání dat');
        }
        const fresh: DayData = await res.json();
        cacheRef.current.set(dateStr, fresh);
        setDayData(fresh);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('Error loading day data:', err);
        setError((err as Error).message || 'Chyba při načítání dat');
      } finally {
        if (abortRef.current === controller) {
          setIsLoadingDate(false);
          setIsRefreshing(false);
        }
      }
    } else {
      if (prefetchedRef.current.has(dateStr)) return;
      prefetchedRef.current.add(dateStr);
      try {
        const res = await fetch(`/api/day?date=${encodeURIComponent(dateStr)}`);
        if (res.ok) {
          const fresh: DayData = await res.json();
          cacheRef.current.set(dateStr, fresh);
        }
      } catch {
        prefetchedRef.current.delete(dateStr);
      }
    }
  }, []);

  // Fallback client fetch on mount ONLY if SSR didn't supply initial data
  useEffect(() => {
    if (initialDayData) return;
    let active = true;
    const controller = new AbortController();

    fetch(`/api/day?date=${encodeURIComponent(initialDate)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Chyba při načítání dat');
        return data as DayData;
      })
      .then((fresh) => {
        if (!active) return;
        cacheRef.current.set(initialDate, fresh);
        setDayData(fresh);
        setError('');
      })
      .catch((err) => {
        if (!active || (err as Error).name === 'AbortError') return;
        setError((err as Error).message || 'Chyba při načítání dat');
      })
      .finally(() => {
        if (active) setIsLoadingDate(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [initialDate, initialDayData]);

  // Prefetch adjacent Wednesdays gently in background for instant navigation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentDateIndex > 0) {
        fetchDay(wednesdays[currentDateIndex - 1], true);
      }
      if (currentDateIndex < wednesdays.length - 1) {
        fetchDay(wednesdays[currentDateIndex + 1], true);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [currentDateIndex, wednesdays, fetchDay]);

  const selectDateIndex = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= wednesdays.length) return;
    if (nextIndex === currentDateIndex) return;
    setCurrentDateIndex(nextIndex);
    setGuestDraft(null);
    fetchDay(wednesdays[nextIndex], false);
  };

  // Derive current user's vote for this Wednesday (automatically resets when empty!)
  const trimmedName = userName.trim();
  const myVote = trimmedName
    ? dayData.votes.find(
        (v) => v.user_name.trim().toLowerCase() === trimmedName.toLowerCase()
      ) ?? null
    : null;

  const baseGuestCount = myVote && myVote.attendance === 'yes' ? myVote.guests : 0;
  const guestDraftKey = `${currentDateString}:${trimmedName.toLowerCase()}:${myVote?.id ?? 'none'}:${baseGuestCount}`;
  const guestCount =
    guestDraft?.key === guestDraftKey ? guestDraft.value : baseGuestCount;

  const setGuestCount = (nextValue: number) => {
    setGuestDraft({
      key: guestDraftKey,
      value: Math.min(10, Math.max(0, nextValue)),
    });
  };

  const handleUsernameChange = (name: string) => {
    writeStoredUsername(name);
    if (error === 'Zadejte své jméno') setError('');
  };

  const handleVote = async (
    attendance: 'yes' | 'no',
    minPlayers: 'any' | '6' | '8'
  ) => {
    if (!trimmedName) {
      setError('Zadejte své jméno');
      return;
    }

    const voteKey: VoteKey = `${attendance}-${minPlayers}` as VoteKey;
    setSubmittingVote(voteKey);
    setError('');

    try {
      const response = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: trimmedName,
          voteDate: currentDateString,
          attendance,
          minPlayers,
          guests: attendance === 'no' ? 0 : guestCount,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Chyba při hlasování');
        return;
      }

      const updatedDay: DayData = {
        ...dayData,
        votes: data.votes,
        summary: data.summary ?? buildVoteSummary(data.votes),
      };
      cacheRef.current.set(currentDateString, updatedDay);
      setDayData(updatedDay);
      setGuestDraft(null);
      showToast(
        attendance === 'yes'
          ? guestCount > 0
            ? `Hlas uložen (+${formatGuestsCzech(guestCount)})`
            : 'Hlas „Přijdu“ uložen'
          : 'Hlas „Nepřijdu“ uložen'
      );
    } catch (err) {
      console.error('Error voting:', err);
      setError('Chyba při ukládání hlasování');
    } finally {
      setSubmittingVote(null);
    }
  };

  const handleAddComment = async () => {
    if (!trimmedName) {
      setError('Zadejte své jméno');
      return;
    }
    if (!newComment.trim()) {
      setError('Zadejte komentář');
      return;
    }

    setSubmittingComment(true);
    setError('');

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: trimmedName,
          voteDate: currentDateString,
          comment: newComment.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Chyba při přidávání komentáře');
        return;
      }

      setNewComment('');
      const updatedDay: DayData = {
        ...dayData,
        comments: data.comments,
      };
      cacheRef.current.set(currentDateString, updatedDay);
      setDayData(updatedDay);
      showToast('Komentář přidán');
    } catch (err) {
      console.error('Error adding comment:', err);
      setError('Chyba při přidávání komentáře');
    } finally {
      setSubmittingComment(false);
    }
  };

  const { summary, comments } = dayData;
  const totalPlayers = summary.yes.totalPlayers;
  const totalGuests = summary.yes.guestsCount;
  const enoughPlayers = calculateEnoughPlayers(summary);
  const progressPct = Math.min(100, Math.round((totalPlayers / 8) * 100));

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isPastDate
          ? 'bg-gradient-to-b from-slate-100 via-slate-100 to-slate-200/70'
          : 'bg-gradient-to-b from-emerald-50/90 via-slate-50 to-slate-100/80'
      }`}
    >
      {/* Top Loading Bar */}
      {(isLoadingDate || isRefreshing) && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-emerald-100 overflow-hidden">
          <div className="h-full w-1/2 bg-emerald-600 animate-loading-bar rounded-full" />
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg ring-1 ring-white/10"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        {/* Top Utility Bar */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl shadow-sm ${
                isPastDate
                  ? 'bg-slate-700 text-white'
                  : 'bg-gradient-to-br from-emerald-600 to-green-700 text-white'
              }`}
            >
              ⚽
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                Hlasování Gutovka
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Středeční fotbálek
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchDay(currentDateString, false)}
              disabled={isLoadingDate || isRefreshing}
              title="Obnovit data"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoadingDate || isRefreshing ? 'animate-spin text-emerald-600' : ''}`}
              />
            </button>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-800"
            >
              <Shield className="h-4 w-4 text-emerald-600" />
              <span>Admin</span>
            </Link>
          </div>
        </div>

        {/* Date Navigation & Name Card */}
        <section
          className={`mb-6 rounded-2xl border shadow-sm transition-colors ${
            isPastDate
              ? 'border-slate-300/80 bg-white/90'
              : 'border-emerald-200/70 bg-white'
          } p-5 sm:p-6`}
        >
          {/* Past Date Banner */}
          {isPastDate && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-100/90 px-4 py-3 text-slate-700">
              <Clock className="h-5 w-5 text-slate-500 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-slate-800">Historická data</span>
                <span className="text-slate-600"> — prohlížíte výsledky z minulé středy</span>
              </div>
            </div>
          )}

          {/* Main Date Switcher */}
          <div className="flex items-center justify-between gap-2 sm:gap-4 mb-4">
            <button
              type="button"
              onClick={() => selectDateIndex(currentDateIndex - 1)}
              disabled={currentDateIndex === 0}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Předchozí</span>
            </button>

            <div className="flex flex-col items-center text-center min-w-0">
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Calendar
                  className={`h-4 w-4 shrink-0 ${
                    isPastDate ? 'text-slate-400' : 'text-emerald-600'
                  }`}
                />
                <h2 className="text-lg sm:text-xl font-bold capitalize text-slate-900">
                  {formatDateCzechFromString(currentDateString)}
                </h2>
              </div>

              <div className="mt-1.5 flex items-center gap-2 flex-wrap justify-center">
                {isToday && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Dnes
                  </span>
                )}
                {isPastDate && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    Minulost
                  </span>
                )}
                {currentDateString !== initialDate && (
                  <button
                    type="button"
                    onClick={() => selectDateIndex(initialIndex)}
                    className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100 cursor-pointer"
                  >
                    Zpět na nejbližší středu
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => selectDateIndex(currentDateIndex + 1)}
              disabled={currentDateIndex === wednesdays.length - 1}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="hidden sm:inline">Další</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Quick Wednesday Pills */}
          <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
            {wednesdays.map((wed, idx) => {
              const selected = idx === currentDateIndex;
              const past = isDateStringInPast(wed);
              const today = isDateStringToday(wed);
              return (
                <button
                  key={wed}
                  type="button"
                  onClick={() => selectDateIndex(idx)}
                  className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer ${
                    selected
                      ? past
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'bg-emerald-600 text-white shadow-xs'
                      : past
                      ? 'bg-slate-100 text-slate-500 hover:bg-slate-200/80'
                      : 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  {formatDateCzechShort(wed)}
                  {today ? ' •' : ''}
                </button>
              );
            })}
          </div>

          {/* User Name Input */}
          <div>
            <label
              htmlFor="voter-name"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"
            >
              <User className="h-4 w-4 text-slate-400" />
              Vaše jméno
            </label>
            <input
              id="voter-name"
              type="text"
              value={userName}
              onChange={(e) => handleUsernameChange(e.target.value)}
              maxLength={100}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-emerald-500/20"
              placeholder="Zadejte své jméno (uloží se pro příště)"
            />
          </div>

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="mt-4 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}
        </section>

        {/* Attendance Overview Card */}
        <section
          className={`mb-6 rounded-2xl border shadow-sm ${
            isPastDate
              ? 'border-slate-300/80 bg-white/90'
              : 'border-slate-200/80 bg-white'
          } p-5 sm:p-6`}
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" />
              <h3 className="text-lg font-bold text-slate-900">Přehled účasti</h3>
            </div>
            <div className="flex items-center gap-2">
              {isRefreshing && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Aktualizuji…
                </span>
              )}
              {isPastDate && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  Konečné výsledky
                </span>
              )}
            </div>
          </div>

          {isLoadingDate ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-24 rounded-xl bg-slate-100" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-40 rounded-xl bg-slate-100" />
                <div className="h-40 rounded-xl bg-slate-100" />
              </div>
            </div>
          ) : (
            <>
              {/* Total Players Hero Banner */}
              <div
                className={`mb-5 rounded-xl border p-4 sm:p-5 transition-colors ${
                  enoughPlayers
                    ? 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50/70'
                    : 'border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/70'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <span
                        className={`text-3xl font-extrabold tracking-tight ${
                          enoughPlayers ? 'text-emerald-900' : 'text-amber-900'
                        }`}
                      >
                        {formatPlayersCzech(totalPlayers)}
                      </span>
                      {totalGuests > 0 && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            enoughPlayers
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {formatVotersCzech(summary.yes.count)} +{' '}
                          {formatGuestsCzech(totalGuests)}
                        </span>
                      )}
                    </div>
                    <div
                      className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${
                        enoughPlayers ? 'text-emerald-700' : 'text-amber-800'
                      }`}
                    >
                      {enoughPlayers ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>Dostatek hráčů na hru!</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>
                            Málo hráčů na hru
                            {totalPlayers < 4
                              ? ` (chybí alespoň ${4 - totalPlayers})`
                              : ' (nesplněna minima hráčů)'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mini Progress Bar to 8 */}
                  <div className="w-full sm:w-44">
                    <div className="mb-1 flex justify-between text-xs font-medium text-slate-600">
                      <span>Obsazenost</span>
                      <span>{totalPlayers} / 8+</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/80 ring-1 ring-black/5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          enoughPlayers ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Yes / No Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Coming */}
                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <h4 className="font-semibold text-emerald-900">Přijdou</h4>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-extrabold text-emerald-800">
                        {summary.yes.totalPlayers}
                      </span>
                      {summary.yes.guestsCount > 0 && (
                        <span className="ml-1.5 text-xs font-medium text-emerald-700">
                          ({summary.yes.count} + {summary.yes.guestsCount}{' '}
                          {summary.yes.guestsCount === 1
                            ? 'host'
                            : summary.yes.guestsCount <= 4
                            ? 'hosté'
                            : 'hostů'}
                          )
                        </span>
                      )}
                    </div>
                  </div>

                  {summary.yes.usersWithMinPlayers.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">
                      Zatím nikdo nehlasoval „Přijdu“
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {summary.yes.usersWithMinPlayers.map((user, index) => {
                        const isMe =
                          trimmedName.length > 0 &&
                          user.name.trim().toLowerCase() === trimmedName.toLowerCase();
                        return (
                          <li
                            key={`${user.name}-${index}`}
                            className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
                              isMe
                                ? 'bg-emerald-100/90 ring-1 ring-emerald-300 font-medium text-emerald-950'
                                : 'bg-white/90 text-slate-800 shadow-2xs ring-1 ring-slate-200/60'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-[11px] font-bold text-emerald-800">
                                {getInitials(user.name)}
                              </span>
                              <span className="truncate">{user.name}</span>
                              {user.guests > 0 && (
                                <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                                  +{user.guests}{' '}
                                  {user.guests === 1
                                    ? 'host'
                                    : user.guests <= 4
                                    ? 'hosté'
                                    : 'hostů'}
                                </span>
                              )}
                            </div>
                            <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                              {user.minPlayers === 'any'
                                ? 'bez minima'
                                : `min. ${user.minPlayers}`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Not Coming */}
                <div className="rounded-xl border border-rose-200/80 bg-rose-50/40 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-rose-500" />
                      <h4 className="font-semibold text-rose-900">Nepřijdou</h4>
                    </div>
                    <span className="text-2xl font-extrabold text-rose-700">
                      {summary.no.count}
                    </span>
                  </div>

                  {summary.no.users.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">
                      Zatím nikdo neomluvil účast
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {summary.no.users.map((name, idx) => {
                        const isMe =
                          trimmedName.length > 0 &&
                          name.trim().toLowerCase() === trimmedName.toLowerCase();
                        return (
                          <span
                            key={`${name}-${idx}`}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ${
                              isMe
                                ? 'bg-rose-100 ring-1 ring-rose-300 font-medium text-rose-950'
                                : 'bg-white/90 text-slate-700 ring-1 ring-slate-200/70'
                            }`}
                          >
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-[10px] font-bold text-rose-700">
                              {getInitials(name)}
                            </span>
                            {name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Voting Section */}
        <section
          className={`mb-6 rounded-2xl border shadow-sm ${
            isPastDate
              ? 'border-slate-300/80 bg-white/90'
              : 'border-slate-200/80 bg-white'
          } p-5 sm:p-6`}
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-slate-900">Vaše hlasování</h3>
            {myVote && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  myVote.attendance === 'yes'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                <Check className="h-3.5 w-3.5" />
                {myVote.attendance === 'yes' ? (
                  <>
                    Přijdu (
                    {myVote.min_players === 'any'
                      ? 'bez minima'
                      : `min. ${myVote.min_players}`}
                    {myVote.guests > 0 ? `, +${myVote.guests}` : ''})
                  </>
                ) : (
                  'Nepřijdu'
                )}
              </span>
            )}
          </div>

          {!isPastDate ? (
            <>
              {/* Guest Count Selector */}
              <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      Přivedu hosty
                    </div>
                    <div className="text-xs text-slate-500">
                      {guestCount === 0
                        ? 'Jdu sám (1 místo)'
                        : `Já + ${formatGuestsCzech(guestCount)} = ${formatPlayersCzech(
                            1 + guestCount
                          )}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Odebrat hosta"
                    onClick={() => setGuestCount(guestCount - 1)}
                    disabled={guestCount === 0 || submittingVote !== null}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-lg font-bold tabular-nums text-slate-900">
                    {guestCount}
                  </span>
                  <button
                    type="button"
                    aria-label="Přidat hosta"
                    onClick={() => setGuestCount(guestCount + 1)}
                    disabled={guestCount === 10 || submittingVote !== null}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Yes Vote */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
                  <h4 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Přijdu
                    {guestCount > 0 && (
                      <span className="ml-1 rounded-full bg-emerald-200/80 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                        +{guestCount}
                      </span>
                    )}
                  </h4>
                  <div className="space-y-2">
                    {(['any', '6', '8'] as const).map((minPlayers) => {
                      const key: VoteKey = `yes-${minPlayers}`;
                      const isSubmittingThis = submittingVote === key;
                      const isSelected =
                        myVote?.attendance === 'yes' &&
                        myVote.min_players === minPlayers &&
                        myVote.guests === guestCount;
                      return (
                        <button
                          key={minPlayers}
                          type="button"
                          onClick={() => handleVote('yes', minPlayers)}
                          disabled={submittingVote !== null}
                          className={`flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold transition cursor-pointer disabled:opacity-60 ${
                            isSelected
                              ? 'bg-emerald-700 text-white shadow-sm ring-2 ring-emerald-500 ring-offset-1'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs'
                          }`}
                        >
                          <span>
                            {minPlayers === 'any'
                              ? 'Bez minima'
                              : `Min. ${minPlayers} hráčů`}
                          </span>
                          {isSubmittingThis ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isSelected ? (
                            <Check className="h-4 w-4" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* No Vote */}
                <div className="flex flex-col justify-between rounded-xl border border-rose-200 bg-rose-50/30 p-4">
                  <div>
                    <h4 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-rose-800">
                      <XCircle className="h-4 w-4" />
                      Nepřijdu
                    </h4>
                    <p className="mb-4 text-xs text-slate-500">
                      Dej vědět ostatním, že tentokrát nemůžeš dorazit.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleVote('no', 'any')}
                    disabled={submittingVote !== null}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition cursor-pointer disabled:opacity-60 ${
                      myVote?.attendance === 'no'
                        ? 'bg-rose-700 text-white shadow-sm ring-2 ring-rose-500 ring-offset-1'
                        : 'bg-rose-600 text-white hover:bg-rose-700 shadow-2xs'
                    }`}
                  >
                    {submittingVote === 'no-any' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Ukládám…
                      </>
                    ) : (
                      <>
                        {myVote?.attendance === 'no' && <Check className="h-4 w-4" />}
                        Nepřijdu
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                <Lock className="h-5 w-5" />
              </div>
              <p className="font-semibold text-slate-700">Hlasování uzavřeno</p>
              <p className="mt-0.5 text-sm text-slate-500">
                Tato středa již proběhla
              </p>
            </div>
          )}
        </section>

        {/* Comments Section */}
        <section
          className={`rounded-2xl border shadow-sm ${
            isPastDate
              ? 'border-slate-300/80 bg-white/90'
              : 'border-slate-200/80 bg-white'
          } p-5 sm:p-6`}
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-600" />
              <h3 className="text-lg font-bold text-slate-900">
                Komentáře
                {!isLoadingDate && comments.length > 0 && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {comments.length}
                  </span>
                )}
              </h3>
            </div>
            {isPastDate && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                Archiv komentářů
              </span>
            )}
          </div>

          {/* Add Comment */}
          {!isPastDate ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddComment();
              }}
              className="mb-5 flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                disabled={submittingComment}
                className="flex-1 rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-emerald-500/20"
                placeholder="Přidejte komentář (např. vezmu míč, přijdu o 5 min později)…"
              />
              <button
                type="submit"
                disabled={submittingComment || !newComment.trim() || !trimmedName}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-2xs transition hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer"
              >
                {submittingComment ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Odesílám…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Přidat
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
              Přidávání komentářů k historickým datům není možné
            </div>
          )}

          {/* Comments List */}
          {isLoadingDate ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-16 rounded-xl bg-slate-100" />
              <div className="h-16 rounded-xl bg-slate-100" />
            </div>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Zatím žádné komentáře
            </p>
          ) : (
            <div className="space-y-2.5">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className={`rounded-xl border p-3.5 ${
                    isPastDate
                      ? 'border-slate-200 bg-slate-50/80'
                      : 'border-slate-200/80 bg-slate-50/60'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-700">
                        {getInitials(comment.user_name)}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {comment.user_name}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(comment.created_at).toLocaleDateString('cs-CZ', {
                        day: 'numeric',
                        month: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Europe/Prague',
                      })}
                    </span>
                  </div>
                  <p className="pl-8 text-sm text-slate-700 whitespace-pre-wrap break-words">
                    {comment.comment}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
