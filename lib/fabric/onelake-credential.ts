import {
  ClientSecretCredential,
  DefaultAzureCredential,
  InteractiveBrowserCredential,
  type TokenCredential,
} from "@azure/identity";
import {
  getOnelakeAuthEnvForProfile,
  type OnelakeAuthProfile,
} from "./env";

const TOKEN_RESOURCE = "https://storage.azure.com/.default";

export type OnelakeAuthMode =
  | "service_principal"
  | "interactive"
  | "default_credential";

/** Credential chain — mirrors ocr-po-matching/backend/master_refresh.py */
export function getOnelakeCredential(
  allowInteractive = false,
  profile: OnelakeAuthProfile = "masters"
): TokenCredential {
  const { tenantId, clientId, clientSecret } = getOnelakeAuthEnvForProfile(profile);
  const label = profile === "stock" ? "stock" : "masters";

  if (tenantId && clientId && clientSecret) {
    console.info(
      "[OneLake] auth (%s): service principal (client_id=%s)",
      label,
      clientId
    );
    return new ClientSecretCredential(tenantId, clientId, clientSecret);
  }

  if (allowInteractive) {
    console.info("[OneLake] auth (%s): InteractiveBrowserCredential", label);
    return new InteractiveBrowserCredential({
      tenantId: tenantId || undefined,
      clientId: clientId || undefined,
    });
  }

  const stubSecret = Boolean(tenantId && clientId && !clientSecret);
  console.info(
    "[OneLake] auth (%s): DefaultAzureCredential (stubSecret=%s)",
    label,
    stubSecret
  );
  return new DefaultAzureCredential();
}

export async function getOnelakeToken(
  allowInteractive = false,
  profile: OnelakeAuthProfile = "masters"
): Promise<string> {
  const cred = getOnelakeCredential(allowInteractive, profile);
  const token = await cred.getToken(TOKEN_RESOURCE);
  if (!token?.token) throw new Error("Failed to acquire OneLake token");
  return token.token;
}

export function describeOnelakeAuthMode(
  allowInteractive = false,
  profile: OnelakeAuthProfile = "masters"
): OnelakeAuthMode {
  const { tenantId, clientId, clientSecret } = getOnelakeAuthEnvForProfile(profile);
  if (tenantId && clientId && clientSecret) return "service_principal";
  if (allowInteractive) return "interactive";
  return "default_credential";
}
