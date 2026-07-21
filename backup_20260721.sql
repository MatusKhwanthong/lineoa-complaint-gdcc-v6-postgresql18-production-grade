--
-- PostgreSQL database dump
--

\restrict 24v6LhcO9rj0MlwDzdV8TEhxnbFip2XE77t3ph2zOkV98CGg1Vl4c35e3A3lgcw

-- Dumped from database version 18.4 (Ubuntu 18.4-0ubuntu0.26.04.1)
-- Dumped by pg_dump version 18.4 (Ubuntu 18.4-0ubuntu0.26.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: complaint_status; Type: TYPE; Schema: public; Owner: complaint_app_v6
--

CREATE TYPE public.complaint_status AS ENUM (
    'new',
    'received',
    'assigned',
    'in_progress',
    'waiting_for_info',
    'completed',
    'rejected',
    'cancelled'
);


ALTER TYPE public.complaint_status OWNER TO complaint_app_v6;

--
-- Name: history_actor_type; Type: TYPE; Schema: public; Owner: complaint_app_v6
--

CREATE TYPE public.history_actor_type AS ENUM (
    'citizen',
    'staff',
    'system'
);


ALTER TYPE public.history_actor_type OWNER TO complaint_app_v6;

--
-- Name: staff_role; Type: TYPE; Schema: public; Owner: complaint_app_v6
--

CREATE TYPE public.staff_role AS ENUM (
    'officer',
    'supervisor',
    'admin'
);


ALTER TYPE public.staff_role OWNER TO complaint_app_v6;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: complaint_app_v6
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    actor_staff_user_id uuid,
    action character varying(100) NOT NULL,
    entity_type character varying(80) NOT NULL,
    entity_id character varying(100),
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO complaint_app_v6;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: complaint_app_v6
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_logs_id_seq OWNER TO complaint_app_v6;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: complaint_app_v6
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: complaint_attachments; Type: TABLE; Schema: public; Owner: complaint_app_v6
--

CREATE TABLE public.complaint_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complaint_id uuid NOT NULL,
    storage_key character varying(255) NOT NULL,
    original_name character varying(255) NOT NULL,
    mime_type character varying(100) NOT NULL,
    size_bytes integer NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    sha256 character(64) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT complaint_attachments_height_check CHECK ((height > 0)),
    CONSTRAINT complaint_attachments_size_bytes_check CHECK ((size_bytes > 0)),
    CONSTRAINT complaint_attachments_width_check CHECK ((width > 0))
);


ALTER TABLE public.complaint_attachments OWNER TO complaint_app_v6;

--
-- Name: complaint_categories; Type: TABLE; Schema: public; Owner: complaint_app_v6
--

CREATE TABLE public.complaint_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name_th character varying(200) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sla_hours integer DEFAULT 72 NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.complaint_categories OWNER TO complaint_app_v6;

--
-- Name: complaint_reference_seq; Type: SEQUENCE; Schema: public; Owner: complaint_app_v6
--

CREATE SEQUENCE public.complaint_reference_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.complaint_reference_seq OWNER TO complaint_app_v6;

--
-- Name: complaint_status_history; Type: TABLE; Schema: public; Owner: complaint_app_v6
--

CREATE TABLE public.complaint_status_history (
    id bigint NOT NULL,
    complaint_id uuid NOT NULL,
    old_status public.complaint_status,
    new_status public.complaint_status NOT NULL,
    note text,
    actor_type public.history_actor_type NOT NULL,
    actor_line_user_id character varying(64),
    actor_staff_user_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.complaint_status_history OWNER TO complaint_app_v6;

--
-- Name: complaint_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: complaint_app_v6
--

CREATE SEQUENCE public.complaint_status_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.complaint_status_history_id_seq OWNER TO complaint_app_v6;

--
-- Name: complaint_status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: complaint_app_v6
--

ALTER SEQUENCE public.complaint_status_history_id_seq OWNED BY public.complaint_status_history.id;


--
-- Name: complaints; Type: TABLE; Schema: public; Owner: complaint_app_v6
--

CREATE TABLE public.complaints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference_no character varying(30) NOT NULL,
    line_user_id character varying(64) NOT NULL,
    line_display_name character varying(255),
    category_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    description text NOT NULL,
    location_text character varying(500) NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    contact_name character varying(200) NOT NULL,
    contact_phone character varying(20) NOT NULL,
    contact_email character varying(254),
    status public.complaint_status DEFAULT 'new'::public.complaint_status NOT NULL,
    privacy_consent_at timestamp with time zone NOT NULL,
    privacy_consent_version character varying(30) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    department_id uuid,
    assigned_staff_user_id uuid,
    priority character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    due_at timestamp with time zone,
    completed_at timestamp with time zone,
    CONSTRAINT valid_coordinates CHECK ((((latitude IS NULL) AND (longitude IS NULL)) OR (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)) AND ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))))
);


ALTER TABLE public.complaints OWNER TO complaint_app_v6;

--
-- Name: departments; Type: TABLE; Schema: public; Owner: complaint_app_v6
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name_th character varying(200) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.departments OWNER TO complaint_app_v6;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: complaint_app_v6
--

CREATE TABLE public.schema_migrations (
    filename character varying(255) NOT NULL,
    checksum character(64) NOT NULL,
    applied_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO complaint_app_v6;

--
-- Name: staff_users; Type: TABLE; Schema: public; Owner: complaint_app_v6
--

CREATE TABLE public.staff_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    display_name character varying(200) NOT NULL,
    role public.staff_role DEFAULT 'officer'::public.staff_role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.staff_users OWNER TO complaint_app_v6;

--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: complaint_app_v6
--

CREATE TABLE public.webhook_events (
    webhook_event_id character varying(100) NOT NULL,
    event_type character varying(50) NOT NULL,
    source_user_id character varying(100),
    received_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_at timestamp with time zone,
    processing_status character varying(20) DEFAULT 'received'::character varying NOT NULL,
    error_message text
);


ALTER TABLE public.webhook_events OWNER TO complaint_app_v6;

--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: complaint_status_history id; Type: DEFAULT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaint_status_history ALTER COLUMN id SET DEFAULT nextval('public.complaint_status_history_id_seq'::regclass);


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: complaint_app_v6
--

COPY public.audit_logs (id, actor_staff_user_id, action, entity_type, entity_id, detail, ip_address, user_agent, created_at) FROM stdin;
1	0d414d69-dc31-4e6f-aaff-8ee360745771	category.update	complaint_category	57f8620c-7eef-43bc-978b-0f047245f5af	{"nameTh": "ถนน ทางเท้า และโครงสร้างพื้นฐาน 1", "isActive": true, "slaHours": 72}	::ffff:10.0.2.2	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	2026-07-17 09:07:29.033588+00
2	0d414d69-dc31-4e6f-aaff-8ee360745771	category.update	complaint_category	57f8620c-7eef-43bc-978b-0f047245f5af	{"nameTh": "ถนน ทางเท้า และโครงสร้างพื้นฐาน", "isActive": true, "slaHours": 72}	::ffff:10.0.2.2	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	2026-07-17 09:07:36.327356+00
3	0d414d69-dc31-4e6f-aaff-8ee360745771	category.create	complaint_category	d4d396f0-12ce-48bd-9f44-1d43f9f7a8ae	{"code": "FIRE", "nameTh": "ไฟไหม้", "slaHours": 72}	::ffff:10.0.2.2	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	2026-07-17 09:07:50.58171+00
4	1c3133fe-5b39-482f-bf92-359804201826	staff.update	staff_user	a1bee15f-5c75-4478-bbe8-96e680daa204	{"role": "admin", "isActive": true, "displayName": "officer", "passwordChanged": false}	::ffff:10.0.2.2	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	2026-07-20 09:18:38.083957+00
5	1c3133fe-5b39-482f-bf92-359804201826	staff.update	staff_user	a1bee15f-5c75-4478-bbe8-96e680daa204	{"role": "admin", "isActive": false, "displayName": "officer", "passwordChanged": false}	::ffff:10.0.2.2	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	2026-07-20 09:18:47.509918+00
6	1c3133fe-5b39-482f-bf92-359804201826	staff.update	staff_user	0d414d69-dc31-4e6f-aaff-8ee360745771	{"role": "admin", "isActive": false, "displayName": "Test Admin", "passwordChanged": false}	::ffff:10.0.2.2	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	2026-07-20 09:18:59.490881+00
7	1c3133fe-5b39-482f-bf92-359804201826	staff.create	staff_user	a8e4d240-3b62-4c94-9907-d5f5adc47c5f	{"role": "admin", "username": "admin2", "displayName": "kafew"}	::ffff:10.0.2.2	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	2026-07-20 09:26:29.159153+00
8	a8e4d240-3b62-4c94-9907-d5f5adc47c5f	staff.update	staff_user	a8e4d240-3b62-4c94-9907-d5f5adc47c5f	{"role": "admin", "isActive": true, "displayName": "kafew", "passwordChanged": false}	::ffff:10.0.2.2	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	2026-07-20 09:27:03.956025+00
9	a8e4d240-3b62-4c94-9907-d5f5adc47c5f	staff.update	staff_user	a8e4d240-3b62-4c94-9907-d5f5adc47c5f	{"role": "admin", "isActive": false, "displayName": "kafew", "passwordChanged": false}	::ffff:10.0.2.2	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	2026-07-20 09:27:09.57875+00
\.


--
-- Data for Name: complaint_attachments; Type: TABLE DATA; Schema: public; Owner: complaint_app_v6
--

COPY public.complaint_attachments (id, complaint_id, storage_key, original_name, mime_type, size_bytes, width, height, sha256, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: complaint_categories; Type: TABLE DATA; Schema: public; Owner: complaint_app_v6
--

COPY public.complaint_categories (id, code, name_th, is_active, sort_order, created_at, sla_hours, updated_at) FROM stdin;
7ae7b572-aef6-44da-a760-baa2e0665a33	LIGHT	ไฟฟ้าส่องสว่าง	t	20	2026-07-17 07:50:20.037442+00	72	2026-07-17 07:50:20.093325+00
0045fb54-a4c6-4f34-8529-925733cc7e8a	WASTE	ขยะและความสะอาด	t	30	2026-07-17 07:50:20.037442+00	72	2026-07-17 07:50:20.093325+00
f7eaa96b-5e46-4349-8c2c-0f6e6a16b50a	DRAIN	ท่อระบายน้ำและน้ำท่วม	t	40	2026-07-17 07:50:20.037442+00	72	2026-07-17 07:50:20.093325+00
94de3e1c-7a65-4423-ae62-2e4adaf1ccc5	PUBLIC_HEALTH	เหตุรำคาญและสาธารณสุข	t	50	2026-07-17 07:50:20.037442+00	72	2026-07-17 07:50:20.093325+00
a44e8b71-4b8d-4ee2-96d0-b7919f74c3be	TRAFFIC	การจราจรและความปลอดภัย	t	60	2026-07-17 07:50:20.037442+00	72	2026-07-17 07:50:20.093325+00
39439e95-b13e-4ee8-9111-24637c198743	ENVIRONMENT	สิ่งแวดล้อม	t	70	2026-07-17 07:50:20.037442+00	72	2026-07-17 07:50:20.093325+00
1bace0b0-e030-4e27-a7c1-7b2ccbf5e16f	OTHER	เรื่องอื่น ๆ	t	100	2026-07-17 07:50:20.037442+00	72	2026-07-17 07:50:20.093325+00
57f8620c-7eef-43bc-978b-0f047245f5af	ROAD	ถนน ทางเท้า และโครงสร้างพื้นฐาน	t	10	2026-07-17 07:50:20.037442+00	72	2026-07-17 09:07:36.322768+00
d4d396f0-12ce-48bd-9f44-1d43f9f7a8ae	FIRE	ไฟไหม้	t	100	2026-07-17 09:07:50.575282+00	72	2026-07-17 09:07:50.575282+00
\.


--
-- Data for Name: complaint_status_history; Type: TABLE DATA; Schema: public; Owner: complaint_app_v6
--

COPY public.complaint_status_history (id, complaint_id, old_status, new_status, note, actor_type, actor_line_user_id, actor_staff_user_id, created_at) FROM stdin;
\.


--
-- Data for Name: complaints; Type: TABLE DATA; Schema: public; Owner: complaint_app_v6
--

COPY public.complaints (id, reference_no, line_user_id, line_display_name, category_id, title, description, location_text, latitude, longitude, contact_name, contact_phone, contact_email, status, privacy_consent_at, privacy_consent_version, created_at, updated_at, department_id, assigned_staff_user_id, priority, due_at, completed_at) FROM stdin;
\.


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: complaint_app_v6
--

COPY public.departments (id, code, name_th, is_active, created_at, updated_at) FROM stdin;
cc14a072-260c-4e1f-852e-20bec5966860	CENTRAL	ศูนย์รับเรื่องและประสานงาน	t	2026-07-17 07:50:20.07182+00	2026-07-17 07:50:20.093325+00
a4be7c9c-9270-4349-8411-2907d5903880	ENGINEERING	กองช่าง	t	2026-07-17 07:50:20.07182+00	2026-07-17 07:50:20.093325+00
f5652b8f-c746-419b-9df1-2b5a33ea9a66	PUBLIC_HEALTH	กองสาธารณสุขและสิ่งแวดล้อม	t	2026-07-17 07:50:20.07182+00	2026-07-17 07:50:20.093325+00
94042d49-986e-4060-a3dc-7d67926cb3cc	PUBLIC_WORKS	งานรักษาความสะอาด	t	2026-07-17 07:50:20.07182+00	2026-07-17 07:50:20.093325+00
7ac7e0a4-0d2a-47fa-b311-d5dd20e0345c	DISASTER	งานป้องกันและบรรเทาสาธารณภัย	t	2026-07-17 07:50:20.07182+00	2026-07-17 07:50:20.093325+00
c34d26a6-6752-454b-a571-e6a51a6e466c	TRAFFIC	งานเทศกิจและจราจร	t	2026-07-17 07:50:20.07182+00	2026-07-17 07:50:20.093325+00
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: complaint_app_v6
--

COPY public.schema_migrations (filename, checksum, applied_at) FROM stdin;
001_schema.sql	3c20753a615ce15a7d94461d327e35aae52dccdf95d7473bfdaac1073cb83206	2026-07-17 07:50:20.027637+00
002_seed.sql	a6a265af9856a135e6a153fba6860e0cd8a2a33017981fc9d3d769916cb05044	2026-07-17 07:50:20.043467+00
003_attachments.sql	43b83d7e2ccad473b1c83efc56a24cbc702fb5c611b6bebd6bb2ca5dcd740d14	2026-07-17 07:50:20.063288+00
004_enterprise_admin.sql	50afb0f871daf196b8fd23d0be92d79bc0823bad7b8687bd1b8197f75aa232bf	2026-07-17 07:50:20.083136+00
005_smartcity_governance.sql	3b1ee3b7a17fb6057ddb2af1cee8400c37cecafb3975b0d0ad84cc79277e2d52	2026-07-17 07:50:20.10265+00
006_production_hardening.sql	c4526ea625ca5995c560ddc91b666798bc0960c6f87141253ece92eeee9377bf	2026-07-17 07:50:20.119077+00
\.


--
-- Data for Name: staff_users; Type: TABLE DATA; Schema: public; Owner: complaint_app_v6
--

COPY public.staff_users (id, username, password_hash, display_name, role, is_active, last_login_at, created_at, updated_at) FROM stdin;
a1bee15f-5c75-4478-bbe8-96e680daa204	officePass234 เจ้าหน้าที่ทดสอบ officer\nnpm run admin:create -- officePas4234!	$2b$12$iKAvp99dHRyJGP6yR2hYq.YbOBTwpgTxcOd8LAyz7fCCjK3hvYAvK	officer	admin	f	\N	2026-07-20 09:09:28.545617+00	2026-07-20 09:18:47.506277+00
0d414d69-dc31-4e6f-aaff-8ee360745771	testadmin	$2b$12$92rWBFh7MxJmhdN5NHN/Qe1s28CYcpVA1/uz4PPdYxo86Yn5Ctd7i	Test Admin	admin	f	2026-07-20 08:04:29.481819+00	2026-07-17 07:50:27.145309+00	2026-07-20 09:18:59.486389+00
a8e4d240-3b62-4c94-9907-d5f5adc47c5f	admin2	$2b$12$TaqkFDkv0TjjFssyeO9/AOXbzPc02d/cT/mNb9alOJjh8EZTy9rLi	kafew	admin	f	2026-07-20 09:26:52.261421+00	2026-07-20 09:26:29.154913+00	2026-07-20 09:27:09.571848+00
1c3133fe-5b39-482f-bf92-359804201826	admin1	$2b$12$GL4uTPaOeRzz2L64xbUnXOiN9e706tdhcWqkAJfxjCHDdMyGztOta	ผู้ดูแลระบบ	admin	t	2026-07-20 09:28:14.433382+00	2026-07-20 09:18:12.583617+00	2026-07-20 09:18:12.583617+00
4d3d3b81-b3c6-49ca-8d65-13a13ebdf8b2	officer1	$2b$12$mKi3FusiwORB5ERo5y65/OqmT8JgWmtatxfZrtf6Xz0twXNt3mYMi	เจ้าหน้าที่ทดสอบ	officer	t	2026-07-20 09:29:03.289558+00	2026-07-20 09:13:35.158015+00	2026-07-20 09:13:35.158015+00
acb94340-e395-4cc7-bf4c-a66cd08f7e80	super1	$2b$12$c/8ukryvsjtj2Br1T.1mIOYkBVqa4NIjZ04hJOFgx08Ws7vo8AA8q	หัวหน้าทดสอบ	supervisor	t	2026-07-20 09:29:12.623683+00	2026-07-20 09:14:52.189991+00	2026-07-20 09:14:52.189991+00
\.


--
-- Data for Name: webhook_events; Type: TABLE DATA; Schema: public; Owner: complaint_app_v6
--

COPY public.webhook_events (webhook_event_id, event_type, source_user_id, received_at, processed_at, processing_status, error_message) FROM stdin;
\.


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: complaint_app_v6
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 9, true);


--
-- Name: complaint_reference_seq; Type: SEQUENCE SET; Schema: public; Owner: complaint_app_v6
--

SELECT pg_catalog.setval('public.complaint_reference_seq', 1, false);


--
-- Name: complaint_status_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: complaint_app_v6
--

SELECT pg_catalog.setval('public.complaint_status_history_id_seq', 1, false);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: complaint_attachments complaint_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaint_attachments
    ADD CONSTRAINT complaint_attachments_pkey PRIMARY KEY (id);


--
-- Name: complaint_attachments complaint_attachments_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaint_attachments
    ADD CONSTRAINT complaint_attachments_storage_key_key UNIQUE (storage_key);


--
-- Name: complaint_categories complaint_categories_code_key; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaint_categories
    ADD CONSTRAINT complaint_categories_code_key UNIQUE (code);


--
-- Name: complaint_categories complaint_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaint_categories
    ADD CONSTRAINT complaint_categories_pkey PRIMARY KEY (id);


--
-- Name: complaint_status_history complaint_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaint_status_history
    ADD CONSTRAINT complaint_status_history_pkey PRIMARY KEY (id);


--
-- Name: complaints complaints_pkey; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_pkey PRIMARY KEY (id);


--
-- Name: complaints complaints_reference_no_key; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_reference_no_key UNIQUE (reference_no);


--
-- Name: departments departments_code_key; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_code_key UNIQUE (code);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: staff_users staff_users_pkey; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.staff_users
    ADD CONSTRAINT staff_users_pkey PRIMARY KEY (id);


--
-- Name: staff_users staff_users_username_key; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.staff_users
    ADD CONSTRAINT staff_users_username_key UNIQUE (username);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (webhook_event_id);


--
-- Name: audit_logs_actor_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX audit_logs_actor_idx ON public.audit_logs USING btree (actor_staff_user_id, created_at DESC);


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);


--
-- Name: audit_logs_created_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX audit_logs_created_idx ON public.audit_logs USING btree (created_at DESC);


--
-- Name: complaint_attachments_complaint_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX complaint_attachments_complaint_idx ON public.complaint_attachments USING btree (complaint_id, sort_order, created_at);


--
-- Name: complaint_history_complaint_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX complaint_history_complaint_idx ON public.complaint_status_history USING btree (complaint_id, created_at);


--
-- Name: complaints_assigned_staff_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX complaints_assigned_staff_idx ON public.complaints USING btree (assigned_staff_user_id, created_at DESC);


--
-- Name: complaints_category_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX complaints_category_idx ON public.complaints USING btree (category_id, created_at DESC);


--
-- Name: complaints_department_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX complaints_department_idx ON public.complaints USING btree (department_id, created_at DESC);


--
-- Name: complaints_due_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX complaints_due_idx ON public.complaints USING btree (due_at) WHERE (due_at IS NOT NULL);


--
-- Name: complaints_due_status_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX complaints_due_status_idx ON public.complaints USING btree (due_at, status) WHERE (due_at IS NOT NULL);


--
-- Name: complaints_line_user_id_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX complaints_line_user_id_idx ON public.complaints USING btree (line_user_id, created_at DESC);


--
-- Name: complaints_status_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX complaints_status_idx ON public.complaints USING btree (status, created_at DESC);


--
-- Name: webhook_events_received_at_idx; Type: INDEX; Schema: public; Owner: complaint_app_v6
--

CREATE INDEX webhook_events_received_at_idx ON public.webhook_events USING btree (received_at DESC);


--
-- Name: audit_logs audit_logs_actor_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_staff_user_id_fkey FOREIGN KEY (actor_staff_user_id) REFERENCES public.staff_users(id);


--
-- Name: complaint_attachments complaint_attachments_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaint_attachments
    ADD CONSTRAINT complaint_attachments_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE RESTRICT;


--
-- Name: complaint_status_history complaint_status_history_actor_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaint_status_history
    ADD CONSTRAINT complaint_status_history_actor_staff_user_id_fkey FOREIGN KEY (actor_staff_user_id) REFERENCES public.staff_users(id);


--
-- Name: complaint_status_history complaint_status_history_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaint_status_history
    ADD CONSTRAINT complaint_status_history_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE RESTRICT;


--
-- Name: complaints complaints_assigned_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_assigned_staff_user_id_fkey FOREIGN KEY (assigned_staff_user_id) REFERENCES public.staff_users(id);


--
-- Name: complaints complaints_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.complaint_categories(id);


--
-- Name: complaints complaints_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: complaint_app_v6
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO complaint_app_v6;


--
-- PostgreSQL database dump complete
--

\unrestrict 24v6LhcO9rj0MlwDzdV8TEhxnbFip2XE77t3ph2zOkV98CGg1Vl4c35e3A3lgcw

