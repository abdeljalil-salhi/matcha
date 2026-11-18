CREATE VIEW public_profiles AS
WITH profile_policy AS (
    SELECT interval '15 seconds' AS online_window,
           100 AS max_fame,
           4 AS fame_per_like
)
SELECT u.id, u.username, u.first_name, u.last_name, u.gender, u.seeks, u.bio,
       extract(year FROM age(u.birth_date))::integer AS age, u.city, u.area, u.country_code,
       u.is_demo,
       greatest(u.last_seen, s.last_seen) AS last_seen,
       coalesce(s.last_seen > now() - policy.online_window, false) AS online,
       p.id AS photo_id,
       least(policy.max_fame, policy.fame_per_like * (SELECT count(*) FROM likes l WHERE l.target_id = u.id)
          + (SELECT count(*) FROM visits v WHERE v.target_id = u.id
                AND NOT is_blocked(v.viewer_id, u.id)))::integer AS fame,
       coalesce((SELECT array_agg(tag ORDER BY tag) FROM user_tags t WHERE t.user_id = u.id),
                ARRAY[]::text[]) AS tags
FROM users u
CROSS JOIN profile_policy policy
LEFT JOIN photos p ON p.user_id = u.id AND p.is_primary
LEFT JOIN LATERAL (
    SELECT max(last_seen) AS last_seen FROM sessions WHERE user_id = u.id AND expires_at > now()
) s ON true
WHERE u.verified_at IS NOT NULL AND u.gender IS NOT NULL AND u.birth_date IS NOT NULL
  AND u.bio IS NOT NULL AND u.city IS NOT NULL AND p.id IS NOT NULL
  AND EXISTS (SELECT 1 FROM user_tags t WHERE t.user_id = u.id);
