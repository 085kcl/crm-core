import type { NextResponse } from "next/server"

export const CRM_ACCESS_COOKIE = "crm_access_token"
export const CRM_REFRESH_COOKIE = "crm_refresh_token"
export const CRM_DEMO_COOKIE = "crm_demo_session"
export const CRM_WORKSPACE_COOKIE = "crm_workspace_id"
export const CRM_WORKSPACE_NAME_COOKIE = "crm_workspace_name"

export const secureCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/crm",
}

export function clearCrmCookies(response: NextResponse) {
  for (const name of [
    CRM_ACCESS_COOKIE,
    CRM_REFRESH_COOKIE,
    CRM_DEMO_COOKIE,
    CRM_WORKSPACE_COOKIE,
    CRM_WORKSPACE_NAME_COOKIE,
  ]) {
    response.cookies.set(name, "", { ...secureCookie, maxAge: 0 })
  }
}

export const demoWorkspaces = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Perícias Fernandes",
    slug: "pericias-fernandes",
    role: "owner",
    status: "active",
    members: 4,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "CLASSY Inteligência Estratégica",
    slug: "classy-inteligencia",
    role: "admin",
    status: "active",
    members: 7,
  },
]
