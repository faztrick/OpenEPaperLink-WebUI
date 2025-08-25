// Simple unified diff generator for small text files
function computeUnifiedDiff(oldStr, newStr, filePath){
  const oldLines = oldStr.split(/\r?\n/);
  const newLines = newStr.split(/\r?\n/);
  const m = oldLines.length, n = newLines.length;
  const dp = Array(m+1).fill(null).map(()=>Array(n+1).fill(0));
  for(let i=m-1;i>=0;--i){ for(let j=n-1;j>=0;--j){ dp[i][j] = oldLines[i]===newLines[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]); } }
  const diff=[]; let i=0,j=0; while(i<m && j<n){ if(oldLines[i]===newLines[j]){ diff.push(' '+oldLines[i]); i++; j++; } else if (dp[i+1][j] >= dp[i][j+1]) { diff.push('-'+oldLines[i]); i++; } else { diff.push('+'+newLines[j]); j++; } }
  while(i<m){ diff.push('-'+oldLines[i]); i++; }
  while(j<n){ diff.push('+'+newLines[j]); j++; }
  return { header:`--- a/${filePath}\n+++ b/${filePath}`, lines: diff };
}
module.exports = { computeUnifiedDiff };
