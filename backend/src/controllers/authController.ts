import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/authService.js';
import type { AuthRequest } from '../types/index.js';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body;
    const { refreshToken, ...data } = await authService.login(username, password, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const profile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id || req.user?.userId;
    const data = await authService.getProfile(userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken)
      return res.status(401).json({ success: false, message: 'Refresh token مطلوب' });

    const data = await authService.refreshAccessToken(refreshToken);

    res.cookie('refresh_token', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const { refreshToken: _, ...responseData } = data; // لا نرسله في الـ body
    res.json({ success: true, data: responseData });
  } catch (err) {
    next(err);
  }
};

export const logoutHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id || req.user?.userId;
    await authService.logout(userId);
    res.clearCookie('refresh_token');
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
  } catch (err) {
    next(err);
  }
};
