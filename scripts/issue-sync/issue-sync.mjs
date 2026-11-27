// issue-sync.mjs — GitHub 이슈 <-> Jira 업무 항목 양방향 동기화 (REST v3 ADF)
//
// 방식: 「바뀐 것만 보내기」가 아니라 **실행마다 짝 전체를 맞춘다**(reconcile).
//   - 마지막으로 맞춘 값을 Jira 이슈 속성 `ghsync` 에 남기고(스냅숏), 다음 실행은 양쪽 현재값을 스냅숏과 견줘
//     바뀐 쪽 값을 반대쪽에 쓴다. 양쪽이 모두 바뀌었으면 나중에 바뀐 쪽(updated 시각)이 이긴다.
//   - 그래서 연달아 바꿔 중간 실행이 취소 · 누락돼도 다음 실행이 전부 맞춘다. 바뀐 것이 없으면 아무것도 쓰지 않는다(반복 방지).
//   - 맞추는 것: 제목 · 본문(이미지 · 첨부 · 멘션 포함) · 레이블 · 업무 유형 · 담당 · 상태 · 스페이스별 세부 필드(spaces.json) · 댓글(등록 · 수정)
//
// 모드:  node issue-sync.mjs resolve  — 동시 실행 묶음 키(같은 짝은 한 줄로) 를 $GITHUB_OUTPUT 에 쓴다
//        node issue-sync.mjs sync     — 짝을 찾거나 만들고 전체를 맞춘다
//        node issue-sync.mjs preview  — (SYNC_DRY_RUN=1 일 때만) 저장소의 짝 전체를 맞춰 보되 아무것도 쓰지 않고, 쓸 것을 목록으로 낸다
//        node issue-sync.mjs adopt    — v1 에서 넘어온 짝(Jira 속성 ghsync 없음)마다 짝 기록만 남긴다(제목 · 본문 · 댓글은 쓰지 않음)
//
// 미리보기(SYNC_DRY_RUN=1): GitHub · Jira · Slack 에 쓰지 않는다. 읽기는 그대로 하고, 쓰려던 것을 실행 요약에 표로 남긴다.
//   미리보기에서만 SYNC_TARGET_REPO(다른 저장소 — 읽기만) · SYNC_SPACES_JSON(그 저장소의 spaces.json 내용)을 받는다.
//
// v1 짝 이어받기: v1(Jira 자동화 규칙 방식)이 맞춰 둔 짝은 Jira 속성 ghsync 가 없다. 처음 만나면 지금 양쪽 값을
//   「마지막으로 맞춘 값」으로 기록하고 옛 댓글 짝을 찾아 기록한다(adoptPair) — 옛 댓글을 다시 복사하지 않는다.
//
// 비밀값은 환경변수(Secret)로만 받는다 — 코드/로그에 값을 찍지 않는다.

import fs from 'node:fs';
import crypto from 'node:crypto';

const env = process.env;
// 상세는 디버그로(실행마다 결과 한 줄만 보이게). 디버그 로그를 켜면 다 보인다. 보이는 줄은 say().
const log = (...a) => console.log('::debug::' + a.map(String).join(' '));
const say = (...a) => console.log(...a);
// 멈춰야 하는 오류 — 맨 아래 main().catch 가 로그 · Slack(동기화 실패) 뒤 종료한다
const die = (msg) => { throw new Error(msg); };
const warn = (msg) => console.log('::warning::' + msg);
// 지금 맞추는 짝(실패 알림에 쓴다)
const RUN = { num: null, key: null };

// 오류 → 비개발자도 읽는 말(Slack). 「Jira PUT /rest/... 403: {...}」 같은 원문은 실행 기록에만 둔다.
const HTTP_EASY = {
  400: '보낸 내용이 받아들여지지 않았습니다',
  401: '연결용 로그인 정보가 만료됐습니다',
  403: '이 작업을 할 권한이 없습니다',
  404: '대상을 찾지 못했습니다 — 지워졌거나 볼 권한이 없습니다',
  409: '다른 변경과 겹쳤습니다 — 다음에 다시 맞춥니다',
  410: '이미 지워졌습니다',
  413: '내용이 너무 큽니다',
  422: '값이 맞지 않습니다',
  429: '잠시 사용량이 많아 막혔습니다 — 곧 다시 맞춥니다',
};
function easyError(msg) {
  const s = String(msg || '');
  if (/MB 초과/.test(s)) { const m = /([\d.]+MB) — ([\d.]+MB) 초과/.exec(s); return m ? `파일이 너무 큽니다(${m[1]} · 최대 ${m[2]})` : '파일이 너무 큽니다'; }
  const m = /\b(Jira|GitHub)\b[^\n]*?\b([1-5]\d\d)\b/.exec(s);
  if (m) {
    const code = Number(m[2]);
    return HTTP_EASY[code] || (code >= 500 ? `${m[1]} 쪽에 일시적인 문제가 있습니다` : '처리하지 못했습니다');
  }
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(s)) return '서버에 연결하지 못했습니다';
  if (/필수 환경변수 없음/.test(s)) return '연결 설정이 빠졌습니다';
  return '처리 중 문제가 생겼습니다';
}
const FIELD_NAME = { summary: '제목', description: '본문', labels: '레이블', assignee: '담당자', parent: '상위 항목', issuetype: '유형', priority: '우선순위', duedate: '기한' };
const TODO_DEV = '👉 할 일: 계속되면 담당 개발자에게 알려 주세요.';
function need(name) { if (!env[name]) die(`필수 환경변수 없음: ${name}`); return env[name]; }

// ──────────────── 실행 요약 표 (동작 아님 · 화면 표시용) ────────────────
// 표 칸(한국어): 순서 · 시간 · 위치 · 대상 · 항목 · 변경자 · 반영 계정. jira()/gh() 가 쓸 때마다 한 줄씩 담는다.
const dbg = (msg) => console.log('::debug::' + msg); // 상세 로그는 디버그로 내린다(실행마다 결과 한 줄만 보이게)
const FIELD_KO = { summary: '제목', title: '제목', description: '본문', body: '본문', labels: '레이블', issuetype: '유형', type: '유형', assignee: '담당', assignees: '담당', parent: '상위', priority: '우선순위', duedate: '기한', status: '상태', state: '상태', resolution: '상태', state_reason: '상태', duplicate_issue_id: '상태' };
const REPORT = []; // { n, time, side, tgt, item, by, account }
let _wseq = 0;
let SHARED_NAME = '공용'; // 공용 Jira 계정 표시 이름(/myself). main 에서 미리 채운다.
const nowKst = () => { try { return new Date().toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' }); } catch { return ''; } };
// 표에 넣을 항목(한국어). bookkeeping(속성 · 링크 · 레이블 만들기 등)은 null → 기록 안 함.
function reportItem(side, method, path, body) {
  if (side === 'Jira') {
    if (/\/properties\//.test(path)) return null;
    if (method === 'POST' && /\/rest\/api\/3\/issue$/.test(path)) return '새로 등록';
    if (/\/transitions$/.test(path)) return '상태';
    if (/\/comment\/\d+$/.test(path)) return '댓글 수정';
    if (/\/comment$/.test(path)) return '새 댓글';
    if (method === 'PUT' && /\/rest\/api\/3\/issue\/[^/]+$/.test(path) && body && body.fields) return [...new Set(Object.keys(body.fields).map((k) => FIELD_KO[k] || k))].join(' · ');
    return null;
  }
  if (method === 'POST' && /\/issues$/.test(path)) return '새로 등록';
  if (/\/issues\/comments\/\d+$/.test(path)) return '댓글 수정';
  if (/\/issues\/\d+\/comments$/.test(path)) return '새 댓글';
  if (method === 'PATCH' && /\/issues\/\d+$/.test(path) && body) return [...new Set(Object.keys(body).map((k) => FIELD_KO[k] || k))].join(' · ');
  return null;
}
function reportTgt(side, path, res) {
  if (side === 'Jira') { if (/\/comment/.test(path)) return '댓글 1건'; const m = /\/rest\/api\/3\/issue\/([^/?]+)/.exec(path); if (m) return decodeURIComponent(m[1]); return (res && res.key) || '새 업무'; }
  if (/\/comments/.test(path)) return '댓글 1건'; const m = /\/issues\/(\d+)/.exec(path); return m ? `#${m[1]}` : (res && res.number ? `#${res.number}` : '새 이슈');
}
// 한 건 기록. by = 변경자(없으면 자동 처리) · account = 반영 계정(이미 이유까지 붙인 글자)
function record(side, method, path, body, res, by, account) {
  const item = reportItem(side, method, path, body); if (!item) return;
  REPORT.push({ n: ++_wseq, time: nowKst(), side, tgt: reportTgt(side, path, res), item, by: by || '자동 처리', account });
}

const JIRA_BASE = (env.JIRA_BASE_URL || '').replace(/\/+$/, '');
// 범위 지정(scoped) Jira 토큰은 사이트 주소가 아니라 api.atlassian.com/ex/jira/<cloudId> 로 부른다(사람 토큰 쓰기만).
// cloudId 는 대조표 .github/github-jira-map.yml 의 jira.cloudId — loadPeople() 가 채운다.
let CLOUD_ID = null;
const JIRA_SCOPED_BASE = () => (CLOUD_ID ? `https://api.atlassian.com/ex/jira/${CLOUD_ID}` : null);
const jiraAuth = () => 'Basic ' + Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString('base64');
// 미리보기 — 쓰지 않고 쓸 것만 남긴다(맨 위 머리말)
const DRY = /^(1|true)$/i.test(String(env.SYNC_DRY_RUN || ''));
// owner/repo — 미리보기일 때만 다른 저장소를 읽을 수 있다(전환 전에 그 저장소의 짝을 미리 본다)
const GH_REPO = (DRY && env.SYNC_TARGET_REPO) || env.GITHUB_REPOSITORY;
// 전환 전에 만들어진 짝 없는 이슈 · 업무는 새로 등록하지 않는다(Variable SYNC_CREATE_SINCE = 날짜) —
// v2 로 바꾼 뒤 옛 이슈 · 업무를 고쳤다고 반대쪽에 사본이 새로 생기지 않게. 비우면 언제 만든 것이든 등록한다.
const CREATE_SINCE = env.SYNC_CREATE_SINCE && !Number.isNaN(Date.parse(env.SYNC_CREATE_SINCE)) ? Date.parse(env.SYNC_CREATE_SINCE) : null;
// GitHub 쓰기는 기본 GITHUB_TOKEN(github-actions 봇) — 자기 쓰기로 새 실행을 만들지 않는다.
// 사람 행동은 그 사람 토큰으로 반대쪽에 쓴다(작성자 = 본인). 「누가 바꿨나」 단계가 고른 사람의 열쇠만 6칸으로 넘어온다:
//   WHO_KEYS = {"jira1":"<GitHub 아이디>",…,"gh1":"<GitHub 아이디>",…}  (값 = 그 칸 열쇠의 주인)
//   gh1..3   → GH_USER_TOKEN_1..3   (Issues RW)            — Jira → GitHub 쓰기
//   jira1..3 → JIRA_USER_TOKEN_1..3 (값 "이메일:범위 토큰")  — GitHub → Jira 쓰기
// 열쇠가 없거나(빈 칸) 실패하면 그 쓰기만 공용(GitHub 봇 · Jira 공용 계정)으로 간다.
const ghAuth = (tok) => `Bearer ${tok || env.GITHUB_TOKEN}`;
// 아이디 정규화(대문자 · 영문 숫자 밖은 _) — Secret 이름 규칙과 같게 맞춰 같은 사람인지 견준다.
const idKey = (login) => String(login || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
// 주인 확인(§3-3) 실패한 사람 — 그 열쇠는 이번 실행에서 안 쓴다. 요약용 목록도 따로 둔다.
const KEY_FAILED = new Set(); // idKey
const KEY_BAD = []; // [{ person, side, why }]
// 사람인데 봇/공용으로 떨어질 때 뒷말 — 거절(4xx) · 확인 실패(주인 다름 §3-3) · 미등록(열쇠 없음)
const failWhy = (login, had4xx) => (had4xx ? '토큰 거절' : (KEY_FAILED.has(idKey(login)) ? '토큰 확인 실패' : '토큰 미등록'));
let _whoKeys = null;
const whoKeys = () => { if (!_whoKeys) { try { _whoKeys = JSON.parse(env.WHO_KEYS || '{}') || {}; } catch { warn('WHO_KEYS 를 읽지 못함 → 모두 공용'); _whoKeys = {}; } } return _whoKeys; };
// login 의 열쇠 칸 번호(1..3) — dir 'gh'(GH_USER_TOKEN) · 'jira'(JIRA_USER_TOKEN). 없으면 null.
function slotOf(login, dir) {
  const want = idKey(login);
  if (!want) return null;
  const wk = whoKeys();
  for (let i = 1; i <= 3; i++) if (idKey(wk[`${dir}${i}`]) === want) return i;
  return null;
}
// GitHub 사람 토큰(Jira → GitHub 쓰기) — 없으면 null(→ 봇)
function userToken(login) {
  const n = slotOf(login, 'gh');
  return (n && (env[`GH_USER_TOKEN_${n}`] || '').trim()) || null;
}
// Jira 사람 토큰(GitHub → Jira 쓰기) — 값 "이메일:토큰" → Basic. 없거나 꼴이 틀리면 null(→ 공용)
function jiraUserAuth(login) {
  const n = slotOf(login, 'jira');
  const raw = n ? (env[`JIRA_USER_TOKEN_${n}`] || '').trim() : '';
  return raw && raw.includes(':') ? 'Basic ' + Buffer.from(raw).toString('base64') : null;
}
// 스페이스 설정 — 기본은 옆의 spaces.json. SYNC_SPACES_FILE(다른 파일) · 미리보기에서는 SYNC_SPACES_JSON(내용)도 받는다
const SPACES = JSON.parse((DRY && env.SYNC_SPACES_JSON) || fs.readFileSync(env.SYNC_SPACES_FILE || new URL('./spaces.json', import.meta.url), 'utf8'));

// 멘션 · 담당 대조표 {"<jira accountId>":"<github 로그인>"} — 저장소 대조표 .github/github-jira-map.yml 의 people(스킬과 같은 정본)
// + (선택) Secret MENTION_MAP 으로 덧붙임. loadPeople() 가 sync 때 채운다(resolve 단계는 필요 없음).
let MENTION = {};
let LOGIN_TO_ACCT = {};
let JONLY = {}; // Jira 계정만 있는 사람 — 이름 -> accountId (대조표 jiraOnly)
async function loadPeople() {
  try {
    const { parse } = await import('yaml');
    const mapFile = env.SYNC_MAP_FILE || new URL('../../.github/github-jira-map.yml', import.meta.url); // SYNC_MAP_FILE: 시험용 대조표 경로(운영 미설정)
    let text = null;
    if (DRY && env.SYNC_TARGET_REPO) {
      // 다른 저장소 미리보기 — 그 저장소의 대조표를 읽는다(읽기만)
      const r = await req(`https://api.github.com/repos/${GH_REPO}/contents/.github/github-jira-map.yml`,
        { headers: { Authorization: ghAuth(), Accept: 'application/vnd.github.raw', 'User-Agent': 'issue-sync' } }, 'GitHub 대조표');
      if (r.ok) text = await r.text(); else warn(`${GH_REPO} 대조표 읽기 ${r.status} → 멘션 · 담당은 이름으로만`);
    } else if (fs.existsSync(mapFile)) text = fs.readFileSync(mapFile, 'utf8');
    if (text) {
      const doc = parse(text) || {};
      for (const [login, p] of Object.entries(doc.people || {})) if (p && p.jiraAccountId) MENTION[p.jiraAccountId] = login;
      for (const [name, p] of Object.entries(doc.jiraOnly || {})) if (p && p.jiraAccountId) JONLY[name] = p.jiraAccountId;
      if (doc.jira && doc.jira.cloudId) CLOUD_ID = String(doc.jira.cloudId); // 범위 지정 토큰 주소(JIRA_SCOPED_BASE)
    }
  } catch (e) { warn(`대조표 people 읽기 실패 → 멘션 · 담당은 이름으로만: ${e.message}`); }
  try { if (env.MENTION_MAP) Object.assign(MENTION, JSON.parse(env.MENTION_MAP)); } catch { warn('MENTION_MAP 파싱 실패 → 무시'); }
  LOGIN_TO_ACCT = Object.fromEntries(Object.entries(MENTION).map(([a, l]) => [String(l).toLowerCase(), a]));
  log(`· 사람 대조표 ${Object.keys(MENTION).length}명 · Jira 계정만 ${Object.keys(JONLY).length}명`);
}
const loginOf = (acct) => (acct && MENTION[acct]) || null;
// 사람이 손으로 쓴 이름도 찾게 — 앞뒤 · 겹친 공백, 영문 대소문자, 전각 괄호는 같은 이름으로 본다
const nameKey = (s) => String(s || '').replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, ' ').trim().toLowerCase();
const jiraOnlyKey = (name) => Object.keys(JONLY).find((n) => nameKey(n) === nameKey(name)) || null;
const jiraOnlyAcct = (name) => { const k = jiraOnlyKey(name); return k ? JONLY[k] : null; };
const jiraOnlyName = (acct) => Object.keys(JONLY).find((n) => JONLY[n] === acct) || null;
const acctOf = (login) => (login && LOGIN_TO_ACCT[String(login).replace(/^@/, '').toLowerCase()]) || null;

// 3-3) 열쇠 주인 확인 — 실행마다 한 번, 쓰기 전에. 이번 실행에 넘어온 칸(최대 6)만 GET 한 번씩.
//   GitHub 열쇠: GET /user 의 login == 그 아이디 · Jira 열쇠: GET /myself(범위 지정 주소) 의 accountId == 대조표의 그 사람 계정.
//   다르거나 어떤 오류든 실패하면 그 열쇠는 이번 실행에서 쓰지 않고(env 비움 → 공용으로), 요약에 「○○ 님 — 열쇠 확인 실패」.
//   값은 출력하지 않는다. 쓰기 전에 하므로(미리보기 포함) 사칭 · 만료 · 범위 부족을 미리 거른다.
async function verifyUserTokens() {
  const wk = whoKeys();
  for (let i = 1; i <= 3; i++) {
    const ghId = wk[`gh${i}`];
    const ght = (env[`GH_USER_TOKEN_${i}`] || '').trim();
    if (ghId && ght) {
      let ok = false, why = '';
      try { const u = await ghReal('GET', '/user', null, 'application/vnd.github+json', ght); ok = !!(u && idKey(u.login) === idKey(ghId)); if (!ok) why = '주인 다름'; }
      catch (e) { why = e && e.status ? `오류 ${e.status}` : '실패'; }
      if (!ok) { env[`GH_USER_TOKEN_${i}`] = ''; KEY_FAILED.add(idKey(ghId)); KEY_BAD.push({ person: ghId, side: 'GitHub', why }); dbg(`GitHub 열쇠 gh${i}(${ghId}) 주인 확인 실패(${why}) → 이번 실행 안 씀`); }
    }
    const jId = wk[`jira${i}`];
    const jraw = (env[`JIRA_USER_TOKEN_${i}`] || '').trim();
    const sBase = JIRA_SCOPED_BASE();
    if (jId && jraw && jraw.includes(':') && sBase) {
      const want = acctOf(jId); // 그 GitHub 아이디의 Jira accountId(대조표)
      let ok = false, why = '';
      try { const me = await jiraReal('GET', '/rest/api/3/myself', null, false, 'Basic ' + Buffer.from(jraw).toString('base64'), sBase); ok = !!(me && want && me.accountId === want); if (!ok) why = want ? '주인 다름' : '대조표에 Jira 계정 없음'; }
      catch (e) { why = e && e.status ? `오류 ${e.status}` : '실패'; }
      if (!ok) { env[`JIRA_USER_TOKEN_${i}`] = ''; KEY_FAILED.add(idKey(jId)); KEY_BAD.push({ person: jId, side: 'Jira', why }); dbg(`Jira 열쇠 jira${i}(${jId}) 주인 확인 실패(${why}) → 이번 실행 안 씀`); }
    }
  }
  if (KEY_BAD.length) warn(`토큰 주인 확인 실패 ${KEY_BAD.length}건 → 그 토큰은 이번 실행에서 안 씀(공용으로)`);
}

// ──────────────── HTTP (429 · 5xx 는 기다렸다 다시 — 대량 등록 대비) ────────────────
async function req(url, init, label) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, init);
    if ((r.status === 429 || r.status >= 500 || (r.status === 403 && r.headers.get('retry-after'))) && i < 4) {
      const wait = Math.min(60, Number(r.headers.get('retry-after')) || 2 ** (i + 1));
      log(`· ${label} ${r.status} → ${wait}초 뒤 다시`);
      await new Promise((s) => setTimeout(s, wait * 1000));
      continue;
    }
    return r;
  }
}
// ──────────────── 미리보기: 쓰기 대신 기록 ────────────────
// kind: new(새 이슈 · 업무 · 댓글 — 짝 전환에서 0 이어야 함) · content(내용 수정) · record(짝 기록 속성 — 화면에 안 보임) · other
const PLAN = [];
const DRY_STORE = { issueProp: new Map(), commentProp: new Map(), ghIssue: new Map(), jiraIssue: new Map(), labels: new Set() };
// 「전 → 후」 한 줄 — 글은 처음 달라지는 줄만
const short = (s, n = 50) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t || '(비어 있음)'; };
function firstDiff(a, b) {
  const A = String(a || '').replace(/\r\n/g, '\n').split('\n'), B = String(b || '').replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < Math.max(A.length, B.length); i++) if ((A[i] || '').trim() !== (B[i] || '').trim()) return `「${short(A[i])}」 → 「${short(B[i])}」`;
  return '(빈 줄 · 공백만 다름)';
}
const setDiff = (a, b) => { const A = new Set(a || []), B = new Set(b || []); return [...[...B].filter((x) => !A.has(x)).map((x) => '+' + x), ...[...A].filter((x) => !B.has(x)).map((x) => '−' + x)].join(' ') || '(순서만)'; };
function ghPatchDetail(cur, body) {
  const d = [];
  if ('title' in body) d.push(`제목 「${short(cur.title)}」 → 「${short(body.title)}」`);
  if ('body' in body) d.push(`본문 ${firstDiff(cur.body, body.body)}`);
  if ('labels' in body) d.push(`레이블 ${setDiff((cur.labels || []).map((l) => l.name), body.labels)}`);
  if ('type' in body) d.push(`유형 ${cur.type ? cur.type.name : '없음'} → ${body.type}`);
  if ('state' in body) d.push(`${body.state === 'closed' ? '닫기' : '다시 열기'}`);
  if ('assignees' in body) d.push(`담당 ${setDiff((cur.assignees || []).map((a) => a.login), body.assignees)}`);
  return d.join(' · ');
}
function jiraPutDetail(cur, fields) {
  const f = (cur && cur.fields) || {};
  const d = [];
  for (const [k, v] of Object.entries(fields || {})) {
    if (k === 'summary') d.push(`제목 「${short(f.summary)}」 → 「${short(v)}」`);
    else if (k === 'labels') d.push(`레이블 ${setDiff(f.labels, v)}`);
    else if (k === 'description') d.push(`설명 ${firstDiff(adfPlainLines(f.description), adfPlainLines(v))}`);
    else if (k === 'assignee') d.push(`담당 → ${v ? v.accountId : '없음'}`);
    else if (k === 'parent') d.push(`상위 ${f.parent ? f.parent.key : '없음'} → ${v ? v.key : '없음'}`);
    else d.push(k);
  }
  return d.join(' · ');
}
// ADF → 블록마다 한 줄(비교용)
const adfPlainLines = (adf) => ((adf && adf.content) || []).map((b) => adfText(b)).join('\n');
function planWrite(side, method, path, body, detail = '') {
  const p = String(path).replace(/^https:\/\/api\.github\.com/, '').split('?')[0];
  let kind = 'other', what = `${method} ${p}`;
  const keys = (o) => Object.keys(o || {}).join(', ');
  if (side === 'GitHub') {
    if (method === 'POST' && /\/issues$/.test(p)) { kind = 'new'; what = '새 이슈'; }
    else if (method === 'POST' && /\/issues\/\d+\/comments$/.test(p)) { kind = 'new'; what = '새 댓글'; }
    else if (method === 'PATCH' && /\/issues\/comments\/\d+$/.test(p)) { kind = 'content'; what = `댓글 ${p.split('/').pop()} 수정`; }
    else if (method === 'PATCH' && /\/issues\/\d+$/.test(p)) { kind = 'content'; what = `이슈 수정: ${keys(body)}`; }
    else if (method === 'POST' && /\/labels$/.test(p)) { what = `레이블 만들기: ${body && body.name}`; }
    else if (/issue-field-values/.test(p)) { kind = 'content'; what = '이슈 필드 값'; }
  } else if (side === 'Jira') {
    if (method === 'POST' && /\/rest\/api\/3\/issue$/.test(p)) { kind = 'new'; what = '새 업무'; }
    else if (method === 'POST' && /\/comment$/.test(p)) { kind = 'new'; what = '새 댓글'; }
    else if (method === 'PUT' && /\/comment\/\d+$/.test(p)) { kind = 'content'; what = `댓글 ${p.split('/').pop()} 수정`; }
    else if (/\/properties\//.test(p)) { kind = 'record'; what = `짝 기록 ${p.split('/').slice(-3).join('/')}`; }
    else if (method === 'PUT' && /\/issue\/[^/]+$/.test(p)) { kind = 'content'; what = `업무 수정: ${keys(body && body.fields)}`; }
    else if (/\/transitions$/.test(p)) { kind = 'content'; what = '상태 전환'; }
    else if (/\/attachments$/.test(p)) { kind = 'content'; what = '첨부 올리기'; }
    else if (/issueLink/.test(p)) { kind = 'content'; what = `연결 ${method === 'DELETE' ? '지움' : '만듦'}`; }
  } else if (side === 'Slack') { what = '알림'; }
  if (detail) what += ` (${detail})`;
  PLAN.push({ pair: `${RUN.num ? '#' + RUN.num : '-'} ↔ ${RUN.key || '-'}`, side, kind, what });
  log(`  🔎 [미리보기 — 쓰지 않음] ${side} ${what}`);
}
function dryGh(method, path, body) {
  const p = String(path).split('?')[0];
  let m;
  if (method === 'POST' && /\/labels$/.test(p)) {
    if (DRY_STORE.labels.has(body.name)) return {}; // 같은 레이블은 한 번만 센다
    DRY_STORE.labels.add(body.name);
  }
  const pm = /\/issues\/(\d+)$/.exec(p);
  planWrite('GitHub', method, path, body, pm && method === 'PATCH' ? ghPatchDetail(DRY_STORE.ghIssue.get(pm[1]) || {}, body) : '');
  if ((m = pm) && method === 'PATCH') {
    const cur = DRY_STORE.ghIssue.get(m[1]) || {};
    const next = { ...cur, ...body, __dry: true };
    if (body.labels) next.labels = body.labels.map((name) => ({ name }));
    if (body.assignees) next.assignees = body.assignees.map((login) => ({ login }));
    DRY_STORE.ghIssue.set(m[1], next);
    return next;
  }
  if ((m = /\/issues\/comments\/(\d+)$/.exec(p))) return { id: Number(m[1]), body: body && body.body, updated_at: new Date().toISOString() };
  if (/\/comments$/.test(p)) return { id: 0, body: body && body.body };
  if (/\/issues$/.test(p)) return null; // 새 이슈는 미리보기에서 만들지 않는다 — 부르는 쪽이 멈춘다
  return {};
}
function dryJira(method, path, body) {
  const p = String(path).split('?')[0];
  let m;
  const im = /^\/rest\/api\/3\/issue\/([^/]+)$/.exec(p);
  const ik = im && decodeURIComponent(im[1]);
  planWrite('Jira', method, path, body, im && method === 'PUT' ? jiraPutDetail(DRY_STORE.jiraIssue.get(ik), body && body.fields) : '');
  // 고친 것으로 친 칸을 기억해 다시 읽을 때 그 값이 보이게(같은 쓰기가 두 번 잡히지 않게)
  if (im && method === 'PUT' && body && body.fields) {
    const cur = DRY_STORE.jiraIssue.get(ik);
    if (cur) DRY_STORE.jiraIssue.set(ik, { ...cur, __dry: true, fields: { ...cur.fields, ...body.fields } });
  }
  if ((m = /\/issue\/([^/]+)\/properties\/ghsync$/.exec(p)) && method === 'PUT') DRY_STORE.issueProp.set(decodeURIComponent(m[1]), body);
  if ((m = /\/comment\/(\d+)\/properties\/([^/]+)$/.exec(p)) && method === 'PUT') {
    const o = DRY_STORE.commentProp.get(m[1]) || {};
    o[m[2]] = body;
    DRY_STORE.commentProp.set(m[1], o);
  }
  if (/\/comment$/.test(p)) return { id: '0' };
  return null;
}
// 읽기인데 POST 를 쓰는 호출(GraphQL 조회 · Jira 검색)은 미리보기에서도 그대로 부른다
const isReadPost = (side, path, body) => (side === 'GitHub' && path === '/graphql' && !/^\s*mutation/.test((body && body.query) || ''))
  || (side === 'Jira' && /^\/rest\/api\/3\/search\/jql/.test(path));

// meta(선택) = { by: 변경자, reason: 공용 이유 글자 } — 표 기록용. tok 있으면 그 사람이 쓴 것, 없으면 봇.
async function gh(method, path, body, accept = 'application/vnd.github+json', tok = null, meta = {}) {
  if (DRY && method !== 'GET' && !isReadPost('GitHub', path, body)) return dryGh(method, path, body);
  if (DRY && method === 'GET') {
    // 미리보기에서 이미 고친 것으로 친 이슈는 그 모양을 돌려준다(뒤 단계가 고친 값을 보게)
    const m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/.exec(path);
    if (m && DRY_STORE.ghIssue.has(m[1]) && DRY_STORE.ghIssue.get(m[1]).__dry) return DRY_STORE.ghIssue.get(m[1]);
  }
  const res = await ghReal(method, path, body, accept, tok);
  if (method !== 'GET' && !meta.skip) record('GitHub', method, path, body, res, meta.by || (tok ? meta.by : null), tok ? (meta.by || '알 수 없음') : 'github-actions 봇' + (meta.reason ? ' ' + meta.reason : ''));
  if (DRY && method === 'GET') {
    const m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/.exec(path);
    if (m && res && !DRY_STORE.ghIssue.has(m[1])) DRY_STORE.ghIssue.set(m[1], res);
  }
  return res;
}
async function ghReal(method, path, body, accept, tok) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const r = await req(url, {
    method,
    headers: { Authorization: ghAuth(tok), Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'issue-sync', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }, `GitHub ${method}`);
  if (!r.ok) throw Object.assign(new Error(`GitHub ${method} ${path} ${r.status}: ${(await r.text()).slice(0, 300)}`), { status: r.status });
  return r.status === 204 ? null : r.json();
}
async function jira(method, path, body, { allow404 = false, as = null, sharedBody = undefined } = {}) {
  if (DRY && method !== 'GET' && !isReadPost('Jira', path, body)) return dryJira(method, path, body);
  // 미리보기: 업무를 다시 읽으면 고친 것으로 친 칸을 덧씌운다
  const im = DRY && method === 'GET' ? /^\/rest\/api\/3\/issue\/([^/?]+)\?/.exec(path) : null;
  if (im && DRY_STORE.jiraIssue.has(decodeURIComponent(im[1])) && DRY_STORE.jiraIssue.get(decodeURIComponent(im[1])).__dry) return DRY_STORE.jiraIssue.get(decodeURIComponent(im[1]));
  // 사람 토큰(GitHub → Jira 쓰기 as=작성자 login) — 있으면 범위 지정 주소 + 그 사람 Basic. 읽기는 늘 공용.
  //   4xx(권한 없음 404 포함)면 그 쓰기만 공용으로 다시. 5xx · 끊김은 공용으로 다시 하지 않는다(두 번 쓰기 방지) — 던진다.
  //   상태는 e.status 로만 본다 — 오류 문구 속 업무 키(TEST1-450)의 숫자를 상태로 오인하지 않게.
  const pAuth = as && method !== 'GET' ? jiraUserAuth(as) : null;
  const sBase = pAuth ? JIRA_SCOPED_BASE() : null;
  let rejected = false;
  if (pAuth && sBase) {
    try { const res = await jiraReal(method, path, body, allow404, pAuth, sBase); record('Jira', method, path, body, res, as, as); return res; }
    catch (e) {
      if (!(e && e.status >= 400 && e.status < 500)) throw e; // 5xx · 끊김(상태 없음)은 다시 쓰지 않는다
      dbg(`${as} 사람 Jira 토큰 ${e.status} → 이 쓰기만 공용으로`); rejected = true;
    }
  }
  // 공용으로 쓸 때, 사람을 겨눈 쓰기(as)였으면 공용 모양 body(sharedBody — 댓글 첫 줄 「○○ 님 …」 등)를 쓴다.
  const outBody = as && sharedBody !== undefined ? sharedBody : body;
  const res = await jiraReal(method, path, outBody, allow404, jiraAuth(), JIRA_BASE);
  if (method !== 'GET') record('Jira', method, path, outBody, res, as || null, SHARED_NAME + (as ? (pAuth && !rejected ? '' : ' (공용 · ' + failWhy(as, rejected) + ')') : ''));
  if (im && res && !DRY_STORE.jiraIssue.has(decodeURIComponent(im[1]))) DRY_STORE.jiraIssue.set(decodeURIComponent(im[1]), res);
  return res;
}
async function jiraReal(method, path, body, allow404, auth, base) {
  const r = await req(`${base || JIRA_BASE}${path}`, {
    method,
    // Accept-Language ko-KR — 공용 열쇠가 익명 처리돼도 오류 문구가 한국어로 오게(사용자가 중국어 원문을 봄)
    headers: { Authorization: auth || jiraAuth(), Accept: 'application/json', 'Accept-Language': 'ko-KR', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }, `Jira ${method}`);
  if (allow404 && r.status === 404) return null;
  if (!r.ok) throw Object.assign(new Error(`Jira ${method} ${path.split('?')[0]} ${r.status}: ${(await r.text()).slice(0, 400)}`), { status: r.status });
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const FULL = 'application/vnd.github.full+json'; // body_html(서명된 이미지 주소)도 함께

// ──────────────── 표식 ────────────────
const RE_MARK = /<!--\s*jira:([A-Za-z][A-Za-z0-9]*-\d+)\s*-->/;
const RE_MARK_G = /\n*<!--\s*jira:[A-Za-z][A-Za-z0-9]*-\d+\s*-->/g;
const RE_BLOCK = /\n*<!-- jira-fields:start -->[\s\S]*?<!-- jira-fields:end -->/;
const RE_NOTE = /\n*<!-- jira-note:start -->[\s\S]*?<!-- jira-note:end -->/;
const RE_CMARK = /<!--\s*jira-comment:(\d+)\s*-->/;
// v1 이 Jira 댓글을 GitHub 에 옮기며 단 표시 — 「<!-- sync:jira -->」(번호 없음) · 「<!-- sync:jira:<Jira 댓글 번호> -->」
const RE_V1CMARK = /<!--\s*sync:jira(?::(\d+))?\s*-->/;
const RE_V1CMARK_G = /\n*<!--\s*sync:jira(?::\d+)?\s*-->/g;
const RE_TITLE = /^\[JIRA\s+([A-Za-z][A-Za-z0-9]*-\d+)\]\s*/;
// GitHub 원본의 Jira 사본: 요약 앞 「[GH #번호] 」 + 레이블 github (v1 과 같음)
const RE_GH_TITLE = /^\[GH\s+#\d+\]\s*/;
const GH_MARK_LABEL = 'github';
// v1 과 같은 짝 레이블 「gh-<저장소 이름>-<번호>」 — Jira 에서 어느 GitHub 이슈인지 찾는 데 쓴다. 동기화 표시라 비교에서 뺀다.
const GH_REPO_NAME = String(GH_REPO || 'x/repo').split('/')[1];
const ghPairLabel = (num) => `gh-${GH_REPO_NAME}-${num}`;
const isGhPairLabel = (l) => String(l).startsWith(`gh-${GH_REPO_NAME}-`) && /^\d+$/.test(String(l).slice(`gh-${GH_REPO_NAME}-`.length));
const norm = (s) => String(s || '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
const titleKey = (t) => { const m = RE_TITLE.exec(t || ''); return m ? m[1] : null; };
const markKey = (b) => { const m = RE_MARK.exec(b || ''); return m ? m[1] : null; };
// GitHub 본문 = 맨 위 사람 줄(「등록: 이름(Jira)」 · 「담당: 이름(Jira)」) + 사람이 쓴 부분 + (Jira 서식 손실 안내) + 짝 표식
// (옛 「Jira 필드」 표는 읽지 않고 떼어 낸다 — 필드는 오른쪽 이슈 필드로 옮겼다)
// 쓸 때는 동기화 시뮬레이터 모양 「🙋 담당: **이름** (Jira)」, 읽을 때는 사람이 손으로 쓴 모양도 받는다 —
//   「담당 : 이름(jira)」 · 「담당자: 이름 (JIRA)」 · 전각 「：」 「（jira）」 · 굵게 없음. 「(jira)」 를 빼도 이름이 대조표 jiraOnly 에 있으면 받는다.
const RE_HEADLINE = /^(?:🙋[ \t]*)?(등록|담당)자?[ \t]*[:：][ \t]*(?:\*\*([^*\n]+)\*\*|([^\n]*?))[ \t]*([(（][ \t]*jira[ \t]*[)）])?[ \t]*(?:\n+|$)/iu;
const personLine = (kind, name) => `🙋 ${kind}: **${String(name).trim()}** (Jira)`;
function ghParts(body) {
  let b = String(body || '').replace(/\r\n/g, '\n');
  let asgName = null;
  for (let m; (m = RE_HEADLINE.exec(b.replace(/^\s+/, ''))); ) {
    const name = String(m[2] || m[3] || '').trim();
    const known = jiraOnlyKey(name);
    if (!name || (!m[4] && !known)) break; // 「(jira)」 도 없고 대조표 이름도 아니면 사람이 쓴 보통 글
    if (m[1] === '담당') asgName = known || name;
    b = b.replace(/^\s+/, '').slice(m[0].length);
  }
  const note = (RE_NOTE.exec(b) || [''])[0].trim();
  const user = b.replace(RE_BLOCK, '').replace(RE_NOTE, '').replace(RE_SOURCE_GH, '').replace(RE_MARK_G, '').replace(/\s+$/, '');
  return { user, note, asgName };
}
function buildGhBody(head, user, note, key, source = '') {
  return [head.join('\n\n'), user.replace(/\s+$/, '') || '_(빈 설명)_', note, source, `<!-- jira:${key} -->`].filter(Boolean).join('\n\n');
}
// 「### 출처」 칸(v1 과 같음) — 사본에만, 원본을 가리킨다. 동기화 표시라 본문 비교 · 반대쪽 전송에서 뺀다.
//   Jira 원본의 GitHub 사본: 「Jira : [키 · 요약](주소)」 / GitHub 원본의 Jira 사본: 「GitHub : [Issue #번호 · 제목](주소)」
const RE_SOURCE_GH = /\n*###[ \t]*출처[ \t]*\n+Jira : [^\n]*/;
const ghSourceMd = (key, title) => `### 출처\n\nJira : [${key} · ${title}](${JIRA_BASE}/browse/${key})`;
const adfText = (n) => (n && n.text) || ((n && n.content) || []).map(adfText).join('');
function stripJiraSource(content) {
  const c = [...(content || [])];
  while (c.length && c[c.length - 1].type === 'paragraph' && !adfText(c[c.length - 1]).trim()) c.pop();
  const n = c.length;
  if (n >= 2 && c[n - 2].type === 'heading' && adfText(c[n - 2]).trim() === '출처' && /^GitHub\s*:/.test(adfText(c[n - 1]).trim())) return c.slice(0, n - 2);
  return content || [];
}
function ghSourceNodes(num, title) {
  return [
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '출처' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'GitHub : ' }, { type: 'text', text: `Issue #${num} · ${title}`, marks: [{ type: 'link', attrs: { href: `https://github.com/${GH_REPO}/issues/${num}` } }] }] },
  ];
}
function withGhSource(adf, num, title) {
  const doc = JSON.parse(JSON.stringify(adf || { type: 'doc', version: 1, content: [] }));
  doc.content = [...stripJiraSource(doc.content), ...ghSourceNodes(num, title)];
  return doc;
}
function hasGhSource(adf, num, title) {
  const c = (adf && adf.content) || [];
  if (stripJiraSource(c).length !== c.length - 2) return false;
  const p = c[c.length - 1];
  const ln = ((p.content || []).find((t) => (t.marks || []).some((m) => m.type === 'link')) || {});
  const href = ((ln.marks || []).find((m) => m.type === 'link') || { attrs: {} }).attrs.href;
  return ln.text === `Issue #${num} · ${title}` && href === `https://github.com/${GH_REPO}/issues/${num}`;
}
// 「### 상위 에픽 키」 칸(이슈 양식) — 없으면 null, 키가 없으면 key ''
const RE_EPIC = /^###[ \t]*상위 에픽 키[ \t]*\n([\s\S]*?)(?=^###[ \t]|^<!-- |(?![\s\S]))/m;
function epicOf(md) {
  const m = RE_EPIC.exec(String(md || ''));
  if (!m) return null;
  const raw = (m[1].split('\n').find((l) => l.trim()) || '').trim();
  const k = /\b([A-Za-z][A-Za-z0-9]*-\d+)\b/.exec(raw);
  return { raw, key: k ? k[1].toUpperCase() : '' };
}
// 칸 값은 v1 과 같이 링크 「[키 · 에픽 요약](주소)」 — 요약을 못 읽으면 키만
function setEpic(md, key, summary) {
  const v = key ? (summary ? `[${key} · ${summary}](${JIRA_BASE}/browse/${key})` : key) : '_No response_';
  return String(md).replace(RE_EPIC, (all) => all.replace(/\n[\s\S]*$/, `\n\n${v}\n\n`));
}
// 이미 링크 모양인가(요약 글자는 따지지 않는다 — 변환 차이로 매번 다시 쓰지 않게)
const isEpicLink = (raw, k) => new RegExp(`^\\[${k}\\b[^\\]]*\\]\\(<?https?://[^)\\s]*/browse/${k}>?\\)$`).test(String(raw || '').trim());
// 정규화 ADF 해시(localId 등 Jira 가 붙이는 값 제외)
function adfHash(adf) {
  const strip = (x) => Array.isArray(x) ? x.map(strip) : (x && typeof x === 'object')
    ? Object.fromEntries(Object.keys(x).sort().filter((k) => k !== 'localId').map((k) => [k, strip(x[k])])) : x;
  return sha(JSON.stringify(strip(adf || null)));
}

// ──────────────── 필드 값 ────────────────
function fmtJira(id, v, schema) {
  if (v == null) return '';
  if (id === 'status') return v.name || '';
  if (id === 'parent') return v.key || '';
  const t = schema && schema.type;
  if (t === 'user') return loginOf(v.accountId) || v.displayName || '';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : x.value || x.name || x.key || '')).join(', ');
  if (typeof v === 'object') return v.value || v.name || v.key || v.displayName || '';
  return String(v);
}
function toJira(id, s, schema) {
  if (s === '' || s == null) return null;
  const t = schema && schema.type;
  if (id === 'parent') return { key: s };
  if (t === 'priority') return { name: s };
  if (t === 'option') return { value: s };
  if (t === 'number') return Number(s);
  if (t === 'user') { const a = acctOf(s); return a ? { accountId: a } : undefined; }
  if (t === 'array') { const p = s.split(',').map((x) => x.trim()).filter(Boolean); return schema.items === 'option' ? p.map((value) => ({ value })) : p; }
  return s; // date · string
}

// ──────────────── Jira 읽기 ────────────────
function spaceOf(key) {
  const pk = String(key).split('-')[0];
  const s = SPACES[pk];
  if (!s) die(`spaces.json 에 스페이스 ${pk} 설정이 없다`);
  return { ...s, projectKey: pk };
}
// GitHub 에서 새로 등록할 스페이스 — Variable JIRA_PROJECT_KEY, 없으면 spaces.json 에 스페이스가 하나뿐일 때 그것
function createSpaceKey() {
  if (env.JIRA_PROJECT_KEY) return env.JIRA_PROJECT_KEY;
  const keys = Object.keys(SPACES).filter((k) => !k.startsWith('_'));
  if (keys.length === 1) return keys[0];
  return die(`Variable JIRA_PROJECT_KEY 가 없다 — spaces.json 의 스페이스(${keys.join(' · ') || '없음'}) 중 GitHub 에서 등록할 곳을 정한다`);
}
async function jiraIssue(key, space) {
  const ids = space.fields.map((f) => f.id);
  const fields = ['summary', 'description', 'labels', 'assignee', 'reporter', 'resolution', 'issuetype', 'status', 'parent', 'issuelinks', 'attachment', 'updated', 'created', ...ids].join(',');
  return jira('GET', `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields}&expand=renderedFields,schema`);
}
async function jiraProp(key) {
  if (DRY && DRY_STORE.issueProp.has(key)) return DRY_STORE.issueProp.get(key);
  const p = await jira('GET', `/rest/api/3/issue/${encodeURIComponent(key)}/properties/ghsync`, null, { allow404: true });
  return p && p.value ? p.value : null;
}
const _statusCat = new Map();
async function statusCategory(space, name) {
  if (!_statusCat.size) {
    const list = await jira('GET', `/rest/api/3/project/${space.projectKey}/statuses`);
    for (const it of list || []) for (const s of it.statuses || []) _statusCat.set(s.name, s.statusCategory && s.statusCategory.key);
  }
  return _statusCat.get(name) || null;
}
function jiraCommon(data, space) {
  const f = data.fields || {};
  const typeName = Object.entries(space.types).find(([, id]) => String(id) === String(f.issuetype && f.issuetype.id));
  // 사람: GitHub 계정이 있으면 로그인, 없으면 「jira:이름」(대조표 jiraOnly 이름 우선)
  const who = (u) => (u ? (loginOf(u.accountId) || `jira:${jiraOnlyName(u.accountId) || u.displayName}`) : null);
  return {
    // 「[GH #n] 」(GitHub 원본의 Jira 사본 표시) · 레이블 github 는 동기화 표시라 내용으로 보지 않는다(v1 과 같음)
    title: (f.summary || '').replace(RE_GH_TITLE, ''),
    labels: [...(f.labels || [])].filter((l) => l !== GH_MARK_LABEL && !isGhPairLabel(l)).sort(),
    type: typeName ? typeName[0] : null,
    assignee: who(f.assignee),
    reporter: who(f.reporter),
    resolution: f.resolution ? f.resolution.name : null,
    fields: {
      status: f.status ? f.status.name : '',
      parent: f.parent ? f.parent.key : '',
      ...Object.fromEntries(space.fields.map((x) => [x.id, fmtJira(x.id, f[x.id], data.schema && data.schema[x.id])])),
    },
  };
}
// ──────────────── 닫는 이유(completed · not planned · duplicate) ────────────────
// 스페이스마다 상태 · 해결 사유가 달라 spaces.json closeReason 으로 정한다(옛 notPlannedResolutions 도 읽는다).
//   notPlannedStatuses — 「계획 안 함」 을 나타내는 완료 분류 상태 · duplicateStatuses — 「중복」 을 나타내는 완료 분류 상태
//   (팀 관리형 스페이스는 해결 사유를 고를 수 없어 상태로 나타낸다. 원래 업무는 중복 링크로 가리킨다)
// 비어 있으면 늘 completed — 지금까지와 같다. duplicateStatuses 가 비면 중복도 notPlannedStatuses 로 간다.
function closeCfg(space) {
  const c = space.closeReason || {};
  return {
    npStatuses: c.notPlannedStatuses || [],
    dupStatuses: c.duplicateStatuses || [],
    npRes: c.notPlannedResolutions || space.notPlannedResolutions || [],
    dupRes: c.duplicateResolutions || ['Duplicate', '복제'],
    dupLink: c.duplicateLink || 'Duplicate',
  };
}
// 이 업무가 「duplicates」(바깥 방향)로 가리키는 원래 업무
function jiraDupOf(data, cfg) {
  for (const l of (data.fields && data.fields.issuelinks) || []) {
    if (l.type && l.type.name === cfg.dupLink && l.outwardIssue) return { key: l.outwardIssue.key, linkId: l.id };
  }
  return null;
}
// Jira 업무 키 → 짝 GitHub 이슈(없으면 null)
async function ghOfJira(k) {
  const p = await jiraProp(k);
  if (p && p.gh) {
    const it = await gh('GET', `/repos/${GH_REPO}/issues/${p.gh}`).catch(() => null);
    if (it && (titleKey(it.title) === k || markKey(it.body) === k)) return it;
  }
  return ghFindByJiraKey(k);
}
// GitHub 「Close as duplicate」 의 원래 이슈 번호 — REST 에는 없고 GraphQL issue.duplicateOf 에만 있다(같은 저장소만)
async function ghDuplicateOf(num) {
  const [o, r] = GH_REPO.split('/');
  try {
    const d = await gh('POST', '/graphql', { query: 'query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){duplicateOf{number repository{nameWithOwner}}}}}', variables: { o, r, n: Number(num) } });
    const x = d && d.data && d.data.repository && d.data.repository.issue && d.data.repository.issue.duplicateOf;
    if (!x) return null;
    return x.repository && x.repository.nameWithOwner.toLowerCase() === GH_REPO.toLowerCase() ? x.number : { other: `${x.repository.nameWithOwner}#${x.number}` };
  } catch (e) { warn(`중복 원래 이슈 읽기 실패: ${e.message.slice(0, 200)}`); return null; }
}
// Jira 가 닫혔을 때 GitHub 닫는 이유:
//   ① 중복 링크(원래 업무에 GitHub 짝) → duplicate(원래 이슈 지정)
//   ② 상태가 duplicateStatuses → duplicate(원래 이슈를 모르면 지정 없이 — GitHub 이 거절하면 not planned 로)
//   ③ 해결 · 상태가 「계획 안 함」 → not planned ④ 그 밖 completed
async function jiraCloseReason(data, J2, space) {
  const cfg = closeCfg(space);
  const dupStatus = cfg.dupStatuses.includes(J2.fields.status);
  const d = jiraDupOf(data, cfg);
  if (d) {
    const it = await ghOfJira(d.key);
    if (it) return { r: 'duplicate', of: it.number, id: it.id, via: `중복 링크 → ${d.key}` };
    if (dupStatus) return { r: 'duplicate', via: `상태 ${J2.fields.status} · 중복 링크 → ${d.key}(GitHub 짝 없음)` };
    return { r: 'not_planned', via: `중복 링크 → ${d.key}(GitHub 짝 없음)` };
  }
  if (dupStatus) return { r: 'duplicate', via: `상태 ${J2.fields.status}(중복 링크 없음)` };
  if (J2.resolution && cfg.dupRes.includes(J2.resolution)) return { r: 'not_planned', via: `해결 ${J2.resolution}(중복 링크 없음)` };
  if (J2.resolution && cfg.npRes.includes(J2.resolution)) return { r: 'not_planned', via: `해결 ${J2.resolution}` };
  if (cfg.npStatuses.includes(J2.fields.status)) return { r: 'not_planned', via: `상태 ${J2.fields.status}` };
  return { r: 'completed', via: `상태 ${J2.fields.status}${J2.resolution ? ' · 해결 ' + J2.resolution : ''}` };
}
// 중복 링크 만들기 — 「key duplicates orig」. 만든 뒤 방향을 읽어 확인하고, 거꾸로면 지우고 반대로 다시 만든다.
async function makeDupLink(key, orig, cfg) {
  const find = async () => {
    const d = await jira('GET', `/rest/api/3/issue/${encodeURIComponent(key)}?fields=issuelinks`);
    return (d.fields.issuelinks || []).find((l) => l.type && l.type.name === cfg.dupLink && ((l.outwardIssue && l.outwardIssue.key === orig) || (l.inwardIssue && l.inwardIssue.key === orig)));
  };
  let l = await find();
  if (l && l.outwardIssue) return { id: l.id, made: false };
  if (l) await jira('DELETE', `/rest/api/3/issueLink/${l.id}`);
  await jira('POST', '/rest/api/3/issueLink', { type: { name: cfg.dupLink }, inwardIssue: { key: orig }, outwardIssue: { key } });
  l = await find();
  if (l && !l.outwardIssue) {
    await jira('DELETE', `/rest/api/3/issueLink/${l.id}`);
    await jira('POST', '/rest/api/3/issueLink', { type: { name: cfg.dupLink }, inwardIssue: { key }, outwardIssue: { key: orig } });
    l = await find();
  }
  return l && l.outwardIssue ? { id: l.id, made: true } : null;
}

// 상위 에픽 키 검사 — 이 스페이스 키 모양 · 있는 업무 · 에픽(상위 수준 1)
async function epicCheck(space, k) {
  if (!new RegExp(`^${space.projectKey}-\\d+$`).test(k || '')) return { ok: false, why: `${space.projectKey} 스페이스 키 모양(예 ${space.projectKey}-8)이 아닙니다` };
  const d = await jira('GET', `/rest/api/3/issue/${encodeURIComponent(k)}?fields=issuetype`, null, { allow404: true });
  if (!d) return { ok: false, why: '없는 업무입니다' };
  if (!d.fields.issuetype || d.fields.issuetype.hierarchyLevel !== 1) return { ok: false, why: '에픽(상위 수준)이 아닙니다' };
  return { ok: true };
}
async function epicSummary(k) {
  try { const d = await jira('GET', `/rest/api/3/issue/${encodeURIComponent(k)}?fields=summary`, null, { allow404: true }); return d && d.fields ? d.fields.summary || '' : ''; }
  catch (e) { warn(`상위 에픽 요약 읽기 실패: ${e.message.slice(0, 120)}`); return ''; }
}

// ──────────────── GitHub 오른쪽 이슈 필드(조직 필드) ────────────────
// 짝 = spaces.json fields 의 Jira 필드마다 조직 필드를 이름 · 형식으로 자동으로 찾는다(필드에 gh 를 적으면 그 이름).
// 형식이 안 맞거나 같은 이름이 없으면 짝 없음 → GitHub 에 보이지 않는다.
const AUTO_PAIR = { duedate: ['Target date', 'Due date'], priority: ['Priority'] };
const TYPE_OK = { date: ['date'], priority: ['single_select'], option: ['single_select'], string: ['text'], number: ['number'], array: ['multi_select'] };
const NEAR = { priority: { Highest: 'Urgent', Lowest: 'Low' } }; // 단계 수가 다를 때 가까운 값
// 조직 필드 목록 — Actions 기본 토큰(GITHUB_TOKEN)은 조직 API 를 못 읽는다(403).
// 순서: GITHUB_TOKEN → SYNC_BOT_TOKEN(조직 읽기 권한 있는 토큰) → spaces.json 의 _ghFields(설치 때 collect-fields 로 모은 것)
const slimField = (o) => ({ id: o.id, name: o.name, data_type: o.data_type, ...(o.options ? { options: o.options.map((x) => ({ id: x.id, name: x.name })) } : {}) });
let _orgFields = null;
async function orgFields() {
  if (_orgFields) return _orgFields;
  const path = `/orgs/${GH_REPO.split('/')[0]}/issue-fields`;
  for (const [name, tok] of [['GITHUB_TOKEN', env.GITHUB_TOKEN], ['SYNC_BOT_TOKEN', env.SYNC_BOT_TOKEN]]) {
    if (!tok) continue;
    try { _orgFields = (await gh('GET', path, null, undefined, tok)).map(slimField); log(`· 조직 이슈 필드 ${_orgFields.length}개(${name} 로 읽음)`); break; }
    catch (e) { log(`· ${name} 로 조직 이슈 필드 못 읽음(${(/ (\d{3}):/.exec(e.message) || [])[1] || e.message.slice(0, 80)})`); }
  }
  const cached = SPACES._ghFields || null;
  if (_orgFields && cached && !eq(_orgFields, cached)) warn('조직 이슈 필드가 spaces.json 의 수집본과 다릅니다 — collect-fields 를 다시 돌려 짝을 확인하세요');
  if (!_orgFields && cached) { _orgFields = cached; log(`· 조직 이슈 필드 ${cached.length}개(spaces.json 수집본)`); }
  if (!_orgFields) { warn('GitHub 조직 이슈 필드를 못 읽고 수집본도 없음 → 필드 동기화 건너뜀(collect-fields 를 돌리거나 SYNC_BOT_TOKEN 을 넣으세요)'); _orgFields = []; }
  return _orgFields;
}
let _pairs = null;
async function fieldPairs(space, data) {
  if (_pairs) return _pairs;
  const ofs = await orgFields();
  let meta = {};
  try { meta = ((await jira('GET', `/rest/api/3/issue/${encodeURIComponent(data.key)}/editmeta`)) || {}).fields || {}; } catch (e) { warn(`Jira editmeta 실패: ${e.message}`); }
  _pairs = [];
  const none = [];
  for (const f of space.fields) {
    const sch = data.schema && data.schema[f.id];
    const names = f.gh ? [f.gh] : (AUTO_PAIR[f.id] || (f.id === space.startDateField ? ['Start date'] : [f.label]));
    const gf = ofs.find((o) => names.some((n) => n.toLowerCase() === o.name.toLowerCase()));
    if (!gf || !sch || !(TYPE_OK[sch.type] || []).includes(gf.data_type)) { none.push(f.label); continue; }
    const av = meta[f.id] && meta[f.id].allowedValues;
    const allowed = av ? av.map((v) => v.name || v.value).filter(Boolean) : null;
    _pairs.push({ id: f.id, label: f.label, gf, near: { ...(NEAR[f.id] || {}), ...(f.values || {}) }, allowed });
  }
  const used = new Set(_pairs.map((p) => p.gf.id));
  log(`· 필드 짝: ${_pairs.map((p) => `${p.label}↔${p.gf.name}`).join(', ') || '없음'}`
    + (none.length ? ` · Jira 에만(안 보임): ${none.join(', ')}` : '')
    + (ofs.some((o) => !used.has(o.id)) ? ` · GitHub 에만(안 보냄): ${ofs.filter((o) => !used.has(o.id)).map((o) => o.name).join(', ')}` : ''));
  return _pairs;
}
const ci = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
// Jira 값 -> GitHub 값(null = 비움, undefined = 대응 없음)
function jiraToGhVal(p, jv) {
  if (jv == null || jv === '') return null;
  if (p.gf.data_type === 'single_select') {
    const n = p.near[jv] || jv;
    const o = (p.gf.options || []).find((x) => ci(x.name, n));
    return o ? o.name : undefined;
  }
  return String(jv);
}
// GitHub 값 -> Jira 값(같은 이름 우선, 없으면 가까운 값 표를 거꾸로)
function ghToJiraVal(p, gv) {
  if (gv == null || gv === '') return null;
  if (p.gf.data_type === 'single_select') {
    if (!p.allowed) return String(gv);
    const same = p.allowed.find((a) => ci(a, gv));
    if (same) return same;
    const back = Object.keys(p.near).find((k) => ci(p.near[k], gv) && p.allowed.some((a) => ci(a, k)));
    return back || undefined;
  }
  return String(gv);
}
// GitHub 이슈 유형마다 화면에 보이는 필드(pinned) — 조직 필드라도 그 유형에 안 보이는 칸은 읽지도 쓰지도 않는다.
// 순서: GraphQL(GITHUB_TOKEN → SYNC_BOT_TOKEN) → spaces.json _ghPinned(collect-fields 수집본). 못 읽으면 거르지 않는다.
const PIN_FRAG = '__typename ...on IssueFieldSingleSelect{name} ...on IssueFieldDate{name} ...on IssueFieldText{name} ...on IssueFieldNumber{name}';
let _pinned;
async function ghPinned() {
  if (_pinned !== undefined) return _pinned;
  const [o, r] = String(GH_REPO).split('/');
  const query = `query($o:String!,$r:String!){organization(login:$o){issueTypes(first:50){nodes{name pinnedFields{${PIN_FRAG}}}}} repository(owner:$o,name:$r){pinnedIssueFields(first:50){nodes{${PIN_FRAG}}}}}`;
  for (const [name, tok] of [['GITHUB_TOKEN', env.GITHUB_TOKEN], ['SYNC_BOT_TOKEN', env.SYNC_BOT_TOKEN]]) {
    if (!tok) continue;
    try {
      const d = await gh('POST', '/graphql', { query, variables: { o, r } }, undefined, tok);
      const org = d && d.data && d.data.organization;
      if (org && org.issueTypes) {
        _pinned = {
          types: Object.fromEntries(org.issueTypes.nodes.map((n) => [n.name, (n.pinnedFields || []).map((f) => f.name).filter(Boolean)])),
          none: (((d.data.repository || {}).pinnedIssueFields || {}).nodes || []).map((f) => f.name).filter(Boolean),
        };
        log(`· GitHub 유형별 보이는 필드(${name} 로 읽음)`);
        return _pinned;
      }
    } catch (e) { log(`· ${name} 로 보이는 필드 못 읽음(${(/ (\d{3}):/.exec(e.message) || [])[1] || e.message.slice(0, 80)})`); }
  }
  _pinned = SPACES._ghPinned || null;
  if (_pinned) log('· GitHub 유형별 보이는 필드(spaces.json 수집본)');
  return _pinned;
}
// 이 GitHub 이슈(유형)에 그 필드가 보이나 — 알 수 없으면 보인다고 본다
const ghFieldVisible = (pinned, typeName, fieldName) => {
  if (!pinned) return true;
  const list = typeName ? pinned.types[typeName] : pinned.none;
  return !!list && list.some((n) => n.toLowerCase() === String(fieldName).toLowerCase());
};
async function ghFieldValues(num) {
  const out = {};
  try {
    for (const v of await gh('GET', `/repos/${GH_REPO}/issues/${num}/issue-field-values`)) out[v.issue_field_id] = v.single_select_option ? v.single_select_option.name : v.value;
  } catch (e) { warn(`GitHub 이슈 필드 읽기 실패: ${e.message}`); }
  return out;
}
async function setGhField(num, fid, v) {
  if (v == null) {
    try { await gh('DELETE', `/repos/${GH_REPO}/issues/${num}/issue-field-values/${fid}`); } catch (e) { if (!/ 404:/.test(e.message)) throw e; }
  } else await gh('POST', `/repos/${GH_REPO}/issues/${num}/issue-field-values`, { issue_field_values: [{ field_id: fid, value: v }] });
}

// ──────────────── 첨부 · 이미지 ────────────────
// Jira 첨부 id -> media 파일 id(ADF media 노드가 쓰는 값). 내려받기 주소의 이동(303) 위치에 들어 있다.
const _mediaId = new Map();
async function jiraMediaId(attId) {
  if (DRY && String(attId) === '0') return null; // 미리보기에서 올린 것으로 친 첨부
  if (_mediaId.has(attId)) return _mediaId.get(attId);
  const r = await fetch(`${JIRA_BASE}/rest/api/3/attachment/content/${attId}`, { headers: { Authorization: jiraAuth() }, redirect: 'manual' });
  const loc = r.headers.get('location') || '';
  const m = /\/file\/([0-9a-f-]{36})\//i.exec(loc);
  const id = m ? m[1] : null;
  _mediaId.set(attId, id);
  return id;
}
async function jiraUpload(key, filename, buf, mime) {
  if (DRY) { planWrite('Jira', 'POST', `/rest/api/3/issue/${key}/attachments`); return { id: '0', filename, mimeType: mime || 'application/octet-stream', size: buf.length }; }
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime || 'application/octet-stream' }), filename);
  const r = await req(`${JIRA_BASE}/rest/api/3/issue/${encodeURIComponent(key)}/attachments`, {
    method: 'POST', headers: { Authorization: jiraAuth(), 'X-Atlassian-Token': 'no-check' }, body: fd,
  }, 'Jira 첨부 올리기');
  if (!r.ok) throw new Error(`Jira 첨부 올리기 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json())[0];
}
// Jira 첨부는 GitHub 에 옮기지 않는다 — 레포 · GitHub 첨부 공간 어디에도 올리지 않고
// GitHub 글의 같은 자리에 Jira 첨부 주소 링크만 둔다. 로그인 없이는 403(외부 노출 없음) · Jira 로그인한 사람은 원래 이름으로 받는다.
const jiraAttUrl = (id) => `${JIRA_BASE}/rest/api/3/attachment/content/${id}`;
const RE_JIRA_ATT = new RegExp('^' + (JIRA_BASE || 'https://x.invalid').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '/rest/api/3/attachment/content/(\\d+)');
// GitHub 글의 그림 자리 한 줄: 「🖼️ [이름](Jira 첨부 주소) · 크기」 — 돌아갈 때 그 자리의 Jira 그림으로 되돌린다
const RE_JIRA_IMG_LINE = new RegExp('^🖼️ \\[([^\\]\\n]*)\\]\\((' + RE_JIRA_ATT.source.slice(1) + ')\\)(?: · [^\\n]*)?[ \\t]*$', 'gmu');
const RE_GH_ASSET = /^https:\/\/github\.com\/user-attachments\/assets\/([0-9a-f-]{36})/i;
const RE_GH_FILE = /^https:\/\/github\.com\/user-attachments\/files\/(\d+)\/([^?#)\s]+)/i;
const RE_REPO_RAW = new RegExp('^https://github\\.com/' + (GH_REPO || 'x/x').replace(/[/.]/g, '\\$&') + '/raw/([^/]+)/([^?#)\\s]+)');

// 이어진 「📎 [이름](주소)」 줄들 → GitHub 첨부 표(본문 · 댓글 같은 모양). 돌아올 때 md-adf 가 표를 Jira 카드 묶음으로 읽는다.
const FILE_ICON = [[/\.(xlsx|xlsm|xls|csv|ods|cell)$/i, '📊'], [/\.(pptx|ppt|odp|show)$/i, '📽️'], [/\.(zip|7z|gz|tgz|rar)$/i, '🗜️'], [/\.(mp4|mov|webm|mp3|wav)$/i, '🎞️']];
const fileIcon = (n) => (FILE_ICON.find(([re]) => re.test(n)) || [, '📄'])[1];
const sizeText = (b) => (b == null ? '' : b < 1048576 ? `${Math.max(0.1, b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);
function attachTable(md, sizes) {
  const RE_ROW = /^📎 \[([^\]\n]+)\]\(([^)\s]+)\)[ \t]*$/;
  const lines = md.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; ) {
    if (!RE_ROW.test(lines[i])) { out.push(lines[i]); i++; continue; }
    const rows = [];
    while (i < lines.length && (RE_ROW.test(lines[i]) || (lines[i].trim() === '' && RE_ROW.test(lines[i + 1] || '')))) {
      const m = RE_ROW.exec(lines[i]);
      if (m) rows.push(`| ${fileIcon(m[1])} | [${m[1].replace(/\|/g, '\\|')}](${m[2]}) | ${sizeText(sizes.get(m[2]))} |`);
      i++;
    }
    out.push(`| | 첨부 파일 | 크기 |`, `|:-:|---|--:|`, ...rows);
  }
  return out.join('\n');
}

// 형광 + 글자색: 레포에 그림을 보관하지 않는다. md-adf 가 낸 뱃지 주소(img.shields.io)를 그대로 쓴다 —
// 바탕은 Jira 형광 색, 그 안 글자는 뱃지 서비스가 흰색 · 검은색으로 정한다. Jira 글자색은 주소의 _tc 에 남아 Jira 로 돌아갈 때 되살린다.

// GitHub 웹에서 올린 파일은 「[이름](https://github.com/user-attachments/files/…)」 한 줄로 들어간다 → 우리 첨부 표로.
// 그 줄만 바꾸고 다른 글은 건드리지 않는다 · 코드 블록 안은 그대로 · 바로 위가 첨부 표면 그 표에 줄을 붙인다.
const RE_GH_FILE_LINE = /^\[([^\]\n]+)\]\((https:\/\/github\.com\/user-attachments\/files\/\d+\/[^)\s]+)\)[ \t]*$/;
const ATTACH_HEAD = ['| | 첨부 파일 | 크기 |', '|:-:|---|--:|'];
function ghFileLinesToTable(md, sizes) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let fence = false;
  const isAttachRow = (l) => /^\| \S+ \| \[[^\]]*\]\([^)]*\) \| [^|]* \|$/.test(l || '');
  for (let i = 0; i < lines.length; ) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence || !RE_GH_FILE_LINE.test(l)) { out.push(l); i++; continue; }
    const rows = [];
    while (i < lines.length && (RE_GH_FILE_LINE.test(lines[i]) || (lines[i].trim() === '' && RE_GH_FILE_LINE.test(lines[i + 1] || '')))) {
      const m = RE_GH_FILE_LINE.exec(lines[i]);
      if (m) rows.push(`| ${fileIcon(m[1])} | [${m[1].replace(/\|/g, '\\|')}](${m[2]}) | ${sizeText(sizes.get(m[2]))} |`);
      i++;
    }
    // 바로 위(빈 줄 건너)가 첨부 표 줄이면 그 표에 붙인다
    let k = out.length - 1;
    while (k >= 0 && out[k].trim() === '') k--;
    if (k >= 0 && isAttachRow(out[k])) { out.length = k + 1; out.push(...rows); }
    else out.push(...ATTACH_HEAD, ...rows);
  }
  return out.join('\n');
}

// Jira ADF(설명 · 댓글) → GitHub 마크다운. 첨부는 media id 로 정확히 짝지어 레포 raw 주소로(GitHub 에서 온 첨부는 원래 주소로).
async function jiraToMd(adf, key, ctx) {
  const { adfToMd } = await import('./md-adf.mjs');
  const { markdown, lossy, lossyTypes, fileMedia, attachPrefix } = adfToMd(adf || { content: [] }, { mentionMap: MENTION });
  let md = markdown;
  const fileSize = new Map(); // 옮긴 파일 주소 → 크기(첨부 표의 「크기」 칸)
  if (fileMedia.length) {
    const byMedia = new Map();
    for (const a of ctx.attachments) { const mid = await jiraMediaId(a.id); if (mid) byMedia.set(mid, a); }
    for (let i = 0; i < fileMedia.length; i++) {
      const att = byMedia.get(fileMedia[i].id);
      let rep;
      try {
        if (!att) throw new Error('첨부를 못 찾음');
        const isImg = /^image\//.test(att.mimeType || '');
        const ga = /^gh-([0-9a-f-]{36})/i.exec(att.filename || '');
        const gf = /^ghf-(\d+)-(.+)$/.exec(att.filename || '');
        const fm = Object.values(ctx.files || {}).find((v) => String(v.a) === String(att.id));
        let url;
        if (fm) url = fm.u;
        else if (ga) url = `https://github.com/user-attachments/assets/${ga[1]}`;
        else if (gf) url = `https://github.com/user-attachments/files/${gf[1]}/${gf[2]}`;
        // Jira 에서 올린 그림 · 파일 → 옮기지 않고 Jira 첨부 주소 링크(그림은 「🖼️ 이름 · 크기」 한 줄, 파일은 첨부 표)
        const fromJira = !url;
        if (fromJira) url = jiraAttUrl(att.id);
        // 이름의 괄호 「(1)」 · 공백이 주소에 그대로 있으면 마크다운 링크가 「)」 에서 끊겨 첨부 표에서 빠진다
        url = url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20');
        const label = String(att.filename || '').replace(/[[\]\n]/g, '_');
        if (isImg && fromJira) rep = `🖼️ [${label || '그림'}](${url})${att.size != null ? ` · ${sizeText(att.size)}` : ''}`;
        else rep = isImg ? `![${att.filename || ''}](${url})` : `📎 [${(fm && fm.n) || (gf && gf[2]) || att.filename || 'file'}](${url})`;
        if (!isImg) fileSize.set(url, att.size);
      } catch (e) {
        const nm = att && att.filename;
        rep = `⚠️ [${nm ? `${nm} — 옮기지 못함, Jira 원문에서 받기` : '첨부 — 원문에서 보기'}](${JIRA_BASE}/browse/${key})`;
        log(`  · 첨부 #${i} ${e.message} → 원문 링크`);
        // 못 옮긴 첨부는 Slack 으로 알린다(같은 첨부는 한 번만 — 스냅숏 alerts)
        if (ctx.alert) await ctx.alert(`attach-jira:${att ? att.id : fileMedia[i].id}`, `Jira 에 올린 파일 「${nm || '(이름 모름)'}」 을 GitHub 에 옮기지 못했습니다 — ${easyError(e.message)}.
👉 할 일: 이 파일은 Jira 에서 받아 주세요.`);
      }
      md = md.replace(`![](${attachPrefix}${i})`, rep);
    }
    md = attachTable(md, fileSize);
  }
  const note = lossy
    ? `<!-- jira-note:start -->\n> ⚠️ GitHub 이 담지 못하는 Jira 서식이 있습니다 — ${lossyTypes.join(', ')}. 원문: ${JIRA_BASE}/browse/${key}\n<!-- jira-note:end -->`
    : '';
  return { md, note };
}

// GitHub 마크다운(+ body_html) → Jira ADF. 이미지 · 첨부 파일은 Jira 첨부로 올리고(이름에 GitHub 번호) media 노드로 건다.
async function ghToAdf(md, html, key, ctx) {
  const { mdToAdf } = await import('./md-adf.mjs');
  // 웹에 붙여 넣은 이미지는 <img src="…"> HTML 로 들어온다 → 마크다운 이미지로
  let src = String(md || '').replace(/<img\b[^>]*?\bsrc="([^"]+)"[^>]*>/gi, (m0, s) => {
    const alt = (/\balt="([^"]*)"/i.exec(m0) || [, 'image'])[1];
    return `![${alt}](${s})`;
  });
  // Jira 그림 자리 「🖼️ [이름](Jira 첨부 주소) · 크기」 → 그림 문법으로(그 자리의 Jira 그림이 된다)
  src = src.replace(/\r\n/g, '\n').replace(RE_JIRA_IMG_LINE, (m0, name, u) => `![${name}](${u})`);
  const signed = [...String(html || '').matchAll(/<img\b[^>]*?\bsrc="(https:\/\/private-user-images\.githubusercontent\.com\/[^"]+)"/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  const assetUrls = [...src.matchAll(/!\[[^\]]*\]\((https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{36})[^)]*\)/gi)].map((m) => m[1]);
  const urls = [...new Set([...src.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]))];
  const map = new Map();
  const fileSizes = new Map(); // GitHub 업로드 파일 주소 → 크기(첨부 표 「크기」 칸)
  ctx.ghTabled = null;
  const byName = () => new Map(ctx.attachments.map((a) => [a.filename, a]));
  const linkText = (u) => { const i = src.indexOf(`](${u}`); const j = i > 0 ? src.lastIndexOf('[', i) : -1; return j >= 0 ? src.slice(j + 1, i) : ''; };
  // 그림 설명: <img alt="이름" src="주소"> 또는 ![이름](주소)
  const imgAlt = (u) => {
    const esc = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`<img\\b[^>]*\\balt="([^"]*)"[^>]*\\bsrc="${esc}"|<img\\b[^>]*\\bsrc="${esc}"[^>]*\\balt="([^"]*)"`).exec(src);
    return m ? (m[1] || m[2] || '') : linkText(u);
  };
  for (const u of urls) {
    try {
      let att = null, kind = 'image';
      const ja = RE_JIRA_ATT.exec(u), ga = RE_GH_ASSET.exec(u), gf = RE_GH_FILE.exec(u), rr = RE_REPO_RAW.exec(u);
      // Jira 첨부 주소 → 이 이슈에 있는 그 첨부로(다시 올리지 않는다). 다른 이슈 · 지워진 첨부면 링크 그대로
      if (ja) {
        att = ctx.attachments.find((a) => String(a.id) === ja[1]) || null;
        if (!att) continue;
      }
      if (att) kind = /^image\//.test(att.mimeType || '') ? 'image' : 'file';
      else if (rr) {
        // 이 레포의 파일 → 내려받아 Jira 첨부로
        const path = decodeURIComponent(rr[2]);
        const base = path.split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '_');
        const name = `ghr-${sha(path).slice(0, 10)}-${base}`;
        att = byName().get(name) || null;
        if (!att) {
          const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(rr[1])}`,
            { headers: { Authorization: ghAuth(), Accept: 'application/vnd.github.raw', 'User-Agent': 'issue-sync' } });
          if (!r.ok) throw new Error(`레포 파일 내려받기 ${r.status}`);
          const mime = /\.(png|jpe?g|gif|webp)$/i.test(base) ? `image/${base.split('.').pop().toLowerCase().replace('jpg', 'jpeg')}` : 'application/octet-stream';
          att = await jiraUpload(key, name, Buffer.from(await r.arrayBuffer()), mime);
          ctx.attachments.push(att);
          log(`  · 레포 파일 → Jira 첨부 ${att.filename}`);
        }
        kind = /^image\//.test(att.mimeType || '') ? 'image' : 'file';
      } else if (ga) {
        // 이미지 이름: GitHub 이 붙인 그림 설명(alt = 올린 파일 이름) 그대로.
        // 같은 그림인지는 스냅숏 files(「img-<번호>」) · 첨부 이름 「gh-<번호>」 로 찾는다
        const known = ctx.files[`img-${ga[1]}`];
        const existing = (known && ctx.attachments.find((a) => String(a.id) === String(known.a)))
          || [...byName().values()].find((a) => (a.filename || '').startsWith(`gh-${ga[1]}`));
        if (existing) att = existing;
        else {
          let buf = null, mime = null;
          const idx = assetUrls.indexOf(u);
          const cands = [signed.find((s) => s.includes(ga[1])), idx >= 0 ? signed[idx] : null, u].filter(Boolean);
          for (const c of cands) {
            const r = await fetch(c, c === u ? { headers: { Authorization: ghAuth() } } : {});
            const ct = r.headers.get('content-type') || '';
            if (r.ok && !/text\/html/.test(ct)) { buf = Buffer.from(await r.arrayBuffer()); mime = ct; break; }
          }
          if (!buf) throw new Error('GitHub 이미지 내려받기 실패');
          const ext = (/image\/(png|jpe?g|gif|webp|svg)/.exec(mime) || [, 'png'])[1].replace('jpeg', 'jpg').replace('svg', 'svg');
          const alt = imgAlt(u).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
          const base = alt && !/^image$/i.test(alt) ? alt.replace(new RegExp(`\\.${ext}$`, 'i'), '') : `gh-${ga[1]}`;
          att = await jiraUpload(key, `${base}.${ext}`, buf, mime);
          ctx.attachments.push(att);
          log(`  · 이미지 → Jira 첨부 ${att.filename}`);
        }
        ctx.files[`img-${ga[1]}`] = { a: String(att.id), u, n: att.filename };
      } else if (gf) {
        kind = 'file';
        const fid = gf[1], urlName = decodeURIComponent(gf[2]);
        const known = ctx.files[fid];
        att = (known && ctx.attachments.find((a) => String(a.id) === String(known.a))) || byName().get(`ghf-${fid}-${urlName}`) || null;
        // GitHub 은 한글 등 이름을 주소에서 「_」 로 바꾼다(…/files/번호/_.md) — 사람이 본 이름은 링크 글자에 있다
        const ext = (/\.[A-Za-z0-9]+$/.exec(urlName) || [''])[0].toLowerCase();
        const text = linkText(u).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
        const name = text && ext && text.toLowerCase().endsWith(ext) ? text : urlName;
        if (!att) {
          // 비공개 레포의 첨부 파일은 Actions 기본 토큰(GITHUB_TOKEN)으로는 404 — 사람/봇 계정 토큰(SYNC_BOT_TOKEN)이 있어야 받는다
          let r = null, ct = '';
          for (const tok of [env.SYNC_BOT_TOKEN, env.GITHUB_TOKEN].filter(Boolean)) {
            r = await fetch(u, { headers: { Authorization: `Bearer ${tok}` } });
            ct = r.headers.get('content-type') || '';
            if (r.ok && !/text\/html/.test(ct)) break;
          }
          if (!r || !r.ok || /text\/html/.test(ct)) throw new Error(`GitHub 첨부 파일 내려받기 ${r ? r.status : '-'}${env.SYNC_BOT_TOKEN ? '' : ' (SYNC_BOT_TOKEN 없음)'}`);
          att = await jiraUpload(key, name, Buffer.from(await r.arrayBuffer()), ct);
          ctx.attachments.push(att);
          log(`  · 파일 → Jira 첨부 ${att.filename}`);
        }
        ctx.files[fid] = { a: String(att.id), u, n: att.filename };
        fileSizes.set(u, att.size);
      } else continue;
      if (!att) continue;
      const mid = await jiraMediaId(att.id);
      map.set(u, { id: mid, collection: '', kind, url: `${JIRA_BASE}/rest/api/3/attachment/content/${att.id}` });
    } catch (e) {
      log(`  · ${u.slice(0, 60)}… ${e.message} → 링크로 둠`);
      if (ctx.alert) await ctx.alert(`attach-gh:${u}`, `GitHub 에 올린 파일 「${linkText(u) || '파일'}」 을 Jira 에 옮기지 못했습니다 — ${easyError(e.message)}.
👉 할 일: 이 파일은 GitHub 에서 받아 주세요. ${TODO_DEV.replace('👉 할 일: ', '')}`);
    }
  }
  // GitHub 웹 업로드 줄 → 첨부 표: GitHub 글에 다시 쓸 것(ctx.ghTabled)과 Jira 로 보낼 것(src) 모두
  const orig = String(md || '').replace(/\r\n/g, '\n');
  const tabled = ghFileLinesToTable(orig, fileSizes);
  if (tabled !== orig) ctx.ghTabled = tabled;
  src = ghFileLinesToTable(src, fileSizes);
  return mdToAdf(src, { mentionReverse: LOGIN_TO_ACCT, jiraOnly: JONLY, mediaFor: (h) => { const v = map.get(h); return v && v.id ? v : (v ? { ...v, id: null } : null); } });
}

// ──────────────── GitHub 읽기 · 짝 찾기 ────────────────
async function ghIssue(n) { return gh('GET', `/repos/${GH_REPO}/issues/${n}`, null, FULL); }
async function ghFindByJiraKey(key) {
  for (let page = 1; ; page++) {
    const list = await gh('GET', `/repos/${GH_REPO}/issues?state=all&per_page=100&page=${page}`);
    for (const it of list) if (!it.pull_request && (titleKey(it.title) === key || markKey(it.body) === key)) return it;
    if (list.length < 100) return null;
  }
}
async function ghList(path) {
  const out = [];
  for (let page = 1; ; page++) {
    const list = await gh('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, null, FULL);
    out.push(...list);
    if (list.length < 100) return out;
  }
}

// ──────────────── 상태 레이블 · 닫을 때 체크 상자 ────────────────
// 상태 레이블 = spaces.json statusLabelPrefix + Jira 상태 이름(예: 「상태: 진행 중」). GitHub 에서 고르면 Jira 상태가 바뀐다.
const LABEL_COLOR = { new: 'C5DEF5', indeterminate: 'FBCA04', done: '0E8A16' };
async function ensureLabel(name, cat) {
  try { await gh('POST', `/repos/${GH_REPO}/labels`, { name, color: LABEL_COLOR[cat] || 'EDEDED', description: 'Jira 상태 — 바꾸면 Jira 도 바뀝니다' }); }
  catch (e) { if (!/ 422:/.test(e.message)) warn(`레이블 ${name} 만들기 실패: ${e.message}`); }
}
// 레이블 선택 창에서 고를 수 있게 스페이스의 모든 상태 레이블을 미리 만든다(없는 것만)
async function ensureStatusLabels(space, pref) {
  await statusCategory(space, '');
  const have = new Set((await ghList(`/repos/${GH_REPO}/labels`)).map((l) => l.name));
  for (const [name, cat] of _statusCat) if (!have.has(pref + name)) { await ensureLabel(pref + name, cat); log(`· 상태 레이블 만듦: ${pref + name}`); }
}
// 새로 붙은 상태 레이블이 여럿이면 가장 나중에 붙인 것(이벤트 시각 · 번호)을 고른다. 같은 순간이면 정하지 않는다.
async function latestStatusLabel(num, pref, names) {
  const ev = await ghList(`/repos/${GH_REPO}/issues/${num}/events`);
  const at = new Map();
  for (const e of ev) if (e.event === 'labeled' && e.label && e.label.name.startsWith(pref)) at.set(e.label.name.slice(pref.length).trim(), [Date.parse(e.created_at), e.id]);
  const s = names.map((n) => [n, at.get(n) || [0, 0]]).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]);
  return s[0][1][0] > s[1][1][0] ? s[0][0] : null;
}

// ──────────────── §4 누가 바꿨나 — 기록에서만 읽는다 ────────────────
// 규칙 입력 · workflow_dispatch 의 actor/sender(= Jira 규칙 PAT 주인)는 쓰지 않는다(사칭 방지).
// 항목별 「진짜 마지막으로 바꾼 사람」 만 기록한다 — 앞사람으로 건너뛰지 않는다.
//   동기화가 봇 · 공용으로 쓴 값은 이미 스냅숏에 들어가 「옮길 변경」 이 되지 않으므로, 옮길 항목의 마지막 작성자는
//   곧 사람의 수동 변경이다. 분류(봇 · 앱 → 공용 / 공용 Jira 계정 = 사용자 본인 / 그 밖 사람 → 그 사람)는 쓰는 쪽에서 한다.
//   예외는 레이블뿐: 동기화 자신의 레이블(jira:* · jira · github · 짝 레이블) 이벤트는 이름으로 걸러 후보에서 뺀다.
//   못 찾는 항목(사람이 바꾼 적 없음 · 읽기 실패)은 빠진다 → 그 쓰기는 공용.
// GraphQL 의 봇 로그인은 「[bot]」 접미사가 없을 수 있다(예: github-actions) — 그 이름도 봇으로 본다.
const isBotLogin = (l) => { const s = String(l || '').toLowerCase(); return /\[bot\]$/.test(s) || s === 'github-actions'; };
async function ghGraphQL(query, variables) {
  const r = await req('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: ghAuth(), 'Content-Type': 'application/json', 'User-Agent': 'issue-sync' },
    body: JSON.stringify({ query, variables }),
  }, 'GitHub GraphQL');
  if (!r.ok) throw Object.assign(new Error(`GitHub GraphQL ${r.status}`), { status: r.status });
  const j = await r.json();
  if (j.errors) throw new Error(`GitHub GraphQL: ${JSON.stringify(j.errors).slice(0, 200)}`);
  return j.data;
}
// 본문 마지막 편집자 · 편집이 없으면 작성자 — 소문자 로그인(봇이면 쓰는 쪽에서 공용 처리). 못 찾으면 null(→ 공용)
async function ghBodyEditor(num) {
  const [owner, repo] = String(GH_REPO).split('/');
  try {
    // userContentEdits 연결 순서에 기대지 않고 editedAt 최댓값(가장 최근 편집)을 고른다. 편집이 없으면 작성자.
    const d = await ghGraphQL(`query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){author{login} userContentEdits(first:10){nodes{editor{login} editedAt}}}}}`, { o: owner, r: repo, n: Number(num) });
    const iss = d && d.repository && d.repository.issue;
    if (!iss) return null;
    const nodes = (iss.userContentEdits && iss.userContentEdits.nodes) || [];
    let best = null, bestT = -1;
    for (const n of nodes) { const t = Date.parse(n.editedAt) || 0; if (t >= bestT && n.editor && n.editor.login) { bestT = t; best = n.editor.login; } }
    const login = best || (iss.author && iss.author.login);
    return login ? String(login).toLowerCase() : null;
  } catch (e) { warn(`GitHub 본문 편집자 읽기 실패 → 본문 공용: ${e.message.slice(0, 120)}`); return null; }
}
// GitHub 항목별 진짜 마지막으로 바꾼 사람 로그인. isSyncLabel(name) = 동기화 자신의 레이블(그 이벤트만 제외).
async function ghActors(num, isSyncLabel) {
  let ev = [];
  try { ev = await ghList(`/repos/${GH_REPO}/issues/${num}/events`); }
  catch (e) { warn(`GitHub 이벤트 읽기 실패 → GitHub 쪽 작성자 공용: ${e.message.slice(0, 120)}`); return {}; }
  const a = {};
  const put = (k, actor, t) => { const login = actor && actor.login; if (!login) return; const tt = Date.parse(t) || 0; if (!a[k] || tt >= a[k].t) a[k] = { login: String(login).toLowerCase(), t: tt }; };
  for (const e of ev) {
    const t = e.created_at;
    if (e.event === 'renamed') put('title', e.actor, t);
    else if (e.event === 'labeled' || e.event === 'unlabeled') { if (!(e.label && isSyncLabel && isSyncLabel(e.label.name))) put('labels', e.actor, t); } // 동기화 레이블 이벤트만 제외
    else if (e.event === 'assigned' || e.event === 'unassigned') put('assignee', e.actor, t);
    else if (e.event === 'closed' || e.event === 'reopened') put('state', e.actor, t);
    else if (e.event === 'typed' || e.event === 'untyped') put('type', e.actor, t);
  }
  const out = {};
  for (const [k, v] of Object.entries(a)) out[k] = v.login; // 봇 로그인도 그대로 — 쓰는 쪽에서 isBotLogin → 공용
  const body = await ghBodyEditor(num);
  if (body) out.body = body;
  return out;
}
// Jira 항목별 진짜 마지막으로 바꾼 사람 accountId(변경 이력 changelog). 공용 계정 · 앱도 그대로 — 쓰는 쪽에서 분류.
const JCHG_FIELD = { summary: 'summary', description: 'description', labels: 'labels', assignee: 'assignee', status: 'status', issuetype: 'issuetype', Parent: 'parent', parent: 'parent' };
// 동기화 자신의 Jira 레이블(내용 아님) — github · 짝 레이블. 이것만 바뀐 변경 이력은 「사람의 레이블 변경」 이 아니다.
const isJiraSyncLabel = (n) => n === GH_MARK_LABEL || isGhPairLabel(n);
const labelDiff = (fromStr, toStr) => {
  const f = new Set(String(fromStr || '').split(/\s+/).filter(Boolean));
  const t = new Set(String(toStr || '').split(/\s+/).filter(Boolean));
  const out = [];
  for (const x of f) if (!t.has(x)) out.push(x);
  for (const x of t) if (!f.has(x)) out.push(x);
  return out;
};
async function jiraActors(key) {
  const a = {};
  const put = (f, acct, t) => { if (!acct || !f) return; const tt = Date.parse(t) || 0; if (!a[f] || tt >= a[f].t) a[f] = { acct, t: tt }; };
  try {
    for (let at = 0; ; ) {
      const r = await jira('GET', `/rest/api/3/issue/${encodeURIComponent(key)}/changelog?startAt=${at}&maxResults=100`);
      for (const h of (r.values || [])) {
        const acct = h.author && h.author.accountId;
        for (const it of (h.items || [])) {
          const f = JCHG_FIELD[it.field] || it.fieldId || null;
          if (!f) continue;
          // 레이블: 동기화 레이블(github · 짝)만 바뀐 기록은 사람의 변경이 아니므로 건너뛴다(fromString/toString 차이로 판정)
          if (f === 'labels' && (it.fromString != null || it.toString != null)) {
            const ch = labelDiff(it.fromString, it.toString);
            if (ch.length && ch.every(isJiraSyncLabel)) continue;
          }
          put(f, acct, h.created);
        }
      }
      at += (r.values || []).length;
      if (!r.values || !r.values.length || at >= r.total) break;
    }
  } catch (e) { warn(`Jira 변경 이력 읽기 실패 → Jira 쪽 작성자 공용: ${e.message.slice(0, 120)}`); return {}; }
  const out = {};
  for (const [f, v] of Object.entries(a)) out[f] = v.acct;
  return out;
}
// 닫을 때: 마크다운 체크 상자 「- [ ]」 → 「- [x]」(코드 블록 안은 건드리지 않는다)
function checkAllMd(md) {
  let fence = false;
  return String(md || '').split('\n').map((l) => {
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return l; }
    return fence ? l : l.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[ \]/, '$1[x]');
  }).join('\n');
}
// 닫을 때: Jira ADF 체크 항목(taskItem) TODO → DONE. 바뀐 것이 없으면 null
function checkAllAdf(adf) {
  if (!adf) return null;
  let n = 0;
  const walk = (x) => {
    if (Array.isArray(x)) return x.map(walk);
    if (!x || typeof x !== 'object') return x;
    const y = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)]));
    if (y.type === 'taskItem' && y.attrs && y.attrs.state !== 'DONE') { y.attrs = { ...y.attrs, state: 'DONE' }; n++; }
    return y;
  };
  const out = walk(adf);
  return n ? out : null;
}

// ──────────────── 값 합치기(3-way) ────────────────
// (선택) Slack 알림 — Secret SLACK_WEBHOOK_URL(Incoming Webhook)이 있을 때만. 주소는 로그에 찍지 않는다.
async function notifySlack(text) {
  if (DRY) { planWrite('Slack', 'POST', 'slack'); log(`  ${String(text).split('\n')[0].slice(0, 160)}`); return; }
  if (!env.SLACK_WEBHOOK_URL) { log('· Slack 주소(SLACK_WEBHOOK_URL) 없음 → 알림 건너뜀'); return; }
  try {
    const r = await fetch(env.SLACK_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    if (r.ok) log('· Slack 알림 보냄'); else warn(`Slack 알림 실패 ${r.status}`);
  } catch (e) { warn(`Slack 알림 실패: ${e.message}`); }
}

const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function pick(name, g, j, s, ctx, jiraOwner = false) {
  if (g === undefined || eq(g, j)) return { v: j, from: 'jira' };
  let w;
  if (s === undefined) w = ctx.origin; // 첫 동기화(스냅숏 없음): 이번 실행을 일으킨 쪽
  else if (!eq(g, s) && eq(j, s)) w = 'gh';
  else if (eq(g, s) && !eq(j, s)) w = 'jira';
  else { w = jiraOwner ? 'jira' : ctx.newer; ctx.conflicts.push(name); }
  return w === 'gh' ? { v: g, from: 'gh' } : { v: j, from: 'jira' };
}

// ──────────────── v1 짝 이어받기 ────────────────
// 글 비교용 — 주소 · 숨은 표시 · @아이디 · 기호를 빼고 글자 · 숫자만(멘션은 양쪽 표기가 달라 뺀다)
const plainKey = (s) => String(s || '').normalize('NFC').replace(/https?:\/\/\S+/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/@[\w-]+/g, ' ').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
// ADF → 글자(멘션 · 링크 카드 · 그림은 빼고)
function adfPlain(n) {
  if (!n) return '';
  if (Array.isArray(n)) return n.map(adfPlain).join(' ');
  if (n.type === 'text') return n.text || '';
  if (/^(mention|inlineCard|blockCard|media|mediaSingle|mediaGroup)$/.test(n.type || '')) return ' ';
  return adfPlain(n.content || []);
}
// 두 글이 얼마나 비슷한가(두 글자 묶음 겹침 0~1)
function similar(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const A = grams(a), B = grams(b);
  let inter = 0, tot = 0;
  for (const [k, v] of A) { inter += Math.min(v, B.get(k) || 0); tot += v; }
  for (const v of B.values()) tot += v;
  return tot ? (2 * inter) / tot : 0;
}
const SIMILAR_MIN = 0.5;
const beforeCutover = (t) => CREATE_SINCE != null && Date.parse(t) < CREATE_SINCE;
// 에픽 등 상위 수준(1 이상) 업무 — GitHub 이슈로 옮기지 않는다(동기화 요청 규칙의 hierarchyLevel = 0 조건이 빠져도 막는 안전장치)
const isEpicLevel = (data) => !!(data && data.fields && data.fields.issuetype && data.fields.issuetype.hierarchyLevel >= 1);
// 한국 시간 날짜(YYYY-MM-DD)
const kstDate = (t) => new Date(Date.parse(t) + 9 * 3600 * 1000).toISOString().slice(0, 10);

// v1 짝을 처음 만났을 때 — 내용(제목 · 본문 · 댓글)은 쓰지 않고 Jira 속성에 짝 기록만 남긴다.
//   이슈: 지금 양쪽 값을 「마지막으로 맞춘 값」으로. 양쪽 값이 다른 칸은 GitHub 값을 적어 두어 다음 맞추기에서 Jira 값으로 맞춰진다(Jira 기준).
//         본문은 양쪽 모양을 그대로 기억해, 누가 고치기 전에는 옮기지 않는다(v1 변환 차이로 덮어쓰지 않게).
//   댓글: ① Jira 쪽 v1 사본(「아이디 님 GitHub 댓글」) ↔ GitHub 원본 — 같은 아이디 · 먼저 단 것 · 비슷한 글
//         ② Jira 원본 ↔ GitHub v1 사본 — 표시 「sync:jira:번호」, 번호가 없으면 같은 이름 · 뒤에 단 것 · 비슷한 글
//         짝을 못 찾은 옛 댓글은 전환 시각(SYNC_CREATE_SINCE) 전에 단 것이면 「옛 댓글」로 기록해 옮기지 않는다(고치면 그때 옮김).
async function adoptPair(num, key, space, issue, data) {
  const parts = ghParts(issue.body);
  const J = jiraCommon(data, space);
  const pref = space.statusLabelPrefix || null;
  const isStatus = (n) => !!pref && n.startsWith(pref);
  const labelsAll = (issue.labels || []).map((l) => l.name);
  const statusLbls = labelsAll.filter(isStatus).map((n) => n.slice(pref.length).trim());
  const asg = (issue.assignees || []).map((a) => a.login);
  const epic = epicOf(parts.user);
  const snap = {
    v: 2, gh: Number(num), from: 'v1',
    title: issue.title.replace(RE_TITLE, ''),
    labels: labelsAll.filter((n) => n !== 'jira' && !isStatus(n)).map((n) => n.replace(/\s+/g, '_')).sort(),
    type: issue.type ? issue.type.name : null,
    assignee: asg[0] || (parts.asgName ? `jira:${parts.asgName}` : null),
    fields: { ...J.fields, ...(statusLbls.length === 1 ? { status: statusLbls[0] } : {}), ...(epic ? { parent: epic.key } : {}) },
    state: issue.state,
    ghBody: sha(norm(parts.user)),
    jiraDesc: adfHash(data.fields.description),
  };
  // 첫 맞추기에서 Jira 값으로 맞춰질 칸(보고용)
  const diffs = [];
  for (const k of ['title', 'labels', 'type', 'assignee']) if (!eq(snap[k], J[k]) && !(k === 'type' && snap[k] == null)) diffs.push(k);
  for (const k of ['status', 'parent']) if (!eq(snap.fields[k] || '', J.fields[k] || '')) diffs.push(k);
  const jCat = await statusCategory(space, J.fields.status);
  if ((jCat === 'done' ? 'closed' : 'open') !== issue.state) diffs.push('state');

  const ghc = await ghList(`/repos/${GH_REPO}/issues/${num}/comments`);
  const jc = await jiraComments(key);
  const used = new Set();
  const res = { ghToJ: 0, jToGh: 0, oldGh: 0, oldJ: 0, newGh: 0, newJ: 0 };
  const ghHuman = ghc.filter((c) => !(c.user && c.user.type === 'Bot') && !RE_CMARK.test(c.body || '') && !RE_V1CMARK.test(c.body || ''));
  const ghCopies = ghc.filter((c) => RE_V1CMARK.test(c.body || '') || RE_CMARK.test(c.body || ''));
  // ① Jira 쪽 v1 사본 ↔ GitHub 원본
  for (const c of jc) {
    if (cPropOf(c) || cPropJ(c)) continue;
    const login = v1GhCopyLogin(c);
    if (!login) continue;
    const text = plainKey(adfPlain(((c.body && c.body.content) || []).slice(1)));
    let best = null, bs = 0;
    for (const g of ghHuman) {
      if (used.has(g.id) || String(g.user.login).toLowerCase() !== login.toLowerCase()) continue;
      if (Date.parse(g.created_at) > Date.parse(c.created) + 60000) continue; // 사본보다 뒤에 단 글은 원본이 아니다
      const s = similar(plainKey(g.body), text);
      if (s > bs) { bs = s; best = g; }
    }
    if (best && bs >= SIMILAR_MIN) {
      used.add(best.id);
      await jira('PUT', `/rest/api/3/comment/${c.id}/properties/ghsync`, { gh: best.id, h: sha(norm(best.body)), jh: jHash(c.body) });
      res.ghToJ++;
    } else log(`· 옛 댓글: Jira ${c.id}(${login} 님 GitHub 댓글 사본)의 GitHub 원본을 찾지 못함 → 되돌려 보내지 않음`);
  }
  // ② Jira 원본 ↔ GitHub v1 사본
  for (const c of jc) {
    if (cPropOf(c) || cPropJ(c) || v1GhCopyLogin(c)) continue;
    let g = ghCopies.find((x) => { const m = RE_CMARK.exec(x.body || '') || RE_V1CMARK.exec(x.body || ''); return m && m[1] === String(c.id); }) || null;
    if (!g) {
      const who = String((c.author && c.author.displayName) || '').trim();
      const text = plainKey(adfPlain(c.body));
      let bs = 0;
      for (const x of ghCopies) {
        const m = RE_V1CMARK.exec(x.body || '');
        if (used.has(x.id) || !m || m[1]) continue; // 번호 없는 v1 표시만
        const head = /^\*\*([^*\n]+)\*\*\s*님 Jira 댓글/.exec(norm(x.body));
        if (!head || head[1].trim() !== who) continue;
        if (Date.parse(x.created_at) + 60000 < Date.parse(c.created)) continue; // 원본보다 먼저 단 사본은 없다
        const s = similar(plainKey(norm(x.body).replace(/^[^\n]*\n*/, '')), text);
        if (s > bs) { bs = s; g = x; }
      }
      if (bs < SIMILAR_MIN) g = null;
    }
    if (g) {
      used.add(g.id);
      await jira('PUT', `/rest/api/3/comment/${c.id}/properties/ghsyncj`, { gc: g.id, gh: sha(norm(g.body)), jh: jHash(c.body) });
      res.jToGh++;
    } else if (beforeCutover(c.created)) {
      await jira('PUT', `/rest/api/3/comment/${c.id}/properties/ghsyncj`, { legacy: 1, jh: jHash(c.body) });
      res.oldJ++;
    } else res.newJ++;
  }
  // 짝을 못 찾은 GitHub 원본 댓글
  const legacy = {};
  for (const g of ghHuman) {
    if (used.has(g.id)) continue;
    if (beforeCutover(g.created_at)) { legacy[String(g.id)] = sha(norm(g.body)); res.oldGh++; } else res.newGh++;
  }
  if (Object.keys(legacy).length) snap.legacy = { gh: legacy };
  await jira('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}/properties/ghsync`, snap);
  log(`· v1 짝 이어받음 — 댓글 짝 GitHub→Jira ${res.ghToJ} · Jira→GitHub ${res.jToGh} · 옛 댓글(옮기지 않음) GitHub ${res.oldGh} · Jira ${res.oldJ}`
    + (res.newGh || res.newJ ? ` · 짝 없는 새 댓글(이번에 옮김) GitHub ${res.newGh} · Jira ${res.newJ}` : '')
    + (diffs.length ? ` · Jira 값으로 맞출 칸: ${diffs.join(', ')}` : ''));
  return { snap, diffs, res };
}

// ──────────────── 짝 전체 맞추기 ────────────────
async function reconcile(num, key, origin, fresh) {
  RUN.num = num; RUN.key = key;
  const space = spaceOf(key);
  let issue = await ghIssue(num);
  let data = await jiraIssue(key, space);
  if (isEpicLevel(data)) { log(`· Jira ${key} 는 에픽(상위 수준) → 맞추지 않음`); return; }
  let snap = fresh ? {} : ((await jiraProp(key)) || null);
  // v1 에서 넘어온 짝(짝 기록 없음) — 먼저 짝 기록만 남기고 그 기록으로 맞춘다
  if (!fresh && !snap) snap = (await adoptPair(num, key, space, issue, data)).snap;
  const S = snap || {};
  // files: GitHub 첨부 파일 번호 → { a: Jira 첨부 id, u: GitHub 주소, n: 이름 } (Jira 첨부 이름을 원래 이름으로 두려고 짝을 스냅숏에 기억)
  const ctx = { origin, conflicts: [], alerts: [], attachments: [...((data.fields && data.fields.attachment) || [])], files: { ...(S.files || {}) },
    legacyGh: (S.legacy && S.legacy.gh) || {} };
  ctx.newer = Date.parse(issue.updated_at) >= Date.parse(data.fields.updated) ? 'gh' : 'jira';
  const isCopy = !!titleKey(issue.title) || (issue.labels || []).some((l) => l.name === 'jira');
  const link = `<${issue.html_url}|GitHub #${num}> ↔ <${JIRA_BASE}/browse/${key}|Jira ${key}>`;
  // 알림 — 같은 문제는 한 번만(스냅숏 alerts 에 남겨 두고, 풀리면 목록에서 빠진다)
  const alert = async (id, text) => {
    ctx.alerts.push(id);
    warn(text);
    if ((S.alerts || []).includes(id)) log(`· (이미 알린 문제: ${id})`);
    // ⚠️ = 동기화는 끝났지만 일부를 못 옮김(실행은 성공) · ❌ 동기화 실패는 main().catch 에서 따로
    else await notifySlack(`:warning: *확인해 주세요* — 「${String(issue.title || '').replace(RE_TITLE, '').replace(/[<>|]/g, '')}」 (${link})\n${text}`);
  };
  ctx.alert = alert; // 첨부 변환(jiraToMd · ghToAdf)도 같은 알림을 쓴다
  log(`▶ 짝 GitHub #${num} ↔ Jira ${key} · 스냅숏 ${snap ? (fresh ? '새 짝' : '있음') : '없음(첫 동기화 — ' + origin + ' 우선)'}`);

  // 1) 양쪽 현재값
  const parts = ghParts(issue.body);
  const noOpinion = (v) => (!snap && (v == null || (Array.isArray(v) && !v.length)) ? undefined : v);
  const pref = space.statusLabelPrefix || null;
  const isStatusLabel = (n) => !!pref && n.startsWith(pref);
  // 담당: Jira 는 한 명 — GitHub 담당이 여럿이면 첫 명만 · GitHub 담당이 없으면 본문 「담당: 이름(Jira)」 줄
  const asgList = (issue.assignees || []).map((a) => a.login);
  const gAsg = asgList.length ? asgList[0] : (parts.asgName ? `jira:${parts.asgName}` : null);
  if (asgList.length > 1) await alert(`multi-assignee:${asgList.join(',')}`, `GitHub 에 담당자가 ${asgList.length}명(${asgList.join(', ')}) 지정됐습니다. Jira 는 담당자를 한 명만 둘 수 있어 ${asgList[0]} 만 Jira 담당자가 됐습니다.
👉 할 일: 담당자를 한 명으로 정해 주세요.`);
  const G = {
    title: issue.title.replace(RE_TITLE, ''),
    labels: noOpinion((issue.labels || []).map((l) => l.name).filter((n) => n !== 'jira' && !isStatusLabel(n)).map((n) => n.replace(/\s+/g, '_')).sort()),
    type: noOpinion(issue.type ? issue.type.name : null),
    assignee: noOpinion(gAsg),
    fields: {},
  };
  // 상위 에픽 — 본문 「### 상위 에픽 키」 칸이 있을 때만 의견(없으면 GitHub 은 상위를 모른다)
  const epicSec = epicOf(parts.user);
  if (epicSec) G.fields.parent = epicSec.key;
  const J = jiraCommon(data, space);
  // GitHub 상태 레이블 → 상태 의견
  if (pref) {
    await ensureStatusLabels(space, pref);
    const base = S.fields ? S.fields.status : J.fields.status;
    const added = [...new Set((issue.labels || []).map((l) => l.name).filter(isStatusLabel).map((n) => n.slice(pref.length).trim()))].filter((n) => n !== base);
    let want = added.length === 1 ? added[0] : null;
    if (added.length > 1) {
      want = await latestStatusLabel(num, pref, added);
      if (want) log(`· 상태 레이블 ${added.length}개(${added.join(', ')}) → 가장 나중에 단 「${want}」 만 남김`);
      else await alert(`status-labels:${added.sort().join(',')}`, `상태 레이블을 ${added.length}개(${added.join(', ')}) 한꺼번에 붙여 어느 상태인지 정할 수 없습니다. Jira 상태는 「${J.fields.status}」 그대로이고 레이블은 원래대로 돌렸습니다.
👉 할 일: 상태 레이블을 하나만 다시 붙여 주세요.`);
    }
    if (want && !(await statusCategory(space, want))) { warn(`상태 레이블 「${want}」 는 Jira 에 없는 상태 → 무시`); want = null; }
    if (want) { log(`· GitHub 상태 레이블 → ${want}`); G.fields.status = want; }
  }
  // GitHub 닫기/다시 열기 → 상태 의견
  const ghState = issue.state;
  const jCat = await statusCategory(space, J.fields.status);
  const sCat = S.fields ? await statusCategory(space, S.fields.status) : jCat;
  const prevState = S.state || (sCat === 'done' ? 'closed' : 'open');
  const cfg = closeCfg(space);
  let ghClose = null; // GitHub 에서 이번에 닫음 — { r: completed | not_planned | duplicate, of: 원래 이슈 번호 }
  if (ghState !== prevState || (!snap && ghState !== (jCat === 'done' ? 'closed' : 'open') && origin === 'gh')) {
    const gs = G.fields.status !== undefined ? G.fields.status : J.fields.status;
    const gc = await statusCategory(space, gs);
    if (ghState === 'closed') {
      ghClose = { r: issue.state_reason || 'completed' };
      if (ghClose.r === 'duplicate') ghClose.of = await ghDuplicateOf(num);
      log(`· GitHub 닫기 이유 ${ghClose.r}${ghClose.of ? ` (원래 이슈 ${ghClose.of.other || '#' + ghClose.of})` : ''}`);
    }
    if (ghState === 'closed' && gc !== 'done') {
      // duplicate → 「중복」 상태, not planned(또는 「중복」 상태가 없을 때 duplicate) → 「계획 안 함」 상태.
      // 정해진 상태가 없거나 완료 분류가 아니면 기본 완료 상태(해결 사유는 전환 때 넣어 본다)
      const want = ghClose.r === 'duplicate' && cfg.dupStatuses[0] ? cfg.dupStatuses[0] : ghClose.r !== 'completed' && cfg.npStatuses[0];
      G.fields.status = want && (await statusCategory(space, want)) === 'done' ? want : space.doneStatus;
    }
    if (ghState === 'open' && gc === 'done') {
      // 다시 열기 → 닫기 전 상태(스냅숏 beforeClose)로 되돌린다. 기억한 것이 없거나 지금은 없는 상태면 openStatus
      const b = S.beforeClose;
      const bc = b ? await statusCategory(space, b) : null;
      G.fields.status = bc && bc !== 'done' ? b : space.openStatus;
      log(`· GitHub 다시 열기 → ${G.fields.status}${G.fields.status === b ? ' (닫기 전 상태)' : ''}`);
    }
  }
  // GitHub 오른쪽 이슈 필드(조직 필드) ↔ Jira 필드 — 짝은 자동(이름 · 형식), 짝 없는 필드는 보이지 않는다
  // 이 이슈 유형에 보이는 GitHub 필드만 맞춘다(안 보이는 칸에 값을 숨겨 넣지 않는다)
  const pinned = await ghPinned();
  const pairs = (await fieldPairs(space, data)).filter((p) => ghFieldVisible(pinned, issue.type && issue.type.name, p.gf.name));
  const ghVals = pairs.length ? await ghFieldValues(num) : {};

  // 2) 합치기 — 제목 · 레이블 · 유형은 나중 것, 담당 · 상태 · 상위 · 필드는 Jira 가 주인
  const M = { fields: {} }, from = { fields: {} };
  for (const k of ['title', 'labels', 'type']) { const p = pick(k, G[k], J[k], S[k], ctx); M[k] = p.v; from[k] = p.from; }
  // 지난번 Jira 가 못 받은 GitHub 담당(asgHold)이 그대로면 의견 없음 — 다시 보내 실패를 되풀이하지 않고, Jira 가 바뀌면 Jira 를 따른다
  let asgHold = (S.asgHold !== undefined && eq(G.assignee, S.asgHold) && eq(J.assignee, S.assignee)) ? S.asgHold : undefined;
  { const p = pick('assignee', asgHold !== undefined ? J.assignee : G.assignee, J.assignee, S.assignee, ctx, true); M.assignee = p.v; from.assignee = p.from; }
  for (const id of ['status', 'parent']) {
    const p = pick(id, G.fields[id], J.fields[id], S.fields ? S.fields[id] : undefined, ctx, true);
    M.fields[id] = p.v; from.fields[id] = p.from;
  }
  const bodyFrom = (() => {
    if (fresh || !snap) return origin;
    const gBody = sha(norm(parts.user)), jBody = adfHash(data.fields.description);
    const gc = gBody !== S.ghBody, jc = jBody !== S.jiraDesc;
    if (gc && !jc) return 'gh';
    if (jc && !gc) return 'jira';
    if (gc && jc) { ctx.conflicts.push('본문'); return ctx.newer; }
    return null;
  })();
  if (ctx.conflicts.length) warn(`양쪽이 함께 바뀜(${ctx.conflicts.join(', ')}) → 제목 · 본문 · 레이블 · 유형은 나중에 바뀐 쪽, 담당 · 상태 · 상위 · 필드는 Jira 값을 따름`);

  // §5 누가 바꿨나 — 사람별 쓰기용. 스위치 off 면 안 읽고 전부 공용. 동기화 자신의 레이블은 ghActors 에서 제외.
  const USER_KEYS = env.ISSUE_SYNC_USER_KEYS !== 'off';
  const syncLabelPred = (n) => n === 'jira' || n === GH_MARK_LABEL || isGhPairLabel(n) || isStatusLabel(n);
  const ghA = USER_KEYS ? await ghActors(num, syncLabelPred) : {};
  const jiraA = USER_KEYS ? await jiraActors(key) : {};
  // GitHub 로그인 → jira() 의 as(그 사람 Jira 토큰). 봇 · 없음 → 공용(null).
  const asFor = (login) => (login && !isBotLogin(login) ? login : null);

  // 3) Jira 쓰기
  const jf = {};
  // GitHub 원본이면 Jira 사본 요약 앞에 「[GH #번호] 」, 레이블에 github 를 늘 둔다(사람이 지워도 되살림)
  const ghOrigin = !isCopy;
  const rawSum = String((data.fields && data.fields.summary) || '');
  const rawJLabels = [...((data.fields && data.fields.labels) || [])];
  const wantSum = (ghOrigin ? `[GH #${num}] ` : '') + ((from.title === 'gh' ? M.title : J.title) || '(제목 없음)');
  if (from.title === 'gh' || rawSum !== wantSum) jf.summary = wantSum;
  const baseLabels = from.labels === 'gh' ? (M.labels || []) : J.labels;
  const wantJLabels = [...baseLabels, ...(ghOrigin ? [GH_MARK_LABEL, ghPairLabel(num)] : [])].sort();
  if (from.labels === 'gh' || (ghOrigin && !(rawJLabels.includes(GH_MARK_LABEL) && rawJLabels.includes(ghPairLabel(num))))) jf.labels = wantJLabels;
  if (from.type === 'gh' && M.type && space.types[M.type]) jf.issuetype = { id: String(space.types[M.type]) };
  if (from.assignee === 'gh') {
    const a = M.assignee == null ? null : (String(M.assignee).startsWith('jira:') ? jiraOnlyAcct(M.assignee.slice(5)) : acctOf(M.assignee));
    if (M.assignee == null) jf.assignee = null;
    else if (a) jf.assignee = { accountId: a };
    else { asgHold = M.assignee; await alert(`assignee:${M.assignee}`, `GitHub 담당자 ${String(M.assignee).replace(/^jira:/, '')} 의 Jira 계정이 연결돼 있지 않아 Jira 담당자를 바꾸지 못했습니다.
👉 할 일: 관리자에게 「${String(M.assignee).replace(/^jira:/, '')} 의 Jira 계정 연결」 을 요청하거나 다른 담당자를 지정해 주세요.`); }
  }
  if (from.fields.parent === 'gh') {
    const pk = M.fields.parent;
    const chk = pk ? await epicCheck(space, pk) : { ok: true };
    if (chk.ok) jf.parent = pk ? { key: pk } : null;
    else await alert(`epic:${pk}`, `「상위 에픽 키」 칸에 적은 ${epicSec ? epicSec.raw : pk} 는 ${chk.why.replace(/입니다$/, '')}입니다. 칸을 원래 상위(${J.fields.parent || '없음'})로 되돌렸습니다.
👉 할 일: 맞는 에픽 키를 다시 적어 주세요.`);
  }
  const target = from.fields.status === 'gh' ? M.fields.status : null;
  // 필드: GitHub 에서 바뀌었고 Jira 는 그대로일 때만 GitHub 값을 Jira 로(가까운 값 · 대응 없음은 알림만)
  const hold = { ...(S.ghHold || {}) };
  for (const p of pairs) {
    const gv = ghVals[p.gf.id] ?? null;
    const sg = S.ghf ? S.ghf[p.id] : undefined;
    const sj = S.fields ? S.fields[p.id] : undefined;
    const jChanged = sj !== undefined && !eq(J.fields[p.id] || '', sj || '');
    const ghChanged = sg !== undefined ? !eq(gv, sg) : (!snap && origin === 'gh' && gv != null);
    if (jChanged) delete hold[p.id];
    if (!ghChanged || eq(gv, hold[p.id] ?? Symbol('none'))) continue;
    if (jChanged) { ctx.conflicts.push(p.label); log(`· 필드 ${p.label} 양쪽이 바뀜 → Jira 값`); continue; }
    const jv = ghToJiraVal(p, gv);
    if (jv === undefined) { hold[p.id] = gv; await alert(`field:${p.id}:${gv}`, `GitHub 「${p.gf.name}」 값 「${gv}」 은 Jira 에 같은 값이 없어 Jira 에는 반영하지 않았습니다.
👉 할 일: Jira 에 있는 값으로 골라 주세요.`); continue; }
    jf[p.id] = toJira(p.id, jv, data.schema && data.schema[p.id]);
    log(`· 필드 GitHub ${p.gf.name}=${gv ?? '(없음)'} → Jira ${p.label}=${jv ?? '(없음)'}`);
  }
  if (bodyFrom === 'gh') {
    log('· 본문 GitHub → Jira');
    jf.description = await ghToAdf(parts.user, issue.body_html, key, ctx);
    if (ghOrigin) jf.description = withGhSource(jf.description, num, issue.title);
    // 웹에서 올린 파일 줄을 첨부 표로 바꿨으면 GitHub 본문도 그 글로(아래 4) GitHub 쓰기에서 저장)
    if (ctx.ghTabled) { parts.user = ctx.ghTabled; log('· GitHub 본문 업로드 파일 줄 → 첨부 표'); }
  }
  let jiraWrote = false;
  const jfFailed = new Set();
  // jf 항목마다 GitHub 에서 바꾼 사람(ghA)으로. 봇 · 없음 · 동기화 몫(상위 에픽 · 세부 필드)은 공용.
  const jfAuthorOf = (k) => {
    if (k === 'summary') return asFor(ghA.title);
    // 본문: 편집 이력이 없으면(새 등록 때 정한 값) 그 값을 만든 사람 = 이슈 작성자
    if (k === 'description') return asFor(ghA.body || (issue.user && issue.user.login));
    if (k === 'labels') return asFor(ghA.labels);
    // 담당: GitHub assigned 이벤트가 있으면 그 actor, 없으면(본문 「🙋 담당: 이름 (Jira)」 줄로 바뀜) 본문 편집자
    if (k === 'assignee') { const fromBody = M.assignee == null ? !ghA.assignee : String(M.assignee).startsWith('jira:'); return asFor(fromBody ? ghA.body : ghA.assignee); }
    if (k === 'issuetype') return asFor(ghA.type);
    return null; // parent(상위 에픽) · 세부 필드 → 공용(§4)
  };
  // 한 묶음(같은 작성자 몫)을 쓴다 — 한 번에, 실패하면 필드별로 다시(기존 오류 처리 그대로). asLogin 없으면 공용.
  const writeFieldsGroup = async (sub, asLogin) => {
    const opt = asLogin ? { as: asLogin } : {};
    try { await jira('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}`, { fields: sub }, opt); }
    catch (e) {
      warn(`Jira 한 번에 쓰기 실패 → 필드별로 다시: ${e.message}`);
      for (const [k, v] of Object.entries(sub)) {
        try { await jira('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}`, { fields: { [k]: v } }, opt); }
        catch (e2) {
          jfFailed.add(k);
          if (k === 'assignee') {
            asgHold = M.assignee;
            // 담당 거절은 대개 「그 사람이 이 스페이스에서 담당자가 될 수 없음」(스페이스 멤버 · 담당 권한) — 이유와 지금 상태를 쉬운 말로
            const who = String(M.assignee || '').replace(/^jira:/, '');
            const spaceKey = String(key).split('-')[0];
            if (/할당받을 수 없|cannot be assigned|assignable/i.test(e2.message)) {
              const jNow = (data.fields && data.fields.assignee && data.fields.assignee.displayName) || '(없음)';
              await alert(`write:${k}:${who}`, `무슨 일: GitHub 에서 담당을 「${who}」 (으)로 바꿨는데, Jira 가 거절했습니다.
이유: 「${who}」 님은 Jira 스페이스 「${spaceKey}」 에서 담당자가 될 수 없습니다(이 스페이스의 멤버가 아니거나 담당 권한이 없음).
지금 상태: GitHub 담당 = 「${who}」 · Jira 담당 = 「${jNow}」 (바뀌지 않음) — 두 곳이 서로 다릅니다.
👉 할 일(둘 중 하나): ① Jira 관리자에게 「${who}」 님을 「${spaceKey}」 스페이스에 추가해 달라고 한 뒤, Jira 에서 담당을 「${who}」 (으)로 직접 지정 ② GitHub 담당을 「${spaceKey}」 에서 담당이 될 수 있는 사람으로 바꾸기`);
              continue;
            }
          }
          await alert(`write:${k}`, `무슨 일: GitHub 에서 바꾼 「${FIELD_NAME[k] || k}」 을(를) Jira 에 옮기지 못했습니다.
이유: ${easyError(e2.message)}.
지금 상태: GitHub 은 바뀐 값 · Jira 는 예전 값 그대로 — 두 곳이 서로 다릅니다.
👉 할 일: Jira 에서 「${FIELD_NAME[k] || k}」 을(를) 직접 맞춰 주세요. ${TODO_DEV.replace('👉 할 일: ', '')}`);
        }
      }
    }
  };
  if (Object.keys(jf).length) {
    // §5 사람별로 나눠 쓴다 — 같은 작성자 몫은 한 요청, 작성자 모름 · 봇 · 동기화 몫은 공용으로 따로
    const groups = new Map();
    for (const k of Object.keys(jf)) { const a2 = jfAuthorOf(k) || ''; if (!groups.has(a2)) groups.set(a2, {}); groups.get(a2)[k] = jf[k]; }
    for (const [a2, sub] of groups) await writeFieldsGroup(sub, a2 || null);
    const jfOk = Object.keys(jf).filter((k) => !jfFailed.has(k));
    log(`· Jira ${key} 씀: ${jfOk.join(', ') || '(없음)'}${jfFailed.size ? ` · 못 씀: ${[...jfFailed].join(', ')}` : ''}${groups.size > 1 ? ` · 사람별 ${groups.size}묶음` : ''}`);
    jiraWrote = true;
  }
  let closeShown = !ghClose || ghClose.r === 'completed'; // Jira 에 닫는 이유가 드러났나
  if (target && target !== J.fields.status) {
    const tr = await jira('GET', `/rest/api/3/issue/${encodeURIComponent(key)}/transitions?expand=transitions.fields`);
    const t = (tr.transitions || []).find((x) => x.to && x.to.name === target);
    if (t) {
      const body = { transition: { id: t.id } };
      // GitHub not planned · duplicate → 전환 화면에 해결 사유 칸이 있으면 맞는 사유를 넣는다
      const rf = t.fields && t.fields.resolution;
      if (ghClose && ghClose.r !== 'completed' && rf) {
        const names = (rf.allowedValues || []).map((v) => v.name);
        const want = (ghClose.r === 'duplicate' ? [...cfg.dupRes, ...cfg.npRes] : cfg.npRes).find((n) => names.includes(n));
        if (want) { body.fields = { resolution: { name: want } }; closeShown = true; log(`· Jira 해결 사유 → ${want}`); }
      }
      if (ghClose && ghClose.r !== 'completed' && (cfg.npStatuses.includes(target) || cfg.dupStatuses.includes(target))) closeShown = true;
      await jira('POST', `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, body, asFor(ghA.state) ? { as: asFor(ghA.state) } : {});
      log(`· Jira 상태 → ${target}`); jiraWrote = true;
    } else await alert(`transition:${target}`, `Jira 에서 「${target}」 상태로 바꿀 수 없게 설정돼 있어 상태를 바꾸지 못했습니다.
👉 할 일: Jira 에서 직접 상태를 바꿔 주세요.`);
  }
  // GitHub duplicate → Jira 중복 링크(원래 이슈의 Jira 짝으로). 만든 링크는 스냅숏 dupLink 에 남겨 다시 열 때 지운다
  let dupLink = S.dupLink;
  if (ghClose && ghClose.r === 'duplicate') {
    const of = ghClose.of;
    const origKey = typeof of === 'number' ? await (async () => { const it = await ghIssue(of).catch(() => null); return it ? (titleKey(it.title) || markKey(it.body)) : null; })() : null;
    if (origKey && origKey !== key) {
      const l = await makeDupLink(key, origKey, cfg);
      if (l) { closeShown = true; if (l.made) { dupLink = { id: l.id, key: origKey }; log(`· Jira 중복 링크: ${key} duplicates ${origKey}`); jiraWrote = true; } }
      else await alert(`dup-link:${origKey}`, `GitHub 에서 「중복」 으로 닫았지만 Jira 에 중복 연결(${key} → ${origKey})을 만들지 못했습니다.
👉 할 일: Jira 에서 직접 중복 연결을 걸어 주세요.`);
    } else {
      const what = of && of.other ? `다른 저장소 이슈(${of.other})` : of ? `#${of}(Jira 짝 없음)` : '(원래 이슈를 읽지 못함)';
      await alert(`dup-orig:${of && (of.other || of)}`, `GitHub 에서 「중복」 으로 닫았지만 원래 이슈 ${what} 가 Jira 와 연결돼 있지 않아 Jira 에 중복 표시를 하지 못했습니다.
👉 할 일: 필요하면 Jira 에서 직접 표시해 주세요.`);
    }
  }
  if (ghClose && !closeShown) {
    await alert(`close-reason:${ghClose.r}`, `GitHub 에서 「${ghClose.r === 'duplicate' ? '중복' : '계획 안 함'}」 으로 닫았지만 Jira 에는 그 상태가 없어 「${target || J.fields.status}」 로만 닫았습니다.
👉 할 일: 닫은 이유를 남기려면 Jira 댓글로 적어 주세요.`);
  }
  if (jiraWrote) data = await jiraIssue(key, space);
  const J2 = jiraCommon(data, space);
  const wantCat = await statusCategory(space, J2.fields.status);
  const wantState = wantCat === 'done' ? 'closed' : 'open';

  // 3b) 이번에 닫혔으면(어느 쪽에서든) 양쪽 체크 상자를 모두 체크한다. 다시 열 때는 건드리지 않는다.
  const closedNow = wantState === 'closed' && prevState !== 'closed';
  if (closedNow) {
    const adf = checkAllAdf(data.fields.description);
    if (adf) {
      await jira('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}`, { fields: { description: adf } });
      log('· 닫힘 → Jira 체크 항목 모두 체크');
      data = await jiraIssue(key, space);
    }
  }
  // 3c) 닫기 전 상태 기억 — 닫히는 순간 직전 상태(완료 계열이 아닌 것)를 스냅숏에 남기고, 열리면 지운다
  let beforeClose = wantState === 'closed' ? S.beforeClose : undefined;
  if (closedNow) {
    for (const c of [J.fields.status, S.fields && S.fields.status]) {
      const cc = c ? await statusCategory(space, c) : null;
      if (cc && cc !== 'done') { beforeClose = c; break; }
    }
    if (beforeClose) log(`· 닫기 전 상태 기억: ${beforeClose}`);
  }

  // 4) GitHub 쓰기 — Jira(맞춘 뒤) 값을 GitHub 에 그린다
  const patch = {};
  const wantTitle = (isCopy ? `[JIRA ${key}] ` : '') + J2.title;
  if (issue.title !== wantTitle) patch.title = wantTitle;
  let user = parts.user, note = parts.note;
  if (bodyFrom === 'jira') {
    log('· 본문 Jira → GitHub');
    const desc = data.fields.description;
    ({ md: user, note } = await jiraToMd(desc && { ...desc, content: stripJiraSource(desc.content) }, key, ctx));
  }
  if (closedNow) {
    const checked = checkAllMd(user);
    if (checked !== user) { log('· 닫힘 → GitHub 체크 상자 모두 체크'); user = checked; }
  }
  // 「상위 에픽 키」 칸은 실제 Jira 상위를 따른다(v1 과 같음) — 칸을 고치면 Jira 설명도 같이 고친다
  let epicFixed = false;
  const sec = epicOf(user);
  const pk2 = J2.fields.parent || '';
  if (sec && (sec.key !== pk2 || (pk2 && !isEpicLink(sec.raw, pk2)))) {
    const fixed = setEpic(user, pk2, pk2 ? await epicSummary(pk2) : '');
    if (fixed !== user) {
      user = fixed;
      epicFixed = true;
      log(`· 본문 「상위 에픽 키」 칸 → ${pk2 || '(비움)'}`);
    }
  }
  // 맨 위 사람 줄 — 등록자(사본만) · 담당
  //   등록: 사본 작성자가 등록자 본인이 아니면(Jira 계정만 있음 · 본인 토큰이 없거나 실패해 봇이 만듦) 「등록: 이름(Jira)」
  const head = [];
  if (isCopy && J2.reporter) {
    const jiraOnlyRep = J2.reporter.startsWith('jira:');
    const author = String((issue.user && issue.user.login) || '').toLowerCase();
    if (jiraOnlyRep) head.push(personLine('등록', J2.reporter.slice(5)));
    else if (author !== J2.reporter.toLowerCase()) head.push(personLine('등록', (data.fields.reporter && data.fields.reporter.displayName) || J2.reporter));
  }
  const asgShown = asgHold !== undefined ? asgHold : J2.assignee;
  if (asgShown && String(asgShown).startsWith('jira:')) head.push(personLine('담당', String(asgShown).slice(5)));
  const wantBody = buildGhBody(head, user, note, key, isCopy ? ghSourceMd(key, J2.title) : '');
  if (String(issue.body || '').replace(/\r\n/g, '\n') !== wantBody) patch.body = wantBody;
  const curLabels = (issue.labels || []).map((l) => l.name);
  const statusLabel = pref && J2.fields.status ? pref + J2.fields.status : null;
  const wantLabels = [...J2.labels, ...(isCopy || curLabels.includes('jira') ? ['jira'] : []), ...(statusLabel ? [statusLabel] : [])];
  if (!eq([...curLabels].sort(), [...wantLabels].sort())) {
    if (statusLabel && !curLabels.includes(statusLabel)) await ensureLabel(statusLabel, wantCat);
    patch.labels = wantLabels;
  }
  const curAsg = (issue.assignees || []).map((a) => a.login);
  // 담당을 GitHub 에서 바꾼 실행이면 GitHub 담당은 건드리지 않는다(둘째 담당 · Jira 에 못 쓴 사람까지 지우지 않게)
  if (from.assignee !== 'gh' && asgHold === undefined) {
    const jiraOnly = J2.assignee && J2.assignee.startsWith('jira:');
    if ((J2.assignee == null || jiraOnly) && curAsg.length) patch.assignees = [];
    else if (J2.assignee && !jiraOnly && curAsg[0] !== J2.assignee) patch.assignees = [J2.assignee, ...curAsg.filter((l) => l !== J2.assignee)];
  }
  if (J2.type && (!issue.type || issue.type.name !== J2.type)) patch.type = J2.type;
  if (issue.state !== wantState) {
    patch.state = wantState;
    if (wantState === 'closed') {
      const cr = await jiraCloseReason(data, J2, space);
      patch.state_reason = cr.r;
      if (cr.r === 'duplicate' && cr.id) patch.duplicate_issue_id = cr.id;
      log(`· 닫힘 이유 ${cr.r}${cr.of ? ` (원래 이슈 #${cr.of})` : ''} ← Jira ${cr.via}`);
    }
  }
  // §5 GitHub PATCH 도 사람별로 — patch 항목마다 Jira 에서 바꾼 사람(jiraA → loginOf)으로. state_reason · duplicate 는 state 와 함께. 봇 · 없음은 공용.
  const patchAuthorOf = (k) => {
    // 본문: 변경 이력이 없으면(새 등록 때 정한 값) 그 값을 만든 사람 = 보고자
    if (k === 'body') return loginOf(jiraA.description || (data.fields.reporter && data.fields.reporter.accountId)) || null;
    const f = ({ title: 'summary', body: 'description', labels: 'labels', assignees: 'assignee', type: 'issuetype', state: 'status', state_reason: 'status', duplicate_issue_id: 'status' })[k];
    return f ? (loginOf(jiraA[f]) || null) : null; // Jira accountId → GitHub login(공용 계정 = 사용자) · 앱 · 미매핑 → null(공용)
  };
  // 그 칸을 바꾼 사람의 Jira accountId(표시용 — GitHub 계정이 없어 봇으로 갈 때 「GitHub 계정 없음」 인지 가리려고)
  const patchAuthorAcctOf = (k) => {
    if (k === 'body') return jiraA.description || (data.fields.reporter && data.fields.reporter.accountId) || null;
    const f = ({ title: 'summary', body: 'description', labels: 'labels', assignees: 'assignee', type: 'issuetype', state: 'status', state_reason: 'status', duplicate_issue_id: 'status' })[k];
    return f ? (jiraA[f] || null) : null;
  };
  // 한 묶음을 쓴다 — 사람 GitHub 토큰 4xx(권한 없음 등)면 그 쓰기만 봇으로. 중복 닫기 거절 → 계획 안 함(기존 처리 그대로).
  // botReason = lg 가 없어(봇으로 갈 때) 그 이유 — jiraOnly 면 '(공용 · GitHub 계정 없음)' · 미매핑이면 ''(그냥 봇)
  const writePatchGroup = async (sub, tok, lg, botReason) => {
    // lg(사람) 인데 봇으로 떨어질 때 — 토큰이 있다가 4xx 면 거절 · 주인 확인 실패 · 아예 없으면 미등록
    const personFail = '(공용 · ' + failWhy(lg, !!tok) + ')';
    const tryPatch = (t) => gh('PATCH', `/repos/${GH_REPO}/issues/${num}`, sub, undefined, t, { by: lg || null, reason: t ? '' : (lg ? personFail : (botReason || '')) });
    const withDupRetry = async (t) => {
      try { return await tryPatch(t); }
      catch (e) {
        if (sub.state_reason !== 'duplicate') throw e;
        warn(`GitHub 중복 닫기 실패 → not planned 로: ${e.message.slice(0, 200)}`);
        delete sub.duplicate_issue_id; sub.state_reason = 'not_planned';
        return await tryPatch(t);
      }
    };
    if (!tok) return withDupRetry(null);
    try { return await tryPatch(tok); }
    catch (e) {
      if (!(e && e.status >= 400 && e.status < 500)) { if (sub.state_reason === 'duplicate') return withDupRetry(tok); throw e; } // 5xx · 끊김은 봇으로 다시 안 함
      warn(`사람 GitHub 토큰 ${e.status} → 이 쓰기만 봇으로`);
      return withDupRetry(null);
    }
  };
  if (Object.keys(patch).length) {
    const groups = new Map();
    for (const k of Object.keys(patch)) {
      const lg = patchAuthorOf(k) || '';
      if (!groups.has(lg)) groups.set(lg, { sub: {}, acct: null });
      const g = groups.get(lg); g.sub[k] = patch[k];
      if (!lg && !g.acct) g.acct = patchAuthorAcctOf(k); // 봇 묶음 — 이유 가리려고 바꾼 사람 accountId 하나 기억
    }
    for (const [lg, g] of groups) {
      const botReason = !lg && g.acct && jiraOnlyName(g.acct) ? '(공용 · GitHub 계정 없음)' : '';
      const r = await writePatchGroup(g.sub, lg ? userToken(lg) : null, lg, botReason);
      if (r) issue = r;
    }
    log(`· GitHub #${num} 씀: ${Object.keys(patch).join(', ')}${groups.size > 1 ? ` · 사람별 ${groups.size}묶음` : ''}`);
  }
  // 다시 열림 → 동기화가 만든 Jira 중복 링크를 지운다(사람이 만든 링크는 그대로 둔다)
  if (wantState === 'open' && dupLink) {
    try { await jira('DELETE', `/rest/api/3/issueLink/${dupLink.id}`); log(`· 다시 열림 → Jira 중복 링크(${key} → ${dupLink.key}) 지움`); }
    catch (e) { warn(`중복 링크 지우기 실패: ${e.message.slice(0, 200)}`); }
    dupLink = undefined;
    data = await jiraIssue(key, space);
  }
  // 4b) 오른쪽 이슈 필드 — Jira 값(가까운 값)으로. 대응 없는 값 · 사람이 넣고 Jira 가 못 받은 값(hold)은 그대로 둔다
  const ghf = {};
  for (const p of pairs) {
    const gv = ghVals[p.gf.id] ?? null;
    const want = jiraToGhVal(p, J2.fields[p.id] || null);
    if (hold[p.id] !== undefined && eq(gv, hold[p.id])) { ghf[p.id] = gv; continue; }
    delete hold[p.id];
    if (want === undefined) { ghf[p.id] = gv; await alert(`field:${p.id}:${J2.fields[p.id]}`, `Jira 「${p.label}」 값 「${J2.fields[p.id]}」 은 GitHub 에 같은 값이 없어 GitHub 에는 반영하지 않았습니다.
👉 할 일: 필요하면 GitHub 에서 직접 골라 주세요.`); continue; }
    if (!eq(gv, want)) {
      await setGhField(num, p.gf.id, want);
      log(`· GitHub ${p.gf.name} → ${want ?? '(비움)'}`);
    }
    ghf[p.id] = want;
  }

  // 4c) 「상위 에픽 키」 칸을 맞췄으면 Jira 설명도 같은 글로(설명 안 칸이 실제 상위와 어긋나지 않게)
  let finalUser = ghParts(issue.body).user;
  if (epicFixed) { // 본문을 GitHub → Jira 로 보낸 실행이어도 그 글에는 고치기 전 키가 들어 있다
    let d2 = await ghToAdf(finalUser, issue.body_html, key, ctx);
    if (ghOrigin) d2 = withGhSource(d2, num, issue.title);
    await jira('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}`, { fields: { description: d2 } });
    data = await jiraIssue(key, space);
    log('· Jira 설명의 「상위 에픽 키」 칸도 맞춤');
  }
  // 4d) GitHub 원본의 Jira 사본 — 설명 끝 「### 출처」(제목이 바뀌었거나 사람이 지웠으면 다시)
  if (ghOrigin && !hasGhSource(data.fields.description, num, issue.title)) {
    await jira('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}`, { fields: { description: withGhSource(data.fields.description, num, issue.title) } });
    data = await jiraIssue(key, space);
    log('· Jira 설명 「출처」 칸 맞춤');
  }

  // 5) 댓글
  await syncComments(num, key, issue, ctx);

  // 6) 스냅숏
  finalUser = ghParts(issue.body).user;
  const next = { v: 2, gh: Number(num), title: J2.title, labels: J2.labels, type: J2.type, assignee: J2.assignee, fields: J2.fields,
    state: wantState, ghBody: sha(norm(finalUser)), jiraDesc: adfHash(data.fields.description) };
  if (beforeClose) next.beforeClose = beforeClose;
  if (dupLink) next.dupLink = dupLink;
  if (asgHold !== undefined) next.asgHold = asgHold;
  if (pairs.length) next.ghf = ghf;
  if (Object.keys(hold).length) next.ghHold = hold;
  if (ctx.alerts.length) next.alerts = [...new Set(ctx.alerts)];
  if (Object.keys(ctx.files).length) next.files = ctx.files;
  if (S.legacy) next.legacy = S.legacy; // v1 때 옛 댓글(옮기지 않는 것) — 계속 기억
  if (S.from) next.from = S.from;
  if (!eq(next, snap)) await jira('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}/properties/ghsync`, next);
  log(`✅ 맞춤 끝 — GitHub ${issue.html_url} ↔ Jira ${JIRA_BASE}/browse/${key}`);
}

// GitHub 댓글 → Jira: 사본 Jira 댓글에 속성 ghsync={gh:댓글번호,h:본문해시}. Jira 댓글 → GitHub: 사본 끝에 <!-- jira-comment:id -->.
// 수정은 원본 · 사본 어느 쪽에서 해도 반대쪽에 간다 — 마지막으로 맞춘 양쪽 모양(해시)을 속성에 기억해 바뀐 쪽을 찾고,
// 양쪽이 다 바뀌었으면 나중에 고친 쪽(updated 시각)을 따른다. 바뀐 것이 없으면 쓰지 않는다(반복 방지).
// 댓글 짝 속성: Jira 사본(GitHub 원본) = ghsync · Jira 원본 = ghsyncj
const cPropOf = (c) => { const p = (c.properties || []).find((x) => x.key === 'ghsync'); return p ? p.value : null; };
const cPropJ = (c) => { const p = (c.properties || []).find((x) => x.key === 'ghsyncj'); return p ? p.value : null; };
const jHash = (body) => sha(JSON.stringify(body || null));
async function jiraComments(key) {
  const jc = [];
  for (let at = 0; ; ) {
    const r = await jira('GET', `/rest/api/3/issue/${encodeURIComponent(key)}/comment?startAt=${at}&maxResults=100&expand=properties`);
    jc.push(...(r.comments || []));
    at += (r.comments || []).length;
    if (!r.comments || !r.comments.length || at >= r.total) break;
  }
  // 미리보기: 이번 실행에서 기록한 것으로 친 속성을 덧씌운다
  if (DRY) for (const c of jc) {
    const add = DRY_STORE.commentProp.get(String(c.id));
    if (add) c.properties = [...(c.properties || []).filter((x) => !(x.key in add)), ...Object.entries(add).map(([k, value]) => ({ key: k, value }))];
  }
  return jc;
}
// v1 규칙이 GitHub 댓글을 Jira 에 옮긴 사본 — 첫 문단이 굵은 「<아이디> 님 GitHub 댓글」 (짝 속성 없음)
const V1_GH_HEAD = /^(.+?) 님 GitHub 댓글(?: · .*)?$/;
function v1GhCopyLogin(c) {
  const first = (c.body && c.body.content && c.body.content[0]) || null;
  if (!first || first.type !== 'paragraph') return null;
  const m = V1_GH_HEAD.exec(adfText(first).trim());
  return m ? m[1].trim() : null;
}

async function syncComments(num, key, issue, ctx) {
  const ghc = await ghList(`/repos/${GH_REPO}/issues/${num}/comments`);
  const jc = await jiraComments(key);
  const propOf = cPropOf, propJ = cPropJ;
  const jGet = (id) => jira('GET', `/rest/api/3/issue/${encodeURIComponent(key)}/comment/${id}`);
  const later = (a, b) => Date.parse(a) > Date.parse(b);
  const legacyGh = ctx.legacyGh || {};
  let n = 0;
  // GitHub 원본 ↔ Jira 사본
  const jByGh = new Map(jc.filter(propOf).map((c) => [String(propOf(c).gh), c]));
  for (const c of ghc) {
    if (RE_CMARK.test(c.body || '') || RE_V1CMARK.test(c.body || '') || (c.user && c.user.type === 'Bot')) continue;
    const h = sha(norm(c.body));
    const ex = jByGh.get(String(c.id));
    // v1 때 달린 댓글인데 Jira 사본을 찾지 못한 것 — 고치지 않았으면 옮기지 않는다(옛 사본이 있을 수 있어 겹치지 않게)
    if (!ex && legacyGh[String(c.id)] === h) continue;
    const p = ex ? propOf(ex) : null;
    const gChanged = !ex || p.h !== h;
    const jChanged = !!(ex && p.jh && jHash(ex.body) !== p.jh);
    if (!gChanged && !jChanged) {
      if (ex && !p.jh) await jira('PUT', `/rest/api/3/comment/${ex.id}/properties/ghsync`, { ...p, jh: jHash(ex.body) }); // 옛 사본: 지금 모양을 기억
      continue;
    }
    if (jChanged && (!gChanged || later(ex.updated, c.updated_at))) {
      // Jira 사본을 고침 → GitHub 원본 댓글에 쓴다(맨 위 「… 님 GitHub 댓글」 줄은 빼고 — 「· 원문」 링크가 붙은 머리 줄도)
      const body = JSON.parse(JSON.stringify(ex.body));
      const first = (body.content || [])[0];
      if (first && first.type === 'paragraph' && /님 GitHub 댓글$/.test(((first.content || [])[0] || {}).text || '')) body.content.shift();
      const { md } = await jiraToMd(body, key, ctx);
      const upd = await gh('PATCH', `/repos/${GH_REPO}/issues/comments/${c.id}`, { body: md || '_(빈 댓글)_' });
      await jira('PUT', `/rest/api/3/comment/${ex.id}/properties/ghsync`, { gh: c.id, h: sha(norm(upd.body)), jh: jHash(ex.body) });
      log(`· 댓글 Jira 사본 ${ex.id} 수정 → GitHub 원본 ${c.id}`);
      n++;
      continue;
    }
    const adf = await ghToAdf(c.body, c.body_html, key, ctx);
    let h2 = h;
    if (ctx.ghTabled) {
      // 웹에서 올린 파일 줄 → 첨부 표로 GitHub 댓글도 고쳐 쓴다(글 내용은 그대로)
      const upd = await gh('PATCH', `/repos/${GH_REPO}/issues/comments/${c.id}`, { body: ctx.ghTabled }, undefined, null, { skip: true });
      h2 = sha(norm(upd.body));
      log(`· GitHub 댓글 ${c.id} 업로드 파일 줄 → 첨부 표`);
    }
    // 머리 줄은 「이름 님 GitHub 댓글」만(원문 링크는 넣지 않는다 — 「· 원문」 이 붙은 머리 줄도 같은 머리로 읽는다)
    adf.content.unshift({ type: 'paragraph', content: [
      { type: 'text', text: `${c.user.login} 님 GitHub 댓글`, marks: [{ type: 'strong' }] },
    ] });
    let jid;
    if (!ex) {
      const made = await jira('POST', `/rest/api/3/issue/${encodeURIComponent(key)}/comment`, { body: adf, properties: [{ key: 'ghsync', value: { gh: c.id, h: h2 } }] }, { as: c.user.login });
      jid = made.id;
      log(`· 댓글 GitHub ${c.id} → Jira 새 댓글(작성자 ${c.user.login})`);
    } else {
      jid = ex.id;
      await jira('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}/comment/${ex.id}`, { body: adf }, { as: c.user.login });
      log(`· 댓글 GitHub ${c.id} → Jira ${ex.id} 수정(작성자 ${c.user.login})`);
    }
    // Jira 가 저장한 모양을 기억해 두면 다음에 사람이 Jira 사본을 고쳤는지 알 수 있다
    await jira('PUT', `/rest/api/3/comment/${jid}/properties/ghsync`, { gh: c.id, h: h2, jh: jHash((await jGet(jid)).body) });
    n++;
  }
  // Jira 원본 ↔ GitHub 사본 — 원본 Jira 댓글 속성 ghsyncj={gc:GitHub 사본 번호, gh:사본 해시, jh:원본 해시}
  // 사본 찾기: v2 표시 <!-- jira-comment:id --> · v1 표시 <!-- sync:jira:id --> · 짝 속성 ghsyncj.gc(번호 없는 v1 표시를 이어받은 짝)
  const ghByJ = new Map();
  for (const c of ghc) {
    const m = RE_CMARK.exec(c.body || '') || RE_V1CMARK.exec(c.body || '');
    if (m && m[1]) ghByJ.set(m[1], c);
  }
  // 머리 줄 — v2 「**이름 님 Jira 댓글**」 · v1 「**이름** 님 Jira 댓글」
  const RE_JHEAD = /^\*\*[^\n]*님 Jira 댓글(?:\*\*)?[^\n]*\n*/;
  for (const c of jc) {
    if (propOf(c)) continue;
    const jp = propJ(c);
    const ex = ghByJ.get(String(c.id)) || (jp && jp.gc ? ghc.find((g) => String(g.id) === String(jp.gc)) : undefined);
    const jh = jHash(c.body);
    const jChanged = !jp || jp.jh !== jh;
    // v1 때 달린 댓글인데 짝을 찾지 못한 것(legacy) — 고치지 않았으면 옮기지 않는다
    if (!ex && jp && jp.legacy && !jChanged) continue;
    // v1 규칙이 만든 「… 님 GitHub 댓글」 사본은 원본이 GitHub 에 있다 — 짝 속성이 없어도 GitHub 으로 되돌려 보내지 않는다
    if (!jp && v1GhCopyLogin(c)) { log(`· Jira 댓글 ${c.id} 는 v1 이 옮긴 GitHub 댓글 사본(짝 기록 없음) → 건너뜀`); continue; }
    const gChanged = !!(ex && jp && jp.gh !== sha(norm(ex.body)));
    if (ex && gChanged && (!jChanged || later(ex.updated_at, c.updated))) {
      // GitHub 사본을 고침 → Jira 원본 댓글에 쓴다(머리 줄 · 손실 안내 · 짝 표시는 빼고)
      const head = (RE_JHEAD.exec(norm(ex.body)) || [''])[0].trim();
      const user = norm(ex.body).replace(RE_JHEAD, '').replace(RE_NOTE, '').replace(RE_CMARK, '').replace(RE_V1CMARK_G, '').replace(/^_\(빈 댓글\)_$/m, '').trim();
      const adf = await ghToAdf(user, ex.body_html, key, ctx);
      let ghBody = ex.body;
      if (ctx.ghTabled) {
        const upd = await gh('PATCH', `/repos/${GH_REPO}/issues/comments/${ex.id}`, { body: [head, ctx.ghTabled, `<!-- jira-comment:${c.id} -->`].filter(Boolean).join('\n\n') }, undefined, null, { skip: true });
        ghBody = upd.body;
        log(`· GitHub 댓글 ${ex.id} 업로드 파일 줄 → 첨부 표`);
      }
      await jira('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}/comment/${c.id}`, { body: adf });
      await jira('PUT', `/rest/api/3/comment/${c.id}/properties/ghsyncj`, { gc: ex.id, gh: sha(norm(ghBody)), jh: jHash((await jGet(c.id)).body) });
      log(`· 댓글 GitHub 사본 ${ex.id} 수정 → Jira 원본 ${c.id}`);
      n++;
      continue;
    }
    if (ex && !jChanged) continue;
    const { md, note } = await jiraToMd(c.body, key, ctx);
    const who = (c.author && c.author.displayName) || 'Jira 사용자';
    // 머리 줄은 「이름 님 Jira 댓글」만(원문 링크 없음 · RE_JHEAD 는 「· [원문](…)」 이 붙은 머리도 읽는다)
    const body = [`**${who} 님 Jira 댓글**`, md || '_(빈 댓글)_', note, `<!-- jira-comment:${c.id} -->`].filter(Boolean).join('\n\n');
    // 작성자: 새 댓글 = 단 사람(author) · 수정 = 고친 사람(updateAuthor). 대조표 → GitHub 토큰(없거나 실패하면 봇).
    // 사본은 끝의 <!-- jira-comment:id --> 로 알아보므로 사람 이름으로 만들어도 원본으로 잘못 읽지 않는다.
    const cLogin = loginOf(c.author && c.author.accountId);
    const eLogin = loginOf(c.updateAuthor && c.updateAuthor.accountId) || cLogin;
    let out = ex;
    if (!ex) {
      const cTok = userToken(cLogin);
      if (cTok) {
        try { out = await gh('POST', `/repos/${GH_REPO}/issues/${num}/comments`, { body }, undefined, cTok, { by: cLogin }); log(`· 댓글 Jira ${c.id} → GitHub 새 댓글(작성자 ${cLogin})`); }
        catch (e) { out = null; log(`· 댓글 ${cLogin} 토큰으로 못 씀(${e.message.slice(0, 120)}) → 봇으로`); }
      }
      if (!out) { out = await gh('POST', `/repos/${GH_REPO}/issues/${num}/comments`, { body }, undefined, null, { by: cLogin || null, reason: cLogin ? '(공용 · ' + failWhy(cLogin, !!cTok) + ')' : (jiraOnlyName(c.author && c.author.accountId) ? '(공용 · GitHub 계정 없음)' : '') }); log(`· 댓글 Jira ${c.id} → GitHub 새 댓글`); }
      n++;
    }
    else if (norm(ex.body) !== norm(body)) {
      const eTok = userToken(eLogin);
      out = null;
      if (eTok) {
        try { out = await gh('PATCH', `/repos/${GH_REPO}/issues/comments/${ex.id}`, { body }, undefined, eTok, { by: eLogin }); log(`· 댓글 Jira ${c.id} → GitHub ${ex.id} 수정(작성자 ${eLogin})`); }
        catch (e) { out = null; log(`· 댓글 수정 ${eLogin} 토큰으로 못 씀(${e.message.slice(0, 120)}) → 봇으로`); }
      }
      if (!out) { out = await gh('PATCH', `/repos/${GH_REPO}/issues/comments/${ex.id}`, { body }, undefined, null, { by: eLogin || null, reason: eLogin ? '(공용 · ' + failWhy(eLogin, !!eTok) + ')' : (jiraOnlyName((c.updateAuthor || c.author) && (c.updateAuthor || c.author).accountId) ? '(공용 · GitHub 계정 없음)' : '') }); log(`· 댓글 Jira ${c.id} → GitHub ${ex.id} 수정`); }
      n++;
    }
    await jira('PUT', `/rest/api/3/comment/${c.id}/properties/ghsyncj`, { gc: out.id, gh: sha(norm(out.body)), jh });
  }
  log(`· 댓글 GitHub ${ghc.length}개 · Jira ${jc.length}개 확인, ${n}건 옮김`);
}

// ──────────────── 짝 찾기 · 만들기 ────────────────
// GitHub 원본 번호로 Jira 사본 찾기 — 짝 레이블 「gh-<저장소>-<번호>」 · 요약 「[GH #번호]」 로 후보를 찾고,
// 사본 속성 ghsync.gh 가 같은 번호일 때만 짝으로 본다(다른 저장소 · 비슷한 제목을 잘못 잡지 않게)
async function jiraFindByGhNum(num) {
  const projects = Object.keys(SPACES).filter((k) => !k.startsWith('_'));
  if (!projects.length) return null;
  const jql = `project in (${projects.join(',')}) AND (labels = "${ghPairLabel(num)}" OR summary ~ "\\"GH #${num}\\"") ORDER BY created ASC`;
  let r;
  try { r = await jira('POST', '/rest/api/3/search/jql', { jql, fields: ['summary'], maxResults: 10 }); }
  catch (e) { warn(`기존 Jira 사본 찾기 실패: ${e.message.slice(0, 150)}`); return null; }
  for (const it of (r && r.issues) || []) {
    const p = await jiraProp(it.key);
    if (p && Number(p.gh) === Number(num)) { log(`· 본문 짝 표식이 없지만 기존 Jira 사본 ${it.key} 를 찾음 → 새로 만들지 않고 표식을 되살린다`); return it.key; }
  }
  return null;
}

async function resolvePair() {
  const event = env.EVENT_NAME || 'workflow_dispatch';
  let num = env.GITHUB_ISSUE || '';
  let key = env.JIRA_KEY || '';
  let origin = event === 'workflow_dispatch' ? (env.DIRECTION === 'github-to-jira' ? 'gh' : 'jira') : 'gh';
  // Jira 동기화 요청 규칙이 Jira 속성(ghsync.gh)에서 꺼내 준 GitHub 번호가 정말 이 업무의 짝인지 본다(이슈를 지웠거나 옮겼을 수 있다)
  if (num && key && event === 'workflow_dispatch') {
    const it = await gh('GET', `/repos/${GH_REPO}/issues/${num}`).catch(() => null);
    const k = it && (titleKey(it.title) || markKey(it.body));
    if (!it || it.pull_request || (k && k !== key)) { log(`· 받은 GitHub #${num} 은 ${key} 의 짝이 아님 → 짝을 다시 찾음`); num = ''; }
  }
  if (num && !key) {
    const it = await gh('GET', `/repos/${GH_REPO}/issues/${num}`);
    key = titleKey(it.title) || markKey(it.body) || '';
    // 본문의 짝 표식이 지워졌어도(웹에서 본문 전체를 고치다 지우는 일이 있다) 이미 있는 Jira 사본을 찾는다 — 새로 만들지 않는다
    if (!key) key = (await jiraFindByGhNum(num)) || '';
  }
  if (key && !num) {
    const p = await jiraProp(key);
    if (p && p.gh) {
      const it = await gh('GET', `/repos/${GH_REPO}/issues/${p.gh}`).catch(() => null);
      if (it && (titleKey(it.title) === key || markKey(it.body) === key)) num = String(p.gh);
    }
    if (!num) { const f = await ghFindByJiraKey(key); if (f) num = String(f.number); }
  }
  return { num, key, origin };
}

async function collectFields() {
  const owner = GH_REPO.split('/')[0];
  const list = (await gh('GET', `/orgs/${owner}/issue-fields`)).map(slimField);
  const file = new URL('./spaces.json', import.meta.url);
  const sp = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = JSON.stringify(sp._ghFields || null);
  sp._ghFields = list;
  // 유형별로 보이는 필드도 함께 수집 — 실행 때 GraphQL 로 못 읽으면(조직 권한 없는 기본 토큰) 이것을 쓴다
  _pinned = undefined;
  const pin = await ghPinned();
  if (pin) { sp._ghPinned = pin; log(`보이는 필드: ${Object.entries(pin.types).map(([t, f]) => `${t}=${f.join('·') || '없음'}`).join(' / ')} / 유형 없음=${pin.none.join('·') || '없음'}`); }
  fs.writeFileSync(file, JSON.stringify(sp, null, 2) + '\n');
  log(`조직 ${owner} 이슈 필드 ${list.length}개 → spaces.json _ghFields${before === JSON.stringify(list) ? '(바뀐 것 없음)' : '(갱신)'}`);
  for (const o of list) log(`  - ${o.name} (${o.data_type})${o.options ? ': ' + o.options.map((x) => x.name).join(' · ') : ''}`);
  for (const [pk, space] of Object.entries(sp)) {
    if (pk.startsWith('_') || !space.fields) continue;
    log(`스페이스 ${pk} 짝 초안(이름 기준 — 형식은 실행 때 Jira 정의로 다시 확인):`);
    for (const f of space.fields) {
      const names = f.gh ? [f.gh] : (AUTO_PAIR[f.id] || (f.id === space.startDateField ? ['Start date'] : [f.label]));
      const g = list.find((o) => names.some((n) => n.toLowerCase() === o.name.toLowerCase()));
      log(`  - ${f.label}(${f.id}) ↔ ${g ? g.name : '짝 없음 → GitHub 에 안 보임'}`);
    }
  }
}

// 처음 한 번(관리자): 스페이스마다 상태(분류) · 해결 사유 · 닫기 화면의 해결 사유 칸 · 중복 링크를 읽어 closeReason 초안을 보인다(읽기만)
async function collectStatuses() {
  const links = ((await jira('GET', '/rest/api/3/issueLinkType')).issueLinkTypes || []).map((t) => `${t.name}(${t.outward})`);
  const res = (await jira('GET', '/rest/api/3/resolution').catch(() => [])) || [];
  log(`중복 링크 후보: ${links.filter((x) => /dup|중복/i.test(x)).join(' · ') || '(없음)'} · 해결 사유(사이트): ${res.map((r) => r.name).join(' · ') || '(없음)'}`);
  for (const [pk, space] of Object.entries(SPACES)) {
    if (pk.startsWith('_') || !space.types) continue;
    const list = await jira('GET', `/rest/api/3/project/${pk}/statuses`);
    const st = new Map();
    for (const it of list || []) for (const s of it.statuses || []) st.set(s.name, s.statusCategory && s.statusCategory.key);
    const done = [...st].filter(([, c]) => c === 'done').map(([n]) => n);
    log(`스페이스 ${pk}: 상태 ${[...st].map(([n, c]) => `${n}(${c})`).join(' · ')}`);
    log(`  완료 분류 상태 ${done.join(' · ')} — 「계획 안 함」 을 나타내는 상태는 closeReason.notPlannedStatuses, 「중복」 은 closeReason.duplicateStatuses 에 적는다. doneStatus 는 ${space.doneStatus}`);
    const cfg = closeCfg(space);
    log(`  지금 설정: notPlannedStatuses=${JSON.stringify(cfg.npStatuses)} · duplicateStatuses=${JSON.stringify(cfg.dupStatuses)} · 해결 사유 ${cfg.npRes.length}개 · 중복 링크 ${cfg.dupLink}`);
    for (const n of [...cfg.npStatuses, ...cfg.dupStatuses]) if (st.get(n) !== 'done') warn(`  ⚠ 설정한 상태 「${n}」 가 이 스페이스에 없거나 완료 분류가 아닙니다`);
  }
  log('닫기 화면에 해결 사유 칸이 있는지는 업무마다 실행 때 확인한다(없으면 상태로만 나타내고, 그것도 없으면 알림).');
}

// ──────────────── 저장소 전체: 미리보기 · v1 짝 이어받기 ────────────────
// 짝 = GitHub 이슈 중 짝 표시(제목 [JIRA 키] · 본문 <!-- jira:키 -->)가 있고 그 스페이스가 spaces.json 에 있는 것
async function listPairs() {
  const all = (await ghList(`/repos/${GH_REPO}/issues?state=all`)).filter((it) => !it.pull_request);
  const pairs = [], lone = [];
  for (const it of all) {
    const key = titleKey(it.title) || markKey(it.body);
    if (key && SPACES[key.split('-')[0]]) pairs.push({ num: String(it.number), key, it });
    else lone.push(it);
  }
  pairs.sort((a, b) => Number(a.num) - Number(b.num));
  return { pairs, lone };
}
// 스페이스에서 GitHub 짝이 없는 업무(에픽 등 위 단계 제외) — 고치면 동기화 요청 규칙이 깨워 GitHub 사본을 새로 만들 수 있는 것
async function jiraLoneItems(pairedKeys) {
  const out = [];
  for (const pk of Object.keys(SPACES).filter((k) => !k.startsWith('_'))) {
    let token;
    do {
      const r = await jira('POST', '/rest/api/3/search/jql', { jql: `project = ${pk} AND hierarchyLevel = 0 ORDER BY created ASC`, fields: ['summary', 'created'], maxResults: 100, ...(token ? { nextPageToken: token } : {}) });
      for (const it of (r && r.issues) || []) if (!pairedKeys.has(it.key)) out.push({ key: it.key, created: it.fields.created, summary: it.fields.summary });
      token = r && r.nextPageToken;
    } while (token);
  }
  return out;
}
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
function writeReport(md) {
  // 표는 실행 Summary 탭(GITHUB_STEP_SUMMARY)과 리포트 파일에만 둔다. 로그(stdout)에는 결과 한 줄만 보이게 —
  // 로그에 남길 때는 줄마다 ::debug:: 를 붙여(한 번에 찍으면 둘째 줄부터 접두어가 빠져 보이는 로그로 샌다) 디버그에만 나오게.
  for (const line of md.split('\n')) dbg(line);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, md + '\n');
  if (env.SYNC_REPORT_FILE) fs.writeFileSync(env.SYNC_REPORT_FILE, md + '\n');
}
// §3-3 — 주인 확인에 실패해 이번 실행에서 안 쓴 열쇠(「○○ 님 — 열쇠 확인 실패(이유)」)
const keyFailNote = () => (KEY_BAD.length ? '⚠ 토큰 확인 실패(이번 실행에서 안 씀): ' + KEY_BAD.map((k) => `${k.person} 님(${k.side} · ${k.why})`).join(', ') : '');
// 실행 요약 표 — 이번 실행에 쓴 것 한 줄씩. 아무것도 안 쓰면 「바뀐 것 없음」.
function writeSummaryTable(num, key, fresh) {
  const link = `GitHub ${num ? '#' + num : '?'} ↔ Jira ${key || '?'}${fresh ? ' (새로 연결)' : ''}`;
  const note = keyFailNote();
  if (!REPORT.length) { writeReport(`## 이슈 동기화 결과\n\n${link}${note ? `\n\n${note}` : ''}\n\n바뀐 것 없음`); return; }
  const by = [...new Set(REPORT.filter((r) => r.by && r.by !== '자동 처리').map((r) => r.by))];
  const rows = REPORT.map((r) => `| ${r.n} | ${r.time} | ${r.side} | ${r.tgt} | ${r.item} | ${r.by} | ${r.account} |`).join('\n');
  writeReport(`## 이슈 동기화 결과\n\n${link}${by.length ? ` · 바꾼 사람: ${by.join(', ')}` : ''}${note ? `\n\n${note}` : ''}\n\n| 순서 | 시간 | 위치 | 대상 | 항목 | 변경자 | 반영 계정 |\n|---|---|---|---|---|---|---|\n${rows}`);
}
// 공용(Jira)·봇(GitHub)으로 대신 쓴 것 — 사람이 겨눠졌는데 토큰이 없거나 거절돼(또는 GitHub 계정이 없어) 떨어진 것.
// 대체 이유는 모두 「(공용 …」 으로 적는다(토큰 거절 · 토큰 미등록 · 토큰 미등록/거절 · GitHub 계정 없음).
const sharedFallbacks = () => REPORT.filter((r) => /\(공용/.test(r.account)).length;
function resultLine(num, key) {
  const kf = KEY_BAD.length ? ` · 토큰 확인 실패 ${KEY_BAD.length}건` : '';
  if (!REPORT.length) { say(`완료 — GitHub #${num} ↔ Jira ${key} · 바뀐 것 없음${kf}`); return; }
  say(`완료 — GitHub #${num} ↔ Jira ${key} · 반영 ${REPORT.length}건 · 공용으로 대신 쓴 것 ${sharedFallbacks()}건${kf}`);
}
// 필드 점검 — 저장소 GitHub 이슈 필드(유형별로 보이는 것)와 스페이스 Jira 칸(유형별)을 spaces.json 짝과 대조한다(읽기만)
//   ⚠ 짝인데 Jira 유형에 칸이 없음 → GitHub 에서 바꾸면 Jira 쓰기 실패 · GitHub 어느 유형에도 안 보임 → 옮겨도 화면에 안 보임
//   ◻ 한쪽에만 있는 칸 → 옮기지 않음(짝을 더할지 사람이 정한다)
// 점검에서 빼는 칸: 동기화가 따로 다루는 시스템 칸 · 사람이 값을 넣지 않는 Jira Software 칸(순위 · 개발 정보 · 스프린트) — 칸 id 가 아니라 종류로 가린다
const JIRA_NOISE = /^(summary|description|issuetype|project|reporter|attachment|issuelinks|issuerestriction|labels|assignee|parent|environment|fixVersions|timetracking)$/;
const JIRA_NOISE_TYPE = /:(gh-lexo-rank|devsummarycf|gh-sprint|gh-epic-link)$/;
const jiraNoise = (id, f) => JIRA_NOISE.test(id) || JIRA_NOISE_TYPE.test((f && f.schema && f.schema.custom) || '');
async function fieldCheck() {
  const L = ['', '### 필드 점검 — GitHub 이슈 필드 ↔ Jira 칸', ''];
  const pinned = await ghPinned();
  const ofs = await orgFields();
  if (pinned) L.push(`- GitHub 보이는 필드: ${Object.entries(pinned.types).map(([t, f]) => `${t} = ${f.join(' · ') || '없음'}`).join(' / ')} / 유형 없음 = ${pinned.none.join(' · ') || '없음'}`);
  else L.push('- GitHub 유형별 보이는 필드를 읽지 못함(GraphQL 권한) — collect-fields 로 spaces.json `_ghPinned` 를 채운다');
  const ghVisibleAnywhere = (name) => !pinned || [...Object.values(pinned.types), pinned.none].some((l) => l.some((n) => n.toLowerCase() === name.toLowerCase()));
  for (const [pk, space] of Object.entries(SPACES).filter(([k, s]) => !k.startsWith('_') && s.types)) {
    // Jira 유형별 칸(만들기 화면 정의)
    const jt = {};
    for (const [gname, tid] of Object.entries(space.types)) {
      try {
        const r = await jira('GET', `/rest/api/3/issue/createmeta/${pk}/issuetypes/${tid}?maxResults=200`);
        jt[gname] = Object.fromEntries(((r && (r.fields || r.values)) || []).map((f) => [f.fieldId, f]));
      } catch (e) { jt[gname] = null; L.push(`- ⚠ Jira ${pk} 유형 ${tid}(${gname}) 칸 읽기 실패: ${easyError(e.message)}`); }
    }
    L.push('', `스페이스 **${pk}**`, '', '| GitHub 필드 | Jira 칸 | GitHub 보이는 유형 | Jira 에 칸 있는 유형 | 판정 |', '|---|---|---|---|---|');
    const usedGh = new Set(), usedJ = new Set();
    for (const f of space.fields || []) {
      const names = f.gh ? [f.gh] : (AUTO_PAIR[f.id] || (f.id === space.startDateField ? ['Start date'] : [f.label]));
      const gf = ofs.find((o) => names.some((n) => n.toLowerCase() === o.name.toLowerCase()));
      usedJ.add(f.id);
      if (gf) usedGh.add(gf.name.toLowerCase());
      const ghTypes = pinned && gf ? [...Object.entries(pinned.types).filter(([, l]) => l.some((n) => n.toLowerCase() === gf.name.toLowerCase())).map(([t]) => t), ...(pinned.none.some((n) => n.toLowerCase() === gf.name.toLowerCase()) ? ['(유형 없음)'] : [])] : null;
      const jHas = Object.entries(jt).filter(([, m]) => m && m[f.id]).map(([t]) => t);
      const jMiss = Object.entries(jt).filter(([, m]) => m && !m[f.id]).map(([t]) => t);
      let verdict = '✅';
      if (!gf) verdict = '⚠ GitHub 에 같은 이름 필드 없음 — 안 옮김';
      else if (ghTypes && !ghTypes.length) verdict = '⚠ GitHub 어느 유형에도 안 보임 — 옮겨도 화면에 안 보임';
      else if (jMiss.length) verdict = `⚠ Jira ${jMiss.join(' · ')} 에 칸 없음 — 그 유형은 GitHub 값을 Jira 에 못 씀`;
      L.push(`| ${gf ? gf.name : '-'} | ${f.label}(${f.id}) | ${ghTypes ? ghTypes.join(' · ') || '없음' : '?'} | ${jHas.join(' · ') || '없음'} | ${verdict} |`);
    }
    // 한쪽에만 있는 칸
    const ghOnly = ofs.filter((o) => !usedGh.has(o.name.toLowerCase()) && ghVisibleAnywhere(o.name)).map((o) => o.name);
    const jOnly = new Map();
    for (const m of Object.values(jt)) for (const [id, f] of Object.entries(m || {})) if (!usedJ.has(id) && !jiraNoise(id, f) && id !== space.startDateField) jOnly.set(id, f.name);
    if (ghOnly.length) L.push(`- ◻ GitHub 에만 보이는 필드(옮기지 않음): ${ghOnly.join(' · ')}`);
    if (jOnly.size) L.push(`- ◻ Jira 에만 있는 칸(옮기지 않음): ${[...jOnly].map(([id, n]) => `${n}(${id})`).join(' · ')}`);
    if (space.startDateOnCreate && space.startDateField) L.push(`- GitHub 에서 등록할 때 Jira ${space.startDateField} = GitHub 등록일(한국 시간)`);
  }
  return L;
}
async function previewAll() {
  if (!DRY) die('preview 는 미리보기(SYNC_DRY_RUN=1)에서만 돈다');
  await loadPeople();
  const { pairs, lone } = await listPairs();
  const rows = [];
  for (const p of pairs) {
    RUN.num = p.num; RUN.key = p.key;
    const before = PLAN.length;
    let err = null, v1 = false;
    try {
      v1 = !(await jiraProp(p.key));
      await reconcile(p.num, p.key, titleKey(p.it.title) ? 'jira' : 'gh', false);
    } catch (e) { err = easyError(e.message); warn(`#${p.num} ↔ ${p.key}: ${e.message.slice(0, 300)}`); }
    rows.push({ ...p, v1, err, w: PLAN.slice(before) });
  }
  RUN.num = null; RUN.key = null;
  const jLone = await jiraLoneItems(new Set(pairs.map((p) => p.key)));
  const count = (w, k) => w.filter((x) => x.kind === k).length;
  const tot = { new: 0, content: 0, record: 0, slack: 0 };
  for (const r of rows) { tot.new += count(r.w, 'new'); tot.content += count(r.w, 'content'); tot.record += count(r.w, 'record'); tot.slack += r.w.filter((x) => x.side === 'Slack').length; }
  const since = CREATE_SINCE != null ? new Date(CREATE_SINCE).toISOString().slice(0, 10) : null;
  const L = [];
  L.push(`## 미리보기 — ${GH_REPO} (아무것도 쓰지 않음)`, '');
  L.push(`- 짝 ${rows.length}개 — v1 에서 넘어온 짝 ${rows.filter((r) => r.v1).length}개 · v2 짝 ${rows.filter((r) => !r.v1).length}개 · 오류 ${rows.filter((r) => r.err).length}개`);
  L.push(`- 쓸 것 — **새로 만들 것 ${tot.new}건**(이슈 · 업무 · 댓글 — 전환에서는 0 이어야 함) · 내용 고칠 것 ${tot.content}건 · 짝 기록 ${tot.record}건(화면에 안 보임) · 알림 ${tot.slack}건`);
  L.push(`- 전환 시각(SYNC_CREATE_SINCE): ${since || '없음 — 짝 없는 옛 이슈 · 업무도 고치면 새로 등록됨'}`, '');
  L.push('| 짝 | 판 | 새로 | 내용 | 기록 | 알림 | 쓸 것 |', '|---|---|--:|--:|--:|--:|---|');
  for (const r of rows) {
    const what = r.err ? `❌ ${r.err}` : [...new Set(r.w.filter((x) => x.kind !== 'record').map((x) => `${x.side} ${x.what}`))].join(' · ') || '—';
    L.push(`| #${r.num} ↔ ${r.key} | ${r.v1 ? 'v1' : 'v2'} | ${count(r.w, 'new')} | ${count(r.w, 'content')} | ${count(r.w, 'record')} | ${r.w.filter((x) => x.side === 'Slack').length} | ${cell(what)} |`);
  }
  const fate = (t) => (CREATE_SINCE != null && Date.parse(t) < CREATE_SINCE ? '고쳐도 새로 등록 안 함(전환 전)' : '⚠ 고치면 반대쪽에 새로 등록됨');
  L.push('', `### 짝 없는 GitHub 이슈 ${lone.length}개`);
  for (const it of lone) L.push(`- #${it.number} ${cell(String(it.title).slice(0, 60))} (${String(it.created_at).slice(0, 10)}) — ${fate(it.created_at)}`);
  L.push('', `### 짝 없는 Jira 업무 ${jLone.length}개 (에픽 제외)`);
  const groups = {};
  for (const x of jLone) (groups[fate(x.created)] ||= []).push(x.key);
  for (const [f, keys] of Object.entries(groups)) L.push(`- ${f}: ${keys.length}개 — ${keys.slice(0, 40).join(' · ')}${keys.length > 40 ? ' …' : ''}`);
  try { L.push(...(await fieldCheck())); } catch (e) { L.push('', `### 필드 점검 — 실패: ${easyError(e.message)}`); warn(`필드 점검 실패: ${e.message.slice(0, 300)}`); }
  writeReport(L.join('\n'));
}
async function adoptAll() {
  await loadPeople();
  const { pairs } = await listPairs();
  let n = 0, skip = 0, fail = 0;
  for (const p of pairs) {
    RUN.num = p.num; RUN.key = p.key;
    try {
      if (await jiraProp(p.key)) { skip++; continue; }
      const space = spaceOf(p.key);
      const issue = await ghIssue(p.num);
      const data = await jiraIssue(p.key, space);
      log(`▶ #${p.num} ↔ ${p.key}`);
      await adoptPair(p.num, p.key, space, issue, data);
      n++;
    } catch (e) { fail++; warn(`#${p.num} ↔ ${p.key}: ${e.message.slice(0, 300)}`); }
  }
  writeReport(`## v1 짝 이어받기 — ${GH_REPO}${DRY ? ' (미리보기 — 쓰지 않음)' : ''}\n\n- 이어받음 ${n}개 · 이미 v2 ${skip}개 · 실패 ${fail}개`);
}

// ──────────────── who — 누가 바꿨나(6칸 출력) ────────────────
// 공용 열쇠로 읽기만. 이번 짝에서 바뀐 항목의 작성자(사람)를 방향별로 모아 $GITHUB_OUTPUT 에 jira1..3 · gh1..3 로 낸다.
//   jira1..3 = GitHub 에서 바꾼 사람(→ JIRA_USER_TOKEN) · gh1..3 = Jira 에서 바꾼 사람(→ GH_USER_TOKEN). 값 = 대문자 아이디.
// 짝 맞추기 단계가 쓰기 직전에 기록을 다시 읽어 작성자를 맞추므로, 여기서 넉넉히 내도(안 쓰는 칸) 문제없다.
async function whoMode() {
  await loadPeople();
  let num, key;
  try { ({ num, key } = await resolvePair()); } catch (e) { warn(`who: 짝 찾기 실패 → 전원 공용: ${e.message.slice(0, 120)}`); return; }
  const jira = new Set(), gh = new Set();
  const addJira = (login) => { if (login && !isBotLogin(login)) jira.add(idKey(login)); };
  const addGh = (acct) => { const l = loginOf(acct); if (l && !isBotLogin(l)) gh.add(idKey(l)); };
  if (num) {
    // GitHub 쪽 사람(→ JIRA_USER_TOKEN): 필드 바꾼 사람 + 이슈 작성자(새 등록) + 댓글 작성자
    const space = key ? spaceOf(key) : null;
    const pref = space && space.statusLabelPrefix;
    const isSync = (n) => n === 'jira' || n === GH_MARK_LABEL || isGhPairLabel(n) || (pref && String(n).startsWith(pref));
    try { for (const login of Object.values(await ghActors(num, isSync))) addJira(login); } catch (e) { warn(`who: GitHub 필드 작성자 실패: ${e.message.slice(0, 120)}`); }
    try { const it = await ghIssue(num); addJira(it.user && it.user.login); } catch (e) { warn(`who: GitHub 이슈 작성자 실패: ${e.message.slice(0, 120)}`); }
    try { for (const c of await ghList(`/repos/${GH_REPO}/issues/${num}/comments`)) if (!(c.user && c.user.type === 'Bot')) addJira(c.user && c.user.login); } catch (e) { warn(`who: GitHub 댓글 작성자 실패: ${e.message.slice(0, 120)}`); }
  }
  if (key) {
    // Jira 쪽 사람(→ GH_USER_TOKEN): 필드 바꾼 사람 + 보고자(새 등록) + 댓글 작성자 · 수정자
    try { for (const acct of Object.values(await jiraActors(key))) addGh(acct); } catch (e) { warn(`who: Jira 필드 작성자 실패: ${e.message.slice(0, 120)}`); }
    try { const d = await jiraIssue(key, spaceOf(key)); addGh(d.fields.reporter && d.fields.reporter.accountId); } catch (e) { warn(`who: Jira 보고자 실패: ${e.message.slice(0, 120)}`); }
    try { for (const c of await jiraComments(key)) { addGh(c.author && c.author.accountId); addGh(c.updateAuthor && c.updateAuthor.accountId); } } catch (e) { warn(`who: Jira 댓글 작성자 실패: ${e.message.slice(0, 120)}`); }
  }
  const j = [...jira].slice(0, 3), g = [...gh].slice(0, 3);
  const lines = [...j.map((v, i) => `jira${i + 1}=${v}`), ...g.map((v, i) => `gh${i + 1}=${v}`)];
  if (env.GITHUB_OUTPUT && lines.length) fs.appendFileSync(env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  log(`· 누가 바꿨나 — GitHub→Jira ${j.join(', ') || '(없음)'} · Jira→GitHub ${g.join(', ') || '(없음)'}`);
}

async function main() {
  const mode = process.argv[2] || 'sync';
  if (mode === 'collect-fields') return collectFields();
  need('JIRA_BASE_URL'); need('JIRA_EMAIL'); need('JIRA_API_TOKEN');
  if (mode === 'collect-statuses') return collectStatuses();
  if (DRY) log('🔎 미리보기 — GitHub · Jira · Slack 에 아무것도 쓰지 않는다');
  if (mode === 'preview') return previewAll();
  if (mode === 'adopt') return adoptAll();
  if (mode === 'resolve') {
    // 같은 GitHub 이슈의 실행은 한 줄로 — 짝 GitHub 번호가 있으면 그것, 없으면 Jira 키
    const { num, key } = await resolvePair();
    const group = num ? `gh-${num}` : `jira-${key}`;
    log(`· 실행 묶음 ${group}`);
    if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `group=${group}\n`);
    return;
  }
  if (mode === 'who') return whoMode();
  await loadPeople();
  // 표 「반영 계정」에 쓸 공용 Jira 계정 표시 이름(/myself). 못 읽어도 기본값 「공용」.
  try { const me = await jiraReal('GET', '/rest/api/3/myself', null, false, jiraAuth(), JIRA_BASE); if (me && me.displayName) SHARED_NAME = me.displayName; } catch { /* 공용 그대로 */ }
  await verifyUserTokens(); // §3-3 열쇠 주인 확인(실행마다 한 번, 쓰기 전에) — 안 맞으면 그 열쇠는 이번 실행에서 안 씀
  RUN.num = env.GITHUB_ISSUE || null; RUN.key = env.JIRA_KEY || null;
  let { num, key, origin } = await resolvePair();
  RUN.num = num || RUN.num; RUN.key = key || RUN.key;
  if (!num && !key) die('GITHUB_ISSUE · JIRA_KEY 가 모두 없다');
  let fresh = false;
  if (num && !key) {
    // GitHub 원본 — Jira 에 새로 등록(제목 · 유형만 먼저, 나머지는 아래 맞추기가 채운다)
    const it = await gh('GET', `/repos/${GH_REPO}/issues/${num}`);
    if (beforeCutover(it.created_at)) { log(`· GitHub #${num} 은 짝 없이 전환 전에 만든 이슈 → Jira 에 새로 등록하지 않음(SYNC_CREATE_SINCE)`); return; }
    const space = spaceOf(createSpaceKey());
    const typeId = (it.type && space.types[it.type.name]) || space.createType;
    const sec = epicOf(ghParts(it.body).user);
    if (sec) {
      const chk = await epicCheck(space, sec.key);
      if (!chk.ok) {
        const msg = `「상위 에픽 키」 칸에 적은 ${sec.raw || '(비어 있음)'} 는 ${chk.why.replace(/입니다$/, '')}입니다. 그래서 Jira 에 아직 등록하지 않았습니다.
👉 할 일: GitHub 이슈의 「상위 에픽 키」 칸을 맞는 키로 고치면 그때 등록됩니다.`;
        warn(msg);
        await notifySlack(`:warning: *확인해 주세요* — 「${String(it.title || '').replace(/[<>|]/g, '')}」 (<${it.html_url}|GitHub #${num}>)
${msg}`);
        return;
      }
    }
    const base = { project: { key: space.projectKey }, issuetype: { id: String(typeId) }, summary: `[GH #${num}] ${it.title || '(제목 없음)'}`, labels: [GH_MARK_LABEL, ghPairLabel(num)] };
    // (선택) spaces.json startDateOnCreate — GitHub 에서 등록한 날(한국 시간)을 Jira 「시작 날짜」 에 넣는다.
    //   GitHub 화면에 Start date 칸이 없어 시작 날짜를 짝짓지 않는 스페이스용(짝지은 스페이스는 GitHub 값을 따른다)
    if (space.startDateOnCreate && space.startDateField && it.created_at) base[space.startDateField] = kstDate(it.created_at);
    if (DRY) { planWrite('Jira', 'POST', '/rest/api/3/issue', { fields: base }); log(`· (미리보기) GitHub #${num} → ${space.projectKey} 에 새 업무로 등록할 것`); return; }
    const rep = acctOf(it.user && it.user.login);
    let r;
    try { r = await jira('POST', '/rest/api/3/issue', { fields: rep ? { ...base, reporter: { accountId: rep } } : base }); }
    catch (e) { if (!rep) throw e; warn(`보고자 지정 실패 → 기본 보고자로 등록: ${e.message.slice(0, 200)}`); r = await jira('POST', '/rest/api/3/issue', { fields: base }); }
    key = r.key;
    await gh('PATCH', `/repos/${GH_REPO}/issues/${num}`, { body: `${String(it.body || '').replace(/\s+$/, '')}\n\n<!-- jira:${key} -->` }, undefined, null, { skip: true });
    await jira('PUT', `/rest/api/3/issue/${key}/properties/ghsync`, { v: 2, gh: Number(num) });
    log(`· GitHub #${num} → Jira ${key} 새로 등록`);
    fresh = true; origin = 'gh';
  } else if (key && !num) {
    // Jira 원본 — GitHub 사본을 새로 만든다
    const space = spaceOf(key);
    const d = await jiraIssue(key, space);
    if (isEpicLevel(d)) { log(`· Jira ${key} 는 에픽(상위 수준) → GitHub 사본을 만들지 않음`); return; }
    if (beforeCutover(d.fields.created)) { log(`· Jira ${key} 는 짝 없이 전환 전에 만든 업무 → GitHub 사본을 만들지 않음(SYNC_CREATE_SINCE)`); return; }
    if (DRY) { planWrite('GitHub', 'POST', `/repos/${GH_REPO}/issues`); log(`· (미리보기) Jira ${key} → GitHub 사본을 새로 만들 것`); return; }
    const newIssue ={ title: `[JIRA ${key}] ${d.fields.summary || ''}`.trim(), body: `<!-- jira:${key} -->`, labels: ['jira'] };
    // 등록자가 GitHub 아이디와 짝이고 그 사람 토큰이 있으면 본인 이름으로, 아니면(없음 · 만료 · 권한 없음) 봇으로
    const repLogin = loginOf(d.fields.reporter && d.fields.reporter.accountId);
    const repTok = userToken(repLogin);
    let it = null;
    if (repTok) {
      try { it = await gh('POST', `/repos/${GH_REPO}/issues`, newIssue, undefined, repTok, { by: repLogin }); log(`· 사본 작성자 = ${repLogin}(등록자 본인 토큰)`); }
      catch (e) { log(`· ${repLogin} 토큰으로 만들지 못함(${e.message.slice(0, 120)}) → 봇으로 만들고 본문에 등록자 줄`); }
    } else log(`· 사본 작성자 = 봇(${repLogin ? `${repLogin} 토큰 없음` : '등록자 GitHub 아이디 없음'} → 본문에 등록자 줄)`);
    if (!it) it = await gh('POST', `/repos/${GH_REPO}/issues`, newIssue, undefined, null, { by: repLogin || null, reason: repLogin ? '(공용 · ' + failWhy(repLogin, !!repTok) + ')' : (jiraOnlyName(d.fields.reporter && d.fields.reporter.accountId) ? '(공용 · GitHub 계정 없음)' : '') });
    num = String(it.number);
    await jira('PUT', `/rest/api/3/issue/${key}/properties/ghsync`, { v: 2, gh: Number(num) });
    log(`· Jira ${key} → GitHub #${num} 사본 새로 등록`);
    fresh = true; origin = 'jira';
  }
  await reconcile(num, key, origin, fresh);
  if (DRY) writeReport([`## 미리보기 — #${num} ↔ ${key} (쓰지 않음)`, '', ...(PLAN.length ? PLAN.map((x) => `- ${x.side} ${x.what}`) : ['- 쓸 것 없음'])].join('\n'));
  else { writeSummaryTable(num, key, fresh); resultLine(num, key); }
}

main().catch(async (e) => {
  const raw = e && e.message ? e.message : String(e);
  dbg(raw); // 원문(공용 열쇠가 익명 처리되면 중국어일 수 있음)은 디버그로. 보이는 건 아래 한국어 한 줄.
  // 동기화 실패 → Slack(어느 짝 · 쉬운 말 이유 · 실행 기록). 실행마다 한 번.
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL || 'https://github.com'}/${env.GITHUB_REPOSITORY || GH_REPO}/actions/runs/${env.GITHUB_RUN_ID}` : '';
  const pair = [RUN.num ? `<https://github.com/${GH_REPO}/issues/${RUN.num}|GitHub #${RUN.num}>` : '', RUN.key && JIRA_BASE ? `<${JIRA_BASE}/browse/${RUN.key}|Jira ${RUN.key}>` : (RUN.key ? `Jira ${RUN.key}` : '')].filter(Boolean).join(' ↔ ');
  // 짝의 Jira 업무가 지워진 경우(404) — 실패가 아니라 안내. 단, 공용 열쇠가 안 통해 익명 처리된 404 와 구분한다.
  const gone = /^Jira \w+ \/rest\/api\/3\/issue\/([A-Z][A-Z0-9]*-\d+)\S* 404/.exec(raw);
  if (gone && gone[1] === RUN.key) {
    // 공용 열쇠가 통하는지 /myself 로 확인 — 통하면 진짜 삭제, 안 통하면 열쇠 문제(삭제 알림 금지 · 실패 처리)
    let authOk = false;
    try { const me = await jiraReal('GET', '/rest/api/3/myself', null, false, jiraAuth(), JIRA_BASE); authOk = !!(me && me.accountId); } catch { authOk = false; }
    if (authOk) {
      say(`안내 — Jira ${RUN.key} 업무가 지워졌습니다${RUN.num ? ` (GitHub #${RUN.num} 은 그대로 남아 있습니다)` : ''} · 할 일: 필요 없으면 GitHub 이슈도 닫아 주세요`);
      try { await notifySlack(`:warning: *확인해 주세요* — Jira ${RUN.key} 업무가 지워졌습니다${RUN.num ? ` (<https://github.com/${GH_REPO}/issues/${RUN.num}|GitHub #${RUN.num}> 은 그대로 남아 있습니다)` : ''}.\n👉 할 일: 필요 없으면 GitHub 이슈도 닫아 주세요.`); } catch {}
      process.exit(0);
    }
    say('::error::실패 — Jira 공용 토큰이 통하지 않습니다 · 할 일: JIRA_EMAIL · JIRA_API_TOKEN 을 확인해 주세요');
    try { await notifySlack(`:x: *동기화 실패*${pair ? ` — ${pair}` : ''}\nJira 공용 토큰이 통하지 않습니다 — JIRA_EMAIL · JIRA_API_TOKEN 을 확인해 주세요.\n${TODO_DEV}${runUrl ? ` (<${runUrl}|자세한 기록>)` : ''}`); } catch {}
    process.exit(1);
  }
  say(`::error::실패 — ${easyError(raw)} · 할 일: 계속되면 담당 개발자에게 알려 주세요`);
  try { await notifySlack(`:x: *동기화 실패*${pair ? ` — ${pair}` : ''}
GitHub 와 Jira 를 맞추지 못했습니다 — ${easyError(raw)}.
${TODO_DEV}${runUrl ? ` (<${runUrl}|자세한 기록>)` : ''}`); } catch {}
  process.exit(1);
});
