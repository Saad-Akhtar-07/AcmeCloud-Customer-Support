create table if not exists public.customers (
  customer_id text primary key,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  preferred_contact_method text not null default 'Email' check (
    preferred_contact_method in ('Email', 'Phone', 'WhatsApp')
  ),
  customer_since date not null default current_date,
  account_type text not null check (
    account_type in ('Individual', 'Business')
  ),
  account_status text not null default 'Active' check (
    account_status in ('Active', 'Suspended', 'Closed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  customer_id text primary key
    references public.customers(customer_id) on delete cascade,
  plan text not null check (
    plan in ('Free', 'Pro', 'Business')
  ),
  payment_status text not null check (
    payment_status in ('Pending', 'Paid', 'Failed')
  ),
  activation_status text not null check (
    activation_status in ('Pending', 'Active', 'Failed')
  ),
  started_at timestamptz
);

create table if not exists public.account_events (
  id bigint generated always as identity primary key,
  event_code text unique,
  customer_id text not null
    references public.customers(customer_id) on delete cascade,
  event_type text not null,
  details text,
  occurred_at timestamptz not null default now()
);

create index if not exists account_events_customer_time_idx
  on public.account_events(customer_id, occurred_at desc);
