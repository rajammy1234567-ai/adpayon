// Isolated temporary MongoDB replica set only; no live database is used.
process.env.NODE_ENV = 'test'; process.env.LOG_LEVEL = 'error';
const assert = require('node:assert/strict');
const { MongoMemoryReplSet } = require(process.env.ADPAYON_MONGODB_MEMORY_MODULE || 'mongodb-memory-server');
const mongoose = require('mongoose');
const { createApp } = require('../apps/api/dist/src/app');
const { User, Offer, Category, WalletLedgerEntry } = require('../apps/api/dist/src/models');
const { OfferSubmission } = require('../apps/api/dist/src/models/OfferSubmission');
const { generateAccessToken } = require('../apps/api/dist/src/services/tokenService');
(async () => {
 const db = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ dbName: 'adpayon_test_offer_release' }] });
 let server, checks = 0;
 const pass = name => console.log(`PASS ${++checks}: ${name}`);
 try {
  await mongoose.connect(db.getUri());
  await Promise.all([User.init(), Offer.init(), Category.init(), WalletLedgerEntry.init(), OfferSubmission.init()]);
  const users = await User.create(['ADMIN','USER','USER'].map((role,i) => ({ name: `QA ${i}`, email: `qa${i}@qa.test`, passwordHash: 'test-only', role, status: 'ACTIVE', referralCode: `QA${i}`, metadata: { kycStatus: 'VERIFIED' } })));
  server = createApp().listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const tokens = users.map(u=>generateAccessToken({ userId: u._id.toString(), role: u.role, mobile: '' }));
  const request = async (path,who=0,method='GET',body) => {
   const r=await fetch(`${origin}/api${path}`,{ method, headers: { ...(who===null?{}:{Authorization:`Bearer ${tokens[who]}`}), 'Content-Type':'application/json' },body:body?JSON.stringify(body):undefined });
   return {status:r.status,...await r.json()};
  };
  let r=await request('/admin/categories',0,'POST',{name:'QA Category',slug:'qa-category',status:'PUBLISHED',displayOrder:1});
  assert.equal(r.status,201,JSON.stringify(r)); const categoryId=r.data.id;
  const content={logoUrl:'https://example.test/logo.png',benefits:['Benefit 1','Benefit 2'],eligibility:['New applicants'],documents:['ID proof'],terms:['Only verified actions'],trackingNotes:['Review timeline'],payoutNotes:['Payout after approval'],marketingMessage:'QA customer message',marketingBanners:[{title:'QA Banner',imageUrl:'https://example.test/banner.png'}]};
  r=await request('/admin/offers',0,'POST',{title:'QA Product <test>',categoryId,description:'Admin managed QA product',rewardPoints:1000,status:'PUBLISHED',content,instructions:['Step 1','Step 2'],trainingLinks:[{title:'Training',url:'https://example.test/video',description:'Guide',thumbnailUrl:'https://example.test/thumb.png'}],faqs:[{question:'When?',answer:'After verification.'}],completionConditions:{actionType:'CUSTOM',targetUrl:'https://example.test/apply'}});
  assert.equal(r.status,201,JSON.stringify(r)); const offerId=r.data.id;
  r=await request(`/offers/${offerId}`,1); assert.deepEqual(r.data.content,content); assert.equal(r.data.trainingLinks[0].description,'Guide'); pass('admin content, banners, FAQs and training round-trip through user API');
  assert.equal((await request('/admin/offers',1)).status,403); pass('ordinary users cannot manage offers');
  await request(`/admin/offers/${offerId}`,0,'PUT',{status:'DRAFT'});
  assert.equal((await request(`/offers/${offerId}`,null)).status,404);
  assert.equal((await request(`/admin/offers/${offerId}`,0)).status,200);
  await request(`/admin/offers/${offerId}`,0,'PUT',{status:'PUBLISHED'}); pass('drafts hidden publicly but editable by admin');
  r=await request(`/offers/${offerId}/complete`,1,'POST',{notes:'Completed verified partner action'}); assert.equal(r.status,201,JSON.stringify(r)); const subId=r.data.id;
  assert.equal(await WalletLedgerEntry.countDocuments({userId:users[1]._id}),0); pass('submission creates no credit before verification');
  const reviews=await Promise.all([1,2].map(()=>request(`/admin/offer-submissions/${subId}/review`,0,'POST',{status:'APPROVED',reviewNotes:'Verified partner evidence QA'})));
  assert.deepEqual(reviews.map(x=>x.status).sort(),[200,409],JSON.stringify(reviews));
  assert.equal(await WalletLedgerEntry.countDocuments({userId:users[1]._id,entryType:'TASK_REWARD'}),1);
  r=await request('/wallet/summary',1); assert.equal(r.data.availableBalancePaise,10000); assert.equal(r.data.pointsBalance,0); pass('concurrent approvals credit 1000 redeemable points = ₹100 exactly once');
  assert.equal((await request(`/offers/${offerId}/activity`,1)).data.personalStats.totalSales,1);
  assert.equal((await request(`/offers/${offerId}/activity`,2)).data.personalStats.totalSales,0); pass('offer statistics are account-specific');
  assert.equal((await request('/wallet/redemption-quote',1,'POST',{amountPaise:5000,currency:'USD'})).status,409); pass('unconfigured USD fails closed');
  r=await request('/admin/redemption-policy',0,'PUT',{usdEnabled:true,paisePerUsd:8000,usdInstructions:'QA only: test recipient identifier, no actual payment.'}); assert.equal(r.status,200,JSON.stringify(r));
  const q=await request('/wallet/redemption-quote',1,'POST',{amountPaise:10000,currency:'USD'}); assert.equal(q.data.payoutMinor,125);
  const payload={amountPaise:10000,currency:'USD',quoteToken:q.data.token,payoutMode:'USD_ACCOUNT',beneficiaryDetails:{usdAccount:'QA recipient'}};
  assert.equal((await request('/wallet/withdraw',2,'POST',payload)).status,400); pass('quote bound to correct account');
  const withdrawals=await Promise.all([request('/wallet/withdraw',1,'POST',payload),request('/wallet/withdraw',1,'POST',payload)]);
  assert.equal(withdrawals.filter(x=>x.status===201).length,1,JSON.stringify(withdrawals));
  const wid=withdrawals.find(x=>x.status===201).data.withdrawal.id;
  r=await request('/wallet/summary',1); assert.equal(r.data.availableBalancePaise,0); assert.equal(r.data.reservedWithdrawalPaise,10000); pass('concurrent withdrawals cannot overspend or duplicate holds');
  assert.equal((await request(`/admin/withdrawals/${wid}/review`,0,'POST',{status:'PAID',adminReviewNotes:'QA recording only'})).status,400); pass('paid status requires actual payment reference');
  r=await request(`/admin/withdrawals/${wid}/review`,0,'POST',{status:'REJECTED',adminReviewNotes:'Reject QA payout; no money transferred'}); assert.equal(r.status,200,JSON.stringify(r));
  r=await request('/wallet/summary',1); assert.equal(r.data.availableBalancePaise,10000); assert.equal(r.data.reservedWithdrawalPaise,0); pass('rejection releases exact hold without minting funds');
  assert.equal((await request(`/admin/withdrawals/${wid}/review`,0,'POST',{status:'PAID',adminReviewNotes:'Invalid second finalization',payoutReference:'QA-NOT-A-PAYMENT'})).status,409); pass('finalized withdrawals reject repeated review');
  const html=await(await fetch(`${origin}/api/offers/landing/qa-product-test`)).text(); assert.ok(html.includes('QA Product &lt;test&gt;')); assert.ok(html.includes('Eligibility')); pass('public page renders saved content with HTML escaping');
  if(process.env.ADPAYON_QA_HOLD){require('fs').writeFileSync('/tmp/adpayon-qa-session.json',JSON.stringify({origin,tokens,offerId,categoryId,users:users.map(u=>({id:u._id.toString(),role:u.role,name:u.name}))}),{mode:0o600});console.log('Isolated QA service ready.');await new Promise(r=>{process.once('SIGTERM',r);process.once('SIGINT',r);});}
  console.log(`${checks} integration checks passed. No live accounts or databases touched.`);
 } finally {if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();await db.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
