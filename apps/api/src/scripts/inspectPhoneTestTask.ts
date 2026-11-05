import mongoose from 'mongoose';

async function inspect() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const taskIdStr = '6ae0751296b7855486fbff6a';
  const taskIdObj = new mongoose.Types.ObjectId(taskIdStr);

  const collections = await mongoose.connection.db!.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name));

  const assignments = await mongoose.connection.db!.collection('task_assignments').find({
    $or: [{ taskId: taskIdStr }, { taskId: taskIdObj }]
  }).toArray();
  const rawAssignments = await mongoose.connection.db!.collection('taskassignments').find({
    $or: [{ taskId: taskIdStr }, { taskId: taskIdObj }]
  }).toArray();

  const sessions = await mongoose.connection.db!.collection('externallinksessions').find({
    $or: [{ taskId: taskIdStr }, { taskId: taskIdObj }]
  }).toArray();
  const extSessionsAlt = await mongoose.connection.db!.collection('external_link_sessions').find({
    $or: [{ taskId: taskIdStr }, { taskId: taskIdObj }]
  }).toArray();

  const completions = await mongoose.connection.db!.collection('task_completions').find({
    $or: [{ taskId: taskIdStr }, { taskId: taskIdObj }]
  }).toArray();
  const completionsAlt = await mongoose.connection.db!.collection('taskcompletions').find({
    $or: [{ taskId: taskIdStr }, { taskId: taskIdObj }]
  }).toArray();

  const evidence = await mongoose.connection.db!.collection('verification_evidences').find({
    $or: [{ taskId: taskIdStr }, { taskId: taskIdObj }]
  }).toArray();
  const evidenceAlt = await mongoose.connection.db!.collection('verificationevidences').find({
    $or: [{ taskId: taskIdStr }, { taskId: taskIdObj }]
  }).toArray();

  const ledgers = await mongoose.connection.db!.collection('wallet_ledgers').find({
    $or: [
      { 'metadata.taskId': taskIdStr },
      { 'metadata.taskId': taskIdObj }
    ]
  }).toArray();
  const ledgersAlt = await mongoose.connection.db!.collection('walletledgers').find({
    $or: [
      { 'metadata.taskId': taskIdStr },
      { 'metadata.taskId': taskIdObj }
    ]
  }).toArray();

  console.log('=== ASSIGNMENTS ===', JSON.stringify([...assignments, ...rawAssignments], null, 2));
  console.log('=== SESSIONS ===', JSON.stringify([...sessions, ...extSessionsAlt], null, 2));
  console.log('=== COMPLETIONS ===', JSON.stringify([...completions, ...completionsAlt], null, 2));
  console.log('=== EVIDENCE ===', JSON.stringify([...evidence, ...evidenceAlt], null, 2));
  console.log('=== LEDGERS ===', JSON.stringify([...ledgers, ...ledgersAlt], null, 2));

  // Also check recent completions across all tasks for Krishna
  const userKrishna = await mongoose.connection.db!.collection('users').findOne({ phone: '+919876543216' });
  console.log('=== USER KRISHNA ===', userKrishna?._id, userKrishna?.phone, userKrishna?.name);

  if (userKrishna) {
    const userCompletions = await mongoose.connection.db!.collection('task_completions').find({ userId: userKrishna._id }).toArray();
    const userCompletionsAlt = await mongoose.connection.db!.collection('taskcompletions').find({ userId: userKrishna._id }).toArray();
    console.log('=== KRISHNA COMPLETIONS ===', JSON.stringify([...userCompletions, ...userCompletionsAlt], null, 2));
  }

  await mongoose.disconnect();
}

inspect().catch(console.error);
