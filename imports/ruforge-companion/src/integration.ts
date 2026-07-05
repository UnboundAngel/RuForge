import { Movie } from './types';

export const handlePlay = (movie: Movie) => {
  console.log('Play:', movie.title);
};

export const handleMoreInfo = (movie: Movie) => {
  console.log('More Info:', movie.title);
};

export const handleDownload = (movie: Movie) => {
  console.log('Download:', movie.title);
};

export const handleSimilar = (movie: Movie) => {
  console.log('Similar:', movie.title);
};

export const handleNavigation = (path: string) => {
  console.log('Navigate to:', path);
};

export const handleUserAction = () => {
  console.log('User action triggered');
};
