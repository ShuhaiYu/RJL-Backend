// emailListener.js
require('dotenv').config();
const Imap = require('node-imap');
const { simpleParser } = require('mailparser');
const axios = require('axios');

// 从环境变量读取配置（这里以Gmail为例）
const { 
  IMAP_HOST,       // 通常是 'imap.gmail.com'
  IMAP_PORT,       // 通常是 993
  IMAP_USER,       // 你的邮箱地址
  IMAP_PASSWORD,   // 你的应用专用密码
  BACKEND_API_URL  // 你的后端地址，比如 'http://localhost:4000'
} = process.env;

// 创建 IMAP 实例
const imap = new Imap({
  user: IMAP_USER,
  password: IMAP_PASSWORD,
  host: IMAP_HOST,
  port: IMAP_PORT,
  tls: true,           // 对于 Gmail 通常需要启用
  tlsOptions: {
    servername: IMAP_HOST, // 一些邮箱需要这项保证证书名匹配
  },
  keepalive: {
    idleInterval: 60000, // 1分钟发一次 NOOP
    idleBreak: true
  }
});

/**
 * 打开收件箱 (INBOX)
 */
function openInbox(cb) {
  imap.openBox('INBOX', false, cb);
}

/**
 * 监听邮件
 */
imap.once('ready', () => {
  console.log('[IMAP] Ready, opening INBOX...');
  openInbox((err, box) => {
    if (err) throw err;

    console.log(`[IMAP] INBOX opened, total messages: ${box.messages.total}`);

    // ---- 监听新邮件的事件 ----
    imap.on('mail', (numNewMsgs) => {
      console.log(`[IMAP] New mail arrived. New count: ${numNewMsgs}`);
      // 每当有新邮件时，去搜寻一下“最近的新邮件”
      const fetch = imap.seq.fetch(box.messages.total + ':*', {
        bodies: '',
        struct: true,
      });

      fetch.on('message', (msg, seqno) => {
        console.log(`[IMAP] Fetching message #${seqno}`);

        let rawBuffer = Buffer.from('');

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => {
            rawBuffer = Buffer.concat([rawBuffer, chunk]);
          });
        });

        msg.once('end', async () => {
          // 用 mailparser 把原始邮件解析成更易读的对象
          try {
            const parsed = await simpleParser(rawBuffer);
            const from = parsed.from?.text || '';       // 发件人
            const subject = parsed.subject || '';       // 主题
            const textBody = parsed.text || '';         // 纯文本正文
            const htmlBody = parsed.html || '';     // 富文本正文

            console.log(`[IMAP] Subject: ${subject}, From: ${from}`);
            console.log('[IMAP] Text Body:', textBody);

            // 调用后端接口，把 textBody 传进去
            try {
              await axios.post(`${BACKEND_API_URL}/api/emails/process`, {
                textBody,
                subject,
                from,
                htmlBody
              })
              .then((res) => {
                // log response
                console.log(res.data);
              });
              console.log('[IMAP] Successfully called create-property-by-email API');
            } catch (apiErr) {
              console.error('[IMAP] API Error:', apiErr.response?.data || apiErr.message);
            }
          } catch (parseErr) {
            console.error('[IMAP] mailparser error:', parseErr);
          }
        });
      });

      fetch.once('error', (err) => {
        console.error('[IMAP] Fetch error:', err);
      });

      fetch.once('end', () => {
        console.log('[IMAP] Done fetching new message.');
      });
    });
  });
});

imap.on('end', () => {
  console.log('[IMAP] Connection ended. Will reconnect in 10s...');
  setTimeout(() => {
    console.log('[IMAP] Reconnecting now...');
    imap.connect();
  }, 10000);
});

imap.on('error', (err) => {
  console.error('[IMAP] Connection error:', err);
  console.log('[IMAP] Will reconnect in 10s...');
  setTimeout(() => {
    console.log('[IMAP] Reconnecting now...');
    imap.connect();
  }, 10000);
});


/**
 * 发起连接
 */
imap.connect();
