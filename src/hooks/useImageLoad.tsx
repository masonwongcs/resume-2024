import { useEffect, useState } from 'react';

const useImageLoad = (src: string) => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setIsLoaded(true);
    img.src = src;

    return () => {
      img.onload = null;
    };
  }, [src]);

  return isLoaded;
};

export { useImageLoad };
