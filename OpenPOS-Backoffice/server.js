const path = require('path');
const express = require('express');
const app = require('./api/index');

const PORT = process.env.PORT || 3000;

// Serve static frontend assets from public/
app.use(express.static(path.join(__dirname, 'public')));

// Dedicated routes for Customer Online Order Storefront & Kitchen KDS
app.get('/order', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

app.get('/kitchen', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kitchen.html'));
});

// Catch-all route to serve index.html for SPA routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`  OpenPOS Back Office & Cloud Server Online!`);
  console.log(`  Local URL:        http://localhost:${PORT}`);
  console.log(`  Network / Mobile: http://0.0.0.0:${PORT}`);
  console.log(`  Android Emulator: http://10.0.2.2:${PORT}`);
  console.log(`=======================================================`);
});
