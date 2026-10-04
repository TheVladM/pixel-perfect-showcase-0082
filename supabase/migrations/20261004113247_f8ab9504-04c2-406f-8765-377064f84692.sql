-- 1. Storage: buckets already private; remove any read policy that would expose them
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects'
    and (qual ilike '%bons-commande%' or qual ilike '%prive%') loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

-- 2. Deactivated accounts
drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications for select to authenticated
  using (recipient_id = auth.uid() and public.is_active());

create or replace function public.mark_notification_read(_id uuid) returns void
language sql security definer set search_path to 'public' as $$
  update public.notifications set is_read = true
   where id = _id and recipient_id = auth.uid() and public.is_active();
$$;
create or replace function public.mark_all_read() returns void
language sql security definer set search_path to 'public' as $$
  update public.notifications set is_read = true
   where recipient_id = auth.uid() and not is_read and public.is_active();
$$;

-- 3. profiles: no row access for supervisors
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_read_all_records());

-- 4. user_roles: one role per account (fails loudly if duplicates exist)
do $$ declare d text; begin
  select string_agg(user_id::text || ' (' || n || ' rôles)', ', ') into d
  from (select user_id, count(*) n from public.user_roles group by user_id having count(*) > 1) s;
  if d is not null then raise exception 'Doublons dans user_roles : %', d; end if;
end $$;
alter table public.user_roles add constraint user_roles_user_id_key unique (user_id);

-- 5. audit_log append-only for everyone (no FK to auth.users exists)
create or replace function public.audit_log_guard() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE'
     and new.actor_id is null and old.actor_id is not null
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;
  raise exception 'Le journal d''audit est en ajout seul : modification et suppression interdites.';
end $$;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.audit_log_guard();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_guard();
revoke execute on function public.audit_log_guard() from public, anon, authenticated;