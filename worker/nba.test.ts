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

describe('NBA 순위 · 선수 기록', () => {
  it('끝난 경기로 승패 세기', async () => {
    const { standingsFrom } = await import('./nba');
    const t = (abbr: string) => ({ abbr, name: abbr, city: '', conf: 'East' });
    const rows = standingsFrom([
      { id: 1, date: '', home: t('BOS'), away: t('NYK'), homeScore: 100, awayScore: 90, status: 'Final', period: 4, time: '' },
      { id: 2, date: '', home: t('NYK'), away: t('BOS'), homeScore: 0, awayScore: 0, status: '2026-11-01T00:00:00Z', period: 0, time: '' },
    ]);
    expect(rows.find((r) => r.abbr === 'BOS')).toMatchObject({ w: 1, l: 0 });
    expect(rows.find((r) => r.abbr === 'NYK')).toMatchObject({ w: 0, l: 1 });
  });
  it('선수 기록 · 시즌 평균 읽기', async () => {
    const { parseLines, parseAverage } = await import('./nba');
    expect(parseLines({ data: [{ player: { id: 5, first_name: 'Jayson', last_name: 'Tatum', position: 'F' }, team: { abbreviation: 'BOS' }, min: '36', pts: 30, reb: 8, ast: 5, fgm: 11, fga: 22, turnover: 2 }] })[0]).toMatchObject({ playerId: 5, name: 'Jayson Tatum', team: 'BOS', pts: 30, tov: 2 });
    expect(parseAverage({ data: [{ games_played: 10, pts: 27.5, fg_pct: 0.471 }] })).toMatchObject({ gp: 10, pts: 27.5, fgPct: 0.471 });
    expect(parseAverage({ data: [] })).toBeNull();
  });
});
