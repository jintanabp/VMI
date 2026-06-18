import {
  type AccountInfo,
  type AuthenticationResult,
  BrowserAuthError,
  PublicClientApplication,
} from "@azure/msal-browser";
import { loginRequest, msalConfig } from "./msal-config";

let msalInstance: PublicClientApplication | null = null;
let initPromise: Promise<PublicClientApplication> | null = null;

const MSAL_HANDLE_KEY = "vmi_msal_redirect_handling";

function getClientId() {
  const id = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID ?? "";
  if (!id) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า NEXT_PUBLIC_AZURE_AD_CLIENT_ID ในไฟล์ .env"
    );
  }
  return id;
}

function createMsalConfig() {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000";

  return {
    ...msalConfig,
    auth: {
      ...msalConfig.auth,
      clientId: getClientId(),
      redirectUri: `${origin}/auth/callback`,
      postLogoutRedirectUri: `${origin}/`,
    },
  };
}

export function hasAuthResponseInUrl(): boolean {
  if (typeof window === "undefined") return false;
  const search = window.location.search;
  const hash = window.location.hash;
  return (
    search.includes("code=") ||
    search.includes("error=") ||
    hash.includes("code=") ||
    hash.includes("error=")
  );
}

export function clearStuckMsalState() {
  if (typeof window === "undefined") return;
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith("msal.") && key.includes("interaction")) {
      sessionStorage.removeItem(key);
    }
  }
  sessionStorage.removeItem(MSAL_HANDLE_KEY);
}

export async function initMsal() {
  if (!initPromise) {
    initPromise = (async () => {
      if (!msalInstance) {
        msalInstance = new PublicClientApplication(createMsalConfig());
      }
      await msalInstance.initialize();
      return msalInstance;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/** เรียกเฉพาะหน้า /auth/callback */
export async function handleAuthRedirect(): Promise<{
  instance: PublicClientApplication;
  redirectResult: AuthenticationResult | null;
  account: AccountInfo | null;
}> {
  const instance = await initMsal();
  let redirectResult: AuthenticationResult | null = null;

  if (hasAuthResponseInUrl() && !sessionStorage.getItem(MSAL_HANDLE_KEY)) {
    sessionStorage.setItem(MSAL_HANDLE_KEY, "1");
    try {
      redirectResult = await instance.handleRedirectPromise();
    } finally {
      sessionStorage.removeItem(MSAL_HANDLE_KEY);
    }
  }

  const account =
    redirectResult?.account ??
    instance.getActiveAccount() ??
    instance.getAllAccounts()[0] ??
    null;

  if (account) {
    instance.setActiveAccount(account);
  }

  if (redirectResult && typeof window !== "undefined") {
    window.history.replaceState({}, document.title, "/auth/callback");
  }

  return { instance, redirectResult, account };
}

export function getAzureErrorFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);

  const error =
    params.get("error_description") ??
    params.get("error") ??
    hashParams.get("error_description") ??
    hashParams.get("error");

  return error;
}

export function getAccountEmail(account: AccountInfo): string | null {
  return (
    account.username ??
    (account.idTokenClaims?.preferred_username as string | undefined) ??
    (account.idTokenClaims?.email as string | undefined) ??
    null
  );
}

export async function createServerSession(email: string, name?: string) {
  const res = await fetch("/api/auth/msal/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, name }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "สร้าง session ไม่สำเร็จ"
    );
  }

  const redirectTo =
    typeof data.redirectTo === "string"
      ? data.redirectTo
      : data.user?.role === "admin"
        ? "/admin/dev"
        : "/sales/orders";

  window.location.href = redirectTo;
  return data as {
    ok: boolean;
    user: { role: "sales" | "admin"; email: string };
    redirectTo: string;
  };
}

export async function loginWithMicrosoftRedirect() {
  clearStuckMsalState();
  const instance = await initMsal();
  await instance.loginRedirect({
    ...loginRequest,
    redirectUri: `${window.location.origin}/auth/callback`,
  });
}

export function formatMsalError(error: unknown): string {
  if (error instanceof BrowserAuthError) {
    if (error.errorCode === "user_cancelled") {
      return "ยกเลิกการเข้าสู่ระบบ";
    }
    if (error.errorCode === "interaction_in_progress") {
      return "กำลัง login อยู่ — รอสักครู่แล้วลองใหม่";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "เข้าสู่ระบบไม่สำเร็จ";
}

export { loginRequest };
