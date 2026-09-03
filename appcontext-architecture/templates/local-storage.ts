// 셸 내부 공용 — localStorage 로 값을 "기억"하는 저장소 유틸 + 상태 훅.
//
// 셸 훅(use-theme·use-locale 등)이 **import 해서** 쓴다. 위험하고 미묘한 부분
// (저장소 예외처리·JSON·첫 렌더 lazy init)을 여기 한 곳에 모아, 셸 훅마다 다시 짜지 않게 한다.
// → appcontext-architecture 스킬 §4-3 "공통 로직은 템플릿에서 import" 의 실체다.
//
// ⚠️ **앱은 이 파일을 import 하지 않는다.** 셸 내부 util(경계 아래)이라 계약·external·CSP 와 무관하다.
// ⚠️ 값의 진실이 **셸 안**일 때(state형)만 쓴다. 진실이 밖 인스턴스(i18next 등)면 이걸 값에 쓰지 말고
//    그 인스턴스를 `useSyncExternalStore` 로 구독해라(거울형) — 저장도 그쪽이 한다.

import * as React from 'react'

/**
 * localStorage 에서 **안전하게** 읽는다. 없거나·깨졌거나·검증 실패면 `null`.
 *
 * - 샌드박스 iframe·설정 차단 브라우저에서는 접근 자체가 throw 한다 → try-catch 로 감싼다.
 * - `validate` 로 저장된 값이 기대한 타입인지 확인한다(깨진 값을 그대로 믿지 않는다).
 *
 * React 밖에서도 부를 수 있다 — 예: 첫 페인트 전에 테마를 적용해 FOUC 를 없앨 때(모듈 로드 시점).
 */
export function readStored<T>(key: string, validate: (raw: unknown) => raw is T): T | null {
  try {
    const text = localStorage.getItem(key)
    if (text === null) return null
    const parsed = JSON.parse(text) as unknown
    return validate(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** localStorage 에 **안전하게** 쓴다. 못 써도(사설 모드·용량 초과) 조용히 넘어간다 — 세션 안에서는 동작한다. */
export function writeStored<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 저장만 실패할 뿐, 이번 세션 동작은 그대로 유지된다 */
  }
}

/**
 * 값을 localStorage 에 기억하는 상태. `useState` 와 같은 모양 `[value, setValue]` 를 돌려준다.
 *
 * - **lazy init** — 첫 렌더에 한 번만 저장소를 읽는다. 없으면 `initial`.
 * - 값이 바뀌면 **세터가 저장한다**(effect 아님 → 초기값을 불필요하게 다시 쓰지 않는다).
 * - `setValue` 의 참조는 안정하다(`useCallback`). 계약(`AppContext`) 의존성으로 들어가도
 *   무관한 리렌더에 계약이 재생성되지 않는다.
 *
 * DOM 반영(예: `<html class="dark">`)·OS 환경설정 같은 **표면별** 동작은 여기 넣지 않는다 —
 * 그건 각 셸 훅이 자기 effect 로 한다(§4-3: 얇은 훅은 표면별 부분만).
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  validate: (raw: unknown) => raw is T,
): readonly [T, (next: T) => void] {
  const [value, setValue] = React.useState<T>(() => readStored(key, validate) ?? initial)

  const set = React.useCallback(
    (next: T) => {
      setValue(next)
      writeStored(key, next)
    },
    [key],
  )

  return [value, set] as const
}
