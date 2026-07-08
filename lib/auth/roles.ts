export type UserRole = "customer" | "sales" | "supervisor" | "manager" | "admin";

export const CUSTOMER_STORE_COOKIE = "vmi_store_id";
export const CUSTOMER_STORE_CODE_COOKIE = "vmi_store_code";
export const SALES_SESSION_COOKIE = "vmi_sales_session";
export const STORE_SESSION_COOKIE = "vmi_store_session";

export { isAdminEmail, parseAdminEmailsFromEnv } from "./admin-registry";

import { isAdminEmail } from "./admin-registry";

export function resolveRoleFromEmail(email: string | null | undefined): UserRole {
  if (isAdminEmail(email)) return "admin";
  if (email) return "sales";
  return "customer";
}
