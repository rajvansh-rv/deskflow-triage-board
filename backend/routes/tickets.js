const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');

// Helper to compute derived fields
const getDerivedFields = (ticket) => {
  const now = new Date();
  const createdAt = new Date(ticket.createdAt);
  const status = ticket.status;
  const resolvedAt = ticket.resolvedAt;
  const priority = ticket.priority;

  // 1. ageMinutes
  // - difference between createdAt and current time
  // - if resolved/closed, use resolvedAt instead of current time
  let end = now;
  if ((status === 'resolved' || status === 'closed') && resolvedAt) {
    end = new Date(resolvedAt);
  }
  const ageMinutes = Math.max(0, Math.floor((end - createdAt) / 60000));

  // 2. slaBreached
  // SLA limits in minutes:
  // urgent = 1 hour (60 mins)
  // high = 4 hours (240 mins)
  // medium = 24 hours (1440 mins)
  // low = 72 hours (4320 mins)
  const slaLimits = {
    urgent: 60,
    high: 240,
    medium: 1440,
    low: 4320
  };
  const limit = slaLimits[priority] || 4320;
  const slaBreached = ageMinutes > limit;

  return { ageMinutes, slaBreached };
};

// Helper to transform Mongoose model to plain object with derived fields
const transformTicket = (ticket) => {
  const ticketObj = ticket.toObject ? ticket.toObject() : ticket;
  const derived = getDerivedFields(ticketObj);
  return {
    ...ticketObj,
    ...derived
  };
};

// Validation for transitions
const isValidTransition = (from, to) => {
  if (from === to) return true;
  if (from === 'open' && to === 'in_progress') return true;
  if (from === 'in_progress' && to === 'resolved') return true;
  if (from === 'resolved' && to === 'closed') return true;
  if (from === 'resolved' && to === 'in_progress') return true;
  return false;
};

// @route   POST /tickets
// @desc    Create a ticket
router.post('/', async (req, res) => {
  try {
    const { subject, description, customerEmail, priority } = req.body;
    
    // Create new instance to invoke schema validation
    const ticket = new Ticket({
      subject,
      description,
      customerEmail,
      priority
    });

    await ticket.save();
    res.status(201).json(transformTicket(ticket));
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    console.error('Error creating ticket:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /tickets
// @desc    Get all tickets with combined filters (?status=, ?priority=, ?breached=true)
router.get('/', async (req, res) => {
  try {
    const { status, priority, breached } = req.query;
    let query = {};

    if (status) {
      query.status = status;
    }
    if (priority) {
      query.priority = priority;
    }

    const tickets = await Ticket.find(query).sort({ createdAt: -1 });
    let transformed = tickets.map(transformTicket);

    if (breached === 'true') {
      transformed = transformed.filter(t => t.slaBreached);
    } else if (breached === 'false') {
      transformed = transformed.filter(t => !t.slaBreached);
    }

    res.json(transformed);
  } catch (err) {
    console.error('Error fetching tickets:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /tickets/stats
// @desc    Get summary statistics
router.get('/stats', async (req, res) => {
  try {
    const tickets = await Ticket.find({});
    const transformed = tickets.map(transformTicket);

    const statusCounts = {
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0
    };

    const priorityCounts = {
      low: 0,
      medium: 0,
      high: 0,
      urgent: 0
    };

    let breachedCount = 0;

    transformed.forEach(t => {
      if (statusCounts[t.status] !== undefined) statusCounts[t.status]++;
      if (priorityCounts[t.priority] !== undefined) priorityCounts[t.priority]++;
      if (t.slaBreached) breachedCount++;
    });

    res.json({
      statusCounts,
      priorityCounts,
      breachedCount
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PATCH /tickets/:id
// @desc    Update a ticket (enforces transition and SLA logics)
router.patch('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const { status, subject, description, customerEmail, priority } = req.body;

    // Check status transition rules
    if (status !== undefined && status !== ticket.status) {
      if (!isValidTransition(ticket.status, status)) {
        return res.status(400).json({
          error: `Invalid status transition from '${ticket.status}' to '${status}'`
        });
      }

      // Handle resolvedAt logic
      if (status === 'resolved') {
        ticket.resolvedAt = new Date();
      } else if (ticket.status === 'resolved' && status === 'in_progress') {
        ticket.resolvedAt = undefined; // clears field in MongoDB
      }
      ticket.status = status;
    }

    // Update other fields
    if (subject !== undefined) ticket.subject = subject;
    if (description !== undefined) ticket.description = description;
    if (customerEmail !== undefined) ticket.customerEmail = customerEmail;
    if (priority !== undefined) ticket.priority = priority;

    await ticket.save();
    res.json(transformTicket(ticket));
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    console.error('Error updating ticket:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /tickets/:id
// @desc    Delete a ticket
router.delete('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json({ message: 'Ticket deleted successfully', id: req.params.id });
  } catch (err) {
    console.error('Error deleting ticket:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
