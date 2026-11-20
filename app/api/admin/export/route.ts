import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/admin-auth';
import { getAdminReportData, getDayData } from '@/lib/db';
import { isValidDateString } from '@/lib/dates';
import {
  generatePlayerStatsCsv,
  generateRangeDetailCsv,
  generateRangeSummaryCsv,
  generateSingleDayCsv,
} from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: 'Vyžadováno přihlášení' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'day';

    let csv = '';
    let filename = 'gutovka-export.csv';

    if (type === 'day') {
      const date = searchParams.get('date');
      if (!date || !isValidDateString(date)) {
        return NextResponse.json({ error: 'Neplatné datum' }, { status: 400 });
      }
      const dayData = await getDayData(date);
      csv = generateSingleDayCsv(dayData);
      filename = `gutovka-ucast-${date}.csv`;
    } else if (
      type === 'range-summary' ||
      type === 'range-players' ||
      type === 'range-detail'
    ) {
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

      const rangeSuffix =
        from && to ? `${from}_${to}` : from ? `od-${from}` : to ? `do-${to}` : 'vse';

      const { wednesdays, players, votes } = await getAdminReportData(from, to);

      if (type === 'range-summary') {
        csv = generateRangeSummaryCsv(wednesdays);
        filename = `gutovka-prehled-stred-${rangeSuffix}.csv`;
      } else if (type === 'range-players') {
        csv = generatePlayerStatsCsv(players);
        filename = `gutovka-statistiky-hracu-${rangeSuffix}.csv`;
      } else {
        csv = generateRangeDetailCsv(votes);
        filename = `gutovka-detail-hlasu-${rangeSuffix}.csv`;
      }
    } else {
      return NextResponse.json({ error: 'Neplatný typ exportu' }, { status: 400 });
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error generating CSV export:', error);
    return NextResponse.json(
      { error: 'Chyba při generování CSV exportu' },
      { status: 500 }
    );
  }
}
