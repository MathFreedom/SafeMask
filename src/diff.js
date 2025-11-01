// Minimal word-level diff → HTML with .sm-ins and .sm-del highlights

const escapeHtml = (s) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function tokenize(s) {
  if (!s) return [];
  return s.split(/(\s+)/);
}

export function diffHtml(a, b) {
  const A = tokenize(a), B = tokenize(b);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = (A[i] === B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0, j = 0; let out = '';
  while (i < n && j < m) {
    if (A[i] === B[j]) { out += escapeHtml(A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out += `<span class="sm-del">${escapeHtml(A[i])}</span>`; i++; }
    else { out += `<span class="sm-ins">${escapeHtml(B[j])}</span>`; j++; }
  }
  while (i < n) { out += `<span class=\"sm-del\">${escapeHtml(A[i++])}</span>`; }
  while (j < m) { out += `<span class=\"sm-ins\">${escapeHtml(B[j++])}</span>`; }
  return out;
}


