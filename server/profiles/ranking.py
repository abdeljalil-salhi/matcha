from decimal import Decimal

from psycopg import sql

SAME_AREA_PRIORITY = 0
SAME_CITY_PRIORITY = 1
OTHER_CITY_PRIORITY = 2
MAX_FAME = 100
MAX_DISTANCE_KM = 20_040
MAX_LOCATION_FILTER_LENGTH = 245
PROXIMITY_WEIGHT = Decimal("35.0")
PROXIMITY_DECAY_KM = Decimal("20.0")
SHARED_TAG_CAP = 10
SHARED_TAG_WEIGHT = 5
FAME_WEIGHT = Decimal("0.15")


ORDERS = {
    "recommended": sql.SQL("area_priority, score DESC, distance_km"),
    "age": sql.SQL("age"),
    "location": sql.SQL("distance_km"),
    "fame": sql.SQL("fame"),
    "common_tags": sql.SQL("common_tags"),
}


DISCOVER = """
WITH viewer AS (
    SELECT u.*, coalesce((SELECT array_agg(tag) FROM user_tags WHERE user_id = u.id),
                         ARRAY[]::text[]) AS tags
    FROM users u WHERE id = %(me)s
), candidates AS (
    SELECT p.*, round(%(earth_radius_km)s * acos(least(1.0, greatest(-1.0,
           sin(radians(v.latitude)) * sin(radians(u.latitude)) +
           cos(radians(v.latitude)) * cos(radians(u.latitude)) *
           cos(radians(v.longitude - u.longitude))))))::integer AS distance_km,
           (SELECT count(*) FROM unnest(p.tags) AS t(tag) WHERE t.tag = ANY(v.tags)) AS
               common_tags,
           CASE WHEN p.country_code = v.country_code AND lower(p.city) = lower(v.city)
                THEN CASE WHEN lower(p.area) = lower(v.area)
                          THEN %(same_area_priority)s ELSE %(same_city_priority)s END
                ELSE %(other_city_priority)s
                    END AS area_priority
    FROM public_profiles p JOIN users u ON u.id = p.id CROSS JOIN viewer v
    WHERE p.id <> %(me)s AND NOT is_blocked(%(me)s, p.id)
      AND (NOT %(suggested)s OR ((v.seeks IS NULL OR p.gender = ANY(v.seeks))
           AND (p.seeks IS NULL OR v.gender = ANY(p.seeks))))
      AND p.age BETWEEN %(min_age)s AND %(max_age)s
      AND p.fame BETWEEN %(min_fame)s AND %(max_fame)s
      AND (%(location)s = '' OR %(location)s IN
          (lower(p.city), lower(p.area), lower(p.country_code)) OR
          %(location)s = lower(concat_ws(', ', p.area, p.city)))
      AND p.tags @> %(tags)s::text[]
), scored AS (
    SELECT *, %(proximity_weight)s::numeric
           / (1.0 + distance_km / %(proximity_decay_km)s::numeric)
           + least(common_tags, %(shared_tag_cap)s) * %(shared_tag_weight)s
           + fame * %(fame_weight)s::numeric AS score
    FROM candidates WHERE common_tags >= %(min_common_tags)s AND distance_km <=
        %(max_distance_km)s
)
SELECT id, username, first_name, last_name, age, gender, city, area, country_code,
       tags, fame, photo_id, distance_km, common_tags, is_demo
FROM scored ORDER BY {}{}, id LIMIT %(limit)s OFFSET %(offset)s
"""
