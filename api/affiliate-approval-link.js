// Permanently retired diagnostic. Keep a tombstone so SPA routing cannot revive it.
export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  return res.status(404).json({ error: 'Not found' })
}
