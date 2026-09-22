-- Location-based caller ID support
-- Adds persistent caller ID assignment for NR leads and call-level audit trail

-- Persistent random caller ID for No Response leads
ALTER TABLE dialer_lead_state
  ADD COLUMN IF NOT EXISTS assigned_caller_id TEXT;

COMMENT ON COLUMN dialer_lead_state.assigned_caller_id
  IS 'Persistent caller ID for NR leads — once assigned, used for all retry attempts';

-- Track which caller ID was actually used per call (analytics + debugging)
ALTER TABLE dialer_calls
  ADD COLUMN IF NOT EXISTS caller_id_used TEXT;

COMMENT ON COLUMN dialer_calls.caller_id_used
  IS 'The actual caller ID used for this outbound call';
