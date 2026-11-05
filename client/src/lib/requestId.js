// Random id for "send this order once". crypto.randomUUID() does NOT exist on phones opening
// http://192.168.x.x (not a secure page), but getRandomValues does.
export function newRequestId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
