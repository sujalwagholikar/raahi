import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
await db.exec("create table public.profiles(id uuid primary key,note text);grant select on public.profiles to anon,authenticated;create function public.unrelated_fn() returns int language sql as $$select 1$$;");
const sql=fs.readFileSync(new URL('../database/001_schema.sql',import.meta.url),'utf8').replace('create extension if not exists pgcrypto;','');
try{await db.exec(sql);console.log('Migration applied successfully')}catch(e){console.error(e.message);process.exit(1)}
const c='00000000-0000-4000-8000-000000000001',d='00000000-0000-4000-8000-000000000002',a='00000000-0000-4000-8000-000000000003',d2='00000000-0000-4000-8000-000000000004';
for(const [id,role] of [[c,'customer'],[d,'captain'],[a,'customer'],[d2,'captain']])await db.query(`insert into auth.users values($1,$2)`,[id,JSON.stringify({name:role,role})]);
await db.query(`update raahi_profiles set role='admin' where id=$1`,[a]);
async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
async function expectFail(label,fn){try{await fn();throw Error('Expected rejection: '+label)}catch(e){if(e.message.startsWith('Expected rejection'))throw e;console.log('PASS rejected '+label)}}
await as(c);await expectFail('customer self approval',()=>db.query('select raahi_review_captain($1,true,\'\')',[d]));
let r=(await db.query(`select (raahi_book_ride('Deccan','Koregaon',18.5196,73.8413,18.5362,73.894,'bike','10000000-0000-4000-8000-000000000001')).*`)).rows[0];console.log('PASS book',r.id,r.fare);
const duplicate=(await db.query(`select (raahi_book_ride('Deccan','Koregaon',18.5196,73.8413,18.5362,73.894,'bike','10000000-0000-4000-8000-000000000001')).id`)).rows[0];if(duplicate.id!==r.id)throw Error('idempotency failed');console.log('PASS idempotency');
const code=(await db.query('select raahi_get_start_code($1) as code',[r.id])).rows[0].code;
await as(d);await expectFail('unapproved captain acceptance',()=>db.query("select raahi_transition_ride($1,'accept')",[r.id]));await expectFail('captain reads start code',()=>db.query('select raahi_get_start_code($1)',[r.id]));
await as(a);for(const id of [d,d2])await db.query("select raahi_review_captain($1,true,'Verified offline')",[id]);
await as(d);await db.query('select raahi_set_availability(true)');await db.query("select raahi_transition_ride($1,'accept')",[r.id]);
await as(d2);await db.query('select raahi_set_availability(true)');await expectFail('second captain acceptance',()=>db.query("select raahi_transition_ride($1,'accept')",[r.id]));
const hidden=await db.query('select * from raahi_rides');if(hidden.rows.length)throw Error('RLS leak');console.log('PASS unrelated captain RLS');
await as(d);await expectFail('skipping arrival',()=>db.query("select raahi_transition_ride($1,'complete')",[r.id]));await db.query("select raahi_transition_ride($1,'arrive')",[r.id]);await expectFail('wrong start code',()=>db.query("select raahi_transition_ride($1,'start','0000')",[r.id]));await db.query("select raahi_transition_ride($1,'start',$2)",[r.id,code]);await db.query("select raahi_create_sos($1)",[r.id]);await db.query("select raahi_transition_ride($1,'complete')",[r.id]);console.log('PASS ride lifecycle and SOS');
await expectFail('direct role escalation',()=>db.query("update raahi_profiles set role='admin' where id=$1",[d]));
await as(a);const audits=await db.query('select * from raahi_audit');console.log('PASS admin raahi_audit access:',audits.rows.length,'events');
await db.exec('reset role;set role anon');await db.query('select * from public.profiles');await db.query('select public.unrelated_fn()');console.log('PASS existing application objects and grants preserved');console.log('ALL DATABASE CHECKS PASSED');await db.close();
