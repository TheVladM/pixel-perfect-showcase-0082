alter table public.orders add column verification_token uuid unique, add column pdf_path text;

create or replace function public.set_verification_token()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'validated' and old.status <> 'validated' and new.verification_token is null then
    new.verification_token := gen_random_uuid();
  end if;
  if old.verification_token is not null and new.verification_token is distinct from old.verification_token then
    raise exception 'Le jeton de vérification ne peut pas être modifié.';
  end if;
  if old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path then
    raise exception 'Le bon de commande PDF ne peut pas être remplacé.';
  end if;
  return new;
end $$;
create trigger set_verification_token before update on public.orders
  for each row execute function public.set_verification_token();

create or replace function public.verify_order_token(_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uuid uuid; v jsonb;
begin
  begin v_uuid := _token::uuid; exception when others then return null; end;
  select jsonb_build_object(
    'order_number', o.order_number,
    'zone_name', z.name,
    'region_name', r.name,
    'validated_at', o.decided_at,
    'decided_role', o.decided_role,
    'status', o.status,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'designation', i.product_name, 'unit', i.product_unit, 'quantity', i.retained_quantity)
        order by i.product_name)
      from public.order_items i where i.order_id = o.id and i.retained_quantity > 0), '[]'::jsonb))
  into v
  from public.orders o join public.zones z on z.id = o.zone_id join public.regions r on r.id = z.region_id
  where o.verification_token = v_uuid and o.status in ('validated','ready');
  return v;
end $$;
revoke execute on function public.verify_order_token(text) from public;
grant execute on function public.verify_order_token(text) to anon, authenticated;
revoke execute on function public.set_verification_token() from public, anon, authenticated;