import VotingApp from '@/components/VotingApp';
import { getCurrentWednesdayString, getWednesdaysRangeStrings } from '@/lib/dates';
import { getDayData, isDatabaseConfigured } from '@/lib/db';
import { DayData } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const initialDate = getCurrentWednesdayString();
  const wednesdays = getWednesdaysRangeStrings(4, 5);

  let initialDayData: DayData | null = null;
  let initialError = '';

  if (isDatabaseConfigured()) {
    try {
      initialDayData = await getDayData(initialDate);
    } catch (error) {
      console.error('SSR initial load failed, falling back to client:', error);
      initialError = 'Nepodařilo se načíst data ze serveru';
    }
  }

  return (
    <VotingApp
      wednesdays={wednesdays}
      initialDate={initialDate}
      initialDayData={initialDayData}
      initialError={initialError}
    />
  );
}
