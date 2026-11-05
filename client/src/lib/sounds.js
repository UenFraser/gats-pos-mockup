// Put the old .mp3 files in client/public/sounds/ (newOrder, iceOrder, swap, voidsfx, bill, follow-upFood).
// Phones block sound until the person taps the screen once, so failures are ignored quietly.
const cache = {};

export function play(name) {
  try {
    const audio = (cache[name] = cache[name] || new Audio(`/sounds/${name}.mp3`));
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch { /* no audio available */ }
}
