// 백업 파일: 공부 자료·단어를 JSON 파일로 내려받고, 다시 넣을 때는 지금 자료와 합친다 (사진은 빠짐)
import { mergeStudy, mergeWords } from './merge';
import type { StudyData, WordsData } from './model';
import { getStudy, getWords, normalize, replaceStudy, replaceWords, setSettings } from './store';
import { sanitizeWords } from './sanitize';
import { notifyChange } from '../../lib/dataSync';

interface BackupFile {
  app: 'life-study';
  version: 1;
  exportedAt: string;
  study: StudyData;
  words: WordsData;
}

export function exportBackup() {
  const data: BackupFile = { app: 'life-study', version: 1, exportedAt: new Date().toISOString(), study: getStudy(), words: getWords() };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `내공부-백업-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  setSettings({ lastBackup: new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10) });
}

/** 백업을 알려 줄 날: 마지막 백업 30일 뒤 (한 번도 안 했으면 오늘). 그 전이면 null */
export function backupDue(lastBackup: string | undefined, today: string): string | null {
  if (!lastBackup) return today;
  const due = new Date(Date.parse(`${lastBackup}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  return due <= today ? today : due;
}

/** 백업 파일 읽기 → 합치기. 잘못된 파일이면 오류 */
export async function importBackup(file: File): Promise<{ words: number }> {
  if (file.size > 20_000_000) throw new Error('파일이 너무 커요.');
  let data: Partial<BackupFile>;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('백업 파일을 읽지 못했어요.');
  }
  if (data.app !== 'life-study' || data.version !== 1 || typeof data.study !== 'object' || typeof data.words !== 'object' || !data.study || !data.words) throw new Error('이 사이트의 백업 파일이 아니에요.');
  // 모양이 틀린 항목은 다듬거나 버린다 (sanitize.ts)
  const words = sanitizeWords(data.words);
  replaceStudy(mergeStudy(getStudy(), normalize(data.study)));
  replaceWords(mergeWords(getWords(), words));
  // 로그인했다면 계정에도 올린다
  notifyChange('study');
  notifyChange('words');
  return { words: Object.keys(words).length };
}
