#!/usr/bin/env node
// 새 상품 저장소에 GitHub 쪽 파일을 넣는다 — 복사 + 값 치환 + 대조표 생성. 결정적이다(추측 없음).
// 의존성 없음(Node 18+). Jira 규칙은 jira-rules/render-rules.mjs 가 따로 한다.
//
// 사용:
//   node install-files.mjs --values install-values.json --target <상품 저장소 폴더> [--dry] [--force]
//   node install-files.mjs --selftest
//
// 하는 일: files/github · files/claude 의 파일을 상품 저장소에 복사하며 기준 상품의 글자를 값 파일의 값으로 바꾼다.
//   .github/workflows/issue-sync.yml · .github/ISSUE_TEMPLATE/*.yml · .github/scripts/issue-body.mjs
//   .github/github-jira-map.yml(값 파일로 새로 만든다) · .github/github-jira-map.schema.json
//   .claude/skills/report-issue/SKILL.md · .claude/commands/<PRODUCT_NAME>/이슈등록.md
// 하지 않는 일: ci.yml 수정(상품마다 다르다 — 단계 원문만 알려 준다) · 커밋 · push · 비밀값 다루기.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // …/files/tools
const FILES = path.resolve(HERE, '..');                    // …/files (복사 원본: github/ · claude/)
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const has = n => args.includes('--' + n);
const fail = m => { console.error('✗ ' + m); process.exit(1); };

// files/ 안의 파일에 남아 있는 「기준 상품」 글자 — 이것을 값 파일의 값으로 바꾼다
const BASE = { SPACE: 'EXP', SECRET_PREFIX: 'JIRA_EXP_', PREFIX: '[BG]', REPO: 'nz-sdk/bridge-web', REPO_NAME: 'bridge-web', ALIAS: '브릿지' };

const ID = /^([0-9a-f]{24}|\d+:[0-9a-f-]{36})$/;
function loadValues(file) {
  let v; try { v = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail('값 파일을 읽지 못했다: ' + e.message); }
  const errs = [];
  const need = (k, re, help) => { const x = v[k] == null ? '' : String(v[k]); if (!x || !re.test(x)) errs.push(`${k}: ${x ? '형식이 맞지 않는다 (' + JSON.stringify(x) + ')' : '비어 있다'} — ${help}`); };
  need('SPACE', /^[A-Z][A-Z0-9]+$/, 'Jira 스페이스 키');
  need('PREFIX', /^\S.{0,19}$/, '규칙 이름 접두사(Jira 규칙 값 파일과 같게)');
  need('REPO', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'GitHub 소유자/이름');
  need('PRODUCT_NAME', /^[^\s/\\:]+$/, '스킬 별칭 폴더 이름(공백·슬래시 없음)');
  need('CLOUD_ID', /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/, 'Jira cloudId');
  need('SITE', /^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Jira 사이트(https:// 없이)');
  const T = v.ISSUE_TYPES || {};
  for (const k of ['Bug', 'Task', 'Feature']) if (!T[k] || typeof T[k] !== 'string') errs.push(`ISSUE_TYPES.${k}: 비어 있다 — 그 스페이스의 업무 유형 이름`);
  if (!v.DEFAULT_TYPE) errs.push('DEFAULT_TYPE: 비어 있다');
  if (v.START_DATE_FIELD && !/^customfield_\d+$/.test(v.START_DATE_FIELD)) errs.push('START_DATE_FIELD: customfield_숫자 또는 빈 글자');
  if (!Array.isArray(v.PEOPLE) || v.PEOPLE.length < 1) errs.push('PEOPLE: 1명 이상 필요하다(담당·역할 선택지가 이 목록에서 나온다)');
  for (const p of v.PEOPLE || []) { if (!p.github || !ID.test(p.accountId || '') || !Array.isArray(p.roles) || !p.roles.length) errs.push(`PEOPLE: github · accountId(형식) · roles 가 모두 필요하다 → ${JSON.stringify(p.github || '?')}`); }
  for (const p of v.JIRA_ONLY || []) { if (!p.name || /[@()]/.test(p.name) || !ID.test(p.accountId || '') || !Array.isArray(p.roles) || !p.roles.length) errs.push(`JIRA_ONLY: name(이메일·괄호 금지) · accountId · roles 필요 → ${JSON.stringify(p.name || '?')}`); }
  if (!Array.isArray(v.AREAS) || v.AREAS.length < 1) errs.push('AREAS: 영역 1개 이상 필요하다');
  const names = new Set([...(v.PEOPLE || []).map(p => p.github), ...(v.JIRA_ONLY || []).map(p => p.name)]);
  for (const a of v.AREAS || []) {
    if (!/^[a-z0-9-]+$/.test(a.name || '')) errs.push(`AREAS.name: 소문자·숫자·하이픈 → ${JSON.stringify(a.name)}`);
    for (const s of a.screens || []) if (!/^[a-z0-9-]+$/.test(s)) errs.push(`AREAS.screens: 소문자·숫자·하이픈 → ${JSON.stringify(s)}`);
    for (const c of [...(a.designers || []), ...(a.developers || [])]) if (!names.has(c)) errs.push(`AREAS: 후보 ${JSON.stringify(c)} 가 PEOPLE · JIRA_ONLY 에 없다`);
  }
  if (v.AUTHOR != null && (typeof v.AUTHOR !== 'string' || /[\r\n"]/.test(v.AUTHOR))) errs.push('AUTHOR: 한 줄 글자(따옴표 없음) 또는 빈 글자 — 스킬 머리말 작성자 ID');
  const known = new Set(['SPACE', 'PREFIX', 'REPO', 'PRODUCT_NAME', 'CLOUD_ID', 'SITE', 'ISSUE_TYPES', 'DEFAULT_TYPE', 'START_DATE_FIELD', 'PEOPLE', 'JIRA_ONLY', 'AREAS', 'SCREEN_SCAN_EXCLUDE', 'AUTHOR']);
  for (const k of Object.keys(v)) if (!known.has(k) && !k.startsWith('_')) errs.push(`${k}: 모르는 이름이다(오타 확인)`);
  if (errs.length) fail('값 파일 오류:\n  - ' + errs.join('\n  - '));
  return v;
}

const q = s => JSON.stringify(String(s));
function mapYaml(v) {
  const list = a => (a && a.length ? '[' + a.join(', ') + ']' : '[]');
  const L = [];
  L.push('# yaml-language-server: $schema=./github-jira-map.schema.json');
  L.push('# GitHub ↔ Jira 대조표 — report-issue 스킬과 연동 워크플로가 읽는다.');
  L.push('#');
  L.push('# - 이메일은 넣지 않는다(스키마가 막는다). people 의 이름은 jiraAccountId 로 Jira 에서 그때 조회해 보여 준다.');
  L.push('# - 이름은 jiraOnly 키에만 쓴다(Jira 표시 이름 · 한글 · 영문) — GitHub 에서는 「이름(Jira)」 로 보인다.');
  L.push('# - 고칠 때는 PR 로 — CI 가 github-jira-map.schema.json 으로 검사한다.');
  L.push('# - 입사: people(GitHub 계정 없으면 jiraOnly)에 한 줄 + 해당 areas 의 designers / developers 에 아이디. 퇴사: 그 줄과 아이디를 지운다.');
  L.push(`# - 이 상품의 Jira 스페이스는 ${v.SPACE} 다.`);
  L.push('');
  L.push('# Jira 사이트 — 스킬이 Atlassian MCP 를 부를 때 쓴다');
  L.push('jira:');
  L.push(`  cloudId: ${q(v.CLOUD_ID)}`);
  L.push(`  site: ${v.SITE}`);
  L.push('');
  L.push('# 화면 → 영역 판정에서 세지 않는 화면 폴더');
  L.push('screenScanExclude: ' + list(v.SCREEN_SCAN_EXCLUDE));
  L.push('');
  L.push('# GitHub 아이디 → Jira 계정 · 역할(여러 개 가능: designer · developer · planner · product-designer)');
  L.push('people:');
  for (const p of v.PEOPLE) { L.push(`  ${p.github}:`); L.push(`    jiraAccountId: ${q(p.accountId)}`); L.push(`    roles: ${list(p.roles)}`); }
  L.push('');
  L.push('# GitHub 계정이 없는 사람 — 키는 Jira 표시 이름(한글 · 영문, 이메일 · 괄호 금지). Jira 담당만 되고 GitHub Assignee 는 비운다');
  if (!v.JIRA_ONLY || !v.JIRA_ONLY.length) L.push('jiraOnly: {}');
  else { L.push('jiraOnly:'); for (const p of v.JIRA_ONLY) { L.push(`  ${p.name}:`); L.push(`    jiraAccountId: ${q(p.accountId)}`); L.push(`    roles: ${list(p.roles)}`); } }
  L.push('');
  L.push('# Jira 스페이스 — 키 → GitHub 이슈 유형(Type)별 Jira 업무 유형. 표에 없는 유형은 default');
  L.push('spaces:');
  L.push(`  ${v.SPACE}:`);
  L.push('    issueTypes:');
  for (const k of ['Bug', 'Task', 'Feature']) L.push(`      ${k}: ${v.ISSUE_TYPES[k]}`);
  L.push(`    default: ${v.DEFAULT_TYPE}`);
  if (v.START_DATE_FIELD) L.push(`    startDateField: ${v.START_DATE_FIELD}   # Jira 「시작 날짜」 — 등록 날짜를 넣는다`);
  L.push('');
  L.push('# 영역 — 화면 폴더(src/screens/<폴더>) 묶음 · 스페이스 · 담당자 후보(선택지 앞에 놓는 순서 — 기본값 아님)');
  L.push('areas:');
  for (const a of v.AREAS) {
    L.push(`  ${a.name}:`); L.push(`    space: ${v.SPACE}`);
    if (a.screens && a.screens.length) { L.push('    screens:'); a.screens.forEach(s => L.push(`      - ${s}`)); } else L.push('    screens: []');
    for (const key of ['designers', 'developers']) { const arr = a[key] || []; if (arr.length) { L.push(`    ${key}:`); arr.forEach(s => L.push(`      - ${s}`)); } else L.push(`    ${key}: []`); }
  }
  return L.join('\n') + '\n';
}

function main() {
  const selftest = has('selftest');
  const valuesFile = selftest ? path.join(HERE, 'install-values.example.json') : opt('values');
  if (!valuesFile) fail('--values <값 파일> 이 필요하다(install-values.example.json 을 복사해 채운다)');
  const target = path.resolve(selftest ? fs.mkdtempSync(path.join(os.tmpdir(), 'install-files-')) : opt('target') || fail('--target <상품 저장소 폴더> 가 필요하다'));
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) fail('--target 폴더가 없다: ' + target);
  const v = loadValues(valuesFile);
  const repoName = v.REPO.split('/')[1];
  const dry = has('dry'), force = has('force');
  const rd = p => fs.readFileSync(path.join(FILES, p), 'utf8');

  const fill = t => t.split('<<REPO>>').join(v.REPO).split('<<REPO_NAME>>').join(repoName).split('<<PREFIX>>').join(v.PREFIX).split('<<PRODUCT_NAME>>').join(v.PRODUCT_NAME).split('<<SPACE>>').join(v.SPACE).split('<<AUTHOR>>').join(v.AUTHOR || '<담당자 ID>');
  const sub = (t, kind) => {
    if (kind === 'sync' || kind === 'form' || kind === 'skill' || kind === 'alias') return fill(t);
    return t;
  };
  const jobs = [
    ['github/workflows/issue-sync.yml', '.github/workflows/issue-sync.yml', 'sync'],
    ...['bug_report', 'task', 'feature_request', 'screen_blocked', 'config'].map(f => [`github/ISSUE_TEMPLATE/${f}.yml`, `.github/ISSUE_TEMPLATE/${f}.yml`, f === 'config' ? 'raw' : 'form']),
    ['github/scripts/issue-body.mjs', '.github/scripts/issue-body.mjs', 'raw'],
    ['github/github-jira-map.schema.json', '.github/github-jira-map.schema.json', 'raw'],
    ['claude/skills/report-issue/SKILL.md', '.claude/skills/report-issue/SKILL.md', 'skill'],
    ['claude/commands/이슈등록.md', `.claude/commands/${v.PRODUCT_NAME}/이슈등록.md`, 'alias'],
  ];
  const outputs = jobs.map(([src, dst, kind]) => [dst, sub(rd(src), kind)]);
  outputs.push(['.github/github-jira-map.yml', mapYaml(v)]);

  // 치환 누락 검사 — 기준 상품 글자가 남으면 쓰지 않는다
  const left = [];
  for (const [dst, text] of outputs) {
    if ((dst.includes('ISSUE_TEMPLATE') || dst.startsWith('.claude') || dst.startsWith('.github/workflows')) && /<<[A-Z_]+>>/.test(text)) left.push(dst + ': 채우지 못한 자리표시자');
    // 「[EXP-n]」은 번호표 모양을 설명하는 일반 예시(스킬 규칙 5)라 남는 것이 맞다
    const t = text.split(v.REPO).join('').split(v.PRODUCT_NAME).join('').split('EXP-n').join('');
    if (/JIRA_EXP_|\[BG\]/.test(t) && !(v.SPACE === 'EXP') && !(v.PREFIX === '[BG]')) left.push(dst + ': 기준 접두사/Secret');
    if (new RegExp('\\b' + 'EXP' + '\\b').test(t) && v.SPACE !== 'EXP') left.push(dst + ': 기준 스페이스 키');
    if (t.includes(BASE.REPO) || (t.includes(BASE.REPO_NAME) && !repoName.includes(BASE.REPO_NAME) && repoName !== BASE.REPO_NAME)) left.push(dst + ': 기준 저장소');
    if (t.includes(BASE.ALIAS) && !v.PRODUCT_NAME.includes(BASE.ALIAS)) left.push(dst + ': 기준 상품 이름');
  }
  if (left.length) fail('치환 후에도 기준 상품 글자가 남았다(쓰지 않았다):\n  - ' + left.join('\n  - '));

  const exist = outputs.filter(([d]) => fs.existsSync(path.join(target, d)));
  if (exist.length && !force && !dry) fail('이미 있는 파일이 있다(덮어쓰지 않았다). 확인 뒤 --force:\n  - ' + exist.map(e => e[0]).join('\n  - '));
  for (const [dst, text] of outputs) {
    const f = path.join(target, dst);
    if (!dry) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
    console.log(`${dry ? '(dry) ' : ''}${fs.existsSync(f) && !dry ? '쓴다' : '쓸 파일'}: ${dst}${exist.some(e => e[0] === dst) ? '  ⚠ 이미 있음' : ''}`);
  }
  console.log(`\n✓ ${selftest ? '(자체 시험) ' : ''}파일 ${outputs.length}개 ${dry ? '— 미리보기만(쓰지 않음)' : '작성'} → ${target}`);
  console.log('\n사람·Claude 가 이어서 할 일(이 스크립트는 하지 않는다):');
  console.log('  1) ci.yml 에 대조표 검사 단계 추가 — 원문: files/github/ci-check-map.snippet.yml (checkout · setup-node 뒤)');
  console.log('  2) 대조표 스키마 검사: npx --yes yaml@2.6.1 --json --single < .github/github-jira-map.yml > <임시>/map.json && npx --yes ajv-cli@5.0.0 validate --spec=draft7 -s .github/github-jira-map.schema.json -d <임시>/map.json');
  console.log('  3) 상품에 「화면 구현 멈춤」 흐름(적용 감사 · DS 요청 문서)이 없으면 screen_blocked.yml 삭제와 스킬 4절 정리 — adopt/01-바꿀-값.md 1-3 · 4절');
}
main();
