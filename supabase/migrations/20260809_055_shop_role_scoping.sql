-- Role scoping for ONA Shop.
-- 1) shop_search_events: record which role (motorist/professional) issued the search.
-- 2) Guard: professional-only products must stay invisible to motorist/guest reads.

alter table public.shop_search_events
  add column if not exists account_context text not null default 'motorist'
    check (account_context in ('motorist', 'professional'));