import { createHash, randomBytes } from "crypto";
import { appPath } from "@/lib/paths";

const SCOPES = "openid profile email User.Read offline_access";

export const PKCE_COOKIE = "ms_oauth_pkce";
export const STATE_COOKIE = "ms_oauth_state";

export function getAzureIds() {
  const clientId = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID;
  const tenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID;

  if (!clientId || !tenantId) {
    throw new Error("ยังไม่ได้ตั้ง NEXT_PUBLIC_AZURE_AD_CLIENT_ID / TENANT_ID");
  }

  return { clientId, tenantId };
}

export function requireAzureConfig() {
  return getAzureIds();
}

export function createOAuthState() {
  return randomBytes(24).toString("hex");
}

export function createPkcePair() {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function getMicrosoftCallbackUrl(origin: string) {
  return `${origin}${appPath("/api/auth/microsoft/callback")}`;
}

export function buildMicrosoftAuthorizeUrl(
  origin: string,
  state: string,
  codeChallenge: string
): string {
  const { clientId, tenantId } = getAzureIds();
  const redirectUri = getMicrosoftCallbackUrl(origin);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES,
    state,
    prompt: "select_account",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeMicrosoftCode(
  code: string,
  origin: string,
  codeVerifier: string
): Promise<{ idToken: string; accessToken?: string }> {
  const { clientId, tenantId } = getAzureIds();
  const redirectUri = getMicrosoftCallbackUrl(origin);
  const useClientSecret = process.env.AZURE_AD_USE_CLIENT_SECRET === "true";
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;

  const body = new URLSearchParams({
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  // SPA / public client ห้ามส่ง client_secret (AADSTS700025)
  if (useClientSecret && clientSecret) {
    body.set("client_secret", clientSecret);
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  const data = (await res.json()) as {
    id_token?: string;
    access_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!res.ok || !data.id_token) {
    throw new Error(
      data.error_description ?? data.error ?? "แลก code จาก Microsoft ไม่สำเร็จ"
    );
  }

  return { idToken: data.id_token, accessToken: data.access_token };
}

export function parseMicrosoftIdToken(idToken: string): {
  email: string;
  name?: string;
} {
  const [, payloadPart] = idToken.split(".");
  if (!payloadPart) throw new Error("id_token ไม่ถูกต้อง");

  const payload = JSON.parse(
    Buffer.from(payloadPart, "base64url").toString("utf-8")
  ) as {
    preferred_username?: string;
    email?: string;
    upn?: string;
    name?: string;
  };

  const email =
    payload.preferred_username ?? payload.email ?? payload.upn ?? null;

  if (!email) {
    throw new Error("ไม่พบอีเมลจาก Microsoft");
  }

  return { email, name: payload.name };
}
