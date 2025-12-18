/**
 * Email Listener Job
 *
 * IMAP email listener that monitors inbox for new emails
 * and processes them to create properties/tasks.
 */

const Imap = require('node-imap');
const { simpleParser } = require('mailparser');
const systemSettingsRepository = require('../repositories/systemSettingsRepository');
const emailService = require('../services/emailService');
const logger = require('../lib/logger');

let imapConnection = null;

/**
 * Start IMAP listener
 */
async function startImapListener() {
  // Get IMAP settings from database
  const imapSettings = await systemSettingsRepository.getImapSettings();
  if (!imapSettings || !imapSettings.host || !imapSettings.user) {
    throw new Error('No IMAP settings found. Cannot start email listener.');
  }

  const { host, port, user, password } = imapSettings;

  // Create IMAP instance
  const imap = new Imap({
    user,
    password,
    host,
    port: port || 993,
    tls: true,
    tlsOptions: {
      servername: host,
    },
    keepalive: {
      idleInterval: 60000,
      idleBreak: true,
    },
  });

  imapConnection = imap;

  function openInbox(cb) {
    imap.openBox('INBOX', false, cb);
  }

  // Handle connection ready
  imap.once('ready', () => {
    logger.info('[IMAP] Ready, opening INBOX...');

    // Check X-GM-EXT-1 support (Gmail specific)
    if (!imap.serverSupports('X-GM-EXT-1')) {
      logger.warn('[IMAP] Server does NOT support X-GM-EXT-1. x-gm-msgid not available.');
    } else {
      logger.info('[IMAP] X-GM-EXT-1 is supported.');
    }

    openInbox((err, box) => {
      if (err) {
        logger.error('[IMAP] Error opening INBOX', { error: err.message });
        return;
      }

      logger.info(`[IMAP] INBOX opened, total messages: ${box.messages.total}`);

      // Listen for new emails
      imap.on('mail', (numNewMsgs) => {
        logger.info(`[IMAP] New mail arrived. Count: ${numNewMsgs}`);

        // Fetch the newest messages
        const fetch = imap.seq.fetch(box.messages.total + ':*', {
          bodies: '',
          struct: true,
        });

        fetch.on('message', (msg, seqno) => {
          logger.info(`[IMAP] Fetching message #${seqno}`);
          let rawBuffer = Buffer.from('');
          let gmailMsgId = null;

          msg.on('attributes', (attrs) => {
            gmailMsgId = attrs['x-gm-msgid'];
            logger.debug('[IMAP] Message attributes', { gmailMsgId });
          });

          msg.on('body', (stream) => {
            stream.on('data', (chunk) => {
              rawBuffer = Buffer.concat([rawBuffer, chunk]);
            });
          });

          msg.once('end', async () => {
            try {
              // Parse email
              const parsed = await simpleParser(rawBuffer);
              const from = parsed.from?.text || '';
              const subject = parsed.subject || '';
              const textBody = parsed.text || '';
              const htmlBody = parsed.html || '';

              logger.info(`[IMAP] Processing email: Subject="${subject}", From="${from}"`);

              // Process email through service
              // Note: Using a system context since IMAP doesn't have a user session
              const systemUser = {
                id: 0,
                role: 'system',
                agency_id: null,
              };

              const result = await emailService.processEmail(
                {
                  subject,
                  sender: from,
                  textBody,
                  html: htmlBody,
                  gmail_msgid: gmailMsgId?.toString(),
                },
                systemUser
              );

              if (result.duplicate) {
                logger.info(`[IMAP] Email already processed (duplicate)`);
              } else {
                logger.info('[IMAP] Email processed successfully', {
                  emailId: result.email?.id,
                  propertyId: result.property?.id,
                  taskId: result.task?.id,
                });
              }
            } catch (parseErr) {
              logger.error('[IMAP] Error processing email', { error: parseErr.message });
            }
          });
        });

        fetch.once('error', (err) => {
          logger.error('[IMAP] Fetch error', { error: err.message });
        });

        fetch.once('end', () => {
          logger.debug('[IMAP] Done fetching new messages');
        });
      });
    });
  });

  // Handle connection end
  imap.on('end', () => {
    logger.warn('[IMAP] Connection ended. Will reconnect in 10s...');
    setTimeout(() => {
      logger.info('[IMAP] Reconnecting...');
      imap.connect();
    }, 10000);
  });

  // Handle connection error
  imap.on('error', (err) => {
    logger.error('[IMAP] Connection error', { error: err.message });
    logger.info('[IMAP] Will reconnect in 10s...');
    setTimeout(() => {
      logger.info('[IMAP] Reconnecting...');
      imap.connect();
    }, 10000);
  });

  // Connect
  imap.connect();
}

/**
 * Stop IMAP listener
 */
function stopImapListener() {
  if (imapConnection) {
    imapConnection.end();
    imapConnection = null;
    logger.info('[IMAP] Connection closed');
  }
}

module.exports = {
  startImapListener,
  stopImapListener,
};
