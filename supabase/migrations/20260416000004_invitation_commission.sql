-- Let invitation senders pre-set a sales commission rate so it's
-- applied to the organization_members row when the invitee accepts.
-- NULL / 0 means "no commission" — matches the default on
-- organization_members.commission_rate.

alter table public.invitations
	add column if not exists commission_rate decimal(5, 2) default 0;
