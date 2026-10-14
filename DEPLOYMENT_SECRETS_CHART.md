# Production secrets inventory

Never commit credentials or paste them into source files. Configure production
secrets only in Vercel Environment Variables or the relevant provider dashboard.

Required for the ERP database:
- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_D1_DATABASE_ID
- CLOUDFLARE_API_TOKEN (Account D1 Edit)

Optional integrations:
- R2 access credentials for file storage
- RESEND_API_KEY and verified sender details for email
- AI provider keys, if those features are enabled
