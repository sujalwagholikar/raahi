-- Raahi-only migration. Existing public.profiles and unrelated objects are untouched.
-- Run once in the Supabase SQL editor; public/publishable keys cannot execute DDL.
-- Run once in Supabase SQL editor. Do not expose service-role keys to clients.
begin;
create extension if not exists pgcrypto;
create table public.raahi_profiles(id uuid primary key references auth.users on delete cascade,name text not null,role text not null check(role in ('customer','captain','admin')),approved boolean not null default false,online boolean not null default false,vehicle text not null default '',lat double precision,lng double precision,location_at timestamptz,created_at timestamptz default now());
create table public.raahi_rides(id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.raahi_profiles,captain_id uuid references public.raahi_profiles,pickup text not null,destination text not null,pickup_lat double precision not null,pickup_lng double precision not null,drop_lat double precision not null,drop_lng double precision not null,mode text not null check(mode in ('bike','auto','cab')),fare integer not null check(fare>=0),distance_km numeric not null,status text not null default 'requested' check(status in ('requested','accepted','arrived','in_progress','completed','cancelled')),request_key uuid not null,created_at timestamptz default now(),updated_at timestamptz default now(),unique(customer_id,request_key));
create unique index raahi_one_customer_trip on public.raahi_rides(customer_id) where status not in ('completed','cancelled');
create unique index raahi_one_captain_trip on public.raahi_rides(captain_id) where status not in ('completed','cancelled');
create index raahi_dispatch_queue on public.raahi_rides(status,created_at);
create table public.raahi_ride_codes(ride_id uuid primary key references public.raahi_rides on delete cascade,code text not null);
create table public.raahi_dismissals(ride_id uuid references public.raahi_rides,captain_id uuid references public.raahi_profiles,primary key(ride_id,captain_id));
create table public.raahi_audit(id bigint generated always as identity primary key,actor uuid references public.raahi_profiles,action text not null,entity uuid,detail text,created_at timestamptz default now());
create table public.raahi_safety_alerts(id uuid primary key default gen_random_uuid(),ride_id uuid references public.raahi_rides,actor uuid references public.raahi_profiles,status text default 'open',created_at timestamptz default now());
create function public.raahi_is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from raahi_profiles where id=auth.uid() and role='admin') $$;
create function public.raahi_new_profile() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into raahi_profiles(id,name,role) values(new.id,left(coalesce(new.raw_user_meta_data->>'name','Member'),80),case when new.raw_user_meta_data->>'role'='captain' then 'captain' else 'customer' end);return new;end $$;
create trigger raahi_on_signup after insert on auth.users for each row execute function public.raahi_new_profile();
alter table public.raahi_profiles enable row level security;
alter table public.raahi_rides enable row level security;
alter table public.raahi_ride_codes enable row level security;
alter table public.raahi_dismissals enable row level security;
alter table public.raahi_audit enable row level security;
alter table public.raahi_safety_alerts enable row level security;
create policy raahi_profile_read on public.raahi_profiles for select to authenticated using(id=auth.uid() or raahi_is_admin());
create policy raahi_ride_read on public.raahi_rides for select to authenticated using(customer_id=auth.uid() or captain_id=auth.uid() or raahi_is_admin() or (status='requested' and exists(select 1 from raahi_profiles where id=auth.uid() and role='captain' and approved and online) and not exists(select 1 from raahi_dismissals where ride_id=raahi_rides.id and captain_id=auth.uid())));
create policy raahi_dismissal_read on public.raahi_dismissals for select to authenticated using(captain_id=auth.uid());
create policy raahi_audit_read on public.raahi_audit for select to authenticated using(raahi_is_admin());
create policy raahi_safety_read on public.raahi_safety_alerts for select to authenticated using(actor=auth.uid() or raahi_is_admin());
-- No direct client writes. All mutations go through authorized transactions.
create function public.raahi_book_ride(p_pickup text,p_destination text,p_pickup_lat double precision,p_pickup_lng double precision,p_drop_lat double precision,p_drop_lng double precision,p_mode text,p_request_key uuid) returns public.raahi_rides language plpgsql security definer set search_path=public as $$
declare result raahi_rides; km numeric; price integer; begin
 if not exists(select 1 from raahi_profiles where id=auth.uid() and role='customer') then raise exception 'Customer account required';end if;
 select * into result from raahi_rides where customer_id=auth.uid() and request_key=p_request_key;if found then return result;end if;
 if p_mode not in ('bike','auto','cab') or length(trim(p_pickup)) not between 2 and 200 or length(trim(p_destination)) not between 2 and 200 then raise exception 'Invalid booking';end if;
 if not(p_pickup_lat between -90 and 90 and p_drop_lat between -90 and 90 and p_pickup_lng between -180 and 180 and p_drop_lng between -180 and 180) then raise exception 'Invalid coordinates';end if;
 km:=round((6371*2*asin(sqrt(least(1.0,power(sin(radians(p_drop_lat-p_pickup_lat)/2),2)+cos(radians(p_pickup_lat))*cos(radians(p_drop_lat))*power(sin(radians(p_drop_lng-p_pickup_lng)/2),2))))*1.3)::numeric,2);
 if km<0.1 or km>100 then raise exception 'Trip must be 0.1 to 100 km';end if;
 price:=ceil((case p_mode when 'bike' then 20 when 'auto' then 35 else 60 end)+km*(case p_mode when 'bike' then 8 when 'auto' then 13 else 19 end));
 insert into raahi_rides(customer_id,pickup,destination,pickup_lat,pickup_lng,drop_lat,drop_lng,mode,fare,distance_km,request_key) values(auth.uid(),trim(p_pickup),trim(p_destination),p_pickup_lat,p_pickup_lng,p_drop_lat,p_drop_lng,p_mode,price,km,p_request_key) returning * into result;
 insert into raahi_ride_codes values(result.id,lpad((floor(random()*9000)+1000)::text,4,'0'));
 insert into raahi_audit(actor,action,entity) values(auth.uid(),'ride.created',result.id);return result;end $$;
create function public.raahi_get_start_code(p_ride_id uuid) returns text language plpgsql security definer set search_path=public as $$ declare c text;begin select code into c from raahi_ride_codes c join raahi_rides r on r.id=c.ride_id where r.id=p_ride_id and r.customer_id=auth.uid();if c is null then raise exception 'Not authorized';end if;return c;end $$;
create function public.raahi_transition_ride(p_ride_id uuid,p_action text,p_code text default '') returns public.raahi_rides language plpgsql security definer set search_path=public as $$
declare trip raahi_rides; me raahi_profiles; begin
 select * into me from raahi_profiles where id=auth.uid();select * into trip from raahi_rides where id=p_ride_id for update;
 if me.id is null then raise exception 'Account profile required';end if;
 if trip.id is null then raise exception 'Trip not found';end if;
 if p_action='reject' then
 if me.role!='captain' or not me.approved or not me.online or trip.status!='requested' then raise exception 'Cannot reject';end if;
 insert into raahi_dismissals values(trip.id,me.id) on conflict do nothing;return trip;
 elsif p_action='accept' then
 if me.role!='captain' or not me.approved or not me.online or trip.status!='requested' or exists(select 1 from raahi_dismissals where ride_id=trip.id and captain_id=me.id) then raise exception 'Ride unavailable';end if;
 trip.captain_id:=me.id;trip.status:='accepted';
 elsif p_action='cancel' then
 if not(trip.customer_id=me.id or trip.captain_id=me.id or me.role='admin') or trip.status not in ('requested','accepted','arrived') then raise exception 'Cannot cancel';end if;trip.status:='cancelled';
 else
 if trip.captain_id is distinct from me.id or not me.approved then raise exception 'Assigned approved captain required';end if;
 if p_action='arrive' and trip.status='accepted' then trip.status:='arrived';
 elsif p_action='start' and trip.status='arrived' and exists(select 1 from raahi_ride_codes where ride_id=trip.id and code=p_code) then trip.status:='in_progress';
 elsif p_action='complete' and trip.status='in_progress' then trip.status:='completed';
 else raise exception 'Invalid transition or start code';end if;
 end if;
 update raahi_rides set captain_id=trip.captain_id,status=trip.status,updated_at=now() where id=trip.id returning * into trip;
 insert into raahi_audit(actor,action,entity) values(me.id,'ride.'||p_action,trip.id);return trip;end $$;
create function public.raahi_review_captain(p_captain_id uuid,p_approved boolean,p_reason text default '') returns void language plpgsql security definer set search_path=public as $$ begin
 if not raahi_is_admin() then raise exception 'Admin required';end if;
 if not p_approved and length(trim(p_reason))<3 then raise exception 'Rejection reason required';end if;
 update raahi_profiles set approved=p_approved,online=case when p_approved then online else false end where id=p_captain_id and role='captain';if not found then raise exception 'Captain not found';end if;
 insert into raahi_audit(actor,action,entity,detail) values(auth.uid(),case when p_approved then 'captain.approved' else 'captain.rejected' end,p_captain_id,left(p_reason,500));end $$;
create function public.raahi_set_availability(p_online boolean) returns void language plpgsql security definer set search_path=public as $$ begin update raahi_profiles set online=p_online where id=auth.uid() and role='captain' and approved;if not found then raise exception 'Approved captain required';end if;end $$;
create function public.raahi_update_location(p_lat double precision,p_lng double precision) returns void language plpgsql security definer set search_path=public as $$ begin
 if not(p_lat between -90 and 90 and p_lng between -180 and 180) then raise exception 'Invalid coordinates';end if;
 update raahi_profiles set lat=p_lat,lng=p_lng,location_at=now() where id=auth.uid() and role='captain' and approved;if not found then raise exception 'Approved captain required';end if;end $$;
create function public.raahi_create_sos(p_ride_id uuid) returns uuid language plpgsql security definer set search_path=public as $$ declare result uuid;begin
 if not exists(select 1 from raahi_rides where id=p_ride_id and auth.uid() in (customer_id,captain_id) and status in ('accepted','arrived','in_progress')) then raise exception 'Active assigned ride required';end if;
 insert into raahi_safety_alerts(ride_id,actor) values(p_ride_id,auth.uid()) returning id into result;
 insert into raahi_audit(actor,action,entity) values(auth.uid(),'safety.sos',p_ride_id);return result;end $$;
revoke all on public.raahi_profiles,public.raahi_rides,public.raahi_ride_codes,public.raahi_dismissals,public.raahi_audit,public.raahi_safety_alerts from anon,authenticated;
grant select on raahi_profiles,raahi_rides,raahi_dismissals,raahi_audit,raahi_safety_alerts to authenticated;
revoke execute on function raahi_is_admin(),raahi_new_profile(),raahi_book_ride(text,text,double precision,double precision,double precision,double precision,text,uuid),raahi_get_start_code(uuid),raahi_transition_ride(uuid,text,text),raahi_review_captain(uuid,boolean,text),raahi_set_availability(boolean),raahi_update_location(double precision,double precision),raahi_create_sos(uuid) from public,anon;
grant execute on function raahi_is_admin(),raahi_book_ride(text,text,double precision,double precision,double precision,double precision,text,uuid),raahi_get_start_code(uuid),raahi_transition_ride(uuid,text,text),raahi_review_captain(uuid,boolean,text),raahi_set_availability(boolean),raahi_update_location(double precision,double precision),raahi_create_sos(uuid) to authenticated;
-- Promote an explicitly verified account manually, never through signup metadata:
-- update public.raahi_profiles set role='admin',approved=true where id='<AUTH_USER_UUID>';

create function public.raahi_current_profile() returns setof public.raahi_profiles language sql stable security invoker set search_path=public as $$ select * from raahi_profiles where id=auth.uid() $$;
revoke execute on function public.raahi_current_profile() from public,anon;
grant execute on function public.raahi_current_profile() to authenticated;
-- Only trip participants and administrators may retrieve an assigned captain position.
create function public.raahi_get_tracking(p_ride_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; begin
 if not exists(select 1 from raahi_rides where id=p_ride_id and (customer_id=auth.uid() or captain_id=auth.uid() or raahi_is_admin()) and status in ('accepted','arrived','in_progress')) then raise exception 'Active trip participant required';end if;
 select jsonb_build_object('lat',p.lat,'lng',p.lng,'updated_at',p.location_at,'name',p.name,'vehicle',p.vehicle) into result from raahi_profiles p join raahi_rides r on r.captain_id=p.id where r.id=p_ride_id;
 return result;end $$;
revoke execute on function public.raahi_get_tracking(uuid) from public,anon;
grant execute on function public.raahi_get_tracking(uuid) to authenticated;

commit;
