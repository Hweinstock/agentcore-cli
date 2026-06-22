import { useApp, useInput } from 'ink';
import { type Location, type NavigateFunction, useLocation, useNavigate } from 'react-router';

/**
 * Registers the Escape key to go back: navigates to the previous route, or exits the app when there
 * is no previous entry in the history stack.
 *
 * react-router sets `location.key` to `'default'` only on the initial entry, so that identifies the
 * case where there is nothing to go back to (e.g. the app was launched directly onto a nested route).
 */
export function useBack(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const { exit } = useApp();

  useInput((_input, key) => {
    if (key.escape) {
      goBack(location, navigate, exit);
    }
  });
}

export function goBack(location: Location, navigate: NavigateFunction, exit: (error?: unknown) => void): void {
  if (location.key === 'default') {
    exit();
  } else {
    void navigate(-1);
  }
}
