import type { Metadata } from 'next';
import AdminDashboard from '@/components/AdminDashboard';
import { isAdminAuthenticated, isAdminAuthRequired } from '@/lib/admin-auth';
import { getCurrentWednesdayString } from '@/lib/dates';
import {
  getAdminReportData,
  getDateBounds,
  getDayData,
  isDatabaseConfigured,
} from '@/lib/db';
import {
  DayData,
  PlayerAttendanceStats,
  WednesdayOverviewRow,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Hlasování Gutovka',
  description: 'Přehled středečních účastí a exporty CSV',
};

export default async function AdminPage() {
  const authRequired = isAdminAuthRequired();
  const authenticated = await isAdminAuthenticated();
  const initialSelectedDate = getCurrentWednesdayString();

  let initialDayData: DayData | null = null;
  let initialWednesdays: WednesdayOverviewRow[] = [];
  let initialPlayers: PlayerAttendanceStats[] = [];
  let initialBounds: { earliest: string | null; latest: string | null } = {
    earliest: null,
    latest: null,
  };
  let initialError = '';

  if (authenticated && isDatabaseConfigured()) {
    try {
      const [dayData, reportData, bounds] = await Promise.all([
        getDayData(initialSelectedDate),
        getAdminReportData(),
        getDateBounds(),
      ]);
      initialDayData = dayData;
      initialWednesdays = reportData.wednesdays;
      initialPlayers = reportData.players;
      initialBounds = bounds;
    } catch (error) {
      console.error('Admin SSR initial load failed:', error);
      initialError = 'Nepodařilo se načíst administrátorská data';
    }
  }

  return (
    <AdminDashboard
      authRequired={authRequired}
      initialAuthenticated={authenticated}
      initialSelectedDate={initialSelectedDate}
      initialDayData={initialDayData}
      initialWednesdays={initialWednesdays}
      initialPlayers={initialPlayers}
      initialBounds={initialBounds}
      initialError={initialError}
    />
  );
}
