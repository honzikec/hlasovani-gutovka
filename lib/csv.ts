import {
  DayData,
  PlayerAttendanceStats,
  Vote,
  WednesdayOverviewRow,
  calculateEnoughPlayers,
} from './types';

// UTF-8 BOM so Microsoft Excel detects UTF-8 and displays Czech diacritics properly
const UTF8_BOM = '\uFEFF';

function sanitizeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Ano' : 'Ne';

  let str = String(value);
  // Neutralize spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (/[",\r\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const lines = [
    headers.map(sanitizeCsvCell).join(','),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(',')),
  ];
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}

function formatMinPlayersCs(min: string): string {
  if (min === '6') return 'Min. 6 hráčů';
  if (min === '8') return 'Min. 8 hráčů';
  return 'Bez minima';
}

function formatTimestampCs(iso: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateSingleDayCsv(dayData: DayData): string {
  const headers = [
    'Datum',
    'Jméno',
    'Účast',
    'Hosté',
    'Celkem míst',
    'Minimum hráčů',
    'Hlasováno',
    'Upraveno',
  ];

  const sortedVotes = [...dayData.votes].sort((a, b) => {
    if (a.attendance !== b.attendance) return a.attendance === 'yes' ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });

  const rows: Array<Array<string | number | boolean>> = sortedVotes.map((v) => [
    v.vote_date,
    v.user_name,
    v.attendance === 'yes' ? 'Přijde' : 'Nepřijde',
    v.attendance === 'yes' ? v.guests : 0,
    v.attendance === 'yes' ? 1 + v.guests : 0,
    v.attendance === 'yes' ? formatMinPlayersCs(v.min_players) : '',
    formatTimestampCs(v.created_at),
    formatTimestampCs(v.updated_at),
  ]);

  const enough = calculateEnoughPlayers(dayData.summary);
  rows.push([]);
  rows.push([
    dayData.date,
    'CELKEM (Přijdou)',
    enough ? 'Dostatek hráčů' : 'Málo hráčů',
    dayData.summary.yes.guestsCount,
    dayData.summary.yes.totalPlayers,
    `Hlasujících Ano: ${dayData.summary.yes.count}, Ne: ${dayData.summary.no.count}`,
    '',
    '',
  ]);

  return toCsv(headers, rows);
}

export function generateRangeSummaryCsv(wednesdays: WednesdayOverviewRow[]): string {
  const headers = [
    'Datum',
    'Hlasujících Ano',
    'Hostů',
    'Celkem hráčů',
    'Hlasujících Ne',
    'Dostatek hráčů',
    'Komentářů',
    'Účastníci',
  ];

  const rows = wednesdays.map((w) => [
    w.vote_date,
    w.yes_voters,
    w.yes_guests,
    w.total_players,
    w.no_voters,
    w.enough_players ? 'Ano' : 'Ne',
    w.comments_count,
    w.attendees.join('; '),
  ]);

  return toCsv(headers, rows);
}

export function generatePlayerStatsCsv(players: PlayerAttendanceStats[]): string {
  const headers = [
    'Jméno',
    'Účastí (Ano)',
    'Nepřítomností (Ne)',
    'Přivedených hostů',
    'Celkem míst (hráč + hosté)',
    'Míra účasti (%)',
    'Poslední účast',
  ];

  const rows = players.map((p) => [
    p.user_name,
    p.yes_count,
    p.no_count,
    p.guests_brought,
    p.total_spots,
    p.attendance_rate,
    p.last_attended ?? '',
  ]);

  return toCsv(headers, rows);
}

export function generateRangeDetailCsv(votes: Vote[]): string {
  const headers = [
    'Datum',
    'Jméno',
    'Účast',
    'Hosté',
    'Celkem míst',
    'Minimum hráčů',
    'Hlasováno',
    'Upraveno',
  ];

  const rows = votes.map((v) => [
    v.vote_date,
    v.user_name,
    v.attendance === 'yes' ? 'Přijde' : 'Nepřijde',
    v.attendance === 'yes' ? v.guests : 0,
    v.attendance === 'yes' ? 1 + v.guests : 0,
    v.attendance === 'yes' ? formatMinPlayersCs(v.min_players) : '',
    formatTimestampCs(v.created_at),
    formatTimestampCs(v.updated_at),
  ]);

  return toCsv(headers, rows);
}
