import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** 오프라인용 서비스 워커: 빌드가 끝나면 dist 의 사이트 파일 목록을 넣어 dist/sw.js 를 만든다 (scripts/sw-template.js) */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const root = join(import.meta.dirname, outDir);
      // 글자 인식·PDF 도구와 글꼴 조각은 쓸 때만 받는다 (크기가 커서 미리 받지 않음)
      const files = readdirSync(join(root, 'assets'))
        .filter((f) => !/^(pdf|tesseract)/.test(f) && !f.endsWith('.woff2'))
        .map((f) => `/assets/${f}`);
      files.push('/', '/icon.svg', '/manifest.webmanifest');
      const h = createHash('sha256');
      for (const f of files) h.update(f).update(readFileSync(join(root, f === '/' ? 'index.html' : f)));
      const src = readFileSync(join(import.meta.dirname, 'scripts', 'sw-template.js'), 'utf8')
        .replace('__VERSION__', h.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(files));
      writeFileSync(join(root, 'sw.js'), src);
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
});
