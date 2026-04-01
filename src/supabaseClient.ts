import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nykqqbsjldabnxnnzrdh.supabase.co'
const supabaseKey = 'sb_publishable_ZwacJUi-uHZSAlTNA3lBuQ_Pccri0jn'

export const supabase = createClient(supabaseUrl, supabaseKey)