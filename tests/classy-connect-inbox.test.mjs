import assert from "node:assert/strict"
import test, { after } from "node:test"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

const root=fileURLToPath(new URL("..",import.meta.url))
const vite=await createServer({
 appType:"custom",configFile:false,root,
 resolve:{alias:{"@":root}},server:{middlewareMode:true},
})
after(()=>vite.close())

test("Inbox parser recognizes WhatsApp inbound text without status notification",async()=>{
 const {extractConnectInboundMessages:parse}=await vite.ssrLoadModule("/lib/classy-connect/inbound-parser.ts")
 const values=parse("whatsapp",{
  field:"messages",
  value:{
   contacts:[{wa_id:"551199999999",profile:{name:"Contato de Teste"}}],
   messages:[{id:"wamid.in.123",from:"551199999999",type:"text",text:{body:"Bom dia"},timestamp:"1794660000"}],
   statuses:[{id:"wamid.out.abc",status:"delivered"}],
  },
 })
 assert.equal(values.length,1)
 assert.equal(values[0].body,"Bom dia")
 assert.equal(values[0].display_name,"Contato de Teste")
 assert.equal(values[0].message_type,"text")
 assert.equal(values[0].participant_id,"551199999999")
})

test("Inbox parser skips outbound echoes and ignores comments as messages",async()=>{
 const {extractConnectInboundMessages:parse}=await vite.ssrLoadModule("/lib/classy-connect/inbound-parser.ts")
 const result=parse("instagram",{
  id:"1789988",
  changes:[{field:"comments",value:{text:"CRÉDITO",id:"ig_comment"}}],
  messaging:[
   {sender:{id:"u1"},message:{mid:"m1",text:"Oi"},timestamp:1794660000000},
   {sender:{id:"1789988"},message:{mid:"m2",text:"Outgoing"},timestamp:1794660000000},
   {sender:{id:"u2"},message:{mid:"m3",is_echo:true,text:"Echo"},timestamp:1794660000000},
   {sender:{id:"u3"},message:{mid:"m4",attachments:[{type:"image"}]},timestamp:1794660000000},
  ],
 })
 assert.equal(result.length,2)
 assert.equal(result[0].provider_message_id,"m1")
 assert.equal(result[0].body,"Oi")
 assert.equal(result[1].body,"[Mensagem de mídia]")
 assert.equal(result[1].message_type,"media")
 assert.deepEqual(parse("messenger",{id:"page1",messaging:[{sender:{id:"user1"},message:{mid:"msg1",text:"Hello"}}]}).map(x=>x.provider_message_id),["msg1"])
 assert.deepEqual(parse("whatsapp",{value:{statuses:[{status:"read"}]}}),[])
})

test("Internal event processor fails closed without worker secret or valid bearer",async()=>{
 const {NextRequest}=await import("next/server.js")
 const {POST}=await vite.ssrLoadModule("/app/api/internal/connect/process/route.ts")
 const prior=process.env.CONNECT_WORKER_TOKEN
 const originalFetch=globalThis.fetch
 const calls=[]
 globalThis.fetch=async(...args)=>{calls.push(args);return Response.json([])}
 try{
   delete process.env.CONNECT_WORKER_TOKEN
   assert.equal((await POST(new NextRequest("https://crm.invalid/api/internal/connect/process",{method:"POST"}))).status,503)
   process.env.CONNECT_WORKER_TOKEN="test-strong-secret-at-least-32-chars-long-xx"
   assert.equal((await POST(new NextRequest("https://crm.invalid/api/internal/connect/process",{
    method:"POST",headers:{authorization:"Bearer wrong"},
   }))).status,401)
   assert.equal(calls.length,0)
 }finally{
   globalThis.fetch=originalFetch
   if(prior===undefined)delete process.env.CONNECT_WORKER_TOKEN
   else process.env.CONNECT_WORKER_TOKEN=prior
 }
})

test("Internal processor records inbound message and acknowledges event after persistence",async()=>{
 const {NextRequest}=await import("next/server.js")
 const {POST}=await vite.ssrLoadModule("/app/api/internal/connect/process/route.ts")
 const env={CONNECT_WORKER_TOKEN:process.env.CONNECT_WORKER_TOKEN,SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY}
 process.env.CONNECT_WORKER_TOKEN="test-strong-secret-at-least-32-chars-long-xx"
 process.env.SUPABASE_URL="https://supabase.example.invalid"
 process.env.SUPABASE_SECRET_KEY="sb_secret_test_only"
 const priorFetch=globalThis.fetch
 const calls=[]
 globalThis.fetch=async(url,options)=>{
  const path=String(url)
  const body=JSON.parse(options.body)
  calls.push({path,body})
  if(path.endsWith("/claim_connect_events"))return Response.json([{
   event_id:"00000000-0000-4000-8000-000000000001",
   claim_id:"00000000-0000-4000-8000-000000000002",
   provider:"whatsapp",
   event_kind:"whatsapp.change",
   payload:{value:{messages:[{id:"wamid.in.abc",from:"551199999999",type:"text",text:{body:"Preciso de informações"},timestamp:"1794660000"}]}},
  }])
  if(path.endsWith("/record_connect_inbound_message"))return Response.json(true)
  if(path.endsWith("/finish_connect_event"))return Response.json(true)
  return Response.json({message:"unexpected"},{status:500})
 }
 try{
  const response=await POST(new NextRequest("https://crm.invalid/api/internal/connect/process",{
   method:"POST",headers:{authorization:`Bearer ${process.env.CONNECT_WORKER_TOKEN}`},
  }))
  assert.equal(response.status,200)
  assert.deepEqual(await response.json(),{claimed:1,processed:1,inserted:1,failed:0})
  assert.equal(calls.length,3)
  assert.match(calls[0].path,/claim_connect_events$/)
  assert.match(calls[1].path,/record_connect_inbound_message$/)
  assert.match(calls[2].path,/finish_connect_event$/)
  assert.equal(calls[1].body.p_participant_id,"551199999999")
  assert.equal(calls[1].body.p_body,"Preciso de informações")
  assert.equal(calls[2].body.p_success,true)
  assert.equal("workspace_id" in calls[1].body,false)
 }finally{
  globalThis.fetch=priorFetch
  for(const [key,value] of Object.entries(env)){
   if(value===undefined)delete process.env[key];else process.env[key]=value
  }
 }
})

test("Queue health requires worker secret and returns aggregate-only operational data",async()=>{
 const {NextRequest}=await import("next/server.js")
 const {GET}=await vite.ssrLoadModule("/app/api/internal/connect/health/route.ts")
 const previous={
  CONNECT_WORKER_TOKEN:process.env.CONNECT_WORKER_TOKEN,
  SUPABASE_URL:process.env.SUPABASE_URL,
  SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY,
 }
 const beforeFetch=globalThis.fetch
 let calls=0
 process.env.CONNECT_WORKER_TOKEN="test-worker-secret-only-more-than-thirty-two-chars"
 process.env.SUPABASE_URL="https://supabase.example.invalid"
 process.env.SUPABASE_SECRET_KEY="sb_secret_test_only"
 globalThis.fetch=async(url)=>{
   calls++
   assert.match(String(url),/\/rest\/v1\/rpc\/connect_ingress_health$/)
   return Response.json({
     queued:2,processing:1,retry_wait:3,dead_letters:0,
     processed:11,active_channels:2,oldest_pending_at:"2026-11-14T14:00:00Z",
     payload:"sensitive-data-must-not-leak",
   })
 }
 try{
   const base="https://crm.example.invalid/api/internal/connect/health"
   assert.equal((await GET(new NextRequest(base))).status,401)
   assert.equal(calls,0)
   const result=await GET(new NextRequest(base,{
     headers:{authorization:`Bearer ${process.env.CONNECT_WORKER_TOKEN}`},
   }))
   assert.equal(result.status,200)
   assert.equal(result.headers.get("cache-control"),"no-store")
   const body=await result.json()
   assert.equal(body.queued,2)
   assert.equal(body.retry_wait,3)
   assert.equal(body.processed,11)
   assert.equal(body.payload,undefined)
   assert.equal(calls,1)
 }finally{
   globalThis.fetch=beforeFetch
   for(const [key,value] of Object.entries(previous)){
     if(value===undefined)delete process.env[key]
     else process.env[key]=value
   }
 }
})
