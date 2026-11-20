import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/admin-auth';
import { getAdminReportData, getDateBounds, getDayData } from '@/lib/db';
import { isValidDateString } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: 'Vyžadováno přihlášení' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    // Mode 1: Single Wednesday detail
    if (date) {
      if (!isValidDateString(date)) {
        return NextResponse.json({ error: 'Neplatné datum' }, { status: 400 });
      }
      const day = await getDayData(date);
      return NextResponse.json(day, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Mode 2: Date-range overview + player statistics
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    if (from && !isValidDateString(from)) {
      return NextResponse.json({ error: 'Neplatné počáteční datum' }, { status: 400 });
    }
    if (to && !isValidDateString(to)) {
      return NextResponse.json({ error: 'Neplatné koncové datum' }, { status: 400 });
    }
    if (from && to && from > to) {
      return NextResponse.json(
        { error: 'Počáteční datum nemůže být po koncovém datu' },
        { status: 400 }
      );
    }

    const [{ wednesdays, players }, bounds] = await Promise.all([
      getAdminReportData(from, to),
      getDateBounds(),
    ]);

    return NextResponse.json(
      { wednesdays, players, bounds },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Error fetching admin data:', error);
    return NextResponse.json(
      { error: 'Chyba při načítání administrátorských dat' },
      { status: 500 }
    );
  }
}
