// controllers/authController.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getUserByEmail, getUserById, updateUserPassword, updateUserRefreshToken, getUserByRefreshToken, insertUser } = require('../models/userModel');

let loginAttemptsMap = {}; // 锁定逻辑用内存计数示例
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'fallback_access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret';
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';

module.exports = {

  // 1) 登录 -> 返回 { accessToken, refreshToken }
  login: async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: '用户不存在' });
      }

      // 检查是否锁定
      if (!user.is_actived) {
        return res.status(403).json({ message: '账号已被锁定或未激活' });
      }

      // 简单计数锁定示例
      if (!loginAttemptsMap[email]) {
        loginAttemptsMap[email] = 0;
      }
      if (loginAttemptsMap[email] >= 3) {
        return res.status(403).json({ message: '账号已被锁定，请联系管理员或重置密码' });
      }

      // 验证密码
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        loginAttemptsMap[email] += 1;
        return res.status(401).json({ message: '密码错误' });
      }

      // 登录成功
      loginAttemptsMap[email] = 0;

      // 生成短期 Access Token
      const accessToken = jwt.sign(
        { userId: user.id, role: user.role },
        ACCESS_SECRET,
        { expiresIn: ACCESS_EXPIRES }
      );

      // 生成长期 Refresh Token
      const refreshToken = jwt.sign(
        { userId: user.id, role: user.role },
        REFRESH_SECRET,
        { expiresIn: REFRESH_EXPIRES }
      );

      // 将 refreshToken 写到数据库 (USER 表)
      await updateUserRefreshToken(user.id, refreshToken);

      return res.status(200).json({
        message: '登录成功',
        accessToken,
        refreshToken,
        role: user.role,
        email: user.email,
      });
    } catch (err) {
      next(err);
    }
  },

  register: async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // 检查是否已存在该邮箱
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: '该邮箱已注册，请使用其他邮箱' });
      }

      // 加密密码
      const hashedPassword = await bcrypt.hash(password, 10);

      // 插入数据库
      const newUser = await insertUser({
        email,
        // name,
        password: hashedPassword,
        // 可以让前端传 role，也可以在这里强制默认 role = 'agency' 或 'user'
        role: role || 'user',
      });

      // 成功响应
      return res.status(201).json({
        message: '注册成功',
        data: {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // 2) 用 refreshToken 获取新的 accessToken
  refreshToken: async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ message: '缺少 refreshToken' });
      }

      // 在数据库里根据 refreshToken 找到用户
      const user = await getUserByRefreshToken(refreshToken);
      if (!user) {
        return res.status(403).json({ message: '无效的 refreshToken' });
      }

      // 验证 refreshToken 是否过期/被篡改
      let payload;
      try {
        payload = jwt.verify(refreshToken, REFRESH_SECRET);
      } catch (err) {
        return res.status(403).json({ message: 'refreshToken 已过期或不合法' });
      }

      // 生成新的 Access Token
      const newAccessToken = jwt.sign(
        { userId: user.id, role: user.role },
        ACCESS_SECRET,
        { expiresIn: ACCESS_EXPIRES }
      );

      // 一般可以选择是否“滚动刷新”，即再生成新的 refreshToken 并更新数据库。
      // 如果想让 refreshToken 不变，可保持原样。如果想滚动刷新，则：
      // const newRefreshToken = jwt.sign(...);
      // await updateUserRefreshToken(user.id, newRefreshToken);
      // 并把 newRefreshToken 返回给客户端。

      return res.status(200).json({
        accessToken: newAccessToken,
      });
    } catch (err) {
      next(err);
    }
  },

  // 3) 找回密码 (与之前类似)
  forgotPassword: async (req, res, next) => {
    try {
      const { email } = req.body;
      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: '用户不存在' });
      }

      // 示例: 生成一个临时token(用于重置密码)
      const resetToken = jwt.sign({ userId: user.id }, ACCESS_SECRET, { expiresIn: '15m' });
      // 需要发邮件给用户，演示仅返回
      return res.status(200).json({ message: '已发送重置链接', resetToken });
    } catch (err) {
      next(err);
    }
  },

  // 4) 重置密码 (与之前类似)
  resetPassword: async (req, res, next) => {
    try {
      const { resetToken, newPassword } = req.body;
      let payload;
      try {
        payload = jwt.verify(resetToken, ACCESS_SECRET);
      } catch (error) {
        return res.status(400).json({ message: '无效或过期的重置链接' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await updateUserPassword(payload.userId, hashedPassword);

      return res.status(200).json({ message: '密码重置成功' });
    } catch (err) {
      next(err);
    }
  },

  // 5) 登出 / 撤销 refreshToken -> 将数据库里的 refresh_token 置空
  logout: async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ message: '缺少 refreshToken' });
      }

      // 查到用户
      const user = await getUserByRefreshToken(refreshToken);
      if (!user) {
        return res.status(403).json({ message: '无效的 refreshToken' });
      }

      // 将 refreshToken 清空
      await updateUserRefreshToken(user.id, null);

      return res.status(200).json({ message: '登出成功，Refresh Token 已作废' });
    } catch (err) {
      next(err);
    }
  },

  getCurrentUser: async (req, res, next) => {
    try {      
      // 直接从 req.user 中拿到 userId 与 role
      const user = await getUserByEmail(req.body.email);
      console.log('user:', user);
      
      if (!user) {
        return res.status(404).json({ message: '用户不存在' });
      }
      // 如果当前用户是 agency，则通过 agencyModel 获取机构数据
      if (user.role === 'agency') {
        // 调用 agencyModel 中的 getAgencyByUserId 方法
        const { getAgencyByAgencyId } = require('../models/agencyModel');
        const agencyInfo = await getAgencyByAgencyId(user.agency_id);
        return res.status(200).json({
          ...user,
          agencyInfo, // 这里包含机构的详细信息
        });
      } else {
        // 如果是 admin 或其他角色，直接返回用户信息
        return res.status(200).json(user);
      }
    } catch (err) {
      next(err);
    }
  },
};
