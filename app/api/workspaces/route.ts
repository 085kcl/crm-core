import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  demoWorkspaces,
} from "@/lib/crm-session"
import { supabaseRequest } from "@/lib/supabase-server"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"

const workspaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
})

export async function GET(request: NextRequest) {
  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return NextResponse.json({ mode: "demo", workspaces: demoWorkspaces })
  }

  const accessToken = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!accessToken) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })

  const dataResponse = await supabaseRequest(
    "/rest/v1/workspaces?select=id,name,slug,status&order=name.asc",
    { headers: { Accept: "application/json" } },
    accessToken,
  )

  if (dataResponse.status === 401) {
    return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
  }
  if (!dataResponse.ok) {
    return NextResponse.json({ message: "Não foi possível carregar os workspaces." }, { status: 502 })
  }

  const rows = (await dataResponse.json()) as Array<{
    id: string
    name: string
    slug: string
    status: string
  }>
  return NextResponse.json({
    mode: "live",
    workspaces: rows.map((row) => ({ ...row, role: "member" })),
  })
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return rejectedMutation()
  const parsed = workspaceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Revise o nome e o identificador do workspace." }, { status: 400 })
  }

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return NextResponse.json({
      workspace: {
        id: crypto.randomUUID(),
        ...parsed.data,
        role: "owner",
        status: "active",
        members: 1,
        transient: true,
      },
    })
  }

  const accessToken = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!accessToken) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })

  const rpcResponse = await supabaseRequest(
    "/functions/v1/crm-workspace-command",
    {
      method: "POST",
      body: JSON.stringify({
        command: "create_workspace",
        name: parsed.data.name,
        slug: parsed.data.slug,
      }),
    },
    accessToken,
  )

  if (!rpcResponse.ok) {
    return NextResponse.json(
      {
        message:
          rpcResponse.status === 409
            ? "Esse identificador já está em uso."
            : rpcResponse.status === 401
              ? "Sessão expirada."
              : "Não foi possível criar o workspace.",
      },
      {
        status:
          rpcResponse.status === 409
            ? 409
            : rpcResponse.status === 401
              ? 401
              : 502,
      },
    )
  }

  const workspaceId = (await rpcResponse.json()) as string
  return NextResponse.json({
    workspace: { id: workspaceId, ...parsed.data, role: "owner", status: "active" },
  })
}
