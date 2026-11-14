export const CRM_BASE_PATH = "/crm"

export function withCrmBasePath(path: string) {
  if (!path.startsWith("/")) return path
  if (path === CRM_BASE_PATH || path.startsWith(`${CRM_BASE_PATH}/`)) return path
  if (path === "/") return CRM_BASE_PATH
  return `${CRM_BASE_PATH}${path}`
}
