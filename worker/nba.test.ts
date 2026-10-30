import { describe, expect, it } from 'vitest';
import { parseGames } from './nba';

describe('NBA 경기', () => {
  it('경기 목록 읽기', () => {
    const g = parseGames({
      data: [
        { id: 1, date: '2026-10-29', status: 'Final', period: 4, time: 'Final', home_team_score: 110, visitor_team_score: 99, home_team: { abbreviation: 'LAL', name: 'Lakers', city: 'Los Angeles' }, visitor_team: { abbreviation: 'BOS', name: 'Celtics', city: 'Boston' } },
        { id: 2, date: '2026-10-30', status: '2026-10-30T23:30:00Z', period: 0, time: '', home_team_score: 0, visitor_team_score: 0, home_team: { abbreviation: 'GSW' }, visitor_team: { abbreviation: 'NYK' } },
      ],
    });
    expect(g[0]).toMatchObject({ home: { abbr: 'LAL', name: 'Lakers' }, away: { abbr: 'BOS' }, homeScore: 110, awayScore: 99, status: 'Final' });
    expect(g[1].start).toBe('2026-10-30T23:30:00Z');
  });
});
