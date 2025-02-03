// app.js (示例)
require('dotenv').config(); // 引入 dotenv
const express = require('express');
const cors = require('cors');

const app = express();

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const agencyRoutes = require('./routes/agencyRoutes');
const authMiddleware = require('./middlewares/authMiddleware');

const { createUserTable, /* ... */ } = require('./models/userModel');
const { createRolePermissionTable, /* ... */ } = require('./models/rolePermissionModel');
const { createAgencyTable, insertDummyAgencies } = require('./models/agencyModel');

// 解析 JSON 请求体
app.use(express.json());

app.use(cors({
  origin: '*'
}));

// 建表 & 插入测试数据
(async () => {
  try {
    await createUserTable();
    await createRolePermissionTable();
    await createAgencyTable();
  } catch (err) {
    console.error('初始化数据库失败:', err);
  }
})();

// 路由
app.use('/auth', authRoutes);
app.use('/admin', authMiddleware.authenticateToken, adminRoutes);
app.use('/agency', authMiddleware.authenticateToken, agencyRoutes);

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ message: '服务器错误', error: err.message });
});

// 启动服务
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
