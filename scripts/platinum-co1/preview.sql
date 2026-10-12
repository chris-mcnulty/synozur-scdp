SELECT * FROM co_preview ORDER BY source_key;
SELECT * FROM pg_temp.co_exceptions() ORDER BY source_key, exception;
SELECT classification, owner_id, new_start, new_end, proposed_action, count(*)
FROM co_preview GROUP BY classification, owner_id, new_start, new_end, proposed_action ORDER BY classification, owner_id;
