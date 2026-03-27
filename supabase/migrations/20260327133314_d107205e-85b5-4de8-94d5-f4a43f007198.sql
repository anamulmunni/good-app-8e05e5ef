CREATE OR REPLACE FUNCTION public.recalculate_all_balances(p_rate integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.users u
  SET balance = GREATEST(0, 
    (u.key_count * p_rate) - COALESCE((
      SELECT SUM(t.amount)
      FROM public.transactions t
      WHERE t.user_id = u.id 
        AND t.type = 'withdrawal' 
        AND t.status IN ('pending', 'completed')
    ), 0)
  )
  WHERE u.id > 0;
END;
$function$;