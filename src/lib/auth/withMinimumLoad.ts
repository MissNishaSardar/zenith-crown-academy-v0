export const MIN_LOAD_MS = 1500;

export const withMinimumLoad = async <T>(work: Promise<T>): Promise<T> => {
  const startedAt = Date.now();
  const result = await work;
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_LOAD_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_LOAD_MS - elapsed));
  }
  return result;
};
