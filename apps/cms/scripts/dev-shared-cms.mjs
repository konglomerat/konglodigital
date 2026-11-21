import { spawn, execFileSync } from 'node:child_process'
import nextEnv from '@next/env'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const {loadEnvConfig}=nextEnv
loadEnvConfig(root,true)
const database=new URL(process.env.POSTGRES_URL || 'postgres://invalid')
if(database.pathname==='/konglo_cms'){
  if(database.hostname!=='127.0.0.1'||database.port!=='55432')throw new Error('Shared CMS requires the configured loopback SSH tunnel.')
  const host=process.env.CMS_SSH_HOST || 'konglo-server'
  const service=process.env.CMS_DB_SERVICE || 'konglo-cms-postgres-bpnl8u'
  if(!/^[\w.-]+$/.test(host)||!/^[\w.-]+$/.test(service))throw new Error('Invalid SSH configuration')
  const command=`container=$(docker ps -q --filter label=com.docker.swarm.service.name=${service}); test -n "$container" && nsenter -t $(docker inspect -f '{{.State.Pid}}' "$container") -n ip -4 -o addr show eth1`
  const network=execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10',host,command],{encoding:'utf8'})
  const address=network.match(/inet (\d+\.\d+\.\d+\.\d+)\//)?.[1]
  if(!address)throw new Error('Cannot resolve the private database address')
  const control='/tmp/konglo-cms-shared-ssh'
  try{execFileSync('ssh',['-S',control,'-O','exit',host],{stdio:'ignore'})}catch{}
  execFileSync('ssh',['-M','-S',control,'-fnNT','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3','-L',`127.0.0.1:55432:${address}:5432`,host],{stdio:'inherit'})
  console.log('Shared CMS database connected through SSH. Automatic schema changes are disabled.')
}else if(database.pathname!=='/konglo_cms_workareas_local')throw new Error('Unexpected CMS database')
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3106'],{cwd:root,stdio:'inherit',env:process.env})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
child.on('exit',code=>process.exit(code??0))
