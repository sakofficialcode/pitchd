CREATE TABLE IF NOT EXISTS groups (
  id                  text PRIMARY KEY,
  group_name          text NOT NULL,
  num_members         integer NOT NULL,
  shift_start         text NOT NULL,
  shift_end           text NOT NULL,
  std_on_shift        integer NOT NULL,
  time_granularity    integer NOT NULL,
  night_shifts        boolean NOT NULL DEFAULT false,
  night_shift_start   integer,
  night_shift_end     integer,
  night_on_shift      integer,
  admin_password_hash text,
  created_at          text NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id      text NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_name   text NOT NULL,
  availability  jsonb NOT NULL DEFAULT '{}'::jsonb,
  password_hash text NOT NULL DEFAULT '',
  created_at    text NOT NULL,
  updated_at    text NOT NULL,
  UNIQUE (group_id, member_name)
);

CREATE TABLE IF NOT EXISTS schedules (
  group_id     text PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
  result_json  jsonb NOT NULL,
  generated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS swap_requests (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id      text NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_member   text NOT NULL,
  to_member     text NOT NULL,
  from_start    text NOT NULL,
  from_end      text NOT NULL,
  to_start      text,
  to_end        text,
  message       text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at    text NOT NULL,
  responded_at  text
);
