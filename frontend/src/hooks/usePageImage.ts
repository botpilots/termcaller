import { useEffect, useState } from 'react';
import axios from 'axios';

interface UsePageImageResult {
  imageUrl: string | null;
  loading: boolean;
  error: boolean;
}

/** Fetch page render via axios (auth header) and expose a blob object URL. */
export function usePageImage(
  projectId: string,
  pageNumber: number,
  enabled: boolean
): UsePageImageResult {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    setLoading(true);
    setError(false);
    setImageUrl(null);

    axios
      .get(`/api/projects/${projectId}/pages/${pageNumber}/image`, { responseType: 'blob' })
      .then(response => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(response.data);
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, pageNumber, enabled]);

  return { imageUrl, loading, error };
}
