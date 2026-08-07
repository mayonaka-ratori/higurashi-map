export type Place = {
  id: string;
  name: string;
  pref: string;
  city: string;
  lat: number;
  lng: number;
};

export type Report = {
  id: string;
  place_id: string;
  heard: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  comment: string | null;
  created_at: string; // ISO文字列
};

export type NewReport = {
  place_id: string;
  heard: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  comment: string | null;
};
