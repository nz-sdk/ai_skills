#!/usr/bin/env node
// 설치 키트 검사 — CI 의 check-kit 잡이 돌린다. 의존성 없음(Node 18+), 로컬에서도 같은 명령으로 돈다.
//
// 사용:
//   node .github/scripts/check-kit.mjs copies   # 운영본 ↔ 키트 사본 일치
//   node .github/scripts/check-kit.mjs verify   # verify-install.mjs (운영 값으로 렌더한 규칙과 맞물림)
//
// copies — 이 저장소의 값(대조표 + 아래 KIT)으로 키트를 임시 폴더에 설치하고, 운영본과 한 줄씩 비교한다.
//   운영본에 없는 파일(screen_blocked.yml 처럼 이 저장소가 쓰지 않는 것)은 건너뛴다.
//   대조표(github-jira-map.yml)는 값에서 새로 만들어지는 파일이라 비교하지 않는다.
// verify — 같은 값으로 Jira 규칙을 렌더하고(render-rules.mjs) verify-install.mjs --target . 로 맞물림을 본다.
//
// KIT 는 대조표에 없는 이 저장소의 설치 값이다 — 비밀값이 아니다(규칙 접두사 · Jira id · 작성자 ID).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = {
  PREFIX: '[AX_AI]',
  PRODUCT_NAME: 'AI스킬',
  AUTHOR: 'yangyang12103@newzen.kr',
  PROJECT_ID: '10403',                                    // TEST1
  ISSUE_TYPE_ID: { Bug: '10463', Feature: '10462', Task: '10460' },
  OWNER: 'jiraOnly:관리자',                                // 규칙 소유자 · 실행자 — 대조표 사람 키
};

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(ROOT);
const require = createRequire(process.env.YAML_DIR ? path.resolve(process.env.YAML_DIR, 'x.js') : import.meta.url);
const YAML = require('yaml');
const KITDIR = 'issue-sync-install/files';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-kit-'));
const node = (...a) => spawnSync(process.execPath, a, { encoding: 'utf8' });

// ── 값: 대조표 + KIT ─────────────────────────────────────────
const map = YAML.parse(fs.readFileSync('.github/github-jira-map.yml', 'utf8'));
const [SPACE, sp] = Object.entries(map.spaces)[0];
const repo = (execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).match(/[:/]([^/:]+\/[^/]+?)(\.git)?\s*$/) || [])[1];
const owner = KIT.OWNER.startsWith('jiraOnly:') ? map.jiraOnly[KIT.OWNER.slice(9)] : map.people[KIT.OWNER];
const install = {
  SPACE, PREFIX: KIT.PREFIX, REPO: repo, PRODUCT_NAME: KIT.PRODUCT_NAME, AUTHOR: KIT.AUTHOR,
  CLOUD_ID: map.jira.cloudId, SITE: map.jira.site,
  ISSUE_TYPES: sp.issueTypes, DEFAULT_TYPE: sp.default, START_DATE_FIELD: sp.startDateField || '',
  STATUSES: sp.statuses, TRANSITION_DONE: sp.closeStatus, TRANSITION_REOPEN: sp.reopenStatus,
  PEOPLE: Object.entries(map.people).map(([github, p]) => ({ github, accountId: p.jiraAccountId, roles: p.roles })),
  JIRA_ONLY: Object.entries(map.jiraOnly || {}).map(([name, p]) => ({ name, accountId: p.jiraAccountId, roles: p.roles })),
  AREAS: Object.entries(map.areas).map(([name, a]) => ({ name, screens: a.screens || [], designers: a.designers || [], developers: a.developers || [] })),
  SCREEN_SCAN_EXCLUDE: map.screenScanExclude || [],
};
const render = {
  PREFIX: KIT.PREFIX, SPACE, PROJECT_ID: KIT.PROJECT_ID, CLOUD_ID: map.jira.cloudId, SITE: map.jira.site, REPO: repo,
  ISSUE_TYPE_ID_BUG: KIT.ISSUE_TYPE_ID.Bug, ISSUE_TYPE_ID_FEATURE: KIT.ISSUE_TYPE_ID.Feature, ISSUE_TYPE_ID_TASK: KIT.ISSUE_TYPE_ID.Task,
  JIRA_TYPE_BUG: sp.issueTypes.Bug, JIRA_TYPE_FEATURE: sp.issueTypes.Feature, START_DATE_FIELD: sp.startDateField || '',
  TRANSITION_DONE: sp.closeStatus, TRANSITION_REOPEN: sp.reopenStatus,
  OWNER_ACCOUNT_ID: owner.jiraAccountId, ACTOR_ACCOUNT_ID: owner.jiraAccountId, SLACK_WEBHOOK_URL: '',
};
const write = (name, v) => { const f = path.join(tmp, name); fs.writeFileSync(f, JSON.stringify(v, null, 2)); return f; };
const gh = !!process.env.GITHUB_ACTIONS;
const report = (file, msg) => console.log(gh ? `::error file=${file}::${msg.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}` : `✗ ${file} — ${msg}`);

const mode = process.argv[2];
if (mode === 'copies') {
  const out = path.join(tmp, 'install');
  fs.mkdirSync(out);
  const r = node(`${KITDIR}/tools/install-files.mjs`, '--values', write('install.json', install), '--target', out);
  if (r.status) { console.log(r.stdout, r.stderr); process.exit(r.status); }
  let n = 0, bad = 0;
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(out)) {
    const rel = path.relative(out, f).split(path.sep).join('/');
    if (rel === '.github/github-jira-map.yml' || !fs.existsSync(rel)) continue;
    n++;
    const d = spawnSync('diff', ['-u', '--label', `${rel} (키트로 설치)`, '--label', `${rel} (운영본)`, f, rel], { encoding: 'utf8' });
    if (d.status) {
      bad++;
      const lines = d.stdout.split('\n').filter(l => /^[+-][^+-]/.test(l)).length;
      report(rel, `키트 사본(${KITDIR})으로 설치한 결과와 ${lines}줄 다르다 — 운영본과 키트 사본을 함께 고친다`);
      console.log(d.stdout.split('\n').slice(0, 40).join('\n'));
    }
  }
  console.log(`${bad ? '✗' : '✓'} 운영본 ↔ 키트 사본 ${n}개 비교 — 다른 파일 ${bad}개`);
  process.exit(bad ? 1 : 0);
} else if (mode === 'verify') {
  // 이 저장소의 동기화가 v2(scripts/issue-sync)면 v1 키트의 맞물림 검사(웹후크 Secret · 규칙 입력 · kind)는 해당이 없다.
  // 키트를 v2 로 바꾸면 이 갈래를 없앤다.
  if (/scripts\/issue-sync/.test(fs.readFileSync('.github/workflows/issue-sync.yml', 'utf8'))) {
    console.log(`${gh ? '::notice::' : 'ℹ '}동기화가 v2 라 v1 키트 맞물림 검사(verify-install)를 건너뛴다`);
    process.exit(0);
  }
  const rules = path.join(tmp, 'rules');
  const r = node(`${KITDIR}/jira-rules/render-rules.mjs`, '--values', write('render.json', render), '--out', rules);
  if (r.status) { console.log(r.stdout, r.stderr); process.exit(r.status); }
  const v = node(`${KITDIR}/tools/verify-install.mjs`, '--target', '.', '--rules-out', rules, '--repo', repo);
  process.stdout.write(v.stdout); process.stderr.write(v.stderr);
  process.exit(v.status ?? 1);
} else {
  console.error('사용: node .github/scripts/check-kit.mjs copies|verify');
  process.exit(2);
}
