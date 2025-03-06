// emailListener.js
require('dotenv').config();
const Imap = require('node-imap');
const { simpleParser } = require('mailparser');
const axios = require('axios');
const { createPropertyByEmail } = require('./controllers/EmailController'); 

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
  if (!imap.serverSupports("X-GM-EXT-1")) {
    console.warn("[IMAP] This server does NOT support X-GM-EXT-1. x-gm-msgid won't be available.");
  } else {
    console.log("[IMAP] X-GM-EXT-1 is supported. We should get x-gm-msgid in attrs.");
  }
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

        msg.on("attributes", (attrs) => {
          console.log("ATTRS =>", attrs);
          console.log("x-gm-msgid =>", attrs["x-gm-msgid"]);
        });

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => {
            rawBuffer = Buffer.concat([rawBuffer, chunk]);
          });
        });

        msg.once('end', async () => {
          try {
            // 1) 解析邮件
            const parsed = await simpleParser(rawBuffer);
            const from = parsed.from?.text || '';
            const subject = parsed.subject || '';
            const textBody = parsed.text || '';
            const htmlBody = parsed.html || '';

            console.log(`[IMAP] Subject: ${subject}, From: ${from}`);
            console.log('[IMAP] Text Body:', textBody);

            // 2) 直接调用 Controller，而不是 axios.post
            //    需要手动“伪造” req, res, next
            const mockReq = {
              body: {
                subject,
                from,
                textBody,
                htmlBody
              }
            };

            // 简单版的 res，至少需要 status() 和 json()
            const mockRes = {
              statusCode: 200,
              status: function(code) {
                this.statusCode = code;
                return this; // 链式调用
              },
              json: function(data) {
                console.log('[IMAP] createPropertyByEmail result:', data);
                // 你还可以在这里把 data 存到变量，或者做别的事情
              }
            };

            // next 用于捕获 controller 抛出的错误
            const mockNext = (err) => {
              if (err) {
                console.error('[IMAP] Controller error:', err);
              }
            };

            // 3) 调用 Controller
            await createPropertyByEmail(mockReq, mockRes, mockNext);

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
