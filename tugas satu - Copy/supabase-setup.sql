create table if not exists public.admin_users (
    user_id uuid primary key references auth.users (id) on delete cascade
);

create table if not exists public.guest_book (
    id uuid primary key default gen_random_uuid(),
    nama text not null check (char_length(trim(nama)) between 1 and 80),
    instansi text not null check (char_length(trim(instansi)) between 1 and 100),
    alamat text not null default '' check (char_length(alamat) <= 160),
    no_ponsel text not null default '' check (char_length(no_ponsel) <= 20),
    status text not null default 'Hadir' check (status in ('Hadir', 'Izin', 'Menunggu')),
    pesan text not null default '' check (char_length(pesan) <= 500),
    waktu timestamptz not null default now(),
    ticket_token uuid not null default gen_random_uuid(),
    checked_in_at timestamptz
);

alter table public.guest_book
    add column if not exists ticket_token uuid not null default gen_random_uuid(),
    add column if not exists checked_in_at timestamptz;

create unique index if not exists guest_book_ticket_token_key
    on public.guest_book (ticket_token);

alter table public.admin_users enable row level security;
alter table public.guest_book enable row level security;

drop policy if exists "Admins can read their own admin record" on public.admin_users;
create policy "Admins can read their own admin record"
    on public.admin_users for select to authenticated
    using (user_id = (select auth.uid()));

drop policy if exists "Anyone can submit a guest entry" on public.guest_book;
create policy "Anyone can submit a guest entry"
    on public.guest_book for insert to anon, authenticated
    with check (
        status = 'Hadir'
        or exists (
            select 1 from public.admin_users
            where admin_users.user_id = (select auth.uid())
        )
    );

drop policy if exists "Admins can read guest entries" on public.guest_book;
create policy "Admins can read guest entries"
    on public.guest_book for select to authenticated
    using (
        exists (
            select 1 from public.admin_users
            where admin_users.user_id = (select auth.uid())
        )
    );

drop policy if exists "Admins can update guest entries" on public.guest_book;
create policy "Admins can update guest entries"
    on public.guest_book for update to authenticated
    using (
        exists (
            select 1 from public.admin_users
            where admin_users.user_id = (select auth.uid())
        )
    )
    with check (
        exists (
            select 1 from public.admin_users
            where admin_users.user_id = (select auth.uid())
        )
    );

drop policy if exists "Admins can delete guest entries" on public.guest_book;
create policy "Admins can delete guest entries"
    on public.guest_book for delete to authenticated
    using (
        exists (
            select 1 from public.admin_users
            where admin_users.user_id = (select auth.uid())
        )
    );

grant usage on schema public to anon, authenticated;
revoke insert on public.guest_book from anon, authenticated;
grant insert (nama, instansi, alamat, no_ponsel, status, pesan, ticket_token)
    on public.guest_book to anon, authenticated;
grant select on public.guest_book to authenticated;
grant update, delete on public.guest_book to authenticated;
grant select on public.admin_users to authenticated;

create or replace function public.validate_guest_ticket(p_ticket_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_guest_name text;
    v_checked_in_at timestamptz;
begin
    if auth.uid() is null or not exists (
        select 1
        from public.admin_users
        where admin_users.user_id = auth.uid()
    ) then
        raise exception 'Hanya admin terdaftar yang dapat memvalidasi tiket.';
    end if;

    update public.guest_book
    set checked_in_at = now(), status = 'Hadir'
    where guest_book.ticket_token = p_ticket_token
      and guest_book.checked_in_at is null
    returning guest_book.nama, guest_book.checked_in_at
    into v_guest_name, v_checked_in_at;

    if found then
        return jsonb_build_object(
            'status', 'checked_in',
            'guest_name', v_guest_name,
            'checked_in_at', v_checked_in_at
        );
    end if;

    if exists (
        select 1
        from public.guest_book
        where guest_book.ticket_token = p_ticket_token
    ) then
        return jsonb_build_object('status', 'already_used');
    end if;

    return jsonb_build_object('status', 'invalid');
end;
$$;

revoke all on function public.validate_guest_ticket(uuid) from public, anon;
grant execute on function public.validate_guest_ticket(uuid) to authenticated;
