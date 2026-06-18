const SCOPES = "openid profile email User.Read";
const PKCE_KEY = "vmi_ms_oauth_pkce";
const STATE_KEY = "vmi_ms_oauth_state";

function getClientId() {
  const id = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID ?? "";
  if (!id) throw new Error("ยังไม่ได้ตั้ง NEXT_PUBLIC_AZURE_AD_CLIENT_ID");
  return id;
}

function getTenantId() {
  const id = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID ?? "";
  if (!id) throw new Error("ยังไม่ได้ตั้ง NEXT_PUBLIC_AZURE_AD_TENANT_ID");
  return id;
}

/** Redirect URI ที่ต้องลงทะเบียนใน Azure SPA — ตรงกับ path นี้ทุกตัวอักษร */
export function getMicrosoftCallbackPath() {
  return "/auth/callback";
}

export function getMicrosoftRedirectUri() {
  const configured = process.env.NEXT_PUBLIC_AZURE_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${window.location.origin}${getMicrosoftCallbackPath()}`;
}

function toBase64Url(bytes: Uint8Array) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createCodeVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function createCodeChallenge(verifier: string) {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(hash));
}

export function createOAuthState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function saveOAuthSession(verifier: string, state: string) {
  sessionStorage.setItem(PKCE_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
}

export function consumeOAuthSession() {
  const verifier = sessionStorage.getItem(PKCE_KEY);
  const state = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return { verifier, state };
}

export function buildAuthorizeUrl(codeChallenge: string, state: string) {
  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: "code",
    redirect_uri: getMicrosoftRedirectUri(),
    response_mode: "query",
    scope: SCOPES,
    state,
    prompt: "select_account",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/authorize?${params}`;
}

/** แลก token จาก browser (จำเป็นสำหรับ Azure SPA platform) */
export async function exchangeCodeInBrowser(code: string, codeVerifier: string) {
  const res = await fetch(
    `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: getClientId(),
        code,
        redirect_uri: getMicrosoftRedirectUri(),
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    }
  );

  const data = (await res.json()) as {
    id_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!res.ok || !data.id_token) {
    throw new Error(
      data.error_description ?? data.error ?? "แลก token จาก Microsoft ไม่สำเร็จ"
    );
  }

  return data.id_token;
}

export function parseIdToken(idToken: string): { email: string; name?: string } {
  const [, payloadPart] = idToken.split(".");
  if (!payloadPart) throw new Error("id_token ไม่ถูกต้อง");

  const payload = JSON.parse(
    atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/"))
  ) as {
    preferred_username?: string;
    email?: string;
    upn?: string;
    name?: string;
  };

  const email =
    payload.preferred_username ?? payload.email ?? payload.upn ?? null;

  if (!email) throw new Error("ไม่พบอีเมลจาก Microsoft");

  return { email, name: payload.name };
}

export async function startMicrosoftLogin() {
  const verifier = createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);
  const state = createOAuthState();
  saveOAuthSession(verifier, state);
  window.location.href = buildAuthorizeUrl(challenge, state);
}

export async function completeMicrosoftLogin(code: string, returnedState: string) {
  const { verifier, state } = consumeOAuthSession();

  if (!verifier || !state || state !== returnedState) {
    throw new Error("การยืนยันตัวตนไม่สำเร็จ — ลอง Sign in ใหม่");
  }

  const idToken = await exchangeCodeInBrowser(code, verifier);
  const { email, name } = parseIdToken(idToken);

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

  window.location.href =
    typeof data.redirectTo === "string"
      ? data.redirectTo
      : data.user?.role === "admin"
        ? "/admin/dev"
        : "/sales/orders";
}
