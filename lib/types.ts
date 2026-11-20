export interface Vote {
  id: number;
  user_name: string;
  vote_date: string; // YYYY-MM-DD
  attendance: 'yes' | 'no';
  min_players: 'any' | '6' | '8';
  guests: number;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  user_name: string;
  vote_date: string; // YYYY-MM-DD
  comment: string;
  created_at: string;
}

export interface VoteUserSummary {
  name: string;
  minPlayers: 'any' | '6' | '8';
  guests: number;
}

export interface VoteSummaryBucket {
  count: number; // Number of voters
  guestsCount: number; // Total guests brought by these voters
  totalPlayers: number; // count + guestsCount (0 for 'no')
  users: string[];
  usersWithMinPlayers: VoteUserSummary[];
}

export interface VoteSummary {
  yes: VoteSummaryBucket;
  no: VoteSummaryBucket;
}

export interface DayData {
  date: string;
  votes: Vote[];
  summary: VoteSummary;
  comments: Comment[];
}

export interface WednesdayOverviewRow {
  vote_date: string;
  yes_voters: number;
  yes_guests: number;
  total_players: number;
  no_voters: number;
  comments_count: number;
  enough_players: boolean;
  attendees: string[];
}

export interface PlayerAttendanceStats {
  user_name: string;
  yes_count: number;
  no_count: number;
  guests_brought: number;
  total_spots: number; // yes_count + guests_brought
  last_attended: string | null;
  attendance_rate: number; // percentage of yes / (yes + no)
}

export function createEmptySummary(): VoteSummary {
  return {
    yes: {
      count: 0,
      guestsCount: 0,
      totalPlayers: 0,
      users: [],
      usersWithMinPlayers: [],
    },
    no: {
      count: 0,
      guestsCount: 0,
      totalPlayers: 0,
      users: [],
      usersWithMinPlayers: [],
    },
  };
}

/**
 * Computes VoteSummary directly from Vote rows so client & server always stay
 * consistent without needing a duplicate SQL aggregation query.
 */
export function buildVoteSummary(votes: Vote[]): VoteSummary {
  const summary = createEmptySummary();

  for (const vote of votes) {
    if (vote.attendance !== 'yes' && vote.attendance !== 'no') {
      continue;
    }

    const guests = vote.attendance === 'yes' ? Math.max(0, Number(vote.guests) || 0) : 0;
    const minPlayers: 'any' | '6' | '8' =
      vote.min_players === '6' || vote.min_players === '8' ? vote.min_players : 'any';

    const bucket = summary[vote.attendance];
    bucket.count += 1;
    bucket.guestsCount += guests;
    if (vote.attendance === 'yes') {
      bucket.totalPlayers += 1 + guests;
    }
    bucket.users.push(vote.user_name);
    bucket.usersWithMinPlayers.push({
      name: vote.user_name,
      minPlayers,
      guests,
    });
  }

  return summary;
}

/**
 * Determines whether there are enough players to play, accounting for both
 * voters AND their guests as well as each voter's minimum-players requirement.
 */
export function calculateEnoughPlayers(summary: VoteSummary): boolean {
  const { totalPlayers, usersWithMinPlayers } = summary.yes;
  if (totalPlayers === 0) return false;

  const specificMinVoters = usersWithMinPlayers.filter((u) => u.minPlayers !== 'any');

  if (specificMinVoters.length === 0) {
    return totalPlayers >= 4;
  }

  // Unique numeric minimum thresholds sorted descending (e.g. [8, 6])
  const uniqueMinRequirements = [
    ...new Set(specificMinVoters.map((u) => parseInt(u.minPlayers, 10))),
  ].sort((a, b) => b - a);

  for (const minThreshold of uniqueMinRequirements) {
    // Count ALL players (voters + their guests) who are satisfied at this threshold
    const satisfiedPlayers = usersWithMinPlayers.reduce((sum, user) => {
      const satisfied =
        user.minPlayers === 'any' || parseInt(user.minPlayers, 10) <= minThreshold;
      return satisfied ? sum + 1 + (user.guests || 0) : sum;
    }, 0);

    if (satisfiedPlayers >= minThreshold) {
      return true;
    }
  }

  // Fallback: even if specific-threshold voters aren't satisfied, check if "any" players alone are >= 4
  const unconditionalPlayers = usersWithMinPlayers.reduce((sum, user) => {
    return user.minPlayers === 'any' ? sum + 1 + (user.guests || 0) : sum;
  }, 0);

  return unconditionalPlayers >= 4;
}

/**
 * Computes how many players would actually play (the largest satisfied cohort).
 */
export function getEffectivePlayerCount(summary: VoteSummary): number {
  const { usersWithMinPlayers } = summary.yes;
  if (usersWithMinPlayers.length === 0) return 0;

  for (const threshold of [8, 6]) {
    const satisfiedPlayers = usersWithMinPlayers.reduce((sum, user) => {
      const satisfied =
        user.minPlayers === 'any' || parseInt(user.minPlayers, 10) <= threshold;
      return satisfied ? sum + 1 + (user.guests || 0) : sum;
    }, 0);
    if (satisfiedPlayers >= threshold) {
      return satisfiedPlayers;
    }
  }

  return usersWithMinPlayers.reduce((sum, user) => {
    return user.minPlayers === 'any' ? sum + 1 + (user.guests || 0) : sum;
  }, 0);
}

export function formatPlayersCzech(count: number): string {
  if (count === 1) return '1 hráč';
  if (count >= 2 && count <= 4) return `${count} hráči`;
  return `${count} hráčů`;
}

export function formatGuestsCzech(count: number): string {
  if (count === 1) return '1 host';
  if (count >= 2 && count <= 4) return `${count} hosté`;
  return `${count} hostů`;
}

export function formatVotersCzech(count: number): string {
  if (count === 1) return '1 hlasující';
  if (count >= 2 && count <= 4) return `${count} hlasující`;
  return `${count} hlasujících`;
}
