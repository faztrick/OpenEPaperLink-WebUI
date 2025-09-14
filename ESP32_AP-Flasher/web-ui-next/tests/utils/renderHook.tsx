// Placeholder removed dependency on @testing-library/react to avoid build errors.
// If hook testing is required, add @testing-library/react and re-implement.
export function renderHook<T>(_hook: () => T) {
  throw new Error('renderHook test util requires @testing-library/react (not installed).');
}
