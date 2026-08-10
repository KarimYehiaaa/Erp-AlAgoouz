import express from 'express';

const app = express();

app.all('*', (req, res) => {
  res.json({ status: 'ok', message: 'Backend Serverless Function is live!', timestamp: new Date().toISOString() });
});

export default app;
