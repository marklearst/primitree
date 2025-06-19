import { useState, useEffect } from 'react';
import useFigmaToken from './useFigmaToken';
import { FigmaOperationResponse } from '../types';

const useVariableModes = (collectionId: string) => {
  const [response, setResponse] = useState<FigmaOperationResponse | null>(null);
  const token = useFigmaToken();

  useEffect(() => {
    const fetchModes = async () => {
      const url = `https://api.figma.com/v1/collections/${collectionId}/modes`;
      try {
        const result = await fetch(url, {
          headers: {
            'X-FIGMA-TOKEN': token,
          },
        });
        if (!result.ok) throw new Error('Failed to fetch Figma modes');
        setResponse({ success: true, message: 'Modes fetched successfully' });
      } catch (error) {
        setResponse({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
      }
    };
    fetchModes();
  }, [collectionId, token]);

  return { response };
};

export default useVariableModes;
