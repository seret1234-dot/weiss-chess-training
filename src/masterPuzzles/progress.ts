export type MasterSection = 'tactics' | 'mates'
export type MasterProgress = { attempted: number; correct: number; masteredIds: string[]; reviewedIds: string[] }
const key = (section: MasterSection, course: string) => `weiss:master-puzzles:v1:${section}:${course}`
export function loadMasterProgress(section: MasterSection, course: string): MasterProgress { try { const value=JSON.parse(localStorage.getItem(key(section,course))||'{}'); return {attempted:Number(value.attempted)||0,correct:Number(value.correct)||0,masteredIds:Array.isArray(value.masteredIds)?value.masteredIds:[],reviewedIds:Array.isArray(value.reviewedIds)?value.reviewedIds:[]} } catch { return {attempted:0,correct:0,masteredIds:[],reviewedIds:[]} } }
export function saveMasterProgress(section: MasterSection, course: string, progress: MasterProgress) { localStorage.setItem(key(section,course),JSON.stringify(progress)) }
