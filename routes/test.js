// 在某个 routes/test.js 或 controllers/testController.js 中
const express = require('express');
const router = express.Router();
const { sendReminders } = require('../taskReminder');

router.post('/send-reminders', async (req, res, next) => {
  try {
    await sendReminders();
    // 也可以把结果(例如发送了几封邮件)返回
    return res.status(200).json({ message: 'Reminders sent (test endpoint).' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
