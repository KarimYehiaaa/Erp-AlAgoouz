export const ok = (res, data, message, meta = undefined) =>
  res.json({ success: true, data, message, meta });
