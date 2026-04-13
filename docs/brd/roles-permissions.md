# Business Requirements Document: Roles & Permissions

**Product:** Threadline
**Version:** 1.0
**Last Updated:** April 12, 2026
**Status:** Living Document

---

## 1. Overview

Threadline is a multi-tenant B2B platform connecting sales rep organizations, brand organizations, and buyers. Access control is enforced at three layers: route-level guards, API endpoint checks, and Supabase Row Level Security (RLS) policies. Permissions are determined by a combination of organizational role and brand-scoped access.

---

## 2. Organization Types

**Rep Org** — Sales representative agencies that connect to brands, manage buyer accounts, and create orders on behalf of brands. This is the default organization type.

**Brand Org** — Brands and manufacturers that own product catalogs. A "self-brand" is automatically created on org creation. Rep orgs must request a connection to access a brand org's products.

---

## 3. Role Definitions

### 3.1 Admin

The highest-privilege organizational role with full platform access including account-level operations.

**Capabilities:**
- Full read/write access to all features and data across the organization
- Manage billing, subscription, and account lifecycle
- Delete the organization
- Configure SSO enforcement and security settings
- Manage all integrations (Google Sheets, Outlook, Slack, Notion, Discord)
- Invite, remove, and change roles of all members (except cannot change the Owner role)
- Create, edit, and delete brands, products, seasons, territories, and shows
- Approve or reject org-to-org connections
- View and manage all orders, appointments, expenses, and insights regardless of brand scope
- Configure AI automation agents
- Full access to commission settings at all levels (member, brand, member-brand override, account override)

**Restrictions:**
- Cannot change the Owner's role
- Cannot change their own role

---

### 3.2 Owner

Full operational access with some account-level restrictions compared to Admin.

**Capabilities:**
- All capabilities of Admin **except** billing management and organization deletion
- Manage team members, roles, and commission rates
- Full brand, product, and order management
- Approve/reject connections, expenses, and invitations
- Configure SSO enforcement
- Manage integrations

**Restrictions:**
- Cannot access billing or subscription management
- Cannot delete the organization
- Cannot change their own role

---

### 3.3 Member

Standard team member with read/write access, optionally scoped to specific brands.

**Brand Scoping:**
- **Unscoped (default):** Can see and work with all brands in the organization
- **Scoped:** Can only see and work with brands explicitly assigned via `member_brand_access`

**Capabilities:**
- View and work with orders, products, and accounts within their brand scope
- Create and edit orders for brands in scope
- Submit expenses for brands in scope
- View appointments for accounts within scoped brands
- View insights scoped to their assigned brands
- Connect personal email (Gmail/Outlook)
- View contacts and account information within scope

**Restrictions:**
- Cannot access organization admin settings (members, security, billing, integrations)
- Cannot create, edit, or delete brands or products
- Cannot approve/reject connections or invitations
- Cannot manage other team members or roles
- Cannot approve/reject expenses (can only submit)

---

### 3.4 Sales

A role designed for field sales representatives working specific territories and brand assignments.

**Brand Scoping:** Always scoped to assigned brands via `member_brand_access`.

**Capabilities:**
- View and manage orders for assigned brand accounts
- View and manage appointments for scoped accounts
- Submit expenses for assigned brands
- View insights scoped to assigned accounts
- Connect personal email

**Restrictions:**
- Cannot access the Brands page (actively redirected away)
- Cannot access organization admin settings
- Cannot create, edit, or delete brands or products
- Cannot manage other team members
- Cannot approve/reject connections, invitations, or expenses

---

### 3.5 Guest

Read-only access for external collaborators or limited users.

**Brand Scoping:**
- **Unscoped (default):** Can see all brands
- **Scoped:** Can only see brands assigned via `member_brand_access`

**Capabilities:**
- View orders, products, accounts, and brands within scope (read-only)
- Connect personal email

**Restrictions:**
- Cannot create, edit, or delete any data
- Cannot access organization admin settings
- Cannot submit expenses
- Cannot manage appointments
- No access to expenses module

---

### 3.6 Buyer (External Role)

A separate role managed through the `account_users` table rather than organization membership. Buyers access a dedicated portal to browse products and place orders.

**Access Scoping:** Controlled per-account via `account_brand_access` — each buyer account is granted visibility into specific brands.

**Capabilities:**
- Browse product catalogs for brands their account has access to
- Submit orders for accessible brands
- View order history for their accounts

**Restrictions:**
- No access to organizational features (settings, team, expenses, appointments, insights)
- Cannot see brands outside their account's granted access
- Cannot modify product or brand data
- Separate invitation flow (`buyer_invitations`, not org invitations)
- Redirected to onboarding if they have no org membership

---

## 4. Permission Matrix by Feature

### 4.1 Organization Management

| Feature | Admin | Owner | Member | Sales | Guest | Buyer |
|---|---|---|---|---|---|---|
| View org settings | Yes | Yes | No | No | No | No |
| Edit org settings | Yes | Yes | No | No | No | No |
| Manage billing/subscription | Yes | No | No | No | No | No |
| Delete organization | Yes | No | No | No | No | No |
| Configure SSO | Yes | Yes | No | No | No | No |
| Enforce SSO | Yes | Yes | No | No | No | No |

### 4.2 Team Management

| Feature | Admin | Owner | Member | Sales | Guest | Buyer |
|---|---|---|---|---|---|---|
| View members list | Yes | Yes | No | No | No | No |
| Invite new members | Yes | Yes | No | No | No | No |
| Remove members | Yes | Yes | No | No | No | No |
| Change member roles | Yes | Yes | No | No | No | No |
| Set commission rates | Yes | Yes | No | No | No | No |
| Assign brand scoping | Yes | Yes | No | No | No | No |
| Change Owner role | No | No | No | No | No | No |

### 4.3 Brands & Products

| Feature | Admin | Owner | Member | Sales | Guest | Buyer |
|---|---|---|---|---|---|---|
| View brands | All | All | Scoped | Scoped | Scoped | Account-scoped |
| Create brands | Yes | Yes | No | No | No | No |
| Edit brands | Yes | Yes | No | No | No | No |
| Delete brands | Yes | Yes | No | No | No | No |
| Access brands page | Yes | Yes | Yes | **No (redirected)** | Yes | No |
| View products | All | All | Scoped | Scoped | Scoped | Account-scoped |
| Create/edit products | Yes | Yes | No | No | No | No |
| Delete products | Yes | Yes | No | No | No | No |
| Manage seasons | Yes | Yes | No | No | No | No |

### 4.4 Orders

| Feature | Admin | Owner | Member | Sales | Guest | Buyer |
|---|---|---|---|---|---|---|
| View orders | All | All | Scoped | Scoped | Scoped (read-only) | Account-scoped |
| Create orders | Yes | Yes | Scoped | Scoped | No | Account-scoped |
| Edit orders | Yes | Yes | Scoped | Scoped | No | No |
| Submit orders | Yes | Yes | Scoped | Scoped | No | Account-scoped |
| Generate order PDF | Yes | Yes | Scoped | Scoped | No | No |
| Email orders | Yes | Yes | Scoped | Scoped | No | No |

### 4.5 Accounts (Buyer Management)

| Feature | Admin | Owner | Member | Sales | Guest | Buyer |
|---|---|---|---|---|---|---|
| View accounts | All | All | Scoped | Scoped | Scoped | Own account |
| Create accounts | Yes | Yes | No | No | No | No |
| Edit accounts | Yes | Yes | No | No | No | No |
| Bulk import accounts | Yes | Yes | No | No | No | No |
| Manage buyer users | Yes | Yes | No | No | No | No |
| Grant brand access to accounts | Yes | Yes | No | No | No | No |

### 4.6 Appointments

| Feature | Admin | Owner | Member | Sales | Guest | Buyer |
|---|---|---|---|---|---|---|
| View appointments | All | All | Scoped | Scoped | No | No |
| Create appointments | Yes | Yes | Scoped | Scoped | No | No |
| Edit appointments | Yes | Yes | Scoped | Scoped | No | No |
| Manage appointment types | Yes | Yes | No | No | No | No |

### 4.7 Expenses

| Feature | Admin | Owner | Member | Sales | Guest | Buyer |
|---|---|---|---|---|---|---|
| View expenses | All | All | Scoped | Scoped | No | No |
| Submit expenses | Yes | Yes | Scoped | Scoped | No | No |
| Approve/reject expenses | Yes | Yes | No | No | No | No |
| Attach receipts | Yes | Yes | Scoped | Scoped | No | No |

**Expense categories:** Trade show, Samples, Marketing, Travel, Meals, Shipping, Photography, Office, Other

### 4.8 Connections (Rep-to-Brand B2B)

| Feature | Admin | Owner | Member | Sales | Guest | Buyer |
|---|---|---|---|---|---|---|
| View connections | Yes | Yes | No | No | No | No |
| Request connection | Yes | Yes | No | No | No | No |
| Approve/reject connection | Yes | Yes | No | No | No | No |
| Disconnect | Yes | Yes | No | No | No | No |
| Set connection commission rate | Yes | Yes | No | No | No | No |

**Connection statuses:** Pending → Active → Suspended / Disconnected

### 4.9 Integrations

| Feature | Admin | Owner | Member | Sales | Guest | Buyer |
|---|---|---|---|---|---|---|
| Configure org integrations | Yes | Yes | No | No | No | No |
| Connect personal email | Yes | Yes | Yes | Yes | Yes | No |
| View email inbox | Yes | Yes | Yes | Yes | Yes | No |

**Supported integrations:** Google Sheets, Microsoft (Outlook/Excel/Teams), Slack, Notion, Discord

### 4.10 Insights & Analytics

| Feature | Admin | Owner | Member | Sales | Guest | Buyer |
|---|---|---|---|---|---|---|
| View insights | All | All | Scoped | Scoped | No | No |
| Dismiss insights | Yes | Yes | Yes | Yes | No | No |
| Refresh insights | Yes | Yes | Yes | Yes | No | No |

### 4.11 Shows & Territories

| Feature | Admin | Owner | Member | Sales | Guest | Buyer |
|---|---|---|---|---|---|---|
| View shows | Yes | Yes | Yes | Yes | Yes | No |
| Create/edit shows | Yes | Yes | No | No | No | No |
| Manage show dates/docs | Yes | Yes | No | No | No | No |
| View territories | Yes | Yes | Yes | Yes | Yes | No |
| Manage territories | Yes | Yes | No | No | No | No |

### 4.12 AI Agents

| Feature | Admin | Owner | Member | Sales | Guest | Buyer |
|---|---|---|---|---|---|---|
| View agents | Yes | Yes | No | No | No | No |
| Create/configure agents | Yes | Yes | No | No | No | No |
| Trigger agents | Yes | Yes | No | No | No | No |

---

## 5. Brand Scoping Rules

Brand scoping determines which brands a user can see and interact with. It applies differently per role:

| Role | Default Scope | Can Be Scoped? | Scoping Mechanism |
|---|---|---|---|
| Admin | All brands | No (always full) | N/A |
| Owner | All brands | No (always full) | N/A |
| Member | All brands | Yes | `member_brand_access` table |
| Sales | Must be scoped | Yes (required) | `member_brand_access` table |
| Guest | All brands | Yes | `member_brand_access` table |
| Buyer | Account-scoped | N/A | `account_brand_access` table |

**Rule:** If `member_brand_access` contains entries for a user, they are scoped to only those brands. If no entries exist, they have access to all brands (except Sales, who should always be scoped).

---

## 6. Commission Hierarchy

Commissions are resolved in the following priority order (highest priority first):

1. **Account-level override** — Special rate for a specific buyer account (`commission_override`)
2. **Member-brand override** — Custom rate for a specific member + brand combination (`member_brand_commission`)
3. **Brand-level rate** — Default commission rate set on the brand
4. **Member default rate** — Fallback rate set on the organization member record

---

## 7. Authentication & Security

**Authentication:** Supabase Auth with session-based authentication. Multi-org context tracked via `active_org_id` cookie.

**SSO Enforcement:** Organization-level setting. When enabled, users must authenticate via an SSO provider whose domain matches their email. Non-SSO sessions are redirected to login with an error.

**Multi-Org Support:** Users can belong to multiple organizations. The active org is selected via cookie, falling back to the first membership if unset.

**Buyer Authentication:** Buyers are identified by presence in the `account_users` table and have a separate login context from org members.

---

## 8. Enforcement Layers

**Layer 1 — Route Guards:** SvelteKit layout servers check role before rendering pages. Non-authorized users are redirected (e.g., Sales redirected from `/brands`).

**Layer 2 — API Endpoint Checks:** Every mutating endpoint (POST/PATCH/DELETE) validates `membership.role` and returns 403 on unauthorized access. Used across 40+ endpoints.

**Layer 3 — Database RLS Policies:** Postgres Row Level Security functions (`get_user_org_ids()`, `get_member_role_in_org()`, `is_org_member()`, `get_buyer_account_ids()`, etc.) enforce org isolation and role-based access at the data layer.

**Layer 4 — Application-Level Brand Scoping:** Brand scope filtering is handled in page servers and API logic (not RLS), allowing flexible scoping without database changes.

---

## 9. Key Data Tables

| Table | Purpose |
|---|---|
| `profiles` | User profile data |
| `organizations` | Org settings, type, SSO config |
| `organization_members` | Membership records linking users to orgs with roles |
| `member_brand_access` | Brand scoping for Member/Sales/Guest roles |
| `invitations` | Org member invitation records |
| `buyer_invitations` | Separate buyer invitation flow |
| `account_users` | Links buyer profiles to accounts |
| `account_brand_access` | Controls which brands a buyer account can see |
| `org_connections` | Rep-to-brand B2B connection records |
| `member_brand_commission` | Per-member-brand commission overrides |

---

## 10. Open Questions & Future Considerations

- [ ] Should Sales role have a read-only view of the Brands page instead of a hard redirect?
- [ ] Should Members be able to approve/reject expenses for brands they are scoped to?
- [ ] Is there a need for a "Manager" role between Member and Owner with limited admin capabilities?
- [ ] Should brand scoping for the Guest role default to scoped (no brands) rather than unscoped (all brands)?
- [ ] Should Buyers have access to view appointment schedules or show information?
- [ ] Should the commission hierarchy support connection-level overrides for rep-to-brand relationships?

---

*This is a living document. Update as roles, permissions, or features change.*
