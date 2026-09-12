export function uniqueProgressTrainerKeys(keys) {
  return [...new Set(keys.map((key) => String(key ?? '').trim()).filter(Boolean))]
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

    const initialResult = await client
      .from('user_chunk_progress')
      .upsert({
        user_id: userId,
        trainer_key: activeTrainerKey,
        chunk_index: 1,
        mastered_puzzles_count: 0,
        is_mastered: false,
        mastered_at: null,
        review_stage: 0,
        last_reviewed_at: null,
        next_review_at: null,
        updated_at: now(),
      }, { onConflict: 'user_id,trainer_key,chunk_index' })
    throwQueryError(initialResult.error, 'Could not create reset course state')
  }

  storage.removeItem(storageKey)
  return { trainerKeys, initialChunk: 1 }
}
