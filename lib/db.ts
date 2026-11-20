import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import {
  buildVoteSummary,
  calculateEnoughPlayers,
  Comment,
  DayData,
  PlayerAttendanceStats,
  Vote,
  VoteSummary,
  WednesdayOverviewRow,
} from './types';

let sqlClient: NeonQueryFunction<false, false> | null = null;
let initPromise: Promise<void> | null = null;
let schemaInitialized = false;

function getConnectionString(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getConnectionString());
}

function getSql(): NeonQueryFunction<false, false> {
  if (!sqlClient) {
    const conn = getConnectionString();
    if (!conn) {
      throw new Error(
        'Database connection string is not configured (set DATABASE_URL or POSTGRES_URL).'
      );
    }
    sqlClient = neon(conn);
  }
  return sqlClient;
}

function isSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  // 42P01 = undefined_table, 42703 = undefined_column
  return code === '42P01' || code === '42703';
}

// Initialize database tables (only invoked lazily if schema doesn't exist yet)
export async function initializeDatabase(): Promise<void> {
  if (schemaInitialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS votes (
          id SERIAL PRIMARY KEY,
          user_name VARCHAR(100) NOT NULL,
          vote_date DATE NOT NULL,
          attendance VARCHAR(10) NOT NULL CHECK (attendance IN ('yes', 'no')),
          min_players VARCHAR(10) NOT NULL CHECK (min_players IN ('any', '6', '8')),
          guests INTEGER DEFAULT 0 CHECK (guests >= 0 AND guests <= 10),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_name, vote_date)
        )
      `;

      await sql`
        ALTER TABLE votes
        ADD COLUMN IF NOT EXISTS guests INTEGER DEFAULT 0 CHECK (guests >= 0 AND guests <= 10)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS comments (
          id SERIAL PRIMARY KEY,
          user_name VARCHAR(100) NOT NULL,
          vote_date DATE NOT NULL,
          comment TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      await Promise.all([
        sql`CREATE INDEX IF NOT EXISTS idx_votes_date ON votes(vote_date)`,
        sql`CREATE INDEX IF NOT EXISTS idx_comments_date ON comments(vote_date)`,
      ]);

      schemaInitialized = true;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/**
 * Executes a DB operation directly with zero DDL overhead on warm/existing DBs,
 * automatically initializing tables and retrying once if a fresh DB lacks schema.
 */
async function withSchemaFallback<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!schemaInitialized && isSchemaMissingError(error)) {
      await initializeDatabase();
      return await operation();
    }
    throw error;
  }
}

function normalizeVote(row: Record<string, unknown>): Vote {
  return {
    id: Number(row.id),
    user_name: String(row.user_name),
    vote_date: String(row.vote_date),
    attendance: row.attendance === 'no' ? 'no' : 'yes',
    min_players:
      row.min_players === '6' || row.min_players === '8' ? row.min_players : 'any',
    guests: Math.max(0, Number(row.guests) || 0),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? ''),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? ''),
  };
}

function normalizeComment(row: Record<string, unknown>): Comment {
  return {
    id: Number(row.id),
    user_name: String(row.user_name),
    vote_date: String(row.vote_date),
    comment: String(row.comment),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? ''),
  };
}

// Get votes for a specific date
export async function getVotesForDate(date: string): Promise<Vote[]> {
  return withSchemaFallback(async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT
        id,
        user_name,
        TO_CHAR(vote_date, 'YYYY-MM-DD') AS vote_date,
        attendance,
        min_players,
        COALESCE(guests, 0) AS guests,
        created_at,
        updated_at
      FROM votes
      WHERE vote_date = ${date}::date
      ORDER BY created_at ASC
    `;
    return rows.map((r) => normalizeVote(r as Record<string, unknown>));
  });
}

// Get comments for a specific date
export async function getCommentsForDate(date: string): Promise<Comment[]> {
  return withSchemaFallback(async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT
        id,
        user_name,
        TO_CHAR(vote_date, 'YYYY-MM-DD') AS vote_date,
        comment,
        created_at
      FROM comments
      WHERE vote_date = ${date}::date
      ORDER BY created_at ASC
    `;
    return rows.map((r) => normalizeComment(r as Record<string, unknown>));
  });
}

// Combined single-call fetch for a date (2 parallel queries, JS summary)
export async function getDayData(date: string): Promise<DayData> {
  const [votes, comments] = await Promise.all([
    getVotesForDate(date),
    getCommentsForDate(date),
  ]);
  return {
    date,
    votes,
    summary: buildVoteSummary(votes),
    comments,
  };
}

// Kept for compatibility
export async function getVoteSummary(date: string): Promise<VoteSummary> {
  const votes = await getVotesForDate(date);
  return buildVoteSummary(votes);
}

// Upsert a vote (insert or update if user already voted for this date)
export async function upsertVote(
  userName: string,
  voteDate: string,
  attendance: 'yes' | 'no',
  minPlayers: 'any' | '6' | '8',
  guests: number = 0
): Promise<Vote> {
  const safeGuests = attendance === 'no' ? 0 : Math.min(10, Math.max(0, Math.trunc(guests)));
  return withSchemaFallback(async () => {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO votes (user_name, vote_date, attendance, min_players, guests, updated_at)
      VALUES (${userName}, ${voteDate}::date, ${attendance}, ${minPlayers}, ${safeGuests}, CURRENT_TIMESTAMP)
      ON CONFLICT (user_name, vote_date)
      DO UPDATE SET
        attendance = EXCLUDED.attendance,
        min_players = EXCLUDED.min_players,
        guests = EXCLUDED.guests,
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        id,
        user_name,
        TO_CHAR(vote_date, 'YYYY-MM-DD') AS vote_date,
        attendance,
        min_players,
        COALESCE(guests, 0) AS guests,
        created_at,
        updated_at
    `;
    return normalizeVote(rows[0] as Record<string, unknown>);
  });
}

// Add a comment
export async function addComment(
  userName: string,
  voteDate: string,
  comment: string
): Promise<Comment> {
  return withSchemaFallback(async () => {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO comments (user_name, vote_date, comment)
      VALUES (${userName}, ${voteDate}::date, ${comment})
      RETURNING
        id,
        user_name,
        TO_CHAR(vote_date, 'YYYY-MM-DD') AS vote_date,
        comment,
        created_at
    `;
    return normalizeComment(rows[0] as Record<string, unknown>);
  });
}

// Admin: get votes in an optional date range
export async function getVotesInRange(from?: string, to?: string): Promise<Vote[]> {
  return withSchemaFallback(async () => {
    const sql = getSql();
    let rows: Record<string, unknown>[];

    if (from && to) {
      rows = (await sql`
        SELECT
          id,
          user_name,
          TO_CHAR(vote_date, 'YYYY-MM-DD') AS vote_date,
          attendance,
          min_players,
          COALESCE(guests, 0) AS guests,
          created_at,
          updated_at
        FROM votes
        WHERE vote_date >= ${from}::date AND vote_date <= ${to}::date
        ORDER BY vote_date DESC, created_at ASC
      `) as Record<string, unknown>[];
    } else if (from) {
      rows = (await sql`
        SELECT
          id,
          user_name,
          TO_CHAR(vote_date, 'YYYY-MM-DD') AS vote_date,
          attendance,
          min_players,
          COALESCE(guests, 0) AS guests,
          created_at,
          updated_at
        FROM votes
        WHERE vote_date >= ${from}::date
        ORDER BY vote_date DESC, created_at ASC
      `) as Record<string, unknown>[];
    } else if (to) {
      rows = (await sql`
        SELECT
          id,
          user_name,
          TO_CHAR(vote_date, 'YYYY-MM-DD') AS vote_date,
          attendance,
          min_players,
          COALESCE(guests, 0) AS guests,
          created_at,
          updated_at
        FROM votes
        WHERE vote_date <= ${to}::date
        ORDER BY vote_date DESC, created_at ASC
      `) as Record<string, unknown>[];
    } else {
      rows = (await sql`
        SELECT
          id,
          user_name,
          TO_CHAR(vote_date, 'YYYY-MM-DD') AS vote_date,
          attendance,
          min_players,
          COALESCE(guests, 0) AS guests,
          created_at,
          updated_at
        FROM votes
        ORDER BY vote_date DESC, created_at ASC
      `) as Record<string, unknown>[];
    }

    return rows.map(normalizeVote);
  });
}

// Admin: get comment counts grouped by date in an optional date range
export async function getCommentCountsByDate(
  from?: string,
  to?: string
): Promise<Map<string, number>> {
  return withSchemaFallback(async () => {
    const sql = getSql();
    let rows: Record<string, unknown>[];

    if (from && to) {
      rows = (await sql`
        SELECT TO_CHAR(vote_date, 'YYYY-MM-DD') AS vote_date, COUNT(*)::int AS cnt
        FROM comments
        WHERE vote_date >= ${from}::date AND vote_date <= ${to}::date
        GROUP BY vote_date
      `) as Record<string, unknown>[];
    } else if (from) {
      rows = (await sql`
        SELECT TO_CHAR(vote_date, 'YYYY-MM-DD') AS vote_date, COUNT(*)::int AS cnt
        FROM comments
        WHERE vote_date >= ${from}::date
        GROUP BY vote_date
      `) as Record<string, unknown>[];
    } else if (to) {
      rows = (await sql`
        SELECT TO_CHAR(vote_date, 'YYYY-MM-DD') AS vote_date, COUNT(*)::int AS cnt
        FROM comments
        WHERE vote_date <= ${to}::date
        GROUP BY vote_date
      `) as Record<string, unknown>[];
    } else {
      rows = (await sql`
        SELECT TO_CHAR(vote_date, 'YYYY-MM-DD') AS vote_date, COUNT(*)::int AS cnt
        FROM comments
        GROUP BY vote_date
      `) as Record<string, unknown>[];
    }

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(String(row.vote_date), Number(row.cnt) || 0);
    }
    return map;
  });
}

// Admin: compute full Wednesday overview + per-player stats for a date range
export async function getAdminReportData(from?: string, to?: string): Promise<{
  wednesdays: WednesdayOverviewRow[];
  players: PlayerAttendanceStats[];
  votes: Vote[];
}> {
  const [votes, commentCounts] = await Promise.all([
    getVotesInRange(from, to),
    getCommentCountsByDate(from, to),
  ]);

  const votesByDate = new Map<string, Vote[]>();
  const allDates = new Set<string>(commentCounts.keys());

  for (const vote of votes) {
    allDates.add(vote.vote_date);
    const list = votesByDate.get(vote.vote_date);
    if (list) {
      list.push(vote);
    } else {
      votesByDate.set(vote.vote_date, [vote]);
    }
  }

  const wednesdays: WednesdayOverviewRow[] = [...allDates]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)) // newest first
    .map((date) => {
      const dayVotes = votesByDate.get(date) || [];
      const summary = buildVoteSummary(dayVotes);
      const attendees = summary.yes.usersWithMinPlayers.map((u) =>
        u.guests > 0 ? `${u.name} (+${u.guests})` : u.name
      );
      return {
        vote_date: date,
        yes_voters: summary.yes.count,
        yes_guests: summary.yes.guestsCount,
        total_players: summary.yes.totalPlayers,
        no_voters: summary.no.count,
        comments_count: commentCounts.get(date) || 0,
        enough_players: calculateEnoughPlayers(summary),
        attendees,
      };
    });

  // Aggregate per-player stats
  const playerMap = new Map<
    string,
    {
      user_name: string;
      yes_count: number;
      no_count: number;
      guests_brought: number;
      last_attended: string | null;
    }
  >();

  for (const vote of votes) {
    if (vote.attendance !== 'yes' && vote.attendance !== 'no') continue;
    const key = vote.user_name.trim().toLowerCase();
    let entry = playerMap.get(key);
    if (!entry) {
      entry = {
        user_name: vote.user_name.trim(),
        yes_count: 0,
        no_count: 0,
        guests_brought: 0,
        last_attended: null,
      };
      playerMap.set(key, entry);
    }
    if (vote.attendance === 'yes') {
      entry.yes_count += 1;
      entry.guests_brought += vote.guests || 0;
      if (!entry.last_attended || vote.vote_date > entry.last_attended) {
        entry.last_attended = vote.vote_date;
      }
    } else {
      entry.no_count += 1;
    }
  }

  const players: PlayerAttendanceStats[] = [...playerMap.values()]
    .map((p) => {
      const totalVotes = p.yes_count + p.no_count;
      return {
        ...p,
        total_spots: p.yes_count + p.guests_brought,
        attendance_rate: totalVotes > 0 ? Math.round((p.yes_count / totalVotes) * 100) : 0,
      };
    })
    .sort(
      (a, b) =>
        b.yes_count - a.yes_count ||
        b.total_spots - a.total_spots ||
        a.user_name.localeCompare(b.user_name, 'cs')
    );

  return { wednesdays, players, votes };
}

export async function getDateBounds(): Promise<{
  earliest: string | null;
  latest: string | null;
}> {
  return withSchemaFallback(async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT
        TO_CHAR(MIN(vote_date), 'YYYY-MM-DD') AS earliest,
        TO_CHAR(MAX(vote_date), 'YYYY-MM-DD') AS latest
      FROM votes
    `;
    const row = rows[0] as { earliest: string | null; latest: string | null } | undefined;
    return {
      earliest: row?.earliest ?? null,
      latest: row?.latest ?? null,
    };
  });
}
