import { describe, expect, it } from 'vitest';
import { parseHlBox, sameTeam } from './highlightly';

describe('Highlightly (문서 모양)', () => {
  it('박스스코어: [홈, 원정] · 통계 이름/값', () => {
    const j = [
      {
        name: 'Lakers',
        boxScores: [
          {
            player: { id: 7, name: 'LeBron James', jersey: 23 },
            statistics: [
              { name: 'Total Minutes Played', value: 35 },
              { name: 'Total Points Scored', value: 28 },
              { name: 'Successful Field Goals (FGM)', value: 11 },
              { name: 'Total Field Goals (FGA)', value: 20 },
              { name: 'Successful 3PT Field Goals (3PM)', value: 2 },
              { name: 'Total 3PT Field Goals (3PA)', value: 6 },
              { name: 'Total Rebounds (REB)', value: 9 },
              { name: 'Total Assists (AST)', value: 11 },
              { name: 'Total Fouls (PF)', value: 2 },
            ],
          },
        ],
      },
      { name: 'Celtics', boxScores: [] },
    ];
    const l = parseHlBox(j, (n) => (n === 'Lakers' ? 'LAL' : 'BOS'));
    expect(l[0]).toMatchObject({ playerId: 7, name: 'LeBron James', team: 'LAL', min: '35', pts: 28, fgm: 11, fga: 20, fg3m: 2, fg3a: 6, reb: 9, ast: 11, pf: 2 });
  });
  it('팀 맞추기: 약자 · 이름 · 전체 이름', () => {
    expect(sameTeam({ abbreviation: 'LAL' }, 'LAL', 'Lakers')).toBe(true);
    expect(sameTeam({ name: 'Lakers' }, 'X', 'Lakers')).toBe(true);
    expect(sameTeam({ displayName: 'Los Angeles Lakers' }, 'X', 'Lakers')).toBe(true);
    expect(sameTeam({ displayName: 'Boston Celtics' }, 'LAL', 'Lakers')).toBe(false);
  });
});
