-- Add per-agent tool whitelist so an agent can be restricted to a subset
-- of the 40+ AI tools. NULL means "all tools" (existing behavior).

alter table public.org_agents
	add column if not exists tool_whitelist text[];
