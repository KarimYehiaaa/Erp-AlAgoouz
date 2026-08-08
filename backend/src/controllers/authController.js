import * as authService from '../services/authService.js';

export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const data = await authService.login(username, password, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const profile = async (req, res, next) => {
  try {
    const data = await authService.getProfile(req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const data = await authService.refreshAccessToken(refreshToken);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const logoutHandler = async (req, res, next) => {
  try {
    await authService.logout(req.user.id);
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
  } catch (err) { next(err); }
};
