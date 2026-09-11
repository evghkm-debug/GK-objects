begin;
create table public.gk_workspaces (id uuid primary key default gen_random_uuid(), name text not null);
create table public.gk_members (
  workspace_id uuid not null references public.gk_workspaces(id),
  user_id uuid not null references auth.users(id),
  display_name text not null,
  primary key(workspace_id,user_id)
);
create table public.gk_objects (
  workspace_id uuid not null references public.gk_workspaces(id),
  id text not null check (id ~ '^[a-zA-Z0-9_-]{1,150}$'),
  payload jsonb not null,
  revision bigint not null default 1,
  operation_id uuid not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,id)
);
create table public.gk_history (
  workspace_id uuid not null,
  object_id text not null,
  revision bigint not null,
  payload jsonb not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,object_id,revision),
  foreign key(workspace_id,object_id) references public.gk_objects(workspace_id,id)
);
alter table public.gk_workspaces enable row level security;
alter table public.gk_members enable row level security;
alter table public.gk_objects enable row level security;
alter table public.gk_history enable row level security;
revoke all on public.gk_workspaces,public.gk_members,public.gk_objects,public.gk_history from anon,authenticated;
grant select on public.gk_workspaces,public.gk_members,public.gk_objects,public.gk_history to authenticated;

create function public.gk_is_member(w uuid) returns boolean language sql stable security definer
set search_path = '' as $$
  select exists(select 1 from public.gk_members where workspace_id=w and user_id=auth.uid());
$$;
revoke all on function public.gk_is_member(uuid) from public;
grant execute on function public.gk_is_member(uuid) to authenticated;
create policy gk_workspace_read on public.gk_workspaces for select to authenticated using(public.gk_is_member(id));
create policy gk_member_read on public.gk_members for select to authenticated using(public.gk_is_member(workspace_id));
create policy gk_object_read on public.gk_objects for select to authenticated using(public.gk_is_member(workspace_id));
create policy gk_history_read on public.gk_history for select to authenticated using(public.gk_is_member(workspace_id));

-- Sole write entrypoint: membership, optimistic revision, idempotency and history in one transaction.
create function public.gk_save_object(p_workspace uuid,p_id text,p_payload jsonb,p_base_revision bigint,p_operation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_row public.gk_objects; next_revision bigint; actor uuid:=auth.uid(); photo text;
begin
  if actor is null or not public.gk_is_member(p_workspace) then raise exception 'Access denied' using errcode='42501'; end if;
  if p_id is null or p_id !~ '^[a-zA-Z0-9_-]{1,150}$' or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or p_payload->>'id' is distinct from p_id or p_base_revision is null or p_base_revision<0 or p_operation is null
    or octet_length(p_payload::text)>1048576 then raise exception 'Invalid object'; end if;
  if jsonb_typeof(coalesce(p_payload#>'{survey,photos}','{}'::jsonb))<>'object' then raise exception 'Invalid photos'; end if;
  for photo in select value from jsonb_each_text(coalesce(p_payload#>'{survey,photos}','{}'::jsonb)) loop
    if photo !~ '^gk-photo:[0-9a-f]{64}$' then raise exception 'Invalid photo reference'; end if;
    if not exists(select 1 from storage.objects where bucket_id='gk-photos'
      and name=p_workspace::text||'/photos/'||substring(photo from 10)||'.jpg') then raise exception 'Photo not uploaded'; end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace::text||'/'||p_id,0));
  select * into current_row from public.gk_objects where workspace_id=p_workspace and id=p_id for update;
  if found then
    if current_row.operation_id=p_operation or current_row.payload=p_payload then
      return jsonb_build_object('ok',true,'row',to_jsonb(current_row));
    end if;
    if current_row.revision<>p_base_revision then return jsonb_build_object('ok',false,'conflict',true,'row',to_jsonb(current_row)); end if;
    next_revision:=current_row.revision+1;
    update public.gk_objects set payload=p_payload,revision=next_revision,operation_id=p_operation,updated_by=actor,updated_at=clock_timestamp()
      where workspace_id=p_workspace and id=p_id returning * into current_row;
  else
    if p_base_revision<>0 then raise exception 'Missing base revision'; end if;
    next_revision:=1;
    insert into public.gk_objects(workspace_id,id,payload,revision,operation_id,updated_by)
      values(p_workspace,p_id,p_payload,next_revision,p_operation,actor) returning * into current_row;
  end if;
  insert into public.gk_history(workspace_id,object_id,revision,payload,updated_by,updated_at)
    values(p_workspace,p_id,next_revision,p_payload,actor,current_row.updated_at);
  return jsonb_build_object('ok',true,'row',to_jsonb(current_row));
end;
$$;
revoke all on function public.gk_save_object(uuid,text,jsonb,bigint,uuid) from public;
grant execute on function public.gk_save_object(uuid,text,jsonb,bigint,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gk-photos','gk-photos',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy gk_photo_read on storage.objects for select to authenticated
using(bucket_id='gk-photos' and exists(select 1 from public.gk_members m where m.user_id=auth.uid()
  and m.workspace_id::text=(storage.foldername(name))[1]));
create policy gk_photo_insert on storage.objects for insert to authenticated
with check(bucket_id='gk-photos' and name ~ '^[0-9a-f-]{36}/photos/[0-9a-f]{64}\.jpg$'
  and exists(select 1 from public.gk_members m where m.user_id=auth.uid() and m.workspace_id::text=(storage.foldername(name))[1]));
-- Photos are immutable. No browser UPDATE/DELETE policies; previous revisions remain recoverable.
commit;

-- Deployed as follow-up migration gk_private_functions; also required on fresh installs.
begin;
create schema if not exists gk_private;
revoke all on schema gk_private from public,anon;
grant usage on schema gk_private to authenticated;
alter function public.gk_is_member(uuid) set schema gk_private;
alter function public.gk_save_object(uuid,text,jsonb,bigint,uuid) set schema gk_private;
revoke all on all functions in schema gk_private from public,anon;
grant execute on function gk_private.gk_is_member(uuid),gk_private.gk_save_object(uuid,text,jsonb,bigint,uuid) to authenticated;
create function public.gk_is_member(w uuid) returns boolean language sql stable security invoker set search_path='' as $$ select gk_private.gk_is_member(w); $$;
create function public.gk_save_object(p_workspace uuid,p_id text,p_payload jsonb,p_base_revision bigint,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$ select gk_private.gk_save_object(p_workspace,p_id,p_payload,p_base_revision,p_operation); $$;
revoke all on function public.gk_is_member(uuid),public.gk_save_object(uuid,text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.gk_is_member(uuid),public.gk_save_object(uuid,text,jsonb,bigint,uuid) to authenticated;
commit;
