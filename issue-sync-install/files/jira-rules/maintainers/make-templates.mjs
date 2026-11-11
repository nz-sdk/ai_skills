#!/usr/bin/env node
// 유지보수용 — 기준 상품의 Jira 규칙 내보내기 JSON(5개)에서 공통 템플릿 5개를 만든다.
// 규칙 구조가 바뀌었을 때만 쓴다. 설치하는 사람은 쓰지 않는다(render-rules.mjs 만 쓴다).
//
// 사용: node make-templates.mjs <기준 상품 내보내기 폴더> <기준 값 JSON> <출력 폴더>
//   기준 값 JSON 예: { "SPACE":"AAA", "PROJECT_ID":"10000", "CLOUD_ID":"…", "SITE":"x.atlassian.net",
//                      "REPO":"owner/repo", "PREFIX":"[AA]", "ISSUE_TYPE_ID_BUG":"…", "ISSUE_TYPE_ID_FEATURE":"…",
//                      "ISSUE_TYPE_ID_TASK":"…", "JIRA_TYPE_BUG":"버그", "JIRA_TYPE_FEATURE":"기능",
//                      "START_DATE_FIELD":"customfield_…", "TRANSITION_DONE":"완료", "TRANSITION_REOPEN":"할 일",
//                      "OWNER_ACCOUNT_ID":"…", "ACTOR_ACCOUNT_ID":"…" }
//   — 내보내기 파일에 들어 있는 기준 값을 알려 줘야 그 글자를 자리표시자로 바꾼다. 이 JSON 은 저장소에 올리지 않는다.
//
// 결과 템플릿에는 비밀값(Slack 주소 · 계정 id)과 상품 값이 남지 않는다 — 마지막에 검사하고, 남으면 실패한다.
import fs from 'node:fs';
import path from 'node:path';

const [, , inDir, baseFile, outDir] = process.argv;
if (!inDir || !baseFile || !outDir) { console.error('사용: node make-templates.mjs <내보내기 폴더> <기준 값 JSON> <출력 폴더>'); process.exit(2); }
const B = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
for (const k of ['SPACE', 'PROJECT_ID', 'CLOUD_ID', 'SITE', 'REPO', 'PREFIX', 'ISSUE_TYPE_ID_BUG', 'ISSUE_TYPE_ID_FEATURE', 'ISSUE_TYPE_ID_TASK', 'JIRA_TYPE_BUG', 'JIRA_TYPE_FEATURE', 'START_DATE_FIELD', 'TRANSITION_DONE', 'TRANSITION_REOPEN', 'OWNER_ACCOUNT_ID', 'ACTOR_ACCOUNT_ID']) {
  if (!B[k]) { console.error('기준 값 JSON 에 ' + k + ' 가 없다'); process.exit(2); }
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const problems = [];

// 규칙 → 템플릿 파일 이름(트리거로 판별)
const slotOf = r => {
  const t = r.trigger?.type || '';
  if (t === 'jira.incoming.webhook') return 'github-to-jira';
  if (t.startsWith('jira.issue.event.trigger:created')) return 'jira-created';
  if (t === 'jira.issue.field.changed') return 'jira-edited';
  if (t.endsWith(':commented')) return 'jira-comment';
  if (t.endsWith(':transitioned')) return 'jira-status';
  return null;
};

fs.mkdirSync(outDir, { recursive: true });
const seen = new Set();
for (const f of fs.readdirSync(inDir).filter(x => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(inDir, f), 'utf8'));
  if (!j.rules || j.rules.length !== 1) { problems.push(f + ': 규칙이 1개가 아니다'); continue; }
  const r = j.rules[0];
  const slot = slotOf(r);
  if (!slot) { problems.push(f + ': 알 수 없는 트리거 ' + r.trigger?.type); continue; }
  if (seen.has(slot)) { problems.push(slot + ' 가 두 번 나왔다'); continue; }
  seen.add(slot);

  // 1) 개체 수준 치환 — 소유자 · 실행 주체 · 전환 이름
  r.authorAccountId = '<<OWNER_ACCOUNT_ID>>';
  if (r.actor && r.actor.value) r.actor.value = '<<ACTOR_ACCOUNT_ID>>';
  r.state = 'DISABLED';
  (function walk(o) {
    if (o && typeof o === 'object') {
      if (o.destinationStatus && typeof o.destinationStatus.value === 'string') {
        if (o.destinationStatus.value === B.TRANSITION_DONE) o.destinationStatus.value = '<<TRANSITION_DONE>>';
        else if (o.destinationStatus.value === B.TRANSITION_REOPEN) o.destinationStatus.value = '<<TRANSITION_REOPEN>>';
        else problems.push(slot + ': 모르는 전환 이름 ' + o.destinationStatus.value);
      }
      for (const k in o) walk(o[k]);
    }
  })(r);

  // 2) 텍스트 수준 치환
  let t = JSON.stringify(j, null, 2);
  t = t.replace(/https:\/\/hooks\.slack\.com\/[^\s"\\]+/g, '<<SLACK_WEBHOOK_URL>>');
  t = t.split(B.CLOUD_ID).join('<<CLOUD_ID>>');
  t = t.split(B.SITE).join('<<SITE>>');
  t = t.split(B.REPO).join('<<REPO>>');
  t = t.split('project/' + B.PROJECT_ID).join('project/<<PROJECT_ID>>');
  t = t.split('"' + B.PROJECT_ID + '"').join('"<<PROJECT_ID>>"');
  t = t.replace(new RegExp('project = ' + esc(B.SPACE) + '\\b', 'g'), 'project = <<SPACE>>');
  t = t.replace(new RegExp(esc(B.SPACE) + '-0\\b', 'g'), '<<SPACE>>-0');
  t = t.split(B.PREFIX).join('<<PREFIX>>');
  t = t.split(B.START_DATE_FIELD).join('<<START_DATE_FIELD>>');
  t = t.replace(new RegExp('("second": )"' + esc(B.JIRA_TYPE_BUG) + '"', 'g'), '$1"<<JIRA_TYPE_BUG>>"');
  t = t.replace(new RegExp('("second": )"' + esc(B.JIRA_TYPE_FEATURE) + '"', 'g'), '$1"<<JIRA_TYPE_FEATURE>>"');
  const typeMap = { [B.ISSUE_TYPE_ID_BUG]: 'ISSUE_TYPE_ID_BUG', [B.ISSUE_TYPE_ID_FEATURE]: 'ISSUE_TYPE_ID_FEATURE', [B.ISSUE_TYPE_ID_TASK]: 'ISSUE_TYPE_ID_TASK' };
  t = t.replace(/("fieldType": "issuetype",\s*"type": "SET",\s*"value": \{\s*"type": "ID",\s*"value": ")(\d+)(")/g, (m, a, id, c) => {
    if (!typeMap[id]) { problems.push(slot + ': 모르는 이슈 유형 id ' + id); return m; }
    return a + '<<' + typeMap[id] + '>>' + c;
  });

  // 3) 남은 기준 값 · 비밀값 검사 — 있으면 템플릿으로 내보내지 않는다
  const leftovers = [];
  for (const [label, re] of [
    ['Slack 주소', /hooks\.slack\.com\/services\/(?!T00000000)/],
    ['PAT', /github_pat_|ghp_/],
    ['계정 id', /\b\d{5,6}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/],
    ['프로젝트 id', new RegExp('\\b' + esc(B.PROJECT_ID) + '\\b')],
    ['cloudId', new RegExp(esc(B.CLOUD_ID))],
    ['사이트', new RegExp(esc(B.SITE))],
    ['저장소', new RegExp(esc(B.REPO))],
    ['스페이스 키', new RegExp('\\b' + esc(B.SPACE) + '\\b')],
    ['규칙 접두사', new RegExp(esc(B.PREFIX))],
  ]) if (re.test(t)) leftovers.push(label);
  if (leftovers.length) { problems.push(slot + ': 남은 값 → ' + leftovers.join(', ')); continue; }
  JSON.parse(t.replace(/<<[A-Z_0-9]+>>/g, 'x')); // 구조 확인
  fs.writeFileSync(path.join(outDir, slot + '.template.json'), t + '\n');
  console.log('만듦:', slot + '.template.json', '(자리표시자 ' + new Set(t.match(/<<[A-Z_0-9]+>>/g)).size + '종)');
}
if (seen.size !== 5) problems.push('템플릿이 5개가 아니다: ' + [...seen].join(', '));
if (problems.length) { console.error('\n문제:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('완료 — 템플릿 5개');
