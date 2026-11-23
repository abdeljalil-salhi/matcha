export interface MapBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

export interface MapCenter { latitude: number; longitude: number }
export interface MapSettings { map_visible: boolean; center: MapCenter | null }
export interface MapProfile extends MapCenter {
  tags?: string[];
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  age: number;
  city: string;
  area: string | null;
  country_code: string;
  photo_id: number;
  fame: number;
  is_demo: boolean;
}
export interface MapProfilePage {
  profiles: MapProfile[];
  has_more: boolean;
  next_after: number | null;
}
