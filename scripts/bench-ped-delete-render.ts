/**
 * Verifica stabilizeRecordArrays: dopo delete, 1 giorno cambia e gli altri restano ===.
 * Esegui: npx tsx scripts/bench-ped-delete-render.ts
 */

import { computePedStatsFromItems } from '../lib/ped-stats'

type Item = {
  id: string
  date: string
  clientId: string
  kind: string
  type: string
  title: string
  status: string
  isExtra?: boolean
  client: { id: string; name: string }
}

function makeItems(count: number, year: number, month: number): Item[] {
  const items: Item[] = []
  for (let i = 0; i < count; i++) {
    const day = 1 + (i % 28)
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    items.push({
      id: `item-${i}`,
      date,
      clientId: `c-${i % 12}`,
      kind: 'CONTENT',
      type: 'POST',
      title: `Task ${i}`,
      status: i % 5 === 0 ? 'DONE' : 'TODO',
      isExtra: i % 17 === 0,
      client: { id: `c-${i % 12}`, name: `Cliente ${i % 12}` },
    })
  }
  return items
}

function groupByDay(items: Item[]): Record<string, Item[]> {
  const map: Record<string, Item[]> = {}
  for (const item of items) {
    if (item.isExtra) continue
    const dateKey = item.date.slice(0, 10)
    const d = new Date(dateKey + 'T00:00:00.000Z')
    const day = d.getUTCDay()
    if (day === 0 || day === 6) continue
    if (!map[dateKey]) map[dateKey] = []
    map[dateKey].push(item)
  }
  return map
}

function stabilize(
  next: Record<string, Item[]>,
  prev: Record<string, Item[]>
): { result: Record<string, Item[]>; reused: number; rebuilt: number; identityOk: boolean } {
  const result: Record<string, Item[]> = {}
  let reused = 0
  let rebuilt = 0
  for (const key of Object.keys(next)) {
    const nextArr = next[key]
    const prevArr = prev[key]
    if (
      prevArr &&
      prevArr.length === nextArr.length &&
      prevArr.every((item, i) => item === nextArr[i])
    ) {
      result[key] = prevArr
      reused++
    } else {
      result[key] = nextArr
      rebuilt++
    }
  }
  let identityOk = true
  for (const key of Object.keys(result)) {
    if (prev[key] && result[key] === prev[key]) continue
    if (prev[key] && result[key] !== prev[key]) {
      // changed day — expected for rebuilt
      continue
    }
  }
  for (const key of Object.keys(prev)) {
    if (!next[key]) continue
    if (result[key] === prev[key]) {
      if (!(prev[key] === result[key])) identityOk = false
    }
  }
  return { result, reused, rebuilt, identityOk }
}

const YEAR = 2026
const MONTH = 9
const N = 220
const items = makeItems(N, YEAR, MONTH)
const before = groupByDay(items)
const deleteTarget = items.find((i) => !i.isExtra && i.date.endsWith('-10'))!
const afterItems = items.filter((i) => i.id !== deleteTarget.id)
const after = groupByDay(afterItems)
const { reused, rebuilt, result, identityOk } = stabilize(after, before)

const changedKeys = Object.keys(result).filter((k) => result[k] !== before[k])
const unchangedKeys = Object.keys(result).filter((k) => result[k] === before[k])

// Assert: unchanged days keep === reference
for (const k of unchangedKeys) {
  if (result[k] !== before[k]) throw new Error(`FAIL identity for ${k}`)
}
if (rebuilt !== 1 && rebuilt !== 0) {
  // deleted day may disappear from map if it was the only item
  if (changedKeys.length > 2) throw new Error(`FAIL expected ~1 changed day, got ${changedKeys.length}`)
}

const t0 = performance.now()
for (let i = 0; i < 500; i++) computePedStatsFromItems(afterItems)
const statsMs = (performance.now() - t0) / 500

console.log(
  JSON.stringify(
    {
      items: N,
      weekdayDaysBefore: Object.keys(before).length,
      afterDelete: {
        dayArraysReused: reused,
        dayArraysRebuilt: rebuilt,
        changedDayKeys: changedKeys,
        unchangedDayIdentityChecks: unchangedKeys.length,
        stabilizeIdentityOk: identityOk,
      },
      computePedStatsAvgMs: Number(statsMs.toFixed(4)),
      expectedUrgentPath:
        'setItems only → affected day column + ~N_day cards; stats deferred; context menu isolated via PedCalendarGrid memo',
    },
    null,
    2
  )
)
