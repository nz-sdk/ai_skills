#!/usr/bin/env node
// Jira 자동화 규칙 5개 — 값 파일로 템플릿을 채워 「가져오기용 JSON」 5개를 만든다.
// 의존성 없음(Node 18 이상). 비밀값(PAT · Slack 주소 · 웹후크 암호)은 이 스크립트에 넣지 않는다.
//
// 사용:
//   node render-rules.mjs --values my-values.json [--templates ./templates] [--out ./out]
//   node render-rules.mjs --selftest        # 예시 값으로 렌더해 스크립트·템플릿이 맞는지만 확인
//
// 결과: <out>/<SPACE>-rule-N-….json 5개 — 모두 「꺼짐」 상태. Jira ▸ 자동화 ▸ 규칙 가져오기로 올린다.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DUMMY_SLACK = 'https://hooks.slack.com/services/T00000000/B00000000/DUMMYDUMMYDUMMYDUMMYDUMMY';

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const has = n => args.includes('--' + n);

// 값 이름 · 형식 · 필수 여부
const SPEC = {
  PREFIX: { re: /^\S.{0,19}$/, help: '규칙 이름 앞에 붙는 구분 글자 (예 [AB]) — 목록에서 다른 상품 규칙과 구별되면 된다' },
  SPACE: { re: /^[A-Z][A-Z0-9]+$/, help: 'Jira 스페이스 키 (대문자·숫자 2자 이상)' },
  PROJECT_ID: { re: /^\d+$/, help: '스페이스의 프로젝트 id (숫자) — 스페이스 조회 도구의 id' },
  CLOUD_ID: { re: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, help: 'Jira cloudId (UUID)' },
  SITE: { re: /^[a-z0-9.-]+\.[a-z]{2,}$/i, help: 'Jira 사이트 주소 (예 example.atlassian.net, https:// 없이)' },
  REPO: { re: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, help: 'GitHub 저장소 소유자/이름' },
  ISSUE_TYPE_ID_BUG: { re: /^\d+$/, help: '스페이스의 「버그」 유형 id' },
  ISSUE_TYPE_ID_FEATURE: { re: /^\d+$/, help: '「기능」 유형 id — 없으면 「작업」 id 를 그대로 쓴다' },
  ISSUE_TYPE_ID_TASK: { re: /^\d+$/, help: '「작업」 유형 id' },
  JIRA_TYPE_BUG: { re: /^\S.*$/, help: 'Jira 의 버그 유형 이름 — 대조표 issueTypes.Bug 와 같은 글자' },
  JIRA_TYPE_FEATURE: { re: /^\S.*$/, help: 'Jira 의 기능 유형 이름 — 대조표 issueTypes.Feature 와 같은 글자' },
  START_DATE_FIELD: { re: /^(customfield_\d+)?$/, optional: true, help: '「시작 날짜」 필드 id — 스페이스에 없으면 빈 글자(그 줄을 뺀다)' },
  TRANSITION_DONE: { re: /^\S.*$/, help: '완료로 가는 전환의 도착 상태 이름 (예 완료)' },
  TRANSITION_REOPEN: { re: /^\S.*$/, help: '다시 열기로 가는 전환의 도착 상태 이름 (예 할 일)' },
  OWNER_ACCOUNT_ID: { re: /^([0-9a-f]{24}|\d+:[0-9a-f-]{36})$/, help: '규칙 소유자(가져오는 사람 본인)의 Atlassian accountId' },
  ACTOR_ACCOUNT_ID: { re: /^([0-9a-f]{24}|\d+:[0-9a-f-]{36})$/, help: '「Automation for Jira」 앱 계정 id — 같은 사이트의 기존 규칙을 내보낸 파일의 actor.value' },
  SLACK_WEBHOOK_URL: { re: /^(https:\/\/hooks\.slack\.com\/services\/\S+)?$/, optional: true, help: 'Slack 수신 웹후크 주소 — 비워 두면 가짜 주소가 들어가 알림만 실패한다' },
};

function loadValues(file) {
  let v;
  try { v = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail('값 파일을 읽지 못했다: ' + e.message); }
  const errs = [];
  for (const [k, s] of Object.entries(SPEC)) {
    const val = v[k] == null ? '' : String(v[k]);
    if (!val && !s.optional) errs.push(`${k}: 비어 있다 — ${s.help}`);
    else if (!s.re.test(val)) errs.push(`${k}: 형식이 맞지 않는다 (${JSON.stringify(val)}) — ${s.help}`);
  }
  for (const k of Object.keys(v)) if (!SPEC[k] && !k.startsWith('_')) errs.push(`${k}: 모르는 이름이다 (오타 확인)`);
  if (errs.length) fail('값 파일 오류:\n  - ' + errs.join('\n  - '));
  return v;
}
function fail(msg) { console.error('✗ ' + msg); process.exit(1); }

function render(templateText, v, warnings) {
  let t = templateText;
  // 시작 날짜 칸이 없는 스페이스 — 추가 필드 JSON 의 그 줄을 뺀다
  if (!v.START_DATE_FIELD) {
    const before = t;
    t = t.replace(/,\\n\s*\\"<<START_DATE_FIELD>>\\":\\"\{\{webhookData\.bridge\.startDate\}\}\\"/g, '');
    if (t === before && /<<START_DATE_FIELD>>/.test(t)) warnings.push('START_DATE_FIELD 가 비었는데 템플릿의 시작 날짜 줄을 찾지 못했다');
  }
  const values = { ...v, SLACK_WEBHOOK_URL: v.SLACK_WEBHOOK_URL || DUMMY_SLACK };
  for (const [k, val] of Object.entries(values)) {
    if (val === '' || val == null) continue;
    const safe = JSON.stringify(String(val)).slice(1, -1); // JSON 문자열 안에서 안전하게
    t = t.split('<<' + k + '>>').join(safe);
  }
  return t;
}

function main() {
  const selftest = has('selftest');
  const valuesFile = selftest ? path.join(HERE, 'values.example.json') : opt('values');
  if (!valuesFile) fail('--values <값 파일> 이 필요하다 (예시: values.example.json 을 복사해 채운다)');
  const tplDir = path.resolve(opt('templates') || path.join(HERE, 'templates'));
  const outDir = path.resolve(selftest ? fs.mkdtempSync(path.join(os.tmpdir(), 'jira-rules-')) : (opt('out') || './out'));
  const v = loadValues(valuesFile);
  const warnings = [];
  if (!v.SLACK_WEBHOOK_URL) warnings.push('SLACK_WEBHOOK_URL 이 비어 가짜 주소를 넣었다 — 틀린 상위 에픽 키 알림(규칙 ① Slack 2곳)은 실패한다');
  const templates = fs.readdirSync(tplDir).filter(f => f.endsWith('.template.json')).sort();
  if (templates.length !== 5) fail(`템플릿이 5개가 아니다(${templates.length}개): ${tplDir}`);
  fs.mkdirSync(outDir, { recursive: true });

  const rows = [];
  for (const f of templates) {
    const t = render(fs.readFileSync(path.join(tplDir, f), 'utf8'), v, warnings);
    const left = t.match(/<<[A-Z_0-9]+>>/g);
    if (left) fail(`${f}: 채우지 못한 자리표시자 ${[...new Set(left)].join(', ')}`);
    let j; try { j = JSON.parse(t); } catch (e) { fail(`${f}: 결과가 JSON 이 아니다 — ${e.message}`); }
    const r = j.rules[0];
    if (r.state !== 'DISABLED') fail(`${f}: 상태가 꺼짐이 아니다`);
    const ari = `project/${v.PROJECT_ID}`;
    if (!(r.ruleScope?.resources || []).every(x => x.endsWith(ari))) fail(`${f}: 범위가 ${ari} 가 아니다`);
    const out = path.join(outDir, `${v.SPACE}-${f.replace('.template', '')}`);
    fs.writeFileSync(out, JSON.stringify(j, null, 2) + '\n');
    rows.push([r.name, (t.match(new RegExp('repos/' + v.REPO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/actions/workflows/issue-sync.yml/dispatches', 'g')) || []).length, path.basename(out)]);
  }
  console.log(`✓ ${selftest ? '(자체 시험) ' : ''}규칙 5개를 만들었다 → ${outDir}`);
  for (const [name, n, file] of rows) console.log(`   ${file}  「${name}」  GitHub 웹 요청 ${n}곳`);
  console.log(`   웹 요청 합계 ${rows.reduce((s, r) => s + r[1], 0)}곳 (기대: 7)`);
  if (rows.reduce((s, r) => s + r[1], 0) !== 7) fail('웹 요청이 7곳이 아니다 — 템플릿을 확인한다');
  for (const w of warnings) console.log('   ⚠ ' + w);
  if (!selftest) {
    console.log('\n다음(사람이 직접): ① Jira 에 가져오기 ② 규칙 ①의 수신 웹후크 URL · 암호를 GitHub Secret 으로 ③ 웹 요청 7곳의 Authorization 에 PAT ④ 켜기');
  }
}
main();
