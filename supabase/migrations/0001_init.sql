-- School Assessments Tool — initial Supabase schema (PREP — not yet applied).
-- Mirrors the localStorage tables in lib/store.ts 1:1 so the data layer can
-- swap backends without changing app code. Multi-tenant from day one:
-- every business row carries tenant_id and RLS restricts access to tenant
-- members. Run in the Supabase SQL editor (or via CLI) on the NEW project
-- dedicated to this tool — never on the Code Red Hub project.

create extension if not exists "pgcrypto";

-- ── Tenancy & membership ────────────────────────────────────────────────
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'assessor' check (role in ('owner', 'admin', 'assessor')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create or replace function public.my_tenant_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select tenant_id from public.tenant_members where user_id = auth.uid();
$$;

-- ── Business tables (ids stay client-generated text, as in the app) ────
create table if not exists public.assessments (
  id text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_name text not null,
  campus text not null default '',
  template_id text not null,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'completed')),
  assessor_ids text[] not null default '{}',
  lead_assessor_id text,
  scheduled_id text,
  focus_notes text not null default '',
  cover jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists assessments_tenant_idx on public.assessments (tenant_id, created_at desc);

create table if not exists public.responses (
  id text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  assessment_id text not null references public.assessments (id) on delete cascade,
  checkpoint_key text not null,
  answer text check (answer in ('yes', 'no', 'na')),
  risk text check (risk in ('low', 'moderate', 'high')),
  note text not null default '',
  photo_ref text not null default '',
  photo_ids text[] not null default '{}'
);
create index if not exists responses_assessment_idx on public.responses (assessment_id);
create index if not exists responses_tenant_idx on public.responses (tenant_id);

create table if not exists public.findings (
  id text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  assessment_id text not null references public.assessments (id) on delete cascade,
  checkpoint_key text not null,
  gap_text text not null,
  risk text not null check (risk in ('low', 'moderate', 'high')),
  note text not null default '',
  recommendation text not null default '',
  photo_ids text[] not null default '{}',
  -- Corrective-action loop (added with the findings workflow upgrade):
  ca_status text not null default 'open' check (ca_status in ('open', 'in_progress', 'corrected', 'verified')),
  ca_owner text not null default '',
  ca_due_date date,
  ca_verified_at timestamptz,
  ca_verified_by text not null default ''
);
create index if not exists findings_assessment_idx on public.findings (assessment_id);
create index if not exists findings_tenant_idx on public.findings (tenant_id, ca_status);

create table if not exists public.equipment (
  id text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  assessment_id text not null references public.assessments (id) on delete cascade,
  finding_id text references public.findings (id) on delete set null,
  name text not null,
  detail text not null default '',
  priority text not null check (priority in ('low', 'moderate', 'high'))
);
create index if not exists equipment_assessment_idx on public.equipment (assessment_id);

create table if not exists public.reports (
  id text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  assessment_id text not null, -- may be "group:<ids>" for combined reports
  kind text not null check (kind in ('aar', 'findings', 'recommendations')),
  title text not null default '',
  markdown text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists reports_tenant_idx on public.reports (tenant_id, assessment_id);

create table if not exists public.assessors (
  id text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  title text not null default '',
  photo text, -- data URL until Storage migration; then object path
  phone text not null default '',
  email text not null default '',
  clearance_status text not null default 'pending' check (clearance_status in ('current', 'pending', 'expired')),
  clearance_date date,
  clearance_expiry date,
  clearance_letter text, -- data URL until Storage migration
  notes text not null default ''
);
create index if not exists assessors_tenant_idx on public.assessors (tenant_id);

create table if not exists public.schedules (
  id text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_name text not null,
  campus text not null default '',
  date date not null,
  template_id text not null,
  assessor_id text,
  focus_notes text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  assessment_id text
);
create index if not exists schedules_tenant_idx on public.schedules (tenant_id, date);

create table if not exists public.clery_reports (
  id text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  institution text not null,
  report_year int not null,
  preparer_name text not null default '',
  preparer_title text not null default '',
  stats jsonb not null default '[]'::jsonb,
  disclosures jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.policy_docs (
  id text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null,
  category text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.custom_templates (
  id text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  description text not null default '',
  domains jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fsl_records (
  id text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  assessment_id text not null references public.assessments (id) on delete cascade,
  federal_facility boolean not null default false,
  mission int not null check (mission between 1 and 4),
  symbolism int not null check (symbolism between 1 and 4),
  threat int not null check (threat between 1 and 4),
  population_count int,
  size_sqft int,
  symbolism_land_bonus boolean not null default false,
  symbolism_land_rationale text not null default '',
  factor_notes jsonb not null default '{}'::jsonb,
  intangible_adj int not null default 0 check (intangible_adj between -1 and 1),
  intangible_justification text not null default '',
  total int not null,
  preliminary text not null,
  final text not null,
  assessed_by text not null default '',
  assessed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists fsl_assessment_idx on public.fsl_records (assessment_id);

-- Photo metadata; binaries live in the Storage bucket "evidence".
create table if not exists public.photos (
  id text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  storage_path text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);

-- ── Row Level Security: tenant isolation on every business table ───────
do $$
declare t text;
begin
  foreach t in array array[
    'assessments', 'responses', 'findings', 'equipment', 'reports',
    'assessors', 'schedules', 'clery_reports', 'policy_docs',
    'custom_templates', 'fsl_records', 'photos'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I
         using (tenant_id in (select public.my_tenant_ids()))
         with check (tenant_id in (select public.my_tenant_ids()))', t);
  end loop;
end $$;

alter table public.tenants enable row level security;
create policy tenant_self on public.tenants
  using (id in (select public.my_tenant_ids()));

alter table public.tenant_members enable row level security;
create policy members_visible on public.tenant_members
  using (tenant_id in (select public.my_tenant_ids()));

-- ── Storage bucket for evidence photos (private; signed URLs only) ─────
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;
