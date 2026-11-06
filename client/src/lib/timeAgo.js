export function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} mins ago`;
  const h = Math.floor(mins / 60);
  return h === 1 ? '1 hour ago' : `${h} hours ago`;
}
