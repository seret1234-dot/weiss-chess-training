// Permanently retired diagnostic. No credentials, database or provider access.
export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  return res.status(404).json({ error: 'Not found' })
}
