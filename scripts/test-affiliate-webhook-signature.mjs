import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { verifyPayPalSignature } from '../api/paypal-webhook.js'
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048})
const oldFetch=globalThis.fetch
process.env.PAYPAL_WEBHOOK_ID='SYNTHETIC-WEBHOOK-ID'
const body=JSON.stringify({id:'WH-SYNTHETIC',event_type:'PAYMENT.SALE.COMPLETED',resource:{id:'TESTSALE'}})
let crc=0xffffffff
for(const byte of Buffer.from(body)){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(0xedb88320&-(crc&1))}
const checksum=(crc^0xffffffff)>>>0, time='2026-09-07T12:00:00Z'
const message=`fixture|${time}|SYNTHETIC-WEBHOOK-ID|${checksum}`
const headers={'paypal-transmission-id':'fixture','paypal-transmission-time':time,'paypal-transmission-sig':sign('sha256',Buffer.from(message),privateKey).toString('base64'),'paypal-cert-url':'https://api.paypal.com/fixture-certificate.pem','paypal-auth-algo':'SHA256withRSA'}
globalThis.fetch=async url=>{assert.equal(String(url),headers['paypal-cert-url']);return new Response(publicKey.export({type:'spki',format:'pem'}))}
try {
 assert.equal(await verifyPayPalSignature(body,new Request('https://fixture.invalid',{headers})),true)
 assert.equal(await verifyPayPalSignature(body.replace('TESTSALE','TAMPERED'),new Request('https://fixture.invalid',{headers})),false)
 assert.equal(await verifyPayPalSignature(body,new Request('https://fixture.invalid')),false)
 await assert.rejects(()=>verifyPayPalSignature(body,new Request('https://fixture.invalid',{headers:{...headers,'paypal-cert-url':'https://evil.invalid/cert'}})),/Untrusted/)
 console.log('PASS synthetic RSA-signed PayPal webhook: valid signature, tampered body rejection, missing headers rejection, untrusted certificate host rejection; no external request')
} finally {globalThis.fetch=oldFetch}
