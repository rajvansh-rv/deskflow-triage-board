import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function App() {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({
    statusCounts: { open: 0, in_progress: 0, resolved: 0, closed: 0 },
    priorityCounts: { low: 0, medium: 0, high: 0, urgent: 0 },
    breachedCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters State
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterBreached, setFilterBreached] = useState(false);

  // Create Ticket Form State
  const [form, setForm] = useState({
    subject: '',
    description: '',
    customerEmail: '',
    priority: 'medium'
  });
  const [formError, setFormError] = useState({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Fetch Stats from API
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/tickets/stats`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  // Fetch Tickets from API
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/tickets`;
      const params = [];
      if (filterPriority !== 'all') params.push(`priority=${filterPriority}`);
      if (filterBreached) params.push('breached=true');
      
      if (params.length > 0) {
        url += `?${params.join('&')}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch tickets');
      }
      const data = await res.json();
      setTickets(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterPriority, filterBreached]);

  // Initial load and filter change trigger
  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Initial load for stats
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Periodic poll to refresh age and SLA calculations every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTickets();
      fetchStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchTickets, fetchStats]);

  // Form Validation
  const validateForm = () => {
    const errors = {};
    if (!form.subject.trim()) {
      errors.subject = 'Subject is required';
    }
    if (!form.description.trim()) {
      errors.description = 'Description is required';
    }
    if (!form.customerEmail.trim()) {
      errors.customerEmail = 'Customer email is required';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.customerEmail)) {
        errors.customerEmail = 'Invalid email address';
      }
    }
    setFormError(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle Form Input Changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (formError[name]) {
      setFormError(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Submit New Ticket
  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setFormSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create ticket');
      }

      // Prepend to tickets list (instantly update board)
      setTickets(prev => [data, ...prev]);
      
      // Reset form
      setForm({
        subject: '',
        description: '',
        customerEmail: '',
        priority: 'medium'
      });
      
      // Update Stats
      fetchStats();
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Move Ticket Status (PATCH)
  const handleMoveStatus = async (id, nextStatus) => {
    try {
      const res = await fetch(`${API_BASE}/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update ticket status');
      }

      // Update state locally (instant response)
      setTickets(prev => prev.map(t => t._id === id ? data : t));
      fetchStats();
    } catch (err) {
      setError(err.message);
    }
  };

  // Delete Ticket
  const handleDeleteTicket = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this ticket?')) return;
    try {
      const res = await fetch(`${API_BASE}/tickets/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete ticket');
      }

      // Update state locally (instant response)
      setTickets(prev => prev.filter(t => t._id !== id));
      fetchStats();
    } catch (err) {
      setError(err.message);
    }
  };

  // Helper to format ageMinutes
  const formatAge = (minutes) => {
    if (minutes < 60) {
      return `${minutes} min ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} hr ${minutes % 60} min ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ${hours % 24} hr ago`;
  };

  // Group tickets by status
  const columns = {
    open: tickets.filter(t => t.status === 'open'),
    in_progress: tickets.filter(t => t.status === 'in_progress'),
    resolved: tickets.filter(t => t.status === 'resolved'),
    closed: tickets.filter(t => t.status === 'closed')
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header>
        <div className="logo-section">
          <h1>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', color: '#818cf8' }}>
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="M9 14h6" />
              <path d="M9 18h6" />
              <path d="M12 10h3" />
            </svg>
            DeskFlow
          </h1>
          <p>Support Ticket Triage Board</p>
        </div>
        <div>
          <button className="btn btn-secondary" onClick={() => { fetchTickets(); fetchStats(); }} title="Refresh board and stats">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            Sync Board
          </button>
        </div>
      </header>

      {/* Stats Strip */}
      <div className="stats-strip">
        <div className="stat-card open">
          <div className="stat-info">
            <h3>Open</h3>
            <div className="stat-value">{stats.statusCounts.open}</div>
          </div>
          <div className="stat-icon">📄</div>
        </div>
        <div className="stat-card progress">
          <div className="stat-info">
            <h3>In Progress</h3>
            <div className="stat-value">{stats.statusCounts.in_progress}</div>
          </div>
          <div className="stat-icon">⚡</div>
        </div>
        <div className="stat-card resolved">
          <div className="stat-info">
            <h3>Resolved</h3>
            <div className="stat-value">{stats.statusCounts.resolved}</div>
          </div>
          <div className="stat-icon">✔</div>
        </div>
        <div className="stat-card closed">
          <div className="stat-info">
            <h3>Closed</h3>
            <div className="stat-value">{stats.statusCounts.closed}</div>
          </div>
          <div className="stat-icon">🔒</div>
        </div>
        <div className="stat-card breached">
          <div className="stat-info">
            <h3>SLA Breached</h3>
            <div className="stat-value" style={{ color: '#f43f5e' }}>{stats.breachedCount}</div>
          </div>
          <div className="stat-icon">⚠️</div>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="error-banner">
          <span><strong>Error:</strong> {error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* Controls: Filters and Form */}
      <div className="controls-container">
        {/* Filters Panel */}
        <div className="filters-panel">
          <div className="filter-group">
            <label htmlFor="priority-filter">Priority Filter</label>
            <select
              id="priority-filter"
              className="filter-control"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
            >
              <option value="all">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              className="checkbox-input"
              checked={filterBreached}
              onChange={(e) => setFilterBreached(e.target.checked)}
            />
            <span>Breached Only (SLA Exceeded)</span>
          </label>
        </div>

        {/* Create Ticket Panel */}
        <div className="form-panel">
          <div className="form-title">
            <span>Create Support Ticket</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#818cf8' }}>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <form onSubmit={handleSubmitTicket} className="form-inputs">
            <div className="form-group">
              <label>Customer Email</label>
              <input
                type="text"
                name="customerEmail"
                placeholder="customer@domain.com"
                className={`form-input ${formError.customerEmail ? 'error' : ''}`}
                value={form.customerEmail}
                onChange={handleInputChange}
              />
              {formError.customerEmail && <span className="form-error-msg">{formError.customerEmail}</span>}
            </div>

            <div className="form-group">
              <label>Subject</label>
              <input
                type="text"
                name="subject"
                placeholder="Brief issue title"
                className={`form-input ${formError.subject ? 'error' : ''}`}
                value={form.subject}
                onChange={handleInputChange}
              />
              {formError.subject && <span className="form-error-msg">{formError.subject}</span>}
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                name="description"
                placeholder="Provide details about the issue..."
                className={`form-input ${formError.description ? 'error' : ''}`}
                value={form.description}
                onChange={handleInputChange}
              />
              {formError.description && <span className="form-error-msg">{formError.description}</span>}
            </div>

            <div className="form-group">
              <label>Priority Level</label>
              <select
                name="priority"
                className="form-input"
                value={form.priority}
                onChange={handleInputChange}
              >
                <option value="low">Low (72 hr target)</option>
                <option value="medium">Medium (24 hr target)</option>
                <option value="high">High (4 hr target)</option>
                <option value="urgent">Urgent (1 hr target)</option>
              </select>
            </div>

            <button type="submit" className="btn" disabled={formSubmitting}>
              {formSubmitting ? (
                <>
                  <span className="loading-spinner"></span>
                  Saving...
                </>
              ) : (
                'File Ticket'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Board Columns */}
      {loading && tickets.length === 0 ? (
        <div className="loading-container">
          <span className="loading-spinner" style={{ width: '40px', height: '40px', borderTopColor: '#6366f1' }}></span>
        </div>
      ) : (
        <div className="board">
          {/* Column: Open */}
          <div className="column open">
            <div className="column-header">
              <div className="column-title">
                <span className="column-dot"></span>
                <span>Open</span>
              </div>
              <span className="column-count">{columns.open.length}</span>
            </div>
            <div className="cards-container">
              {columns.open.length === 0 ? (
                <div className="empty-column">No open tickets</div>
              ) : (
                columns.open.map(ticket => (
                  <TicketCard
                    key={ticket._id}
                    ticket={ticket}
                    formatAge={formatAge}
                    onDelete={handleDeleteTicket}
                    actions={
                      <button
                        className="action-btn action-btn-primary"
                        onClick={() => handleMoveStatus(ticket._id, 'in_progress')}
                      >
                        Start Progress
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    }
                  />
                ))
              )}
            </div>
          </div>

          {/* Column: In Progress */}
          <div className="column progress">
            <div className="column-header">
              <div className="column-title">
                <span className="column-dot"></span>
                <span>In Progress</span>
              </div>
              <span className="column-count">{columns.in_progress.length}</span>
            </div>
            <div className="cards-container">
              {columns.in_progress.length === 0 ? (
                <div className="empty-column">No active tasks</div>
              ) : (
                columns.in_progress.map(ticket => (
                  <TicketCard
                    key={ticket._id}
                    ticket={ticket}
                    formatAge={formatAge}
                    onDelete={handleDeleteTicket}
                    actions={
                      <button
                        className="action-btn action-btn-success"
                        onClick={() => handleMoveStatus(ticket._id, 'resolved')}
                      >
                        Resolve Issue
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                    }
                  />
                ))
              )}
            </div>
          </div>

          {/* Column: Resolved */}
          <div className="column resolved">
            <div className="column-header">
              <div className="column-title">
                <span className="column-dot"></span>
                <span>Resolved</span>
              </div>
              <span className="column-count">{columns.resolved.length}</span>
            </div>
            <div className="cards-container">
              {columns.resolved.length === 0 ? (
                <div className="empty-column">No resolved tickets</div>
              ) : (
                columns.resolved.map(ticket => (
                  <TicketCard
                    key={ticket._id}
                    ticket={ticket}
                    formatAge={formatAge}
                    onDelete={handleDeleteTicket}
                    actions={
                      <>
                        <button
                          className="action-btn action-btn-danger"
                          onClick={() => handleMoveStatus(ticket._id, 'in_progress')}
                          title="Reopen to In Progress"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="1 4 1 10 7 10" />
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                          </svg>
                          Reopen
                        </button>
                        <button
                          className="action-btn action-btn-secondary"
                          onClick={() => handleMoveStatus(ticket._id, 'closed')}
                          title="Close Ticket permanently"
                        >
                          Close Ticket
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </button>
                      </>
                    }
                  />
                ))
              )}
            </div>
          </div>

          {/* Column: Closed */}
          <div className="column closed">
            <div className="column-header">
              <div className="column-title">
                <span className="column-dot"></span>
                <span>Closed</span>
              </div>
              <span className="column-count">{columns.closed.length}</span>
            </div>
            <div className="cards-container">
              {columns.closed.length === 0 ? (
                <div className="empty-column">No closed tickets</div>
              ) : (
                columns.closed.map(ticket => (
                  <TicketCard
                    key={ticket._id}
                    ticket={ticket}
                    formatAge={formatAge}
                    onDelete={handleDeleteTicket}
                    actions={null} // No actions available for closed state
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Inner Ticket Card Component
function TicketCard({ ticket, formatAge, onDelete, actions }) {
  return (
    <div className={`ticket-card ${ticket.slaBreached ? 'breached-card' : ''}`}>
      <div className="ticket-header">
        <div className="ticket-title">{ticket.subject}</div>
        <button
          className="btn-delete"
          onClick={() => onDelete(ticket._id)}
          title="Delete ticket"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>

      <div className="ticket-description">{ticket.description}</div>

      <div className="ticket-meta">
        <span className={`badge priority-${ticket.priority}`}>
          {ticket.priority}
        </span>
        {ticket.slaBreached && (
          <span className="badge-breached">SLA BREACHED</span>
        )}
      </div>

      <div className="ticket-customer">
        <span>{ticket.customerEmail}</span>
        <span className="ticket-age">{formatAge(ticket.ageMinutes)}</span>
      </div>

      {actions && (
        <div className="ticket-actions">
          {actions}
        </div>
      )}
    </div>
  );
}

export default App;
