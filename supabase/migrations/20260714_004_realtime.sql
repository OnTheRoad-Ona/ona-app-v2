-- Enable Realtime for live multi-device sync (chat, jobs, pro presence)
-- Run in Supabase SQL editor if not applied automatically.

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.service_requests;
alter publication supabase_realtime add table public.repair_pro_profiles;
