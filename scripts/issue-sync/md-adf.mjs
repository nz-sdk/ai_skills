// md-adf.mjs — 마크다운 <-> ADF 변환기 (운반체 포함)
//
// 공개 패키지 marked(마크다운 파싱)만 쓰고 ADF 매핑은 이 파일에서 한다.
// Atlassian 공식 변환기 @atlassian/atlassian-html-format 는 npm 비공개라
// Actions 워크플로에서 설치할 수 없어 직접 매핑한다.
//
// 운반체(carrier) — Jira 리치 노드를 GitHub 이 그릴 수 있는 표기로 내리고, 되돌릴 때 복원한다:
//   status   <-> <kbd>텍스트</kbd>
//   date     <-> 📅 YYYY-MM-DD
//   highlight<-> <mark>텍스트</mark>
//   underline<-> <ins>텍스트</ins>
//   sub/sup  <-> <sub>/<sup>
//   panel    <-> GitHub 알림(> [!NOTE] / [!WARNING] ...)
//   expand   <-> <details><summary>제목</summary>…</details>
//   decision <-> ✔ **결정:** 텍스트
// 글자색 · 형광은 색 뱃지(img.shields.io)로 보인다. 그 밖에 GitHub 이 못 그리는 것은 평문 + 「원문에서 보기」 로 보완.

import { marked } from 'marked';

let _id = 0;
const localId = (p) => `${p}-${++_id}`;

// 멘션 대조표: Jira accountId -> GitHub 로그인. adfToMd(opts.mentionMap)로 주입.
let _mentionMap = {};
// 반대 방향(마크다운 → ADF): GitHub 로그인(소문자) -> Jira accountId. mdToAdf(opts.mentionReverse)로 주입.
let _mentionRev = {};
// Jira 계정만 있는 사람: 이름 -> accountId (대조표 jiraOnly). GitHub 표기 「맨션:이름(jira)」 을 Jira mention 으로 되돌린다.
let _jiraOnly = {};
let _reJiraOnly = null;
// 이미지 · 파일 주소 -> Jira 첨부(media) 연결. mdToAdf(opts.mediaFor)로 주입 — { id, collection, kind: 'image'|'file' } 또는 null
let _mediaFor = null;

// Jira 업로드(파일) 이미지: 변환 때 자리표시로 모으고, 워크플로가 레포에 올려 raw URL 로 교체
const ATTACH_PREFIX = 'jira-attach://';
let _fileMedia = [];

const PANEL_TO_ALERT = { info: 'NOTE', note: 'IMPORTANT', success: 'TIP', warning: 'WARNING', error: 'CAUTION' };
const ALERT_TO_PANEL = { NOTE: 'info', IMPORTANT: 'note', TIP: 'success', WARNING: 'warning', CAUTION: 'error' };

const SHIELDS = 'https://img.shields.io/badge/';

// GitHub 제한 색계열(패밀리) — 지라의 세부 색을 가까운 색 계열로 맞춘다(GitHub 은 세부색을 못 담으므로)
const FAMILIES = [ // [hueMax, hex] (hueMin=이전 경계)
  [15, 'd73a49'], [40, 'e36209'], [65, 'dbab09'], [165, '28a745'],
  [200, '1b7c83'], [243, '0366d6'], [300, '6f42c1'], [338, 'ea4aaa'], [360, 'd73a49'],
];
const STATUS_FAMILY = { neutral: '6a737d', purple: '6f42c1', blue: '0366d6', red: 'd73a49', yellow: 'dbab09', green: '28a745' };
const FAMILY_STATUS = { '6a737d': 'neutral', '6f42c1': 'purple', '0366d6': 'blue', 'd73a49': 'red', 'dbab09': 'yellow', '28a745': 'green' };
// 계열 색 → Jira 형광 팔레트(옅은 색) — 색 대조표의 같은 계열 Jira 색
const FAMILY_TO_JIRA_HL = { d73a49: 'ffebe6', e36209: 'fff0b3', dbab09: 'fff0b3', '28a745': 'e3fcef', '1b7c83': 'e6fcff', '0366d6': 'deebff', '6f42c1': 'eae6ff', ea4aaa: 'fdd0ec', '6a737d': 'f4f5f7' };
const BADGE_STATUS_LEGACY ={ lightgrey: 'neutral', blueviolet: 'purple', blue: 'blue', red: 'red', yellow: 'yellow', brightgreen: 'green', green: 'green' };
// 지라 hex → GitHub 패밀리 hex (색상·채도로 가까운 계열)
function fam(hex) {
  let h = String(hex || '').replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '6a737d';
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.15 || l < 0.12 || l > 0.96) return '6a737d'; // 회색/무채색
  let hue; if (mx === r) hue = ((g - b) / d) % 6; else if (mx === g) hue = (b - r) / d + 2; else hue = (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  for (const [hi, fx] of FAMILIES) if (hue < hi) return fx;
  return 'd73a49';
}
// 상태 칩 — Jira 처럼 옅은 바탕 + 어두운 글자(뱃지 서비스는 옅은 바탕이면 글자를 #333 으로 그린다)
//   같은 색 계열의 옅은 쪽 — 진한 계열 색(흰 글자)은 Jira 와 달라 보인다
const STATUS_LIGHT = { neutral: 'dfe1e6', purple: 'eae6ff', blue: 'deebff', red: 'ffebe6', yellow: 'fff0b3', green: 'e3fcef' };
const LIGHT_STATUS = Object.fromEntries(Object.entries(STATUS_LIGHT).map(([k, v]) => [v, k]));
const hex6 = (c) => { const h = String(c || '').replace(/^#/, '').toLowerCase(); return /^[0-9a-f]{6}$/.test(h) ? h : null; };
// 색 뱃지: 상태칩(s) · 글자색(tc) · 형광(hl). ?_t= 로 종류 구분.
//   형광 = Jira 형광 색 그대로 바탕(옅은 색이라 글자는 어둡게) · 형광에 글자색도 있으면 &_tc= 에 두어 Jira 로 돌아갈 때 되살린다
//   (GitHub 은 수식 바탕색 \colorbox 를 막고 \bbox 를 지원하지 않아 뱃지 글자색은 못 그린다)
function colorBadge(text, kind, color, opt = {}) {
  const label = encodeURIComponent(String(text).replace(/-/g, '--').replace(/_/g, '__'));
  // 상태 칩 · 형광 · 글자색 뱃지는 색 대조표의 계열 대표색(선명한 색).
  //   옅은 색은 탁해 보여 쓰지 않는다. Jira 원래 색은 _c 로 되살린다
  let c;
  if (kind === 's') c = STATUS_FAMILY[color] || STATUS_FAMILY.neutral;
  else c = fam(color);
  const orig = kind === 's' ? null : hex6(color);
  const tc = kind === 'hl' ? hex6(opt.tc) : null;
  return `![${text}](${SHIELDS}${label}-${c}?_t=${kind}${orig && orig !== c ? `&_c=${orig}` : ''}${tc ? `&_tc=${tc}` : ''})`;
}
function parseBadge(href) {
  const m = /img\.shields\.io\/badge\/(.+)-([A-Za-z0-9]+)(?:\?([^#]*))?$/.exec(href || '');
  if (!m) return null;
  const text = decodeURIComponent(m[1]).replace(/--/g, '-').replace(/__/g, '_');
  const tok = m[2].toLowerCase();
  const kind = (/(?:^|&)_t=([a-z]+)/.exec(m[3] || '') || [, 's'])[1];
  const orig = (/(?:^|&)_c=([0-9a-fA-F]{6})/.exec(m[3] || '') || [])[1];
  if (kind === 'tc') return { kind: 'tc', text, color: '#' + (orig || tok).toLowerCase() };
  // GitHub 에서 사람이 쓴 형광 뱃지(원래 색 _c 없음)는 계열 색이 진해 Jira 형광으로 안 맞는다 → 같은 계열의 Jira 형광 색(옅은 색)
  if (kind === 'hl') {
    const tc = (/(?:^|&)_tc=([0-9a-fA-F]{6})/.exec(m[3] || '') || [])[1];
    return { kind: 'hl', text, color: '#' + (orig || FAMILY_TO_JIRA_HL[tok] || tok).toLowerCase(), tc: tc ? '#' + tc.toLowerCase() : null };
  }
  return { kind: 's', text, color: LIGHT_STATUS[tok] || FAMILY_STATUS[tok] || BADGE_STATUS_LEGACY[tok] || 'neutral' };
}

// ──────────────────────────── 마크다운 → ADF ────────────────────────────

export function mdToAdf(md, opts = {}) {
  _id = 0;
  _mentionRev = {};
  for (const [k, v] of Object.entries((opts && opts.mentionReverse) || {})) _mentionRev[String(k).toLowerCase()] = v;
  _jiraOnly = (opts && opts.jiraOnly) || {};
  const names = Object.keys(_jiraOnly).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // 「맨션:이름(jira)」(정식) · 「맨션 : 이름」 · 「@이름(jira)」 — 공백 · 대소문자 · 전각 괄호는 봐준다
  const J = '[ \\t]*[(（][ \\t]*jira[ \\t]*[)）]';
  _reJiraOnly = names.length ? new RegExp(`(?:맨션[ \\t]*[:：][ \\t]*(${names.join('|')})(?:${J})?|@(${names.join('|')})${J})`, 'giu') : null;
  _mediaFor = (opts && opts.mediaFor) || null;
  const tokens = marked.lexer(md == null ? '' : String(md));
  let content = mergeMediaGroups(tokensToBlocks(tokens).map(clean).filter(Boolean));
  if (content.length === 0) content.push({ type: 'paragraph', content: [] });
  return { version: 1, type: 'doc', content };
}

// 바로 이어진 파일 카드 묶음(mediaGroup)은 하나로 — Jira 는 한 묶음 안의 카드를 가로로 놓는다.
// (Jira 의 한 묶음은 GitHub 에서 줄마다 하나씩 풀리므로, 합치지 않으면 돌아올 때 카드가 세로로 쌓인다)
function mergeMediaGroups(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n && Array.isArray(n.content) && n.type !== 'mediaGroup') n.content = mergeMediaGroups(n.content);
    const prev = out[out.length - 1];
    if (n && n.type === 'mediaGroup' && prev && prev.type === 'mediaGroup') prev.content = [...prev.content, ...n.content];
    else out.push(n);
  }
  return out;
}

function tokensToBlocks(tokens, opts = {}) {
  const out = [];
  const arr = tokens || [];
  const nested = !!opts.nested;
  for (let i = 0; i < arr.length; i++) {
    const t = arr[i];

    // <details> … </details> → expand (ADF 는 expand 중첩 금지 → 안쪽은 굵은 제목+내용으로 평탄화)
    if (t.type === 'html' && /<details/i.test(t.raw || t.text || '')) {
      const sm = /<summary>([\s\S]*?)<\/summary>/i.exec(t.raw || t.text || '');
      const title = sm ? sm[1].trim() : '펼치기';
      const inner = [];
      let j = i + 1, d = 1;
      for (; j < arr.length; j++) {
        const rt = arr[j].raw || arr[j].text || '';
        if (arr[j].type === 'html' && /<details/i.test(rt)) d++;
        if (arr[j].type === 'html' && /<\/details>/i.test(rt)) { d--; if (d === 0) break; }
        inner.push(arr[j]);
      }
      i = j;
      if (nested) {
        out.push({ type: 'paragraph', content: [{ type: 'text', text: title, marks: [{ type: 'strong' }] }] });
        out.push(...tokensToBlocks(inner, { nested: true }));
      } else {
        out.push({ type: 'expand', attrs: { title }, content: ensureBlocks(tokensToBlocks(inner, { nested: true })) });
      }
      continue;
    }

    // 연속된 ✔ **결정:** 문단 → decisionList
    if (t.type === 'paragraph' && isDecision(t)) {
      const items = [];
      let j = i;
      while (j < arr.length && arr[j].type === 'paragraph' && isDecision(arr[j])) {
        items.push(decisionText(arr[j]));
        j++;
      }
      i = j - 1;
      out.push({
        type: 'decisionList', attrs: { localId: localId('dl') },
        content: items.map((tx) => ({ type: 'decisionItem', attrs: { localId: localId('di'), state: 'DECIDED' }, content: tx ? [{ type: 'text', text: tx }] : [] })),
      });
      continue;
    }

    // 이미지만 있는 문단 → mediaSingle(Jira 첨부로 연결되면 file, 아니면 external) · 첨부 파일 링크만 있는 문단 → mediaGroup(파일 카드)
    // 단독 스마트링크(맨 URL) → blockCard(임베드)
    if (t.type === 'paragraph' && Array.isArray(t.tokens)) {
      // 「📎 」 는 Jira 첨부 파일을 GitHub 에 옮길 때 붙인 표시 — 돌아올 때 파일 카드로 되돌리려면 빈 글자처럼 본다
      // (일반 링크가 되면 설명에서 쓰이지 않는 첨부가 되어 Jira 가 지운다)
      const nn = t.tokens.filter((x) => !(x.type === 'text' && /^\s*(📎\s*)?$/u.test(x.text || '')) && x.type !== 'br');
      const isImg = (x) => x.type === 'image' && x.href && !/img\.shields\.io\/badge\//.test(x.href);
      if (nn.length >= 1 && nn.every(isImg)) {
        for (const x of nn) out.push(mediaSingleFor(x.href));
        continue;
      }
      const fileOf = (x) => x.type === 'link' && x.href && _mediaFor && (() => { const a = _mediaFor(x.href); return a && a.kind === 'file' && a.id ? a : null; })();
      if (nn.length >= 1 && nn.every((x) => fileOf(x))) {
        out.push({ type: 'mediaGroup', content: nn.map((x) => { const a = fileOf(x); return { type: 'media', attrs: { type: 'file', id: a.id, collection: a.collection || '' } }; }) });
        continue;
      }
      if (nn.length === 1 && nn[0].type === 'link' && nn[0].href && plainInline(nn[0].tokens) === nn[0].href) {
        out.push({ type: 'blockCard', attrs: { url: nn[0].href } });
        continue;
      }
    }

    const node = tokenToBlock(t);
    if (Array.isArray(node)) out.push(...node);
    else if (node) out.push(node);
  }
  return out;
}

function isDecision(t) {
  const f = (t.tokens || [])[0];
  return f && f.type === 'text' && /^✔/.test(f.text || '');
}
function decisionText(t) {
  return (t.text || '').replace(/^✔\s*/, '').replace(/^\*\*결정:\*\*\s*/, '').replace(/^결정:\s*/, '').trim();
}

function tokenToBlock(t) {
  switch (t.type) {
    case 'space':
      return null;
    case 'heading':
      return { type: 'heading', attrs: { level: Math.min(Math.max(t.depth || 1, 1), 6) }, content: inlineToAdf(t.tokens) };
    case 'paragraph':
      return { type: 'paragraph', content: inlineToAdf(t.tokens) };
    case 'text':
      return { type: 'paragraph', content: t.tokens ? inlineToAdf(t.tokens) : textToNodes(t.text, []) };
    case 'blockquote': {
      const bt = t.text || '';
      const am = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*)$/i.exec(bt);
      if (am) {
        const body = am[2].trim();
        return { type: 'panel', attrs: { panelType: ALERT_TO_PANEL[am[1].toUpperCase()] || 'info' }, content: ensureBlocks(tokensToBlocks(marked.lexer(body), { nested: true })) };
      }
      return { type: 'blockquote', content: ensureBlocks(tokensToBlocks(t.tokens, { nested: true })) };
    }
    case 'code':
      return { type: 'codeBlock', attrs: t.lang ? { language: String(t.lang).split(/\s+/)[0] } : {}, content: t.text ? [textNode(t.text)] : [] };
    case 'hr':
      return { type: 'rule' };
    case 'list':
      return listToAdf(t);
    case 'table':
      return tableToAdf(t);
    case 'html':
      return null; // 단독 html 토큰(닫는 태그 등)은 버린다
    default:
      return t.raw && t.raw.trim() ? { type: 'paragraph', content: [textNode(t.raw)] } : null;
  }
}

function ensureBlocks(blocks) {
  return blocks.length ? blocks : [{ type: 'paragraph', content: [] }];
}

function listToAdf(t) {
  const type = t.ordered ? 'orderedList' : 'bulletList';
  const node = { type, content: [] };
  if (t.ordered && t.start && t.start !== 1) node.attrs = { order: t.start };
  // 체크박스 항목은 taskList 로 — 일반 항목과 섞였으면 이어진 묶음마다 taskList / bulletList 로 나눈다
  // (전부 taskList 로 만들면 일반 항목에도 체크 상자가 생긴다)
  if (!t.ordered && (t.items || []).some((it) => it.task)) {
    const runs = [];
    for (const it of t.items || []) {
      const last = runs[runs.length - 1];
      if (last && last.task === !!it.task) last.items.push(it); else runs.push({ task: !!it.task, items: [it] });
    }
    return runs.flatMap((r) => r.task
      ? taskRunToAdf(r.items)
      : [{ type: 'bulletList', content: r.items.map((item) => ({ type: 'listItem', content: ensureBlocks(tokensToBlocks(item.tokens, { nested: true })) })) }]);
  }
  for (const item of t.items || []) {
    let blocks = tokensToBlocks(item.tokens, { nested: true });
    blocks = blocks.length ? blocks : [{ type: 'paragraph', content: [] }];
    node.content.push({ type: 'listItem', content: blocks });
  }
  return node;
}

// 체크 항목 묶음 → taskList. 항목 아래 중첩 체크 목록은 ADF 규칙대로 같은 taskList 안의 중첩 taskList 로 넣는다.
// 중첩 일반 목록은 taskList 에 넣을 수 없어 그 자리에서 taskList 를 끊고 bulletList 로 둔다(내용은 잃지 않는다).
function taskListItems(items) {
  const parts = [[]];
  for (const it of items) {
    parts[parts.length - 1].push({
      type: 'taskItem', attrs: { localId: localId('ti'), state: it.checked ? 'DONE' : 'TODO' },
      content: inlineToAdf(firstInline(it.tokens)),
    });
    for (const sub of (it.tokens || []).filter((x) => x.type === 'list')) {
      if (!sub.ordered && (sub.items || []).every((x) => x.task)) {
        const inner = taskListItems(sub.items);
        parts[parts.length - 1].push({ type: 'taskList', attrs: { localId: localId('tl') }, content: inner[0] });
        for (const rest of inner.slice(1)) parts.push(rest);
      } else {
        parts.push({ blocks: [].concat(listToAdf(sub)) }, []);
      }
    }
  }
  return parts;
}
function taskRunToAdf(items) {
  return taskListItems(items)
    .filter((p) => !Array.isArray(p) || p.length)
    .flatMap((p) => (Array.isArray(p) ? [{ type: 'taskList', attrs: { localId: localId('tl') }, content: p }] : p.blocks));
}

function firstInline(tokens) {
  const p = (tokens || []).find((x) => x.type === 'text' || x.type === 'paragraph');
  return p ? (p.tokens || [{ type: 'text', text: p.text }]) : [];
}

// 동기화가 GitHub 에 만든 첨부 표(머리글 「| | 첨부 파일 | 크기 |」) → Jira 파일 카드 묶음.
// 모든 줄의 링크가 Jira 첨부로 이어질 때만 — 하나라도 아니면 보통 표로 둔다.
export const ATTACH_TABLE_HEAD = '첨부 파일';
function attachTableToAdf(t) {
  const h = (t.header || []).map((c) => String(c.text || '').trim());
  if (h.length !== 3 || h[1] !== ATTACH_TABLE_HEAD || !_mediaFor || !(t.rows || []).length) return null;
  const media = [];
  for (const r of t.rows) {
    const link = ((r[1] && r[1].tokens) || []).find((x) => x.type === 'link');
    const a = link && link.href && _mediaFor(link.href);
    if (!a || a.kind !== 'file' || !a.id) return null;
    media.push({ type: 'media', attrs: { type: 'file', id: a.id, collection: a.collection || '' } });
  }
  return { type: 'mediaGroup', content: media };
}

function tableToAdf(t) {
  const g = attachTableToAdf(t);
  if (g) return g;
  const rows = [];
  const header = (t.header || []).map((c) => ({ type: 'tableHeader', attrs: {}, content: [{ type: 'paragraph', content: inlineToAdf(c.tokens) }] }));
  if (header.length) rows.push({ type: 'tableRow', content: header });
  for (const r of t.rows || []) {
    rows.push({ type: 'tableRow', content: r.map((c) => ({ type: 'tableCell', attrs: {}, content: [{ type: 'paragraph', content: inlineToAdf(c.tokens) }] })) });
  }
  return { type: 'table', attrs: {}, content: rows };
}

const CARRIER_OPEN = /^<(kbd|mark|ins|u|sub|sup)>$/i;
const CARRIER_CLOSE = /^<\/(kbd|mark|ins|u|sub|sup)>$/i;

function inlineToAdf(tokens, marks = []) {
  const out = [];
  const arr = tokens || [];
  for (let i = 0; i < arr.length; i++) {
    const tk = arr[i];
    if (tk.type === 'html') {
      const op = CARRIER_OPEN.exec((tk.text || '').trim());
      if (op) {
        const tag = op[1].toLowerCase();
        let depth = 1;
        const inner = [];
        let j = i + 1;
        for (; j < arr.length; j++) {
          const t2 = arr[j];
          if (t2.type === 'html') {
            const o2 = CARRIER_OPEN.exec((t2.text || '').trim());
            const c2 = CARRIER_CLOSE.exec((t2.text || '').trim());
            if (o2 && o2[1].toLowerCase() === tag) depth++;
            else if (c2 && c2[1].toLowerCase() === tag) { depth--; if (depth === 0) break; }
          }
          inner.push(t2);
        }
        i = j;
        if (tag === 'kbd') {
          const txt = plainInline(inner);
          if (txt) out.push({ type: 'status', attrs: { text: txt, color: 'neutral', localId: localId('st') } });
        } else {
          const mk = tag === 'mark' ? { type: 'backgroundColor', attrs: { color: '#fff8c5' } }
            : (tag === 'ins' || tag === 'u') ? { type: 'underline' }
              : tag === 'sub' ? { type: 'subsup', attrs: { type: 'sub' } }
                : { type: 'subsup', attrs: { type: 'sup' } };
          out.push(...inlineToAdf(inner, [...marks, mk]));
        }
        continue;
      }
      continue; // 모르는 html → 버림
    }
    out.push(...inlineOne(tk, marks));
  }
  return out;
}

function inlineOne(tk, marks) {
  switch (tk.type) {
    case 'text':
    case 'escape': {
      // 한 줄 줄바꿈 — GitHub 이슈 · 댓글은 줄을 나눠 보여 준다 → Jira 도 줄바꿈(hardBreak)으로
      const parts = String(tk.text == null ? '' : tk.text).split('\n');
      const out = [];
      parts.forEach((p, i) => { if (i) out.push({ type: 'hardBreak' }); out.push(...textToNodes(p, marks)); });
      return out;
    }
    case 'strong':
      return inlineToAdf(tk.tokens, [...marks, { type: 'strong' }]);
    case 'em':
      return inlineToAdf(tk.tokens, [...marks, { type: 'em' }]);
    case 'del':
      return inlineToAdf(tk.tokens, [...marks, { type: 'strike' }]);
    case 'codespan':
      return [textNode(tk.text, [...marks, { type: 'code' }])];
    case 'link': {
      // GitHub 쪽 첨부 주소를 Jira 첨부로 올렸으면 링크도 Jira 첨부 주소로(비공개 GitHub 주소는 Jira 사용자가 못 연다)
      const a = _mediaFor && tk.href && _mediaFor(tk.href);
      return inlineToAdf(tk.tokens, [...marks, { type: 'link', attrs: { href: a && a.url ? a.url : tk.href } }]);
    }
    case 'br':
      return [{ type: 'hardBreak' }];
    case 'image': {
      const b = parseBadge(tk.href);
      if (b) {
        if (b.kind === 'tc') return [textNode(b.text, [...marks, { type: 'textColor', attrs: { color: b.color } }])];
        if (b.kind === 'hl') return [textNode(b.text, [...marks, ...(b.tc ? [{ type: 'textColor', attrs: { color: b.tc } }] : []), { type: 'backgroundColor', attrs: { color: b.color } }])];
        return [{ type: 'status', attrs: { text: b.text, color: b.color, localId: localId('st') } }];
      }
      // 글 사이에 낀 이미지 — ADF 인라인 이미지가 없어 이름에 링크를 건다(Jira 첨부로 올렸으면 첨부 주소)
      const a = _mediaFor && tk.href && _mediaFor(tk.href);
      const href = a && a.url ? a.url : tk.href;
      return [textNode('🖼 ' + (tk.text || '이미지'), [...marks, { type: 'link', attrs: { href } }])];
    }
    default:
      if (tk.tokens) return inlineToAdf(tk.tokens, marks);
      if (tk.text) return textToNodes(tk.text, marks);
      return [];
  }
}

// 텍스트 안의 운반체(📅 날짜 · LaTeX 글자색)를 노드로 분리
// 글자색: 변환기가 쓰는 $\textcolor{#hex}{\text{..}}$ 뿐 아니라 사람이 흔히 쓰는 모양도 받는다 —
//   \color 또는 \textcolor · 색 = #hex(3 · 6자리) 또는 이름(red · blue …) · 글자 = \text{..} 또는 맨 글자
const RE_TC = /\$\\(?:text)?color\{\s*(#?[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}|[A-Za-z]+)\s*\}\{(?:\\text\{([^{}]*)\}|([^{}$\\]*))\}\$/;
const NAMED_COLOR = { red: 'd73a49', orange: 'e36209', yellow: 'dbab09', green: '28a745', teal: '1b7c83', cyan: '1b7c83', blue: '0366d6', purple: '6f42c1', violet: '6f42c1', magenta: 'ea4aaa', pink: 'ea4aaa', gray: '6a737d', grey: '6a737d', black: '172b4d', brown: '9e4c00' };
function tcHex(c) {
  const s = String(c || '').trim();
  if (/^#?[0-9A-Fa-f]{6}$/.test(s)) return s.replace(/^#/, '').toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) return s.slice(1).split('').map((x) => x + x).join('').toLowerCase();
  return NAMED_COLOR[s.toLowerCase()] || null;
}
const RE_DT = /📅\s*(\d{4}-\d{2}-\d{2})/;
function mediaSingleFor(href) {
  const a = _mediaFor && _mediaFor(href);
  const attrs = a && a.id ? { type: 'file', id: a.id, collection: a.collection || '' } : { type: 'external', url: href };
  return { type: 'mediaSingle', attrs: { layout: 'center' }, content: [{ type: 'media', attrs }] };
}

// GitHub 멘션(@로그인) — 대조표에 있는 로그인만 Jira mention 노드로. 코드 · 링크 안은 건드리지 않는다.
const RE_GH_MENTION = /(^|[^A-Za-z0-9_/`])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/g;
function textToNodes(text, marks) {
  const s = text == null ? '' : String(text);
  if ((!Object.keys(_mentionRev).length && !_reJiraOnly) || marks.some((m) => m.type === 'code' || m.type === 'link')) return carrierNodes(s, marks);
  // 찾은 멘션: [시작, 끝, accountId, 표시 글자] — @로그인(people) · 맨션:이름(jira)(jiraOnly)
  const hits = [];
  let m;
  RE_GH_MENTION.lastIndex = 0;
  while ((m = RE_GH_MENTION.exec(s))) {
    const acct = _mentionRev[m[2].toLowerCase()];
    if (!acct) continue;
    const at = m.index + m[1].length;
    hits.push([at, at + 1 + m[2].length, acct, '@' + m[2]]);
  }
  if (_reJiraOnly) {
    _reJiraOnly.lastIndex = 0;
    while ((m = _reJiraOnly.exec(s))) {
      const hit = m[1] || m[2];
      const name = Object.keys(_jiraOnly).find((n) => n.toLowerCase() === hit.toLowerCase());
      if (name) hits.push([m.index, m.index + m[0].length, _jiraOnly[name], '@' + name]);
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  const out = [];
  let last = 0;
  for (const [a, b, acct, text] of hits) {
    if (a < last) continue;
    out.push(...carrierNodes(s.slice(last, a), marks));
    out.push({ type: 'mention', attrs: { id: acct, text } });
    last = b;
  }
  out.push(...carrierNodes(s.slice(last), marks));
  return out;
}
function carrierNodes(text, marks) {
  let rest = text == null ? '' : String(text);
  const out = [];
  while (rest) {
    const c = RE_TC.exec(rest);
    const d = RE_DT.exec(rest);
    let idx = -1, kind, m;
    if (c) { idx = c.index; kind = 'c'; m = c; }
    if (d && (idx === -1 || d.index < idx)) { idx = d.index; kind = 'd'; m = d; }
    if (idx === -1) { out.push(textNode(rest, marks)); break; }
    if (idx > 0) out.push(textNode(rest.slice(0, idx), marks));
    if (kind === 'c') {
      const hex = tcHex(m[1]);
      const t = m[2] != null ? m[2] : m[3];
      out.push(hex ? textNode(t, [...marks, { type: 'textColor', attrs: { color: '#' + hex } }]) : textNode(m[0], marks)); // 모르는 색 이름은 글자 그대로
    }
    else out.push({ type: 'date', attrs: { timestamp: String(Date.parse(m[1] + 'T00:00:00Z')) } });
    rest = rest.slice(idx + m[0].length);
  }
  return out.filter((n) => !(n.type === 'text' && n.text === ''));
}

function plainInline(tokens) {
  return (tokens || []).map((t) => t.type === 'text' || t.type === 'escape' ? (t.text || '') : (t.tokens ? plainInline(t.tokens) : (t.text || ''))).join('').trim();
}

function textNode(text, marks = []) {
  const n = { type: 'text', text: text == null ? '' : String(text) };
  if (marks.length) n.marks = marks.map((m) => ({ ...m }));
  return n;
}

function clean(node) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'text') return node.text === '' ? null : node;
  if (Array.isArray(node.content)) node.content = node.content.map(clean).filter(Boolean);
  return node;
}

// ──────────────────────────── ADF → 마크다운 ────────────────────────────

export function adfToMd(adf, opts = {}) {
  _mentionMap = (opts && opts.mentionMap) || {};
  _fileMedia = [];
  const lossy = new Set();
  const md = blocksToMd((adf && adf.content) || [], lossy, 0, false).replace(/\n{3,}/g, '\n\n').trim();
  return { markdown: md, lossy: lossy.size > 0, lossyTypes: [...lossy], fileMedia: _fileMedia, attachPrefix: ATTACH_PREFIX };
}

function blocksToMd(nodes, lossy, depth, inExpand) {
  return (nodes || []).map((n) => blockToMd(n, lossy, depth, inExpand)).filter((s) => s !== '' && s != null).join('\n\n');
}

function blockToMd(n, lossy, depth, inExpand) {
  if (!n) return '';
  switch (n.type) {
    case 'heading':
      return '#'.repeat((n.attrs && n.attrs.level) || 1) + ' ' + inlineToMd(n.content, lossy);
    case 'paragraph':
      return inlineToMd(n.content, lossy);
    case 'bulletList':
      return listToMd(n, lossy, depth, false);
    case 'orderedList':
      return listToMd(n, lossy, depth, true);
    case 'taskList': {
      // 중첩 taskList 는 들여쓰기 두 칸씩
      const tl = (list, ind) => (list.content || []).map((it) => (it.type === 'taskList'
        ? tl(it, ind + '  ')
        : `${ind}- [${it.attrs && it.attrs.state === 'DONE' ? 'x' : ' '}] ` + inlineToMd(it.content, lossy))).join('\n');
      return tl(n, '');
    }
    case 'decisionList':
      return (n.content || []).map((it) => `✔ **결정:** ` + inlineToMd(it.content, lossy)).join('\n\n');
    case 'blockquote':
      return blocksToMd(n.content, lossy, depth, inExpand).split('\n').map((l) => '> ' + l).join('\n');
    case 'panel': {
      const type = PANEL_TO_ALERT[n.attrs && n.attrs.panelType] || 'NOTE';
      const inner = blocksToMd(n.content, lossy, depth, inExpand);
      return '> [!' + type + ']\n' + (inner || ' ').split('\n').map((l) => '> ' + l).join('\n');
    }
    case 'expand':
    case 'nestedExpand': {
      const title = (n.attrs && n.attrs.title) || '펼치기';
      let block = '<details><summary>' + title + '</summary>\n\n' + blocksToMd(n.content, lossy, depth, true) + '\n\n</details>';
      // 중첩 펼치기는 blockquote 로 감싸 GitHub 에서 들여쓰기(중첩이 눈에 보이게)
      if (inExpand) block = block.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n');
      return block;
    }
    case 'codeBlock': {
      const lang = (n.attrs && n.attrs.language) || '';
      return '```' + lang + '\n' + (n.content || []).map((c) => c.text || '').join('') + '\n```';
    }
    case 'rule':
      return '---';
    case 'table':
      return tableToMd(n, lossy);
    case 'blockCard':
    case 'embedCard': {
      const url = n.attrs && (n.attrs.url || (n.attrs.data && n.attrs.data.url));
      return url ? `[${url}](${url})` : ''; // 스마트링크/동영상 카드 → 링크(Jira→GitHub)
    }
    case 'mediaSingle':
    case 'mediaGroup': {
      const parts = [];
      (function find(x) {
        if (!x) return;
        if (x.type === 'media') {
          const a = x.attrs || {};
          if (a.type === 'external' && a.url) parts.push(`![](${a.url})`);
          else if (a.id) { const i = _fileMedia.push({ id: a.id, collection: a.collection || '' }) - 1; parts.push(`![](${ATTACH_PREFIX}${i})`); }
          else lossy.add('media');
        }
        (x.content || []).forEach(find);
      })(n);
      return parts.length ? parts.join('\n\n') : '_[이미지 — 원문에서 보기]_';
    }
    default:
      if (Array.isArray(n.content)) { lossy.add(n.type); return blocksToMd(n.content, lossy, depth); }
      if (n.text) return n.text;
      return '';
  }
}

function listToMd(n, lossy, depth, ordered) {
  const indent = '  '.repeat(depth);
  let i = (n.attrs && n.attrs.order) || 1;
  return (n.content || []).map((item) => {
    const marker = ordered ? i++ + '.' : '-';
    const inner = (item.content || []).map((b) => (b.type === 'bulletList' || b.type === 'orderedList') ? listToMd(b, lossy, depth + 1, b.type === 'orderedList') : blockToMd(b, lossy, depth)).filter((s) => s !== '' && s != null);
    const first = inner.shift() || '';
    let s = indent + marker + ' ' + first;
    for (const extra of inner) s += '\n' + extra.split('\n').map((l) => indent + '  ' + l).join('\n');
    return s;
  }).join('\n');
}

function tableToMd(n, lossy) {
  const rows = (n.content || []).filter((r) => r.type === 'tableRow');
  if (!rows.length) return '';
  const cellText = (cell) => inlineToMd(flattenParas(cell.content), lossy).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const out = [];
  rows.forEach((row, idx) => {
    const cells = (row.content || []).map(cellText);
    out.push('| ' + cells.join(' | ') + ' |');
    if (idx === 0) out.push('| ' + cells.map(() => '---').join(' | ') + ' |');
  });
  return out.join('\n');
}

function flattenParas(blocks) {
  const inl = [];
  for (const b of blocks || []) {
    if (b.type === 'paragraph') inl.push(...(b.content || []));
    else if (Array.isArray(b.content)) inl.push(...flattenParas(b.content));
    else if (b.type === 'text') inl.push(b);
  }
  return inl;
}

function inlineToMd(nodes, lossy) {
  return (nodes || []).map((nd) => inlineNodeToMd(nd, lossy)).join('');
}

function inlineNodeToMd(nd, lossy) {
  if (!nd) return '';
  switch (nd.type) {
    case 'text': {
      let t = nd.text || '';
      const marks = nd.marks || [];
      const has = (tp) => marks.some((m) => m.type === tp);
      const get = (tp) => marks.find((m) => m.type === tp);
      // 글자색·형광 = 색 뱃지로 그 조각을 대체(색을 GitHub 에 담는 확실한 방법)
      const tc = get('textColor');
      const bg0 = get('backgroundColor') || get('highlight');
      // 형광 + 글자색: 형광 뱃지(바탕 = Jira 형광 색) · 글자색은 뱃지 주소 _tc 에 담아 되살림 — 전에는 글자색만 남고 형광이 사라졌다
      if (bg0 && tc) return colorBadge(t, 'hl', (bg0.attrs && bg0.attrs.color) || '#FFF0B3', { tc: tc.attrs && tc.attrs.color });
      if (tc) {
        // Jira 색 그대로 — GitHub 수식은 #hex 를 그 색으로 그린다 · 왕복해도 색이 안 바뀐다
        const raw = String((tc.attrs && tc.attrs.color) || '#172B4D').replace(/^#/, '');
        const hex = /^[0-9A-Fa-f]{6}$/.test(raw) ? raw.toLowerCase() : fam(raw);

        // 글자색 = LaTeX 색 글자($\textcolor{#hex}{\text{..}}$) · 특수문자 섞이면 LaTeX 가 깨져 뱃지로 대체
        if (/[{}$\\%&_^~#<>]/.test(t)) return colorBadge(t, 'tc', '#' + hex);
        return `$\\textcolor{#${hex}}{\\text{${t}}}$`;
      }
      const bg = get('backgroundColor') || get('highlight');
      if (bg) return colorBadge(t, 'hl', (bg.attrs && bg.attrs.color) || '#FFF0B3');
      if (has('code')) t = '`' + t + '`';
      if (has('strike')) t = '~~' + t + '~~';
      if (has('strong')) t = '**' + t + '**';
      if (has('em')) t = '*' + t + '*';
      if (has('underline')) t = '<ins>' + t + '</ins>';
      const ss = get('subsup'); if (ss) { const tag = ss.attrs && ss.attrs.type === 'sup' ? 'sup' : 'sub'; t = `<${tag}>` + t + `</${tag}>`; }
      for (const m of marks) { if (!['code', 'strike', 'strong', 'em', 'underline', 'subsup', 'link'].includes(m.type)) lossy.add(m.type); }
      const link = get('link'); if (link) t = '[' + t + '](' + ((link.attrs && link.attrs.href) || '') + ')';
      return t;
    }
    case 'hardBreak':
      return '  \n';
    case 'status':
      return colorBadge((nd.attrs && nd.attrs.text) || '', 's', (nd.attrs && nd.attrs.color) || 'neutral');
    case 'date': {
      const ts = nd.attrs && nd.attrs.timestamp;
      return '📅 ' + (ts ? new Date(Number(ts)).toISOString().slice(0, 10) : '');
    }
    case 'emoji':
      return (nd.attrs && (nd.attrs.text || nd.attrs.shortName)) || '';
    case 'mention': {
      const a = nd.attrs || {};
      const id = a.id || a.accountId || '';
      const name = String(a.text || '').replace(/^@/, '') || '사용자';
      const login = id && _mentionMap[id];
      // 대조표에 GitHub 계정이 있으면 실제 GitHub 멘션, 없으면 표시용 맨션:이름(jira)
      return login ? '@' + login : `맨션:${name}(jira)`;
    }
    case 'inlineCard':
      return nd.attrs && nd.attrs.url ? '<' + nd.attrs.url + '>' : '';
    case 'mediaInline': { // 글 사이 첨부 파일 — 블록 미디어와 같은 자리표시(워크플로가 링크로 바꾼다)
      const a = nd.attrs || {};
      if (!a.id) return '';
      const i = _fileMedia.push({ id: a.id, collection: a.collection || '' }) - 1;
      return `![](${ATTACH_PREFIX}${i})`;
    }
    default:
      return nd.text || '';
  }
}
