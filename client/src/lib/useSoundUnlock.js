import { useEffect, useState } from 'react';
import { onSoundsChange, soundsRunning } from './sounds';

// True while the browser still blocks sound (nobody has tapped the page yet): show a "tap to turn sound on" banner.
export function useSoundUnlock() {
  const [running, setRunning] = useState(soundsRunning());
  useEffect(() => {
    setRunning(soundsRunning());
    return onSoundsChange(() => setRunning(soundsRunning()));
  }, []);
  return !running;
}
