import "server-only";

/**
 * Transactional SMS (submission receipts). Uses Twilio's Messages API when
 * TWILIO_* env vars are set. Login OTPs are NOT sent from here: Supabase Auth
 * sends them via its own configured SMS provider / Send-SMS hook.
 * SMS bodies must never contain idea content — only the Idea ID and timestamp.
 */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    console.warn("sms_not_configured");
    return false;
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 300) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("sms_send_failed", res.status);
    return res.ok;
  } catch {
    console.error("sms_send_error");
    return false;
  }
}
