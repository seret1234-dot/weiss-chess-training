// Real PostgreSQL transaction races; synthetic accounts only, no PayPal/network.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run=promisify(execFile), database=process.env.AFFILIATE_TEST_DATABASE
if(!/^affiliate_test\d+$/.test(database||''))throw Error('Set AFFILIATE_TEST_DATABASE to an isolated affiliate_testN database')
const binary='C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe'
async function sql(query){const {stdout}=await run(binary,['-X','-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At','-c',`set statement_timeout='10s';${query}`],{windowsHide:true});return stdout.trim().split('\n').at(-1)}
const owner='60000000-0000-4000-8000-000000000001', admins=['60000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000003']
await sql(`insert into auth.users(id,email,email_confirmed_at) values('${owner}','race-owner@test.invalid',now()),('${admins[0]}','race-admin1@test.invalid',now()),('${admins[1]}','race-admin2@test.invalid',now());insert into affiliate_admins(user_id) values('${admins[0]}'),('${admins[1]}');`)
const account=JSON.parse(await sql(`set role service_role;select affiliate_command('${owner}','activate','{"code":"race-coach","display_name":"Race","paypal_email":"race@test.invalid","terms_version":"2026-09-07","accept_terms":true}');`))
await sql(`set role service_role;select affiliate_command('${admins[0]}','adjust','{"id":"${account.id}","amount_minor":6000,"reason":"synthetic race credit"}');update affiliate_commissions set hold_until=now()-interval '1 day' where affiliate_id='${account.id}';`)
const attempts=await Promise.allSettled(Array.from({length:8},(_,i)=>sql(`set role service_role;select affiliate_command('${admins[i%2]}','prepare_payout','{"id":"${account.id}","reason":"concurrent monthly batch"}');`)))
assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1,'Exactly one payout reservation succeeds')
assert.equal(await sql(`select count(*) from affiliate_payouts where affiliate_id='${account.id}' and status='prepared'`),'1')
const payout=JSON.parse(attempts.find(x=>x.status==='fulfilled').value)
assert.equal(await sql(`select sum(amount_minor) from affiliate_payout_items where payout_id='${payout.id}'`),'6000')
const final=await Promise.allSettled(admins.map((admin,i)=>sql(`set role service_role;select affiliate_command('${admin}','${i?'cancel_payout':'pay'}','{"id":"${payout.id}","reason":"concurrent finalize","reference":"SYNTHETIC-RACE-NO-TRANSFER"}');`)))
assert.equal(final.filter(x=>x.status==='fulfilled').length,1,'Pay/cancel has one winner')
const state=await sql(`select status from affiliate_payouts where id='${payout.id}'`)
assert.ok(['paid','cancelled'].includes(state))
assert.equal(await sql(`select count(*) from affiliate_admin_audit where action in ('pay','cancel_payout') and after_value->>'id'='${payout.id}'`),'1')
console.log(`PASS: 8 concurrent payout preparations / 2 distinct admins, one reserved batch with exact immutable sum; pay/cancel race one winner (${state}), one audit record; no money sent`)
