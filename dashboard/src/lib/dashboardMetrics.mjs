export function completionPercent(done, total) {
  if (!total) return 0;
  return done >= total ? 100 : Math.min(99.9, Math.round(done / total * 1000) / 10);
}
export function sentimentSummary(rows) {
  const count = name => rows.find(r => r.sentiment === name)?.count || 0;
  const pos=count('Tích cực'), neu=count('Trung lập'), neg=count('Tiêu cực');
  const total=rows.reduce((n,r)=>n+r.count,0), classified=pos+neu+neg;
  const pct=n=>total ? n/total*100 : 0;
  return {pos,neu,neg,total,classified,unknown:total-classified,posPct:pct(pos),neuPct:pct(neu),negPct:pct(neg),unknownPct:pct(total-classified)};
}
export function comparisonLabel(current, previous) {
  if (previous == null) return 'Không có kỳ đối chiếu';
  const delta=current-previous, value=`${delta>0?'+':''}${delta.toLocaleString('vi-VN')} bài`;
  return previous===0 ? `${value} · kỳ trước 0` : `${value} (${delta>0?'+':''}${(delta/previous*100).toLocaleString('vi-VN',{minimumFractionDigits:1,maximumFractionDigits:1})}%)`;
}
