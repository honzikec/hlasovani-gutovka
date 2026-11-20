import { NextRequest, NextResponse } from 'next/server';
import { getDayData } from '@/lib/db';
import { isValidDateString } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date || !isValidDateString(date)) {
      return NextResponse.json(
        { error: 'Neplatné nebo chybějící datum (očekává se YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const data = await getDayData(date);
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error fetching day data:', error);
    return NextResponse.json(
      { error: 'Chyba při načítání dat' },
      { status: 500 }
    );
  }
}
