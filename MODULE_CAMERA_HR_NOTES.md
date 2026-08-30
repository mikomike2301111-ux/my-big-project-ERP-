# Camera → R2, HR↔Users, Deletes

## Camera / R2 attachments
RPC `uploadEntityAttachment(user, entityType, entityId, payload)` supports:
- sale, call, visit, delivery, production, productionjob, invoice, employee, trial, lead

Files go to Cloudflare R2 under `{module}/{entityId}/...`
Indexed in `erpAttachments` for reports via `listEntityAttachments`.

UI: `EntityCameraAttach` component (injected into main.jsx when present).
Existing delivery proof UI still works (`uploadDeliveryAttachment`).

## HR ↔ system users
- `autoLinkEmployeesToUsers` matches by email both ways
- `linkEmployeeToUser` still available for manual link
- saveEmployee auto-links when emails match

## Deletes
Existing `deleteRecord(..., { hard: true })` for CRM/Accounts remains.
`deleteUser` hard-delete for Admin/HR/Dev.

## Settings
`getIntegrationsStatus` reports R2 + D1 + Resend configuration.

## Env required for camera uploads
- CLOUDFLARE_API_TOKEN (or R2_API_TOKEN)
- R2_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID
- R2_BUCKET_NAME (default farmtrack-erp)
- Optional R2_PUBLIC_BASE for public URLs
