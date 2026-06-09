import * as authService from '../services/authService.js';

export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const data = await authService.login(username, password);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const profile = async (req, res, next) => {
  try {
    const data = await authService.getProfile(req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
