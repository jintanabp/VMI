import { Configuration, LogLevel } from "@azure/msal-browser";
import { appPath } from "@/lib/paths";

const clientId = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID ?? "";
const tenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID ?? "";

export function getMsalRedirectUri() {
  if (typeof window !== "undefined") {
    return `${window.location.origin}${appPath("/auth/callback")}`;
  }
  return `http://localhost:3000${appPath("/auth/callback")}`;
}

// redirectUri ถูกตั้งจริงใน msal-instance.ts ตอน runtime
export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: `http://localhost:3000${appPath("/auth/callback")}`,
    postLogoutRedirectUri: `http://localhost:3000${appPath("/")}`,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: true,
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
    },
  },
};

export const loginRequest = {
  scopes: ["openid", "profile", "email", "User.Read"],
};
