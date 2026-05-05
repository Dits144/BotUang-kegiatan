function levenshtein(a, b) {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const dp = Array.from({ length: s.length + 1 }, () => Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[s.length][t.length];
}

function suggestCommand(input, candidates = []) {
  const word = String(input || '').trim().split(/\s+/)[0].toLowerCase();
  if (!word) return null;
  let best = null;
  for (const cmd of candidates) {
    const d = levenshtein(word, cmd.toLowerCase());
    const maxLen = Math.max(word.length, cmd.length);
    const score = 1 - d / maxLen;
    if (!best || score > best.score) best = { cmd, score };
  }
  if (!best || best.score < 0.62) return null;
  return best.cmd;
}

module.exports = { suggestCommand };
