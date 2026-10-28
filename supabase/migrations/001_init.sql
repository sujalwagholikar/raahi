-- FreshCart starter schema for Supabase Postgres.
-- Run this file in Supabase SQL Editor before deploying the storefront.
-- All prices are stored as numeric INR amounts. The public can only create orders
-- through create_store_order(), which calculates prices and stock from the database.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.products (
  sku text primary key check (sku ~ '^[A-Za-z0-9_-]{1,40}$'),
  name text not null check (length(trim(name)) between 1 and 160),
  category text not null,
  price numeric(10,2) not null check (price > 0),
  original_price numeric(10,2) not null check (original_price > 0),
  unit text not null default '1 unit',
  rating numeric(2,1) not null default 4.8 check (rating >= 0 and rating <= 5),
  badge text not null default '',
  featured boolean not null default false,
  stock integer not null default 0 check (stock >= 0),
  image_url text not null default '',
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  phone text not null,
  email text,
  address_line text not null,
  city text not null,
  pincode text not null check (pincode ~ '^[0-9]{6}$'),
  payment_method text not null default 'cod' check (payment_method = 'cod'),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  shipping_fee numeric(10,2) not null check (shipping_fee >= 0),
  total numeric(10,2) not null check (total = subtotal + shipping_fee),
  status text not null default 'pending' check (status in ('pending','confirmed','packed','out_for_delivery','delivered','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_sku text not null references public.products(sku),
  product_name text not null,
  image_url text not null default '',
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price > 0),
  line_total numeric(10,2) not null check (line_total = unit_price * quantity),
  created_at timestamptz not null default now()
);

create index if not exists products_active_category_idx on public.products(active, category);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

-- The security-definer helper permits RLS policies to check the allowlist without exposing it.
create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  );
$$;
revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to anon, authenticated;

alter table public.products enable row level security;
alter table public.admin_users enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists products_read_active_or_admin on public.products;
create policy products_read_active_or_admin on public.products
  for select to anon, authenticated
  using (active = true or public.is_store_admin());

drop policy if exists products_admin_update on public.products;
create policy products_admin_update on public.products
  for update to authenticated
  using (public.is_store_admin()) with check (public.is_store_admin());

drop policy if exists admin_users_read_self on public.admin_users;
create policy admin_users_read_self on public.admin_users
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders
  for select to authenticated
  using (public.is_store_admin());

drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders
  for update to authenticated
  using (public.is_store_admin()) with check (public.is_store_admin());

drop policy if exists order_items_admin_read on public.order_items;
create policy order_items_admin_read on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and public.is_store_admin()
  ));

-- Explicit grants: public users can read active products, but cannot directly insert orders
-- or read customer data. Orders are created transactionally through the RPC below.
grant usage on schema public to anon, authenticated;
grant select on public.products to anon, authenticated;
grant select, update on public.products to authenticated;
grant select on public.admin_users to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;

create or replace function public.create_store_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := trim(coalesce(payload->>'customer_name',''));
  v_phone text := trim(coalesce(payload->>'phone',''));
  v_email text := nullif(trim(coalesce(payload->>'email','')), '');
  v_address text := trim(coalesce(payload->>'address_line',''));
  v_city text := trim(coalesce(payload->>'city',''));
  v_pincode text := trim(coalesce(payload->>'pincode',''));
  v_item record;
  v_product public.products%rowtype;
  v_subtotal numeric(10,2) := 0;
  v_shipping numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_order_id uuid;
  v_order_number text;
  v_item_count integer;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid order payload';
  end if;
  if length(v_name) not between 1 and 90 or length(v_phone) not between 7 and 20
     or length(v_address) not between 1 and 180 or length(v_city) not between 1 and 80
     or v_pincode !~ '^[0-9]{6}$' then
    raise exception using errcode = '22023', message = 'Please check your delivery details';
  end if;
  if v_email is not null and (length(v_email) > 180 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception using errcode = '22023', message = 'Please provide a valid email address';
  end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Your cart is empty';
  end if;
  v_item_count := jsonb_array_length(payload->'items');
  if v_item_count < 1 or v_item_count > 30 then
    raise exception using errcode = '22023', message = 'Cart must contain between 1 and 30 product lines';
  end if;
  if exists (
    select 1 from jsonb_array_elements(payload->'items') as e(value)
    where jsonb_typeof(e.value) <> 'object'
       or coalesce(e.value->>'sku','') !~ '^[A-Za-z0-9_-]{1,40}$'
       or coalesce(e.value->>'quantity','') !~ '^[0-9]{1,2}$'
       or coalesce((case when coalesce(e.value->>'quantity','') ~ '^[0-9]{1,2}$' then e.value->>'quantity' else '0' end)::integer,0) not between 1 and 99
  ) then
    raise exception using errcode = '22023', message = 'A product or quantity in your cart is invalid';
  end if;

  -- Lock rows in SKU order. Duplicate SKUs are grouped before stock validation.
  for v_item in
    select e.value->>'sku' as sku, sum((e.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(payload->'items') as e(value)
    group by e.value->>'sku'
    order by e.value->>'sku'
  loop
    select * into v_product from public.products
      where sku = v_item.sku and active = true
      for update;
    if not found then
      raise exception using errcode = '22023', message = 'One of the products is no longer available';
    end if;
    if v_product.stock < v_item.quantity then
      raise exception using errcode = '22023', message = 'Not enough stock for ' || v_product.name;
    end if;
    v_subtotal := v_subtotal + (v_product.price * v_item.quantity);
  end loop;

  v_shipping := case when v_subtotal >= 499 then 0 else 39 end;
  v_total := v_subtotal + v_shipping;
  v_order_number := 'FC-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.orders (
    order_number, customer_name, phone, email, address_line, city, pincode,
    payment_method, subtotal, shipping_fee, total, status
  ) values (
    v_order_number, v_name, v_phone, v_email, v_address, v_city, v_pincode,
    'cod', v_subtotal, v_shipping, v_total, 'pending'
  ) returning id into v_order_id;

  for v_item in
    select e.value->>'sku' as sku, sum((e.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(payload->'items') as e(value)
    group by e.value->>'sku'
    order by e.value->>'sku'
  loop
    select * into v_product from public.products where sku = v_item.sku;
    insert into public.order_items (order_id, product_sku, product_name, image_url, quantity, unit_price, line_total)
    values (v_order_id, v_product.sku, v_product.name, v_product.image_url, v_item.quantity, v_product.price, v_product.price * v_item.quantity);
    update public.products set stock = stock - v_item.quantity where sku = v_item.sku;
  end loop;

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'shipping_fee', v_shipping,
    'total', v_total,
    'status', 'pending',
    'payment_method', 'cod'
  );
end;
$$;

revoke all on function public.create_store_order(jsonb) from public;
grant execute on function public.create_store_order(jsonb) to anon, authenticated;

-- Keep updated_at trustworthy when admins edit inventory or order status.
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- Demo catalog. Safe to run repeatedly; prices/order amounts remain database-authoritative.
insert into public.products (sku,name,category,price,original_price,unit,rating,badge,featured,stock,image_url,description,active) values
('FC1001','Avocado, ripe & ready','Fruits & Veg',129,159,'2 pieces',4.9,'BESTSELLER',true,30,'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=640&q=85','Creamy, buttery avocados picked at just the right time. Lovely on toast, in salads, or straight from the skin.',true),
('FC1002','Sweet strawberries','Fruits & Veg',149,179,'250 g',4.8,'FRESH PICK',true,22,'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&w=640&q=85','Bright, sweet, and delightfully juicy berries for breakfast bowls, desserts, and happy little snacks.',true),
('FC1003','Farm greens mix','Fruits & Veg',89,109,'200 g',4.7,'LOCAL LOVE',true,28,'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=640&q=85','Crisp leaves and tender greens, washed and ready for a fresh, feel-good salad.',true),
('FC1004','Cold-pressed orange juice','Dairy & Eggs',119,139,'500 ml',4.8,'NO ADDED SUGAR',true,18,'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=640&q=85','Sunny oranges, gently pressed for a bright, refreshing start to your day.',true),
('FC1005','Creamy farm milk','Dairy & Eggs',68,72,'500 ml',4.9,'DAILY ESSENTIAL',true,45,'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=640&q=85','Fresh, creamy milk for your morning coffee, cereal, and everything in between.',true),
('FC1006','Free-range brown eggs','Dairy & Eggs',99,119,'6 eggs',4.8,'FARM FRESH',false,35,'https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=640&q=85','A breakfast staple from happy hens. Great scrambled, poached, baked, or boiled.',true),
('FC1007','Sourdough country loaf','Bakery',159,189,'450 g',4.9,'BAKED TODAY',true,14,'https://images.unsplash.com/photo-1585478259715-876acc5be8eb?auto=format&fit=crop&w=640&q=85','A golden crust, an airy middle, and that lovely slow-fermented tang. Best shared warm.',true),
('FC1008','Butter croissants','Bakery',119,149,'2 pieces',4.7,'BUTTERY JOY',false,16,'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=640&q=85','Flaky, golden layers with a delicate butter flavour. Your slow morning just got better.',true),
('FC1009','Organic rolled oats','Pantry',189,219,'500 g',4.8,'PANTRY HERO',false,40,'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=640&q=85','Wholesome rolled oats for overnight oats, warm bowls, cookies, and homemade granola.',true),
('FC1010','Creamy peanut butter','Pantry',229,269,'340 g',4.8,'NO FUSS',false,25,'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?auto=format&fit=crop&w=640&q=85','Roasted peanuts, smooth texture, and a rich nutty flavour. Spread the good stuff.',true),
('FC1011','Sea-salt potato crisps','Snacks',79,99,'120 g',4.6,'SNACK O’CLOCK',false,32,'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=640&q=85','Crispy, satisfying, and lightly salted. A little treat for your much-deserved break.',true),
('FC1012','Dark chocolate bites','Snacks',149,179,'150 g',4.9,'LITTLE LUXURY',false,21,'https://images.unsplash.com/photo-1548907040-4d42bfc9f4c5?auto=format&fit=crop&w=640&q=85','Deep cocoa goodness in snackable bites. Perfect with a cup of tea or a quiet moment.',true)
on conflict (sku) do update set
  name = excluded.name, category = excluded.category, original_price = excluded.original_price,
  unit = excluded.unit, rating = excluded.rating, badge = excluded.badge, featured = excluded.featured,
  image_url = excluded.image_url, description = excluded.description;
