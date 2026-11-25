#!/usr/bin/env node
// 스킬 검사 — CI 의 check-skills 잡이 돌린다. 로컬에서도 같은 명령으로 돈다.
//
// 사용:
//   npm install --no-save --prefix <폴더> yaml@2.6.1
//   YAML_DIR=<폴더> node .github/scripts/check-skills.mjs              # 저장소 전체 검사
//   YAML_DIR=<폴더> BASE_SHA=<기준 커밋> node .github/scripts/check-skills.mjs   # + PR 검사
//
// 저장소 전체 검사
//   1. SKILL.md 머리말 — YAML · name(= 폴더 이름, Agent Skills 규격: 소문자 · 숫자 · 하이픈, 하이픈으로 시작 · 끝 · 연속 금지,
//      64자 이하) · description(1024자 이하)
//      · license · version(위 또는 metadata.version, x.y.z)
//   2. 번역본(SKILL.ko.md 등)에는 머리말이 없다 — 있으면 스킬이 두 번 등록된다
//   3. README 「스킬 목록」 표와 최상위 스킬 폴더가 서로 빠짐없이 같다
//   4. .md 안의 상대 링크(경로 모양)가 가리키는 파일 · 폴더가 있다(코드 블록 · 치환 자리 <<…>> 는 건너뛴다)
//   5. 문법 — .mjs · .js(node --check) · .json · .yml · .yaml
// PR 검사(BASE_SHA 가 있을 때)
//   6. 스킬 파일을 바꾼 PR 은 CHANGELOG.md 에 `**<스킬>:**` 줄을 더한다(NO_CHANGELOG=1 이면 건너뛴다)
//   7. SKILL.md 를 바꾸면 옆의 번역본(SKILL.*.md)도 함께 바꾼다
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(process.env.YAML_DIR ? path.resolve(process.env.YAML_DIR, 'x.js') : import.meta.url);
let YAML;
try { YAML = require('yaml'); } catch {
  console.error('✗ yaml 패키지가 없다 — npm install --no-save --prefix <폴더> yaml@2.6.1 뒤 YAML_DIR=<폴더> 로 돌린다');
  process.exit(2);
}

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(ROOT);
const git = (...a) => execFileSync('git', ['-c', 'core.quotepath=off', ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
const FILES = git('ls-files', '-z').split('\0').filter(Boolean);
const TRACKED = new Set(FILES);
const DIRS = new Set(FILES.flatMap(f => f.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))));

const errors = [];
const err = (file, msg, line) => errors.push({ file, msg, line });
const read = f => fs.readFileSync(f, 'utf8');

// ── 스킬 찾기 ───────────────────────────────────────────────
// 최상위 <스킬>/SKILL.md · .claude/skills/<스킬>/SKILL.md · 키트 사본(issue-sync-install/files/claude/skills/…)
const SKILL_FILES = FILES.filter(f => path.basename(f) === 'SKILL.md');
const TOP_SKILLS = SKILL_FILES.filter(f => f.split('/').length === 2).map(f => f.split('/')[0]);
// 파일이 속한 스킬 — PR 검사에서 CHANGELOG 줄을 찾을 이름
function skillOf(f) {
  const p = f.split('/');
  if (p.length >= 2 && TOP_SKILLS.includes(p[0])) return p[0];
  if (p[0] === '.claude' && p[1] === 'skills' && p.length >= 4) return p[2];
  return null;
}

// ── 1 · 2. 머리말 ────────────────────────────────────────────
const FM = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;
for (const f of SKILL_FILES) {
  const m = read(f).match(FM);
  if (!m) { err(f, '머리말(--- … ---)이 없다'); continue; }
  let fm;
  try { fm = YAML.parse(m[1]); } catch (e) { err(f, '머리말 YAML 오류: ' + e.message.split('\n')[0], 2); continue; }
  if (!fm || typeof fm !== 'object') { err(f, '머리말이 키: 값 모양이 아니다'); continue; }
  const dir = path.basename(path.dirname(f));
  if (typeof fm.name !== 'string' || !fm.name) err(f, 'name 이 없다');
  else {
    if (fm.name !== dir) err(f, `name(${fm.name}) 이 폴더 이름(${dir}) 과 다르다`);
    // Agent Skills 규격(agentskills.io · Claude API)은 밑줄을 받지 않는다. Claude Code 는 읽지만 업로드에서 거부된다
    if (fm.name.length > 64 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name))
      err(f, `name(${fm.name}) 은 소문자 · 숫자 · 하이픈(시작 · 끝 · 연속 금지)으로 64자 이하`);
  }
  if (typeof fm.description !== 'string' || !fm.description.trim()) err(f, 'description 이 없다');
  else if (fm.description.length > 1024) err(f, `description 이 ${fm.description.length}자다 — 1024자 이하`);
  if (!fm.license) err(f, 'license 가 없다');
  const ver = fm.version ?? fm.metadata?.version;
  if (ver == null) err(f, 'version 이 없다(위 또는 metadata.version)');
  else if (!/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(String(ver))) err(f, `version(${ver}) 이 x.y.z 모양이 아니다`);
}
for (const f of FILES.filter(f => /^SKILL\.[^/]+\.md$/.test(path.basename(f)))) {
  if (FM.test(read(f))) err(f, '번역본에 머리말이 있다 — 스킬이 두 번 등록된다. 머리말은 SKILL.md 에만 둔다', 1);
}

// ── 3. README 스킬 목록 ──────────────────────────────────────
{
  const lines = read('README.md').split('\n');
  const start = lines.findIndex(l => /^##\s+스킬 목록\s*$/.test(l));
  if (start < 0) err('README.md', '「## 스킬 목록」 절이 없다');
  else {
    const listed = new Map();
    for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
      const m = lines[i].match(/^\|\s*\[[^\]]+\]\(([^)#]+?)\/?\)/);
      if (m) listed.set(m[1].replace(/^\.\//, ''), i + 1);
    }
    for (const s of TOP_SKILLS) if (!listed.has(s)) err('README.md', `스킬 목록 표에 ${s} 가 없다`, start + 1);
    for (const [s, ln] of listed) if (!TOP_SKILLS.includes(s)) err('README.md', `스킬 목록 표의 ${s} 에 SKILL.md 가 없다`, ln);
  }
}

// ── 4. 상대 링크 ─────────────────────────────────────────────
for (const f of FILES.filter(f => f.endsWith('.md'))) {
  let fence = null;
  read(f).split('\n').forEach((raw, i) => {
    const fm = raw.match(/^\s*(`{3,}|~{3,})/);
    if (fm) { if (!fence) fence = fm[1][0]; else if (fm[1][0] === fence) fence = null; return; }
    if (fence) return;
    const line = raw.replace(/`[^`]*`/g, '');
    for (const m of line.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g)) {
      const href = m[1];
      if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href) || href.includes('<<') || href.includes('{')) continue;
      if (!/[./]/.test(href)) continue; // 「[키](링크)」 같은 글 속 표기 — 경로 모양(. 또는 /)만 본다
      let target;
      try { target = decodeURIComponent(href.split('#')[0].split('?')[0]); } catch { target = href.split('#')[0]; }
      if (!target) continue;
      const abs = path.posix.normalize(path.posix.join(path.posix.dirname(f), target)).replace(/\/$/, '');
      if (!TRACKED.has(abs) && !DIRS.has(abs)) err(f, `링크 대상이 없다: ${href}`, i + 1);
    }
  });
}

// ── 5. 문법 ──────────────────────────────────────────────────
for (const f of FILES) {
  const ext = path.extname(f);
  try {
    if (ext === '.mjs' || ext === '.js' || ext === '.cjs') execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    else if (ext === '.json') JSON.parse(read(f));
    else if (ext === '.yml' || ext === '.yaml') {
      for (const d of YAML.parseAllDocuments(read(f))) if (d.errors.length) throw d.errors[0];
    }
  } catch (e) {
    const msg = (e.stderr ? String(e.stderr).replaceAll(ROOT + '/', '') : e.message || String(e)).split('\n').filter(Boolean).slice(0, 3).join(' / ');
    err(f, '문법 오류: ' + msg, e.linePos?.[0]?.line);
  }
}

// ── 6 · 7. PR 검사 ───────────────────────────────────────────
const BASE = process.env.BASE_SHA;
if (BASE) {
  const changed = git('diff', '--name-only', '-z', `${BASE}...HEAD`).split('\0').filter(Boolean);
  const touched = [...new Set(changed.map(skillOf).filter(Boolean))];
  if (touched.length && process.env.NO_CHANGELOG !== '1') {
    const added = git('diff', '-U0', `${BASE}...HEAD`, '--', 'CHANGELOG.md').split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
    for (const s of touched) {
      if (!added.some(l => l.includes(`**${s}:**`))) {
        err('CHANGELOG.md', `${s} 를 바꿨는데 「Unreleased」에 \`**${s}:** …\` 줄을 더하지 않았다(필요 없는 PR 이면 no-changelog 라벨)`);
      }
    }
  }
  for (const f of changed.filter(f => path.basename(f) === 'SKILL.md' && TRACKED.has(f))) {
    const dir = path.dirname(f);
    for (const t of FILES.filter(x => path.dirname(x) === dir && /^SKILL\.[^/]+\.md$/.test(path.basename(x)))) {
      if (!changed.includes(t)) err(t, `${f} 를 바꿨는데 번역본 ${t} 는 그대로다`);
    }
  }
  console.log(`PR 검사: 바뀐 파일 ${changed.length}개, 바뀐 스킬 ${touched.length ? touched.join(' · ') : '없음'}`);
}

// ── 결과 ────────────────────────────────────────────────────
const gh = !!process.env.GITHUB_ACTIONS;
for (const e of errors) {
  if (gh) console.log(`::error file=${e.file}${e.line ? ',line=' + e.line : ''}::${e.msg.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
  else console.log(`✗ ${e.file}${e.line ? ':' + e.line : ''} — ${e.msg}`);
}
console.log(`${errors.length ? '✗' : '✓'} 스킬 ${SKILL_FILES.length}개 · 파일 ${FILES.length}개 검사 — 오류 ${errors.length}건`);
process.exit(errors.length ? 1 : 0);
