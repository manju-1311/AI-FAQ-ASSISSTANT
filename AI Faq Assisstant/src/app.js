const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { errorHandler } = require('./middleware/errorMiddleware');

// Load environment variables
dotenv.config();

const app = express();

// Enable CORS
app.use(cors());

// Body parser middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Keep the JSON health response for API clients while browsers receive the UI.
app.get('/', (req, res, next) => {
  const acceptsHtml = req.headers.accept?.split(',')
    .some((type) => type.trim().startsWith('text/html'));

  if (acceptsHtml) {
    return res.sendFile(path.join(__dirname, '../public/index.html'));
  }

  res.json({
    success: true,
    message: 'AI FAQ Assistant API is running.',
    version: '1.0.0',
  });
});

// Serve the browser client's static assets.
app.use(express.static(path.join(__dirname, '../public')));

// Basic status check route for API consumers.
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'AI FAQ Assistant API is running.',
    version: '1.0.0',
  });
});

// Register API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/faqs', require('./routes/faqRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));

// Handle Socket.IO polling requests gracefully (if client attempts WebSocket connection)
app.use('/socket.io', (req, res) => {
  res.status(404).json({ error: 'Socket.IO not enabled' });
});

// 404 Route handler for unmatched routes
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
});

// Centralized Error Handler
app.use(errorHandler);

module.exports = app;
