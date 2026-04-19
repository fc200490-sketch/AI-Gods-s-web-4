export function compositeScore({ uptime_score = 0, ratings = [], call_count = 0 }) {
  const avg = ratings.length
    ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length
    : 0;
  const rating_norm = avg / 5;
  const call_factor = Math.min(Math.log(call_count + 1) / Math.log(1000), 1);
  return 0.5 * uptime_score + 0.3 * rating_norm + 0.2 * call_factor;
}

export function avgRating(ratings) {
  if (!ratings.length) return 0;
  return ratings.reduce((s, r) => s + r.score, 0) / ratings.length;
}
