ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ms_calendar_event_id text;
ALTER TABLE show_dates ADD COLUMN IF NOT EXISTS ms_calendar_event_id text;
