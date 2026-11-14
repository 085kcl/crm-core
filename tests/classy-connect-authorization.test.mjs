import assert from "node:assert/strict"
import test, { after } from "node:test"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

const root = fileURLToPath(new URL("..", import.meta.url))
const vite = await createServer({
  appType:"custom", configFile:false, root,
  resolve:{alias:{"@":root}},server:{middlewareMode:true},
})
after(()=>vite.close())

const workspace = "11111111-1111-4111-8111-111111111111"
const otherWorkspace = "22222222-2222-4222-8222-222222222222"
const conversation = "33333333-3333-4333-8333-333333333333"
const otherContact = "44444444-4444-4444-8444-444444444444"
const user = "55555555-5555-4555-8555-555555555555"
const colleague = "66666666-6666-4666-8666-666666666666"

function request(url, {method="GET", demo=false, logged=true, workspaceId=workspace, body=null, origin=true} = {}) {
  const headers = {cookie:
    `crm_workspace_id=${workspaceId}`+
    (logged?"; crm_access_token=test-jwt":"")+
    (demo?"; crm_demo_session=1":""),
  }
  if (origin) headers.origin = "https://crm.example.invalid"
  if (body) headers["content-type"] = "application/json"
  return new URLRequest(url,{method,headers,...(body?{body:JSON.stringify(body)}:{})})
}

let URLRequest
function mockSupabase(handler) {
  const oldFetch = globalThis.fetch
  const previous = {
    SUPABASE_URL:process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY:process.env.SUPABASE_PUBLISHABLE_KEY,
  }
  process.env.SUPABASE_URL = "https://supabase.example.invalid"
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test"
  const calls = []
  globalThis.fetch = async (url,init={}) => {
    const href=String(url)
    calls.push({href,init})
    if(href.endsWith("/auth/v1/user")) return Response.json({id:user})
    if(href.includes("/rest/v1/workspace_members?")) return Response.json([{role:"sales",status:"active"}])
    return handler(href,init)
  }
  return {calls,restore(){
    globalThis.fetch=oldFetch
    for(const [key,val] of Object.entries(previous)){
      if(val===undefined)delete process.env[key]
      else process.env[key]=val
    }
  }}
}

test("Inbox APIs reject anonymous and demonstration mutations without hitting Supabase",async()=>{
  const {NextRequest}=await import("next/server.js"); URLRequest=NextRequest
  const {GET}=await vite.ssrLoadModule("/app/api/connect/conversations/route.ts")
  const {POST}=await vite.ssrLoadModule("/app/api/connect/conversations/[conversationId]/assignment/route.ts")
  const o=mockSupabase(()=>{throw new Error("Unexpected network call")})
  try {
    const list=await GET(request("https://crm.example.invalid/crm/api/connect/conversations",{logged:false}))
    assert.equal(list.status,401)
    const demo=await POST(request(
      `https://crm.example.invalid/crm/api/connect/conversations/${conversation}/assignment`,
      {method:"POST",demo:true,logged:false,body:{action:"take",expected_version:1}},
    ),{params:Promise.resolve({conversationId:conversation})})
    assert.equal(demo.status,403)
    assert.equal(o.calls.length,0)
  }finally{o.restore()}
})

test("Inbox list is role-scoped, includes selected workspace filter and excludes viewer",async()=>{
  const {NextRequest}=await import("next/server.js"); URLRequest=NextRequest
  const {GET}=await vite.ssrLoadModule("/app/api/connect/conversations/route.ts")
  let role="viewer"
  const o=mockSupabase((href)=>{
    if(href.includes("connect_conversations?")) return Response.json([],{headers:{"content-range":"*/0"}})
    throw new Error(`unexpected fetch: ${href}`)
  })
  const realFetch=globalThis.fetch
  globalThis.fetch=(url,init)=>{
    if(String(url).includes("workspace_members?"))
      return Promise.resolve(Response.json([{role,status:"active"}]))
    return realFetch(url,init)
  }
  try {
    const url="https://crm.example.invalid/crm/api/connect/conversations?status=all"
    assert.equal((await GET(request(url))).status,403)
    role="sales"
    const result=await GET(request(url))
    assert.equal(result.status,200)
    assert.equal((await result.json()).total,0)
    const listCall=o.calls.find(c=>c.href.includes("connect_conversations?"))
    assert.ok(listCall)
    assert.ok(listCall.href.includes(`workspace_id=eq.%`) || listCall.href.includes(`workspace_id=eq.${workspace}`))
    assert.equal(o.calls.some(c=>c.href.includes(`workspace_id=eq.${otherWorkspace}`)),false)
  }finally{o.restore()}
})

test("Assigned conversation cannot be taken by another sales agent",async()=>{
  const {NextRequest}=await import("next/server.js"); URLRequest=NextRequest
  const {POST}=await vite.ssrLoadModule("/app/api/connect/conversations/[conversationId]/assignment/route.ts")
  const o=mockSupabase((href)=>{
    if(href.includes("connect_conversations?"))
      return Response.json([{id:conversation,assigned_to:colleague,row_version:3}])
    throw new Error(`unexpected fetch: ${href}`)
  })
  try {
    const res=await POST(request(
      `https://crm.example.invalid/crm/api/connect/conversations/${conversation}/assignment`,
      {method:"POST",body:{action:"take",expected_version:3}},
    ),{params:Promise.resolve({conversationId:conversation})})
    assert.equal(res.status,409)
    assert.equal((await res.json()).code,"already_assigned")
    assert.equal(o.calls.some(c=>c.init?.method==="PATCH"),false)
  }finally{o.restore()}
})

test("Manual contact linking rejects a foreign workspace contact and never patches",async()=>{
  const {NextRequest}=await import("next/server.js"); URLRequest=NextRequest
  const {POST}=await vite.ssrLoadModule("/app/api/connect/conversations/[conversationId]/contact/route.ts")
  const o=mockSupabase((href)=>{
    if(href.includes("connect_conversations?"))
      return Response.json([{id:conversation,assigned_to:null,contact_id:null,row_version:2}])
    if(href.includes("/rest/v1/contacts?"))return Response.json([])
    throw new Error(`unexpected fetch: ${href}`)
  })
  try {
    const res=await POST(request(
      `https://crm.example.invalid/crm/api/connect/conversations/${conversation}/contact`,
      {method:"POST",body:{contact_id:otherContact,expected_version:2}},
    ),{params:Promise.resolve({conversationId:conversation})})
    assert.equal(res.status,404)
    assert.equal((await res.json()).code,"contact_not_found")
    assert.equal(o.calls.some(c=>c.init?.method==="PATCH"),false)
  }finally{o.restore()}
})

test("Cross-origin conversation mutations rejected before authentication or DB calls",async()=>{
  const {NextRequest}=await import("next/server.js"); URLRequest=NextRequest
  const {POST}=await vite.ssrLoadModule("/app/api/connect/conversations/[conversationId]/status/route.ts")
  const o=mockSupabase(()=>{throw new Error("Network call not expected")})
  try {
    const req=request(
      `https://crm.example.invalid/crm/api/connect/conversations/${conversation}/status`,
      {method:"POST",body:{action:"close",expected_version:1},origin:false},
    )
    const res=await POST(req,{params:Promise.resolve({conversationId:conversation})})
    assert.equal(res.status,403)
    assert.equal(o.calls.length,0)
  }finally{o.restore()}
})
