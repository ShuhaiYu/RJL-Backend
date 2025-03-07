// controllers/EmailSyncController.js
require("dotenv").config();
const Imap = require("node-imap");
const { simpleParser } = require("mailparser");
const dayjs = require("dayjs");

const { createPropertyByEmail } = require("./EmailController");
const emailModel = require("../models/emailModel");
const systemSettingsModel  = require("../models/systemSettingsModel");

/**
 * 同步过去 X 天的邮件
 * GET/POST /emails/sync?days=7
 *
 * 1) 使用 IMAP 搜索过去 X 天的邮件
 * 2) 对每封邮件，先取 X-GM-MSGID 做去重
 * 3) 若没在 DB 里出现过，就调用 createPropertyByEmail 走完整逻辑
 *    （若找不到地址或任务关键字，则 createPropertyByEmail 会直接跳过，不插EMAIL）
 */
async function syncPastEmails(req, res) {
  const days = parseInt(req.query.days, 10) || 7;
  const sinceDate = dayjs().subtract(days, "day").format("MMM DD, YYYY");

  const systemSettings = await systemSettingsModel.getSystemSettings();
  if (!systemSettings) {
    return res.status(500).json({ message: "System settings not found" });
  }

  // 1) 拿到数据库里的 IMAP 配置
  const { imap_host, imap_port, imap_user, imap_password } = systemSettings;

  // 2) 连接 IMAP
  const imap = new Imap({
    user: imap_user,
    password: imap_password,
    host: imap_host,
    port: imap_port,
    tls: true,
    tlsOptions: { servername: imap_host },
  });

  imap.once("ready", () => {
    imap.openBox("INBOX", false, (err) => {
      if (err) {
        console.error("Open inbox error:", err);
        return res.status(500).json({ message: "Failed to open inbox" });
      }

      // 1) 搜索过去 X 天的邮件
      imap.search(["ALL", ["SINCE", sinceDate]], (err, results) => {
        if (err) {
          console.error("Search error:", err);
          return res.status(500).json({ message: "Search error" });
        }
        if (!results || results.length === 0) {
          imap.end();
          return res
            .status(200)
            .json({ message: `No emails found since ${sinceDate}` });
        }

        let processedCount = 0;
        let skippedCount = 0;
        let newCount = 0; // 成功 createPropertyByEmail 的次数

        const f = imap.fetch(results, { bodies: "", struct: true });

        f.on("message", (msg, seqno) => {
          let rawBuffer = Buffer.from("");
          let xGmMsgId = null;

          msg.on("attributes", (attrs) => {
            console.log("ATTRS =>", attrs);
            console.log("x-gm-msgid =>", attrs["x-gm-msgid"]);
            xGmMsgId = attrs["x-gm-msgid"] || null;
          });

          msg.on("body", (stream) => {
            stream.on("data", (chunk) => {
              rawBuffer = Buffer.concat([rawBuffer, chunk]);
            });
          });

          msg.once("end", async () => {
            processedCount++;

            // 2) 如果 xGmMsgId 已在 DB 存在 => skip
            if (!xGmMsgId) {
              console.log(`[#${seqno}] No x-gm-msgid found, skip.`);
              skippedCount++;
              return;
            }
            const already = await emailModel.getEmailByGmailMsgId(xGmMsgId);
            if (already) {
              console.log(
                `[#${seqno}] x-gm-msgid=${xGmMsgId} already in DB, skip.`
              );
              skippedCount++;
              return;
            }

            // 3) 解析正文 => createPropertyByEmail
            try {
              const parsed = await simpleParser(rawBuffer);
              const from = parsed.from?.text || "";
              const subject = parsed.subject || "";
              const textBody = parsed.text || "";
              const htmlBody = parsed.html || "";

              // 构造 mock req/res/next
              const mockReq = {
                body: {
                  subject,
                  from,
                  textBody,
                  htmlBody,
                  gmail_msgid: xGmMsgId, // 传给 createPropertyByEmail
                },
              };
              // 只需一个简单 mockRes 用来看结果
              let wasCreated = false;
              const mockRes = {
                statusCode: 200,
                status: function (code) {
                  this.statusCode = code;
                  return this;
                },
                json: function (data) {
                  // 如果 createPropertyByEmail 成功插入 property/EMAIL
                  // data.createdList 可能有东西
                  if (data.createdList && data.createdList.length > 0) {
                    wasCreated = true;
                  }
                  console.log("createPropertyByEmail =>", data);
                },
              };
              const mockNext = (err) => {
                if (err) {
                  console.error("createPropertyByEmail error:", err);
                }
              };

              await createPropertyByEmail(mockReq, mockRes, mockNext);

              if (wasCreated) {
                newCount++;
              } else {
                // 说明 createPropertyByEmail 中因各种原因跳过了
                // 没有插入 RECORD => skip
                skippedCount++;
              }
            } catch (parseErr) {
              console.error("Mail parse error:", parseErr);
              skippedCount++;
            }
          });
        });

        f.once("error", (err) => {
          console.error("Fetch error:", err);
        });

        f.once("end", () => {
          // fetch结束
          setTimeout(() => {
            imap.end();
            return res.status(200).json({
              message: `Done. Processed=${processedCount}, newCreated=${newCount}, skipped=${skippedCount}`,
              sinceDate,
            });
          }, 2000); // 给2秒等上面的msg.once('end')处理完
        });
      });
    });
  });

  imap.once("error", (err) => {
    console.error("[IMAP] Connection error:", err);
  });

  imap.once("end", () => {
    console.log("[IMAP] Connection ended.");
  });

  imap.connect();
}

module.exports = {
  syncPastEmails,
};
