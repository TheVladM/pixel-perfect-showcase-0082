create type public.order_status as enum ('pending','cancelled','validated','rejected','ready');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null,
  description text,
  is_available boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;

create or replace function public.can_read_orders()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active() and (
    public.has_role(auth.uid(),'admin_principal') or public.has_role(auth.uid(),'admin_logistique')
    or public.has_role(auth.uid(),'dg') or public.has_role(auth.uid(),'promoteur'));
$$;
create or replace function public.can_manage_orders()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active() and (
    public.has_role(auth.uid(),'admin_principal') or public.has_role(auth.uid(),'admin_logistique'));
$$;

create policy products_read on public.products for select to authenticated
  using (public.is_admin_principal() or public.can_read_orders()
         or (public.is_active() and public.has_role(auth.uid(),'zone') and is_available));
create policy products_insert on public.products for insert to authenticated with check (public.is_admin_principal());
create policy products_update on public.products for update to authenticated
  using (public.is_admin_principal()) with check (public.is_admin_principal());

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id),
  agent_name text not null,
  comment text,
  status public.order_status not null default 'pending',
  decided_by uuid,
  decided_role text,
  decided_at timestamptz,
  rejection_reason text,
  pickup_instructions text,
  order_number text unique,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy orders_read on public.orders for select to authenticated
  using (public.can_read_orders()
    or (public.is_active() and public.has_role(auth.uid(),'zone') and zone_id = public.current_zone_id()));

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  product_unit text not null,
  requested_quantity numeric not null default 0,
  retained_quantity numeric not null default 0,
  added_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);
grant select on public.order_items to authenticated;
grant all on public.order_items to service_role;
alter table public.order_items enable row level security;
create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create table public.order_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid,
  actor_role text,
  actor_name text,
  action text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
grant select on public.order_history to authenticated;
grant all on public.order_history to service_role;
alter table public.order_history enable row level security;
create policy order_history_read on public.order_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  type text not null,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy notifications_read_own on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
alter table public.notifications replica identity full;
alter publication supabase_realtime add table public.notifications;

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  order_counter integer not null default 0
);
alter table public.app_settings add column if not exists order_counter integer not null default 0;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
insert into public.app_settings (id) values (true) on conflict do nothing;

-- helpers
create or replace function public.order_items_snapshot(_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'product_name', product_name, 'unit', product_unit,
    'requested_quantity', requested_quantity, 'retained_quantity', retained_quantity,
    'added_by_admin', added_by_admin) order by product_name), '[]'::jsonb)
  from public.order_items where order_id = _order_id;
$$;

create or replace function public.log_order(_order_id uuid, _action text, _before jsonb, _after jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.order_history (order_id, actor_id, actor_role, actor_name, action, before, after)
  values (_order_id, auth.uid(), public.current_user_role()::text,
          (select account_name from public.profiles where id = auth.uid()), _action, _before, _after);
end $$;

create or replace function public.create_order(_zone_id uuid, _agent_name text, _comment text, _items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb; v_prod public.products; v_qty numeric; v_count int := 0;
begin
  if not (public.is_active() and public.has_role(auth.uid(),'zone')) then
    raise exception 'Seuls les comptes zone actifs peuvent passer une commande.';
  end if;
  if _zone_id is null or _zone_id is distinct from public.current_zone_id() then
    raise exception 'Vous ne pouvez commander que pour votre propre zone.';
  end if;
  if _agent_name is null or btrim(_agent_name) = '' then
    raise exception 'Le nom de l''agent est obligatoire.';
  end if;
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then
    raise exception 'La commande doit contenir au moins un produit.';
  end if;
  insert into public.orders (zone_id, agent_name, comment, status, created_by)
  values (_zone_id, btrim(_agent_name), nullif(btrim(coalesce(_comment,'')),''), 'pending', auth.uid())
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(_items) loop
    select * into v_prod from public.products where id = (v_item->>'product_id')::uuid;
    if v_prod.id is null or not v_prod.is_available then
      raise exception 'Un produit demandé n''est pas disponible.';
    end if;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'La quantité de « % » doit être supérieure à zéro.', v_prod.name;
    end if;
    if exists (select 1 from public.order_items where order_id = v_id and product_id = v_prod.id) then
      raise exception 'Le produit « % » apparaît plusieurs fois.', v_prod.name;
    end if;
    insert into public.order_items (order_id, product_id, product_name, product_unit, requested_quantity, retained_quantity)
    values (v_id, v_prod.id, v_prod.name, v_prod.unit, v_qty, v_qty);
    v_count := v_count + 1;
  end loop;
  perform public.log_order(v_id, 'created', null, public.order_items_snapshot(v_id));
  return v_id;
end $$;

create or replace function public.cancel_order(_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if not (public.is_active() and public.has_role(auth.uid(),'zone')) then
    raise exception 'Seul le compte zone qui a passé la commande peut l''annuler.';
  end if;
  select * into v_order from public.orders where id = _order_id for update;
  if v_order.id is null or v_order.zone_id is distinct from public.current_zone_id() then
    raise exception 'Commande introuvable.';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'Cette commande a déjà été traitée et ne peut plus être annulée.';
  end if;
  update public.orders set status = 'cancelled' where id = _order_id;
  perform public.log_order(_order_id, 'cancelled', jsonb_build_object('status','pending'), jsonb_build_object('status','cancelled'));
end $$;

create or replace function public.adjust_order(_order_id uuid, _items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders; v_before jsonb; v_item jsonb; v_prod public.products; v_qty numeric;
  v_ids uuid[] := '{}'; v_pid uuid;
begin
  if not public.can_manage_orders() then
    raise exception 'Seuls les administrateurs principal et logistique peuvent ajuster une commande.';
  end if;
  select * into v_order from public.orders where id = _order_id for update;
  if v_order.id is null then raise exception 'Commande introuvable.'; end if;
  if v_order.status <> 'pending' then
    raise exception 'Cette commande a déjà été traitée par quelqu''un d''autre.';
  end if;
  if _items is null or jsonb_typeof(_items) <> 'array' then
    raise exception 'Liste de produits invalide.';
  end if;
  v_before := public.order_items_snapshot(_order_id);
  for v_item in select * from jsonb_array_elements(_items) loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'retained_quantity')::numeric;
    if v_qty is null or v_qty < 0 then
      raise exception 'Les quantités retenues ne peuvent pas être négatives.';
    end if;
    if v_pid = any(v_ids) then raise exception 'Un produit apparaît plusieurs fois.'; end if;
    v_ids := v_ids || v_pid;
    if exists (select 1 from public.order_items where order_id = _order_id and product_id = v_pid) then
      update public.order_items set retained_quantity = v_qty
       where order_id = _order_id and product_id = v_pid;
    else
      select * into v_prod from public.products where id = v_pid;
      if v_prod.id is null or not v_prod.is_available then
        raise exception 'Un produit ajouté n''est pas disponible au catalogue.';
      end if;
      if v_qty <= 0 then
        raise exception 'La quantité du produit ajouté « % » doit être supérieure à zéro.', v_prod.name;
      end if;
      insert into public.order_items (order_id, product_id, product_name, product_unit, requested_quantity, retained_quantity, added_by_admin)
      values (_order_id, v_prod.id, v_prod.name, v_prod.unit, 0, v_qty, true);
    end if;
  end loop;
  -- removed items: admin-added lines are deleted, original lines are kept with retained 0
  delete from public.order_items where order_id = _order_id and added_by_admin and not (product_id = any(v_ids));
  update public.order_items set retained_quantity = 0
   where order_id = _order_id and not added_by_admin and not (product_id = any(v_ids));
  if not exists (select 1 from public.order_items where order_id = _order_id and retained_quantity > 0) then
    raise exception 'La commande doit conserver au moins un produit avec une quantité supérieure à zéro.';
  end if;
  if v_before is distinct from public.order_items_snapshot(_order_id) then
    perform public.log_order(_order_id, 'adjusted', v_before, public.order_items_snapshot(_order_id));
  end if;
end $$;

create or replace function public.decide_order(_order_id uuid, _decision text, _reason text)
returns text language plpgsql security definer set search_path = public as $$
declare v_order public.orders; v_counter int; v_number text;
begin
  if not public.can_manage_orders() then
    raise exception 'Seuls les administrateurs principal et logistique peuvent valider ou rejeter une commande.';
  end if;
  if _decision not in ('validated','rejected') then raise exception 'Décision invalide.'; end if;
  select * into v_order from public.orders where id = _order_id for update;
  if v_order.id is null then raise exception 'Commande introuvable.'; end if;
  if v_order.status <> 'pending' then
    raise exception 'Cette commande a déjà été traitée par quelqu''un d''autre.';
  end if;
  if _decision = 'rejected' then
    if _reason is null or btrim(_reason) = '' then
      raise exception 'Le motif de rejet est obligatoire.';
    end if;
    update public.orders set status = 'rejected', rejection_reason = btrim(_reason),
      decided_by = auth.uid(), decided_role = public.current_user_role()::text, decided_at = now()
     where id = _order_id;
    perform public.log_order(_order_id, 'rejected', jsonb_build_object('status','pending'),
      jsonb_build_object('status','rejected','reason',btrim(_reason)));
    return null;
  end if;
  if not exists (select 1 from public.order_items where order_id = _order_id and retained_quantity > 0) then
    raise exception 'Impossible de valider une commande sans produit retenu.';
  end if;
  update public.app_settings set order_counter = order_counter + 1 where id returning order_counter into v_counter;
  v_number := 'BC-' || to_char(now(),'YYYY') || '-' || lpad(v_counter::text, 4, '0');
  update public.orders set status = 'validated', order_number = v_number,
    decided_by = auth.uid(), decided_role = public.current_user_role()::text, decided_at = now()
   where id = _order_id;
  perform public.log_order(_order_id, 'validated', jsonb_build_object('status','pending'),
    jsonb_build_object('status','validated','order_number',v_number));
  return v_number;
end $$;

create or replace function public.mark_order_ready(_order_id uuid, _pickup_instructions text)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if not public.can_manage_orders() then
    raise exception 'Seuls les administrateurs principal et logistique peuvent marquer une commande disponible.';
  end if;
  select * into v_order from public.orders where id = _order_id for update;
  if v_order.id is null then raise exception 'Commande introuvable.'; end if;
  if v_order.status <> 'validated' then
    raise exception 'Seule une commande validée peut être marquée disponible.';
  end if;
  if _pickup_instructions is null or btrim(_pickup_instructions) = '' then
    raise exception 'Les instructions de retrait sont obligatoires.';
  end if;
  update public.orders set status = 'ready', pickup_instructions = btrim(_pickup_instructions) where id = _order_id;
  perform public.log_order(_order_id, 'ready', jsonb_build_object('status','validated'),
    jsonb_build_object('status','ready','pickup_instructions',btrim(_pickup_instructions)));
end $$;

-- prevent order_number from ever being changed once set
create or replace function public.guard_order_number()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.order_number is not null and new.order_number is distinct from old.order_number then
    raise exception 'Le numéro de commande ne peut pas être modifié.';
  end if;
  return new;
end $$;
create trigger guard_order_number before update on public.orders for each row execute function public.guard_order_number();

-- notifications from history
create or replace function public.notify_order_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_order public.orders; v_zone public.zones; v_label text; v_title text; v_body text;
begin
  select * into v_order from public.orders where id = new.order_id;
  select * into v_zone from public.zones where id = v_order.zone_id;
  v_label := coalesce(v_order.order_number, 'du ' || to_char(v_order.created_at at time zone 'Africa/Douala','DD/MM/YYYY'));
  if new.action in ('created','cancelled') then
    if new.action = 'created' then
      v_title := 'Nouvelle commande — ' || v_zone.name || ' (' || v_zone.code || ')';
      v_body := 'Passée par ' || v_order.agent_name || '. En attente de traitement.';
    else
      v_title := 'Commande annulée — ' || v_zone.name || ' (' || v_zone.code || ')';
      v_body := 'La commande ' || v_label || ' a été annulée par la zone.';
    end if;
    insert into public.notifications (recipient_id, type, title, body, link)
    select distinct ur.user_id, 'order_' || new.action, v_title, v_body, '/commandes/' || v_order.id
    from public.user_roles ur join public.profiles p on p.id = ur.user_id and p.is_active
    where ur.role in ('admin_principal','admin_logistique')
       or (new.action = 'created' and ur.role in ('dg','promoteur'));
  else
    v_title := case new.action
      when 'adjusted' then 'Commande ajustée'
      when 'validated' then 'Commande validée — ' || v_order.order_number
      when 'rejected' then 'Commande rejetée'
      when 'ready' then 'Commande disponible — ' || coalesce(v_order.order_number,'')
      else 'Commande mise à jour' end;
    v_body := case new.action
      when 'adjusted' then 'Les quantités de votre commande ' || v_label || ' ont été ajustées.'
      when 'validated' then 'Votre commande a été validée sous le numéro ' || v_order.order_number || '.'
      when 'rejected' then 'Votre commande ' || v_label || ' a été rejetée : ' || coalesce(v_order.rejection_reason,'')
      when 'ready' then 'Votre commande ' || v_label || ' est prête à être retirée.'
      else null end;
    insert into public.notifications (recipient_id, type, title, body, link)
    select p.id, 'order_' || new.action, v_title, v_body, '/mes-commandes/' || v_order.id
    from public.profiles p join public.user_roles ur on ur.user_id = p.id and ur.role = 'zone'
    where p.zone_id = v_order.zone_id and p.is_active;
  end if;
  return null;
end $$;
create trigger notify_order_event after insert on public.order_history for each row execute function public.notify_order_event();

create or replace function public.mark_notification_read(_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.notifications set is_read = true where id = _id and recipient_id = auth.uid();
$$;
create or replace function public.mark_all_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set is_read = true where recipient_id = auth.uid() and not is_read;
$$;

create trigger audit_products after insert or update or delete on public.products for each row execute function public.audit_trigger();
create trigger audit_orders after insert or update or delete on public.orders for each row execute function public.audit_trigger();
create trigger audit_order_items after insert or update or delete on public.order_items for each row execute function public.audit_trigger();

revoke execute on function public.can_read_orders(), public.can_manage_orders(), public.order_items_snapshot(uuid),
  public.log_order(uuid,text,jsonb,jsonb), public.create_order(uuid,text,text,jsonb), public.cancel_order(uuid),
  public.adjust_order(uuid,jsonb), public.decide_order(uuid,text,text), public.mark_order_ready(uuid,text),
  public.mark_notification_read(uuid), public.mark_all_read(), public.notify_order_event(), public.guard_order_number()
  from public, anon;
revoke execute on function public.log_order(uuid,text,jsonb,jsonb), public.order_items_snapshot(uuid),
  public.notify_order_event() from authenticated;
grant execute on function public.can_read_orders(), public.can_manage_orders(), public.create_order(uuid,text,text,jsonb),
  public.cancel_order(uuid), public.adjust_order(uuid,jsonb), public.decide_order(uuid,text,text),
  public.mark_order_ready(uuid,text), public.mark_notification_read(uuid), public.mark_all_read() to authenticated;