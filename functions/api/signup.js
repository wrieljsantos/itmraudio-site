const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
});

const validEmail = (value) => {
  if (typeof value !== "string" || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

export async function onRequestPost(context) {
  if (!context.env.SIGNUPS) return json({ error: "signup_storage_unavailable" }, 503);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  // Quietly accept bot-filled submissions without storing them.
  if (body.company) return json({ ok: true });

  const email = String(body.email || "").trim().toLowerCase();
  const locale = body.locale === "es" ? "es" : "en";
  if (!validEmail(email)) return json({ error: "invalid_email" }, 400);

  try {
    const result = await context.env.SIGNUPS.prepare(
      "INSERT OR IGNORE INTO subscribers (email, locale, source, consented_at, status) VALUES (?, ?, 'coming-soon', ?, 'subscribed')"
    ).bind(email, locale, new Date().toISOString()).run();

    const created = Number(result.meta?.changes || 0) > 0;
    return json({ ok: true, existing: !created }, created ? 201 : 200);
  } catch {
    return json({ error: "storage_error" }, 500);
  }
}

export function onRequest() {
  return json({ error: "method_not_allowed" }, 405);
}
