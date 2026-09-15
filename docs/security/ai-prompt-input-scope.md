# Prompt inputs: scope for the next review

Companion to `ai-security-sweep.md`. That sweep asked what a model can **do**. This one asks what goes **into** the prompt, who controls it, where it ends up afterwards, and what we owe the people whose data is in it.

This is a scope, not the review. Every item below was verified in the code so the review starts from facts rather than a generic checklist, but none of it is fixed yet.

## Why this is separate

The sweep's fixes constrain the blast radius of a model acting on bad input: rate limits, attachment caps, sender authentication, and the confirm guard (#250). None of them change how input is assembled into a prompt. A model that is told the wrong thing convincingly will still do the wrong permitted thing, and the permitted set is not small.

## A. Client-controlled prompt content

### A-1 `conversationHistory` is spliced in unvalidated

`routes/api/ai/+server.ts:1200` takes `conversationHistory` straight from the request body and spreads the last 20 turns into the Anthropic `messages` array. `:1215` does the same for the classifier. Nothing checks that `role` is one of the two valid values, that `content` is a string or a well-formed content block, or that the turns bear any relation to what the server actually said.

A caller can therefore hand the model a fabricated transcript: assistant turns it never produced, tool results that never ran, or a forged confirmation that something was already approved. Org scoping in the tool layer still holds, so this is not a cross-tenant issue. It is a "the model can be convinced of anything about its own past" issue, and every prompt-level rule we rely on is downstream of that.

Also unbounded per turn. `HISTORY_LIMIT` caps the number of turns at 20, not their size.

**Review should decide:** server-held conversation state, or signed/validated history, or at minimum strict shape validation and a per-turn size cap.

### A-2 `currentPage` and `entityContext` are unvalidated too

Same request body, same absence of checks (`:1015`, `:1016`, consumed at `:1097`). Lower stakes than history, but they are free text reaching the prompt.

## B. Org-authored system prompts

`org_agents.system_prompt` is written by an org admin and concatenated into the system block at `:1177` under a `CUSTOM AGENT INSTRUCTIONS:` heading. RLS scopes the row to the org, so this is an admin acting inside their own tenant, not an outsider.

Worth deciding deliberately anyway: a custom agent's instructions sit in the _system_ prompt alongside ours, at the same level of authority, and `tool_whitelist` is the only thing narrowing what it can reach. An admin who writes a prompt telling the agent to email every account is within their rights over their own data, but the review should confirm that is the intended trust model and that nothing in the base prompt can be contradicted in a way that matters.

## C. Untrusted content is not delimited

Inbound email bodies (`email-intake/parser.ts:100`) and SMS/WhatsApp message bodies (`messaging/agent.ts:278`) are placed into prompts as ordinary text. Attachment text goes in under an `[Attached file: name]` line (`ai-attachments.ts`), which is a label, not a boundary.

None of the system prompts in `ai-prompts.ts` tell the model that any part of its input is untrusted or that instructions found inside quoted content are data rather than commands.

**Review should cover:** a consistent envelope for untrusted content, and explicit instructions about it in the base prompt.

## D. Customer PII in prompts and what happens to it afterwards

This is the compliance half and probably the more urgent one.

Tool results are stripped of only `organization_id` and `updated_at` (`ai-tools.ts:81`). Everything else on an account row goes to the model: contact names, emails, phone numbers, street addresses. Order data carries values and terms. That is our customers' customers' data leaving our infrastructure.

Where prompt content comes to rest today:

| Store                      | What it holds                            | Retention                       |
| -------------------------- | ---------------------------------------- | ------------------------------- |
| `org_agent_runs`           | `input_prompt`, `output_text`, full      | None. Kept forever.             |
| `ai_feedback`              | user message + response, 10k chars       | None                            |
| `audit_log.metadata`       | the chat prompt, via `assistant.queried` | Partition drop, 24-month runway |
| `email_intakes.email_body` | raw inbound email                        | None                            |
| `messaging_messages.body`  | SMS/WhatsApp text                        | None                            |
| `ai_usage_logs`            | token counts only                        | None needed                     |

`audit_log` runs its metadata through `redact.ts`, which masks PII-shaped keys and caps strings. The other four have no redaction and no expiry.

**Review should answer:**

1. What is our retention policy for prompt and response content, and does anything enforce it? Right now four stores keep customer PII indefinitely by omission rather than decision.
2. Is zero data retention enabled on the Anthropic account? This cannot be determined from the code. It changes what we can tell customers.
3. What does our DPA and privacy policy say about sending customer data to a subprocessor, and does the current wording actually cover this? If a buyer asks what happens to their address, we need a true answer.
4. Do we need a per-org opt out of AI features for customers who will not accept a subprocessor?

## E. Smaller items already noted

- **F-7** from the sweep: `list_entities` accepts arbitrary filter keys (`ai-tools.ts:912`), letting a caller probe columns stripped from the output.
- Brevo sends a `SpamScore` we do not read, a reasonable second signal on inbound email.

## Not in scope

Model output rendering was checked and is sound. `Markdown.svelte:16` runs `marked` output through DOMPurify, and `BriefingCard.svelte:60` escapes before reintroducing `<strong>`. No action needed.

## Suggested shape

Two passes, since the halves have different owners:

1. **Input integrity** (A, B, C, E). Engineering-only, no policy decisions. A-1 is the one with teeth.
2. **Data handling** (D). Needs product and legal input as much as code. Start with the retention question, since it is the one currently answered by accident.
