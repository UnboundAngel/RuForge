export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
}

export interface ProgressPayload {
  percentage: number;
  speed: string;
  eta: string;
  status: string;
}

export interface MediaFile {
  name: string;
  path: string;
  size: number;
  created: number;
}
