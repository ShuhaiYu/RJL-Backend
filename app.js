// app.js (示例)
require('dotenv').config(); // 引入 dotenv
const express = require('express');
const cors = require('cors');

const app = express();

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const superuserRoutes = require('./routes/superuserRoutes');
const agencyAdminRoutes = require('./routes/agencyAdminRoutes');
const agencyUserRoutes = require('./routes/agencyUserRoutes');
const { setupCronJobs } = require('./cron');

// 解析 JSON 请求体
app.use(express.json());

app.use(cors({
  origin: '*'
}));

// 路由
app.use('/auth', authRoutes);
app.use('/superuser', superuserRoutes);
app.use('/admin', adminRoutes);
app.use('/agency/admin', agencyAdminRoutes);
app.use('/agency/user', agencyUserRoutes);

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ message: 'server error', error: err.message });
});

require('./emailListener'); // 启动邮件监听

// 启动 cron job
setupCronJobs();

// 启动服务
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Test the API
app.get('/', (req, res) => {
  res.send('Hello World!');
});

