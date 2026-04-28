# /Threadline — Email Templates

Branded transactional templates for the 9 Resend emails Threadline sends today, plus 5 Supabase Auth emails. Built against `docs/brand/guidelines.md`.

## Folder layout

```
emails/
  README.md                          ← this file
  _shell.html                        ← reference shell (header / body / footer) — do not paste, see notes
  resend/
    invite-org-member.html
    invite-buyer-team.html
    invite-connection-member.html
    invite-org-connect.html
    order-submitted.html
    order-created.html
    order-confirmed.html
    order-shipped.html
    order-delivered.html
  auth/
    confirm-signup.html
    magic-link.html
    reset-password.html
    change-email.html
    reauthentication.html
  text/                              ← plain-text fallbacks (one per template)
```

## Brand decisions baked in

- Wordmark `/Threadline` — never split, never recolored
- Colors — Background `#FCFCFC`, Foreground `#292B30`, Primary `#181820`, Muted text `#717179`
- Typography — IBM Plex Sans (body), IBM Plex Mono (labels) loaded from Google Fonts with system fallbacks
- Sharp corners everywhere (`border-radius: 0`)
- Mono labels in brackets (`[ ORDER SUBMITTED ]`) as the canonical section marker
- Two-color, no decorative color, no gradients, no shadows, no emojis
- Voice: direct, lowercase headlines where natural, no superlatives, no exclamation marks, industry language used naturally (line sheets, sell-through, account)

## How to install in Resend

The 9 templates here are uploaded as Resend Templates by running:

```bash
bun run scripts/upload-resend-templates.ts
```

The script is upsert-safe — it dedupes by alias, so re-running just bumps each template to a new draft revision and republishes. Requires `RESEND_API_KEY` (full_access permission, not the SMTP/sending-only key) in `.env`.

Once uploaded, reference templates by alias from the SDK:

```ts
resend.emails.send({
  from: env.EMAIL_FROM,
  to,
  templateId: 'order-confirmed', // alias = slug
  variables: {
    ORDER_NUMBER: order.number,
    ACCOUNT_NAME: account.business_name,
    BRAND_NAME: brand.name,
    TOTAL: formatCurrency(order.total_amount),
    ORDER_URL: `${env.PUBLIC_APP_URL}/orders/${order.id}`
  }
});
```

### Resend syntax (important)

Resend uses **triple-brace** Mustache-style tags, not Handlebars double-brace:

- Variables: `{{{VARIABLE_NAME}}}` (UPPER_SNAKE_CASE)
- Block helpers: `{{{#if VAR}}}...{{{else}}}...{{{/if}}}`
- Same for `{{{#each VAR}}}...{{{/each}}}` and `{{{#unless VAR}}}...{{{/unless}}}`

Variable names in the templates are uppercased (e.g. `ORDER_NUMBER`) but the SDK call passes the same casing.

### Alternative: inline HTML, no Resend Templates

If you'd rather ship without using Resend Templates at all, copy each `resend/<slug>.html` body into `src/lib/server/email-templates.ts` and swap `{{{VAR}}}` for `${escapeHtml(var)}` template literals. The `sendEmail()` callsites stay unchanged.

## Variables, by template

### invite-org-member · invite-buyer-team · invite-connection-member
- `inviter_name`
- `organization_name` (or business / account name for the buyer-team variant)
- `role` — admin / member / sales / guest / buyer (omit if not applicable)
- `accept_url`
- `expires_in_days` (default `7`)

### invite-org-connect
- `from_org_name`
- `from_user_name` (optional — empty string hides the line)
- `personal_message` (optional — empty string hides the quote block)
- `invite_url`

### order-submitted · order-created · order-confirmed · order-shipped · order-delivered
- `order_number`
- `account_name`
- `brand_name`
- `total` — pre-formatted currency string (e.g. `$4,200`)
- `line_count` (optional)
- `order_url`
- `tracking_number` (shipped only, optional)
- `tracking_url` (shipped only, optional)

### auth/* (Supabase)
Use Supabase's variable names — already in place:
- `{{ .ConfirmationURL }}`
- `{{ .Token }}`
- `{{ .TokenHash }}`
- `{{ .SiteURL }}`
- `{{ .Email }}`
- `{{ .NewEmail }}` (change-email only)

Paste each into Supabase Dashboard → Authentication → Email Templates.

## Plain-text fallbacks

Every template has a `text/<slug>.txt` partner. Pass it as the `text` field on `resend.emails.send({ html, text })` for deliverability.

## Subject lines & preheaders

Each HTML file has its recommended subject line and preheader at the top inside `<!-- subject: ... -->` and `<!-- preheader: ... -->` HTML comments — copy those into Resend alongside the HTML.

## Browser-rendered preview

Open any `.html` file directly in a browser to see exactly how it renders. The CSS is inlined and the Google Fonts `<link>` is included.

## Dark-mode behavior

Threadline brand emails are intentionally fixed in light mode. The templates set explicit colors and use `meta name="color-scheme" content="only light"` so Apple Mail and Outlook don't auto-invert them. This protects the wordmark contrast and the foreground/background relationship.

## Updating the shell

`_shell.html` is the canonical layout (header, footer, button, mono label). When you edit shell-level styling, regenerate every template — or, if you move to React Email later, lift the shell into `<EmailLayout>` and re-render.
