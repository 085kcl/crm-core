"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, CircleUserRound, Inbox, Loader2, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { withCrmBasePath } from "@/lib/crm-base-path"

type Conversation = {
  id:string
  provider:"instagram"|"messenger"|"whatsapp"
  external_participant_id:string
  participant_display_name:string|null
  contact_id:string|null
  lead_id:string|null
  assigned_to:string|null
  status:"open"|"pending"|"closed"
  row_version:number
  last_message_at:string|null
  last_message_preview:string|null
}
type Message = {id:string;direction:"inbound";message_type:"text"|"media";body:string;occurred_at:string}
type InboxResponse = {mode:string;items:Conversation[];total:number;page:number;me?:string;role?:string}
type MessagesResponse = {messages:Message[]}
type ContactOption={id:string;first_name:string;last_name:string|null;email:string|null}
type Filter = "all"|"open"|"pending"|"closed"
const labels: Record<Conversation["provider"],string> = {
  instagram:"Instagram",messenger:"Messenger",whatsapp:"WhatsApp",
}
const statusLabels:Record<Conversation["status"],string> = {open:"Aberta",pending:"Aguardando",closed:"Encerrada"}
const dateTime = (value:string|null) => value ? new Intl.DateTimeFormat("pt-BR",{
  dateStyle:"short",timeStyle:"short",timeZone:"America/Sao_Paulo",
}).format(new Date(value)) : "Sem mensagens"
const displayName=(item:Conversation)=>item.participant_display_name?.trim()||
  `Contato ···${item.external_participant_id.slice(-5)}`

async function getJson<T>(path:string):Promise<T> {
  const response=await fetch(withCrmBasePath(path),{cache:"no-store"})
  const body=await response.json().catch(()=>null)
  if (!response.ok) throw new Error(body?.message||"Não foi possível carregar os dados.")
  return body as T
}

export function ConnectInbox() {
  const [filter,setFilter]=useState<Filter>("all")
  const [items,setItems]=useState<Conversation[]>([])
  const [messages,setMessages]=useState<Message[]>([])
  const [messageThreadId,setMessageThreadId]=useState<string|null>(null)
  const requestCounter=useRef(0)
  const [active,setActive]=useState<string|null>(null)
  const [mode,setMode]=useState("live")
  const [me,setMe]=useState<string|null>(null)
  const [role,setRole]=useState<string|null>(null)
  const [loading,setLoading]=useState(true)
  const [loadingMessages,setLoadingMessages]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [messageError,setMessageError]=useState<string|null>(null)
  const [showContactPicker,setShowContactPicker]=useState(false)
  const [contacts,setContacts]=useState<ContactOption[]>([])
  const [selectedContact,setSelectedContact]=useState("")
  const [loadingContacts,setLoadingContacts]=useState(false)

  const loadList=useCallback(async()=>{
    setLoading(true)
    setError(null)
    try {
      const data=await getJson<InboxResponse>(`/api/connect/conversations?status=${filter}&limit=50`)
      setMode(data.mode)
      setMe(data.me||null)
      setRole(data.role||null)
      setItems(data.items)
      setActive(previous=>data.items.some(item=>item.id===previous)?previous:(data.items[0]?.id||null))
    } catch(e) {setError(e instanceof Error?e.message:"Falha ao carregar conversas.");setItems([]);setActive(null)}
    finally {setLoading(false)}
  },[filter])

  const loadThread=useCallback(async(id:string)=>{
    const requestId=++requestCounter.current
    setLoadingMessages(true)
    setMessageError(null)
    setMessages([])
    setMessageThreadId(null)
    try {
      const data=await getJson<MessagesResponse>(`/api/connect/conversations/${id}/messages`)
      if(requestId===requestCounter.current){
        setMessages(data.messages)
        setMessageThreadId(id)
      }
    } catch(e) {
      if(requestId===requestCounter.current)
        setMessageError(e instanceof Error?e.message:"Falha ao abrir a conversa.")
    } finally {
      if(requestId===requestCounter.current)setLoadingMessages(false)
    }
  },[])

  useEffect(()=>{
    const timer=window.setTimeout(()=>{void loadList()},0)
    return ()=>window.clearTimeout(timer)
  },[loadList])
  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      if(active)void loadThread(active)
      else {requestCounter.current++;setMessages([]);setMessageThreadId(null)}
    },0)
    return ()=>window.clearTimeout(timer)
  },[active,loadThread])
  const selected=items.find(item=>item.id===active)||null

  async function refresh() {
    await loadList()
    if(active) await loadThread(active)
  }

  async function assign(action:"take"|"release") {
    if(!selected||busy)return
    setBusy(true)
    setMessageError(null)
    try{
      const response=await fetch(withCrmBasePath(`/api/connect/conversations/${selected.id}/assignment`),{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,expected_version:selected.row_version}),
      })
      const result=await response.json().catch(()=>null)
      if(!response.ok)throw new Error(result?.message||"Falha na atribuição.")
      setItems(current=>current.map(item=>item.id===selected.id?
        {...item,assigned_to:result.assigned_to,row_version:result.row_version}:item))
    }catch(e){setMessageError(e instanceof Error?e.message:"Falha na atribuição.")}
    finally{setBusy(false)}
  }



  async function openContactPicker() {
    if(!selected||busy)return
    setShowContactPicker(true)
    setSelectedContact(selected.contact_id||"")
    setLoadingContacts(true)
    setMessageError(null)
    try {
      const response=await getJson<{contacts:ContactOption[]}>(`/api/connect/contact-options`)
      setContacts(response.contacts||[])
    }catch(e){setMessageError(e instanceof Error?e.message:"Falha ao carregar contatos.")}
    finally{setLoadingContacts(false)}
  }

  async function linkContact(contactId:string|null) {
    if(!selected||busy)return
    setBusy(true)
    setMessageError(null)
    try{
      const response=await fetch(withCrmBasePath(`/api/connect/conversations/${selected.id}/contact`),{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({contact_id:contactId,expected_version:selected.row_version}),
      })
      const body=await response.json().catch(()=>null)
      if(!response.ok)throw new Error(body?.message||"Não foi possível vincular o contato.")
      setShowContactPicker(false)
      await loadList()
    }catch(e){setMessageError(e instanceof Error?e.message:"Falha ao vincular contato.")}
    finally{setBusy(false)}
  }

  async function changeStatus(action:"close"|"reopen") {
    if(!selected||busy)return
    setBusy(true)
    setMessageError(null)
    try {
      const response=await fetch(withCrmBasePath(`/api/connect/conversations/${selected.id}/status`),{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,expected_version:selected.row_version}),
      })
      const result=await response.json().catch(()=>null)
      if(!response.ok)throw new Error(result?.message||"Falha na atualização.")
      await loadList()
    }catch(e){setMessageError(e instanceof Error?e.message:"Falha na atualização.")}
    finally{setBusy(false)}
  }

  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[#172033] sm:text-3xl">CLASSY Connect</h1>
            <Badge variant="outline" className="border-[#b69a62] text-[#8d713f]">v0.2 · Recebimento</Badge>
          </div>
          <p className="mt-2 text-sm text-[#657185]">Central de conversas recebidas e distribuição de atendimentos.</p>
        </div>
        <Button onClick={()=>void refresh()} variant="outline" disabled={loading} className="gap-2">
          <RefreshCw className={`size-4 ${loading?"animate-spin":""}`}/> Atualizar
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#d9dfe8] bg-white px-4 py-3 text-xs text-[#596578]">
        <ShieldCheck className="size-4 shrink-0 text-[#9f854e]"/>
        Mensagens somente recebidas. O envio automático, a IA e as campanhas permanecem desativados nesta versão.
      </div>

      <section className="grid min-h-[580px] gap-4 lg:grid-cols-[340px_minmax(0,1fr)]" aria-label="Caixa de entrada CLASSY Connect">
        <Card className="overflow-hidden rounded-2xl border-[#dfe4ed] bg-white p-0 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#e5e9f0] px-4 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Inbox className="size-4 text-[#9f854e]"/> Conversas</h2>
            <span className="text-xs text-[#6b778a]">{items.length} exibidas</span>
          </div>
          <div className="border-b border-[#e5e9f0] px-4 py-3">
            <label className="block text-xs font-medium text-[#58667b]" htmlFor="connect-filter">Situação</label>
            <select id="connect-filter" value={filter} onChange={e=>setFilter(e.target.value as Filter)}
              className="mt-1 h-9 w-full rounded-lg border border-[#dce2eb] bg-white px-3 text-sm text-[#172033]">
              <option value="all">Todas</option><option value="open">Abertas</option>
              <option value="pending">Aguardando</option><option value="closed">Encerradas</option>
            </select>
          </div>
          <CardContent className="max-h-[650px] overflow-y-auto px-0 py-0">
            {loading ? <p className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-[#657185]"><Loader2 className="size-4 animate-spin"/> Carregando...</p>
              : error ? <p role="alert" className="px-4 py-8 text-sm text-red-700">{error}</p>
              : items.length===0 ? <div className="px-5 py-16 text-center"><MessageCircle className="mx-auto mb-3 size-7 text-[#b3bcc9]"/><p className="text-sm font-medium">Nenhuma conversa registrada</p><p className="mt-1 text-xs text-[#7c8797]">{mode==="demo"?"Demonstração sem dados de clientes.":"Os atendimentos aparecerão após a integração autorizada dos canais."}</p></div>
              : items.map(item=>(
                <button key={item.id} type="button" onClick={()=>{setShowContactPicker(false);setActive(item.id)}} aria-pressed={item.id===active}
                  className={`w-full border-b border-[#eef0f4] px-4 py-4 text-left transition-colors hover:bg-[#f7f8fa] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#b69a62] ${item.id===active?"bg-[#f7f4ed]":""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-[#192334]">{displayName(item)}</p>
                    <span className="shrink-0 text-[10px] text-[#8b96a6]">{item.last_message_at?dateTime(item.last_message_at):"—"}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[#84703e]">
                    <span>{labels[item.provider]}</span><span className="text-[#c4cbd5]">·</span>
                    <span className="text-[#718094]">{statusLabels[item.status]}</span>
                  </div>
                  <p className="mt-2 truncate text-xs text-[#7b8695]">{item.last_message_preview||"Aguardando mensagem"}</p>
                </button>
              ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-2xl border-[#dfe4ed] bg-white p-0 shadow-sm">
          {!selected ? <div className="flex min-h-[560px] flex-col items-center justify-center gap-3 px-6 text-center">
            <CircleUserRound className="size-12 text-[#c9ced8]"/>
            <h2 className="text-base font-semibold text-[#1c2635]">Selecione uma conversa</h2>
            <p className="max-w-sm text-sm text-[#7a8799]">O histórico de mensagens recebidas será exibido aqui, preservando o contexto do atendimento.</p>
          </div> : <>
            <header className="flex flex-col justify-between gap-3 border-b border-[#e5e9f0] px-5 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-[#1a2637]">{displayName(selected)}</h2>
                <p className="mt-1 text-xs text-[#748094]">{labels[selected.provider]} · {statusLabels[selected.status]} · {selected.assigned_to?(selected.assigned_to===me?"Atribuída a você":"Atribuída a outro atendente"):"Sem responsável"}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button variant="outline" size="sm"
                  disabled={busy||mode==="demo"||(Boolean(selected.assigned_to)&&selected.assigned_to!==me&&!["owner","admin","manager"].includes(role||""))}
                  onClick={()=>void changeStatus(selected.status==="closed"?"reopen":"close")}>
                  {selected.status==="closed"?"Reabrir":"Encerrar"}
                </Button>
                {selected.contact_id && <Button asChild variant="outline" size="sm"><Link href={`/app/contatos/${selected.contact_id}`}>Contato 360 <ArrowUpRight className="size-3"/></Link></Button>}
                <Button variant="outline" size="sm" disabled={busy||mode==="demo"||(Boolean(selected.assigned_to)&&selected.assigned_to!==me&&!["owner","admin","manager"].includes(role||""))}
                  onClick={()=>void openContactPicker()}>{selected.contact_id?"Alterar vínculo":"Vincular contato"}</Button>
                {selected.assigned_to ? <Button variant="outline" size="sm" disabled={busy||mode==="demo"||(!["owner","admin","manager"].includes(role||"")&&selected.assigned_to!==me)}
                  onClick={()=>void assign("release")}>Liberar</Button>
                  : <Button size="sm" disabled={busy||mode==="demo"} onClick={()=>void assign("take")}>Assumir</Button>}
              </div>
            </header>
            {showContactPicker&&(
              <div className="flex flex-col gap-2 border-b border-[#e5e9f0] bg-[#fcfcfd] px-5 py-4">
                <label htmlFor="connect-contact-select" className="text-xs font-semibold text-[#566277]">Associar a um contato do CRM</label>
                <p className="text-xs text-[#7a8493]">O vínculo será criado apenas após sua confirmação.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select id="connect-contact-select" value={selectedContact}
                    onChange={e=>setSelectedContact(e.target.value)}
                    className="min-w-48 flex-1 rounded-lg border border-[#dce2eb] bg-white px-3 py-2 text-sm"
                    disabled={loadingContacts||busy}>
                    <option value="">{loadingContacts?"Carregando contatos...":"Selecione um contato"}</option>
                    {contacts.map(contact=><option key={contact.id} value={contact.id}>
                      {[contact.first_name,contact.last_name].filter(Boolean).join(" ")}{contact.email?` · ${contact.email}`:""}
                    </option>)}
                  </select>
                  <Button size="sm" disabled={busy||loadingContacts||!selectedContact} onClick={()=>void linkContact(selectedContact)}>Confirmar</Button>
                  {selected.contact_id&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void linkContact(null)}>Desvincular</Button>}
                  <Button variant="ghost" size="sm" onClick={()=>setShowContactPicker(false)}>Cancelar</Button>
                </div>
              </div>
            )}
            <div className="flex min-h-[450px] max-h-[610px] flex-col gap-4 overflow-y-auto bg-[#fafbfc] px-5 py-5" aria-live="polite">
              {loadingMessages ? <p className="text-sm text-[#718094]">Carregando histórico...</p>
                : messageThreadId!==active ? <p className="py-12 text-center text-sm text-[#718094]">Carregando conversa selecionada...</p>
                : messages.length===0 ? <p className="py-12 text-center text-sm text-[#718094]">Nenhuma mensagem recebida nesta conversa.</p>
                : messages.map(message=>(
                  <article key={message.id} className="max-w-[90%] self-start rounded-2xl rounded-tl-sm border border-[#e0e4eb] bg-white px-4 py-3 shadow-sm">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#243247]">{message.body}</p>
                    <time dateTime={message.occurred_at} className="mt-2 block text-[10px] text-[#8a96a5]">{dateTime(message.occurred_at)}</time>
                  </article>
                ))}
            </div>
            {messageError && <p role="alert" className="border-t px-5 py-3 text-xs text-red-700">{messageError}</p>}
            <footer className="border-t border-[#e5e9f0] bg-white px-5 py-4 text-xs text-[#768396]">
              Respostas e automações serão habilitadas após homologação das APIs e das regras de consentimento da Meta.
            </footer>
          </>}
        </Card>
      </section>
    </main>
  )
}
