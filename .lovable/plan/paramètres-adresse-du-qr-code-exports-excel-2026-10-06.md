# Paramètres, adresse du QR code, exports Excel

## Phase 1 findings (read only, nothing changed)

1. **Logo and signature (src/lib/order-pdf.functions.ts)**
   - Both come from the private bucket `prive`, at the root: `logo.png` and `signature.png`.
   - They are read with the service role through `download()`. The signature is read only when `decided_role === "admin_principal"`.
   - If a file is missing, `download()` returns `null` and the PDF is built without it. If an image can't be decoded, `embedImage()` tries PNG, then JPEG, then skips it. In both cases the PDF is still made.
   - Because a PDF is never redone, a bon generated while a file was missing stays that way.
2. **QR base URL:** `originOf()` builds it from `x-forwarded-host` and `x-forwarded-proto`, falling back to `new URL(req.url).origin`. `ensurePdf` uses it as `verifyUrl = ${origin}/verifier/${verification_token}`.
3. **Caller check and audit pattern (src/lib/admin.functions.ts)**
   - Caller check: `.middleware([requireSupabaseAuth])` checks the JWT, then `assertAdminPrincipal(context)` calls `rpc("is_admin_principal")` with the caller's own client and throws if the result isn't `true`.
   - Audit line: `logAdminAction({ actorId: context.userId, action, tableName, recordId, newData })` inserts into `audit_log` through `supabaseAdmin`, with `actor_role: "admin_principal"`. On error it logs and does not throw.
   - For zone exports, `actor_role` must come from `current_user_role`, not be hard-coded.
4. **Fiches, xlsx and custom values**
   - `fiches.tsx` makes one browser query, with `.limit(10000)`, and the filters are applied on the device. The table shows 25 per page.
   - **Existing gap:** the database returns at most 1000 rows per request, so beyond 1000 records the list is silently cut. I'll leave it alone unless you ask, since you want existing features untouched.
   - xlsx is `0.20.3`, from the SheetJS CDN tarball.
   - Custom answers are in `student_records.custom_values`, as `{ [field_id]: value }`. The fields as they were when the record was saved are in `student_records.fields_snapshot`, as an array of `{id, label, field_type, options, required, sort_order}`.
5. **Branching:** I can't create git branches or commits. The equivalent here is a draft: a separate copy of the app where all of this is built, and you merge it into the live app when you're ready. One draft holds the three tasks, kept as separate sets of changes.

## Plan (phase 2, after approval)

**Task A: /parametres (admin_principal)**
- Add the route with `requireRole(["admin_principal"])` and an entry in the sidebar menu.
- New `src/lib/settings.functions.ts`:
  - `uploadBrandingImage({ kind: "logo" | "signature", base64, mime })` uses middleware + `assertAdminPrincipal`. It accepts PNG or JPEG, checks the file signature (magic bytes) and a 2 MB limit, then writes with upsert to `prive/logo.png` or `prive/signature.png`. These are the same names the PDF reads, so a JPEG is also saved as `.png`; the PDF already handles that.
  - Each upload writes an audit line with the real actor.
  - `getBrandingStatus()` returns, for each image, whether it exists and its date, using `list()` on `prive`. It also returns a 60-second signed URL for the logo only. Nothing about the signature reaches the browser except "Signature enregistrée le dd/mm/yyyy" or "Aucune signature".
- I'll move `logAdminAction` and `assertAdminPrincipal` into a shared `src/lib/audit.server.ts`, reused by admin.functions.ts unchanged in behaviour.

**Task B: PUBLIC_APP_URL**
- Replace `originOf()` in `ensurePdf` with `process.env.PUBLIC_APP_URL`, read in the handler and with any trailing slash removed.
- If the variable is missing, the error is "Adresse publique de l'application non configurée (PUBLIC_APP_URL)." and no PDF is generated.
- You set it as a project secret. I'll open the secret form for you and you enter the published URL.

**Task C: /exports (admin_principal + zone)**
- Add the route with `requireRole(["admin_principal","zone"])` and an entry in the menu.
- New `src/lib/exports.functions.ts`, using middleware and the caller's own session (`context.supabase`, so RLS applies, never the service role):
  - `countExport({campaignId, scope})` returns the exact count, so the page can show "N fiches" before download.
  - `buildExport` reads in pages of 1000 with `.range()` and a stable order (id). It checks the number of rows read against the `count: "exact"` total and throws an explicit error if they differ.
  - Allowed roles and scopes: an admin can choose a zone, a region or global. A zone account is forced to its own zone, whatever it sends. Any other role is refused.
  - Filters: `is_deleted = false`, then sort by school, then last name (fr).
  - Columns: Nom, Prénom, Sexe, Établissement, Classe, Série, then the merged custom field labels from `fields_snapshot` (taken by id and ordered by sort_order), then Zone, Région, Agent, Date de saisie (dd/mm/yyyy).
  - Every text cell starting with `= + - @` gets a leading `'`.
  - Global export has sheets "Global", one per region (name sanitised, 31 chars max) and one per zone code.
  - Returns base64 xlsx + file name + row count, and writes an audit line `EXPORT_RECORDS` with campaign, scope and rows, using the real actor and role.
- No schema change is needed.

**Checks:** type check + build, then test steps for you. Nothing is merged into the live app.
