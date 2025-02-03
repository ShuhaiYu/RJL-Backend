const bcrypt = require('bcrypt');
const {
  insertUser,
  updateUserStatus,
  getUserByEmail,
} = require('../models/userModel');

// 假设可以查询所有中介的函数
async function getAllAgencies() {
  // 简化示例，role=agency
  const { rows } = await require('../config/db').query(`
    SELECT * FROM "AGENCY";
  `);
  return rows;
}

// 假设查询单个中介
async function getAgencyDetailById(id) {
  const { rows } = await require('../config/db').query(`
    SELECT * FROM "AGENCY" WHERE id=$1;
  `, [id]);
  return rows[0];
}

module.exports = {
  // 浏览中介列表
  getAgencies: async (req, res, next) => {
    try {
      // 权限检查（可在middleware中做）
      const agencies = await getAllAgencies();
      res.status(200).json(agencies);
    } catch (err) {
      next(err);
    }
  },

  // 浏览中介详情
  getAgencyDetail: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      const agency = await getAgencyDetailById(agencyId);
      if (!agency) {
        return res.status(404).json({ message: '中介不存在' });
      }
      res.status(200).json(agency);
    } catch (err) {
      next(err);
    }
  },

  // 创建中介账号
  createAgency: async (req, res, next) => {
    try {
      // 假设前端传来的信息
      const { email, name, password } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const newAgency = await insertUser({
        email,
        name,
        password: hashedPassword,
        role: 'agency',
      });
      res.status(201).json({ message: '中介账号创建成功', data: newAgency });
    } catch (err) {
      next(err);
    }
  },

  // 关闭中介账号(理解为冻结账号)
  closeAgency: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      // 将is_actived置为false
      await updateUserStatus(agencyId, false);
      res.status(200).json({ message: '中介账号已关闭/冻结' });
    } catch (err) {
      next(err);
    }
  },

  // 解冻中介账号
  unfreezeAgency: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      // 将is_actived置为true
      await updateUserStatus(agencyId, true);
      res.status(200).json({ message: '中介账号已解冻' });
    } catch (err) {
      next(err);
    }
  },
};
