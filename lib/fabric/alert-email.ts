import { getOnelakeAuthEnv } from "./env";

function parseRecipients(): string[] {
  const raw =
    process.env.ALERT_EMAIL?.trim() ||
    process.env.SENDER_EMAIL?.trim() ||
    "";
  if (!raw) return [];
  return [...new Set(raw.split(/[,;]/).map((e) => e.trim()).filter(Boolean))];
}

async function getGraphToken(): Promise<string | null> {
  const { tenantId, clientId, clientSecret } = getOnelakeAuthEnv();
  if (!tenantId || !clientId || !clientSecret) {
    console.warn("[VMI alert] Graph token skipped — missing Azure credentials");
    return null;
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });

  if (!res.ok) {
    console.error("[VMI alert] Graph token failed:", res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

/** Send alert via Microsoft Graph when SENDER_EMAIL is configured. Always logs. */
export async function sendMasterRefreshAlert(
  subject: string,
  body: string
): Promise<void> {
  const recipients = parseRecipients();
  console.error(`[VMI alert] ${subject}\n${body}`);

  const sender = process.env.SENDER_EMAIL?.trim();
  if (!sender || recipients.length === 0) {
    console.warn(
      "[VMI alert] Email skipped — set SENDER_EMAIL and ALERT_EMAIL for Graph delivery"
    );
    return;
  }

  const token = await getGraphToken();
  if (!token) return;

  const payload = {
    message: {
      subject,
      body: { contentType: "Text", content: body },
      toRecipients: recipients.map((address) => ({
        emailAddress: { address },
      })),
    },
    saveToSentItems: false,
  };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (res.ok) {
    console.info("[VMI alert] Email sent to", recipients.join(", "));
  } else {
    console.error("[VMI alert] Email failed:", res.status, await res.text());
  }
}
