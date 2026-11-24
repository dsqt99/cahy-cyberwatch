import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completionPercent, sentimentSummary, comparisonLabel} from './dashboardMetrics.mjs';
test('incomplete work never rounds to complete',()=>{assert.equal(completionPercent(3989,4000),99.7);assert.equal(completionPercent(99999,100000),99.9);assert.equal(completionPercent(0,0),0);});
test('unknown classification remains separate from neutral',()=>{const s=sentimentSummary([{sentiment:'Trung lập',count:2},{sentiment:'Unknown',count:3}]);assert.equal(s.neu,2);assert.equal(s.unknown,3);assert.equal(s.total,5);assert.equal(s.classified,2);});
test('comparison handles absent and zero baselines',()=>{assert.equal(comparisonLabel(5,null),'Không có kỳ đối chiếu');assert.equal(comparisonLabel(5,0),'+5 bài · kỳ trước 0');assert.equal(comparisonLabel(15,10),'+5 bài (+50,0%)');});
