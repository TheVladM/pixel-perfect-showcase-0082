-- ===== lock down helper functions =====
revoke execute on function public.log_login_attempt(text, boolean, text) from anon, authenticated, public;
revoke all on function public.audit_trigger() from public, anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_active() from public, anon;
revoke all on function public.current_zone_id() from public, anon;
revoke all on function public.current_region_id() from public, anon;
revoke all on function public.is_admin_principal() from public, anon;
revoke all on function public.can_read_all_records() from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_active() to authenticated;
grant execute on function public.current_zone_id() to authenticated;
grant execute on function public.current_region_id() to authenticated;
grant execute on function public.is_admin_principal() to authenticated;
grant execute on function public.can_read_all_records() to authenticated;
grant execute on function public.log_login_attempt(text, boolean, text) to service_role;

-- ===== campaigns =====
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  start_date date not null,
  end_date date not null,
  reopened boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.form_fields (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  program_id uuid,
  label text not null,
  field_type text not null check (field_type in ('text','number','date','phone','select')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index form_fields_campaign_idx on public.form_fields(campaign_id, sort_order);

create table public.student_records (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  zone_id uuid not null references public.zones(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  last_name text not null,
  first_name text not null,
  sex text not null check (sex in ('M','F')),
  class_id uuid not null references public.classes(id) on delete restrict,
  series_id uuid references public.series(id) on delete restrict,
  custom_values jsonb not null default '{}'::jsonb,
  fields_snapshot jsonb not null default '[]'::jsonb,
  agent_name text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deletion_reason text,
  deleted_by uuid,
  deleted_at timestamptz
);
create index student_records_campaign_idx on public.student_records(campaign_id);
create index student_records_zone_idx on public.student_records(zone_id);
create index student_records_school_idx on public.student_records(school_id);

-- ===== grants =====
grant select, insert, update on public.campaigns to authenticated;
grant select, insert, update on public.form_fields to authenticated;
grant select, insert on public.student_records to authenticated;
grant all on public.campaigns, public.form_fields, public.student_records to service_role;

-- ===== RLS =====
alter table public.campaigns enable row level security;
alter table public.form_fields enable row level security;
alter table public.student_records enable row level security;

create policy "campaigns_read" on public.campaigns for select to authenticated using (public.is_active());
create policy "campaigns_insert" on public.campaigns for insert to authenticated with check (public.is_admin_principal());
create policy "campaigns_update" on public.campaigns for update to authenticated using (public.is_admin_principal()) with check (public.is_admin_principal());

create policy "form_fields_read" on public.form_fields for select to authenticated using (public.is_active());
create policy "form_fields_insert" on public.form_fields for insert to authenticated with check (public.is_admin_principal());
create policy "form_fields_update" on public.form_fields for update to authenticated using (public.is_admin_principal()) with check (public.is_admin_principal());

create policy "student_records_read" on public.student_records for select to authenticated
using (
  public.can_read_all_records()
  or (public.is_active() and public.has_role(auth.uid(),'zone') and zone_id = public.current_zone_id())
);

create policy "student_records_insert" on public.student_records for insert to authenticated
with check (
  public.is_active() and public.has_role(auth.uid(),'zone') and zone_id = public.current_zone_id()
);

-- ===== validation trigger =====
create or replace function public.validate_student_record()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_campaign public.campaigns;
  v_zone uuid;
  v_requires boolean;
  v_school_zone uuid;
  v_snapshot jsonb;
  v_field jsonb;
  v_val text;
begin
  if not public.is_active() then
    raise exception 'Votre compte est désactivé.';
  end if;
  if not public.has_role(auth.uid(), 'zone') then
    raise exception 'Seuls les comptes zone peuvent enregistrer des fiches.';
  end if;
  v_zone := public.current_zone_id();
  if v_zone is null then
    raise exception 'Aucune zone n''est associée à ce compte.';
  end if;
  new.zone_id := v_zone;
  new.created_by := auth.uid();
  new.is_deleted := false;
  new.deleted_at := null;
  new.deleted_by := null;
  new.deletion_reason := null;

  if new.agent_name is null or btrim(new.agent_name) = '' then
    raise exception 'Le nom de l''agent est obligatoire.';
  end if;
  new.agent_name := btrim(new.agent_name);
  if new.last_name is null or btrim(new.last_name) = '' then
    raise exception 'Le nom de l''élève est obligatoire.';
  end if;
  new.last_name := btrim(new.last_name);
  if new.first_name is null or btrim(new.first_name) = '' then
    raise exception 'Le prénom de l''élève est obligatoire.';
  end if;
  new.first_name := btrim(new.first_name);

  select * into v_campaign from public.campaigns where id = new.campaign_id;
  if v_campaign.id is null then
    raise exception 'Campagne introuvable.';
  end if;
  if not (v_campaign.reopened or (current_date between v_campaign.start_date and v_campaign.end_date)) then
    raise exception 'La campagne « % » n''est pas ouverte : la saisie est impossible.', v_campaign.name;
  end if;

  select zone_id into v_school_zone from public.schools where id = new.school_id;
  if v_school_zone is null then
    raise exception 'Établissement introuvable.';
  end if;
  if v_school_zone <> new.zone_id then
    raise exception 'Cet établissement n''appartient pas à votre zone.';
  end if;

  select requires_series into v_requires from public.classes where id = new.class_id;
  if v_requires is null then
    raise exception 'Classe introuvable.';
  end if;
  if v_requires and new.series_id is null then
    raise exception 'La série est obligatoire pour cette classe.';
  end if;
  if not v_requires then
    new.series_id := null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'label', label, 'field_type', field_type,
      'options', options, 'required', required, 'sort_order', sort_order
    ) order by sort_order, created_at), '[]'::jsonb)
  into v_snapshot
  from public.form_fields
  where campaign_id = new.campaign_id and is_active;
  new.fields_snapshot := v_snapshot;

  for v_field in select * from jsonb_array_elements(v_snapshot) loop
    if (v_field->>'required')::boolean then
      v_val := new.custom_values->>(v_field->>'id');
      if v_val is null or btrim(v_val) = '' then
        raise exception 'Le champ « % » est obligatoire.', v_field->>'label';
      end if;
    end if;
  end loop;

  return new;
end $$;

create trigger validate_student_record_before_insert
before insert on public.student_records
for each row execute function public.validate_student_record();

create trigger audit_campaigns after insert or update or delete on public.campaigns for each row execute function public.audit_trigger();
create trigger audit_form_fields after insert or update or delete on public.form_fields for each row execute function public.audit_trigger();
create trigger audit_student_records after insert or update or delete on public.student_records for each row execute function public.audit_trigger();

-- ===== soft delete RPC =====
create or replace function public.soft_delete_record(_id uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_principal() then
    raise exception 'Seul l''administrateur principal peut supprimer une fiche.';
  end if;
  if _reason is null or btrim(_reason) = '' then
    raise exception 'Le motif de suppression est obligatoire.';
  end if;
  update public.student_records
     set is_deleted = true, deletion_reason = btrim(_reason),
         deleted_by = auth.uid(), deleted_at = now()
   where id = _id and is_deleted = false;
  if not found then
    raise exception 'Fiche introuvable ou déjà supprimée.';
  end if;
end $$;

-- ===== statistics RPCs =====
create or replace function public.stats_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.can_read_all_records() then
    raise exception 'Accès refusé.';
  end if;
  select jsonb_build_object(
    'total_records', (select count(*) from public.student_records where not is_deleted),
    'records_today', (select count(*) from public.student_records where not is_deleted and created_at >= date_trunc('day', now())),
    'open_campaigns', (select count(*) from public.campaigns where reopened or (current_date between start_date and end_date)),
    'active_accounts', (select count(*) from public.profiles where is_active)
  ) into v;
  return v;
end $$;

create or replace function public.stats_by_zone(_campaign_id uuid default null)
returns table (region_name text, zone_name text, zone_code text, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_region uuid;
begin
  if public.can_read_all_records() then
    v_region := null;
  elsif public.is_active() and public.has_role(auth.uid(), 'superviseur') then
    v_region := public.current_region_id();
    if v_region is null then
      raise exception 'Aucune région n''est associée à ce compte.';
    end if;
  else
    raise exception 'Accès refusé.';
  end if;

  return query
  select r.name, z.name, z.code, count(sr.id)
  from public.zones z
  join public.regions r on r.id = z.region_id
  left join public.student_records sr
    on sr.zone_id = z.id and not sr.is_deleted
   and (_campaign_id is null or sr.campaign_id = _campaign_id)
  where v_region is null or z.region_id = v_region
  group by r.name, z.name, z.code
  order by r.name, z.name;
end $$;

create or replace function public.stats_my_zone()
returns table (campaign_id uuid, campaign_name text, today_count bigint, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_zone uuid;
begin
  if not (public.is_active() and public.has_role(auth.uid(), 'zone')) then
    raise exception 'Accès refusé.';
  end if;
  v_zone := public.current_zone_id();
  return query
  select c.id, c.name,
    count(sr.id) filter (where sr.created_at >= date_trunc('day', now())),
    count(sr.id)
  from public.campaigns c
  left join public.student_records sr
    on sr.campaign_id = c.id and sr.zone_id = v_zone and not sr.is_deleted
  where c.reopened or (current_date between c.start_date and c.end_date)
  group by c.id, c.name
  order by c.start_date desc;
end $$;

revoke all on function public.soft_delete_record(uuid, text) from public, anon;
revoke all on function public.stats_overview() from public, anon;
revoke all on function public.stats_by_zone(uuid) from public, anon;
revoke all on function public.stats_my_zone() from public, anon;
revoke all on function public.validate_student_record() from public, anon, authenticated;
grant execute on function public.soft_delete_record(uuid, text) to authenticated;
grant execute on function public.stats_overview() to authenticated;
grant execute on function public.stats_by_zone(uuid) to authenticated;
grant execute on function public.stats_my_zone() to authenticated;