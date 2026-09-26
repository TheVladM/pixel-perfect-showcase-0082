-- ===== enums =====
create type public.app_role as enum ('admin_principal','admin_logistique','dg','promoteur','superviseur','zone');

-- ===== organisation =====
create table public.regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  region_id uuid not null references public.regions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (region_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_name text not null,
  email text not null,
  region_id uuid references public.regions(id) on delete set null,
  zone_id uuid references public.zones(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.login_logs (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  success boolean not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role public.app_role,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- ===== reference data =====
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zone_id uuid not null references public.zones(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (zone_id, name)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order integer not null default 0,
  requires_series boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.series (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_at timestamptz not null default now()
);

create table public.speakers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role_title text,
  created_at timestamptz not null default now()
);

-- ===== helper functions (SECURITY DEFINER) =====
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.current_user_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = auth.uid() limit 1;
$$;

create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.current_zone_id()
returns uuid language sql stable security definer set search_path = public as $$
  select zone_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_region_id()
returns uuid language sql stable security definer set search_path = public as $$
  select region_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin_principal()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active() and public.has_role(auth.uid(), 'admin_principal');
$$;

create or replace function public.can_read_all_records()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active() and (
    public.has_role(auth.uid(), 'admin_principal')
    or public.has_role(auth.uid(), 'dg')
    or public.has_role(auth.uid(), 'promoteur')
  );
$$;

-- ===== audit trigger =====
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_id uuid;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_id := (to_jsonb(old)->>'id')::uuid;
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_id := (to_jsonb(new)->>'id')::uuid;
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_id := (to_jsonb(new)->>'id')::uuid;
  end if;
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), public.current_user_role(), tg_op, tg_table_name, v_id, v_old, v_new);
  return null;
end $$;

-- ===== login log RPC =====
create or replace function public.log_login_attempt(_email text, _success boolean, _user_agent text)
returns void language plpgsql security definer set search_path = public as $$
declare v_profile uuid;
begin
  select id into v_profile from public.profiles where lower(email) = lower(_email) limit 1;
  insert into public.login_logs (email, profile_id, success, user_agent)
  values (lower(coalesce(_email,'')), v_profile, coalesce(_success,false), _user_agent);
end $$;

-- ===== grants =====
grant select on public.regions to authenticated;
grant select on public.zones to authenticated;
grant select on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.login_logs to authenticated;
grant select on public.audit_log to authenticated;
grant select, insert, update on public.schools to authenticated;
grant select, insert, update on public.classes to authenticated;
grant select, insert, update on public.series to authenticated;
grant select, insert, update on public.speakers to authenticated;
grant all on public.regions, public.zones, public.profiles, public.user_roles,
  public.login_logs, public.audit_log, public.schools, public.classes,
  public.series, public.speakers to service_role;
grant execute on function public.log_login_attempt(text, boolean, text) to anon, authenticated;

-- ===== RLS =====
alter table public.regions enable row level security;
alter table public.zones enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.login_logs enable row level security;
alter table public.audit_log enable row level security;
alter table public.schools enable row level security;
alter table public.classes enable row level security;
alter table public.series enable row level security;
alter table public.speakers enable row level security;

create policy "regions_read" on public.regions for select to authenticated using (public.is_active());
create policy "zones_read" on public.zones for select to authenticated using (public.is_active());

create policy "profiles_read_own" on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_read_all_records() or (public.is_active() and public.has_role(auth.uid(),'superviseur') and region_id = public.current_region_id()));

create policy "user_roles_read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.can_read_all_records());

create policy "login_logs_read" on public.login_logs for select to authenticated
  using (public.is_admin_principal());

create policy "audit_log_read" on public.audit_log for select to authenticated
  using (public.is_admin_principal());

create policy "schools_read" on public.schools for select to authenticated using (public.is_active());
create policy "schools_write" on public.schools for insert to authenticated with check (public.is_admin_principal());
create policy "schools_update" on public.schools for update to authenticated using (public.is_admin_principal()) with check (public.is_admin_principal());

create policy "classes_read" on public.classes for select to authenticated using (public.is_active());
create policy "classes_write" on public.classes for insert to authenticated with check (public.is_admin_principal());
create policy "classes_update" on public.classes for update to authenticated using (public.is_admin_principal()) with check (public.is_admin_principal());

create policy "series_read" on public.series for select to authenticated using (public.is_active());
create policy "series_write" on public.series for insert to authenticated with check (public.is_admin_principal());
create policy "series_update" on public.series for update to authenticated using (public.is_admin_principal()) with check (public.is_admin_principal());

create policy "speakers_read" on public.speakers for select to authenticated using (public.is_active());
create policy "speakers_write" on public.speakers for insert to authenticated with check (public.is_admin_principal());
create policy "speakers_update" on public.speakers for update to authenticated using (public.is_admin_principal()) with check (public.is_admin_principal());

-- ===== audit triggers =====
create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.audit_trigger();
create trigger audit_user_roles after insert or update or delete on public.user_roles for each row execute function public.audit_trigger();
create trigger audit_schools after insert or update or delete on public.schools for each row execute function public.audit_trigger();
create trigger audit_classes after insert or update or delete on public.classes for each row execute function public.audit_trigger();
create trigger audit_series after insert or update or delete on public.series for each row execute function public.audit_trigger();
create trigger audit_speakers after insert or update or delete on public.speakers for each row execute function public.audit_trigger();
create trigger audit_regions after insert or update or delete on public.regions for each row execute function public.audit_trigger();
create trigger audit_zones after insert or update or delete on public.zones for each row execute function public.audit_trigger();

-- ===== seeds =====
insert into public.regions (name, code) values
  ('Centre-Sud-Est','CSE'), ('Ouest','OUE'), ('Littoral','LIT'), ('Nord','NOR'), ('Adamaoua','ADA');

insert into public.zones (name, code, region_id)
select z.name, z.code, r.id from (values
  ('Yaoundé Zone 1','YDE-Z1','CSE'),
  ('Yaoundé Zone 2','YDE-Z2','CSE'),
  ('Yaoundé Zone 3','YDE-Z3','CSE'),
  ('Yaoundé Zone 4','YDE-Z4','CSE'),
  ('Yaoundé Zone 5','YDE-Z5','CSE'),
  ('Zone Est','EST','CSE'),
  ('Zone Sud','SUD','CSE'),
  ('Ouest Zone 1','OUE-Z1','OUE'),
  ('Ouest Zone 2','OUE-Z2','OUE'),
  ('Ouest Zone 3','OUE-Z3','OUE'),
  ('Ouest Zone 4','OUE-Z4','OUE'),
  ('Littoral Zone 1','LIT-Z1','LIT'),
  ('Littoral Zone 2','LIT-Z2','LIT'),
  ('Littoral Zone 3','LIT-Z3','LIT'),
  ('Littoral Zone 4','LIT-Z4','LIT'),
  ('Littoral Zone 5','LIT-Z5','LIT'),
  ('Zone Nord','NOR','NOR'),
  ('Zone Adamaoua','ADA','ADA')
) as z(name, code, region_code)
join public.regions r on r.code = z.region_code;

insert into public.classes (label, sort_order, requires_series) values
  ('6e',1,false), ('5e',2,false), ('4e',3,false), ('3e',4,false),
  ('2nde',5,true), ('1ère',6,true), ('Terminale',7,true);

insert into public.series (label) values ('A'), ('C'), ('D'), ('TI');