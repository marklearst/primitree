import { describe, it, expect, vi } from 'vitest';
import { fetcher } from '../../src/api/fetcher';

const DUMMY_URL = 'https://api.example.com/test';
const DUMMY_TOKEN = 'dummy-token';

// Helper to mock fetch
function mockFetch(response: Partial<Response> & { json?: () => any }, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: response.json || (() => Promise.resolve(response)),
    ...response,
  }) as any;
}

describe('fetcher', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('throws if token is missing', async () => {
    await expect(fetcher(DUMMY_URL, ''))
      .rejects.toThrow(/token/i);
  });

  it('returns JSON on success', async () => {
    const data = { foo: 'bar' };
    mockFetch({ json: () => Promise.resolve(data) });
    const result = await fetcher(DUMMY_URL, DUMMY_TOKEN);
    expect(result).toEqual(data);
    expect(global.fetch).toHaveBeenCalledWith(DUMMY_URL, expect.objectContaining({
      headers: expect.objectContaining({
        'X-FIGMA-TOKEN': DUMMY_TOKEN,
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('throws with error message if response is not ok and error message exists', async () => {
    mockFetch({ json: () => Promise.resolve({ message: 'fail!' }) }, false);
    await expect(fetcher(DUMMY_URL, DUMMY_TOKEN)).rejects.toThrow('fail!');
  });

  it('throws with fallback error if response is not ok and no message', async () => {
    mockFetch({ json: () => Promise.resolve({}) }, false);
    await expect(fetcher(DUMMY_URL, DUMMY_TOKEN)).rejects.toThrow(/fetch/i);
  });
});
