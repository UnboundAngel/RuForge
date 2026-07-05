export interface Actor {
  id: string;
  name: string;
  character: string;
  imageUrl: string;
}

export interface Movie {
  id: string;
  title: string;
  year: number;
  type: string;
  imageUrl: string;
  topRank?: number;
  description?: string;
  duration?: string;
  backdropUrl?: string;
  actors?: Actor[];
  similar?: Movie[];
  container?: string;
  resolution?: string;
  status?: 'local video' | 'in progress' | 'watched';
}
