--
-- PostgreSQL database dump
--

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.matches DROP CONSTRAINT IF EXISTS matches_reviewed_by_fkey;
ALTER TABLE IF EXISTS ONLY public.matches DROP CONSTRAINT IF EXISTS matches_lost_case_id_lost_type_fkey;
ALTER TABLE IF EXISTS ONLY public.matches DROP CONSTRAINT IF EXISTS matches_found_case_id_found_type_fkey;
ALTER TABLE IF EXISTS ONLY public.investigations DROP CONSTRAINT IF EXISTS investigations_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.investigations DROP CONSTRAINT IF EXISTS investigations_case_id_fkey;
ALTER TABLE IF EXISTS ONLY public.identity_proofs DROP CONSTRAINT IF EXISTS identity_proofs_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.identity_proofs DROP CONSTRAINT IF EXISTS identity_proofs_reviewed_by_fkey;
ALTER TABLE IF EXISTS ONLY public.handovers DROP CONSTRAINT IF EXISTS handovers_completed_by_fkey;
ALTER TABLE IF EXISTS ONLY public.handovers DROP CONSTRAINT IF EXISTS handovers_claim_id_fkey;
ALTER TABLE IF EXISTS ONLY public.handovers DROP CONSTRAINT IF EXISTS handovers_case_id_fkey;
ALTER TABLE IF EXISTS ONLY public.claims DROP CONSTRAINT IF EXISTS claims_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.claims DROP CONSTRAINT IF EXISTS claims_lost_case_id_lost_type_fkey;
ALTER TABLE IF EXISTS ONLY public.claims DROP CONSTRAINT IF EXISTS claims_found_case_id_found_type_fkey;
ALTER TABLE IF EXISTS ONLY public.claims DROP CONSTRAINT IF EXISTS claims_decided_by_fkey;
ALTER TABLE IF EXISTS ONLY public.claim_events DROP CONSTRAINT IF EXISTS claim_events_claim_id_fkey;
ALTER TABLE IF EXISTS ONLY public.cases DROP CONSTRAINT IF EXISTS cases_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.cases DROP CONSTRAINT IF EXISTS cases_review_by_fkey;
ALTER TABLE IF EXISTS ONLY public.cases DROP CONSTRAINT IF EXISTS cases_recorded_by_fkey;
ALTER TABLE IF EXISTS ONLY public.cases DROP CONSTRAINT IF EXISTS cases_location_id_fkey;
ALTER TABLE IF EXISTS ONLY public.cases DROP CONSTRAINT IF EXISTS cases_disposal_by_fkey;
ALTER TABLE IF EXISTS ONLY public.cases DROP CONSTRAINT IF EXISTS cases_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.cases DROP CONSTRAINT IF EXISTS cases_approval_by_fkey;
ALTER TABLE IF EXISTS ONLY public.case_events DROP CONSTRAINT IF EXISTS case_events_case_id_fkey;
ALTER TABLE IF EXISTS ONLY public.auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
DROP TRIGGER IF EXISTS audit_logs_no_change ON public.audit_logs;
DROP INDEX IF EXISTS public.users_university_id_key;
DROP INDEX IF EXISTS public.users_role_status_idx;
DROP INDEX IF EXISTS public.users_email_key;
DROP INDEX IF EXISTS public.notifications_user_idx;
DROP INDEX IF EXISTS public.notifications_unread_idx;
DROP INDEX IF EXISTS public.matches_suggested_idx;
DROP INDEX IF EXISTS public.matches_found_idx;
DROP INDEX IF EXISTS public.investigations_case_idx;
DROP INDEX IF EXISTS public.identity_proofs_queue_idx;
DROP INDEX IF EXISTS public.identity_proofs_purge_idx;
DROP INDEX IF EXISTS public.identity_proofs_one_open;
DROP INDEX IF EXISTS public.handovers_pending_idx;
DROP INDEX IF EXISTS public.handovers_one_live_per_claim;
DROP INDEX IF EXISTS public.claims_user_idx;
DROP INDEX IF EXISTS public.claims_status_idx;
DROP INDEX IF EXISTS public.claims_one_winner_per_item;
DROP INDEX IF EXISTS public.claims_one_live_per_person_and_item;
DROP INDEX IF EXISTS public.claim_events_claim_idx;
DROP INDEX IF EXISTS public.cases_user_idx;
DROP INDEX IF EXISTS public.cases_status_type_idx;
DROP INDEX IF EXISTS public.cases_retention_idx;
DROP INDEX IF EXISTS public.cases_public_board_idx;
DROP INDEX IF EXISTS public.cases_location_idx;
DROP INDEX IF EXISTS public.cases_category_idx;
DROP INDEX IF EXISTS public.case_events_case_idx;
DROP INDEX IF EXISTS public.auth_tokens_one_per_purpose;
DROP INDEX IF EXISTS public.audit_logs_user_idx;
DROP INDEX IF EXISTS public.audit_logs_at_idx;
DROP INDEX IF EXISTS public.audit_logs_action_idx;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.matches DROP CONSTRAINT IF EXISTS matches_pkey;
ALTER TABLE IF EXISTS ONLY public.matches DROP CONSTRAINT IF EXISTS matches_lost_case_id_found_case_id_key;
ALTER TABLE IF EXISTS ONLY public.login_failures DROP CONSTRAINT IF EXISTS login_failures_pkey;
ALTER TABLE IF EXISTS ONLY public.locations DROP CONSTRAINT IF EXISTS locations_pkey;
ALTER TABLE IF EXISTS ONLY public.locations DROP CONSTRAINT IF EXISTS locations_building_name_key;
ALTER TABLE IF EXISTS ONLY public.investigations DROP CONSTRAINT IF EXISTS investigations_pkey;
ALTER TABLE IF EXISTS ONLY public.identity_proofs DROP CONSTRAINT IF EXISTS identity_proofs_pkey;
ALTER TABLE IF EXISTS ONLY public.handovers DROP CONSTRAINT IF EXISTS handovers_pkey;
ALTER TABLE IF EXISTS ONLY public.claims DROP CONSTRAINT IF EXISTS claims_pkey;
ALTER TABLE IF EXISTS ONLY public.claim_events DROP CONSTRAINT IF EXISTS claim_events_pkey;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_pkey;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE IF EXISTS ONLY public.cases DROP CONSTRAINT IF EXISTS cases_ref_key;
ALTER TABLE IF EXISTS ONLY public.cases DROP CONSTRAINT IF EXISTS cases_pkey;
ALTER TABLE IF EXISTS ONLY public.cases DROP CONSTRAINT IF EXISTS cases_id_type_key;
ALTER TABLE IF EXISTS ONLY public.case_events DROP CONSTRAINT IF EXISTS case_events_pkey;
ALTER TABLE IF EXISTS ONLY public.case_counters DROP CONSTRAINT IF EXISTS case_counters_pkey;
ALTER TABLE IF EXISTS ONLY public.auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_token_hash_key;
ALTER TABLE IF EXISTS ONLY public.auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_pkey;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notifications ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.matches ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.locations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.investigations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.identity_proofs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.handovers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.claims ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.claim_events ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.categories ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.cases ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.case_events ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.auth_tokens ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.audit_logs ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.settings;
DROP SEQUENCE IF EXISTS public.notifications_id_seq;
DROP TABLE IF EXISTS public.notifications;
DROP SEQUENCE IF EXISTS public.matches_id_seq;
DROP TABLE IF EXISTS public.matches;
DROP TABLE IF EXISTS public.login_failures;
DROP SEQUENCE IF EXISTS public.locations_id_seq;
DROP TABLE IF EXISTS public.locations;
DROP SEQUENCE IF EXISTS public.investigations_id_seq;
DROP TABLE IF EXISTS public.investigations;
DROP SEQUENCE IF EXISTS public.identity_proofs_id_seq;
DROP TABLE IF EXISTS public.identity_proofs;
DROP SEQUENCE IF EXISTS public.handovers_id_seq;
DROP TABLE IF EXISTS public.handovers;
DROP SEQUENCE IF EXISTS public.claims_id_seq;
DROP TABLE IF EXISTS public.claims;
DROP SEQUENCE IF EXISTS public.claim_events_id_seq;
DROP TABLE IF EXISTS public.claim_events;
DROP SEQUENCE IF EXISTS public.categories_id_seq;
DROP TABLE IF EXISTS public.categories;
DROP SEQUENCE IF EXISTS public.cases_id_seq;
DROP TABLE IF EXISTS public.cases;
DROP SEQUENCE IF EXISTS public.case_events_id_seq;
DROP TABLE IF EXISTS public.case_events;
DROP TABLE IF EXISTS public.case_counters;
DROP SEQUENCE IF EXISTS public.auth_tokens_id_seq;
DROP TABLE IF EXISTS public.auth_tokens;
DROP SEQUENCE IF EXISTS public.audit_logs_id_seq;
DROP TABLE IF EXISTS public.audit_logs;
DROP FUNCTION IF EXISTS public.next_case_ref();
DROP FUNCTION IF EXISTS public.audit_logs_append_only();
--
-- Name: audit_logs_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_logs_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;


--
-- Name: next_case_ref(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_case_ref() RETURNS text
    LANGUAGE sql
    AS $$
  INSERT INTO case_counters (year, last_number)
  VALUES (EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Dhaka'))::int, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = case_counters.last_number + 1
  RETURNING 'SF-' || year || '-' || repeat('0', greatest(0, 4 - length(last_number::text))) || last_number;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    user_id bigint,
    actor text DEFAULT 'system'::text NOT NULL,
    role text,
    action text NOT NULL,
    entity text DEFAULT ''::text NOT NULL,
    detail text DEFAULT ''::text NOT NULL,
    ip text DEFAULT ''::text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: auth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_tokens (
    id bigint NOT NULL,
    token_hash text NOT NULL,
    user_id bigint NOT NULL,
    purpose text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT auth_tokens_purpose_check CHECK ((purpose = ANY (ARRAY['verify'::text, 'reset'::text, 'invite'::text, 'resubmit'::text])))
);


--
-- Name: auth_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_tokens_id_seq OWNED BY public.auth_tokens.id;


--
-- Name: case_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_counters (
    year integer NOT NULL,
    last_number integer NOT NULL
);


--
-- Name: case_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_events (
    id bigint NOT NULL,
    case_id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    key text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    staff_only boolean DEFAULT false NOT NULL
);


--
-- Name: case_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.case_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: case_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.case_events_id_seq OWNED BY public.case_events.id;


--
-- Name: cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cases (
    id bigint NOT NULL,
    ref text DEFAULT public.next_case_ref() NOT NULL,
    type text NOT NULL,
    user_id bigint,
    category_id bigint NOT NULL,
    location_id bigint NOT NULL,
    location_detail text DEFAULT ''::text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    photo text,
    photo_mime text,
    status text NOT NULL,
    approval_required boolean DEFAULT false NOT NULL,
    approval_by bigint,
    approval_at timestamp with time zone,
    approval_decision text,
    approval_remarks text,
    review_by bigint,
    review_at timestamp with time zone,
    review_decision text,
    review_note text,
    finder_name text,
    finder_contact text,
    finder_university_id text,
    recorded_by bigint,
    storage_slot text,
    retention_flagged_at timestamp with time zone,
    retention_reset_at timestamp with time zone,
    disposal_method text,
    disposal_note text,
    disposal_by bigint,
    disposal_at timestamp with time zone,
    close_reason text,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cases_approval_decision_check CHECK ((approval_decision = ANY (ARRAY['approved'::text, 'rejected'::text]))),
    CONSTRAINT cases_close_reason_check CHECK ((close_reason = ANY (ARRAY['withdrawn'::text, 'recovered'::text, 'returned'::text, 'disposed'::text]))),
    CONSTRAINT cases_description_check CHECK ((length(description) <= 1000)),
    CONSTRAINT cases_disposal_method_check CHECK ((disposal_method = ANY (ARRAY['donate'::text, 'recycle'::text, 'transfer'::text]))),
    CONSTRAINT cases_finder_only_found CHECK (((type = 'found'::text) OR ((finder_name IS NULL) AND (recorded_by IS NULL)))),
    CONSTRAINT cases_lost_has_reporter CHECK (((type = 'found'::text) OR (user_id IS NOT NULL))),
    CONSTRAINT cases_ref_check CHECK ((ref ~ '^SF-[0-9]{4}-[0-9]{4}$'::text)),
    CONSTRAINT cases_review_decision_check CHECK ((review_decision = ANY (ARRAY['accepted'::text, 'rejected'::text]))),
    CONSTRAINT cases_slot_only_found CHECK (((type = 'found'::text) OR (storage_slot IS NULL))),
    CONSTRAINT cases_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'rejected'::text, 'under_review'::text, 'open'::text, 'matched'::text, 'claim_pending'::text, 'ready_for_handover'::text, 'closed'::text, 'disposed'::text]))),
    CONSTRAINT cases_title_check CHECK (((btrim(title) <> ''::text) AND (length(title) <= 80))),
    CONSTRAINT cases_type_check CHECK ((type = ANY (ARRAY['lost'::text, 'found'::text])))
);


--
-- Name: cases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cases_id_seq OWNED BY public.cases.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id bigint NOT NULL,
    name text NOT NULL,
    name_bn text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    icon text DEFAULT 'box'::text NOT NULL,
    sensitive boolean DEFAULT false NOT NULL,
    high_value boolean DEFAULT false NOT NULL,
    requires_approval boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: claim_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claim_events (
    id bigint NOT NULL,
    claim_id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    key text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    staff_only boolean DEFAULT false NOT NULL
);


--
-- Name: claim_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.claim_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: claim_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.claim_events_id_seq OWNED BY public.claim_events.id;


--
-- Name: claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claims (
    id bigint NOT NULL,
    found_case_id bigint NOT NULL,
    found_type text DEFAULT 'found'::text NOT NULL,
    lost_case_id bigint,
    lost_type text DEFAULT 'lost'::text,
    user_id bigint NOT NULL,
    statement text NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    proof_file text,
    proof_mime text,
    proof_at timestamp with time zone,
    proof_note text DEFAULT ''::text NOT NULL,
    proof_requested_note text DEFAULT ''::text NOT NULL,
    decided_by bigint,
    decided_at timestamp with time zone,
    decision_tier smallint,
    decision_note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT claims_decision_tier_check CHECK ((decision_tier = ANY (ARRAY[1, 2]))),
    CONSTRAINT claims_found_type_check CHECK ((found_type = 'found'::text)),
    CONSTRAINT claims_lost_type_check CHECK ((lost_type = 'lost'::text)),
    CONSTRAINT claims_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'proof_requested'::text, 'verified'::text, 'rejected'::text, 'completed'::text])))
);


--
-- Name: claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.claims_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.claims_id_seq OWNED BY public.claims.id;


--
-- Name: handovers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.handovers (
    id bigint NOT NULL,
    claim_id bigint NOT NULL,
    case_id bigint NOT NULL,
    nonce text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    completed_at timestamp with time zone,
    completed_by bigint,
    id_checked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT handovers_completed_needs_id_check CHECK (((status <> 'completed'::text) OR ((completed_at IS NOT NULL) AND (completed_by IS NOT NULL) AND id_checked))),
    CONSTRAINT handovers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: handovers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.handovers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: handovers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.handovers_id_seq OWNED BY public.handovers.id;


--
-- Name: identity_proofs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identity_proofs (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    file text,
    status text DEFAULT 'submitted'::text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by bigint,
    reviewed_at timestamp with time zone,
    reject_code text,
    reject_note text DEFAULT ''::text NOT NULL,
    final boolean DEFAULT false NOT NULL,
    purge_after timestamp with time zone,
    purged_at timestamp with time zone,
    CONSTRAINT identity_proofs_decision_complete CHECK ((((status = 'submitted'::text) AND (reviewed_at IS NULL) AND (reject_code IS NULL) AND (NOT final)) OR ((status = 'approved'::text) AND (reviewed_at IS NOT NULL) AND (reject_code IS NULL) AND (NOT final)) OR ((status = 'rejected'::text) AND (reviewed_at IS NOT NULL) AND (reject_code IS NOT NULL)))),
    CONSTRAINT identity_proofs_file_check CHECK (((file IS NULL) OR (file ~ '^[a-f0-9]{32}\.(jpg|png|webp)$'::text))),
    CONSTRAINT identity_proofs_file_or_purged CHECK (((file IS NOT NULL) OR (purged_at IS NOT NULL))),
    CONSTRAINT identity_proofs_other_has_note CHECK (((reject_code IS DISTINCT FROM 'other'::text) OR (btrim(reject_note) <> ''::text))),
    CONSTRAINT identity_proofs_reject_code_check CHECK ((reject_code = ANY (ARRAY['unreadable'::text, 'name_mismatch'::text, 'id_mismatch'::text, 'not_bup_card'::text, 'other'::text]))),
    CONSTRAINT identity_proofs_reject_note_check CHECK ((length(reject_note) <= 200)),
    CONSTRAINT identity_proofs_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: identity_proofs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.identity_proofs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: identity_proofs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.identity_proofs_id_seq OWNED BY public.identity_proofs.id;


--
-- Name: investigations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investigations (
    id bigint NOT NULL,
    case_id bigint NOT NULL,
    user_id bigint NOT NULL,
    kind text DEFAULT 'note'::text NOT NULL,
    camera text DEFAULT ''::text NOT NULL,
    window_from timestamp with time zone,
    window_to timestamp with time zone,
    findings text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT investigations_kind_check CHECK ((kind = ANY (ARRAY['note'::text, 'cctv'::text])))
);


--
-- Name: investigations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.investigations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: investigations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.investigations_id_seq OWNED BY public.investigations.id;


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id bigint NOT NULL,
    building text NOT NULL,
    building_bn text DEFAULT ''::text NOT NULL,
    name text NOT NULL,
    name_bn text DEFAULT ''::text NOT NULL,
    lat double precision,
    lng double precision,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT locations_check CHECK (((lat IS NULL) = (lng IS NULL))),
    CONSTRAINT locations_lat_check CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision))),
    CONSTRAINT locations_lng_check CHECK (((lng >= ('-180'::integer)::double precision) AND (lng <= (180)::double precision)))
);


--
-- Name: locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.locations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.locations_id_seq OWNED BY public.locations.id;


--
-- Name: login_failures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_failures (
    email text NOT NULL,
    failures smallint NOT NULL,
    first_at timestamp with time zone NOT NULL,
    locked_until timestamp with time zone
);


--
-- Name: matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matches (
    id bigint NOT NULL,
    lost_case_id bigint NOT NULL,
    lost_type text DEFAULT 'lost'::text NOT NULL,
    found_case_id bigint NOT NULL,
    found_type text DEFAULT 'found'::text NOT NULL,
    score smallint NOT NULL,
    breakdown jsonb NOT NULL,
    reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    public_reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'suggested'::text NOT NULL,
    reviewed_by bigint,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT matches_found_type_check CHECK ((found_type = 'found'::text)),
    CONSTRAINT matches_lost_type_check CHECK ((lost_type = 'lost'::text)),
    CONSTRAINT matches_score_check CHECK (((score >= 0) AND (score <= 100))),
    CONSTRAINT matches_status_check CHECK ((status = ANY (ARRAY['suggested'::text, 'confirmed'::text, 'rejected'::text])))
);


--
-- Name: matches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.matches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: matches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.matches_id_seq OWNED BY public.matches.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    key text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    link text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id smallint DEFAULT 1 NOT NULL,
    retention_days smallint DEFAULT 90 NOT NULL,
    match_threshold smallint DEFAULT 40 NOT NULL,
    weight_category smallint DEFAULT 30 NOT NULL,
    weight_description smallint DEFAULT 35 NOT NULL,
    weight_location smallint DEFAULT 20 NOT NULL,
    weight_time smallint DEFAULT 15 NOT NULL,
    handover_valid_days smallint DEFAULT 7 NOT NULL,
    CONSTRAINT settings_handover_valid_days_check CHECK (((handover_valid_days >= 1) AND (handover_valid_days <= 30))),
    CONSTRAINT settings_id_check CHECK ((id = 1)),
    CONSTRAINT settings_match_threshold_check CHECK (((match_threshold >= 10) AND (match_threshold <= 90))),
    CONSTRAINT settings_retention_days_check CHECK (((retention_days >= 7) AND (retention_days <= 730))),
    CONSTRAINT settings_weight_category_check CHECK (((weight_category >= 0) AND (weight_category <= 100))),
    CONSTRAINT settings_weight_description_check CHECK (((weight_description >= 0) AND (weight_description <= 100))),
    CONSTRAINT settings_weight_location_check CHECK (((weight_location >= 0) AND (weight_location <= 100))),
    CONSTRAINT settings_weight_time_check CHECK (((weight_time >= 0) AND (weight_time <= 100))),
    CONSTRAINT settings_weights_sum_100 CHECK (((((weight_category + weight_description) + weight_location) + weight_time) = 100))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text,
    role text NOT NULL,
    affiliation text,
    university_id text,
    phone text,
    status text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    verification_method text DEFAULT 'university_email'::text NOT NULL,
    lang text DEFAULT 'en'::text NOT NULL,
    password_changed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    CONSTRAINT users_active_has_password CHECK (((status <> 'active'::text) OR (password_hash IS NOT NULL))),
    CONSTRAINT users_affiliation_check CHECK ((affiliation = ANY (ARRAY['student'::text, 'staff'::text]))),
    CONSTRAINT users_email_check CHECK (((email = lower(email)) AND (POSITION(('@'::text) IN (email)) > 1))),
    CONSTRAINT users_lang_check CHECK ((lang = ANY (ARRAY['en'::text, 'bn'::text]))),
    CONSTRAINT users_name_check CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['member'::text, 'security'::text, 'approver'::text, 'admin'::text]))),
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text]))),
    CONSTRAINT users_verification_method_check CHECK ((verification_method = ANY (ARRAY['university_email'::text, 'id_card'::text])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: auth_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens ALTER COLUMN id SET DEFAULT nextval('public.auth_tokens_id_seq'::regclass);


--
-- Name: case_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_events ALTER COLUMN id SET DEFAULT nextval('public.case_events_id_seq'::regclass);


--
-- Name: cases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases ALTER COLUMN id SET DEFAULT nextval('public.cases_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: claim_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_events ALTER COLUMN id SET DEFAULT nextval('public.claim_events_id_seq'::regclass);


--
-- Name: claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims ALTER COLUMN id SET DEFAULT nextval('public.claims_id_seq'::regclass);


--
-- Name: handovers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handovers ALTER COLUMN id SET DEFAULT nextval('public.handovers_id_seq'::regclass);


--
-- Name: identity_proofs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_proofs ALTER COLUMN id SET DEFAULT nextval('public.identity_proofs_id_seq'::regclass);


--
-- Name: investigations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investigations ALTER COLUMN id SET DEFAULT nextval('public.investigations_id_seq'::regclass);


--
-- Name: locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations ALTER COLUMN id SET DEFAULT nextval('public.locations_id_seq'::regclass);


--
-- Name: matches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches ALTER COLUMN id SET DEFAULT nextval('public.matches_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, user_id, actor, role, action, entity, detail, ip, at) FROM stdin;
1	5	Demo Student	member	case.created	SF-2026-0001	lost, Bag or backpack		2026-10-11 06:37:17.277161+00
2	2	Demo Security Officer	security	case.review_accepted	SF-2026-0001			2026-10-11 06:37:17.299363+00
3	3	Demo Security Officer Two	security	case.intake	SF-2026-0002	Bag or backpack, slot B-07		2026-10-11 06:37:17.307804+00
4	2	Demo Security Officer	security	match.confirmed	SF-2026-0001 / SF-2026-0002	score 80		2026-10-11 06:37:17.337966+00
5	5	Demo Student	member	claim.submitted	SF-2026-0002	claim 1		2026-10-11 06:37:17.359333+00
6	6	Demo Student Two	member	case.created	SF-2026-0003	lost, Mobile phone		2026-10-11 06:37:17.373695+00
7	7	Demo Staff Member	member	case.created	SF-2026-0004	lost, Clothing or umbrella		2026-10-11 06:37:17.382504+00
8	6	Demo Student Two	member	case.created	SF-2026-0005	found, Wallet or purse		2026-10-11 06:37:17.389553+00
9	2	Demo Security Officer	security	case.intake	SF-2026-0006	Student or staff ID card, slot A-02		2026-10-11 06:37:17.393721+00
10	7	Demo Staff Member	member	case.created	SF-2026-0007	lost, Watch or jewellery		2026-10-11 06:37:17.412033+00
11	2	Demo Security Officer	security	case.review_accepted	SF-2026-0007			2026-10-11 06:37:17.425876+00
12	5	Demo Student	member	case.created	SF-2026-0008	lost, Books and notes		2026-10-11 06:37:17.435454+00
13	2	Demo Security Officer	security	case.review_accepted	SF-2026-0008			2026-10-11 06:37:17.444118+00
14	3	Demo Security Officer Two	security	case.intake	SF-2026-0009	Keys, slot A-05		2026-10-11 06:37:17.449699+00
15	2	Demo Security Officer	security	case.intake	SF-2026-0010	Earphones or headphones, slot A-06		2026-10-11 06:37:17.457068+00
16	3	Demo Security Officer Two	security	case.intake	SF-2026-0011	Mobile phone, slot C-01		2026-10-11 06:37:17.465064+00
17	6	Demo Student Two	member	claim.submitted	SF-2026-0011	claim 2		2026-10-11 06:37:17.479921+00
18	2	Demo Security Officer	security	claim.proof_requested	SF-2026-0011	claim 2		2026-10-11 06:37:17.490796+00
19	2	Demo Security Officer	security	case.intake	SF-2026-0012	Water bottle or lunch box, slot B-02		2026-10-11 06:37:17.496895+00
20	7	Demo Staff Member	member	claim.submitted	SF-2026-0012	claim 3		2026-10-11 06:37:17.518113+00
21	3	Demo Security Officer Two	security	claim.verified	SF-2026-0012	claim 3, tier 1		2026-10-11 06:37:17.538704+00
22	3	Demo Security Officer Two	security	case.intake	SF-2026-0013	Clothing or umbrella, slot B-09		2026-10-11 06:37:17.544116+00
23	5	Demo Student	member	claim.submitted	SF-2026-0013	claim 4		2026-10-11 06:37:17.560825+00
24	2	Demo Security Officer	security	claim.verified	SF-2026-0013	claim 4, tier 1		2026-10-11 06:37:17.575092+00
25	3	Demo Security Officer Two	security	handover.completed	SF-2026-0013	claim 4, ID checked		2026-10-11 06:37:17.591172+00
26	2	Demo Security Officer	security	case.intake	SF-2026-0014	Other, slot D-03		2026-10-11 06:37:17.599787+00
\.


--
-- Data for Name: auth_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_tokens (id, token_hash, user_id, purpose, expires_at) FROM stdin;
\.


--
-- Data for Name: case_counters; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.case_counters (year, last_number) FROM stdin;
2026	14
\.


--
-- Data for Name: case_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.case_events (id, case_id, at, key, params, staff_only) FROM stdin;
3	2	2026-10-11 06:37:17.302+00	ev_intake	{"slot": "B-07"}	f
5	2	2026-10-11 06:37:17.332+00	ev_match_confirmed	{"other": "SF-2026-0001"}	f
6	2	2026-10-11 06:37:17.348+00	ev_claim_received	{}	t
8	1	2026-10-10 06:37:17.26+00	ev_created_lost	{}	f
9	1	2026-10-10 06:37:17.283+00	ev_review_accepted	{"note": "", "slot": ""}	f
10	1	2026-10-10 06:37:17.327+00	ev_match_confirmed	{"other": "SF-2026-0002"}	f
11	1	2026-10-10 06:37:17.353+00	ev_claim_submitted	{"other": "SF-2026-0002"}	f
12	3	2026-10-11 06:37:17.366+00	ev_created_lost	{}	f
13	3	2026-10-11 06:37:17.369+00	ev_sent_for_approval	{}	f
14	4	2026-10-11 06:37:17.375+00	ev_created_lost	{}	f
15	5	2026-10-11 06:37:17.385+00	ev_created_found	{}	f
17	6	2026-10-11 06:37:17.39+00	ev_intake	{"slot": "A-02"}	f
18	7	2026-10-11 06:37:17.402+00	ev_created_lost	{}	f
19	7	2026-10-11 06:37:17.418+00	ev_review_accepted	{"note": "", "slot": ""}	f
20	8	2026-10-11 06:37:17.428+00	ev_created_lost	{}	f
21	8	2026-10-11 06:37:17.438+00	ev_review_accepted	{"note": "", "slot": ""}	f
22	9	2026-10-11 06:37:17.446+00	ev_intake	{"slot": "A-05"}	f
23	10	2026-10-11 06:37:17.453+00	ev_intake	{"slot": "A-06"}	f
24	11	2026-10-11 06:37:17.461+00	ev_intake	{"slot": "C-01"}	f
25	11	2026-10-11 06:37:17.474+00	ev_claim_received	{}	t
26	12	2026-10-11 06:37:17.493+00	ev_intake	{"slot": "B-02"}	f
27	12	2026-10-11 06:37:17.508+00	ev_claim_received	{}	t
28	12	2026-10-11 06:37:17.529+00	ev_ready	{}	t
33	13	2026-10-03 06:37:17.54+00	ev_intake	{"slot": "B-09"}	f
34	13	2026-10-03 06:37:17.554+00	ev_claim_received	{}	t
35	13	2026-10-03 06:37:17.568+00	ev_ready	{}	t
36	13	2026-10-03 06:37:17.584+00	ev_returned	{}	f
38	14	2026-07-04 06:37:17.597+00	ev_intake	{"slot": "D-03"}	f
39	14	2026-10-11 06:37:17.609+00	ev_retention_flagged	{"days": 90}	t
\.


--
-- Data for Name: cases; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cases (id, ref, type, user_id, category_id, location_id, location_detail, title, description, occurred_at, photo, photo_mime, status, approval_required, approval_by, approval_at, approval_decision, approval_remarks, review_by, review_at, review_decision, review_note, finder_name, finder_contact, finder_university_id, recorded_by, storage_slot, retention_flagged_at, retention_reset_at, disposal_method, disposal_note, disposal_by, disposal_at, close_reason, closed_at, created_at, updated_at) FROM stdin;
9	SF-2026-0009	found	\N	7	8	Near the guard booth	Set of keys with a green tag	Three keys on a steel ring with a green plastic tag.	2026-10-08 06:37:17.446+00	\N	\N	open	f	\N	\N	\N	\N	\N	\N	\N	\N	Guard on duty		\N	3	A-05	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-11 06:37:17.446+00	2026-10-11 06:37:17.446+00
10	SF-2026-0010	found	\N	10	4		White wireless earbuds	White earbuds in a small charging case with a scratch on the lid.	2026-10-05 06:37:17.452+00	\N	\N	open	f	\N	\N	\N	\N	\N	\N	\N	\N	Walk-in finder		\N	2	A-06	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-11 06:37:17.453+00	2026-10-11 06:37:17.453+00
2	SF-2026-0002	found	\N	8	5	Left beside the lockers	Black backpack	Black backpack, red zipper, blue bottle in the side pocket, exercise books inside. Small tear on the handle.	2026-10-09 06:37:17.301+00	\N	\N	claim_pending	f	\N	\N	\N	\N	\N	\N	\N	\N	Walk-in finder		\N	3	B-07	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-11 06:37:17.302+00	2026-10-11 06:37:17.349979+00
1	SF-2026-0001	lost	5	8	4	Second table from the window	Black backpack	Black backpack with a red zip, a blue water bottle in the side pocket and a notebook labelled Physics inside. Small tear near the handle.	2026-10-07 06:37:17.251+00	\N	\N	claim_pending	f	\N	\N	\N	\N	2	2026-10-11 06:37:17.279+00	accepted		\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-10 06:37:17.26+00	2026-10-11 06:37:17.362307+00
3	SF-2026-0003	lost	6	3	1	Back row	Black smartphone	Black smartphone in a clear case with a cracked corner and a blue sticker on the back.	2026-10-10 02:37:17.365+00	\N	\N	pending_approval	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-11 06:37:17.366+00	2026-10-11 06:37:17.370208+00
4	SF-2026-0004	lost	7	13	2		Blue umbrella	Large blue umbrella with a wooden handle and a torn strap.	2026-10-11 00:37:17.374+00	\N	\N	under_review	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-11 06:37:17.375+00	2026-10-11 06:37:17.375+00
5	SF-2026-0005	found	6	5	6	Under a table	Brown wallet	Brown leather wallet with a zip pocket. It holds some cash and two cards.	2026-10-11 03:37:17.384+00	\N	\N	under_review	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-11 06:37:17.385+00	2026-10-11 06:37:17.385+00
6	SF-2026-0006	found	\N	1	2	On a bench	Student ID card	University ID card in a clear holder. Name and department are printed on the front.	2026-10-10 06:37:17.39+00	\N	\N	open	f	\N	\N	\N	\N	\N	\N	\N	\N	Walk-in finder		\N	2	A-02	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-11 06:37:17.39+00	2026-10-11 06:37:17.398523+00
7	SF-2026-0007	lost	7	6	6	Near the water cooler	Silver wristwatch	Silver analogue wristwatch with a brown leather strap and a cracked glass.	2026-10-07 06:37:17.401+00	\N	\N	open	f	\N	\N	\N	\N	2	2026-10-11 06:37:17.414+00	accepted		\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-11 06:37:17.402+00	2026-10-11 06:37:17.419574+00
8	SF-2026-0008	lost	5	9	3		Organic Chemistry textbook	Hardcover textbook with a green cover. The first page has a name written in pencil.	2026-10-06 06:37:17.427+00	\N	\N	open	f	\N	\N	\N	\N	2	2026-10-11 06:37:17.437+00	accepted		\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-11 06:37:17.428+00	2026-10-11 06:37:17.43926+00
11	SF-2026-0011	found	\N	3	1	Left on a desk	Black phone with cracked screen	Black smartphone, screen cracked in the top corner, clear case with a blue sticker on the back.	2026-10-10 04:37:17.461+00	\N	\N	claim_pending	f	\N	\N	\N	\N	\N	\N	\N	\N	Walk-in finder		\N	3	C-01	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-11 06:37:17.461+00	2026-10-11 06:37:17.475059+00
12	SF-2026-0012	found	\N	12	7		Blue steel water bottle	Blue steel bottle with a dent near the base and a sticker of a mountain.	2026-10-09 06:37:17.492+00	\N	\N	ready_for_handover	f	\N	\N	\N	\N	\N	\N	\N	\N	Walk-in finder		\N	2	B-02	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-11 06:37:17.493+00	2026-10-11 06:37:17.530712+00
14	SF-2026-0014	found	\N	15	10		Scientific calculator	Black scientific calculator with a cracked cover and initials scratched on the back.	2026-03-26 06:37:17.597+00	\N	\N	open	f	\N	\N	\N	\N	\N	\N	\N	\N	Office staff		\N	2	D-03	2026-10-11 06:37:17.606+00	\N	\N	\N	\N	\N	\N	\N	2026-07-04 06:37:17.597+00	2026-10-11 06:37:17.610052+00
13	SF-2026-0013	found	\N	13	9		Grey hoodie	Grey zip hoodie, size M, with a small hole in the left cuff.	2026-09-24 06:37:17.54+00	\N	\N	closed	f	\N	\N	\N	\N	\N	\N	\N	\N	Walk-in finder		\N	3	B-09	\N	\N	\N	\N	\N	\N	returned	2026-10-03 06:37:17.58+00	2026-10-03 06:37:17.54+00	2026-10-11 06:37:17.594018+00
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, name, name_bn, description, icon, sensitive, high_value, requires_approval, active) FROM stdin;
1	Student or staff ID card	শিক্ষার্থী বা কর্মীর পরিচয়পত্র		box	t	f	f	t
2	Bank or payment card	ব্যাংক বা পেমেন্ট কার্ড		box	t	t	f	t
3	Mobile phone	মোবাইল ফোন		box	f	t	t	t
4	Laptop or tablet	ল্যাপটপ বা ট্যাবলেট		box	f	t	t	t
5	Wallet or purse	মানিব্যাগ বা পার্স		box	f	t	f	t
6	Watch or jewellery	ঘড়ি বা গয়না		box	f	t	f	t
7	Keys	চাবি		box	f	f	f	t
8	Bag or backpack	ব্যাগ বা ব্যাকপ্যাক		box	f	f	f	t
9	Books and notes	বই ও খাতা		box	f	f	f	t
10	Earphones or headphones	ইয়ারফোন বা হেডফোন		box	f	f	f	t
11	USB drive or storage	ইউএসবি ড্রাইভ বা স্টোরেজ		box	f	f	f	t
12	Water bottle or lunch box	পানির বোতল বা টিফিন বক্স		box	f	f	f	t
13	Clothing or umbrella	পোশাক বা ছাতা		box	f	f	f	t
14	Spectacles	চশমা		box	f	f	f	t
15	Other	অন্যান্য		box	f	f	f	t
\.


--
-- Data for Name: claim_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.claim_events (id, claim_id, at, key, params, staff_only) FROM stdin;
1	1	2026-10-11 06:37:17.342+00	cev_submitted	{}	f
3	2	2026-10-11 06:37:17.47+00	cev_submitted	{}	f
4	2	2026-10-11 06:37:17.485+00	cev_proof_requested	{"note": "Please upload a photo of the phone box, receipt or a photo of you using it."}	f
6	3	2026-10-11 06:37:17.502+00	cev_submitted	{}	f
7	3	2026-10-11 06:37:17.524+00	cev_verified	{}	f
9	4	2026-10-11 06:37:17.549+00	cev_submitted	{}	f
10	4	2026-10-11 06:37:17.566+00	cev_verified	{}	f
\.


--
-- Data for Name: claims; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.claims (id, found_case_id, found_type, lost_case_id, lost_type, user_id, statement, status, proof_file, proof_mime, proof_at, proof_note, proof_requested_note, decided_by, decided_at, decision_tier, decision_note, created_at, updated_at) FROM stdin;
1	2	found	1	lost	5	Black backpack with a red zip. A blue bottle is in the side pocket, and the notebook inside says Physics. There is a small tear near the handle.	submitted	\N	\N	\N			\N	\N	\N		2026-10-11 06:37:17.342+00	2026-10-11 06:37:17.342+00
2	11	found	\N	lost	6	My black phone with a cracked corner. The case is clear and has a blue sticker on the back.	proof_requested	\N	\N	\N		Please upload a photo of the phone box, receipt or a photo of you using it.	\N	\N	\N		2026-10-11 06:37:17.47+00	2026-10-11 06:37:17.485525+00
3	12	found	\N	lost	7	Blue steel bottle, dent near the bottom and a mountain sticker on the side.	verified	\N	\N	\N			3	2026-10-11 06:37:17.522+00	1	Statement matches the private description.	2026-10-11 06:37:17.502+00	2026-10-11 06:37:17.524897+00
4	13	found	\N	lost	5	Grey zip hoodie, medium. The left cuff has a small hole.	completed	\N	\N	\N			2	2026-10-11 06:37:17.564+00	1	Matched.	2026-10-11 06:37:17.549+00	2026-10-11 06:37:17.580261+00
\.


--
-- Data for Name: handovers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.handovers (id, claim_id, case_id, nonce, expires_at, status, completed_at, completed_by, id_checked, created_at) FROM stdin;
1	3	12	52a288e73e540e856b95c6c8	2026-10-18 06:37:17.534+00	pending	\N	\N	f	2026-10-11 06:37:17.534431+00
2	4	13	21b6962f946eae5d64aecc5d	2026-10-18 06:37:17.57+00	completed	2026-10-11 06:37:17.579+00	3	t	2026-10-11 06:37:17.571038+00
\.


--
-- Data for Name: identity_proofs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.identity_proofs (id, user_id, file, status, submitted_at, reviewed_by, reviewed_at, reject_code, reject_note, final, purge_after, purged_at) FROM stdin;
\.


--
-- Data for Name: investigations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.investigations (id, case_id, user_id, kind, camera, window_from, window_to, findings, created_at) FROM stdin;
\.


--
-- Data for Name: locations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.locations (id, building, building_bn, name, name_bn, lat, lng, active) FROM stdin;
11	Prayer space	নামাজের স্থান	Prayer space	নামাজের স্থান	\N	\N	t
12	Other	অন্যান্য	Not sure or elsewhere	নিশ্চিত নই বা অন্য কোথাও	\N	\N	t
1	Academic area	একাডেমিক এলাকা	Classrooms	শ্রেণিকক্ষ	23.8417	90.3581	t
2	Academic area	একাডেমিক এলাকা	Corridors and lobbies	করিডোর ও লবি	23.8415	90.3574	t
3	Academic area	একাডেমিক এলাকা	Labs	ল্যাব	23.8419	90.3579	t
10	Administration	প্রশাসন	Offices	অফিস	23.8422	90.3586	t
6	Cafeteria	ক্যাফেটেরিয়া	Dining area	খাবারের স্থান	23.8403	90.3571	t
8	Gate and parking	গেট ও পার্কিং	Main gate	প্রধান ফটক	23.8395	90.3579	t
9	Gate and parking	গেট ও পার্কিং	Parking area	পার্কিং এলাকা	23.8398	90.3588	t
5	Library	গ্রন্থাগার	Entrance and lockers	প্রবেশপথ ও লকার	23.8406	90.3581	t
4	Library	গ্রন্থাগার	Reading hall	পাঠকক্ষ	23.8407	90.3583	t
7	Sports ground	খেলার মাঠ	Field and courts	মাঠ ও কোর্ট	23.8413	90.3561	t
\.


--
-- Data for Name: login_failures; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.login_failures (email, failures, first_at, locked_until) FROM stdin;
\.


--
-- Data for Name: matches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.matches (id, lost_case_id, lost_type, found_case_id, found_type, score, breakdown, reasons, public_reasons, status, reviewed_by, reviewed_at, created_at) FROM stdin;
1	1	lost	2	found	80	{"time": {"score": 0.9310627412176322, "points": 14, "weight": 15}, "category": {"score": 1, "points": 30, "weight": 30}, "location": {"score": 0.6, "points": 12, "weight": 20}, "description": {"score": 0.6824174593872192, "points": 23.9, "weight": 35}}	[{"key": "mr_category", "params": {"name": "Bag or backpack"}}, {"key": "mr_description", "params": {"pct": 68, "words": "black, backpack, red, blue, bottle"}}, {"key": "mr_location_building", "params": {"building": "Library"}}, {"key": "mr_time", "params": {"days": 1}}]	["mr_pub_category", "mr_pub_description", "mr_pub_location", "mr_pub_time"]	confirmed	2	2026-10-11 06:37:17.321+00	2026-10-11 06:37:17.31334+00
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, key, params, link, is_read, created_at) FROM stdin;
1	3	notif_review_needed	{"ref": "SF-2026-0001"}	/security/cases/SF-2026-0001	f	2026-10-11 06:37:17.271762+00
2	2	notif_review_needed	{"ref": "SF-2026-0001"}	/security/cases/SF-2026-0001	f	2026-10-11 06:37:17.271862+00
3	5	notif_report_received	{"ref": "SF-2026-0001"}	/items/SF-2026-0001	f	2026-10-11 06:37:17.275079+00
4	5	notif_case_open	{"ref": "SF-2026-0001"}	/items/SF-2026-0001	f	2026-10-11 06:37:17.287454+00
5	2	notif_match_suggested	{"lost": "SF-2026-0001", "found": "SF-2026-0002", "score": 80}	/security/matches	f	2026-10-11 06:37:17.315292+00
6	3	notif_match_suggested	{"lost": "SF-2026-0001", "found": "SF-2026-0002", "score": 80}	/security/matches	f	2026-10-11 06:37:17.315342+00
7	5	notif_match_confirmed	{"ref": "SF-2026-0001"}	/items/SF-2026-0001	f	2026-10-11 06:37:17.336429+00
8	2	notif_claim_submitted	{"ref": "SF-2026-0002"}	/security/claims/1	f	2026-10-11 06:37:17.356435+00
9	3	notif_claim_submitted	{"ref": "SF-2026-0002"}	/security/claims/1	f	2026-10-11 06:37:17.35662+00
10	4	notif_approval_needed	{"ref": "SF-2026-0003"}	/approver/cases/SF-2026-0003	f	2026-10-11 06:37:17.371909+00
11	6	notif_report_received	{"ref": "SF-2026-0003"}	/items/SF-2026-0003	f	2026-10-11 06:37:17.372817+00
12	2	notif_review_needed	{"ref": "SF-2026-0004"}	/security/cases/SF-2026-0004	f	2026-10-11 06:37:17.379385+00
13	3	notif_review_needed	{"ref": "SF-2026-0004"}	/security/cases/SF-2026-0004	f	2026-10-11 06:37:17.379512+00
14	7	notif_report_received	{"ref": "SF-2026-0004"}	/items/SF-2026-0004	f	2026-10-11 06:37:17.380534+00
15	2	notif_review_needed	{"ref": "SF-2026-0005"}	/security/cases/SF-2026-0005	f	2026-10-11 06:37:17.387862+00
16	3	notif_review_needed	{"ref": "SF-2026-0005"}	/security/cases/SF-2026-0005	f	2026-10-11 06:37:17.388012+00
17	6	notif_report_received	{"ref": "SF-2026-0005"}	/items/SF-2026-0005	f	2026-10-11 06:37:17.389126+00
18	2	notif_review_needed	{"ref": "SF-2026-0007"}	/security/cases/SF-2026-0007	f	2026-10-11 06:37:17.407061+00
19	3	notif_review_needed	{"ref": "SF-2026-0007"}	/security/cases/SF-2026-0007	f	2026-10-11 06:37:17.407121+00
20	7	notif_report_received	{"ref": "SF-2026-0007"}	/items/SF-2026-0007	f	2026-10-11 06:37:17.409996+00
21	7	notif_case_open	{"ref": "SF-2026-0007"}	/items/SF-2026-0007	f	2026-10-11 06:37:17.421653+00
22	2	notif_review_needed	{"ref": "SF-2026-0008"}	/security/cases/SF-2026-0008	f	2026-10-11 06:37:17.432955+00
23	3	notif_review_needed	{"ref": "SF-2026-0008"}	/security/cases/SF-2026-0008	f	2026-10-11 06:37:17.433002+00
24	5	notif_report_received	{"ref": "SF-2026-0008"}	/items/SF-2026-0008	f	2026-10-11 06:37:17.434544+00
25	5	notif_case_open	{"ref": "SF-2026-0008"}	/items/SF-2026-0008	f	2026-10-11 06:37:17.440322+00
26	2	notif_claim_submitted	{"ref": "SF-2026-0011"}	/security/claims/2	f	2026-10-11 06:37:17.476741+00
27	3	notif_claim_submitted	{"ref": "SF-2026-0011"}	/security/claims/2	f	2026-10-11 06:37:17.476957+00
28	6	notif_proof_requested	{"ref": "SF-2026-0011"}	/claims/2	f	2026-10-11 06:37:17.488056+00
29	2	notif_claim_submitted	{"ref": "SF-2026-0012"}	/security/claims/3	f	2026-10-11 06:37:17.513741+00
30	3	notif_claim_submitted	{"ref": "SF-2026-0012"}	/security/claims/3	f	2026-10-11 06:37:17.513811+00
31	7	notif_claim_verified	{"ref": "SF-2026-0012"}	/claims/3	f	2026-10-11 06:37:17.536371+00
32	3	notif_claim_submitted	{"ref": "SF-2026-0013"}	/security/claims/4	f	2026-10-11 06:37:17.558957+00
33	2	notif_claim_submitted	{"ref": "SF-2026-0013"}	/security/claims/4	f	2026-10-11 06:37:17.559384+00
34	5	notif_claim_verified	{"ref": "SF-2026-0013"}	/claims/4	f	2026-10-11 06:37:17.573105+00
35	5	notif_handover_done	{"ref": "SF-2026-0013"}	/claims/4	f	2026-10-11 06:37:17.589503+00
36	2	notif_retention_flagged	{"ref": "SF-2026-0014", "days": 90}	/security/unclaimed	f	2026-10-11 06:37:17.613282+00
37	3	notif_retention_flagged	{"ref": "SF-2026-0014", "days": 90}	/security/unclaimed	f	2026-10-11 06:37:17.613368+00
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settings (id, retention_days, match_threshold, weight_category, weight_description, weight_location, weight_time, handover_valid_days) FROM stdin;
1	90	40	30	35	20	15	7
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, name, email, password_hash, role, affiliation, university_id, phone, status, email_verified, verification_method, lang, password_changed_at, created_at, last_login_at) FROM stdin;
1	Demo Administrator	admin@safefind.example	$2b$12$qc2VZivup11TGFf1pwLuNe1b5f.osxGX9U/urHPja/xHfvSEyU9zm	admin	\N	\N	\N	active	t	university_email	en	\N	2026-10-11 06:37:16.032+00	\N
2	Demo Security Officer	security@safefind.example	$2b$12$a.xw1EGUkJ7sbwnC8MPey.8HiTC5qaCvnuSu4HjqZUILxOevtN6E2	security	\N	\N	\N	active	t	university_email	en	\N	2026-10-11 06:37:16.235+00	\N
3	Demo Security Officer Two	security2@safefind.example	$2b$12$ea5wrFhbpvUD7uW69Vi8hODbkCWZh2DPOQE.r0RFZov00ccPjxLDW	security	\N	\N	\N	active	t	university_email	en	\N	2026-10-11 06:37:16.438+00	\N
4	Demo Approver	approver@safefind.example	$2b$12$5vKTQTcVkOcW9KwTgbF17uXTYPragKiGPEDK2QEjqWFE0nKTi8WgW	approver	\N	\N	\N	active	t	university_email	en	\N	2026-10-11 06:37:16.64+00	\N
5	Demo Student	student@safefind.example	$2b$12$twUb4jcIDizubOG1ePi.R.LdB5C/xdIKbHz9dszjvs2wZUwuCeNxi	member	student	20240000001	\N	active	t	university_email	en	\N	2026-10-11 06:37:16.842+00	\N
6	Demo Student Two	student2@safefind.example	$2b$12$QWxVaS4vpsp3WmkFQzqHkelMWJAiSRKe4Sa7MATWQvNdD2qPAPT3C	member	student	20240000002	\N	active	t	university_email	en	\N	2026-10-11 06:37:17.045+00	\N
7	Demo Staff Member	staff@safefind.example	$2b$12$KNVISORwOet9KYQOdwuI5u936xt9bp7XLFXFHpSRQCpDqc80qf1a6	member	staff	EMP-1001	\N	active	t	university_email	en	\N	2026-10-11 06:37:17.247+00	\N
\.


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 26, true);


--
-- Name: auth_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.auth_tokens_id_seq', 1, false);


--
-- Name: case_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.case_events_id_seq', 39, true);


--
-- Name: cases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cases_id_seq', 14, true);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categories_id_seq', 15, true);


--
-- Name: claim_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.claim_events_id_seq', 10, true);


--
-- Name: claims_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.claims_id_seq', 4, true);


--
-- Name: handovers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.handovers_id_seq', 2, true);


--
-- Name: identity_proofs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.identity_proofs_id_seq', 1, false);


--
-- Name: investigations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.investigations_id_seq', 1, false);


--
-- Name: locations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.locations_id_seq', 12, true);


--
-- Name: matches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.matches_id_seq', 1, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notifications_id_seq', 37, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 7, true);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auth_tokens auth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_pkey PRIMARY KEY (id);


--
-- Name: auth_tokens auth_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: case_counters case_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_counters
    ADD CONSTRAINT case_counters_pkey PRIMARY KEY (year);


--
-- Name: case_events case_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_events
    ADD CONSTRAINT case_events_pkey PRIMARY KEY (id);


--
-- Name: cases cases_id_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_id_type_key UNIQUE (id, type);


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (id);


--
-- Name: cases cases_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_ref_key UNIQUE (ref);


--
-- Name: categories categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: claim_events claim_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_events
    ADD CONSTRAINT claim_events_pkey PRIMARY KEY (id);


--
-- Name: claims claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_pkey PRIMARY KEY (id);


--
-- Name: handovers handovers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handovers
    ADD CONSTRAINT handovers_pkey PRIMARY KEY (id);


--
-- Name: identity_proofs identity_proofs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_proofs
    ADD CONSTRAINT identity_proofs_pkey PRIMARY KEY (id);


--
-- Name: investigations investigations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investigations
    ADD CONSTRAINT investigations_pkey PRIMARY KEY (id);


--
-- Name: locations locations_building_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_building_name_key UNIQUE (building, name);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: login_failures login_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_failures
    ADD CONSTRAINT login_failures_pkey PRIMARY KEY (email);


--
-- Name: matches matches_lost_case_id_found_case_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_lost_case_id_found_case_id_key UNIQUE (lost_case_id, found_case_id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);


--
-- Name: audit_logs_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_at_idx ON public.audit_logs USING btree (at DESC);


--
-- Name: audit_logs_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_user_idx ON public.audit_logs USING btree (user_id);


--
-- Name: auth_tokens_one_per_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_tokens_one_per_purpose ON public.auth_tokens USING btree (user_id, purpose);


--
-- Name: case_events_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX case_events_case_idx ON public.case_events USING btree (case_id, at);


--
-- Name: cases_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_category_idx ON public.cases USING btree (category_id);


--
-- Name: cases_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_location_idx ON public.cases USING btree (location_id);


--
-- Name: cases_public_board_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_public_board_idx ON public.cases USING btree (created_at DESC) WHERE (status = ANY (ARRAY['open'::text, 'matched'::text]));


--
-- Name: cases_retention_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_retention_idx ON public.cases USING btree (COALESCE(retention_reset_at, created_at)) WHERE ((type = 'found'::text) AND (status = ANY (ARRAY['open'::text, 'matched'::text])) AND (retention_flagged_at IS NULL));


--
-- Name: cases_status_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_status_type_idx ON public.cases USING btree (status, type);


--
-- Name: cases_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_user_idx ON public.cases USING btree (user_id);


--
-- Name: claim_events_claim_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX claim_events_claim_idx ON public.claim_events USING btree (claim_id, at);


--
-- Name: claims_one_live_per_person_and_item; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX claims_one_live_per_person_and_item ON public.claims USING btree (found_case_id, user_id) WHERE (status = ANY (ARRAY['submitted'::text, 'proof_requested'::text, 'verified'::text]));


--
-- Name: claims_one_winner_per_item; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX claims_one_winner_per_item ON public.claims USING btree (found_case_id) WHERE (status = ANY (ARRAY['verified'::text, 'completed'::text]));


--
-- Name: claims_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX claims_status_idx ON public.claims USING btree (status);


--
-- Name: claims_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX claims_user_idx ON public.claims USING btree (user_id);


--
-- Name: handovers_one_live_per_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX handovers_one_live_per_claim ON public.handovers USING btree (claim_id) WHERE (status <> 'cancelled'::text);


--
-- Name: handovers_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX handovers_pending_idx ON public.handovers USING btree (expires_at) WHERE (status = 'pending'::text);


--
-- Name: identity_proofs_one_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX identity_proofs_one_open ON public.identity_proofs USING btree (user_id) WHERE (status = 'submitted'::text);


--
-- Name: identity_proofs_purge_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX identity_proofs_purge_idx ON public.identity_proofs USING btree (purge_after) WHERE (file IS NOT NULL);


--
-- Name: identity_proofs_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX identity_proofs_queue_idx ON public.identity_proofs USING btree (status, submitted_at);


--
-- Name: investigations_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investigations_case_idx ON public.investigations USING btree (case_id);


--
-- Name: matches_found_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matches_found_idx ON public.matches USING btree (found_case_id);


--
-- Name: matches_suggested_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matches_suggested_idx ON public.matches USING btree (created_at) WHERE (status = 'suggested'::text);


--
-- Name: notifications_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_unread_idx ON public.notifications USING btree (user_id) WHERE (NOT is_read);


--
-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_role_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_role_status_idx ON public.users USING btree (role, status);


--
-- Name: users_university_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_university_id_key ON public.users USING btree (university_id) WHERE (university_id IS NOT NULL);


--
-- Name: audit_logs audit_logs_no_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_logs_no_change BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_append_only();


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: auth_tokens auth_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: case_events case_events_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_events
    ADD CONSTRAINT case_events_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- Name: cases cases_approval_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_approval_by_fkey FOREIGN KEY (approval_by) REFERENCES public.users(id);


--
-- Name: cases cases_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: cases cases_disposal_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_disposal_by_fkey FOREIGN KEY (disposal_by) REFERENCES public.users(id);


--
-- Name: cases cases_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: cases cases_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id);


--
-- Name: cases cases_review_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_review_by_fkey FOREIGN KEY (review_by) REFERENCES public.users(id);


--
-- Name: cases cases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: claim_events claim_events_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_events
    ADD CONSTRAINT claim_events_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: claims claims_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id);


--
-- Name: claims claims_found_case_id_found_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_found_case_id_found_type_fkey FOREIGN KEY (found_case_id, found_type) REFERENCES public.cases(id, type);


--
-- Name: claims claims_lost_case_id_lost_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_lost_case_id_lost_type_fkey FOREIGN KEY (lost_case_id, lost_type) REFERENCES public.cases(id, type);


--
-- Name: claims claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: handovers handovers_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handovers
    ADD CONSTRAINT handovers_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id);


--
-- Name: handovers handovers_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handovers
    ADD CONSTRAINT handovers_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id);


--
-- Name: handovers handovers_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handovers
    ADD CONSTRAINT handovers_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id);


--
-- Name: identity_proofs identity_proofs_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_proofs
    ADD CONSTRAINT identity_proofs_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: identity_proofs identity_proofs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_proofs
    ADD CONSTRAINT identity_proofs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: investigations investigations_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investigations
    ADD CONSTRAINT investigations_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- Name: investigations investigations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investigations
    ADD CONSTRAINT investigations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: matches matches_found_case_id_found_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_found_case_id_found_type_fkey FOREIGN KEY (found_case_id, found_type) REFERENCES public.cases(id, type) ON DELETE CASCADE;


--
-- Name: matches matches_lost_case_id_lost_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_lost_case_id_lost_type_fkey FOREIGN KEY (lost_case_id, lost_type) REFERENCES public.cases(id, type) ON DELETE CASCADE;


--
-- Name: matches matches_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

