
create or replace function public.draftix_create_tournament(p_name text, p_teams text[], p_best_of integer default 3, p_format text default 'single_elimination')
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  uid uuid := auth.uid();
  clean_name text := trim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
  size integer := coalesce(array_length(p_teams,1),0);
  v_format text := coalesce(p_format,'single_elimination');
  bracket_size integer;
  rounds integer;
  lb_rounds integer;
  lb_count integer;
  v_tournament_id uuid;
  tournament_slug text;
  organizer_token text;
  round_no integer;
  match_no integer;
  j integer;
  k integer;
  seed_no integer;
  seed_order integer[];
  team_ids uuid[] := '{}';
  team_id uuid;
  clean_team text;
  rr_array uuid[];
  rr_tmp uuid;
  rr_a uuid;
  rr_b uuid;
  total_rounds_v integer;
  half integer;
  gf_id uuid;
  lbm public.tournament_matches;
  fs record;
  part_a uuid;
  part_b uuid;
  pending_a boolean;
  pending_b boolean;
  none_a boolean;
  none_b boolean;
  changed boolean;
  bye_winner uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if v_format not in ('single_elimination','double_elimination','round_robin','swiss') then raise exception 'Unknown tournament format'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tournament:' || uid::text,0));
  -- housekeeping: drop attempt rows older than 2 days so the limits table stays small
  delete from private.draftix_tournament_create_limits where created_at < clock_timestamp() - interval '2 days';
  if (select count(*) from private.draftix_tournament_create_limits where user_id=uid and created_at>clock_timestamp()-interval '30 minutes') >= 5 then raise exception 'Too many tournament attempts'; end if;
  if (select count(*) from private.draftix_tournament_create_limits where user_id=uid and created_at>clock_timestamp()-interval '24 hours') >= 12 then raise exception 'Daily tournament limit reached — try again tomorrow'; end if;
  if char_length(clean_name) not between 3 and 80 then raise exception 'Tournament name must be 3 to 80 characters'; end if;
  if size not between 3 and 16 then raise exception 'Choose between 3 and 16 teams'; end if;
  if p_best_of not in (1,3,5) then raise exception 'Choose best of 1, 3, or 5'; end if;

  for seed_no in 1..size loop
    clean_team := trim(regexp_replace(coalesce(p_teams[seed_no],''), '\s+', ' ', 'g'));
    if char_length(clean_team) not between 1 and 40 then raise exception 'Every team needs a name of 40 characters or fewer'; end if;
    if exists(select 1 from unnest(p_teams[1:seed_no-1]) previous_name where lower(trim(previous_name))=lower(clean_team)) then raise exception 'Team names must be unique'; end if;
  end loop;

  tournament_slug := trim(both '-' from regexp_replace(lower(clean_name), '[^a-z0-9]+', '-', 'g'));
  if char_length(tournament_slug)<3 then tournament_slug := 'tournament'; end if;
  tournament_slug := left(tournament_slug,50)||'-'||lower(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  organizer_token := encode(gen_random_bytes(24),'hex');
  insert into private.draftix_tournament_create_limits(user_id) values(uid);
  insert into public.tournaments(slug,name,team_count,best_of,format,organizer_token_hash,owner_id)
    values(tournament_slug,clean_name,size,p_best_of,v_format,encode(digest(organizer_token,'sha256'),'hex'),uid)
    returning id into v_tournament_id;

  for seed_no in 1..size loop
    insert into public.tournament_teams(tournament_id,name,seed)
      values(v_tournament_id,trim(regexp_replace(p_teams[seed_no], '\s+', ' ', 'g')),seed_no)
      returning id into team_id;
    team_ids := array_append(team_ids,team_id);
  end loop;

  -- Winners bracket (rounds 1..R) is shared by single and double elimination.
  bracket_size := case when size<=4 then 4 when size<=8 then 8 else 16 end;
  rounds := case bracket_size when 4 then 2 when 8 then 3 else 4 end;
  if v_format in ('single_elimination','double_elimination') then
    for round_no in 1..rounds loop
      for match_no in 1..(bracket_size/power(2,round_no)::integer) loop
        insert into public.tournament_matches(tournament_id,round_number,position) values(v_tournament_id,round_no,match_no);
      end loop;
    end loop;
    seed_order := case bracket_size
      when 4 then array[1,4,2,3]
      when 8 then array[1,8,4,5,2,7,3,6]
      else array[1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11]
    end;
    for match_no in 1..(bracket_size/2) loop
      update public.tournament_matches set
        team_a_id=case when seed_order[(match_no*2)-1]<=size then team_ids[seed_order[(match_no*2)-1]] else null end,
        team_b_id=case when seed_order[match_no*2]<=size then team_ids[seed_order[match_no*2]] else null end
      where tournament_id=v_tournament_id and round_number=1 and position=match_no;
    end loop;
  end if;

  if v_format='single_elimination' then
    update public.tournament_matches current_match set
      next_match_id=next_match.id,next_slot=case when current_match.position%2=1 then 'A' else 'B' end
    from public.tournament_matches next_match
    where current_match.tournament_id=v_tournament_id and next_match.tournament_id=v_tournament_id
      and next_match.round_number=current_match.round_number+1
      and next_match.position=ceil(current_match.position/2.0)::integer;
    update public.tournament_matches m set winner_team_id=coalesce(m.team_a_id,m.team_b_id),updated_at=now()
    where m.tournament_id=v_tournament_id and m.round_number=1 and ((m.team_a_id is null)<>(m.team_b_id is null));
    update public.tournament_matches next_match set
      team_a_id=case when source.next_slot='A' then source.winner_team_id else next_match.team_a_id end,
      team_b_id=case when source.next_slot='B' then source.winner_team_id else next_match.team_b_id end,updated_at=now()
    from public.tournament_matches source
    where source.tournament_id=v_tournament_id and source.round_number=1
      and source.winner_team_id is not null and source.next_match_id=next_match.id;

  elsif v_format='double_elimination' then
    -- Losers bracket rounds: 2R-2 of them, plus the grand final. Losers round
    -- j has bracket_size / 2^(ceil(j/2)+1) matches.
    lb_rounds := 2*rounds-2;
    total_rounds_v := rounds+lb_rounds+1;
    for j in 1..lb_rounds loop
      lb_count := bracket_size/power(2,ceil(j/2.0)+1)::integer;
      for match_no in 1..lb_count loop
        insert into public.tournament_matches(tournament_id,round_number,position) values(v_tournament_id,rounds+j,match_no);
      end loop;
    end loop;
    insert into public.tournament_matches(tournament_id,round_number,position) values(v_tournament_id,total_rounds_v,1);
    select id into gf_id from public.tournament_matches where tournament_id=v_tournament_id and round_number=total_rounds_v and position=1;
    update public.tournaments set total_rounds=total_rounds_v where id=v_tournament_id;

    -- Winners bracket: winner path.
    for round_no in 1..rounds loop
      for match_no in 1..(bracket_size/power(2,round_no)::integer) loop
        if round_no < rounds then
          update public.tournament_matches m set
            next_match_id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=round_no+1 and position=ceil(match_no/2.0)::integer),
            next_slot=case when match_no%2=1 then 'A' else 'B' end
          where m.tournament_id=v_tournament_id and m.round_number=round_no and m.position=match_no;
        else
          update public.tournament_matches m set next_match_id=gf_id,next_slot='A'
          where m.tournament_id=v_tournament_id and m.round_number=round_no and m.position=match_no;
        end if;
      end loop;
    end loop;
    -- Winners bracket: loser drops. Round 1 puts two losers into one losers
    -- match; later rounds drop each loser into its own major-round match.
    for match_no in 1..(bracket_size/2) loop
      update public.tournament_matches m set
        next_match_loser_id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=rounds+1 and position=match_no),
        next_slot_loser='A'
      where m.tournament_id=v_tournament_id and m.round_number=1 and m.position=2*match_no-1;
      update public.tournament_matches m set
        next_match_loser_id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=rounds+1 and position=match_no),
        next_slot_loser='B'
      where m.tournament_id=v_tournament_id and m.round_number=1 and m.position=2*match_no;
    end loop;
    for round_no in 2..rounds loop
      for match_no in 1..(bracket_size/power(2,round_no)::integer) loop
        update public.tournament_matches m set
          next_match_loser_id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=rounds+2*round_no-2 and position=match_no),
          next_slot_loser='A'
        where m.tournament_id=v_tournament_id and m.round_number=round_no and m.position=match_no;
      end loop;
    end loop;
    -- Losers bracket: winner path. Odd rounds advance in place; even rounds
    -- halve the field.
    for j in 1..lb_rounds loop
      lb_count := bracket_size/power(2,ceil(j/2.0)+1)::integer;
      for match_no in 1..lb_count loop
        if j=lb_rounds then
          update public.tournament_matches m set next_match_id=gf_id,next_slot='B'
          where m.tournament_id=v_tournament_id and m.round_number=rounds+j and m.position=match_no;
        elsif j%2=1 then
          update public.tournament_matches m set
            next_match_id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=rounds+j+1 and position=match_no),
            next_slot='B'
          where m.tournament_id=v_tournament_id and m.round_number=rounds+j and m.position=match_no;
        else
          update public.tournament_matches m set
            next_match_id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=rounds+j+1 and position=ceil(match_no/2.0)::integer),
            next_slot=case when match_no%2=1 then 'A' else 'B' end
          where m.tournament_id=v_tournament_id and m.round_number=rounds+j and m.position=match_no;
        end if;
      end loop;
    end loop;

    -- Resolve round-1 byes, then propagate through the losers bracket: a
    -- losers match fed by exactly one participant whose other feeder was a
    -- bye (or an empty match) is itself a bye.
    update public.tournament_matches m set winner_team_id=coalesce(m.team_a_id,m.team_b_id),updated_at=now()
    where m.tournament_id=v_tournament_id and m.round_number=1 and ((m.team_a_id is null)<>(m.team_b_id is null));
    update public.tournament_matches next_match set
      team_a_id=case when source.next_slot='A' then source.winner_team_id else next_match.team_a_id end,
      team_b_id=case when source.next_slot='B' then source.winner_team_id else next_match.team_b_id end,updated_at=now()
    from public.tournament_matches source
    where source.tournament_id=v_tournament_id and source.round_number=1
      and source.winner_team_id is not null and source.next_match_id=next_match.id;
    create temp table de_state(match_id uuid primary key, winner uuid, empty boolean) on commit drop;
    insert into de_state(match_id,winner,empty)
      select id,winner_team_id,false
      from public.tournament_matches
      where tournament_id=v_tournament_id and round_number=1 and winner_team_id is not null;
    changed := true;
    while changed loop
      changed := false;
      for j in 1..lb_rounds loop
        lb_count := bracket_size/power(2,ceil(j/2.0)+1)::integer;
        for match_no in 1..lb_count loop
          select * into lbm from public.tournament_matches
            where tournament_id=v_tournament_id and round_number=rounds+j and position=match_no;
          continue when exists(select 1 from de_state where match_id=lbm.id);
          pending_a := false; none_a := false; part_a := null;
          pending_b := false; none_b := false; part_b := null;
          if j=1 then
            -- Feeders are the two round-1 winners matches: a bye contributes
            -- no loser, a real match has not been played yet.
            select * into fs from de_state where match_id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=1 and position=2*match_no-1);
            if found then none_a := true; else pending_a := true; end if;
            select * into fs from de_state where match_id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=1 and position=2*match_no);
            if found then none_b := true; else pending_b := true; end if;
          elsif j%2=0 then
            -- A drops from a real winners match (pending); B from the previous losers round.
            pending_a := true;
            select * into fs from de_state where match_id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=rounds+j-1 and position=match_no);
            if not found then pending_b := true;
            elsif fs.empty then none_b := true;
            else part_b := fs.winner;
            end if;
          else
            -- Minor round: both feeders are previous losers-round winners.
            select * into fs from de_state where match_id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=rounds+j-1 and position=2*match_no-1);
            if not found then pending_a := true;
            elsif fs.empty then none_a := true;
            else part_a := fs.winner;
            end if;
            select * into fs from de_state where match_id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=rounds+j-1 and position=2*match_no);
            if not found then pending_b := true;
            elsif fs.empty then none_b := true;
            else part_b := fs.winner;
            end if;
          end if;
          continue when pending_a or pending_b;
          if none_a and none_b then
            update public.tournament_matches set is_empty=true,updated_at=now() where id=lbm.id;
            insert into de_state(match_id,winner,empty) values(lbm.id,null,true);
          elsif none_a and part_b is not null then
            bye_winner := part_b;
            update public.tournament_matches set team_b_id=bye_winner,winner_team_id=bye_winner,updated_at=now() where id=lbm.id;
            insert into de_state(match_id,winner,empty) values(lbm.id,bye_winner,false);
          elsif none_b and part_a is not null then
            bye_winner := part_a;
            update public.tournament_matches set team_a_id=bye_winner,winner_team_id=bye_winner,updated_at=now() where id=lbm.id;
            insert into de_state(match_id,winner,empty) values(lbm.id,bye_winner,false);
          else
            continue;  -- both participants present: a real match for later
          end if;
          changed := true;
          -- Advance the bye winner along the losers bracket.
          if j=lb_rounds then
            update public.tournament_matches set team_b_id=bye_winner,updated_at=now() where id=gf_id;
          elsif j%2=1 then
            update public.tournament_matches set team_b_id=bye_winner,updated_at=now()
            where id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=rounds+j+1 and position=match_no);
          else
            update public.tournament_matches set
              team_a_id=case when match_no%2=1 then bye_winner else team_a_id end,
              team_b_id=case when match_no%2=0 then bye_winner else team_b_id end,
              updated_at=now()
            where id=(select id from public.tournament_matches where tournament_id=v_tournament_id and round_number=rounds+j+1 and position=ceil(match_no/2.0)::integer);
          end if;
        end loop;
      end loop;
    end loop;

  elsif v_format='round_robin' then
    -- Circle method: fix team 1, rotate the rest each round.
    rr_array := team_ids;
    if size % 2 = 1 then rr_array := array_append(rr_array,null); end if;
    total_rounds_v := array_length(rr_array,1)-1;
    for round_no in 1..total_rounds_v loop
      for match_no in 1..(array_length(rr_array,1)/2) loop
        rr_a := rr_array[match_no];
        rr_b := rr_array[array_length(rr_array,1)+1-match_no];
        if rr_a is not null and rr_b is not null then
          insert into public.tournament_matches(tournament_id,round_number,position,team_a_id,team_b_id)
            values(v_tournament_id,round_no,match_no,rr_a,rr_b);
        end if;
      end loop;
      rr_tmp := rr_array[2];
      for match_no in 2..(array_length(rr_array,1)-1) loop
        rr_array[match_no] := rr_array[match_no+1];
      end loop;
      rr_array[array_length(rr_array,1)] := rr_tmp;
    end loop;
    update public.tournaments set total_rounds=total_rounds_v where id=v_tournament_id;

  else  -- swiss
    total_rounds_v := least(7,greatest(3,ceil(log(2.0,size))::integer+1));
    update public.tournaments set total_rounds=total_rounds_v where id=v_tournament_id;
    half := floor(size/2.0)::integer;
    for match_no in 1..half loop
      insert into public.tournament_matches(tournament_id,round_number,position,team_a_id,team_b_id)
        values(v_tournament_id,1,match_no,team_ids[match_no],team_ids[size+1-match_no]);
    end loop;
    if size % 2 = 1 then
      -- Odd team out receives a first-round bye (recorded as a free win).
      insert into public.tournament_matches(tournament_id,round_number,position,team_a_id,winner_team_id)
        values(v_tournament_id,1,half+1,team_ids[half+1],team_ids[half+1]);
    end if;
  end if;

  return jsonb_build_object('ok',true,'slug',tournament_slug,'organizerToken',organizer_token);
end $$;
grant execute on function public.draftix_create_tournament(text,text[],integer,text) to authenticated;
notify pgrst, 'reload schema';
