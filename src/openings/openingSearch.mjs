const TYPO_ALIASES = new Map([
  ['lopes', 'lopez'],
  ['sicillian', 'sicilian'],
  ['najdrof', 'najdorf'],
  ['gambbit', 'gambit'],
])
const SEARCH_FIELDS_CACHE = new WeakMap()

export function normalizeOpeningSearchText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizedQueryTokens(value) {
  return normalizeOpeningSearchText(value)
    .split(' ')
    .filter(Boolean)
    .map((token) => TYPO_ALIASES.get(token) ?? token)
}

function levenshtein(left, right) {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length

  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const old = row[j]
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (left[i - 1] === right[j - 1] ? 0 : 1),
      )
      previous = old
    }
  }
  return row[right.length]
}

function typoBudget(token) {
  if (token.length >= 8) return 2
  if (token.length >= 3) return 1
  return 0
}

function tokenDistance(queryToken, candidateToken) {
  if (queryToken === candidateToken) return 0
  if (
    Math.min(queryToken.length, candidateToken.length) >= 3 &&
    (candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken))
  ) {
    return Math.abs(candidateToken.length - queryToken.length) * 0.2 + 0.1
  }
  if (/\d/.test(queryToken) || /\d/.test(candidateToken) || queryToken[0] !== candidateToken[0]) {
    return Number.POSITIVE_INFINITY
  }
  const distance = levenshtein(queryToken, candidateToken)
  return distance <= typoBudget(queryToken) ? distance : Number.POSITIVE_INFINITY
}

function aliasesFor(record) {
  if (Array.isArray(record.aliases)) return record.aliases.map(String)
  if (record.aliases && typeof record.aliases === 'object') return Object.values(record.aliases).flat().map(String)
  return []
}

function searchableFields(record) {
  if (record && typeof record === 'object' && SEARCH_FIELDS_CACHE.has(record)) {
    return SEARCH_FIELDS_CACHE.get(record)
  }
  const fields = [
    { value: record.eco, priority: 0 },
    { value: record.family, priority: 0 },
    { value: record.variation, priority: 1 },
    { value: record.subvariation, priority: 2 },
    { value: record.name, priority: 3 },
    { value: record.family_slug, priority: 5 },
    ...aliasesFor(record).map((value) => ({ value, priority: 2 })),
  ]
    .filter(({ value }) => String(value ?? '').trim())
    .map((field) => {
      const text = String(field.value).trim()
      const normalized = normalizeOpeningSearchText(text)
      return { ...field, raw: text.toLowerCase(), normalized, tokens: normalized.split(' ').filter(Boolean) }
    })
  const combinedText = fields.map(({ value }) => value).join(' ')
  const combinedNormalized = normalizeOpeningSearchText(combinedText)
  const searchable = {
    fields,
    combined: { value: combinedText, priority: 8, raw: combinedText.toLowerCase(), normalized: combinedNormalized, tokens: combinedNormalized.split(' ').filter(Boolean) },
  }
  if (record && typeof record === 'object') SEARCH_FIELDS_CACHE.set(record, searchable)
  return searchable
}

export function prepareOpeningSearchRecords(records) {
  for (const record of records) searchableFields(record)
  return records
}

function scoreField(field, rawQuery, queryTokens) {
  const raw = field.raw
  const normalized = field.normalized
  const query = queryTokens.join(' ')
  const tokens = field.tokens

  if (raw === rawQuery.trim().toLowerCase()) return field.priority
  if (normalized === query) return 5 + field.priority
  if (normalized.startsWith(`${query} `) || normalized.includes(` ${query} `) || normalized.endsWith(` ${query}`)) {
    return 12 + field.priority + normalized.length / 1000
  }

  let fuzzyCost = 0
  for (const queryToken of queryTokens) {
    let best = Number.POSITIVE_INFINITY
    for (const candidateToken of tokens) {
      best = Math.min(best, tokenDistance(queryToken, candidateToken))
    }
    if (!Number.isFinite(best)) return Number.POSITIVE_INFINITY
    fuzzyCost += best
  }

  const exactTokenCount = queryTokens.filter((queryToken) => tokens.includes(queryToken)).length
  const tier = fuzzyCost === 0 ? 20 : fuzzyCost <= 1.2 * queryTokens.length ? 40 : 60
  return tier + fuzzyCost * 4 + field.priority - exactTokenCount * 0.1 + normalized.length / 10000
}

export function scoreOpeningSearchRecord(record, queryValue) {
  const rawQuery = String(queryValue ?? '').trim()
  const queryTokens = normalizedQueryTokens(rawQuery)
  if (!queryTokens.length) return 0
  if (/^[a-e]\d{2}$/i.test(queryTokens[0]) && queryTokens.length === 1) {
    return normalizeOpeningSearchText(record.eco) === queryTokens[0] ? 0 : Number.POSITIVE_INFINITY
  }

  const { fields, combined } = searchableFields(record)
  return Math.min(...fields.map((field) => scoreField(field, rawQuery, queryTokens)), scoreField(combined, rawQuery, queryTokens))
}

export function searchOpeningRecords(records, queryValue) {
  const query = String(queryValue ?? '').trim()
  if (!query) return [...records]

  return records
    .map((record, index) => ({ record, index, score: scoreOpeningSearchRecord(record, query) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) =>
      left.score - right.score ||
      String(left.record.name ?? '').localeCompare(String(right.record.name ?? '')) ||
      left.index - right.index,
    )
    .map(({ record }) => record)
}
