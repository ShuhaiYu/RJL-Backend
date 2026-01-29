/**
 * Gemini AI Service
 *
 * Uses Google Gemini to extract structured information from emails.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../lib/logger');

// Initialize Gemini client
let genAI = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

const geminiService = {
  /**
   * Extract tenant information from email using AI
   * @param {string} subject - Email subject
   * @param {string} body - Email body text
   * @returns {Promise<Object>} Extracted information
   */
  async extractEmailInfo(subject, body) {
    try {
      const model = getGenAI().getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `You are an AI assistant that extracts structured information from property management emails in Australia.

Analyze the following email and extract information in JSON format.

Email Subject: ${subject || '(No subject)'}

Email Body:
${body || '(Empty body)'}

Extract and return ONLY a valid JSON object with this exact structure (no markdown, no code blocks, just pure JSON):
{
  "address": "Full Australian address if found, or null",
  "contacts": [
    {
      "name": "Contact name or null",
      "phone": "Phone number (Australian format) or null",
      "email": "Email address or null"
    }
  ],
  "task_type": "One of: SMOKE_ALARM, GAS_&_ELECTRICITY, MAINTENANCE, INSPECTION, COMPLAINT, INQUIRY, OTHER",
  "urgency": "One of: LOW, MEDIUM, HIGH, URGENT",
  "summary": "Brief one-line summary of what this email is about"
}

Rules:
1. For Australian addresses, include street number, street name, suburb, state (VIC/NSW/QLD/SA/WA/TAS/NT/ACT), and postcode
2. Phone numbers should be in format: 04XX XXX XXX (mobile) or 0X XXXX XXXX (landline)
3. task_type should be determined by email content:
   - SMOKE_ALARM: mentions smoke alarm, fire alarm, detector
   - GAS_&_ELECTRICITY: mentions gas, electricity, power, energy safety
   - MAINTENANCE: general repairs, fixes, maintenance requests
   - INSPECTION: property inspection, routine inspection
   - COMPLAINT: tenant complaints, issues
   - INQUIRY: questions, general inquiries
   - OTHER: anything else
4. urgency based on tone and keywords:
   - URGENT: emergency, urgent, ASAP, immediate
   - HIGH: important, priority, soon
   - MEDIUM: standard requests
   - LOW: informational, no rush
5. If no contacts found, return empty array []
6. Return ONLY the JSON object, no other text`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse JSON from response (handle potential markdown code blocks)
      let jsonStr = text.trim();

      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      const extracted = JSON.parse(jsonStr);

      logger.info('[Gemini] Successfully extracted email info', {
        hasAddress: !!extracted.address,
        contactCount: extracted.contacts?.length || 0,
        taskType: extracted.task_type,
        urgency: extracted.urgency,
      });

      return {
        address: extracted.address || null,
        contacts: Array.isArray(extracted.contacts) ? extracted.contacts : [],
        taskType: extracted.task_type || 'OTHER',
        urgency: extracted.urgency || 'MEDIUM',
        summary: extracted.summary || subject || 'New email task',
      };
    } catch (error) {
      logger.error('[Gemini] Failed to extract email info', {
        error: error.message,
        subject,
      });

      // Return default structure on error
      return {
        address: null,
        contacts: [],
        taskType: 'OTHER',
        urgency: 'MEDIUM',
        summary: subject || 'New email task',
      };
    }
  },

  /**
   * Check if Gemini service is available
   * @returns {boolean}
   */
  isAvailable() {
    return !!process.env.GEMINI_API_KEY;
  },
};

module.exports = geminiService;
