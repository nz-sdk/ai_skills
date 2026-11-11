#!/usr/bin/env node
// =====================================================================
// issue-body.mjs — 이슈 양식(yml) + 답변(JSON) → 이슈 본문(마크다운)
//
//   node .github/scripts/issue-body.mjs .github/ISSUE_TEMPLATE/bug_report.yml answers.json body.md
//   (셋째 인자가 없으면 표준출력. PowerShell 5.1 의 > 는 UTF-16 으로 저장하므로 셋째 인자를 쓴다)
//
// report-issue 스킬이 쓴다. GitHub 웹 양식으로 제출한 본문과 같은 모양을 만든다:
//   ### <칸 이름>      ← 양식의 attributes.label, 양식 순서 그대로
//   (빈 줄)
//   <값>               ← 답변이 없으면 _No response_ (GitHub 웹과 같다)
// 같은 본문이 GitHub 이슈와 Jira 설명에 그대로 들어가므로 양쪽 소제목 · 순서가 늘 같다.
//
// 답변 JSON: 양식 칸의 id → 값. dropdown 은 선택지 글자 그대로(multiple 이면 배열), checkboxes 는 고른 선택지 배열.
//   {"screen": "주문등록", "problem": "…", "design-check": "예 — 설계자 결정 필요"}
// 양식에 없는 id 가 오면 실패한다 — 칸을 지어내지 않기 위해서다. required 칸이 비어도 실패한다.
//
// node 만 있으면 운영체제와 상관없이 돈다(Windows · macOS · Linux). yml 은 npx yaml(판 고정)로 읽는다 —
// 저장소 의존성을 늘리지 않는다.
//
// 종료 코드: 2 파일 없음 · 3 없는 칸 · 4 필수 칸 누락 · 5 선택지 밖 값
// =====================================================================
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const [form, answersPath, outPath] = process.argv.slice(2)
if (!form || !answersPath) {
  console.error('usage: node issue-body.mjs <양식 yml> <답변 json> [본문 md]')
  process.exit(2)
}
if (!existsSync(form)) {
  console.error(`양식이 없다: ${form}`)
  process.exit(2)
}
if (!existsSync(answersPath)) {
  console.error(`답변이 없다: ${answersPath}`)
  process.exit(2)
}

// npx 는 Windows 에서 npx.cmd 라 셸을 거쳐 부른다(execSync 기본). 양식은 표준입력으로 넘긴다.
const formJson = execSync('npx --yes yaml@2.6.1 --json --single', {
  input: readFileSync(form),
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'inherit'],
})
const spec = JSON.parse(formJson)
const answers = JSON.parse(readFileSync(answersPath, 'utf8'))

const fields = (spec.body || []).filter((f) => f.type !== 'markdown' && f.id)
const known = new Set(fields.map((f) => f.id))
const unknown = Object.keys(answers).filter((k) => !known.has(k))
if (unknown.length) {
  console.error(`unknown field id: ${unknown.join(', ')} (form fields: ${[...known].join(', ')})`)
  process.exit(3)
}

const empty = (v) => v === undefined || v === null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '')
const missing = fields.filter((f) => f.validations?.required && empty(answers[f.id])).map((f) => f.id)
if (missing.length) {
  console.error(`required field empty: ${missing.join(', ')}`)
  process.exit(4)
}

const parts = fields.map((f) => {
  const label = f.attributes.label
  const v = answers[f.id]
  let value
  if (f.type === 'checkboxes') {
    const picked = new Set(Array.isArray(v) ? v : [])
    value = f.attributes.options.map((o) => `- [${picked.has(o.label) ? 'X' : ' '}] ${o.label}`).join('\n')
  } else if (f.type === 'dropdown') {
    const opts = f.attributes.options
    const list = Array.isArray(v) ? v : empty(v) ? [] : [v]
    const bad = list.filter((x) => !opts.includes(x))
    if (bad.length) {
      console.error(`not an option of ${f.id}: ${bad.join(', ')}`)
      process.exit(5)
    }
    value = list.length ? list.join(', ') : '_No response_'
  } else {
    value = empty(v) ? '_No response_' : String(v).replace(/\s+$/, '')
  }
  return `### ${label}\n\n${value}`
})

// 끝 줄바꿈을 붙이지 않는다 — GitHub 웹 양식이 저장하는 본문과 글자까지 같게
const body = parts.join('\n\n')
if (outPath) writeFileSync(outPath, body, 'utf8') // BOM 없는 UTF-8
else process.stdout.write(body + '\n')
