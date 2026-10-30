import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const owner = '10000000-0000-0000-0000-000000000001'
const editor = '10000000-0000-0000-0000-000000000002'
const viewer = '10000000-0000-0000-0000-000000000003'
const outsider = '10000000-0000-0000-0000-000000000004'
const unverified = '10000000-0000-0000-0000-000000000005'
const mapId = '20000000-0000-0000-0000-000000000001'
const mapData = (topic: string) => JSON.stringify({ nodeData: { id: 'root', topic } })

test('cloud map SQL enforces owner, editor, viewer, outsider, and anonymous access', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated nologin;
      create role anon nologin;
      create schema auth;
      create schema extensions;
      create table auth.users (
        id uuid primary key, email text unique, email_confirmed_at timestamptz, created_at timestamptz default now()
      );
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to authenticated, anon;
      grant select on auth.users to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users (id, email, email_confirmed_at) values
        ('${owner}', 'owner@example.test', now()),
        ('${editor}', 'editor@example.test', now()),
        ('${viewer}', 'viewer@example.test', null),
        ('${outsider}', 'outsider@example.test', now()),
        ('${unverified}', 'unverified@example.test', null);
    `)
    const migrationPath = fileURLToPath(new URL('../supabase/migrations/202610300001_cloud.sql', import.meta.url))
    const migration = (await readFile(migrationPath, 'utf8'))
      .replace(/^create extension if not exists pgcrypto with schema extensions;\s*/m, '')
    await db.exec(migration)

    const asUser = async (role: 'authenticated' | 'anon', uid?: string) => {
      await db.query(`set role ${role}`)
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
    }
    const rows = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
      (await db.query<T>(sql, params)).rows
    const denied = async (sql: string, params: unknown[] = []) => {
      await assert.rejects(() => db.query(sql, params))
      // An error aborts the current transaction only when wrapped in one; queries
      // are autocommit here, so subsequent calls can continue normally.
    }

    await asUser('authenticated', owner)
    const created = await rows<{ version: number; owner_id: string }>(
      `select version, owner_id from public.create_map($1::jsonb, $2::uuid)`, [mapData('Private map'), mapId],
    )
    assert.equal(created[0].version, 1)
    assert.equal(created[0].owner_id, owner)
    assert.equal((await rows(`select * from public.create_map($1::jsonb, $2::uuid)`, [mapData('retry'), mapId]))[0].data.nodeData.topic, 'Private map')
    assert.equal((await rows(`select count(*)::int as n from public.get_map($1::uuid)`, [mapId]))[0].n, 1)
    await denied(`update public.maps set owner_id = $1 where id = $2`, [outsider, mapId])

    for (const invalid of [
      { nodeData: { id: 'root', topic: 'ok', children: [{ id: 'x', topic: '' }] } },
      { nodeData: { id: 'root', topic: 'ok', children: {} } },
      { nodeData: { id: 'root', topic: 'ok', children: [{ id: 'root', topic: 'duplicate' }] } },
      { nodeData: { id: 'root', topic: 'ok', children: Array.from({ length: 3000 }, (_, i) => ({ id: `n${i}`, topic: 'x' })) } },
    ]) await denied(`select * from public.save_map($1::uuid, 1, $2::jsonb)`, [mapId, JSON.stringify(invalid)])

    const editorShare = await rows<{ id: string; recipient_id: string }>(
      `select id, recipient_id from public.share_map($1::uuid, $2, 'editor')`, [mapId, 'editor@example.test'],
    )
    const viewerShare = await rows<{ id: string; recipient_id: string | null }>(
      `select id, recipient_id from public.share_map($1::uuid, $2, 'viewer')`, [mapId, ' VIEWER@EXAMPLE.TEST '],
    )
    const pendingShare = await rows<{ id: string; recipient_id: string | null }>(
      `select id, recipient_id from public.share_map($1::uuid, $2, 'editor')`, [mapId, 'unverified@example.test'],
    )
    assert.equal(editorShare[0].recipient_id, editor)
    assert.equal(viewerShare[0].recipient_id, null)
    assert.equal(pendingShare[0].recipient_id, null)
    assert.equal((await rows(`select count(*)::int as n from public.list_map_shares($1::uuid)`, [mapId]))[0].n, 3)

    // Unverified accounts cannot claim email-addressed shares.
    await asUser('authenticated', unverified)
    assert.equal((await rows(`select public.claim_map_shares() as n`))[0].n, 0)
    assert.equal((await rows(`select count(*)::int as n from public.list_maps()`))[0].n, 0)

    // A pending invite is claimed only after the identity has a verified address.
    await db.query('reset role')
    await db.exec(`update auth.users set email_confirmed_at = now() where id = '${viewer}'`)
    await asUser('authenticated', viewer)
    assert.equal((await rows(`select public.claim_map_shares() as n`))[0].n, 1)
    assert.equal((await rows<{ role: string }>(`select role from public.list_maps() where id = $1`, [mapId]))[0].role, 'viewer')
    assert.equal((await rows(`select count(*)::int as n from public.get_map($1::uuid)`, [mapId]))[0].n, 1)
    assert.equal((await rows(`select count(*)::int as n from public.maps where id = $1`, [mapId]))[0].n, 1)
    await denied(`select * from public.save_map($1::uuid, 1, $2::jsonb)`, [mapId, mapData('viewer edit')])
    await denied(`select * from public.share_map($1::uuid, 'other@example.test', 'viewer')`, [mapId])
    await denied(`select * from public.list_map_shares($1::uuid)`, [mapId])
    const shareId = viewerShare[0].id
    await denied(`select public.revoke_map_share($1::uuid, $2::uuid)`, [mapId, shareId])

    await asUser('authenticated', editor)
    assert.equal((await rows<{ version: number }>(`select version from public.save_map($1::uuid, 1, $2::jsonb)`, [mapId, mapData('Editor update')]))[0].version, 2)
    await denied(`select * from public.save_map($1::uuid, null, $2::jsonb)`, [mapId, mapData('missing version')])
    await denied(`select * from public.share_map($1::uuid, 'other@example.test', 'viewer')`, [mapId])
    await denied(`select * from public.list_map_shares($1::uuid)`, [mapId])
    await denied(`select public.revoke_map_share($1::uuid, $2::uuid)`, [mapId, editorShare[0].id])

    await asUser('authenticated', owner)
    await denied(`select * from public.save_map($1::uuid, null, $2::jsonb)`, [mapId, mapData('missing version')])
    await denied(`select * from public.save_map($1::uuid, 1, $2::jsonb)`, [mapId, mapData('stale version')])
    assert.equal((await rows<{ owner_id: string; version: number }>(`select owner_id, version from public.maps where id = $1`, [mapId]))[0].owner_id, owner)
    assert.equal((await rows<{ role: string }>(`select role from public.share_map($1::uuid, 'viewer@example.test', 'viewer')`, [mapId]))[0].role, 'viewer')
    assert.equal((await rows(`select public.revoke_map_share($1::uuid, $2::uuid) as revoked`, [mapId, pendingShare[0].id]))[0].revoked, true)
    await asUser('authenticated', viewer)
    await denied(`select * from public.save_map($1::uuid, 2, $2::jsonb)`, [mapId, mapData('downgrade regression')])

    await asUser('authenticated', owner)
    await rows(`select * from public.share_map($1::uuid, 'editor@example.test', 'viewer')`, [mapId])
    await asUser('authenticated', editor)
    await denied(`select * from public.save_map($1::uuid, 2, $2::jsonb)`, [mapId, mapData('downgraded editor')])
    await asUser('authenticated', owner)
    await rows(`select public.revoke_map_share($1::uuid, $2::uuid)`, [mapId, viewerShare[0].id])
    await asUser('authenticated', viewer)
    assert.equal((await rows(`select count(*)::int as n from public.maps where id = $1`, [mapId]))[0].n, 0)

    await asUser('authenticated', outsider)
    assert.equal((await rows(`select count(*)::int as n from public.list_maps()`))[0].n, 0)
    assert.equal((await rows(`select count(*)::int as n from public.get_map($1::uuid)`, [mapId]))[0].n, 0)
    assert.equal((await rows(`select count(*)::int as n from public.maps where id = $1`, [mapId]))[0].n, 0)
    assert.equal((await rows(`select count(*)::int as n from public.map_shares where map_id = $1`, [mapId]))[0].n, 0)
    await denied(`select * from public.share_map($1::uuid, 'victim@example.test', 'viewer')`, [mapId])
    await denied(`select * from public.list_map_shares($1::uuid)`, [mapId])
    await denied(`select public.revoke_map_share($1::uuid, $2::uuid)`, [mapId, editorShare[0].id])
    await denied(`select * from public.save_map($1::uuid, 2, $2::jsonb)`, [mapId, mapData('outsider edit')])
    await denied(`select * from public.create_map($1::jsonb, $2::uuid)`, [mapData('steal ID'), mapId])

    await asUser('anon')
    for (const sql of [
      `select * from public.list_maps()`,
      `select * from public.get_map('${mapId}'::uuid)`,
      `select * from public.create_map('${mapData('anon')}'::jsonb)`,
      `select * from public.save_map('${mapId}'::uuid, 2, '${mapData('anon')}'::jsonb)`,
      `select * from public.share_map('${mapId}'::uuid, 'x@example.test', 'viewer')`,
      `select public.revoke_map_share('${mapId}'::uuid, '${editorShare[0].id}'::uuid)`,
      `select public.claim_map_shares()`,
      `select * from public.list_map_shares('${mapId}'::uuid)`,
      `select * from public.maps`,
      `select * from public.map_shares`,
    ]) await denied(sql)
  } finally {
    await db.close()
  }
})
