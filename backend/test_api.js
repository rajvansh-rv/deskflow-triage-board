const assert = require('assert').strict;
const mongoose = require('mongoose');
require('dotenv').config();

const API_URL = 'http://localhost:5000';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/deskflow';

async function runTests() {
  console.log('--- STARTING BACKEND INTEGRATION & SLA TESTS ---');

  // Connect to DB directly for seeding past timestamps
  await mongoose.connect(MONGODB_URI);
  console.log('Test script connected directly to MongoDB.');

  // Clean up any test tickets
  await mongoose.connection.collection('tickets').deleteMany({});
  console.log('Cleaned up database.');

  // Test 1: Create ticket (POST /tickets)
  console.log('Test 1: Creating a ticket...');
  const newTicket = {
    subject: 'Urgent Issue with Login',
    description: 'Cannot log in to the dashboard since this morning.',
    customerEmail: 'customer@company.com',
    priority: 'urgent'
  };
  const postRes = await fetch(`${API_URL}/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newTicket)
  });
  assert.equal(postRes.status, 201, 'Post should return 201 Created');
  const ticket = await postRes.json();
  assert.equal(ticket.subject, newTicket.subject);
  assert.equal(ticket.status, 'open'); // Default status
  assert.equal(ticket.priority, 'urgent');
  assert.equal(ticket.customerEmail, newTicket.customerEmail);
  assert.ok(ticket.ageMinutes >= 0);
  assert.equal(ticket.slaBreached, false); // Just created, urgent limit is 1 hour (60 min)
  console.log('Test 1 passed: Ticket created successfully!');

  // Test 2: Validation checks
  console.log('Test 2: Invalid ticket payload validations...');
  const badTicket = {
    subject: '',
    description: 'Valid description',
    customerEmail: 'invalidemail', // Invalid email
    priority: 'ultra-high' // Invalid priority
  };
  const badRes = await fetch(`${API_URL}/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(badTicket)
  });
  assert.equal(badRes.status, 400, 'Bad payload should return 400 Bad Request');
  const badData = await badRes.json();
  assert.ok(badData.error, 'Error message should be present');
  console.log('Test 2 passed: Received error message:', badData.error);

  // Test 3: Transitions validation
  console.log('Test 3: Testing transition validation rules...');
  
  // Transition: open -> resolved is NOT allowed (skipping in_progress)
  let patchRes = await fetch(`${API_URL}/tickets/${ticket._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'resolved' })
  });
  assert.equal(patchRes.status, 400, 'Transition open -> resolved should be rejected');
  let patchData = await patchRes.json();
  console.log('open -> resolved rejected successfully:', patchData.error);

  // Transition: open -> in_progress is allowed
  patchRes = await fetch(`${API_URL}/tickets/${ticket._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'in_progress' })
  });
  assert.equal(patchRes.status, 200, 'Transition open -> in_progress should be allowed');
  let updatedTicket = await patchRes.json();
  assert.equal(updatedTicket.status, 'in_progress');

  // Transition: in_progress -> open is NOT allowed
  patchRes = await fetch(`${API_URL}/tickets/${updatedTicket._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'open' })
  });
  assert.equal(patchRes.status, 400, 'Transition in_progress -> open should be rejected');
  patchData = await patchRes.json();
  console.log('in_progress -> open rejected successfully:', patchData.error);

  // Transition: in_progress -> resolved is allowed
  patchRes = await fetch(`${API_URL}/tickets/${updatedTicket._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'resolved' })
  });
  assert.equal(patchRes.status, 200, 'Transition in_progress -> resolved should be allowed');
  updatedTicket = await patchRes.json();
  assert.equal(updatedTicket.status, 'resolved');
  assert.ok(updatedTicket.resolvedAt, 'resolvedAt must be set');

  // Transition: resolved -> in_progress is allowed (backward one step)
  patchRes = await fetch(`${API_URL}/tickets/${updatedTicket._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'in_progress' })
  });
  assert.equal(patchRes.status, 200, 'Transition resolved -> in_progress should be allowed');
  updatedTicket = await patchRes.json();
  assert.equal(updatedTicket.status, 'in_progress');
  assert.ok(!updatedTicket.resolvedAt, 'resolvedAt must be cleared when moving backward');

  // Move back to resolved to test closed
  patchRes = await fetch(`${API_URL}/tickets/${updatedTicket._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'resolved' })
  });
  updatedTicket = await patchRes.json();

  // Transition: resolved -> closed is allowed
  patchRes = await fetch(`${API_URL}/tickets/${updatedTicket._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'closed' })
  });
  assert.equal(patchRes.status, 200, 'Transition resolved -> closed should be allowed');
  updatedTicket = await patchRes.json();
  assert.equal(updatedTicket.status, 'closed');

  // Transition: closed -> resolved is NOT allowed
  patchRes = await fetch(`${API_URL}/tickets/${updatedTicket._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'resolved' })
  });
  assert.equal(patchRes.status, 400, 'Transition closed -> resolved should be rejected');
  patchData = await patchRes.json();
  console.log('closed -> resolved rejected successfully:', patchData.error);
  console.log('Test 3 passed: All transition rules enforced correctly!');

  // Test 4: Stats Endpoint (GET /tickets/stats)
  console.log('Test 4: Checking stats...');
  const statsRes = await fetch(`${API_URL}/tickets/stats`);
  assert.equal(statsRes.status, 200);
  const stats = await statsRes.json();
  assert.equal(stats.statusCounts.closed, 1);
  assert.equal(stats.statusCounts.open, 0);
  console.log('Test 4 passed: Stats are correct!', stats);

  // Test 5: SLA Breach Calculations
  console.log('Test 5: Testing SLA Breach calculations...');
  const TicketModel = mongoose.model('Ticket', new mongoose.Schema({}, { strict: false }));

  // Create an urgent ticket (limit 60 mins) created 65 mins ago (unresolved)
  const urgentTicket = new TicketModel({
    subject: 'Unresolved SLA Breach Test',
    description: 'Testing if SLA breach flag turns true after 61 minutes.',
    customerEmail: 'sla@test.com',
    priority: 'urgent',
    status: 'open',
    createdAt: new Date(Date.now() - 65 * 60 * 1000) // 65 mins ago
  });
  await urgentTicket.save();

  // Create a resolved ticket (limit 60 mins) created 120 mins ago and resolved 65 mins after creation
  const resolvedBreachedTicket = new TicketModel({
    subject: 'Resolved SLA Breach Test',
    description: 'Testing if resolved ticket that breached before resolution is flagged.',
    customerEmail: 'sla@test.com',
    priority: 'urgent',
    status: 'resolved',
    createdAt: new Date(Date.now() - 120 * 60 * 1000), // 120 mins ago
    resolvedAt: new Date(Date.now() - 55 * 60 * 1000)  // resolved 65 mins after creation
  });
  await resolvedBreachedTicket.save();

  // Create a resolved ticket (limit 60 mins) created 120 mins ago and resolved 30 mins after creation (NOT breached)
  const resolvedNotBreachedTicket = new TicketModel({
    subject: 'Resolved SLA Safe Test',
    description: 'Testing if resolved ticket that met SLA before resolution is NOT flagged.',
    customerEmail: 'sla@test.com',
    priority: 'urgent',
    status: 'resolved',
    createdAt: new Date(Date.now() - 120 * 60 * 1000), // 120 mins ago
    resolvedAt: new Date(Date.now() - 90 * 60 * 1000)  // resolved 30 mins after creation
  });
  await resolvedNotBreachedTicket.save();

  // Fetch via GET /tickets
  const listRes = await fetch(`${API_URL}/tickets`);
  const ticketsList = await listRes.json();

  const ticket1 = ticketsList.find(t => t.subject === 'Unresolved SLA Breach Test');
  const ticket2 = ticketsList.find(t => t.subject === 'Resolved SLA Breach Test');
  const ticket3 = ticketsList.find(t => t.subject === 'Resolved SLA Safe Test');

  assert.ok(ticket1, 'Unresolved ticket must exist');
  assert.equal(ticket1.slaBreached, true, 'Urgent ticket older than 60 mins should be breached=true');

  assert.ok(ticket2, 'Resolved breached ticket must exist');
  assert.equal(ticket2.slaBreached, true, 'Resolved ticket that exceeded SLA prior to resolution should be breached=true');

  assert.ok(ticket3, 'Resolved safe ticket must exist');
  assert.equal(ticket3.slaBreached, false, 'Resolved ticket that met SLA prior to resolution should be breached=false');

  console.log('Test 5 passed: SLA breach detection for both active and resolved tickets works perfectly!');

  // Test 6: Combined Filters (GET /tickets?status=...&priority=...&breached=...)
  console.log('Test 6: Combined filters validation...');
  // Filter by status=resolved
  const filterRes1 = await fetch(`${API_URL}/tickets?status=resolved`);
  const filterList1 = await filterRes1.json();
  assert.ok(filterList1.every(t => t.status === 'resolved'), 'All returned tickets should have resolved status');

  // Filter by priority=urgent & breached=true
  const filterRes2 = await fetch(`${API_URL}/tickets?priority=urgent&breached=true`);
  const filterList2 = await filterRes2.json();
  assert.ok(filterList2.every(t => t.priority === 'urgent' && t.slaBreached), 'All returned tickets should be urgent and breached');
  assert.equal(filterList2.length, 2, 'Should return exactly 2 breached urgent tickets (1 open, 1 resolved)');

  console.log('Test 6 passed: Combined filters status, priority, and breached work together correctly.');

  // Clean up
  await mongoose.connection.collection('tickets').deleteMany({});
  await mongoose.disconnect();
  console.log('--- ALL BACKEND INTEGRATION & SLA TESTS PASSED SUCCESSFULLY ---');
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
