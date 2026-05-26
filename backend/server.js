const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.warn('WARNING: MONGODB_URI is not defined in environment variables. Server will fall back to local MongoDB or memory db if available.');
}

mongoose.connect(MONGODB_URI || 'mongodb://localhost:27017/deskflow')
  .then(() => console.log('MongoDB connected successfully.'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit process if DB connection fails to prevent half-broken server
  });

// Routes
app.use('/tickets', require('./routes/tickets'));

// Root Health Check Route (helpful for verifying Render/Railway deployment)
app.get('/', (req, res) => {
  res.json({
    name: 'DeskFlow API',
    status: 'running',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date()
  });
});

// Error handling middleware to catch unhandled JSON parse errors or general server errors
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'An unexpected error occurred on the server.' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
