// emailListener.js
const Imap = require("node-imap");
const { simpleParser } = require("mailparser");
const { createPropertyByEmail } = require("./controllers/EmailController");
const systemSettingsModel = require("./models/systemSettingsModel"); // <-- 新增

// 一个函数，用来启动 IMAP 监听
async function startImapListener() {
  // 1) 从数据库读取系统设置
  const settings = await systemSettingsModel.getSystemSettings();
  if (!settings) {
    throw new Error("No system settings found. Cannot start IMAP listener.");
  }

  // 2) 从 settings 中取出 IMAP 配置
  const { imap_host, imap_port, imap_user, imap_password } = settings;

  // 3) 创建 IMAP 实例
  const imap = new Imap({
    user: imap_user,
    password: imap_password,
    host: imap_host,
    port: imap_port,
    tls: true,
    tlsOptions: {
      servername: imap_host,
    },
    keepalive: {
      idleInterval: 60000,
      idleBreak: true,
    },
  });

  function openInbox(cb) {
    imap.openBox("INBOX", false, cb);
  }

  // 监听 ready
  imap.once("ready", () => {
    console.log("[IMAP] Ready, opening INBOX...");

    // Check X-GM-EXT-1 support
    if (!imap.serverSupports("X-GM-EXT-1")) {
      console.warn("[IMAP] This server does NOT support X-GM-EXT-1. x-gm-msgid won't be available.");
    } else {
      console.log("[IMAP] X-GM-EXT-1 is supported. We should get x-gm-msgid in attrs.");
    }

    openInbox((err, box) => {
      if (err) throw err;

      console.log(`[IMAP] INBOX opened, total messages: ${box.messages.total}`);

      // ---- 监听新邮件的事件 ----
      imap.on("mail", (numNewMsgs) => {
        console.log(`[IMAP] New mail arrived. New count: ${numNewMsgs}`);
        // 每当有新邮件时，去搜寻一下“最近的新邮件”
        const fetch = imap.seq.fetch(box.messages.total + ":*", {
          bodies: "",
          struct: true,
        });

        fetch.on("message", (msg, seqno) => {
          console.log(`[IMAP] Fetching message #${seqno}`);
          let rawBuffer = Buffer.from("");

          msg.on("attributes", (attrs) => {
            console.log("ATTRS =>", attrs);
            console.log("x-gm-msgid =>", attrs["x-gm-msgid"]);
          });

          msg.on("body", (stream) => {
            stream.on("data", (chunk) => {
              rawBuffer = Buffer.concat([rawBuffer, chunk]);
            });
          });

          msg.once("end", async () => {
            try {
              // 解析邮件
              const parsed = await simpleParser(rawBuffer);
              const from = parsed.from?.text || "";
              const subject = parsed.subject || "";
              const textBody = parsed.text || "";
              const htmlBody = parsed.html || "";

              console.log(`[IMAP] Subject: ${subject}, From: ${from}`);
              console.log("[IMAP] Text Body:", textBody);

              // 伪造 req, res, next
              const mockReq = {
                body: {
                  subject,
                  from,
                  textBody,
                  htmlBody,
                  // 如果你有 xGmMsgId, 也可以一并塞进来
                  // gmail_msgid: ...
                },
              };
              const mockRes = {
                statusCode: 200,
                status(code) {
                  this.statusCode = code;
                  return this;
                },
                json(data) {
                  console.log("[IMAP] createPropertyByEmail result:", data);
                },
              };
              const mockNext = (err) => {
                if (err) {
                  console.error("[IMAP] Controller error:", err);
                }
              };

              await createPropertyByEmail(mockReq, mockRes, mockNext);
            } catch (parseErr) {
              console.error("[IMAP] mailparser error:", parseErr);
            }
          });
        });

        fetch.once("error", (err) => {
          console.error("[IMAP] Fetch error:", err);
        });

        fetch.once("end", () => {
          console.log("[IMAP] Done fetching new message.");
        });
      });
    });
  });

  imap.on("end", () => {
    console.log("[IMAP] Connection ended. Will reconnect in 10s...");
    setTimeout(() => {
      console.log("[IMAP] Reconnecting now...");
      imap.connect();
    }, 10000);
  });

  imap.on("error", (err) => {
    console.error("[IMAP] Connection error:", err);
    console.log("[IMAP] Will reconnect in 10s...");
    setTimeout(() => {
      console.log("[IMAP] Reconnecting now...");
      imap.connect();
    }, 10000);
  });

  // 4) 最后连接
  imap.connect();
}

// 直接调用该函数
startImapListener().catch((err) => {
  console.error("[IMAP] Failed to start IMAP listener:", err);
});
