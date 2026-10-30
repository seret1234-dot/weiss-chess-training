export function uniqueProgressTrainerKeys(keys) {
  return [...new Set(keys.map((key) => String(key ?? '').trim()).filter(Boolean))]
}

function isMissingStartedAtColumn(error) {
  const message = error?.message ?? String(error ?? '')
  return message.includes('started_at') && message.includes('does not exist')
}

async function upsertEmptyChunk(client, payload) {
  let result = await client
    .from('user_chunk_progress')
    .upsert(payload, { onConflict: 'user_id,trainer_key,chunk_index' })

  // Source can be previewed before the additive marker migration is applied.
  // Preserve restart durability in that compatibility window rather than
  // failing an otherwise valid reset.
  if (result.error && isMissingStartedAtColumn(result.error)) {
    const { started_at: _startedAt, ...legacyPayload } = payload
    result = await client
      .from('user_chunk_progress')
      .upsert(legacyPayload, { onConflict: 'user_id,trainer_key,chunk_index' })
  }
  return result
}

/**
 * Resets exactly one loaded chunk. Unlike course restart, this preserves every
 * sibling chunk and course while keeping the server, account-scoped browser
 * snapshot, and per-puzzle mastery source in agreement before rehydration.
 */
export async function resetCurrentChunkProgressPersistence({
  client,
  userId,
  trainerKey,
  chunkNumber,
  puzzleIds,
  storage,
  storageKey,
  savedState,
  studyCourse,
  studyTheme,
  now = () => new Date().toISOString(),
}) {
  if (!trainerKey || !Number.isInteger(chunkNumber) || chunkNumber < 1) {
    throw new Error('A valid trainer chunk is required.')
  }
  const currentPuzzleIds = [...new Set((puzzleIds ?? []).filter(Boolean))]

  if (userId) {
    if (studyCourse && studyTheme && currentPuzzleIds.length > 0) {
      const trainingResult = await client
        .from('training_progress')
        .delete()
        .eq('user_id', userId)
        .eq('course', studyCourse)
        .eq('theme', studyTheme)
        .in('item_id', currentPuzzleIds)
      throwQueryError(trainingResult.error, 'Could not reset current puzzle mastery')
    }

    // Upsert is deliberate: a reset must be durable whether the chunk row was
    // created by an earlier solve, a review, or has never existed before.
    const chunkResult = await upsertEmptyChunk(client, {
        user_id: userId,
        trainer_key: trainerKey,
        chunk_index: chunkNumber,
        mastered_puzzles_count: 0,
        is_mastered: false,
        started_at: null,
        mastered_at: null,
        review_stage: 0,
        last_reviewed_at: null,
        next_review_at: null,
        updated_at: now(),
      })
    throwQueryError(chunkResult.error, 'Could not reset current chunk progression')
  }

  storage.setItem(storageKey, JSON.stringify(savedState))
  return { chunkNumber, puzzleIds: currentPuzzleIds }
}

/**
 * Imported legacy completion may fill only untouched leading chunks. A reset
 * writes an account-scoped browser boundary and an unmastered server row; both
 * must agree before compatibility hydration is allowed to cap legacy credit.
 *
 * Merely seeing an open server row is not enough: first-load setup creates
 * those rows too, and treating them as reset boundaries would discard valid
 * legacy progress for new users.
 */
export function capLegacyCreditAtOpenChunk(legacyCredit, activeRows, resetChunkIndexes = []) {
  const explicitResetChunks = [...new Set(resetChunkIndexes)]
    .map((index) => Number(index) + 1)
    .filter((chunk) => Number.isInteger(chunk) && chunk >= 1)

  const firstOpenChunk = explicitResetChunks
    .filter((chunk) => (activeRows ?? []).some((row) => (
      Number(row?.chunk_index) === chunk && row?.is_mastered === false
    )))
    .sort((left, right) => left - right)[0]
  return firstOpenChunk == null
    ? Math.max(0, legacyCredit)
    : Math.max(0, Math.min(legacyCredit, firstOpenChunk - 1))
}

/**
 * Fences course progress writes during an explicit reset. New writes are
 * rejected and already-started writes drain before durable rows are deleted.
 */
export function createProgressionResetCoordinator() {
  let resetting = false
  let generation = 0
  const pending = new Set()

  function track(operation) {
    if (resetting) return Promise.resolve(undefined)
    const operationGeneration = generation
    const promise = Promise.resolve().then(() => {
      if (resetting || operationGeneration !== generation) return undefined
      return operation()
    })
    pending.add(promise)
    void promise.then(
      () => pending.delete(promise),
      () => pending.delete(promise),
    )
    return promise
  }

  async function startReset() {
    if (resetting) return false
    resetting = true
    generation += 1
    await Promise.allSettled([...pending])
    return true
  }

  function finishReset() {
    resetting = false
  }

  return {
    get isResetting() {
      return resetting
    },
    get pendingCount() {
      return pending.size
    },
    track,
    startReset,
    finishReset,
  }
}

function throwQueryError(error, message) {
  if (error) throw new Error(`${message}: ${error?.message ?? String(error)}`)
}

/** Resets one course and its own historical aliases, never sibling courses. */
export async function resetCourseProgressPersistence({
  client,
  userId,
  activeTrainerKey,
  relatedTrainerKeys,
  storage,
  storageKey,
  studyCourse,
  studyTheme,
  now = () => new Date().toISOString(),
}) {
  const trainerKeys = uniqueProgressTrainerKeys([
    activeTrainerKey,
    ...(relatedTrainerKeys ?? []),
  ])
  if (!activeTrainerKey || trainerKeys.length === 0) {
    throw new Error('A course progress trainer key is required.')
  }

  if (userId) {
    if (studyCourse && studyTheme) {
      const trainingResult = await client
        .from('training_progress')
        .delete()
        .eq('user_id', userId)
        .eq('course', studyCourse)
        .eq('theme', studyTheme)
      throwQueryError(trainingResult.error, 'Could not reset puzzle mastery')
    }

    const chunkResult = await client
      .from('user_chunk_progress')
      .delete()
      .eq('user_id', userId)
      .in('trainer_key', trainerKeys)
    throwQueryError(chunkResult.error, 'Could not reset chunk progression')

    const initialResult = await upsertEmptyChunk(client, {
        user_id: userId,
        trainer_key: activeTrainerKey,
        chunk_index: 1,
        mastered_puzzles_count: 0,
        is_mastered: false,
        started_at: null,
        mastered_at: null,
        review_stage: 0,
        last_reviewed_at: null,
        next_review_at: null,
        updated_at: now(),
      })
    throwQueryError(initialResult.error, 'Could not create reset course state')
  }

  storage.removeItem(storageKey)
  return { trainerKeys, initialChunk: 1 }
}
