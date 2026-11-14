"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { fieldOptions, fieldTypes, validFieldValue } from "@/lib/custom-fields"
import { fetchWithSessionRetry } from "@/lib/client-fetch"
import type { ContactCustomField, ContactTag } from "@/lib/crm-v003-types"

export function ContactDataEditor({ contactId, tags, fields, demo, onSaved }: {
  contactId: string; tags: ContactTag[]; fields: ContactCustomField[]; demo: boolean; onSaved: () => void
}) {
  const [catalog, setCatalog] = useState<ContactTag[]>([])
  const [selectedTag, setSelectedTag] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [catalogReload, setCatalogReload] = useState(0)
  const lifetime = useRef<AbortController | null>(null)
  const endpoint = `/api/contacts/${encodeURIComponent(contactId)}/metadata`

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [contactId])

  useEffect(() => {
    if (demo) return
    const controller = new AbortController()
    void fetchWithSessionRetry(endpoint, { signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { tags: ContactTag[]; message?: string }
      if (!response.ok) throw new Error(body.message ?? "Não foi possível carregar as tags.")
      if (!controller.signal.aborted) setCatalog(body.tags)
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [endpoint, demo, catalogReload])

  async function mutate(data: unknown, refreshContact = true) {
    if (busy) return false
    setBusy(true); setError(""); setSuccess("")
    const signal = lifetime.current?.signal
    try {
      const response = await fetchWithSessionRetry(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal })
      const body = await response.json() as { message?: string }
      if (!response.ok) throw new Error(body.message ?? "Não foi possível salvar.")
      if (signal?.aborted) return false
      setSuccess("Alteração salva.")
      toast.success("Alteração salva.")
      if (refreshContact) onSaved()
      else setCatalogReload((value) => value + 1)
      return true
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível salvar.")
      return false
    } finally { if (!signal?.aborted) setBusy(false) }
  }

  function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    void mutate({ action: "create_tag", name: data.get("name"), slug: data.get("slug") }, false).then((saved) => { if (saved) form.reset() })
  }

  return <div className="space-y-6 text-sm">
    {demo && <p className="text-muted-foreground">Demonstração somente leitura. Entre no workspace conectado para editar.</p>}
    {error && <div role="alert" className="text-destructive">{error} <Button variant="link" onClick={() => { setError(""); setCatalogReload((value) => value + 1) }}>Recarregar tags</Button></div>}
    <p role="status" aria-live="polite">{success}</p>
    <fieldset disabled={busy || demo} className="space-y-4">
      <legend className="mb-3 font-semibold">Tags</legend>
      {tags.length ? <ul className="flex flex-wrap gap-2">{tags.map((tag) => <li key={tag.id} className="flex items-center gap-2 rounded-lg border px-3 py-1">{tag.name}<Button variant="ghost" size="sm" aria-label={`Remover tag ${tag.name}`} onClick={() => void mutate({ action: "remove_tag", tag_id: tag.id })}>Remover</Button></li>)}</ul> : <p className="text-muted-foreground">Nenhuma tag associada.</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-2"><Label htmlFor="contact-tag">Tag do workspace</Label><Select value={selectedTag} onValueChange={setSelectedTag} disabled={busy || demo}><SelectTrigger id="contact-tag"><SelectValue placeholder="Selecione uma tag" /></SelectTrigger><SelectContent>{catalog.filter((tag) => !tags.some((current) => current.id === tag.id)).map((tag) => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>)}</SelectContent></Select></div>
        <Button disabled={busy || demo || !selectedTag} onClick={() => void mutate({ action: "attach_tag", tag_id: selectedTag })}>Associar tag</Button>
      </div>
      <details><summary className="cursor-pointer font-medium">Criar tag no catálogo</summary><form className="mt-3 grid gap-3" onSubmit={createTag}>
        <Label htmlFor="tag-name">Nome</Label><Input id="tag-name" name="name" required maxLength={80} />
        <Label htmlFor="tag-slug">Identificador (letras minúsculas, números e hífens)</Label><Input id="tag-slug" name="slug" required maxLength={80} pattern="[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?" />
        <Button type="submit">Criar tag</Button><p className="text-muted-foreground">Configuração disponível para owner, admin e manager.</p>
      </form></details>
    </fieldset>
    <fieldset disabled={busy || demo} className="space-y-5">
      <legend className="mb-3 font-semibold">Campos personalizados</legend>
      {[...fields].sort((a, b) => a.position - b.position).map((field) => <FieldEditor key={`${field.definition_id}:${JSON.stringify(field.value)}`} field={field} disabled={busy || demo} save={mutate} />)}
      {!fields.length && <p className="text-muted-foreground">Nenhum campo configurado.</p>}
      <NewField disabled={busy || demo} create={mutate} />
    </fieldset>
  </div>
}

function FieldEditor({ field, disabled, save }: { field: ContactCustomField; disabled: boolean; save: (data: unknown) => Promise<boolean> }) {
  const [value, setValue] = useState<unknown>(field.value ?? "")
  const [error, setError] = useState("")
  const id = `field-${field.definition_id}`
  const options = fieldOptions(field)
  const numeric = ["integer", "decimal", "currency"].includes(field.field_type)
  let stringValue = typeof value === "string" || typeof value === "number" ? String(value) : ""
  if (field.field_type === "datetime" && /(?:Z|[+-]\d{2}:\d{2})$/.test(stringValue)) {
    const date = new Date(stringValue)
    if (!Number.isNaN(date.getTime())) stringValue = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    let parsed = numeric && stringValue.trim() ? Number(stringValue) : value
    if (field.field_type === "datetime" && !Number.isNaN(Date.parse(stringValue))) parsed = new Date(stringValue).toISOString()
    if (!validFieldValue(field, parsed)) { setError("Informe um valor válido para este campo."); return }
    setError("")
    void save({ action: "save_field", definition_id: field.definition_id, value: parsed })
  }
  return <form onSubmit={submit} className="space-y-2 border-t pt-4">
    <Label htmlFor={id}>{field.label}{field.is_required ? " *" : ""}</Label>
    {field.field_type === "boolean" ? <Select value={typeof value === "boolean" ? String(value) : ""} onValueChange={(next) => setValue(next === "true")} disabled={disabled}><SelectTrigger id={id}><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value="true">Sim</SelectItem><SelectItem value="false">Não</SelectItem></SelectContent></Select>
      : field.field_type === "select" && options.length ? <Select value={stringValue} onValueChange={setValue} disabled={disabled}><SelectTrigger id={id}><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>
      : field.field_type === "multiselect" ? options.length ? <div id={id} role="group" aria-label={field.label} className="flex flex-wrap gap-3">{options.map((option, index) => <Label key={option} htmlFor={`${id}-${index}`}><Checkbox id={`${id}-${index}`} disabled={disabled} checked={Array.isArray(value) && value.includes(option)} onCheckedChange={(checked) => setValue(checked === true ? [...(Array.isArray(value) ? value : []), option] : (Array.isArray(value) ? value : []).filter((item) => item !== option))} />{option}</Label>)}</div> : <Textarea id={id} value={Array.isArray(value) ? value.join("\n") : ""} placeholder="Uma opção por linha" onChange={(event) => setValue(event.target.value.split("\n").filter(Boolean))} />
      : field.field_type === "textarea" ? <Textarea id={id} value={stringValue} required={field.is_required} onChange={(event) => setValue(event.target.value)} />
      : <Input id={id} type={numeric ? "number" : field.field_type === "datetime" ? "datetime-local" : ["email", "url", "date"].includes(field.field_type) ? field.field_type : "text"} step={field.field_type === "integer" ? "1" : "any"} value={stringValue} required={field.is_required} onChange={(event) => setValue(event.target.value)} />}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="flex gap-2"><Button type="submit" size="sm" disabled={disabled}>Salvar {field.label}</Button>{!field.is_required && field.value_id && <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void save({ action: "clear_field", definition_id: field.definition_id })}>Limpar</Button>}</div>
  </form>
}

function NewField({ disabled, create }: { disabled: boolean; create: (data: unknown) => Promise<boolean> }) {
  const [type, setType] = useState<string>("text")
  const [required, setRequired] = useState(false)
  return <details><summary className="cursor-pointer font-medium">Configurar novo campo</summary><form className="mt-3 grid gap-3" onSubmit={(event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void create({ action: "create_field", label: data.get("label"), key: data.get("key"), field_type: type, is_required: required, position: Number(data.get("position")), options: ["select", "multiselect"].includes(type) ? [...new Set(String(data.get("options") ?? "").split("\n").map((item) => item.trim()).filter(Boolean))] : [] })
  }}>
    <Label htmlFor="new-field-label">Nome do campo</Label><Input id="new-field-label" name="label" required maxLength={120} />
    <Label htmlFor="new-field-key">Chave estável (letras minúsculas, números e _)</Label><Input id="new-field-key" name="key" required pattern="[a-z][a-z0-9_]{0,62}" />
    <Label htmlFor="new-field-type">Tipo</Label><Select value={type} onValueChange={setType} disabled={disabled}><SelectTrigger id="new-field-type"><SelectValue /></SelectTrigger><SelectContent>{fieldTypes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
    {["select", "multiselect"].includes(type) && <><Label htmlFor="new-field-options">Opções, uma por linha</Label><Textarea id="new-field-options" name="options" /></>}
    <Label htmlFor="new-field-position">Ordem</Label><Input id="new-field-position" name="position" type="number" min={0} max={10000} step={1} defaultValue={0} required />
    <Label htmlFor="new-field-required"><Checkbox id="new-field-required" checked={required} disabled={disabled} onCheckedChange={(checked) => setRequired(checked === true)} />Obrigatório</Label>
    <p className="text-muted-foreground">O campo será disponibilizado para todos os contatos deste workspace. Configuração restrita a owner, admin e manager.</p>
    <Button type="submit" disabled={disabled}>Criar campo</Button>
  </form></details>
}
