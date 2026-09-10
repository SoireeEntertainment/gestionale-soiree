/**
 * Simula il costo di un delete su ~200 task: quanti day/task array cambiano
 * con stabilizeRecordArrays vs senza (rebuild totale).
 * Esegui: npx tsx scripts/bench-ped-delete-render.ts
 */

import { computePedStatsFromItems } from '../lib/ped-stats'
import { getISOWeekStartKey } from '../lib/ped-utils'

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
): { result: Record<string, Item[]>; reused: number; rebuilt: number } {
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
  return { result, reused, rebuilt }
}

const YEAR = 2026
const MONTH = 9
const N = 220
const items = makeItems(N, YEAR, MONTH)
const before = groupByDay(items)
const deleteId = items.find((i) => !i.isExtra && i.date.endsWith('-10'))!.id
const afterItems = items.filter((i) => i.id !== deleteId)
const after = groupByDay(afterItems)
const { reused, rebuilt } = stabilize(after, before)

const dayKeys = Object.keys(before)
const taskCount = Object.values(before).reduce((s, a) => s + a.length, 0)

const t0 = performance.now()
for (let i = 0; i < 200; i++) computePedStatsFromItems(afterItems)
const statsMs = (performance.now() - t0) / 200

console.log(
  JSON.stringify(
    {
      items: N,
      weekdayDays: dayKeys.length,
      weekdayTasks: taskCount,
      afterDelete: {
        dayArraysReused: reused,
        dayArraysRebuilt: rebuilt,
        approxTaskCardsSkipped: taskCount - (after[Object.keys(after).find((k) => after[k] !== before[k]) ?? '']?.length ?? 0),
      },
      beforeBaseline: {
        dayArraysRebuilt: dayKeys.length,
        taskCardsRerendered: taskCount,
      },
      computePedStatsAvgMs: Number(statsMs.toFixed(3)),
      note:
        'With memo + stable day arrays, delete should re-render ~1 day column and ~N_day task cards (memo skip for unchanged item fields), not all month tasks.',
    },
    null,
    2
  )
)

void getISOWeekStartKey
