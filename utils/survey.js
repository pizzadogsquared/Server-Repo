export function getLowestScoringQuestion(scores) {
  const entries = Object.entries(scores);
  const values = entries.map(([, val]) => val);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  const threshold = avg - 2;
  const standout = entries.find(([, val]) => val <= threshold);
  if (standout) return { key: standout[0], value: standout[1], reason: "standout" };

  const minVal = Math.min(...values);
  const lowest = entries.find(([, val]) => val === minVal);
  return { key: lowest[0], value: lowest[1], reason: "low" };
}
