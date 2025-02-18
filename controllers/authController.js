// controllers/authController.js
require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const {
  getUserByEmail,
  getUserById,
  updateUser,
  createUser,
} = require("../models/userModel");

const { getUserPermissions, createUserPermission } = require("../models/userPermissionModel"); // 从中间表查询权限

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "fallback_access_secret";
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "fallback_refresh_secret";
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || "15m";
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || "7d";

module.exports = {
  // 1) Login -> returns { accessToken, refreshToken }
  login: async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "User does not exist" });
      }

      // Check if account is active
      if (!user.is_active) {
        return res
          .status(403)
          .json({ message: "Account has been locked or is inactive" });
      }

      // Validate password
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ message: "Incorrect password" });
      }

      // Retrieve user's permissions and include them in the token payload
      const permissions = await getUserPermissions(user.id);
      const accessPayload = {
        user_id: user.id,
        role: user.role,
        permissions: permissions, // e.g. [{ permission_value: 'create', permission_scope: 'user' }, ...]
      };
      const accessToken = jwt.sign(accessPayload, ACCESS_SECRET, {
        expiresIn: ACCESS_EXPIRES,
      });

      // Generate refresh token (without permissions)
      const refreshPayload = { user_id: user.id, role: user.role };
      const refreshToken = jwt.sign(refreshPayload, REFRESH_SECRET, {
        expiresIn: REFRESH_EXPIRES,
      });

      // Update refresh token in the user record using updateUser
      await updateUser(user.id, { refresh_token: refreshToken });

      return res.status(200).json({
        message: "Login successful",
        accessToken,
        refreshToken,
        role: user.role,
        email: user.email,
      });
    } catch (err) {
      next(err);
    }
  },

  // 2) Register a new user
  register: async (req, res, next) => {
    try {
      const { email, password, name, role, agency_id } = req.body;
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          message: "This email is already registered, please use another email",
        });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
      // Use provided name or fallback to email
      const finalName = name || email;
      const userRole = role || "user";

      // Create user in the database
      const newUser = await createUser({
        email,
        name: finalName,
        password: hashedPassword,
        role: userRole,
        agency_id: agency_id || null,
      });

      let permissionIds = [];
      switch (userRole) {
        case "agency-admin":
          // agency-admin 用户权限：
          // user: create (1), read (2), update (3)
          // agency: read (6), update (7)
          // property: create (9), read (10), update (11)
          // task: create (13), read (14), update (15)
          // contact: create (17), read (18), update (19)
          permissionIds = [1, 2, 3, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19];
          break;
        case "agency-user":
          // agency-user 用户权限：
          // user: read (2)
          // agency: read (6)
          // property: read (10), update (11)
          // task: read (14), update (15)
          // contact: read (18), update (19)
          permissionIds = [2, 6, 10, 11, 14, 15, 18, 19];
          break;
        case "admin":
          // admin 用户权限：拥有所有权限（假设管理员可以操作所有模块）
          permissionIds = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20, 21, 22, 23, 24,
          ];
          break;
        case "superuser":
          // superuser 用户权限：同 admin
          permissionIds = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20, 21, 22, 23, 24,
          ];
          break;
        default:
          // 普通用户（user）：只赋予只读权限
          // user: read (2)
          // agency: read (6)
          // property: read (10)
          // task: read (14)
          // contact: read (18)
          permissionIds = [2, 6, 10, 14, 18];
          break;
      }

      // 为新用户分配对应权限
      await Promise.all(
        permissionIds.map((permissionId) =>
          createUserPermission(newUser.id, permissionId)
        )
      );

      return res.status(201).json({
        message: "Registration successful",
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

  // 3) Refresh access token using refreshToken
  refreshToken: async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ message: "Missing refreshToken" });
      }

      // Verify refresh token and retrieve payload
      let payload;
      try {
        payload = jwt.verify(refreshToken, REFRESH_SECRET);
      } catch (err) {
        return res
          .status(403)
          .json({ message: "Refresh token expired or invalid" });
      }

      // Retrieve user by user_id from token payload
      const user = await getUserById(payload.user_id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Optional: check if stored refresh_token matches the provided one
      if (user.refresh_token !== refreshToken) {
        return res.status(403).json({ message: "Invalid refresh token" });
      }

      // Retrieve permissions and generate a new access token
      const permissions = await getUserPermissions(user.id);
      const newAccessPayload = {
        user_id: user.id,
        role: user.role,
        permissions: permissions,
      };
      const newAccessToken = jwt.sign(newAccessPayload, ACCESS_SECRET, {
        expiresIn: ACCESS_EXPIRES,
      });

      return res.status(200).json({
        accessToken: newAccessToken,
      });
    } catch (err) {
      next(err);
    }
  },

  // 4) Forgot password - send password reset link via email
  forgotPassword: async (req, res, next) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Find user by email
      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Generate a reset token valid for 15 minutes
      const resetToken = jwt.sign(
        { user_id: user.id, email: email },
        ACCESS_SECRET,
        { expiresIn: "15m" }
      );

      // Create transporter using Gmail (adjust as needed)
      const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASSWORD,
        },
      });

      // Construct reset URL (adjust FRONTEND_URL as needed)
      const resetUrl = `${
        process.env.FRONTEND_URL
      }/auth/reset-password/change?token=${resetToken}&email=${encodeURIComponent(
        email
      )}`;

      const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: "Reset Your Password",
        html: `
          <p>Hello,</p>
          <p>You have requested a password reset. Please click the link below to reset your password (valid for 15 minutes):</p>
          <p><a href="${resetUrl}" target="_blank">${resetUrl}</a></p>
          <p>If you did not request this, please ignore this email.</p>
        `,
      };

      await transporter.sendMail(mailOptions);

      return res
        .status(200)
        .json({ message: "Reset link sent to email", resetToken });
    } catch (err) {
      next(err);
    }
  },

  // 5) Reset password
  resetPassword: async (req, res, next) => {
    try {
      const { email, token, password, password_confirmation } = req.body;
      if (!email || !token || !password || !password_confirmation) {
        return res.status(400).json({
          message:
            "Email, token, password, and password confirmation are required",
        });
      }
      if (password !== password_confirmation) {
        return res.status(400).json({ message: "Passwords do not match" });
      }

      // Verify the reset token
      let decoded;
      try {
        decoded = jwt.verify(token, ACCESS_SECRET);
      } catch (error) {
        return res.status(401).json({ message: "Token expired or invalid" });
      }

      // Check if token email matches request email
      if (decoded.email !== email) {
        return res
          .status(401)
          .json({ message: "Token does not match the user" });
      }

      // Find user by email
      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Hash new password and update user record using updateUser
      const hashedPassword = await bcrypt.hash(password, 10);
      await updateUser(user.id, { password: hashedPassword });

      return res.status(200).json({ message: "Password reset successful" });
    } catch (err) {
      next(err);
    }
  },

  // 6) Logout - revoke refresh token
  logout: async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ message: "Missing refreshToken" });
      }

      // Verify refresh token to get user_id
      let payload;
      try {
        payload = jwt.verify(refreshToken, REFRESH_SECRET);
      } catch (err) {
        return res
          .status(403)
          .json({ message: "Refresh token expired or invalid" });
      }

      // Retrieve user by id from token
      const user = await getUserById(payload.user_id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Optional: check if stored refresh_token matches the provided one
      if (user.refresh_token !== refreshToken) {
        return res.status(403).json({ message: "Invalid refresh token" });
      }

      // Revoke refresh token by updating user record using updateUser
      await updateUser(user.id, { refresh_token: null });

      return res
        .status(200)
        .json({ message: "Logout successful, refresh token revoked" });
    } catch (err) {
      next(err);
    }
  },

  // 7) Get current user information
  getCurrentUser: async (req, res, next) => {
    try {
      // Use user_id from token (populated by authenticateToken)
      const user = await getUserById(req.user.user_id);
      // 获取用户权限
      const permissions = await getUserPermissions(req.user.user_id);
      // 将权限附加到用户对象中
      user.permissions = permissions;
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.status(200).json(user);
    } catch (err) {
      next(err);
    }
  },
};
