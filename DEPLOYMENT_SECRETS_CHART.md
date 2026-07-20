# Deployment Secrets Chart

This file documents the secret and integration variables needed by the ERP without exposing live keys.

| Service | Variable | Where It Is Used | Safe Value Format | Notes |
| --- | --- | --- | --- | --- |
| Vercel | `VERCEL_TOKEN` | CLI/deployment automation only | `vcp_****` | Keep outside source control. Use Vercel project/env settings or local shell only. |
| Supabase | `SUPABASE_URL` | API data bridge and email tracking | `https://****.supabase.co` | Public project URL. |
| Supabase | `SUPABASE_ANON_KEY` | Client-safe anon access when needed | `eyJ****` | Only use anon permissions with RLS policies. |
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` | Server-only API operations | `eyJ****` | Never expose to browser code. Vercel server env only. |
| Supabase | `SUPABASE_ACCESS_TOKEN` | Admin/project automation | `sbp_****` | Never commit. Rotate if shared publicly. |
| Resend | `RESEND_API_KEY` | Sending email and attachments | `re_****` | Server-only. Required for invoice PDF attachments. |
| Email | `EMAIL_FROM` | Default sender identity | `FarmTrack ERP <finance@staff.farmtrack.co.ke>` | Domain must be verified in Resend. |
| Email | `EMAIL_REPLY_TO` | Reply handling | `erpintergration@gmail.com` | Used as reply-to for composed emails. |
| GitHub | `GITHUB_TOKEN` | Git push/automation only | `ghp_****` | Do not save in repo files. Prefer GitHub CLI auth/session. |
| App URL | `PLATFORM_URL` | Email links and approval actions | `https://erpftc.vercel.app` | Used in email buttons and tracking links. |
| AI (OpenRouter) | `OPENROUTER_API_KEY` | AI copilot with model fallback rotation | `sk-or-v1-****` | Server-only. Required for AI assistant v2. |
| AI (Gemini) | `GEMINI_API_KEY` | Gemini fallback when OpenRouter models fail | `AQ.****` or `AIza****` | Server-only. Used as final fallback. |
| AI (Groq) | `GROQ_API_KEY` | Legacy AI assistant (v1) | `gsk_****` | Server-only. Used by original ai-assistant.js. |

## Current Safe Rule

Secrets are configured in Vercel or the local shell, not in committed files. If a live token was pasted into chat, rotate it from the provider dashboard before relying on it long term.

## Invoice Settings Controlled In App

These are not secrets and can be changed from ERP Settings:

| Setting | Purpose |
| --- | --- |
| `kra_pin` | Prints KRA PIN on tax invoices. |
| `invoice_logo_url` | Prints the invoice logo/image from a hosted URL. |
| `invoice_comment` | Adds a standard invoice comment. |
| `invoice_footer` | Adds footer note/thank-you text. |
| `invoice_terms` | Adds sales/return/payment terms. |
| `product_default_markup_percent` | Default product pricing markup. |
| `product_default_vat_mode` | Default VAT behavior for product/invoice pricing. |
| `product_price_rounding` | Default price rounding rule. |
| `product_default_unit` | Default unit for new products. |
