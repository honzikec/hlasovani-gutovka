import { sql } from '@vercel/postgres';

export interface Vote {
  id: number;
  user_name: string;
  vote_date: string; // YYYY-MM-DD format
  attendance: 'yes' | 'no' | 'maybe';
  min_players: 'any' | '6' | '8';
  guests: number; // Number of guests the player is bringing
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  user_name: string;
  vote_date: string; // YYYY-MM-DD format
  comment: string;
  created_at: string;
}

// Initialize database tables
export async function initializeDatabase() {
  try {
    // Create votes table
    await sql`
      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        user_name VARCHAR(100) NOT NULL,
        vote_date DATE NOT NULL,
        attendance VARCHAR(10) NOT NULL CHECK (attendance IN ('yes', 'no', 'maybe')),
        min_players VARCHAR(10) NOT NULL CHECK (min_players IN ('any', '6', '8')),
        guests INTEGER DEFAULT 0 CHECK (guests >= 0 AND guests <= 10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_name, vote_date)
      );
    `;

    // Add guests column if it doesn't exist (for existing databases)
    await sql`
      ALTER TABLE votes 
      ADD COLUMN IF NOT EXISTS guests INTEGER DEFAULT 0 CHECK (guests >= 0 AND guests <= 10);
    `;

    // Create comments table
    await sql`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        user_name VARCHAR(100) NOT NULL,
        vote_date DATE NOT NULL,
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create index for better query performance
    await sql`
      CREATE INDEX IF NOT EXISTS idx_votes_date ON votes(vote_date);
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_comments_date ON comments(vote_date);
    `;

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Get votes for a specific date
export async function getVotesForDate(date: string): Promise<Vote[]> {
  const result = await sql`
    SELECT * FROM votes 
    WHERE vote_date = ${date} 
    ORDER BY created_at ASC
  `;
  return result.rows as Vote[];
}

// Get comments for a specific date
export async function getCommentsForDate(date: string): Promise<Comment[]> {
  const result = await sql`
    SELECT * FROM comments 
    WHERE vote_date = ${date} 
    ORDER BY created_at ASC
  `;
  return result.rows as Comment[];
}

// Upsert a vote (insert or update if user already voted for this date)
export async function upsertVote(
  userName: string,
  voteDate: string,
  attendance: 'yes' | 'no' | 'maybe',
  minPlayers: 'any' | '6' | '8',
  guests: number = 0
): Promise<Vote> {
  const result = await sql`
    INSERT INTO votes (user_name, vote_date, attendance, min_players, guests, updated_at)
    VALUES (${userName}, ${voteDate}, ${attendance}, ${minPlayers}, ${guests}, CURRENT_TIMESTAMP)
    ON CONFLICT (user_name, vote_date)
    DO UPDATE SET 
      attendance = EXCLUDED.attendance,
      min_players = EXCLUDED.min_players,
      guests = EXCLUDED.guests,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  return result.rows[0] as Vote;
}

// Add a comment
export async function addComment(
  userName: string,
  voteDate: string,
  comment: string
): Promise<Comment> {
  const result = await sql`
    INSERT INTO comments (user_name, vote_date, comment)
    VALUES (${userName}, ${voteDate}, ${comment})
    RETURNING *
  `;
  return result.rows[0] as Comment;
}

// Get vote summary for a date (count by attendance type)
export async function getVoteSummary(date: string) {
  const result = await sql`
    SELECT 
      attendance,
      COUNT(*) as count,
      SUM(CASE WHEN attendance IN ('yes', 'maybe') THEN 1 + guests ELSE 0 END) as total_players,
      ARRAY_AGG(user_name ORDER BY created_at) as users,
      ARRAY_AGG(min_players ORDER BY created_at) as min_players_list,
      ARRAY_AGG(guests ORDER BY created_at) as guests_list
    FROM votes 
    WHERE vote_date = ${date}
    GROUP BY attendance
  `;
  
  const summary = {
    yes: { count: 0, totalPlayers: 0, users: [] as string[], usersWithMinPlayers: [] as Array<{name: string, minPlayers: string, guests: number}> },
    no: { count: 0, totalPlayers: 0, users: [] as string[], usersWithMinPlayers: [] as Array<{name: string, minPlayers: string, guests: number}> },
    maybe: { count: 0, totalPlayers: 0, users: [] as string[], usersWithMinPlayers: [] as Array<{name: string, minPlayers: string, guests: number}> }
  };
  
  result.rows.forEach((row) => {
    const typedRow = row as { 
      attendance: 'yes' | 'no' | 'maybe'; 
      count: string; 
      total_players: string;
      users: string[]; 
      min_players_list: string[];
      guests_list: number[];
    };
    
    const users = typedRow.users || [];
    const minPlayersList = typedRow.min_players_list || [];
    const guestsList = typedRow.guests_list || [];
    const usersWithMinPlayers = users.map((name, index) => ({
      name,
      minPlayers: minPlayersList[index] || 'any',
      guests: guestsList[index] || 0
    }));
    
    summary[typedRow.attendance] = {
      count: parseInt(typedRow.count),
      totalPlayers: parseInt(typedRow.total_players) || 0,
      users: users,
      usersWithMinPlayers: usersWithMinPlayers
    };
  });
  
  return summary;
} 