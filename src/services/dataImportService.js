/**
 * Data Import Service
 *
 * Business logic for CSV data import.
 */

const csvParser = require('csv-parser');
const { Readable } = require('stream');
const prisma = require('../config/prisma');
const logger = require('../lib/logger');
const { AppError } = require('../lib/errors');

/**
 * Check if job type indicates a "Safety Check" which requires both Gas and Alarm tasks
 * @param {string} jobType - Job type from CSV
 * @param {string} description - Description from CSV
 * @returns {boolean} True if this is a safety check requiring both task types
 */
function isSafetyCheck(jobType, description) {
  const combined = `${jobType || ''} ${description || ''}`.toLowerCase();
  return combined.includes('safety check');
}

/**
 * Map Job Type from CSV to task type
 * Standardizes various CSV job type formats to system constants
 */
function mapJobType(jobType) {
  if (!jobType) return 'SMOKE_ALARM';
  const lower = jobType.toLowerCase();

  // Gas & Electricity: gas, electric, electricity, power, etc.
  if (lower.includes('gas') || lower.includes('electric') || lower.includes('power')) {
    return 'GAS_&_ELECTRICITY';
  }

  // Default Smoke Alarm: smoke, alarm, safety check, etc.
  return 'SMOKE_ALARM';
}

/**
 * Map region string from CSV to standardized region
 */
function mapRegion(regionStr) {
  if (!regionStr) return null;
  const upper = regionStr.toUpperCase().trim();

  if (upper.includes('EAST')) return 'EAST';
  if (upper.includes('WEST')) return 'WEST';
  if (upper.includes('NORTH')) return 'NORTH';
  if (upper.includes('SOUTH')) return 'SOUTH';
  if (upper.includes('CENTRAL')) return 'CENTRAL';

  return null;
}

/**
 * Parse date from DD/MM/YYYY format
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try DD/MM/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    const year = parseInt(parts[2], 10);

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }

  // Try ISO format as fallback
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  return null;
}

/**
 * Parse CSV buffer into array of rows
 */
function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer);

    stream
      .pipe(csvParser())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', (err) => reject(err));
  });
}

/**
 * Import CSV data
 * @param {Buffer} csvBuffer - CSV file buffer
 * @param {Object} user - Authenticated user
 * @returns {Object} Import results
 */
async function importCsv(csvBuffer, user) {
  const results = {
    created: 0,
    skipped: 0,
    errors: [],
  };

  // Parse CSV
  let rows;
  try {
    rows = await parseCsvBuffer(csvBuffer);
  } catch (error) {
    logger.error('CSV parsing error', { error: error.message });
    throw new AppError('Failed to parse CSV file', 400);
  }

  if (rows.length === 0) {
    throw new AppError('CSV file is empty', 400);
  }

  logger.info(`Parsed ${rows.length} rows from CSV`);

  // Phase 1: Validate all agencies exist
  const agencyNames = [...new Set(rows.map(row => row['Customer']).filter(Boolean))];

  const agencies = await prisma.agency.findMany({
    where: {
      agencyName: { in: agencyNames, mode: 'insensitive' },
      isActive: true,
    },
  });

  // Create lookup map (case-insensitive)
  const agencyMap = new Map();
  agencies.forEach(agency => {
    agencyMap.set(agency.agencyName.toLowerCase(), agency);
  });

  // Check for missing agencies
  const missingAgencies = agencyNames.filter(name => !agencyMap.has(name.toLowerCase()));
  if (missingAgencies.length > 0) {
    throw new AppError(
      `Import cancelled: The following agencies do not exist: ${missingAgencies.join(', ')}`,
      400
    );
  }

  // Phase 2: Process each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // Account for header row and 0-indexing

    try {
      const jobNumber = row['Job Number'];
      const customerName = row['Customer'];
      const address = row['Job Address'];
      const reference = row['Reference']; // Due date in DD/MM/YYYY
      const jobType = row['Job Type'];
      const description = row['Description'];
      const contactName = row['Job Contact'];
      const contactPhone = row['Job Contact Phone'];
      const contactMobile = row['Job Contact Mobile'];
      const region = row['Job Region'];

      // Debug: log all keys from CSV row
      if (i === 0) {
        logger.info(`CSV row keys: ${JSON.stringify(Object.keys(row))}`);
        logger.info(`CSV row values: ${JSON.stringify(row)}`);
      }

      // Skip if no job number
      if (!jobNumber) {
        results.errors.push(`Row ${rowNum}: Missing Job Number (skipped)`);
        results.skipped++;
        continue;
      }

      // Skip if no customer/agency
      if (!customerName) {
        results.errors.push(`Row ${rowNum}: Missing Customer (skipped)`);
        results.skipped++;
        continue;
      }

      // Skip if no address
      if (!address) {
        results.errors.push(`Row ${rowNum}: Missing Job Address (skipped)`);
        results.skipped++;
        continue;
      }

      // Get agency
      const agency = agencyMap.get(customerName.toLowerCase());
      if (!agency) {
        results.errors.push(`Row ${rowNum}: Agency "${customerName}" not found (skipped)`);
        results.skipped++;
        continue;
      }

      // Check for duplicate task (job number already imported)
      const taskNamePattern = `[${jobNumber}]`;
      const existingTask = await prisma.task.findFirst({
        where: {
          taskName: { contains: taskNamePattern },
          isActive: true,
        },
      });

      if (existingTask) {
        results.errors.push(`Row ${rowNum}: Job Number ${jobNumber} already imported (skipped)`);
        results.skipped++;
        continue;
      }

      // Find a user in the agency (prioritize agencyAdmin)
      const agencyUsers = await prisma.user.findMany({
        where: {
          agencyId: agency.id,
          isActive: true,
        },
        orderBy: { role: 'asc' },
      });

      // Sort to prioritize agencyAdmin
      agencyUsers.sort((a, b) => {
        const priority = { agencyAdmin: 1, agencyUser: 2, admin: 3, superuser: 4 };
        return (priority[a.role] || 99) - (priority[b.role] || 99);
      });

      if (agencyUsers.length === 0) {
        results.errors.push(`Row ${rowNum}: No active users in agency "${customerName}" (skipped)`);
        results.skipped++;
        continue;
      }

      const assignedUser = agencyUsers[0];

      // Find or create property
      let property = await prisma.property.findFirst({
        where: {
          address: address,
          userId: assignedUser.id,
          isActive: true,
        },
      });

      if (!property) {
        const mappedRegion = mapRegion(region);
        logger.info(`Creating property with region - raw: "${region}", mapped: "${mappedRegion}"`);
        property = await prisma.property.create({
          data: {
            address: address,
            userId: assignedUser.id,
            region: mappedRegion,
          },
        });
        logger.debug(`Created property: ${address}`);
      }

      // Create contact if contact name exists
      if (contactName && contactName.trim()) {
        const phone = contactMobile || contactPhone || null;

        // Check if contact already exists for this property
        const existingContact = await prisma.contact.findFirst({
          where: {
            propertyId: property.id,
            name: contactName.trim(),
            isActive: true,
          },
        });

        if (!existingContact) {
          await prisma.contact.create({
            data: {
              name: contactName.trim(),
              phone: phone,
              propertyId: property.id,
            },
          });
          logger.debug(`Created contact: ${contactName}`);
        }
      }

      // Parse due date
      const dueDate = parseDate(reference);

      // Check if this is a "Safety Check" which requires both Gas and Alarm tasks
      if (isSafetyCheck(jobType, description)) {
        // Create SMOKE_ALARM task
        await prisma.task.create({
          data: {
            propertyId: property.id,
            agencyId: agency.id,
            taskName: `[${jobNumber}] ${jobType || 'Safety Check'} - Smoke Alarm`,
            taskDescription: description || null,
            dueDate: dueDate,
            type: 'SMOKE_ALARM',
            status: 'unknown',
            repeatFrequency: 'none',
          },
        });

        // Create GAS_&_ELECTRICITY task
        await prisma.task.create({
          data: {
            propertyId: property.id,
            agencyId: agency.id,
            taskName: `[${jobNumber}] ${jobType || 'Safety Check'} - Gas & Electricity`,
            taskDescription: description || null,
            dueDate: dueDate,
            type: 'GAS_&_ELECTRICITY',
            status: 'unknown',
            repeatFrequency: 'none',
          },
        });

        results.created += 2;
        logger.debug(`Created dual tasks for Safety Check: [${jobNumber}]`);
      } else {
        // Create single task based on description/job type
        await prisma.task.create({
          data: {
            propertyId: property.id,
            agencyId: agency.id,
            taskName: `[${jobNumber}] ${jobType || 'Safety Check'}`,
            taskDescription: description || null,
            dueDate: dueDate,
            type: mapJobType(description),
            status: 'unknown',
            repeatFrequency: 'none',
          },
        });

        results.created++;
        logger.debug(`Created task: [${jobNumber}]`);
      }

    } catch (error) {
      logger.error(`Error processing row ${rowNum}`, { error: error.message });
      results.errors.push(`Row ${rowNum}: ${error.message}`);
      results.skipped++;
    }
  }

  logger.info('Import completed', {
    created: results.created,
    skipped: results.skipped,
    errorCount: results.errors.length,
  });

  return results;
}

module.exports = {
  importCsv,
};
