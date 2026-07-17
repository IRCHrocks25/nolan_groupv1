// Cloudflare Pages Function — POST /api/contact
// Relays Nolan Group contact-form submissions to Resend, delivered to CONTACT_TO.
// Env (set on the Pages project, not in the repo):
//   RESEND_API_KEY  (secret) — sending-only key restricted to katek-ai.com
//   CONTACT_FROM    (plain)  — e.g. "Nolan Group Website <leads@katek-ai.com>"
//   CONTACT_TO      (plain)  — e.g. "info@thenolangroup.com"

const JSON_HEADERS = { "Content-Type": "application/json" };

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}

export async function onRequestPost({ request, env }) {
  // Parse body (JSON from the form's fetch, or a plain form POST as fallback).
  let body;
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }
  } catch (e) {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  // Honeypot: a bot filled the hidden field. Pretend success, send nothing.
  if (body.company && String(body.company).trim() !== "") {
    return json({ ok: true }, 200);
  }

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const service = String(body.service || "").trim();
  const message = String(body.message || "").trim();

  if (!name || !isEmail(email) || !message) {
    return json(
      { ok: false, error: "Please provide your name, a valid email, and a message." },
      400
    );
  }

  if (!env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM) {
    return json({ ok: false, error: "Server not configured." }, 500);
  }

  const rows = [
    ["Name", name],
    ["Email", email],
    ["Phone", phone || "—"],
    ["Interested in", service || "—"],
  ];

  const html =
    '<h2 style="margin:0 0 12px;font-family:Arial,sans-serif">New contact form submission</h2>' +
    '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
    rows
      .map(
        ([k, v]) =>
          '<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">' +
          esc(k) +
          '</td><td style="padding:4px 0"><strong>' +
          esc(v) +
          "</strong></td></tr>"
      )
      .join("") +
    "</table>" +
    '<p style="font-family:Arial,sans-serif;font-size:14px;margin-top:16px"><strong>Message</strong><br>' +
    esc(message).replace(/\n/g, "<br>") +
    "</p>" +
    '<p style="font-family:Arial,sans-serif;font-size:12px;color:#999;margin-top:24px">Sent from the Nolan Group website contact form. Reply to this email to respond directly to ' +
    esc(name) +
    ".</p>";

  const text =
    "New contact form submission\n\n" +
    "Name: " + name + "\n" +
    "Email: " + email + "\n" +
    "Phone: " + (phone || "-") + "\n" +
    "Interested in: " + (service || "-") + "\n\n" +
    "Message:\n" + message + "\n";

  const payload = {
    from: env.CONTACT_FROM,
    to: [env.CONTACT_TO],
    reply_to: email,
    subject: "New contact form submission — " + name,
    html,
    text,
  };

  let resp;
  try {
    resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json(
      { ok: false, error: "Could not send right now. Please email info@thenolangroup.com." },
      502
    );
  }

  if (!resp.ok) {
    return json(
      { ok: false, error: "Could not send right now. Please email info@thenolangroup.com." },
      502
    );
  }

  return json({ ok: true }, 200);
}
