import * as authService from "../services/authService.js";
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const { refreshToken, ...data } = await authService.login(username, password, {
      ip: req.ip,
      userAgent: req.get("user-agent")
    });
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1e3
      // 7 days
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
const profile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const data = await authService.getProfile(userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
const refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken)
      return res.status(401).json({ success: false, message: "Refresh token \u0645\u0637\u0644\u0648\u0628" });
    const data = await authService.refreshAccessToken(refreshToken);
    res.cookie("refresh_token", data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1e3
    });
    const { refreshToken: _, ...responseData } = data;
    res.json({ success: true, data: responseData });
  } catch (err) {
    next(err);
  }
};
const logoutHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    await authService.logout(userId);
    res.clearCookie("refresh_token");
    res.json({ success: true, message: "\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062E\u0631\u0648\u062C \u0628\u0646\u062C\u0627\u062D" });
  } catch (err) {
    next(err);
  }
};
export {
  login,
  logoutHandler,
  profile,
  refresh
};
