CREATE TABLE public.weekly_plan_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_1 text NOT NULL DEFAULT '09:30',
  slot_2 text NOT NULL DEFAULT '15:10',
  slot_3 text NOT NULL DEFAULT '19:20',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.weekly_plan_settings TO authenticated;
GRANT ALL ON public.weekly_plan_settings TO service_role;

ALTER TABLE public.weekly_plan_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage weekly plan settings"
ON public.weekly_plan_settings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_weekly_plan_settings_updated_at
BEFORE UPDATE ON public.weekly_plan_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.weekly_plan_settings (slot_1, slot_2, slot_3) VALUES ('09:30', '15:10', '19:20');

CREATE OR REPLACE FUNCTION public.set_weekly_plan_schedule(p_slot_1 text, p_slot_2 text, p_slot_3 text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slots text[] := ARRAY[p_slot_1, p_slot_2, p_slot_3];
  job_names text[] := ARRAY['weekly-plan-0930', 'weekly-plan-1510', 'weekly-plan-1920'];
  i integer;
  h integer;
  m integer;
  jid bigint;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can change the weekly plan schedule';
  END IF;

  FOR i IN 1..3 LOOP
    IF slots[i] !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Invalid time format: %', slots[i];
    END IF;
    h := (split_part(slots[i], ':', 1))::int - 1; -- Luanda (UTC+1) -> UTC
    IF h < 0 THEN h := h + 24; END IF;
    m := (split_part(slots[i], ':', 2))::int;

    SELECT jobid INTO jid FROM cron.job WHERE jobname = job_names[i];
    IF jid IS NOT NULL THEN
      PERFORM cron.alter_job(jid, schedule => m || ' ' || h || ' * * *');
    END IF;
  END LOOP;

  UPDATE public.weekly_plan_settings
  SET slot_1 = p_slot_1, slot_2 = p_slot_2, slot_3 = p_slot_3;
END;
$$;

REVOKE ALL ON FUNCTION public.set_weekly_plan_schedule(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_weekly_plan_schedule(text, text, text) TO authenticated;