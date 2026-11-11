#!/usr/bin/env node
// 설치 결과의 「맞물림」 검사 — 워크플로 · Jira 규칙 JSON · 이슈 양식 · 대조표 · 스킬이 서로 같은 값을 가리키는지 본다.
// 의존성 없음(Node 18+). 쓰기 · 네트워크 없음(--deep 만 npx 로 YAML · 스키마 검사를 돌린다).
//
// 사용:
//   node verify-install.mjs --target <상품 저장소 폴더> --rules-out <렌더 출력 폴더> [--repo 소유자/이름] [--deep]
//
// 검사 못 하는 것(오프라인): Jira 의 실제 유형 id · 전환 이름 · 필드 id 가 그 스페이스의 값인지 · PAT · Secret 값 ·
//   Jira 규칙을 가져온 뒤의 실제 상태. 이것은 설치 단계의 사람 확인과 점검 시험(adopt/03)으로 본다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const has = n => args.includes('--' + n);
const die = m => { console.error('✗ ' + m); process.exit(2); };
const target = path.resolve(opt('target') || die('--target <상품 저장소 폴더> 가 필요하다'));
const rulesOut = path.resolve(opt('rules-out') || die('--rules-out <렌더 출력 폴더> 가 필요하다'));
const repoArg = opt('repo');
if (!fs.existsSync(target)) die('--target 폴더가 없다: ' + target);
if (!fs.existsSync(rulesOut)) die('--rules-out 폴더가 없다: ' + rulesOut);

const read = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const T = rel => path.join(target, rel);
const results = [];
const add = (level, id, title, detail = '') => results.push({ level, id, title, detail });
const ok = (id, title, d) => add('ok', id, title, d);
const bad = (id, title, d) => add('fail', id, title, d);
const info = (id, title, d) => add('info', id, title, d);
const check = (cond, id, title, okDetail, badDetail) => (cond ? ok(id, title, okDetail) : bad(id, title, badDetail));
const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const uniq = a => [...new Set(a)];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ───────── 읽기
const need = ['.github/workflows/issue-sync.yml', '.github/github-jira-map.yml', '.github/github-jira-map.schema.json', '.github/scripts/issue-body.mjs',
  '.github/ISSUE_TEMPLATE/task.yml', '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/feature_request.yml', '.claude/skills/report-issue/SKILL.md'];
const missing = need.filter(f => !fs.existsSync(T(f)));
const cmdDir = T('.claude/commands');
const aliasFolders = fs.existsSync(cmdDir) ? fs.readdirSync(cmdDir).filter(d => fs.existsSync(path.join(cmdDir, d, '이슈등록.md'))) : [];
check(missing.length === 0 && aliasFolders.length === 1, 'F1', '필수 파일이 있다',
  `파일 ${need.length}개 + 별칭 명령 1개(${aliasFolders[0] || '-'})`,
  (missing.length ? '없음: ' + missing.join(', ') : '') + (aliasFolders.length !== 1 ? ` 별칭 명령 폴더가 ${aliasFolders.length}개(1개여야 한다)` : ''));
if (missing.length) { report(); process.exit(1); }
if (!fs.existsSync(T('.github/ISSUE_TEMPLATE/screen_blocked.yml'))) info('F1', '「화면 구현 멈춤」 양식이 없다', '상품에서 뺀 것이면 정상 — 스킬 4절의 해당 선택지도 뺐는지 확인한다');

const wf = read(T('.github/workflows/issue-sync.yml'));
const mapText = read(T('.github/github-jira-map.yml'));
const skill = read(T('.claude/skills/report-issue/SKILL.md'));
const alias = aliasFolders[0] ? read(path.join(cmdDir, aliasFolders[0], '이슈등록.md')) : '';
const forms = Object.fromEntries(['task', 'bug_report', 'feature_request', 'screen_blocked'].filter(f => fs.existsSync(T(`.github/ISSUE_TEMPLATE/${f}.yml`))).map(f => [f, read(T(`.github/ISSUE_TEMPLATE/${f}.yml`))]));

const ruleFiles = fs.readdirSync(rulesOut).filter(f => f.endsWith('.json')).sort();
const rules = ruleFiles.map(f => { const j = JSON.parse(fs.readFileSync(path.join(rulesOut, f), 'utf8')); return { file: f, raw: fs.readFileSync(path.join(rulesOut, f), 'utf8'), rule: j.rules[0] }; });
check(rules.length === 5, 'R0', '규칙 JSON 이 5개다', ruleFiles.join(' · '), `${rules.length}개 — ${ruleFiles.join(' · ')}`);

// ───────── 규칙 쪽 추출
const BASE_NAMES = ['Github -> Jira Issue', 'Jira -> Github Issue', 'Jira 수정 -> Github Issue', 'Jira 댓글 → Github', 'Jira 상태 → Github'];
const prefixes = uniq(rules.map(r => { const b = BASE_NAMES.find(n => r.rule.name.endsWith(n)); return b ? r.rule.name.slice(0, r.rule.name.length - b.length).trim() : null; }));
const bodies = []; // 규칙 웹 요청 본문(customBody)
const urls = [];
for (const r of rules) (function walk(o) {
  if (o && typeof o === 'object') {
    if (typeof o.customBody === 'string') bodies.push({ file: r.file, text: o.customBody });
    if (typeof o.url === 'string' && /api\.github\.com/.test(o.url)) urls.push(o.url);
    for (const k in o) walk(o[k]);
  }
})(r.rule);
const jqls = []; for (const r of rules) (function walk(o) { if (o && typeof o === 'object') { if (typeof o.value === 'string' && /project = /.test(o.value)) jqls.push(o.value); for (const k in o) walk(o[k]); } })(r.rule);

// ───────── 워크플로 쪽 추출
const jiraSpace = (wf.match(/JIRA_SPACE:\s*([A-Z][A-Z0-9]+)/) || [])[1];
const secretRefs = uniq([...wf.matchAll(/secrets\.(JIRA_[A-Z0-9]+_WEBHOOK_(?:URL|TOKEN))/g)].map(m => m[1]));
const dispatchInputs = (() => {
  const lines = wf.split('\n'); const i = lines.findIndex(l => /^\s{2}workflow_dispatch:/.test(l)); if (i < 0) return [];
  const out = []; let inInputs = false;
  for (let k = i + 1; k < lines.length; k++) { const l = lines[k];
    if (/^\s{4}inputs:/.test(l)) { inInputs = true; continue; }
    if (inInputs) { const m = l.match(/^\s{6}([a-z_]+):\s*$/); if (m) out.push(m[1]); else if (/^\S/.test(l) || /^\s{0,3}\S/.test(l)) break; }
  }
  return out;
})();
const wfKinds = uniq(((wf.match(/case "\$KIND" in ([a-z|]+)\)/) || [])[1] || '').split('|').filter(Boolean));
const bridgeBuilt = (() => { const i = wf.indexOf('.bridge = {'); if (i < 0) return []; let d = 0, j = i + '.bridge = '.length, s = ''; for (; j < wf.length; j++) { const c = wf[j]; if (c === '{') d++; if (c === '}') { d--; if (d === 0) break; } s += c; } return uniq([...s.matchAll(/\b([A-Za-z][A-Za-z0-9_]*):/g)].map(m => m[1])); })();

// ───────── 대조표(생성 형식 기준의 가벼운 해석)
const section = (text, name) => { const lines = text.split('\n'); const i = lines.findIndex(l => l.startsWith(name + ':')); if (i < 0) return ''; let j = i + 1; while (j < lines.length && !/^\S/.test(lines[j])) j++; return lines.slice(i, j).join('\n'); };
const spacesSec = section(mapText, 'spaces');
const mapSpaces = [...spacesSec.matchAll(/^ {2}([A-Z][A-Z0-9]+):\s*$/gm)].map(m => m[1]);
const mapTypes = {}; for (const k of ['Bug', 'Task', 'Feature']) mapTypes[k] = (spacesSec.match(new RegExp('^ {6}' + k + ':\\s*(.+?)\\s*$', 'm')) || [])[1];
const mapStart = (spacesSec.match(/^ {4}startDateField:\s*(customfield_\d+)/m) || [])[1];
const areasSec = section(mapText, 'areas');
const areaSpaces = [...areasSec.matchAll(/^ {4}space:\s*(\S+)/gm)].map(m => m[1]);
// 영역 블록을 항목별로 읽는다 — screens · designers · developers 는 같은 들여쓰기의 목록이다
const areaLists = { screens: [], designers: [], developers: [] };
{
  let cur = null;
  for (const l of areasSec.split('\n')) {
    const k = l.match(/^ {4}(screens|designers|developers):\s*(\[\])?\s*$/);
    if (k) { cur = k[1]; continue; }
    if (/^ {4}\S/.test(l) || /^ {2}\S/.test(l)) { cur = null; continue; }
    const it = l.match(/^ {6}- (.+?)\s*$/);
    if (it && cur) areaLists[cur].push(it[1]);
  }
}
const areaCands = uniq([...areaLists.designers, ...areaLists.developers]);
const peopleKeys = [...section(mapText, 'people').matchAll(/^ {2}(\S+):\s*$/gm)].map(m => m[1]);
const jiraOnlyKeys = [...section(mapText, 'jiraOnly').matchAll(/^ {2}(\S+):\s*$/gm)].map(m => m[1]);
const screensAll = uniq(areaLists.screens);

// ───────── 검사
// C1 기준 상품 글자 · 자리표시자 잔존
{
  const S = jiraSpace;
  const files = [['워크플로', wf], ['대조표', mapText], ['스킬', skill], ['별칭', alias], ...Object.entries(forms).map(([k, v]) => ['양식 ' + k, v]), ...rules.map(r => ['규칙 ' + r.file, r.raw])];
  const tok = [], base = [];
  for (const [n, t] of files) {
    if (/<<[A-Z_]+>>/.test(t)) tok.push(n);
    // 그 상품이 실제로 쓰는 값(상품 이름 · 저장소 이름)은 기준 글자를 품어도 잔존이 아니다(예: 브릿지X-백오피스, bridge-web-admin) — install-files.mjs 의 치환 누락 검사와 같은 예외
    let t2 = t.split('EXP-n').join('');
    const ownValues = uniq([aliasFolders[0], ...(repoArg ? [repoArg, repoArg.split('/')[1]] : []), ...urls.flatMap(u => { const m = u.match(/repos\/([^/]+\/([^/]+))\/actions/); return m ? [m[1], m[2]] : []; })].filter(Boolean)).sort((a, b) => b.length - a.length);
    for (const v of ownValues) t2 = t2.split(v).join('');
    if (/\bEXP\b|bridge-web|브릿지|\[BG\]|JIRA_EXP_/.test(t2) && S !== 'EXP') base.push(n);
  }
  check(tok.length === 0, 'C1', '채우지 못한 자리표시자(<<…>>)가 없다', `검사 ${files.length}개 파일`, '남음: ' + tok.join(', '));
  check(base.length === 0, 'C2', '기준 상품 글자(EXP · bridge-web · 브릿지 · [BG] · JIRA_EXP_)가 없다', '', '남음: ' + base.join(', '));
}
// C3 스페이스 키
{
  const S = jiraSpace; const secretSpaces = uniq(secretRefs.map(s => s.match(/^JIRA_([A-Z0-9]+)_WEBHOOK/)[1]));
  const jqlSpaces = uniq(jqls.map(q => (q.match(/project = ([A-Z][A-Z0-9]+)/) || [])[1]).filter(Boolean));
  const epic0 = uniq(rules.flatMap(r => [...r.raw.matchAll(/\|([A-Z][A-Z0-9]+)-0\}\}/g)].map(m => m[1])));
  const ariProj = uniq(rules.flatMap(r => [...r.raw.matchAll(/:project\/(\d+)/g)].map(m => m[1])));
  const all = { 워크플로: [S], Secret이름: secretSpaces, 대조표: mapSpaces, 영역: uniq(areaSpaces), 규칙JQL: jqlSpaces, '에픽기본값(-0)': epic0 };
  const flat = uniq(Object.values(all).flat());
  check(S && flat.length === 1, 'C3', '스페이스 키가 모든 곳에서 같다(워크플로 · Secret 이름 · 대조표 · 영역 · 규칙 JQL · 에픽 기본값)',
    `${S} · 프로젝트 id ${ariProj.join(',')}`, Object.entries(all).map(([k, v]) => `${k}=${v.join('/') || '없음'}`).join(' · '));
  check(ariProj.length === 1, 'C3b', '규칙 5개의 범위(프로젝트)가 하나다', ariProj.join(','), `프로젝트 id ${ariProj.join(', ')}`);
  info('C3c', '등록할 Secret 이름(저장소 Repository secrets)', secretRefs.sort().join(' · '));
  check(secretRefs.length === 2 && secretRefs.every(s => wf.includes('Secrets ' + secretRefs[0]) || true), 'C3d', '워크플로가 읽는 Secret 이 2개다(URL · TOKEN)', '', secretRefs.join(', '));
  const msgNames = [...wf.matchAll(/::error::Secrets (JIRA_[A-Z0-9]+_WEBHOOK_URL) · (JIRA_[A-Z0-9]+_WEBHOOK_TOKEN)/g)][0];
  check(!msgNames || (secretRefs.includes(msgNames[1]) && secretRefs.includes(msgNames[2])), 'C3e', '워크플로 오류 문구의 Secret 이름이 실제 이름과 같다', '', '오류 문구의 이름이 다르다');
}
// C4 규칙 이름 접두사
{
  const wfPrefix = (wf.match(/「(.+?) Github -> Jira Issue」/) || [])[1];
  const skillPrefixes = uniq([...skill.matchAll(/「(.+?) (?:Github|Jira) (?:-> |수정 -> )?(?:Jira Issue|Github Issue)」/g)].map(m => m[1]));
  check(prefixes.length === 1 && prefixes[0], 'C4', '규칙 5개의 이름 접두사가 같고 5개 이름이 모두 있다', `접두사 ${prefixes[0]}`, `접두사: ${prefixes.map(p => p ?? '(이름 불일치)').join(' / ')}`);
  check(!wfPrefix || wfPrefix === prefixes[0], 'C4b', '워크플로 머리 주석의 규칙 이름이 렌더한 규칙 이름과 같다', wfPrefix || '(주석 없음)', `워크플로=${wfPrefix} 규칙=${prefixes[0]}`);
  check(skillPrefixes.every(p => p === prefixes[0]), 'C4c', '스킬이 설명하는 규칙 이름이 렌더한 규칙 이름과 같다', skillPrefixes.join(',') || '(언급 없음)', `스킬=${skillPrefixes.join(',')} 규칙=${prefixes[0]}`);
}
// C5 웹 요청 대상
{
  const targets = uniq(urls.map(u => (u.match(/repos\/([^/]+\/[^/]+)\/actions\/workflows\/([^/]+)\/dispatches/) || []).slice(1).join(' ')));
  check(urls.length === 7 && targets.length === 1, 'C5', '웹 요청 7곳이 같은 저장소 · 같은 워크플로 파일을 가리킨다', targets[0] || '', `${urls.length}곳, 대상 ${targets.join(' | ')}`);
  const wfFile = (targets[0] || '').split(' ')[1];
  check(wfFile === 'issue-sync.yml' && fs.existsSync(T('.github/workflows/' + wfFile)), 'C5b', '가리키는 워크플로 파일이 저장소에 있다', wfFile, `${wfFile} 가 .github/workflows 에 없다`);
  const repos = uniq(targets.map(t => t.split(' ')[0]));
  if (repoArg) check(repos.length === 1 && repos[0] === repoArg, 'C5c', `웹 요청 7곳의 저장소가 모두 --repo(${repoArg}) 와 같다`, repos[0], `웹 요청 저장소: ${repos.join(' | ')}`);
  else info('C5c', '웹 요청 저장소', repos.join(' | ') + ' — 설치 대상 저장소가 맞는지 눈으로 확인한다(--repo 로 검사 가능)');
}
// C6 입력 이름 · kind
{
  const keys = uniq(bodies.flatMap(b => { const i = b.text.indexOf('"inputs"'); return i < 0 ? [] : [...b.text.slice(i).matchAll(/"([a-z_]+)"\s*:/g)].map(m => m[1]).filter(k => k !== 'inputs'); }));
  const unknown = keys.filter(k => !dispatchInputs.includes(k));
  check(dispatchInputs.length === 10, 'C6a', '워크플로 dispatch 입력이 10개다', dispatchInputs.join(', '), `${dispatchInputs.length}개: ${dispatchInputs.join(', ')}`);
  check(bodies.length === 7 && unknown.length === 0, 'C6b', '규칙 본문의 입력 이름이 모두 워크플로 입력에 있다(422 방지)', `본문 ${bodies.length}곳 · 쓰는 이름 ${keys.join(', ')}`, `없는 입력: ${unknown.join(', ') || '-'} (본문 ${bodies.length}곳)`);
  const noKK = bodies.filter(b => !/"kind"\s*:/.test(b.text) || !/"key"\s*:/.test(b.text));
  check(noKK.length === 0, 'C6c', '모든 본문에 kind · key 가 있다', '', noKK.map(b => b.file).join(', '));
  const kinds = uniq(bodies.map(b => (b.text.match(/"kind"\s*:\s*"([a-z]+)"/) || [])[1]).filter(Boolean));
  const unk = kinds.filter(k => !wfKinds.includes(k));
  check(wfKinds.length > 0 && unk.length === 0, 'C6d', '규칙이 보내는 kind 를 워크플로가 처리한다', `규칙 ${kinds.join(',')} ⊆ 워크플로 ${wfKinds.join(',')}`, `처리 못 하는 kind: ${unk.join(',')}`);
}
// C7 payload bridge 키
{
  const used = uniq(rules.flatMap(r => [...r.raw.matchAll(/webhookData\.bridge\.([A-Za-z_]+)/g)].map(m => m[1])));
  const unk = used.filter(k => !bridgeBuilt.includes(k));
  check(bridgeBuilt.length > 0 && unk.length === 0, 'C7', '규칙이 읽는 bridge 값을 워크플로가 만든다', `규칙 ${used.join(',')} ⊆ 워크플로 ${bridgeBuilt.join(',')}`, `워크플로가 안 만드는 값: ${unk.join(',')}`);
}
// C8 업무 유형 · 시작 날짜
{
  const conds = []; for (const r of rules) (function walk(o) { if (o && typeof o === 'object') { if (o.first === '{{webhookData.bridge.jiraType}}' && typeof o.second === 'string') conds.push(o.second); for (const k in o) walk(o[k]); } })(r.rule);
  const [bugCond, featCond] = [conds[0], conds[1]];
  check(conds.length === 2 && bugCond === mapTypes.Bug, 'C8a', '규칙의 「버그」 블록 조건이 대조표 issueTypes.Bug 와 같다', `${bugCond}`, `규칙=${bugCond} 대조표=${mapTypes.Bug} — 다르면 버그가 엉뚱한 유형으로 생긴다`);
  if (featCond === mapTypes.Feature) ok('C8b', '규칙의 「기능」 블록 조건이 대조표 issueTypes.Feature 와 같다', featCond);
  else info('C8b', '규칙의 「기능」 블록 조건이 대조표 issueTypes.Feature 와 다르다', `규칙=${featCond} 대조표=${mapTypes.Feature} — 기능 요청도 「그 밖」 블록(작업)으로 간다. 「기능」 유형이 없는 스페이스라면 의도한 구성`);
  const ruleStart = uniq(rules.flatMap(r => [...r.raw.matchAll(/\\"(customfield_\d+)\\":\\"\{\{webhookData\.bridge\.startDate\}\}\\"/g)].map(m => m[1])));
  check((mapStart ? ruleStart.length === 1 && ruleStart[0] === mapStart : ruleStart.length === 0), 'C8c', '시작 날짜 필드가 규칙과 대조표에서 같다', mapStart || '(없음 — 양쪽 모두 뺌)', `규칙=${ruleStart.join(',') || '없음'} 대조표=${mapStart || '없음'}`);
  const ids = uniq(rules.flatMap(r => [...r.raw.matchAll(/"fieldType": "issuetype",\s*"type": "SET",\s*"value": \{\s*"type": "ID",\s*"value": "(\d+)"/g)].map(m => m[1])));
  info('C8d', '규칙의 업무 유형 id(그 스페이스의 id 인지는 오프라인으로 검사하지 못한다)', ids.join(', '));
}
// C9 이슈 양식
{
  const missEpic = Object.entries(forms).filter(([, t]) => !/label:\s*상위 에픽 키/.test(t) || !/required:\s*true/.test(t)).map(([k]) => k);
  check(missEpic.length === 0 && /###\[ \\t\]\*상위 에픽 키|상위 에픽 키/.test(wf), 'C9a', '모든 양식에 「상위 에픽 키」 필수 칸이 있고 워크플로가 그 칸을 읽는다', `양식 ${Object.keys(forms).join(', ')}`, `칸이 없거나 필수가 아님: ${missEpic.join(', ')}`);
  const wrong = Object.entries(forms).filter(([, t]) => { const m = t.match(/placeholder:\s*([A-Z][A-Z0-9]+)-\d+/); return !m || m[1] !== jiraSpace; }).map(([k]) => k);
  check(wrong.length === 0, 'C9b', '양식의 에픽 키 예시가 이 스페이스 키 모양이다', `${jiraSpace}-n`, '다름: ' + wrong.join(', '));
}
// C10 스킬 · 별칭
{
  const name = aliasFolders[0];
  check(alias.includes(name) && skill.includes(`/${name}:이슈등록`), 'C10a', '별칭 폴더 이름 = 별칭 명령 설명의 상품 이름 = 스킬이 안내하는 호출 문구', `/${name}:이슈등록`, `폴더=${name} · 스킬 호출 문구 ${skill.includes(`/${name}:이슈등록`) ? '있음' : '없음'} · 별칭 설명 ${alias.includes(name) ? '있음' : '없음'}`);
  const paths = ['.github/github-jira-map.yml', '.github/ISSUE_TEMPLATE', '.github/scripts/issue-body.mjs'].filter(p => !skill.includes(p));
  check(paths.length === 0, 'C10b', '스킬이 읽는 경로(대조표 · 양식 · 조립기)가 저장소 파일과 같다', '', '스킬 본문에 없는 경로: ' + paths.join(', '));
  const author = (skill.match(/author:\n\s+name:\s*"?([^"\n]+)"?/) || [])[1];
  check(!!author, 'C10c', '스킬 머리말 작성자가 채워져 있다', author === '<담당자 ID>' ? '<담당자 ID> 자리 — 상품 담당자 ID 로 바꾼다' : author, '작성자 칸이 깨졌다');
}
// C11 대조표 내부
{
  const cands = new Set([...peopleKeys, ...jiraOnlyKeys]);
  const orphan = areaCands.filter(c => !cands.has(c));
  check(orphan.length === 0, 'C11a', '영역의 담당 후보가 모두 people · jiraOnly 에 있다', `${[...cands].join(', ')}`, '없는 후보: ' + orphan.join(', '));
  const screensDir = T('src/screens');
  if (fs.existsSync(screensDir)) { const have = fs.readdirSync(screensDir).filter(d => fs.statSync(path.join(screensDir, d)).isDirectory()); const none = screensAll.filter(s => !have.includes(s)); if (none.length) info('C11b', '영역의 화면 폴더가 src/screens 에 없다', none.join(', ')); else ok('C11b', '영역의 화면 폴더가 src/screens 에 있다', screensAll.join(', ')); }
  else info('C11b', 'src/screens 폴더가 없어 영역 화면을 비교하지 않았다', '');
}
// C12 가져오기 전 상태
{
  const states = uniq(rules.map(r => r.rule.state));
  if (states.length === 1 && states[0] === 'DISABLED') ok('C12a', '규칙 5개가 모두 꺼짐 상태다(가져온 뒤 사람이 켠다)', '');
  else bad('C12a', '규칙 5개가 모두 꺼짐이어야 한다', states.join(','));
  if (rules.some(r => /DUMMYDUMMY/.test(r.raw))) info('C12b', 'Slack 주소가 가짜다', '틀린 상위 에픽 키 알림이 가지 않는다 — 쓰려면 Jira 화면에서 규칙의 슬랙 동작 2곳에 직접 붙여 넣는다');
  const emptyAuth = rules.reduce((n, r) => n + (r.raw.match(/"name": "Authorization",\s*"value": ""/g) || []).length, 0);
  info('C12c', 'Authorization 헤더(PAT) 칸', `${emptyAuth}곳이 비어 있다 — 렌더 결과에는 비밀값이 없다. Jira 화면에서 7곳에 직접 채운다`);
}
// --deep: YAML 문법 · 대조표 스키마
if (has('deep')) {
  const run = (cmd, a, input) => spawnSync(cmd, a, { input, encoding: 'utf8', shell: true });
  const parse = (label, text) => { const r = run('npx', ['--yes', 'yaml@2.6.1', '--json', '--single'], text); return { label, ok: r.status === 0, out: r.stdout, err: (r.stderr || '').split('\n')[0] }; };
  const ps = [parse('워크플로', read(T('.github/workflows/issue-sync.yml'))), parse('대조표', mapText), ...Object.entries(forms).map(([k, v]) => parse('양식 ' + k, v))];
  for (const p of ps) check(p.ok, 'D1', `YAML 문법: ${p.label}`, '', p.err);
  const m = ps[1];
  if (m.ok) {
    const tmp = path.join(fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'verify-')), 'map.json'); fs.writeFileSync(tmp, m.out);
    const r = run('npx', ['--yes', 'ajv-cli@5.0.0', 'validate', '--spec=draft7', '-s', JSON.stringify(T('.github/github-jira-map.schema.json')), '-d', JSON.stringify(tmp)]);
    check(r.status === 0, 'D2', '대조표가 스키마를 통과한다(ajv)', '', ((r.stdout || '') + (r.stderr || '')).split('\n').filter(Boolean).slice(0, 3).join(' | '));
  }
} else info('D', 'YAML 문법 · 대조표 스키마는 --deep 으로 검사한다', 'npx 가 필요하다(네트워크)');

report();
function report() {
  const mark = { ok: '✓', fail: '✗', info: 'ℹ' };
  console.log(`\n맞물림 검사 — 대상 ${target}\n규칙 ${rulesOut}\n`);
  for (const r of results) console.log(`${mark[r.level]} [${r.id}] ${r.title}${r.detail ? '\n      ' + r.detail : ''}`);
  const n = l => results.filter(r => r.level === l).length;
  console.log(`\n합계: 통과 ${n('ok')} · 실패 ${n('fail')} · 참고 ${n('info')}`);
  if (n('fail')) console.log('실패가 있다 — 위 ✗ 항목의 원인을 고친 뒤 다시 실행한다.');
  process.exitCode = n('fail') ? 1 : 0;
}
