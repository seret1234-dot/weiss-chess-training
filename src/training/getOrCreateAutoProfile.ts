import { supabase } from '../lib/supabase'

export async function getOrCreateAutoProfile(userId: string) {
  // 1. try get existing
  const { data: existing, error } = await supabase
    .from('user_auto_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('AUTO PROFILE LOAD ERROR', error)
    return null
  }

  if (existing) {
    return existing
  }

  // 2. create new
  const { data: created, error: createError } = await supabase
    .from('user_auto_profile')
    .insert({
      user_id: userId,
    })
    .select()
    .single()

  if (createError) {
    console.error('AUTO PROFILE CREATE ERROR', createError)
    return null
  }

  return created
}