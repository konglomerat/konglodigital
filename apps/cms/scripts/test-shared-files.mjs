import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {localMediaURL,writeSharedFile} from '../src/storage/shared-files.ts'

test('shared file transport preserves bytes, quotes paths and fails closed',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'konglo-shared-'))
 const before={...process.env}
 try{
  delete process.env.PAYLOAD_MEDIA_SSH_HOST
  assert.equal(await writeSharedFile('file.pdf',Buffer.from('test')),false)
  process.env.PAYLOAD_MEDIA_PUBLIC_ORIGIN='https://backend.konglomerat.org'
  assert.equal(localMediaURL('media','a b.svg'),'https://backend.konglomerat.org/api/media/file/a%20b.svg')
  await writeFile(path.join(dir,'ssh'),'#!/bin/sh\nfor arg do last="$arg"; done\nexec sh -c "$last"\n',{mode:0o700})
  process.env.PATH=`${dir}:${process.env.PATH}`
  process.env.PAYLOAD_MEDIA_SSH_HOST='mock-host'
  process.env.PAYLOAD_MEDIA_REMOTE_DIR=dir
  const bytes=Buffer.from([0,255,17,10,83])
  assert.equal(await writeSharedFile("test ' quoted.svg",bytes),true)
  assert.deepEqual(await readFile(path.join(dir,"test ' quoted.svg")),bytes)
  await assert.rejects(writeSharedFile('../escape.svg',bytes),/Ungültige/)
  await writeFile(path.join(dir,'ssh'),'#!/bin/sh\nexit 42\n',{mode:0o700})
  await assert.rejects(writeSharedFile('failure.svg',bytes),/nicht erreichbar/)
 }finally{for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);await rm(dir,{recursive:true,force:true})}
})
