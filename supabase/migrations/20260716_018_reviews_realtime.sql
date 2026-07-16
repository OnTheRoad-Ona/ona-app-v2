-- Live motorist reviews on Repair Pro profiles (realtime + index)
-- Safe to re-run.

create index if not exists reviews_repair_pro_created_idx
  on public.reviews (repair_pro_id, created_at desc);

-- Allow Realtime listeners (optional; app also polls /api/pros/:id/reviews)
do $$
begin
  alter publication supabase_realtime add table public.reviews;
exception
  when duplicate_object then null;
  when undefined_object then null;
  when others then null;
end $$;
